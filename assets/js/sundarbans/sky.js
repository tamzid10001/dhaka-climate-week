import * as THREE from 'three';
import { NOISE_GLSL, lerp, clamp } from './util.js';

/*
 * The Luminous Sky, after the reference: a Sky → Haze vertical gradient (#a9c8f3 → #eef4fd), a wide warm
 * halo with a soft white core sitting just above the top edge, right of centre, three depths of soft
 * cumulus that drift and separate with the cursor and the camera, and at night a deep navy field with a
 * crescent moon and twinkling stars. Time of day (0 day → 1 night) is driven by scroll.
 */

const color = (hex) => new THREE.Color(hex);

export const skyUniforms = {
  uZenith: { value: color('#a9c8f3') },
  uUpper: { value: color('#bbd4f6') },
  uMid: { value: color('#d6e5fa') },
  uLow: { value: color('#dce9fb') },
  uHorizon: { value: color('#eef4fd') },
  uSunDir: { value: new THREE.Vector3(0.47, 0.41, -0.78).normalize() },
  uSunCore: { value: color('#ffffff') },
  uSunHalo: { value: color('#fff7e4') },
  uSunGlow: { value: 1 },
  uSunDisc: { value: 0 },
  uNight: { value: 0 },
  uNightGlow: { value: color('#2b5cf5') },
};

export const SKY_GLSL = /* glsl */ `
#define SKY_PI 3.14159265
uniform vec3 uZenith;
uniform vec3 uUpper;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCore;
uniform vec3 uSunHalo;
uniform float uSunGlow;
uniform float uSunDisc;
uniform float uNight;
uniform vec3 uNightGlow;

float sunDistance(vec3 dir) {
  float el = asin(clamp(dir.y, -1.0, 1.0));
  float sel = asin(clamp(uSunDir.y, -1.0, 1.0));
  float daz = atan(dir.x, -dir.z) - atan(uSunDir.x, -uSunDir.z);
  daz = mod(daz + SKY_PI, 2.0 * SKY_PI) - SKY_PI;
  // The reference glow is an ellipse, wider than tall.
  return length(vec2(daz * cos(el) / 1.38, el - sel));
}

vec3 skyGradient(vec3 dir) {
  // Stops are packed into the band a river-level camera actually sees, so the frame runs
  // Sky → Haze from its top edge to the horizon, as the reference does on screen.
  float e = dir.y;
  vec3 c = uHorizon;
  c = mix(c, uLow, smoothstep(0.0, 0.035, e));
  c = mix(c, uMid, smoothstep(0.02, 0.1, e));
  c = mix(c, uUpper, smoothstep(0.08, 0.21, e));
  c = mix(c, uZenith, smoothstep(0.17, 0.38, e));
  c = mix(c, uHorizon * 0.9, smoothstep(0.0, -0.3, e));
  c += uNightGlow * 0.06 * uNight * exp(-abs(e - 0.1) * 4.0);

  float x = sunDistance(dir) / 0.6;
  float haloA = x < 0.46 ? mix(0.78, 0.22, x / 0.46) : mix(0.22, 0.0, clamp((x - 0.46) / 0.54, 0.0, 1.0));
  vec3 haloC = mix(uSunHalo, uSunCore, smoothstep(0.0, 0.46, x));
  c = mix(c, haloC, haloA * uSunGlow);
  float coreA = 0.95 * clamp(1.0 - x * 0.6 / 0.22, 0.0, 1.0);
  c = mix(c, uSunCore, coreA * coreA * uSunGlow);
  c += uSunCore * (1.0 - smoothstep(0.022, 0.03, x * 0.6)) * uSunDisc;
  return c;
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const SKY_FRAG = /* glsl */ `
${NOISE_GLSL}
${SKY_GLSL}
uniform float uTime;
uniform vec2 uCloudShift;
uniform vec3 uCloudLight;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform float uCloudAlpha;
uniform vec3 uMoonDir;
uniform vec3 uMoonShadow;
varying vec3 vWorld;

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += a * vnoise(p);
    p = mat2(1.62, 1.18, -1.18, 1.62) * p + 11.3;
    a *= 0.5;
  }
  return v;
}

