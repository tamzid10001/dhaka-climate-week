import * as THREE from 'three';
import { NOISE_GLSL, glslColor as C } from '../util.js';
import { coatUniforms } from './coat.js';

/*
 * The Bengal tiger's coat, painted per pixel from where each point sits on the body at rest, so the
 * markings stay glued to the skin while the skeleton bends. `coat` = (metres along the part, ring
 * sine, ring cosine, region); `position` is the bind pose in the tiger's own metres, facing +z.
 * Regions: 0 torso & neck · 1 skull & muzzle · 2 legs · 3 tail · 4 ears · 5 eyes · 6 mouth
 * · 7 nose · 8 teeth · 9 cheek ruffs & whisker pads · 10 lower jaw.
 */

export const HEAD_PIVOT = [0, 0.88, 0.88];

/** Flank stripes: wavy dorsal-to-belly bands that fork and taper, from z along the body and v up it. */
const STRIPES = /* glsl */ `
float bodyStripe(vec3 P, float v, float side) {
  float n1 = vnoise(vec2(P.z * 3.4 + side * 7.0, v * 1.9));
  float n2 = vnoise(vec2(P.z * 8.5 - side * 3.0, v * 4.4 + 2.0));
  float u = P.z * 9.6 + (1.0 - v) * 0.42 + (n1 - 0.5) * 1.5 + (n2 - 0.5) * 0.45;
  float b = sin(u * 6.2832);
  float taper = smoothstep(-0.6, -0.08, v) * (0.82 + 0.18 * smoothstep(1.0, 0.7, v));
  taper *= 1.0 - 0.75 * smoothstep(0.6, 0.82, P.z);
  float thr = mix(1.02, 0.28, taper * (0.58 + 0.42 * n1));
  float aa = fwidth(b) * 1.3 + 1e-4;
  float stripe = smoothstep(thr - aa, thr + aa, b);
  return stripe * (1.0 - step(0.6, n2) * step(thr, 0.55) * smoothstep(0.95 - aa, 0.95 + aa, b));
}
`;

