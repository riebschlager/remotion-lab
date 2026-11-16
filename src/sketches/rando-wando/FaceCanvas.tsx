import React, {useLayoutEffect, useRef} from 'react';
import type {FacePixels} from './textures';

/**
 * Draws every cube face of a frame into one WebGL canvas.
 *
 * As DOM elements the faces cost the browser several composited layers each,
 * a few hundred in all, which is what exhausted GPU memory in Studio. Here a
 * face is one textured quad. The sketch supplies corners already projected to
 * clip space, so perspective, depth order and texture mapping are exact.
 *
 * Paint order inside a face, bottom to top: `ground`, the texture recoloured
 * through `stops` by luminance, `shade`, `fog`, then the border. Colours are
 * mixed as sRGB values, as CSS does.
 */
export type Rgb = [number, number, number];
export type Face = {
  /** Clip-space x, y, z, w of the top-left, top-right, bottom-left and bottom-right corners. */
  corners: number[];
  ground: Rgb;
  /** Luminance and alpha at `textureSize`; leave out for a flat face or while textures load. */
  pixels?: FacePixels;
  /** Four colours from dark to light that the texture's luminance is sent through. */
  stops?: Rgb[];
  /** Opacity of the `shadeColor` and `fogColor` washes over the picture. */
  shade: number;
  fog: number;
  /** Opacity of the whole face. */
  opacity: number;
};

/** `#rrggbb` as 0..1 channels. */
export const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as Rgb;

const vertexSource = `#version 300 es
in vec4 position;
in vec2 texcoord;
out vec2 uv;
void main() { uv = texcoord; gl_Position = position; }`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D picture;
uniform bool textured;
uniform vec3 ground, stops[4], shadeColor, fogColor, borderColor;
uniform float shade, fog, opacity, border;
void main() {
  vec3 c = ground;
  if (textured) {
    vec2 la = texture(picture, uv).rg;
    float t = clamp(la.r, 0.0, 1.0) * 3.0;
    int i = min(int(t), 2);
    c = mix(c, mix(stops[i], stops[i + 1], t - float(i)), la.g);
  }
  c = mix(mix(c, shadeColor, shade), fogColor, fog);
  // Border of constant width just inside the edge, antialiased where it meets the picture.
  float inside = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float soft = fwidth(inside);
  c = mix(borderColor, c, smoothstep(border - soft, border + soft, inside));
  color = vec4(c * opacity, opacity);
}`;

// Textures in use are re-uploaded from memory as needed, so the GPU holds a
// bounded number however many frames the clips have.
const MAX_TEXTURES = 160;
const uniformNames = ['picture', 'textured', 'ground', 'stops', 'shadeColor', 'fogColor', 'borderColor',
  'shade', 'fog', 'opacity', 'border'] as const;

type Renderer = {
  gl: WebGL2RenderingContext;
  uniforms: Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
  vertices: WebGLBuffer;
  textures: Map<FacePixels, WebGLTexture>;
};

const createRenderer = (canvas: HTMLCanvasElement): Renderer => {
  // The drawing buffer is kept so a screenshot taken after the draw always sees it.
  const gl = canvas.getContext('webgl2', {alpha: true, antialias: true, depth: true, premultipliedAlpha: true,
    preserveDrawingBuffer: true});
  if (!gl) {
    throw new Error('Rando Wando needs WebGL 2 to draw its cubes, and this browser did not provide it. '
      + 'In Studio, check that hardware acceleration is on; for renders, pass --gl=angle.');
  }
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Face shader: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, 'position');
  gl.bindAttribLocation(program, 1, 'texcoord');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Face shader: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);

  const vertices = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.activeTexture(gl.TEXTURE0);
  const uniforms = Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)])) as Renderer['uniforms'];
  gl.uniform1i(uniforms.picture, 0);
  return {gl, uniforms, vertices, textures: new Map()};
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, size, size, 0, gl.RG, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  textures.set(pixels, texture);
};

const draw = (renderer: Renderer, faces: Face[], textureSize: number,
  look: {shadeColor: Rgb; fogColor: Rgb; borderColor: Rgb; border: number}) => {
  const {gl, uniforms, textures} = renderer;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const data = new Float32Array(faces.length * 24);
  const corner = [[0, 0], [1, 0], [0, 1], [1, 1]];
  faces.forEach((face, index) => {
    for (let k = 0; k < 4; k++) {
      data.set(face.corners.slice(k * 4, k * 4 + 4), index * 24 + k * 6);
      data.set(corner[k], index * 24 + k * 6 + 4);
    }
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.vertices);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  gl.uniform3fv(uniforms.shadeColor, look.shadeColor);
  gl.uniform3fv(uniforms.fogColor, look.fogColor);
  gl.uniform3fv(uniforms.borderColor, look.borderColor);
  gl.uniform1f(uniforms.border, look.border);
  faces.forEach((face, index) => {
    const textured = Boolean(face.pixels && face.stops);
    if (textured) {
      bindPicture(renderer, face.pixels!, textureSize);
      gl.uniform3fv(uniforms.stops, face.stops!.flat());
    }
    gl.uniform1i(uniforms.textured, textured ? 1 : 0);
    gl.uniform3fv(uniforms.ground, face.ground);
    gl.uniform1f(uniforms.shade, face.shade);
    gl.uniform1f(uniforms.fog, face.fog);
    gl.uniform1f(uniforms.opacity, face.opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, index * 4, 4);
  });

  // Drop the textures that have gone unused the longest.
  for (const [pixels, texture] of textures) {
    if (textures.size <= MAX_TEXTURES) break;
    gl.deleteTexture(texture);
    textures.delete(pixels);
  }
};

export const FaceCanvas: React.FC<{
  /** Drawing buffer size, in composition pixels. */
  width: number;
  height: number;
  /** Drawn in order; give them far to near so see-through faces blend over what is behind. */
  faces: Face[];
  /** Side length of every `pixels` array. */
  textureSize: number;
  shadeColor: Rgb;
  fogColor: Rgb;
  borderColor: Rgb;
  /** Border width as a fraction of the face. */
  border: number;
  style?: React.CSSProperties;
}> = ({width, height, faces, textureSize, shadeColor, fogColor, borderColor, border, style}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<{canvas: HTMLCanvasElement; renderer: Renderer} | null>(null);
  // No dependency list: the faces change with every beat position, and the draw is cheap.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (renderer.current?.canvas !== canvas || renderer.current.renderer.gl.isContextLost()) {
      renderer.current = {canvas, renderer: createRenderer(canvas)};
    }
    draw(renderer.current.renderer, faces, textureSize, {shadeColor, fogColor, borderColor, border});
  });
  return <canvas ref={ref} width={width} height={height} style={style} />;
};
