import * as THREE from 'three';
import { TAU, rng, blob, trunk, paint, merge, withWind } from './util.js';
import { Z_START, Z_END, riverX, riverW, heightAt, meadowAt, charAt } from './terrain.js';

/*
 * The mangrove forest, by species: sundari (the tree the Sundarbans is named for: tall, buttressed,
 * dense dark crown), keora (weeping, light green, lines the newest mudflats), garjan (arching stilt
 * roots), gewa (a few leaves turned red), goran (shrubby understorey) and golpata, the nipa palm whose
 * fronds rise straight out of the mud at the water's edge. Plus pneumatophores, the breathing roots
 * that spike every mudflat, and grass on the clearings.
 */

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

const tone = (hex, r, h = 0.025, s = 0.08, l = 0.06) =>
  new THREE.Color(hex).offsetHSL((r() - 0.5) * h, (r() - 0.5) * s, (r() - 0.5) * l);

function leaves(radius, x, y, z, detail, seed, color, squash = 0.84) {
  const g = blob(radius, detail, seed, { squash });
  g.translate(x, y, z);
  return paint(g, color, { under: 0.52, top: 1.12, jitter: 0.24, seed });
}

function stick(a, b, r0, r1, color, seg = 5) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g.toNonIndexed(), color, { under: 0.85, top: 1, jitter: 0.1 });
}

function fin(angle, len, height, color) {
  const g = new THREE.BoxGeometry(len, height, 0.08);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;
    const y = p.getY(i) + height / 2;
    p.setXYZ(i, (y > height * 0.5 ? 0.05 : x) + 0.1, y - 0.06, p.getZ(i));
  }
  g.rotateY(angle);
  g.computeVertexNormals();
  return paint(g.toNonIndexed(), color, { under: 0.8, top: 1, jitter: 0.1 });
}

