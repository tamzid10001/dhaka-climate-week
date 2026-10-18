import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
};

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];

/** Seeded 2D simplex noise, output roughly in −1…1. */
export function noise2D(seed = 1) {
  const r = rng(seed);
  const base = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const corner = (gi, x, y) => {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    t *= t;
    const g = (gi & 7) * 2;
    return t * t * (GRAD[g] * x + GRAD[g + 1] * y);
  };
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const ii = i & 255;
    const jj = j & 255;
    return (
      70 *
      (corner(p[ii + p[jj]], x0, y0) +
        corner(p[ii + i1 + p[jj + j1]], x0 - i1 + G2, y0 - j1 + G2) +
        corner(p[ii + 1 + p[jj + 1]], x0 - 1 + 2 * G2, y0 - 1 + 2 * G2))
    );
  };
}

/** Smooth interpolation through sorted [progress, value] stops. */
export function track(stops, p) {
  if (p <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const [p0, v0] = stops[i - 1];
      const [p1, v1] = stops[i];
      return lerp(v0, v1, smoothstep(p0, p1, p));
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * A smooth tube through super-elliptic sections ordered by increasing z — the body-building block for
 * every animal. Section: { z, w, h, x = 0, y = 0, p = 2 (squareness), bot = 1 (belly scale) }.
 * Writes a `coat` attribute (metres along the part, vertical −1…1, side −1…1, region id) that the
 * procedural fur/scale shaders read.
 */
export function loft(sections, { radial = 12, along0 = 0, region = 0, caps = true } = {}) {
  const ring = radial + 1;
  const pos = [];
  const coat = [];
  const idx = [];
  let along = along0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (i > 0) {
      const q = sections[i - 1];
      along += Math.hypot(s.z - q.z, (s.y || 0) - (q.y || 0), (s.x || 0) - (q.x || 0));
    }
    const e = 2 / (s.p || 2);
    for (let k = 0; k < ring; k++) {
      const a = (k / radial) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const cx = Math.sign(c) * Math.abs(c) ** e;
      const sy = Math.sign(sn) * Math.abs(sn) ** e;
      const hy = sy < 0 ? s.h * (s.bot ?? 1) : s.h;
      pos.push((s.x || 0) + cx * s.w, (s.y || 0) + sy * hy, s.z);
      coat.push(along, sn, c, region);
    }
  }
  const n = sections.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * ring + k;
      const b = a + ring;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    const s0 = sections[0];
    const s1 = sections[n - 1];
    const c0 = pos.length / 3;
    pos.push(s0.x || 0, s0.y || 0, s0.z);
    coat.push(along0, 0, 0, region);
    const c1 = pos.length / 3;
    pos.push(s1.x || 0, s1.y || 0, s1.z);
    coat.push(along, 0, 0, region);
    const last = (n - 1) * ring;
    for (let k = 0; k < radial; k++) {
      idx.push(c0, k + 1, k);
      idx.push(c1, last + k, last + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('coat', new THREE.Float32BufferAttribute(coat, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Weld the seam so smooth shading has no visible line down the side.
  const nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = i * ring;
    const b = a + radial;
    v.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
    nor.setXYZ(a, v.x, v.y, v.z);
    nor.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

/** A loft built along +z, turned to hang down −y from its origin (legs, necks, tails). */
export function limb(sections, opts) {
  const g = loft(sections, opts);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Concatenate geometries (attributes present in all of them), de-indexing as needed. */
export function merge(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(geos[0].attributes).filter((name) => geos.every((g) => g.attributes[name]));
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const total = geos.reduce((s, g) => s + g.attributes[name].count * size, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[o++] = a.getComponent(i, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/**
 * Vertex colours with a darker underside and a slightly brighter top, optionally jittered per face
 * (de-indexed geometry) so faceted foliage reads as leaf clusters.
 */
export function paint(geo, color, { under = 0.62, top = 1.06, jitter = 0, seed = 1 } = {}) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const nor = geo.attributes.normal;
  const count = geo.attributes.position.count;
  const col = new Float32Array(count * 3);
  const r = rng(seed);
  const perFace = !geo.index && jitter > 0;
  let j = 1;
  for (let i = 0; i < count; i++) {
    if (perFace ? i % 3 === 0 : jitter > 0) j = 1 + (r() - 0.5) * jitter;
    const ny = nor ? nor.getY(i) : 0;
    const k = (ny < 0 ? lerp(1, under, -ny) : lerp(1, top, ny)) * j;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A lumpy low-poly foliage cluster. Displacement is a function of position, so faces never crack. */
export function blob(radius, detail, seed, { squash = 1, lump = 0.22 } = {}) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const s = seed * 1.731;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius;
    const y = p.getY(i) / radius;
    const z = p.getZ(i) / radius;
    const d = 1 + lump * Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.3) * Math.sin(z * 3.7 + s * 0.7) * 2.2;
    p.setXYZ(i, x * radius * d, y * radius * d * squash, z * radius * d);
  }
  g.computeVertexNormals();
  return g;
}

/** Bark-coloured tapered trunk with a gentle lean, base at y = 0. */
export function trunk(height, r0, r1, { seg = 6, lean = 0, leanDir = 0, color = '#5a4b3c' } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, height, seg, 4, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    p.setX(i, p.getX(i) + lx * t * t);
    p.setZ(i, p.getZ(i) + lz * t * t);
  }
  g.computeVertexNormals();
  return paint(g.toNonIndexed(), color, { under: 0.9, top: 1, jitter: 0.12 });
}

/** Wind sway for instanced vegetation: bend grows with height², phase varies per instance. */
export function withWind(material, shared, bend = 0.0016) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 wOrigin = vec2(modelMatrix[3][0], modelMatrix[3][2]);
        #endif
        float wPh = dot(wOrigin, vec2(0.071, 0.053));
        float wH = max(position.y, 0.0);
        float wBend = wH * wH * ${bend.toFixed(5)} * uWind;
        float wS = sin(uTime * 0.85 + wPh) * 0.7 + sin(uTime * 2.2 + wPh * 2.3) * 0.3;
        transformed.x += wS * wBend;
        transformed.z += sin(uTime * 0.63 + wPh * 1.7) * wBend * 0.55;`
      );
  };
  material.customProgramCacheKey = () => `wind-${bend}`;
  return material;
}

/** Linear-space RGB of an sRGB colour as a GLSL vec3 literal. */
export const glslColor = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;