vec4 cloudLayer(vec3 dir, float scale, float speed, float cover, float par, vec2 seed, float top) {
  float h = max(dir.y, 0.0);
  vec2 uv = dir.xz / (h + 0.1) * scale + seed;
  uv += vec2(uTime * speed, uTime * speed * 0.3) + uCloudShift * par;
  float base = fbm(uv);
  float d = base * 0.62 + fbm(uv * 2.1 + base * 1.6) * 0.48;
  float dens = smoothstep(cover, cover + 0.17, d);
  // Lit from the sun side, shaded beneath: compare density a little toward the sun and toward the horizon.
  vec2 toSun = normalize(uSunDir.xz + vec2(1e-4)) * 0.16;
  float dSun = fbm(uv + toSun) * 0.62 + fbm((uv + toSun) * 2.1 + base * 1.6) * 0.48;
  float lit = clamp(0.72 + (d - dSun) * 3.0, 0.0, 1.0);
  lit *= mix(0.82, 1.0, smoothstep(0.0, 0.08, h));
  lit = mix(lit, 1.0, smoothstep(cover + 0.1, cover + 0.34, d) * 0.5);
  float band = smoothstep(0.003, 0.03, h) * (1.0 - smoothstep(top * 0.45, top, h));
  vec3 col = mix(uCloudShade, uCloudLight, lit);
  float nearSun = 1.0 - smoothstep(0.0, 0.5, sunDistance(dir));
  col = mix(col, uSunCore, nearSun * 0.45 * uSunGlow);
  return vec4(col, dens * band);
}