/** One nipa frond: a serrated, slightly folded ribbon arching up and out along +z. */
function frond(len, segs, r, colorA, colorB) {
  const pos = [];
  const col = [];
  const rows = [];
  const b1 = new V3(0, len * 0.78, len * 0.28);
  const b2 = new V3(0, len * 0.5 + r() * 0.4, len);
  const ca = new THREE.Color(colorA);
  const cb = new THREE.Color(colorB);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = 1 - t;
    const p = new V3(0, 0, 0).multiplyScalar(u * u).addScaledVector(b1, 2 * u * t).addScaledVector(b2, t * t);
    const tan = new V3().addScaledVector(b1, 2 * u).addScaledVector(new V3().subVectors(b2, b1), 2 * t).normalize();
    const side = new V3(1, 0, 0);
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.04)), 0.7) * len * 0.11 * (i % 2 ? 0.62 : 1);
    const lift = new V3().crossVectors(side, tan).normalize().multiplyScalar(w * 0.28);
    rows.push([p.clone().addScaledVector(side, -w).add(lift), p, p.clone().addScaledVector(side, w).add(lift), ca.clone().lerp(cb, t)]);
  }
  const push = (v, c) => {
    pos.push(v.x, v.y, v.z);
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < segs; i++) {
    const [l0, c0, r0, k0] = rows[i];
    const [l1, c1, r1, k1] = rows[i + 1];
    push(l0, k0); push(c0, k0); push(l1, k1);
    push(c0, k0); push(c1, k1); push(l1, k1);
    push(c0, k0); push(r0, k0); push(c1, k1);
    push(r0, k0); push(r1, k1); push(c1, k1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const SPECIES = {
  sundari(seed, lod) {
    const r = rng(seed);
    const H = 15 + r() * 3;
    const lean = 0.2 + r() * 0.5;
    const ld = r() * TAU;
    const lx = Math.cos(ld) * lean;
    const lz = Math.sin(ld) * lean;
    const parts = [trunk(H * 0.62, 0.3, 0.14, { seg: lod ? 5 : 7, lean, leanDir: ld, color: '#4d4943' })];
    if (!lod) for (let i = 0; i < 4; i++) parts.push(fin((i / 4) * TAU + r() * 0.5, 0.7 + r() * 0.35, 1.1 + r() * 0.6, '#47433d'));
    const leaf = '#2b5530';
    const d = lod ? 0 : 1;
    parts.push(leaves(2.8 + r() * 0.4, lx, H - 2, lz, d, seed + 1, tone('#33603a', r)));
    const n = lod ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.7;
      const rr = 2 + r() * 0.9;
      const y = H - 4.2 - r() * 2.2;
      parts.push(leaves(2.2 + r() * 0.7, lx + Math.cos(a) * rr, y, lz + Math.sin(a) * rr, d, seed + 2 + i, tone(leaf, r)));
      if (!lod && i % 2 === 0) parts.push(stick(new V3(lx * 0.4, H * 0.5, lz * 0.4), new V3(lx + Math.cos(a) * rr * 0.75, y - 0.6, lz + Math.sin(a) * rr * 0.75), 0.09, 0.045, '#4d4943'));
    }
    const low = lod ? 1 : 2;
    for (let i = 0; i < low; i++) {
      const a = r() * TAU;
      parts.push(leaves(1.7 + r() * 0.5, lx * 0.6 + Math.cos(a) * 2.4, H * 0.5 - r() * 1.2, lz * 0.6 + Math.sin(a) * 2.4, d, seed + 9 + i, tone('#264d2b', r)));
    }
    return merge(parts);
  },

  keora(seed, lod) {
    const r = rng(seed);
    const H = 11 + r() * 3;
    const lean = 0.6 + r() * 0.9;
    const ld = r() * TAU;
    const lx = Math.cos(ld) * lean;
    const lz = Math.sin(ld) * lean;
    const parts = [trunk(H * 0.66, 0.24, 0.1, { seg: lod ? 5 : 6, lean, leanDir: ld, color: '#6a5a48' })];
    const n = lod ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.8;
      const rr = 1.3 + r() * 2.2;
      const y = H * (0.44 + r() * 0.42);
      const c = tone(i % 3 === 0 ? '#7f9f4b' : '#5f8a40', r);
      parts.push(leaves(1.6 + r() * 0.7, lx + Math.cos(a) * rr, y, lz + Math.sin(a) * rr, lod ? 0 : 1, seed + i, c, 1.35));
      if (!lod) parts.push(stick(new V3(lx * 0.5, H * 0.55, lz * 0.5), new V3(lx + Math.cos(a) * rr, y + 0.6, lz + Math.sin(a) * rr), 0.07, 0.035, '#6a5a48'));
    }
    return merge(parts);
  },

  garjan(seed, lod) {
    const r = rng(seed);
    const H = 7 + r() * 2.5;
    const parts = [trunk(H * 0.78, 0.2, 0.1, { seg: lod ? 5 : 6, color: '#5b4a3b' })];
    const roots = lod ? 5 : 9;
    for (let i = 0; i < roots; i++) {
      const a = (i / roots) * TAU + r() * 0.5;
      const y0 = 1.5 + r() * 1.4;
      const R = 1.3 + r() * 1.2;
      const curve = new THREE.QuadraticBezierCurve3(
        new V3(Math.cos(a) * 0.12, y0, Math.sin(a) * 0.12),
        new V3(Math.cos(a) * R * 0.72, y0 + 0.45, Math.sin(a) * R * 0.72),
        new V3(Math.cos(a) * R, -0.25, Math.sin(a) * R)
      );
      parts.push(paint(new THREE.TubeGeometry(curve, lod ? 3 : 6, 0.055, 4, false).toNonIndexed(), '#5e4c3c', { under: 0.8, top: 1, jitter: 0.12 }));
    }
    const n = lod ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r();
      const rr = i === 0 ? 0 : 1.5 + r() * 0.8;
      parts.push(leaves(1.9 + r() * 0.7, Math.cos(a) * rr, H - 1.4 - (i ? r() * 2.4 : 0), Math.sin(a) * rr, lod ? 0 : 1, seed + i, tone('#2b5532', r)));
    }
    return merge(parts);
  },

  gewa(seed, lod) {
    const r = rng(seed);
    const H = 8 + r() * 2.5;
    const parts = [trunk(H * 0.7, 0.2, 0.09, { seg: lod ? 5 : 6, lean: 0.3, leanDir: r() * TAU, color: '#6b5e50' })];
    const n = lod ? 4 : 6;
    const red = seed % 2 === 1 ? 1 + Math.floor(r() * (n - 1)) : -1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r();
      const rr = i === 0 ? 0.2 : 1.4 + r() * 1.2;
      const c = i === red ? tone('#b8552f', r, 0.02, 0.1, 0.05) : tone('#41683a', r);
      parts.push(leaves(1.7 + r() * 0.8, Math.cos(a) * rr, H - 1.6 - r() * 2.8, Math.sin(a) * rr, lod ? 0 : 1, seed + i, c));
    }
    return merge(parts);
  },

  goran(seed) {
    const r = rng(seed);
    const parts = [];
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const rr = r() * 0.9;
      const y = 0.9 + r() * 1.5;
      parts.push(stick(new V3(0, 0, 0), new V3(Math.cos(a) * rr, y, Math.sin(a) * rr), 0.05, 0.03, '#5a4a3c', 4));
      parts.push(leaves(0.75 + r() * 0.45, Math.cos(a) * rr, y + 0.3, Math.sin(a) * rr, 0, seed + i, tone('#3e6c3b', r)));
    }
    return merge(parts);
  },

  nipa(seed, lod) {
    const r = rng(seed);
    const n = lod ? 6 : 10;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const len = 3.8 + r() * 3.2;
      const g = frond(len, lod ? 5 : 8, r, '#46703a', i % 2 ? '#8eaa4c' : '#749a43');
      g.rotateX(-0.1 - r() * 0.25);
      g.rotateY((i / n) * TAU + r() * 0.5);
      parts.push(g);
    }
    return merge(parts);
  },
};

