import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {
  Color, DoubleSide, Group, Mesh, MeshDepthMaterial, NoBlending,
  OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget,
} from 'three';
import {HorizontalBlurShader} from 'three/addons/shaders/HorizontalBlurShader.js';
import {VerticalBlurShader} from 'three/addons/shaders/VerticalBlurShader.js';
import {useBeat} from '../../beat/BeatContext';

/** A fresh depth-derived contact shadow for every beat sample; no frame history. */
export const StudioFloor: React.FC<{color: string; revision: string}> = ({color, revision}) => {
  const {gl, scene} = useThree();
  const {beat} = useBeat();
  const floor = useRef<Group>(null);
  const pass = useMemo(() => {
    // Texture resolution is an offscreen sampling budget, not canvas sizing.
    const target = new WebGLRenderTarget(512, 512);
    const scratch = new WebGLRenderTarget(512, 512);
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0, 7.5);
    camera.position.set(0, -2.97, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 4, 0);
    const depth = new MeshDepthMaterial({side: DoubleSide, blending: NoBlending});
    depth.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( 0.0, 0.0, 0.0, pow(1.0 - fragCoordZ, 4.0) );',
      );
    };
    const horizontal = new ShaderMaterial(HorizontalBlurShader);
    const vertical = new ShaderMaterial(VerticalBlurShader);
    horizontal.depthTest = vertical.depthTest = false;
    horizontal.blending = vertical.blending = NoBlending;
    const blurScene = new Scene();
    const quad = new Mesh(new PlaneGeometry(2, 2), horizontal);
    blurScene.add(quad);
    const blurCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
    blurCamera.position.z = 1;
    return {target, scratch, camera, depth, horizontal, vertical, blurScene, quad, blurCamera};
  }, []);

  useLayoutEffect(() => {
    if (!floor.current) return;
    const previousTarget = gl.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const clear = gl.getClearColor(new Color());
    const clearAlpha = gl.getClearAlpha();
    const previousXr = gl.xr.enabled;
    const previousShadowUpdate = gl.shadowMap.autoUpdate;
    try {
      floor.current.visible = false;
      scene.background = null;
      scene.overrideMaterial = pass.depth;
      gl.xr.enabled = false;
      gl.shadowMap.autoUpdate = false;
      gl.setClearColor(0x000000, 0);
      scene.updateMatrixWorld(true);
      gl.setRenderTarget(pass.target);
      gl.clear();
      gl.render(scene, pass.camera);
      // Two fixed Gaussian passes retain close contact while feathering the edge.
      for (const blur of [1.4, 0.55]) {
        pass.horizontal.uniforms.tDiffuse.value = pass.target.texture;
        pass.horizontal.uniforms.h.value = blur / 512;
        pass.quad.material = pass.horizontal;
        gl.setRenderTarget(pass.scratch);
        gl.clear();
        gl.render(pass.blurScene, pass.blurCamera);
        pass.vertical.uniforms.tDiffuse.value = pass.scratch.texture;
        pass.vertical.uniforms.v.value = blur / 512;
        pass.quad.material = pass.vertical;
        gl.setRenderTarget(pass.target);
        gl.clear();
        gl.render(pass.blurScene, pass.blurCamera);
      }
    } finally {
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      floor.current.visible = true;
      gl.xr.enabled = previousXr;
      gl.shadowMap.autoUpdate = previousShadowUpdate;
      gl.setRenderTarget(previousTarget);
      gl.setClearColor(clear, clearAlpha);
    }
  }, [gl, scene, pass, beat, revision]);
  useLayoutEffect(() => () => {
    pass.target.dispose(); pass.scratch.dispose(); pass.depth.dispose();
    pass.horizontal.dispose(); pass.vertical.dispose(); pass.quad.geometry.dispose();
  }, [pass]);

  return <group ref={floor}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.98, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55}
        roughness={0.92} metalness={0} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -2.975, 0]}>
      <planeGeometry args={[10, 10]} />
      <meshBasicMaterial map={pass.target.texture} transparent opacity={0.7}
        side={DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
};
