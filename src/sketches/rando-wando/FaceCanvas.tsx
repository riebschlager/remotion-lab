import React, {useLayoutEffect, useRef} from 'react';
import type {FacePixels} from './textures';

/**
 * Draws the whole street, sky included, in one WebGL canvas.
 *
 * As DOM elements the cube faces cost the browser several composited layers
 * each, which exhausted GPU memory in Studio. Here every quad (road, markings,
 * slabs, cube faces) is drawn from its four corners, which the sketch supplies
 * already projected to clip space by an ordinary perspective camera.
 *
 * Fisheye: each quad is drawn as a grid of small cells, and the vertex shader
 * moves every grid point through the lens, so straight edges bend. The lens
 * is centred on the frame: a point the flat camera puts at radius s (in
 * half-diagonals) is drawn at atan(c·s)/c. The centre keeps its scale; the
 * edges gather a wider field, up to tan(c)/c half-diagonals at the corners.
 * The camera roll, about the vanishing point, is applied before the lens. The
 * sky runs the inverse mapping per pixel, so the horizon curves with the rest.
 *
 * Paint order inside a quad, bottom to top: `ground`, the premultiplied
 * texture, the border, `shade`, then fog. Fog is computed per pixel from the
 * distance ahead of the eye. Colours are mixed as sRGB values, as CSS does.
 */
export type Rgb = [number, number, number];
/** Haze over a quad: `floor + (1 - floor) * max * smoothstep(start, end, distance)`, distance in cube sizes. */
export type Fog = {floor: number; start: number; end: number; max: number};
export type Face = {
  /** Clip-space x, y, z, w of the top-left, top-right, bottom-left and bottom-right corners. */
  corners: number[];
  ground: Rgb;
  /** Premultiplied RGBA at `textureSize`; leave out for a flat face or while textures load. */
  pixels?: FacePixels;
  /** Opacity of the `shadeColor` wash. */
  shade: number;
  fog: Fog;
  /** Opacity of the whole quad. */
  opacity: number;
  /** Border width as a fraction of the quad; 0 or omitted for none. */
  border?: number;
  /** Large quads (the road) need a finer grid to bend smoothly. */
  fine?: boolean;
};
export type Sky = {
  /** Four colours from the top of the sky down to the horizon. */
  stops: Rgb[];
  /** Frame y, in pixels, of each stop; the last is the horizon. */
  at: number[];
  /** Ground colour below the horizon, where the road ends. */
  below: Rgb;
  /**
   * Stars fixed to directions in the world, so they stay put as the camera looks around.
   * Each twinkles a whole number of times per loop, at `phase` (0..1 through the loop).
   */
  stars: {amount: number; size: number; phase: number; beats: number; seed: number; colors: [Rgb, Rgb]};
  /**
   * A distant skyline standing on the horizon, two silhouettes deep, read by direction like the
   * stars. `height` is the tallest block in radians of elevation (0 leaves it out). `colors` are
   * the far and near rows; `lights` the faint windows of the near row; `mist` the colour at its feet.
   */
  skyline: {height: number; colors: [Rgb, Rgb]; lights: Rgb; mist: Rgb};
};

/** `#rrggbb` as 0..1 channels. */
export const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as Rgb;

/** Lens constant for a fisheye strength of 0..1. Kept below π/2 so the corners stay finite. */
export const lensCurve = (fisheye: number) => 1.3 * fisheye;
/** How far out, in half-diagonals of the flat view, the lensed frame reaches at its corners. */
export const lensReach = (fisheye: number) => {
  const c = lensCurve(fisheye);
  return c > 1e-4 ? Math.tan(c) / c : 1;
};

const sceneVertex = `#version 300 es
in vec2 grid;
out vec2 uv;
out float dist;
uniform mat4 corners;
uniform float distScale, curve, roll;
uniform vec2 frame, pivot;
void main() {
  vec4 p = mix(mix(corners[0], corners[1], grid.x), mix(corners[2], corners[3], grid.x), grid.y);
  uv = grid;
  dist = p.w * distScale;
  // A point at or behind the eye (looking around brings near cubes into play) is pushed far out
  // on its own side; its depth puts it beyond the near plane, so the GPU clips it away.
  float w = max(p.w, 1e-4);
  vec2 px = vec2(p.x / w + 1.0, 1.0 - p.y / w) * 0.5 * frame;
  vec2 d = px - pivot;
  px = pivot + vec2(d.x * cos(roll) - d.y * sin(roll), d.x * sin(roll) + d.y * cos(roll));
  vec2 c = frame * 0.5;
  float R = length(c);
  vec2 q = (px - c) / R;
  float s = length(q);
  if (curve > 0.0 && s > 0.0) q *= atan(curve * s) / (curve * s);
  px = c + q * R;
  gl_Position = vec4((px.x / frame.x * 2.0 - 1.0) * w, (1.0 - px.y / frame.y * 2.0) * w, p.z, w);
}`;

