import React, {useEffect, useMemo} from 'react';
import {NormalBlending, BufferGeometry, Color, DataTexture, DoubleSide, ShaderMaterial} from 'three';
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {portalGeometry} from './portalGeometry';

export const portalSchema = z.object({
  secondaryColor: zColor().describe('Aurora / secondary energy color'),
  deepColor: zColor().describe('Deep universe color'),
  glow: z.number().min(0).max(3).step(0.05).describe('Neon glow strength'),
  rimWidth: z.number().min(0.005).max(0.12).step(0.005).describe('Rim width relative to character height'),
  echoCount: z.number().int().min(1).max(10).describe('Inward contour bands'),
  echoTravel: z.number().min(0).max(4).step(0.25).describe('Inward waves per beat; must close over the loop'),
  depth: z.number().min(0).max(1).step(0.05).describe('Echo compression and center darkness'),
  turbulence: z.number().min(0).max(1).step(0.05).describe('Contour waviness'),
  aurora: z.number().min(0).max(1).step(0.05).describe('Interior aurora strength'),
  beatResponse: z.number().min(0).max(1).step(0.05).describe('Brightness response to chunk bounce'),
  chunkVariation: z.number().min(0).max(1).step(0.05).describe('Color and phase differences between chunks'),
});
export const leakSchema = z.object({
  strength: z.number().min(0).max(3).step(0.05).describe('Light escaping from cracks'),
  reach: z.number().min(0).max(2).step(0.05).describe('Ray reach relative to character height'),
  definition: z.number().min(0).max(1).step(0.05).describe('Diffuse haze to distinct shafts'),
  surfaceSpill: z.number().min(0).max(2).step(0.05).describe('Localized portal color on the satin surface'),
});
export type PortalSettings = z.output<typeof portalSchema>;
export type LeakSettings = z.output<typeof leakSchema>;
export const portalDefaults: PortalSettings = {
  secondaryColor: '#ff00ce', deepColor: '#160435', glow: 0.95, rimWidth: 0.005,
  echoCount: 4, echoTravel: 1, depth: 0.7, turbulence: 0.25, aurora: 0.85,
  beatResponse: 0.65, chunkVariation: 0.35,
};
export const leakDefaults: LeakSettings = {strength: 0.75, reach: 0.15, definition: 0.45, surfaceSpill: 0.55};

const common = `
  uniform vec3 primaryColor, secondaryColor, deepColor;
  uniform float clock, drift, variation, glow, energy, opening, response;
  varying vec2 vUv;
  varying vec3 vLocal;
  const float TAU = 6.28318530718;
  float wave(vec2 p) {
    return sin(p.x * 7.0 + sin(p.y * 6.0 + drift) * 1.7 + drift)
      * sin(p.y * 8.0 - p.x * 3.0 - drift);
  }
  // Keep broad regions near the palette endpoints instead of mixing cyan
  // and magenta equally everywhere (which creates pale lavender/white).
  vec3 palette(float t) {return mix(primaryColor, secondaryColor, smoothstep(0.3, 0.7, t));}
  vec3 keepChroma(vec3 color) {
    return color * min(1.0, 0.95 / max(0.001, max(color.r, max(color.g, color.b))));
  }
`;
const vertex = `varying vec2 vUv; varying vec3 vLocal;
  void main() {vUv = uv; vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);}`;

