import * as THREE from 'three';
import { NOISE_GLSL } from './util.js';
import { SKY_GLSL, skyUniforms } from './sky.js';
import { AIR_PARS_GLSL, airUniforms } from './air.js';
import { RIVER_GLSL, Z_START, Z_END, HMAP_HALF, createHeightTexture } from './terrain.js';

export const RIPPLES = 20;

const VERT = /* glsl */ `
uniform mat4 uTexMatrix;
varying vec4 vRefl;
varying vec3 vWorld;
varying float vFogDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vRefl = uTexMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
${SKY_GLSL}
${RIVER_GLSL}
${AIR_PARS_GLSL}
uniform float uTime;
uniform sampler2D uRefl;
uniform sampler2D uHeight;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSunColor;
uniform float uSpec;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uForest;
uniform vec4 uRipples[${RIPPLES}];
varying vec4 vRefl;
varying vec3 vWorld;
varying float vFogDepth;

vec3 waterNormal(vec2 p, float dist) {
  vec2 g = vec2(0.0);
  #define WAVE(dx, dz, amp, k, spd) { vec2 d = normalize(vec2(dx, dz)); float ph = dot(p, d) * k + uTime * spd; g += d * (amp * k * cos(ph)); }
  WAVE(0.8, 0.6, 0.03, 0.85, 1.0)
  WAVE(-0.6, 0.8, 0.022, 1.35, 1.4)
  WAVE(0.2, -1.0, 0.016, 2.2, 1.8)
  WAVE(0.95, -0.3, 0.01, 3.9, 2.5)
  WAVE(-0.3, -0.95, 0.007, 6.4, 3.2)
  vec2 q = p * 0.75 + vec2(uTime * 0.3, -uTime * 0.18);
  float e = 0.2;
  float n0 = vnoise(q);
  g += vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e * 0.06;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 7.0) continue;
    vec2 dv = p - r.xy;
    float d = length(dv) + 1e-3;
    float x = d - age * 2.1;
    float env = exp(-x * x * 1.4) * exp(-age * 0.65) * r.w / (1.0 + d * 0.3);
    g += (dv / d) * cos(x * 6.5) * env * 0.7;
  }
  // Fine chop, two octaves, fading with distance so the far river lies flat and mirror-calm.
  vec2 q2 = p * 2.3 + vec2(-uTime * 0.22, uTime * 0.27);
  float m0 = vnoise(q2);
  g += vec2(vnoise(q2 + vec2(e, 0.0)) - m0, vnoise(q2 + vec2(0.0, e)) - m0) / e * 0.018;
  g /= 1.0 + dist * 0.011;
  return normalize(vec3(-g.x, 1.0, -g.y));
}

/* A glitter lobe that broadens with distance, as the surface's small waves blur into one bright path. */
float glitter(vec3 N, vec3 V, vec3 L, float dist) {
  vec3 H = normalize(V + L);
  float nh = max(dot(N, H), 0.0);
  float k = mix(1400.0, 160.0, 1.0 - exp(-dist * 0.0045));
  return pow(nh, k) * (k * 0.0022) + pow(nh, 30.0) * 0.045;
}

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec3 N = waterNormal(vWorld.xz, dist);

  vec2 huv = vec2((vWorld.x - riverX(vWorld.z)) / ${(HMAP_HALF * 2).toFixed(1)} + 0.5, (vWorld.z - ${Z_START.toFixed(1)}) / ${(Z_END - Z_START).toFixed(1)});
  float ground = texture2D(uHeight, huv).r * 8.0 - 4.0;
  float inMap = step(0.0, huv.x) * step(huv.x, 1.0);
  float depth = mix(2.5, max(-ground, 0.0), inMap);

  vec3 R = reflect(-V, N);
  #ifdef REFLECT
    vec2 ruv = vRefl.xy / vRefl.w + N.xz * vec2(0.03, 0.05);
    vec3 refl = texture2D(uRefl, ruv).rgb;
  #else
    vec3 refl = skyGradient(normalize(vec3(R.x, abs(R.y), R.z)));
    refl = mix(refl, uForest, smoothstep(0.22, 0.03, R.y) * 0.85);
  #endif

  // Water's own Fresnel (n = 1.33): steep views see into the body, grazing ones see the sky. Silt
  // scatters light back just under the surface, so a little of the sky returns even looking straight down.
  float facing = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  float mirror = clamp(fres * 1.15 + 0.07, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 2.4, depth));
  vec3 col = mix(body, refl, mirror);

  float shore = 1.0 - smoothstep(0.0, 0.45, depth);
  float lap = sin(uTime * 1.2 + vWorld.x * 0.21 + vWorld.z * 0.13) * 0.05;
  float foam = smoothstep(0.12 + lap, 0.0 + lap, depth) * (0.4 + 0.6 * vnoise(vWorld.xz * 2.6 + uTime * 0.3));
  col = mix(col, uShallow * 1.1, shore * 0.3);
  col = mix(col, uFoam, foam * 0.3);

  // The sun's path, and the moon's once the sun has set.
  float sunUp = smoothstep(-0.03, 0.06, uSunDir.y);
  col += uSunColor * glitter(N, V, uSunDir, dist) * uSpec * sunUp * (0.35 + 0.65 * fres);
  col += vec3(0.62, 0.72, 1.0) * glitter(N, V, uMoonDir, dist) * 0.5 * uNight * smoothstep(0.0, 0.1, uMoonDir.y) * (0.35 + 0.65 * fres);

  // The waterline feathers into the mud instead of cutting it.
  float alpha = smoothstep(-0.02, 0.1, depth) * inMap + (1.0 - inMap);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Fog and the river air are laid on in the output space, as the lit materials do, so the far water meets
  // the horizon in exactly the sky's colour.
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFogColor, 1.0)).rgb, f);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uAirColor, 1.0)).rgb, airAmount(vFogDepth, vWorld));
}
`;