const sceneFragment = `#version 300 es
precision highp float;
in vec2 uv;
in float dist;
out vec4 color;
uniform sampler2D picture;
uniform bool textured;
uniform vec3 ground, shadeColor, fogColor, borderColor;
uniform float shade, opacity, border;
uniform vec4 fog;
void main() {
  vec3 c = ground;
  if (textured) {
    vec4 t = texture(picture, uv);
    c = c * (1.0 - t.a) + t.rgb;
  }
  if (border > 0.0) {
    // Border of constant width just inside the edge, antialiased where it meets the picture.
    float inside = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float soft = fwidth(inside);
    c = mix(borderColor, c, smoothstep(border - soft, border + soft, inside));
  }
  float haze = fog.x + (1.0 - fog.x) * fog.w * smoothstep(fog.y, fog.z, dist);
  c = mix(mix(c, shadeColor, shade), fogColor, haze);
  color = vec4(c * opacity, opacity);
}`;

const skyVertex = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const skyFragment = `#version 300 es
precision highp float;
out vec4 color;
uniform vec2 frame, pivot;
uniform float curve, roll, yaw, pitch, focal;
uniform vec3 skyStops[4], below;
uniform float skyAt[4];
uniform float starAmount, starSize, starPhase, starBeats, seed, skylineHeight;
uniform vec3 starColors[2], skylineColors[2], skylineLights, skylineMist;
const float TAU = 6.2831853;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx + seed) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Cells of about size radians right round the horizon, so the pattern meets itself behind the eye.
float around(float size) { return floor(TAU / size); }

// Height of one skyline row, in radians, at azimuth az.
float rowHeight(float az, float row, float size, float tallest) {
  float n = around(size);
  float u = (az / TAU + 0.5) * n;
  float i = mod(floor(u), n);
  float f = fract(u);
  float r = hash(vec2(i, row));
  float h = tallest * (0.22 + 0.78 * r * r);
  // Some blocks are slimmer towers with a low annex either side.
  float inset = 0.12 + 0.22 * hash(vec2(i, row + 3.0));
  if (hash(vec2(i, row + 7.0)) < 0.4 && (f < inset || f > 1.0 - inset)) h *= 0.4;
  // A few carry a mast.
  if (hash(vec2(i, row + 11.0)) < 0.2 && abs(f - 0.5) < 0.035) h += tallest * 0.3;
  return h;
}

// Coverage of one skyline row at this pixel: four samples across it horizontally.
float rowCover(float az, float el, vec2 foot, float row, float size, float tallest) {
  float cover = 0.0;
  for (int k = 0; k < 4; k++) {
    float h = rowHeight(az + (float(k) - 1.5) * 0.25 * foot.x, row, size, tallest);
    cover += clamp((h - el) / foot.y + 0.5, 0.0, 1.0);
  }
  return cover * 0.25;
}

vec3 stars(float az, float el, vec2 foot) {
  float size = 0.05;
  float n = around(size);
  vec2 cell = vec2(TAU / n, size);
  vec2 g = vec2(az + 0.5 * TAU, el) / cell;
  vec2 id = vec2(mod(floor(g.x), n), floor(g.y));
  if (hash(id + 17.0) > starAmount) return vec3(0.0);
  vec2 at = 0.15 + 0.7 * vec2(hash(id + 1.0), hash(id + 2.0));
  vec2 d = (fract(g) - at) * cell / foot;          // in pixels
  float big = hash(id + 5.0);
  float radius = starSize * (0.45 + 0.9 * big * big);
  float light = exp(-dot(d, d) / (radius * radius));
  // The brightest few get a faint cross.
  if (big > 0.85) {
    float arm = 4.0 * radius;
    light += 0.35 * (exp(-abs(d.x) / arm) * exp(-d.y * d.y / (0.2 * radius * radius))
      + exp(-abs(d.y) / arm) * exp(-d.x * d.x / (0.2 * radius * radius)));
  }
  // Twinkle once every 2, 4 or 8 beats, as a whole number of times per loop.
  float period = exp2(1.0 + floor(hash(id + 9.0) * 3.0));
  float cycles = max(1.0, floor(starBeats / period + 0.5));
  float wave = 0.5 + 0.5 * cos(TAU * (starPhase * cycles + hash(id + 13.0)));
  float twinkle = mix(0.15, 1.0, wave * wave * wave);
  // Most are cool white; one in five is warm.
  return starColors[hash(id + 21.0) < 0.2 ? 1 : 0] * light * twinkle * (0.55 + 0.45 * big);
}

void main() {
  // Undo the lens, then the roll, to find where this pixel looks in the flat view.
  vec2 c = frame * 0.5;
  float R = length(c);
  vec2 q = (vec2(gl_FragCoord.x, frame.y - gl_FragCoord.y) - c) / R;
  float r = length(q);
  if (curve > 0.0 && r > 0.0) q *= tan(curve * r) / (curve * r);
  vec2 d = c + q * R - pivot;
  d = vec2(d.x * cos(roll) + d.y * sin(roll), -d.x * sin(roll) + d.y * cos(roll));
  // Then undo the pitch and yaw, and read the sky by the ray's elevation: the y at which an
  // unturned camera would see that elevation, so the gradient stays level as the camera looks.
  vec3 ray = vec3(d, -focal);
  ray = vec3(ray.x, ray.y * cos(pitch) + ray.z * sin(pitch), -ray.y * sin(pitch) + ray.z * cos(pitch));
  ray = vec3(ray.x * cos(yaw) - ray.z * sin(yaw), ray.y, ray.x * sin(yaw) + ray.z * cos(yaw));
  float y = pivot.y + focal * ray.y / length(ray.xz);
  vec3 sky = skyStops[3];
  if (y >= skyAt[3]) sky = below;
  else if (y <= skyAt[0]) sky = skyStops[0];
  else if (y < skyAt[1]) sky = mix(skyStops[0], skyStops[1], (y - skyAt[0]) / (skyAt[1] - skyAt[0]));
  else if (y < skyAt[2]) sky = mix(skyStops[1], skyStops[2], (y - skyAt[1]) / (skyAt[2] - skyAt[1]));
  else sky = mix(skyStops[2], skyStops[3], (y - skyAt[2]) / (skyAt[3] - skyAt[2]));

  // Direction of the ray: azimuth round the horizon and elevation above it, in radians, with the
  // size of this pixel in each (fwidth is huge only where azimuth wraps, behind the eye).
  float az = atan(ray.x, -ray.z);
  float el = atan(-ray.y, length(ray.xz));
  vec2 foot = max(vec2(min(fwidth(az), 0.02), fwidth(el)), vec2(1e-5));
  if (el > 0.0) sky += stars(az, el, foot) * smoothstep(0.1, 0.32, el);
  // The city stands a little below the horizon too, in the haze where the road gives out, so its
  // feet dissolve into the mist instead of standing on one straight line.
  if (el > -0.08) {
    if (skylineHeight > 0.0) {
      float far = rowCover(az, el, foot, 40.0, 0.032, skylineHeight);
      float near = rowCover(az + 0.013, el, foot, 50.0, 0.047, 0.62 * skylineHeight);
      vec3 front = skylineColors[1];
      // Sparse faint windows on the near row.
      vec2 cell = floor(vec2(az, el) / 0.0065);
      float lit = step(hash(cell + 61.0), 0.09) * step(el, 0.55 * skylineHeight);
      vec2 pane = fract(vec2(az, el) / 0.0065);
      lit *= step(0.3, pane.x) * step(pane.x, 0.7) * step(0.3, pane.y) * step(pane.y, 0.7);
      front = mix(front, skylineLights, 0.45 * lit);
      vec3 city = mix(mix(sky, skylineColors[0], far), front, near);
      // Mist at its feet: toward the horizon glow, then below the horizon gone into the haze.
      float mist = 0.55 * (1.0 - smoothstep(0.0, 0.5 * skylineHeight, el));
      city = mix(city, mix(city, skylineMist, mist), max(far, near));
      sky = mix(sky, city, smoothstep(-0.07, 0.005, el));
    }
  }
  color = vec4(sky, 1.0);
}`;

