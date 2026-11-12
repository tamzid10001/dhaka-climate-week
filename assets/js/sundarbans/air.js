import * as THREE from 'three';

/*
 * The air between the camera and the forest. The page sets its type straight onto the scene, so the land
 * has to stay inside a tonal range the ink can read against: that is the job of the river mist. Rather
 * than one flat wash over the frame, every lit material mixes toward the air's colour by its own
 * distance and height: near crowns keep their green, the far forest dissolves into haze, and a low bank
 * of mist drifts over the water. `uAir` carries the page's floor (x, near) and ceiling (y, far), a
 * switch (z, off during the water's mirror pass, which must reflect the forest itself) and time (w).
 */
export const airUniforms = {
  uAirColor: { value: new THREE.Color() },
  uAir: { value: new THREE.Vector4(0, 0, 1, 0) },
};

export const AIR_PARS_GLSL = /* glsl */ `
uniform vec3 uAirColor;
uniform vec4 uAir;
float airHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float airNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(airHash(i), airHash(i + vec2(1.0, 0.0)), u.x), mix(airHash(i + vec2(0.0, 1.0)), airHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* Share of the air's colour over a surface depth metres away at world position wp. */
float airAmount(float depth, vec3 wp) {
  float reach = 1.0 - exp(-depth * 0.0085);
  float m = mix(uAir.x, uAir.y, reach);
  // River mist: a shallow layer over the water that thins with height and drifts downstream.
  vec2 drift = wp.xz * 0.021 + vec2(uAir.w * 0.014, uAir.w * 0.03);
  float bank = airNoise(drift) * 0.65 + airNoise(drift * 2.7 + 5.0) * 0.35;
  float layer = exp(-max(wp.y - 0.4, 0.0) * 0.42) * smoothstep(0.3, 0.8, bank) * smoothstep(6.0, 70.0, depth);
  m += layer * uAir.y * 0.42;
  return clamp(m, 0.0, 0.95) * uAir.z;
}
`;

/* Applied after fog, in the output colour space, like three.js' own fog. */
const AIR_FRAG = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 airOut = linearToOutputTexel(vec4(uAirColor, 1.0)).rgb;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, airOut, airAmount(vFogDepth, vAirPos));
  }
#endif
`;

const AIR_VERT = /* glsl */ `
#include <fog_vertex>
#ifdef USE_FOG
  {
    vec4 airP = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      airP = instanceMatrix * airP;
    #endif
    vAirPos = (modelMatrix * airP).xyz;
  }
#endif
`;

/** Give a built-in material the air: a varying for the world position and the mix after its fog. */
export function withAir(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uAirColor = airUniforms.uAirColor;
    shader.uniforms.uAir = airUniforms.uAir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vAirPos;\n#endif')
      .replace('#include <fog_vertex>', AIR_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying vec3 vAirPos;\n${AIR_PARS_GLSL}\n#endif`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${AIR_FRAG}`);
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key ? key.call(material) : material.type}|air`;
  return material;
}
