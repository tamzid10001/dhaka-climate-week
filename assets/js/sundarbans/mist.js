import * as THREE from 'three';

/*
 * River mist, drawn as one full-screen pass after the scene. The quad sits just in front of the far plane
 * with an inverted depth test, so it lands only where the scene wrote depth (water, banks, mangroves,
 * wildlife) and never on the sky, which writes none. The sky keeps all of its light while the dark forest
 * is lifted into a tonal range plain type can sit on. The colour is the air's own, pale by day and navy
 * at night, so it reads as weather over the delta rather than a panel behind the page.
 */
export function createMist() {
  const uniforms = {
    uColor: { value: new THREE.Color() },
    uAmount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAmount;
      void main() {
        gl_FragColor = vec4(uColor, uAmount);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();

  return {
    uniforms,
    /** Draw over the frame just rendered, keeping its depth buffer. */
    render(renderer) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
    },
  };
}