// Grid cells per side: cube faces are small, the road and its markings run the length of the street.
const COARSE = 6;
const FINE = 48;
// Textures in use are re-uploaded from memory as needed, so the GPU holds a
// bounded number however many frames the clips have.
const MAX_TEXTURES = 160;
const sceneUniforms = ['corners', 'distScale', 'curve', 'roll', 'frame', 'pivot', 'picture', 'textured',
  'ground', 'shadeColor', 'fogColor', 'borderColor', 'shade', 'opacity', 'border', 'fog'] as const;
const skyUniforms = ['frame', 'pivot', 'curve', 'roll', 'yaw', 'pitch', 'focal', 'skyStops', 'below', 'skyAt',
  'starAmount', 'starSize', 'starPhase', 'starBeats', 'seed', 'starColors',
  'skylineHeight', 'skylineColors', 'skylineLights', 'skylineMist'] as const;

type Renderer = {
  gl: WebGL2RenderingContext;
  scene: {program: WebGLProgram; vao: WebGLVertexArrayObject;
    uniforms: Record<(typeof sceneUniforms)[number], WebGLUniformLocation | null>};
  sky: {program: WebGLProgram; vao: WebGLVertexArrayObject;
    uniforms: Record<(typeof skyUniforms)[number], WebGLUniformLocation | null>};
  textures: Map<FacePixels, WebGLTexture>;
};

