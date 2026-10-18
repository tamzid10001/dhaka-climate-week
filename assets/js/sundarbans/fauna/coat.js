import * as THREE from 'three';
import { NOISE_GLSL, glslColor as C } from '../util.js';

/*
 * Coats painted in the fragment shader from the loft `coat` attribute: a = metres along the part,
 * v = vertical (−1 belly … 1 spine; front/back on limbs), s = side, R = region.
 * Regions: 0 body · 1 head · 2 legs · 3 tail · 4 ears · 5 eyes · 6 antler / mouth · 7 nose, hooves, teeth.
 */
export const coatUniforms = { uNight: { value: 0 } };

const PATTERNS = {
  deer: /* glsl */ `
    vec3 rufous = mix(${C('#94562b')}, ${C('#b97a42')}, smoothstep(0.6, -0.2, v));
    vec3 white = ${C('#efe8dc')};
    col = rufous;
    if (R == 0.0) {
      col = mix(col, ${C('#5b3a21')}, smoothstep(0.8, 0.96, v));
      vec2 g = vec2(a * 10.0, v * 5.0);
      vec2 cell = floor(g);
      vec2 o = vec2(hash12(cell), hash12(cell + 7.31)) - 0.5;
      float d = length(fract(g) - 0.5 - o * 0.45);
      float spot = 1.0 - smoothstep(0.15, 0.23, d);
      spot *= smoothstep(-0.38, -0.12, v) * (1.0 - smoothstep(0.7, 0.86, v)) * step(0.3, hash12(cell + 3.7));
      col = mix(col, white, spot * 0.92);
    }
    float underside = smoothstep(-0.42, -0.72, v);
    if (R == 0.0 || R == 3.0) col = mix(col, white, underside);
    if (R == 1.0) col = mix(mix(col, ${C('#6d4527')}, smoothstep(0.5, 0.95, v)), white, underside * smoothstep(0.05, 0.12, a));
    if (R == 2.0) col = mix(col, ${C('#cfae86')}, smoothstep(0.45, 0.75, a) * 0.6 + underside * 0.4);
    if (R == 4.0) col = mix(col, ${C('#e9d6c0')}, smoothstep(-0.2, -0.8, v));
    if (R == 5.0) col = ${C('#120d0a')};
    if (R == 6.0) col = mix(${C('#7d684c')}, ${C('#e6dbc4')}, smoothstep(0.32, 0.6, a));
    if (R == 7.0) col = ${C('#241e1a')};
  `,
  croc: /* glsl */ `
    vec3 top = ${C('#353a2b')};
    vec3 flank = ${C('#5b5d3f')};
    vec3 belly = ${C('#c7bb8f')};
    col = mix(top, flank, smoothstep(0.55, 0.0, v));
    col = mix(col, belly, smoothstep(-0.25, -0.62, v));
    float ang = atan(v, s);
    vec2 f = abs(fract(vec2(a * 8.0, ang * 2.6)) - 0.5);
    col *= 1.0 - smoothstep(0.4, 0.5, max(f.x, f.y)) * 0.38 * smoothstep(-0.35, 0.15, v);
    col *= 0.8 + 0.4 * vnoise(vec2(a * 3.0, ang * 1.6));
    if (R == 3.0) col *= 1.0 - 0.4 * smoothstep(0.5, 0.75, sin(a * 6.5)) * smoothstep(-0.2, 0.3, v);
    if (R == 5.0) col = ${C('#b5a83e')};
    if (R == 6.0) col = mix(belly, ${C('#d9a088')}, smoothstep(0.2, 0.6, v));
    if (R == 7.0) col = ${C('#ece4c8')};
  `,
  monkey: /* glsl */ `
    vec3 grey = ${C('#8b7a60')};
    col = mix(grey, ${C('#c9b796')}, smoothstep(-0.2, -0.7, v));
    if (R == 0.0) col = mix(col, ${C('#b0713f')}, smoothstep(0.16, 0.02, a) * smoothstep(-0.4, 0.2, v));
    if (R == 1.0) col = mix(col, ${C('#c78d7a')}, smoothstep(0.1, 0.16, a) * smoothstep(0.5, -0.1, v));
    if (R == 5.0) col = ${C('#1a120d')};
  `,
};

/* Animal eyes catch the dusk light like eyeshine. */
const EYESHINE = {
  deer: `if (R == 5.0) totalEmissiveRadiance += ${C('#e6f1c8')} * uNight * 2.2;`,
};

export function coatMaterial(kind, { roughness = 0.86 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = coatUniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 coat;\nvarying vec4 vCoat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = coat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vCoat;\nuniform float uNight;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float a = vCoat.x;
        float v = vCoat.y;
        float s = vCoat.z;
        float R = floor(vCoat.w + 0.5);
        vec3 col = vec3(1.0);
        ${PATTERNS[kind]}
        col *= 0.94 + 0.12 * vnoise(vec2(a * 34.0, v * 11.0 + s * 9.0));
        diffuseColor.rgb = col;`
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${EYESHINE[kind] || ''}`);
  };
  m.customProgramCacheKey = () => `coat-${kind}`;
  return m;
}

/** Flat vertex-coloured material for birds, boat and people. */
export const paintedMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });
