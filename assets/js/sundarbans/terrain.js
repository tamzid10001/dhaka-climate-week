import * as THREE from 'three';
import { noise2D, smoothstep, lerp, clamp } from './util.js';

/*
 * Geography of the journey: one tidal river (a "gang") meandering south (−z) between mudflat banks and
 * mangrove forest, with mud islands (chars) and grassy clearings where deer graze. Everything else
 * (forest placement, animal paths, the water shader's shore line) reads from these functions.
 */

export const Z_START = 140;
export const Z_END = -1260;

const n1 = noise2D(11);
const n2 = noise2D(23);
const n3 = noise2D(41);

export const riverX = (z) => 30 * Math.sin(z * 0.0047 + 0.6) + 16 * Math.sin(z * 0.0113 + 2.1) + 5 * Math.sin(z * 0.029 + 0.4);
export const riverW = (z) => 44 + 12 * Math.sin(z * 0.0061 + 1.2) + 6 * Math.sin(z * 0.019 + 0.3);
export const RIVER_GLSL = /* glsl */ `
float riverX(float z) { return 30.0 * sin(z * 0.0047 + 0.6) + 16.0 * sin(z * 0.0113 + 2.1) + 5.0 * sin(z * 0.029 + 0.4); }
`;

/** Mud islands in the channel: { z, off (from the river centre), rx, rz, h }. */
export const CHARS = [
  { z: -26, off: -6, rx: 7.5, rz: 22, h: 0.6 },
  { z: -430, off: 16, rx: 7, rz: 22, h: 0.5 },
  { z: -705, off: -12, rx: 8, rz: 30, h: 0.55 },
];

/** Open mudflat and grass clearings on a bank (side −1 left, 1 right): deer, monkeys, egrets. */
export const MEADOWS = [
  { z: -118, side: 1, len: 62, depth: 40 },
  { z: -272, side: -1, len: 56, depth: 32 },
  { z: -560, side: 1, len: 50, depth: 30 },
  { z: -838, side: -1, len: 60, depth: 34 },
];

export function meadowAt(x, z) {
  const s = x - riverX(z);
  const b = Math.abs(s) - riverW(z);
  let m = 0;
  for (const md of MEADOWS) {
    if (Math.sign(s) !== md.side) continue;
    const dz = Math.abs(z - md.z) / md.len;
    if (dz > 1.4) continue;
    const k = (1 - smoothstep(0.65, 1.3, dz)) * (1 - smoothstep(md.depth * 0.7, md.depth * 1.25, b)) * smoothstep(1, 6, b);
    m = Math.max(m, k);
  }
  return m;
}

export function charAt(x, z) {
  let best = 0;
  for (const c of CHARS) {
    const cx = riverX(c.z) + c.off;
    const e = ((x - cx) / c.rx) ** 2 + ((z - c.z) / c.rz) ** 2;
    if (e < 1.2) best = Math.max(best, 1 - smoothstep(0, 1, e));
  }
  return best;
}

export function heightAt(x, z) {
  const xc = riverX(z);
  const w = riverW(z);
  const d = Math.abs(x - xc);
  const micro = n1(x * 0.05, z * 0.05) * 0.2 + n2(x * 0.17, z * 0.17) * 0.06;
  let h;
  if (d < w) {
    const t = d / w;
    h = -3.4 * (1 - t * t) - 0.3 + micro * 0.4;
  } else {
    const b = d - w;
    const bank = smoothstep(0, 18, b);
    h = lerp(-0.3, 1.25, bank) + micro * (0.25 + bank) + n3(x * 0.011, z * 0.011) * 0.4 * bank;
  }
  const m = meadowAt(x, z);
  if (m > 0) h = lerp(h, 0.82 + micro * 0.25, m);
  for (const c of CHARS) {
    const cx = riverX(c.z) + c.off;
    const e = ((x - cx) / c.rx) ** 2 + ((z - c.z) / c.rz) ** 2;
    if (e < 1.3) {
      const k = 1 - smoothstep(0, 1, e);
      h = Math.max(h, lerp(-0.7, c.h, Math.sqrt(k)) + micro * 0.2 * k);
    }
  }
  return h;
}