const PAINT = /* glsl */ `
  float a = vCoat.x;
  float v = vCoat.y;
  float s = vCoat.z;
  float R = floor(vCoat.w + 0.5);
  vec3 P = vRest;
  vec3 H = P - vec3(${HEAD_PIVOT.map((n) => n.toFixed(3)).join(', ')});
  float side = P.x >= 0.0 ? 1.0 : -1.0;

  vec3 deep = ${C('#93391a')};
  vec3 orange = ${C('#c9621f')};
  vec3 bright = ${C('#e38c3c')};
  vec3 cream = ${C('#f1e6d2')};
  vec3 ink = ${C('#130d0a')};

  vec3 col = orange;
  float stripe = 0.0;

  if (R < 0.5) {
    col = mix(orange, deep, smoothstep(0.25, 0.95, v));
    col = mix(col, bright, smoothstep(0.02, -0.3, v));
    col = mix(col, cream, smoothstep(-0.34, -0.62, v));
    col = mix(col, cream, smoothstep(0.5, 0.68, P.z) * smoothstep(0.15, -0.4, v));
    stripe = bodyStripe(P, v, side);
  } else if (R < 1.5) {
    col = mix(orange, deep, smoothstep(0.05, 0.15, H.y) * 0.4);
    col = mix(col, cream, smoothstep(-0.012, -0.042, H.y) * smoothstep(0.13, 0.18, H.z));
    col = mix(col, cream, smoothstep(0.045, 0.07, abs(H.x)) * smoothstep(0.0, -0.025, H.y) * smoothstep(0.17, 0.22, H.z));
    col = mix(col, cream, smoothstep(0.08, 0.115, abs(H.x)) * smoothstep(0.0, -0.05, H.y) * 0.85);
    float brow = 1.0 - smoothstep(0.011, 0.02, length(vec2(abs(H.x) - 0.058, (H.y - 0.084) * 1.5)));
    col = mix(col, cream, brow * smoothstep(0.1, 0.13, H.z));
    float rim = 1.0 - smoothstep(0.022, 0.028, length(vec3(abs(H.x) - 0.08, (H.y - 0.026) * 1.3, H.z - 0.16)));
    col = mix(col, cream, rim * 0.85);

    float fore = smoothstep(0.05, 0.085, H.y) * smoothstep(-0.04, 0.0, H.z) * (1.0 - smoothstep(0.13, 0.16, H.z));
    float fb = sin((abs(H.x) * 30.0 + H.z * 5.0 + (vnoise(H.xz * 16.0) - 0.5) * 0.9) * 6.2832);
    float faa = fwidth(fb) * 1.3 + 1e-4;
    float foreS = smoothstep(0.5 - faa, 0.5 + faa, fb) * fore * smoothstep(0.014, 0.03, abs(H.x));
    foreS = max(foreS, fore * (1.0 - smoothstep(0.005, 0.011, abs(H.x))) * smoothstep(0.03, 0.09, H.z));
    float sideZone = smoothstep(0.085, 0.115, abs(H.x)) * (1.0 - smoothstep(0.08, 0.14, H.z)) * smoothstep(-0.07, -0.02, H.y);
    float sb = sin((H.y * 22.0 - H.z * 8.0 + (vnoise(H.yz * 13.0) - 0.5) * 0.8) * 6.2832);
    float saa = fwidth(sb) * 1.3 + 1e-4;
    float sideS = smoothstep(0.55 - saa, 0.55 + saa, sb) * sideZone;
    float liner = 1.0 - smoothstep(0.004, 0.009, abs(H.y - 0.028 + (abs(H.x) - 0.1) * 0.45));
    liner *= smoothstep(0.096, 0.108, abs(H.x)) * smoothstep(0.16, 0.12, H.z) * smoothstep(0.04, 0.08, H.z);
    float lip = smoothstep(-0.072, -0.086, H.y) * smoothstep(0.17, 0.2, H.z);
    stripe = max(max(foreS, sideS), max(liner, lip));
  } else if (R < 2.5) {
    // Shoulders and thighs carry the flank's stripes; below them the legs are banded across.
    float outer = side * s;
    float front = step(0.0, P.z);
    float upper = smoothstep(mix(0.42, 0.52, front), mix(0.6, 0.7, front), P.y);
    float vy = clamp((P.y - mix(0.62, 0.72, front)) * 3.2, -1.0, 1.0);
    col = mix(orange, deep, smoothstep(0.3, 0.95, vy) * upper);
    col = mix(col, bright, (1.0 - upper) * 0.28);
    col = mix(col, cream, smoothstep(0.15, -0.55, outer) * (1.0 - upper * 0.7));
    col = mix(col, cream, smoothstep(-0.35, -0.9, v) * 0.5 * (1.0 - upper));
    col = mix(col, mix(orange, bright, 0.65), smoothstep(0.15, 0.07, P.y));
    col = mix(col, cream, smoothstep(0.045, 0.015, P.y) * 0.6);
    float ln = vnoise(vec2(P.y * 5.0 + side * 2.0 + front * 5.0, s * 1.7 + v * 1.3));
    float lb = sin((P.y * mix(12.5, 10.0, front) + (ln - 0.5) * 1.3 + v * 0.25) * 6.2832);
    float lt = smoothstep(-0.15, 0.45, outer) * smoothstep(mix(0.2, 0.3, front), mix(0.36, 0.48, front), P.y);
    float thr = mix(1.02, 0.42, lt);
    float aa = fwidth(lb) * 1.3 + 1e-4;
    float bands = smoothstep(thr - aa, thr + aa, lb);
    stripe = mix(bands, bodyStripe(P, vy, side) * smoothstep(-0.35, 0.15, outer), upper);
  } else if (R < 3.5) {
    col = mix(orange, cream, smoothstep(-0.2, -0.85, v) * 0.75);
    float tn = vnoise(vec2(a * 3.0, s * 1.5 + v));
    float tb = sin((a * 8.5 + (tn - 0.5) * 0.7) * 6.2832);
    float thr = mix(0.62, 0.05, smoothstep(0.15, 0.85, a));
    float aa = fwidth(tb) * 1.3 + 1e-4;
    stripe = smoothstep(thr - aa, thr + aa, tb) * smoothstep(0.05, 0.25, a);
    stripe = max(stripe, smoothstep(0.84, 0.88, a));
  } else if (R < 4.5) {
    float e = a / 0.024;
    col = mix(ink, mix(cream, bright, 0.45), smoothstep(0.72, 0.9, e));
    col = mix(col, cream, 1.0 - smoothstep(0.08, 0.16, e));
  } else if (R < 5.5) {
    float e = a / 0.028;
    col = ${C('#24170e')};
    col = mix(col, ${C('#c08419')}, smoothstep(0.55, 0.62, e));
    col = mix(col, ${C('#e3b440')}, smoothstep(0.72, 0.84, e) * 0.55);
    col = mix(col, ${C('#050403')}, smoothstep(0.89, 0.92, e));
  } else if (R < 6.5) {
    col = mix(${C('#5f1d1d')}, ${C('#b4595a')}, smoothstep(-0.2, 0.7, v));
  } else if (R < 7.5) {
    col = mix(${C('#b47467')}, ${C('#3a2320')}, smoothstep(-0.1, -0.6, v));
  } else if (R < 8.5) {
    col = ${C('#eee5d0')};
  } else if (R < 9.5) {
    col = cream;
    float ruff = smoothstep(0.085, 0.11, abs(H.x));
    col = mix(col, bright, smoothstep(-0.035, 0.02, H.y) * ruff * 0.55);
    float rb = sin((H.y * 25.0 - H.z * 12.0 + (vnoise(H.yz * 18.0) - 0.5) * 0.7) * 6.2832);
    float raa = fwidth(rb) * 1.3 + 1e-4;
    stripe = smoothstep(0.66 - raa, 0.66 + raa, rb) * ruff * smoothstep(-0.12, -0.04, H.y);
    vec2 g = vec2(H.x * 110.0, H.y * 85.0);
    float dots = 1.0 - smoothstep(0.16, 0.27, length(fract(g) - 0.5));
    dots *= smoothstep(0.205, 0.225, H.z) * smoothstep(0.012, 0.028, abs(H.x)) * step(0.45, hash12(floor(g)));
    stripe = max(stripe, dots);
  } else {
    col = mix(cream, ${C('#6b2323')}, smoothstep(0.28, 0.55, v));
  }

  col = mix(col, ink, stripe);
  if (R < 4.5 || R > 8.5) col *= 0.93 + 0.14 * vnoise(vec2(P.z * 64.0 + P.x * 23.0, P.y * 58.0 + v * 4.0));
  diffuseColor.rgb = col;
`;

/** Standard lit fur with a soft sheen at the silhouette and eyes that catch the light at dusk. */
export function tigerCoat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = coatUniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 coat;\nvarying vec4 vCoat;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = coat;\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vCoat;\nvarying vec3 vRest;\nuniform float uNight;\n${NOISE_GLSL}\n${STRIPES}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PAINT}`)
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = R == 5.0 ? 0.16 : R == 7.0 ? 0.5 : (R == 6.0 || R == 8.0) ? 0.36 : roughness;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sheen = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
        if (R < 4.5 || R > 8.5) totalEmissiveRadiance += diffuseColor.rgb * sheen * 0.34 * (1.0 - 0.8 * uNight);
        if (R == 5.0) {
          float e = a / 0.028;
          totalEmissiveRadiance += ${C('#cfe88a')} * uNight * 2.6 * smoothstep(0.55, 0.62, e);
          totalEmissiveRadiance += vec3(1.0) * 1.4 * (1.0 - smoothstep(0.0, 0.22, length(vec2(v - 0.45, s - 0.35)))) * step(0.8, e);
        }`
      );
  };
  m.customProgramCacheKey = () => 'tiger-coat';
  return m;
}