export const Portal: React.FC<{
  caps: BufferGeometry; color: string; settings: PortalSettings; leaks: LeakSettings;
  energy: number; opening: number; clock: number; drift: number; variation: number;
}> = ({caps, color, settings, leaks, energy, opening, clock, drift, variation}) => {
  const field = useMemo(() => portalGeometry(caps), [caps]);
  useEffect(() => () => {field.geometry.dispose(); field.rays.dispose(); field.texture.dispose();}, [field]);
  const materials = useMemo(() => {
    const uniforms = {
      primaryColor: {value: new Color()}, secondaryColor: {value: new Color()}, deepColor: {value: new Color()},
      clock: {value: 0}, drift: {value: 0}, variation: {value: 0}, glow: {value: 1},
      energy: {value: 0}, opening: {value: 0}, response: {value: 0},
      field: {value: null as DataTexture | null}, rimWidth: {value: 0}, echoCount: {value: 0},
      depth: {value: 0}, turbulence: {value: 0}, aurora: {value: 0},
      leakStrength: {value: 0}, reach: {value: 0}, definition: {value: 0},
    };
    const cap = new ShaderMaterial({uniforms, vertexShader: vertex, side: DoubleSide,
      fragmentShader: `${common}
      uniform sampler2D field;
      uniform float rimWidth, echoCount, depth, turbulence, aurora;
      void main() {
        vec2 distanceField = texture2D(field, vUv).rg;
        float d = distanceField.r;
        float ripple = wave(vLocal.xz * 1.1);
        float rim = 1.0 - smoothstep(rimWidth * 0.2, rimWidth, distanceField.g);
        float inward = pow(d, mix(1.0, 0.55, depth));
        // Subtract clock: maxima travel from the silhouette toward its interior.
        float phase = inward * echoCount - clock + variation + turbulence * ripple * 0.28 * d;
        float bands = pow(0.5 + 0.5 * cos(TAU * phase), 14.0);
        float fade = pow(1.0 - d, mix(0.4, 1.8, depth));
        float curtain = pow(0.5 + 0.5 * sin(vLocal.x * 9.0 + vLocal.z * 4.0
          + ripple * 2.8 + drift + variation * TAU), 1.35);
        float current = 0.5 + 0.5 * sin(vLocal.z * 10.0 - vLocal.x * 4.0 + ripple * 2.0 - drift);
        vec3 auroraColor = palette(0.5 + ripple * 0.55 + (current - 0.5) * 0.3);
        vec3 interior = mix(deepColor * (1.0 - d * depth * 0.4), auroraColor,
          aurora * (0.18 + 0.72 * curtain) * (1.0 - d * 0.25));
        float brightness = glow * mix(1.0, 0.5 + energy * 0.9, response);
        vec3 echoColor = palette(0.5 + 0.5 * sin(inward * 9.0 + drift + variation * TAU));
        vec3 paint = mix(interior, echoColor, min(0.88, bands * fade * brightness * 0.85));
        vec3 rimColor = palette(0.5 + 0.5 * sin(vLocal.x * 4.5 + vLocal.z * 5.0 + drift + variation * TAU));
        paint = mix(paint, rimColor, rim * 0.97) * brightness;
        // Compress the RGB vector together: high glow retains the selected hue.
        paint = keepChroma(paint);
        gl_FragColor = vec4(paint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const rays = new ShaderMaterial({uniforms, side: DoubleSide, transparent: true,
      depthWrite: false, blending: NormalBlending, toneMapped: false,
      vertexShader: `uniform float reach, opening; attribute vec3 outward;
        varying vec2 vUv; varying vec3 vLocal; varying float vOpening;
        void main() {
          vUv = uv; vLocal = position;
          vOpening = opening;
          vec3 p = position + outward * reach * (0.25 + 0.75 * sqrt(vOpening));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `${common}
        uniform float leakStrength, definition;
        varying float vOpening;
        void main() {
          float r = vUv.x;
          float stripes = pow(0.5 + 0.5 * sin(vLocal.x * 53.0 + vLocal.z * 39.0
            + sin(vLocal.x * 19.0 - vLocal.z * 31.0 + drift) * 2.0 + variation * TAU), 8.0);
          float shafts = mix(0.65, 0.08 + stripes * 1.7, definition);
          float halo = exp(-r * 20.0) * 0.45;
          float tail = pow(1.0 - r, 2.5) * shafts * 0.28;
          float pinched = 1.0 + response * (1.0 - energy) * 0.6;
          float alpha = min(0.72, (halo + tail) * leakStrength * glow * vOpening * pinched);
          gl_FragColor = vec4(palette(0.5 + 0.5 * sin(vLocal.x * 4.5 + vLocal.z * 5.0 + drift + variation * TAU)), alpha);
          #include <colorspace_fragment>
        }`,
    });
    return {cap, rays, uniforms};
  }, []);
  useEffect(() => () => {materials.cap.dispose(); materials.rays.dispose();}, [materials]);
  const u = materials.uniforms;
  // Keep GPU programs alive while the moving pose replaces its distance field.
  u.field.value = field.texture;
  u.primaryColor.value.set(color); u.secondaryColor.value.set(settings.secondaryColor); u.deepColor.value.set(settings.deepColor);
  u.clock.value = clock; u.drift.value = drift; u.variation.value = variation;
  u.energy.value = energy; u.opening.value = opening;
  u.response.value = settings.beatResponse;
  u.glow.value = settings.glow; u.rimWidth.value = settings.rimWidth * 5;
  u.echoCount.value = settings.echoCount; u.depth.value = settings.depth;
  u.turbulence.value = settings.turbulence; u.aurora.value = settings.aurora;
  u.leakStrength.value = leaks.strength; u.reach.value = leaks.reach * 5;
  u.definition.value = leaks.definition;
  return <group visible={opening > 0.00001}>
    <mesh geometry={field.geometry} material={materials.cap} />
    <mesh geometry={field.rays} material={materials.rays} frustumCulled={false}
      userData={{portalLeak: true}} visible={leaks.strength > 0 && leaks.reach > 0} />
  </group>;
};