/** Signed distance onto the bank (negative in the river) and which side. */
export function bankAt(x, z) {
  const s = x - riverX(z);
  return { b: Math.abs(s) - riverW(z), side: s < 0 ? -1 : 1 };
}

/** World x of a point `b` metres onto the bank on `side`. */
export const bankX = (z, side, b) => riverX(z) + side * (riverW(z) + b);

const MUD_DEEP = new THREE.Color('#3a3128');
const MUD_WET = new THREE.Color('#4d4133');
const MUD = new THREE.Color('#6c5a45');
const MUD_DRY = new THREE.Color('#7b6850');
const FLOOR = new THREE.Color('#3d3d25');
const FLOOR_LITTER = new THREE.Color('#4f4a2c');
const GRASS = new THREE.Color('#7d8f45');
const GRASS_DRY = new THREE.Color('#9a9a58');

/**
 * The ground: a river-aligned grid, dense where the banks and islands need detail and sparse far into
 * the forest. A `wet` attribute lets the mud at the waterline catch the sun.
 */
export function createTerrain() {
  const inner = [];
  for (let i = 0; i <= 28; i++) inner.push(-1 + (i / 28) * 2);
  const bankOffsets = [0, 1, 2, 3, 4, 5, 6.5, 8, 10, 12.5, 15, 18, 22, 27, 33, 40, 48, 58, 72, 90, 112, 140, 180, 230, 290, 360, 440, 540];
  const rows = [];
  for (let z = Z_START; z >= Z_END; z -= 2.5) rows.push(z);

  const cols = inner.length + bankOffsets.length * 2 - 2;
  const pos = new Float32Array(rows.length * cols * 3);
  const col = new Float32Array(rows.length * cols * 3);
  const wet = new Float32Array(rows.length * cols);
  const c = new THREE.Color();
  let v = 0;
  for (const z of rows) {
    const xc = riverX(z);
    const w = riverW(z);
    const xs = [];
    for (let i = bankOffsets.length - 1; i >= 1; i--) xs.push(xc - w - bankOffsets[i]);
    for (const t of inner) xs.push(xc + t * w);
    for (let i = 1; i < bankOffsets.length; i++) xs.push(xc + w + bankOffsets[i]);
    for (const x of xs) {
      const h = heightAt(x, z);
      pos[v * 3] = x;
      pos[v * 3 + 1] = h;
      pos[v * 3 + 2] = z;
      const m = meadowAt(x, z);
      const tint = n1(x * 0.03, z * 0.03) * 0.5 + 0.5;
      if (h < -0.15) c.copy(MUD_DEEP).lerp(MUD_WET, smoothstep(-1.6, -0.15, h));
      else if (h < 0.45) c.copy(MUD_WET).lerp(MUD, smoothstep(-0.15, 0.45, h));
      else if (h < 1.05) c.copy(MUD).lerp(MUD_DRY, smoothstep(0.45, 1.05, h) * tint);
      else c.copy(MUD_DRY).lerp(FLOOR, smoothstep(1.05, 1.5, h)).lerp(FLOOR_LITTER, tint * 0.5);
      if (m > 0) c.lerp(GRASS, m * smoothstep(0.3, 0.7, h)).lerp(GRASS_DRY, m * tint * 0.35);
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      wet[v] = 1 - smoothstep(-0.05, 0.75, h) * (1 - m * 0.2);
      v++;
    }
  }
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = r * cols + k;
      const b = a + cols;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wet;\nvarying float vWet;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWet;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.97, 0.32, vWet);');
  };
  material.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = false;
  return mesh;
}

/** River-aligned height texture for the water shader: s ∈ [−HMAP_HALF, HMAP_HALF] across, z along. */
export const HMAP_HALF = 140;
export function createHeightTexture(width = 256, height = 1024) {
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    const z = Z_START + ((j + 0.5) / height) * (Z_END - Z_START);
    const xc = riverX(z);
    for (let i = 0; i < width; i++) {
      const s = ((i + 0.5) / width) * 2 * HMAP_HALF - HMAP_HALF;
      data[j * width + i] = Math.round(clamp((heightAt(xc + s, z) + 4) / 8) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