function tuft(seed) {
  const r = rng(seed);
  const pos = [];
  const col = [];
  const base = new THREE.Color('#58702f');
  const tip = new THREE.Color('#b3b35f');
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const h = 0.32 + r() * 0.35;
    const lean = 0.08 + r() * 0.16;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(-s * 0.03, 0, c * 0.03, s * 0.03, 0, -c * 0.03, c * lean, h, s * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function pneumatophore() {
  const g = new THREE.ConeGeometry(0.028, 0.36, 4, 1, true).toNonIndexed();
  g.translate(0, 0.17, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color('#40372e');
  const b = new THREE.Color('#8d7d68');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, Math.min(1, p.getY(i) / 0.34));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new V3();
const ps = new V3();

function instanced(geo, material, items, { layer = 0, chunk = 150 } = {}) {
  const chunks = new Map();
  for (const it of items) {
    const k = Math.floor((Z_START - it.z) / chunk);
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push(it);
  }
  const meshes = [];
  for (const list of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      e.set(it.tx || 0, it.rot, it.tz || 0);
      q.setFromEuler(e);
      sc.set(it.s, it.s * (it.hs || 1), it.s);
      ps.set(it.x, it.y, it.z);
      m4.compose(ps, q, sc);
      mesh.setMatrixAt(i, m4);
      if (it.c) mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (layer) mesh.layers.set(layer);
    meshes.push(mesh);
  }
  return meshes;
}

export function createFlora({ density = 1 } = {}) {
  const shared = { uTime: { value: 0 }, uWind: { value: 1 } };
  const treeMat = withWind(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), shared, 0.0009);
  const palmMat = withWind(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), shared, 0.011);
  const grassMat = withWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), shared, 0.22);
  const rootMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const r = rng(99);
  const items = { sundari: [], keora: [], garjan: [], gewa: [], goran: [], nipa: [], grass: [], roots: [] };
  const hosts = [];
  const tint = () => new THREE.Color().setRGB(0.86 + r() * 0.26, 0.86 + r() * 0.28, 0.86 + r() * 0.22);
  const add = (sp, x, y, z, s, extra) => items[sp].push({ x, y, z, rot: r() * TAU, s, c: tint(), ...extra });

  const bands = [
    { b0: 3, b1: 10, cz: 5, cb: 4, pick: () => (r() < 0.74 ? 'nipa' : null) },
    { b0: 9, b1: 19, cz: 5.5, cb: 5, pick: () => { const v = r(); return v < 0.36 ? 'keora' : v < 0.66 ? 'garjan' : v < 0.8 ? 'nipa' : 'goran'; } },
    { b0: 18, b1: 40, cz: 6.5, cb: 6.5, pick: () => { const v = r(); return v < 0.5 ? 'sundari' : v < 0.75 ? 'gewa' : v < 0.87 ? 'keora' : 'goran'; } },
    { b0: 40, b1: 70, cz: 8, cb: 8, lod: true, scale: [1.15, 1.55], pick: () => { const v = r(); return v < 0.6 ? 'sundari' : v < 0.85 ? 'gewa' : 'keora'; } },
    { b0: 70, b1: 180, cz: 12, cb: 12, lod: true, scale: [1.35, 1.85], pick: () => { const v = r(); return v < 0.62 ? 'sundari' : v < 0.86 ? 'gewa' : 'keora'; } },
    { b0: 180, b1: 540, cz: 18, cb: 18, lod: true, far: true, scale: [1.7, 2.4], pick: () => (r() < 0.8 ? 'sundari' : 'gewa') },
  ];

  for (const side of [-1, 1]) {
    for (const band of bands) {
      for (let z = Z_START; z > Z_END; z -= band.cz) {
        for (let b = band.b0; b < band.b1; b += band.cb) {
          if (r() > (band.far ? Math.max(density, 0.6) : density)) continue;
          const zz = z - r() * band.cz;
          const bb = b + r() * band.cb;
          const x = riverX(zz) + side * (riverW(zz) + bb);
          const m = meadowAt(x, zz);
          const h = heightAt(x, zz);
          if (m > 0.2) {
            if (m < 0.6 && band.b0 < 62 && r() < 0.3) {
              add('keora', x, h - 0.1, zz, 0.85 + r() * 0.3, { near: true });
              hosts.push(new V3(x, h + 7, zz));
            }
            continue;
          }
          if (h < (band.b0 < 9 ? 0.05 : 0.45)) continue;
          const sp = band.pick();
          if (!sp) continue;
          const s = band.scale ? band.scale[0] + r() * (band.scale[1] - band.scale[0]) : 0.85 + r() * 0.4;
          add(sp, x, h - 0.1, zz, s, { lod: !!band.lod, hs: sp === 'sundari' ? 0.9 + r() * 0.25 : 1 });
          if ((sp === 'keora' || sp === 'garjan') && band.b0 < 20) hosts.push(new V3(x, h + (sp === 'keora' ? 8 : 5), zz));
        }
      }
      // Understorey shrubs along the forest front.
      for (let z = Z_START; z > Z_END; z -= 2.6) {
        if (r() > density * 0.9) continue;
        const zz = z - r() * 2.6;
        const bb = 9 + r() * 34;
        const x = riverX(zz) + side * (riverW(zz) + bb);
        const h = heightAt(x, zz);
        if (h < 0.5 || meadowAt(x, zz) > 0.2) continue;
        add('goran', x, h - 0.05, zz, 0.8 + r() * 0.6);
      }
      // Breathing roots across the mudflats; grass on the clearings.
      for (let z = Z_START; z > Z_END; z -= 1.7) {
        for (let b = 1; b < 17; b += 1.7) {
          const zz = z - r() * 1.7;
          const bb = b + r() * 1.7;
          const x = riverX(zz) + side * (riverW(zz) + bb);
          const h = heightAt(x, zz);
          const m = meadowAt(x, zz);
          if (m > 0.3) {
            if (r() < density * 0.9) items.grass.push({ x, y: h - 0.02, z: zz, rot: r() * TAU, s: 0.8 + r() * 0.8, c: tint() });
            continue;
          }
          if (h < -0.04 || h > 1.35 || r() > density * 0.82) continue;
          items.roots.push({ x, y: h - 0.03, z: zz, rot: r() * TAU, s: 0.7 + r() * 0.8, hs: 0.7 + r() * 0.9, tx: (r() - 0.5) * 0.25, tz: (r() - 0.5) * 0.25 });
        }
      }
    }
  }
  // Islands: a carpet of roots, young keora on the downstream end, golpata clumps at the tips. The
  // upstream half stays open; it is where the tiger walks.
  for (const c of CHARS) {
    const cx = riverX(c.z) + c.off;
    for (let i = 0; i < 1500 * Math.max(density, 0.5); i++) {
      const a = r() * TAU;
      const rad = Math.sqrt(r()) * 0.86;
      const x = cx + Math.cos(a) * rad * c.rx;
      const z = c.z + Math.sin(a) * rad * c.rz;
      const h = heightAt(x, z);
      if (h < -0.02) continue;
      if (rad < 0.55 && r() < 0.6) continue;
      items.roots.push({ x, y: h - 0.03, z, rot: r() * TAU, s: 0.7 + r() * 0.8, hs: 0.6 + r() * 1, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 });
    }
    for (let i = 0; i < 7; i++) {
      const t = 0.15 + r() * 0.65;
      const x = cx + (r() - 0.5) * c.rx * 0.9;
      const z = c.z - t * c.rz;
      const h = heightAt(x, z);
      if (h < 0.08) continue;
      add(i < 5 ? 'keora' : 'garjan', x, h - 0.1, z, 0.38 + r() * 0.22);
      if (i < 5) hosts.push(new V3(x, h + 3.5, z));
    }
    for (const end of [-1, 1]) {
      const z = c.z + end * c.rz * 0.78;
      add('nipa', cx + (r() - 0.5) * 2, heightAt(cx, z) - 0.05, z, 0.8 + r() * 0.3);
    }
  }

  const group = new THREE.Group();
  for (const sp of ['sundari', 'keora', 'garjan', 'gewa', 'nipa']) {
    const near = [SPECIES[sp](11 + sp.length * 7, false), SPECIES[sp](53 + sp.length * 3, false)];
    const far = SPECIES[sp](97 + sp.length, true);
    const mat = sp === 'nipa' ? palmMat : treeMat;
    const nearA = items[sp].filter((it, i) => !it.lod && i % 2 === 0);
    const nearB = items[sp].filter((it, i) => !it.lod && i % 2 === 1);
    const lod = items[sp].filter((it) => it.lod);
    for (const [geo, list] of [[near[0], nearA], [near[1], nearB], [far, lod]]) {
      if (list.length) instanced(geo, mat, list).forEach((m) => group.add(m));
    }
  }
  instanced(SPECIES.goran(7, false), treeMat, items.goran, { layer: 1 }).forEach((m) => group.add(m));
  instanced(tuft(3), grassMat, items.grass, { layer: 1 }).forEach((m) => group.add(m));
  instanced(pneumatophore(), rootMat, items.roots, { layer: 1, chunk: 120 }).forEach((m) => group.add(m));

  return {
    group,
    hosts,
    update(time, wind) {
      shared.uTime.value = time;
      shared.uWind.value = wind;
    },
  };
}