/** Two triangles per cell of an n × n grid over the unit square. */
const gridVertices = (n: number) => {
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [u0, u1, v0, v1] = [i / n, (i + 1) / n, j / n, (j + 1) / n];
      out.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
    }
  }
  return out;
};

const createRenderer = (canvas: HTMLCanvasElement): Renderer => {
  // The drawing buffer is kept so a screenshot taken after the draw always sees it.
  const gl = canvas.getContext('webgl2', {alpha: true, antialias: true, depth: true, premultipliedAlpha: true,
    preserveDrawingBuffer: true});
  if (!gl) {
    throw new Error('Rando Wando needs WebGL 2 to draw its street, and this browser did not provide it. '
      + 'In Studio, check that hardware acceleration is on; for renders, pass --gl=angle.');
  }
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Street shader: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const link = (vertex: string, fragment: string) => {
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(program, 0, 'grid');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Street shader: ${gl.getProgramInfoLog(program)}`);
    return program;
  };
  const locate = <N extends string>(program: WebGLProgram, names: readonly N[]) =>
    Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<N, WebGLUniformLocation | null>;

  const sceneProgram = link(sceneVertex, sceneFragment);
  const sceneVao = gl.createVertexArray()!;
  gl.bindVertexArray(sceneVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...gridVertices(COARSE), ...gridVertices(FINE)]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const skyProgram = link(skyVertex, skyFragment);
  const skyVao = gl.createVertexArray()!;
  gl.bindVertexArray(null);

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.useProgram(sceneProgram);
  gl.uniform1i(gl.getUniformLocation(sceneProgram, 'picture'), 0);
  return {
    gl,
    scene: {program: sceneProgram, vao: sceneVao, uniforms: locate(sceneProgram, sceneUniforms)},
    sky: {program: skyProgram, vao: skyVao, uniforms: locate(skyProgram, skyUniforms)},
    textures: new Map(),
  };
};

/** Bind the texture for `pixels`, uploading it first if the GPU does not have it. */
const bindPicture = ({gl, textures}: Renderer, pixels: FacePixels, size: number) => {
  let texture = textures.get(pixels);
  if (texture) {
    textures.delete(pixels);   // re-inserted below: the map stays ordered by last use
    gl.bindTexture(gl.TEXTURE_2D, texture);
  } else {
    texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  textures.set(pixels, texture);
};

type DrawInput = {
  width: number;
  height: number;
  /** Drawn first, in order, without depth: they never stand in front of a cube. */
  backdrop: Face[];
  /** Depth-tested; give them far to near so see-through faces blend over what is behind. */
  faces: Face[];
  /** Side length of every `pixels` array. */
  textureSize: number;
  look: {shadeColor: Rgb; fogColor: Rgb; borderColor: Rgb};
  /** Clip-space w to distance ahead of the eye, in cube sizes. */
  distScale: number;
  fisheye: number;
  rollDeg: number;
  /** Camera turn the sketch already applied to the corners; the sky needs it too. Right and up are positive. */
  yawDeg: number;
  pitchDeg: number;
  /** Eye to picture plane, in pixels. */
  focal: number;
  /** The vanishing point, in frame pixels: the roll turns about it. */
  pivot: [number, number];
  /** Null leaves the background transparent. */
  sky: Sky | null;
};

const draw = (renderer: Renderer, input: DrawInput) => {
  const {gl, scene, sky, textures} = renderer;
  const curve = lensCurve(input.fisheye);
  const roll = input.rollDeg * Math.PI / 180;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  if (input.sky) {
    gl.useProgram(sky.program);
    gl.bindVertexArray(sky.vao);
    const s = sky.uniforms;
    gl.uniform2f(s.frame, input.width, input.height);
    gl.uniform2f(s.pivot, input.pivot[0], input.pivot[1]);
    gl.uniform1f(s.curve, curve);
    gl.uniform1f(s.roll, roll);
    gl.uniform1f(s.yaw, input.yawDeg * Math.PI / 180);
    gl.uniform1f(s.pitch, input.pitchDeg * Math.PI / 180);
    gl.uniform1f(s.focal, input.focal);
    gl.uniform3fv(s.skyStops, input.sky.stops.flat());
    gl.uniform1fv(s.skyAt, input.sky.at);
    gl.uniform3fv(s.below, input.sky.below);
    const {stars, skyline} = input.sky;
    gl.uniform1f(s.starAmount, stars.amount);
    gl.uniform1f(s.starSize, stars.size);
    gl.uniform1f(s.starPhase, stars.phase);
    gl.uniform1f(s.starBeats, stars.beats);
    gl.uniform1f(s.seed, stars.seed);
    gl.uniform3fv(s.starColors, stars.colors.flat());
    gl.uniform1f(s.skylineHeight, skyline.height);
    gl.uniform3fv(s.skylineColors, skyline.colors.flat());
    gl.uniform3fv(s.skylineLights, skyline.lights);
    gl.uniform3fv(s.skylineMist, skyline.mist);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  gl.useProgram(scene.program);
  gl.bindVertexArray(scene.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
  const u = scene.uniforms;
  gl.uniform1f(u.distScale, input.distScale);
  gl.uniform1f(u.curve, curve);
  gl.uniform1f(u.roll, roll);
  gl.uniform2f(u.frame, input.width, input.height);
  gl.uniform2f(u.pivot, input.pivot[0], input.pivot[1]);
  gl.uniform3fv(u.shadeColor, input.look.shadeColor);
  gl.uniform3fv(u.fogColor, input.look.fogColor);
  gl.uniform3fv(u.borderColor, input.look.borderColor);
  const coarse = COARSE * COARSE * 6;
  const fine = FINE * FINE * 6;
  [...input.backdrop, ...input.faces].forEach((face, index) => {
    if (index === input.backdrop.length) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
    const textured = Boolean(face.pixels);
    if (textured) bindPicture(renderer, face.pixels!, input.textureSize);
    gl.uniformMatrix4fv(u.corners, false, face.corners);
    gl.uniform1i(u.textured, textured ? 1 : 0);
    gl.uniform3fv(u.ground, face.ground);
    gl.uniform1f(u.shade, face.shade);
    gl.uniform4f(u.fog, face.fog.floor, face.fog.start, face.fog.end, face.fog.max);
    gl.uniform1f(u.opacity, face.opacity);
    gl.uniform1f(u.border, face.border ?? 0);
    if (face.fine) gl.drawArrays(gl.TRIANGLES, coarse, fine);
    else gl.drawArrays(gl.TRIANGLES, 0, coarse);
  });
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // Drop the textures that have gone unused the longest.
  for (const [pixels, texture] of textures) {
    if (textures.size <= MAX_TEXTURES) break;
    gl.deleteTexture(texture);
    textures.delete(pixels);
  }
};

export const FaceCanvas: React.FC<DrawInput & {style?: React.CSSProperties}> = ({style, ...input}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<{canvas: HTMLCanvasElement; renderer: Renderer} | null>(null);
  // No dependency list: the faces change with every beat position, and the draw is cheap.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (renderer.current?.canvas !== canvas || renderer.current.renderer.gl.isContextLost()) {
      renderer.current = {canvas, renderer: createRenderer(canvas)};
    }
    draw(renderer.current.renderer, input);
  });
  return <canvas ref={ref} width={input.width} height={input.height} style={style} />;
};