export function createWater({ reflect = true, resolution = 0.5, halfFloat = true } = {}) {
  const uniforms = {
    ...skyUniforms,
    ...airUniforms,
    uTime: { value: 0 },
    uRefl: { value: null },
    uTexMatrix: { value: new THREE.Matrix4() },
    uHeight: { value: createHeightTexture() },
    uShallow: { value: new THREE.Color('#6f674b') },
    uDeep: { value: new THREE.Color('#344232') },
    uFoam: { value: new THREE.Color('#e9e4d2') },
    uSunColor: { value: new THREE.Color('#fff3df') },
    uSpec: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.002 },
    uForest: { value: new THREE.Color('#203522') },
    uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: reflect ? { REFLECT: 1 } : {},
    transparent: true,
  });
  const length = Z_START - Z_END + 400;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1800, length), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, (Z_START + Z_END) / 2);
  // First of the transparent draws, so lantern glow, fireflies and contact shadows land on top of it.
  mesh.renderOrder = -1;
  mesh.updateMatrixWorld();

  let target = null;
  let dirty = false;
  const virtualCamera = new THREE.PerspectiveCamera();
  virtualCamera.layers.set(0);
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const reflectorPos = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const lookAt = new THREE.Vector3();
  const clipPlane = new THREE.Vector4();
  const view = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const q = new THREE.Vector4();
  const textureMatrix = uniforms.uTexMatrix.value;
  let rippleIndex = 0;

  return {
    mesh,
    uniforms,
    get reflect() {
      return reflect;
    },
    /** Stop mirroring on devices that cannot afford the second pass; the shader falls back to sky and forest tints. */
    dropReflection() {
      if (!reflect) return;
      reflect = false;
      delete material.defines.REFLECT;
      material.needsUpdate = true;
      uniforms.uRefl.value = null;
      target?.dispose();
      target = null;
    },
    setSize(w, h) {
      if (!reflect) return;
      const rw = Math.max(2, Math.round(w * resolution));
      const rh = Math.max(2, Math.round(h * resolution));
      if (!target) {
        target = new THREE.WebGLRenderTarget(rw, rh, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType });
        uniforms.uRefl.value = target.texture;
      } else target.setSize(rw, rh);
      dirty = true;
    },
    /** True after a resize, until the mirror has been drawn again at the new size. */
    get dirty() {
      return dirty;
    },
    get target() {
      return target;
    },
    addRipple(x, z, strength = 1, time) {
      uniforms.uRipples.value[rippleIndex].set(x, z, time, strength);
      rippleIndex = (rippleIndex + 1) % RIPPLES;
    },
    update(atm, time, fog) {
      uniforms.uTime.value = time;
      uniforms.uShallow.value.copy(atm.shallow);
      uniforms.uDeep.value.copy(atm.deep);
      uniforms.uFoam.value.copy(atm.foam);
      uniforms.uSunColor.value.copy(atm.light);
      uniforms.uSpec.value = atm.spec;
      uniforms.uFogColor.value.copy(fog.color);
      uniforms.uFogDensity.value = fog.density;
      uniforms.uForest.value.setRGB(0.03, 0.06, 0.035).lerp(atm.fog, 0.18);
    },
    /** Planar mirror (after three.js Reflector): render the scene from below the surface, clipped at it. */
    renderReflection(renderer, scene, camera) {
      if (!reflect || !target) return;
      reflectorPos.setFromMatrixPosition(mesh.matrixWorld);
      cameraPos.setFromMatrixPosition(camera.matrixWorld);
      rotation.extractRotation(mesh.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation);
      view.subVectors(reflectorPos, cameraPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(reflectorPos);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPos);
      tgt.subVectors(reflectorPos, lookAt).reflect(normal).negate().add(reflectorPos);
      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      virtualCamera.lookAt(tgt);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      // The main camera's projection, far plane included: the oblique clip below skews the frustum's far
      // plane, and with a nearer one three.js culls the forest cells out of the mirror.
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(mesh.matrixWorld);

      plane.setFromNormalAndCoplanarPoint(normal, reflectorPos).applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = virtualCamera.projectionMatrix.elements;
      q.x = (Math.sign(clipPlane.x) + pm[8]) / pm[0];
      q.y = (Math.sign(clipPlane.y) + pm[9]) / pm[5];
      q.z = -1;
      q.w = (1 + pm[10]) / pm[14];
      clipPlane.multiplyScalar(2 / clipPlane.dot(q));
      pm[2] = clipPlane.x;
      pm[6] = clipPlane.y;
      pm[10] = clipPlane.z + 1 - 0.003;
      pm[14] = clipPlane.w;

      mesh.visible = false;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.setRenderTarget(prev);
      mesh.visible = true;
      dirty = false;
    },
  };
}
