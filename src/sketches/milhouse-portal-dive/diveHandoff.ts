import {
  Camera, ConstantAlphaFactor, CustomBlending, Mesh, OneFactor, PlaneGeometry, Scene, ShaderMaterial,
  type Texture, type WebGLRenderer,
} from 'three';

/** Crossfade the two premultiplied images, including the openings onto the bloom. */
export function createDiveHandoff(destination: Texture) {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: ConstantAlphaFactor,
    uniforms: {destination: {value: destination}, amount: {value: 0}},
    vertexShader: `
      varying vec2 screenUv;
      void main() {
        screenUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D destination;
      uniform float amount;
      varying vec2 screenUv;
      void main() {
        vec4 room = texture2D(destination, screenUv);
        gl_FragColor = vec4(room.rgb / max(room.a, 0.0001), room.a);
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * room.a, room.a) * amount;
      }
    `,
  });
  const scene = new Scene();
  const camera = new Camera();
  const quad = new Mesh(geometry, material);
  quad.frustumCulled = false;
  scene.add(quad);
  return {
    render(gl: WebGLRenderer, amount: number) {
      material.uniforms.amount.value = amount;
      material.blendAlpha = 1 - amount;
      const autoClear = gl.autoClear;
      gl.autoClear = false;
      try {
        gl.render(scene, camera);
      } finally {
        gl.autoClear = autoClear;
      }
    },
    dispose() {
      material.dispose();
      geometry.dispose();
    },
  };
}