float stars(vec3 dir) {
  vec3 p = dir * 180.0;
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = fract(sin(dot(i, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  if (h < 0.962) return 0.0;
  vec3 o = vec3(fract(h * 17.13), fract(h * 31.71), fract(h * 47.37)) - 0.5;
  float d = length(f - o * 0.6);
  float tw = 0.62 + 0.38 * sin(uTime * (0.7 + h * 2.6) + h * 91.0);
  float big = step(0.994, h);
  return (smoothstep(0.17, 0.0, d) * (0.45 + 0.55 * fract(h * 7.0)) + big * smoothstep(0.55, 0.0, d) * 0.3) * tw;
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 col = skyGradient(dir);

  if (uNight > 0.01) {
    float st = stars(dir) * uNight * smoothstep(0.03, 0.32, dir.y);
    col += vec3(0.82, 0.87, 1.0) * st;
    float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
    float disc = 1.0 - smoothstep(0.019, 0.022, md);
    float shadow = 1.0 - smoothstep(0.018, 0.021, acos(clamp(dot(dir, uMoonShadow), -1.0, 1.0)));
    col = mix(col, vec3(0.93, 0.95, 1.0), clamp(disc - shadow, 0.0, 1.0) * uNight);
    col += vec3(0.5, 0.62, 1.0) * (exp(-md * 24.0) * 0.16 + exp(-md * 5.0) * 0.06) * uNight;
  }

  // far · mid · near, as the reference: a cloud sea on the horizon, a few higher billows nearer.
  #if CLOUD_LAYERS > 0
    vec4 far = cloudLayer(dir, 0.42, 0.0032, uCloudCover - 0.02, 0.16, vec2(3.1, 7.7), 0.12);
    col = mix(col, far.rgb, far.a * uCloudAlpha * 0.7);
  #endif
  #if CLOUD_LAYERS > 1
    vec4 mid = cloudLayer(dir, 0.7, 0.0055, uCloudCover + 0.02, 0.4, vec2(11.3, 2.9), 0.2);
    col = mix(col, mid.rgb, mid.a * uCloudAlpha * 0.85);
  #endif
  #if CLOUD_LAYERS > 2
    vec4 near = cloudLayer(dir, 1.1, 0.009, uCloudCover + 0.1, 0.84, vec2(5.7, 13.1), 0.42);
    col = mix(col, near.rgb, near.a * uCloudAlpha);
  #endif

  // The light source wins over the clouds in front of it.
  float sx = sunDistance(dir) / 0.6;
  col = mix(col, mix(uSunHalo, uSunCore, smoothstep(0.0, 0.5, sx)), (1.0 - smoothstep(0.0, 0.75, sx)) * 0.32 * uSunGlow);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** Day → golden hour → dusk → night. Colours are the reference palette at both ends. */
const PALETTES = [
  {
    t: 0,
    zenith: '#a9c8f3', upper: '#bbd4f6', mid: '#d6e5fa', low: '#dce9fb', horizon: '#eef4fd',
    sunCore: '#ffffff', sunHalo: '#fff7e4', sunGlow: 1, sunDisc: 0, sunEl: 0.42, sunAz: 0.16,
    cloudLight: '#ffffff', cloudShade: '#c8d9f1', cloudAlpha: 0.95, cloudCover: 0.55,
    fog: '#e2ecf8', fogDensity: 0.0021,
    hemiSky: '#e3edf9', hemiGround: '#5d553a', hemi: 1.08, light: '#fff3df', lightI: 1.5, lightEl: 0.95,
    shallow: '#6f674b', deep: '#344232', foam: '#e9e4d2', spec: 0.9, night: 0,
  },
  {
    t: 0.4,
    zenith: '#8eb0e2', upper: '#a9c2e6', mid: '#dcd8cb', low: '#f1dcb0', horizon: '#f8e2b0',
    sunCore: '#fff4d6', sunHalo: '#fac55a', sunGlow: 1, sunDisc: 0.35, sunEl: 0.12, sunAz: 0.3,
    cloudLight: '#ffe9c0', cloudShade: '#b3a89e', cloudAlpha: 0.92, cloudCover: 0.52,
    fog: '#efdcb6', fogDensity: 0.0026,
    hemiSky: '#f0e2c4', hemiGround: '#544631', hemi: 0.95, light: '#ffd28e', lightI: 1.55, lightEl: 0.3,
    shallow: '#7a6748', deep: '#3a3f2c', foam: '#f3dfb4', spec: 1.2, night: 0,
  },
  {
    t: 0.72,
    zenith: '#22335a', upper: '#344770', mid: '#6a6f86', low: '#c47d5b', horizon: '#e5915f',
    sunCore: '#ffc896', sunHalo: '#c84b2f', sunGlow: 0.85, sunDisc: 0.2, sunEl: -0.02, sunAz: 0.4,
    cloudLight: '#f0a173', cloudShade: '#46495f', cloudAlpha: 0.85, cloudCover: 0.55,
    fog: '#8f7568', fogDensity: 0.0028,
    hemiSky: '#8a8399', hemiGround: '#2c2721', hemi: 0.7, light: '#ff9d63', lightI: 0.9, lightEl: 0.14,
    shallow: '#4b4038', deep: '#22252a', foam: '#d9a688', spec: 0.9, night: 0.25,
  },
  {
    t: 1,
    zenith: '#0b1634', upper: '#0a1229', mid: '#080e1d', low: '#0a1020', horizon: '#0e1730',
    sunCore: '#2a3a66', sunHalo: '#0b1634', sunGlow: 0, sunDisc: 0, sunEl: -0.35, sunAz: 0.4,
    cloudLight: '#33456b', cloudShade: '#0c1224', cloudAlpha: 0.6, cloudCover: 0.6,
    fog: '#0c1529', fogDensity: 0.0026,
    hemiSky: '#2f4377', hemiGround: '#0a0c10', hemi: 0.55, light: '#a9bdff', lightI: 0.55, lightEl: 0.62,
    shallow: '#1a2030', deep: '#0b0f18', foam: '#6f7fa8', spec: 0.6, night: 1,
  },
];

const COLOR_KEYS = [
  'zenith', 'upper', 'mid', 'low', 'horizon', 'sunCore', 'sunHalo', 'cloudLight', 'cloudShade',
  'fog', 'hemiSky', 'hemiGround', 'light', 'shallow', 'deep', 'foam',
];
const NUM_KEYS = [
  'sunGlow', 'sunDisc', 'sunEl', 'sunAz', 'cloudAlpha', 'cloudCover', 'fogDensity', 'hemi', 'lightI',
  'lightEl', 'spec', 'night',
];
const parsed = PALETTES.map((p) => {
  const o = { t: p.t };
  for (const k of COLOR_KEYS) o[k] = color(p[k]);
  for (const k of NUM_KEYS) o[k] = p[k];
  return o;
});

/** Interpolated palette state (reused object). */
export const atmosphere = Object.fromEntries([
  ...COLOR_KEYS.map((k) => [k, new THREE.Color()]),
  ...NUM_KEYS.map((k) => [k, 0]),
]);

export function sampleAtmosphere(tod) {
  let i = 1;
  while (i < parsed.length - 1 && tod > parsed[i].t) i++;
  const a = parsed[i - 1];
  const b = parsed[i];
  const t = clamp((tod - a.t) / (b.t - a.t));
  const s = t * t * (3 - 2 * t);
  for (const k of COLOR_KEYS) atmosphere[k].lerpColors(a[k], b[k], s);
  for (const k of NUM_KEYS) atmosphere[k] = lerp(a[k], b[k], s);
  return atmosphere;
}

export function createSky({ layers = 3, octaves = 5 } = {}) {
  const uniforms = {
    ...skyUniforms,
    uTime: { value: 0 },
    uCloudShift: { value: new THREE.Vector2() },
    uCloudLight: { value: color('#ffffff') },
    uCloudShade: { value: color('#bccfeb') },
    uCloudCover: { value: 0.5 },
    uCloudAlpha: { value: 0.96 },
    uMoonDir: { value: new THREE.Vector3(0.42, 0.4, -0.81).normalize() },
    uMoonShadow: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    defines: { CLOUD_LAYERS: layers, OCTAVES: octaves },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.scale.setScalar(1800);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  const dirFrom = (v, az, el) => v.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const right = new THREE.Vector3();

  return {
    mesh,
    uniforms,
    /** Apply the palette; the sun keeps its place in the frame (top, right of centre) as the camera turns. */
    update(atm, { time, camera, yaw, pointer }) {
      mesh.position.copy(camera.position);
      uniforms.uTime.value = time;
      skyUniforms.uZenith.value.copy(atm.zenith);
      skyUniforms.uUpper.value.copy(atm.upper);
      skyUniforms.uMid.value.copy(atm.mid);
      skyUniforms.uLow.value.copy(atm.low);
      skyUniforms.uHorizon.value.copy(atm.horizon);
      skyUniforms.uSunCore.value.copy(atm.sunCore);
      skyUniforms.uSunHalo.value.copy(atm.sunHalo);
      skyUniforms.uSunGlow.value = atm.sunGlow;
      skyUniforms.uSunDisc.value = atm.sunDisc;
      skyUniforms.uNight.value = atm.night;
      dirFrom(skyUniforms.uSunDir.value, yaw + atm.sunAz + pointer.x * 0.06, atm.sunEl - pointer.y * 0.03);
      uniforms.uCloudLight.value.copy(atm.cloudLight);
      uniforms.uCloudShade.value.copy(atm.cloudShade);
      uniforms.uCloudCover.value = atm.cloudCover;
      uniforms.uCloudAlpha.value = atm.cloudAlpha;
      uniforms.uCloudShift.value.set(camera.position.x * 0.0016 + pointer.x * 0.08, camera.position.z * 0.0016 + pointer.y * 0.05);
      const moon = dirFrom(uniforms.uMoonDir.value, yaw + 0.52 + pointer.x * 0.03, 0.34 - pointer.y * 0.015);
      right.set(Math.cos(yaw + 0.52), 0, Math.sin(yaw + 0.52));
      uniforms.uMoonShadow.value.copy(moon).addScaledVector(right, 0.011).addScaledVector(THREE.Object3D.DEFAULT_UP, 0.004).normalize();
    },
  };
}
