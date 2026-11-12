import * as THREE from 'three';
import { TAU, rng, paint, merge, withWind, lerp, clamp, smoothstep, noise2D } from './util.js';
import { Z_START, Z_END, CHARS, riverX, riverW, heightAt, meadowAt } from './terrain.js';
import { createLeafAtlas } from './atlas.js';
import { withAir } from './air.js';

/*
 * The mangrove forest, by species: sundari (the tree the Sundarbans is named for: tall, buttressed,
 * dense dark crown), keora (weeping, pale green, lines the newest mudflats), garjan (arching stilt
 * roots), gewa (a few leaves turned red), goran (shrubby understorey) and golpata, the nipa palm whose
 * fronds rise straight out of the mud at the water's edge. Plus pneumatophores, the breathing roots
 * that spike every mudflat, and grass on the clearings.
 *
 * Every crown is a cloud of cards, each showing one painted leaf cluster from the atlas. The cards take
 * their shading normal from the crown as a whole, so a tree lights like one soft volume, while the
 * leaves give it a real edge, light through the canopy and shadow beneath it.
 */

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
/** Where bank trees hand over to their distant form: the haze is ~60% and a tree under 50px tall. */
const DETAIL_REACH = 450;

const tone = (hex, r, h = 0.025, s = 0.08, l = 0.06) =>
  new THREE.Color(hex).offsetHSL((r() - 0.5) * h, (r() - 0.5) * s, (r() - 0.5) * l);
/** Vertex tint for leaf cards: near white (the atlas carries the colour), with a little drift per cluster. */
const leafTint = (r, l = 0.1) => new THREE.Color('#f4f6f0').offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.08, (r() - 0.5) * l);

let atlas = null;
/** Quality knobs set by createFlora: cards per crown cluster, near and far. */
const Q = { cards: 7, farCards: 3, coreDetail: 1, reach: 800 };

/** Map a geometry's 0…1 uv square onto one atlas cell. */
function cellUV(geo, rect) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(rect[0], rect[2], uv.getX(i)), lerp(rect[1], rect[3], uv.getY(i)));
  return geo;
}

/** A trunk: smooth, slightly leaning, flaring into the mud. Base at y = 0. */
function bole(height, r0, r1, { seg = 8, lean = 0, leanDir = 0, color = '#cbbfb2', flare = 0.45, rows = 6 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, height, seg, rows, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    const k = 1 + flare * Math.exp(-t * 9);
    p.setX(i, p.getX(i) * k + lx * t * t);
    p.setZ(i, p.getZ(i) * k + lz * t * t);
  }
  g.computeVertexNormals();
  cellUV(g, atlas.rects.bark[0]);
  return paint(g.toNonIndexed(), color, { under: 0.9, top: 1 });
}

function stick(a, b, r0, r1, color, seg = 5) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  cellUV(g, atlas.rects.bark[0]);
  return paint(g.toNonIndexed(), color, { under: 0.85, top: 1 });
}

/** A buttress: a thin plank rising from the mud into the trunk, its top edge sweeping up. */
function fin(angle, len, height, color) {
  const g = new THREE.BoxGeometry(len, height, 0.07, 3, 3, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;
    const y = p.getY(i) + height / 2;
    const t = x / len;
    // The plank's outer edge drops along a curve, so the fin is tall against the trunk and thin at its toe.
    const top = height * (1 - t * t * 0.92);
    p.setXYZ(i, x + 0.12, Math.min(y, top) - 0.1, p.getZ(i) * (1 - t * 0.5));
  }
  g.rotateY(angle);
  g.computeVertexNormals();
  cellUV(g, atlas.rects.bark[0]);
  return paint(g.toNonIndexed(), color, { under: 0.85, top: 1 });
}

/**
 * Leaf cards for a set of crown clusters. Each cluster becomes `count` quads scattered inside its
 * radius, randomly turned; every vertex carries the crown's ellipsoid normal (blended with the card's
 * own), an occlusion shade that darkens toward the heart and foot of the crown, and one atlas cell.
 */
function crownCards(r, clusters, count, cell, { squash = 1, spread = 0.6, size = 1.05, far = false, core = 0.44 } = {}) {
  // `core` 0 leaves the crown without an interior (low shrubs stand against mud, not sky).
  if (far) {
    spread *= 0.7;
    size *= 1.45;
  }
  const lo = new V3(Infinity, Infinity, Infinity);
  const hi = new V3(-Infinity, -Infinity, -Infinity);
  for (const cl of clusters) {
    lo.min(new V3(cl.c.x - cl.R, cl.c.y - cl.R * squash, cl.c.z - cl.R));
    hi.max(new V3(cl.c.x + cl.R, cl.c.y + cl.R * squash, cl.c.z + cl.R));
  }
  const centre = new V3().addVectors(lo, hi).multiplyScalar(0.5);
  const radii = new V3().subVectors(hi, lo).multiplyScalar(0.5).max(new V3(0.6, 0.6, 0.6));
  const pos = [];
  const nor = [];
  const uvs = [];
  const col = [];
  const p = new V3();
  const n = new V3();
  const t = new V3();
  const b = new V3();
  const q = new V3();
  const sn = new V3();
  const cn = new V3();
  const c = new THREE.Color();
  for (const cl of clusters) {
    const rect = atlas.pick(cell, r);
    for (let k = 0; k < count; k++) {
      const u = r() * 2 - 1;
      const ph = r() * TAU;
      const s = Math.sqrt(1 - u * u);
      const d = cl.R * spread * Math.cbrt(r());
      p.set(cl.c.x + s * Math.cos(ph) * d, cl.c.y + u * d * squash, cl.c.z + s * Math.sin(ph) * d);
      // Card orientation: a random normal, turned a random angle about itself.
      const u2 = r() * 2 - 1;
      const ph2 = r() * TAU;
      const s2 = Math.sqrt(1 - u2 * u2);
      n.set(s2 * Math.cos(ph2), u2, s2 * Math.sin(ph2));
      t.crossVectors(n, Math.abs(n.y) < 0.9 ? UP : new V3(1, 0, 0)).normalize();
      b.crossVectors(n, t).normalize();
      const spin = r() * TAU;
      const cs = Math.cos(spin);
      const si = Math.sin(spin);
      const right = new V3().addScaledVector(t, cs).addScaledVector(b, si);
      const up = new V3().addScaledVector(t, -si).addScaledVector(b, cs);
      const half = cl.R * size * (0.8 + r() * 0.4) * 0.5;
      const aspect = 0.9 + r() * 0.2;
      const flip = r() < 0.5;
      const corners = [
        [-half * aspect, -half, flip ? rect[2] : rect[0], rect[1]],
        [half * aspect, -half, flip ? rect[0] : rect[2], rect[1]],
        [half * aspect, half, flip ? rect[0] : rect[2], rect[3]],
        [-half * aspect, half, flip ? rect[2] : rect[0], rect[3]],
      ];
      // Which way the card faces relative to the crown decides which side its normal keeps.
      cn.set((p.x - centre.x) / radii.x, (p.y - centre.y) / radii.y, (p.z - centre.z) / radii.z);
      const face = cn.dot(n) < 0 ? -1 : 1;
      const verts = corners.map(([rx, ry, uu, vv]) => {
        q.copy(p).addScaledVector(right, rx).addScaledVector(up, ry);
        sn.set((q.x - centre.x) / (radii.x * radii.x), (q.y - centre.y) / (radii.y * radii.y), (q.z - centre.z) / (radii.z * radii.z)).normalize();
        sn.addScaledVector(n, 0.3 * face).normalize();
        const dist = Math.hypot((q.x - centre.x) / radii.x, (q.y - centre.y) / radii.y, (q.z - centre.z) / radii.z);
        const heart = lerp(0.62, 1.0, smoothstep(0.1, 0.95, dist));
        const foot = lerp(0.86, 1.04, clamp((q.y - lo.y) / Math.max(0.5, hi.y - lo.y)));
        c.copy(cl.tint).multiplyScalar(heart * foot);
        return [q.x, q.y, q.z, sn.x, sn.y, sn.z, uu, vv, c.r, c.g, c.b];
      });
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const v = verts[i];
        pos.push(v[0], v[1], v[2]);
        nor.push(v[3], v[4], v[5]);
        uvs.push(v[6], v[7]);
        col.push(v[8], v[9], v[10]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (!core) return g;
  // The crown's dark interior: one shaded blob per cluster, so gaps between cards show leaves, not sky.
  const cores = clusters.map((cl) => {
    const b = new THREE.IcosahedronGeometry(1, far || Q.coreDetail === 0 ? 0 : 1);
    const bp = b.attributes.position;
    const cc = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const y = bp.getY(i);
      const z = bp.getZ(i);
      const lump = 1 + 0.22 * Math.sin(x * 4.1 + cl.c.x) * Math.sin(y * 3.3 + cl.c.y) * Math.sin(z * 3.7 + cl.c.z);
      bp.setXYZ(i, cl.c.x + x * cl.R * core * lump, cl.c.y + y * cl.R * core * squash * lump, cl.c.z + z * cl.R * core * lump);
      const k = (0.86 + 0.14 * (y * 0.5 + 0.5)) * lerp(0.92, 1, r());
      cc[i * 3] = cl.tint.r * k;
      cc[i * 3 + 1] = cl.tint.g * k;
      cc[i * 3 + 2] = cl.tint.b * k;
    }
    // The icosahedron's own uvs are already corrected per triangle at the seam.
    cellUV(b, atlas.rects.core[0]);
    b.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const bn = b.attributes.normal;
    for (let i = 0; i < bp.count; i++) bn.setXYZ(i, (bp.getX(i) - cl.c.x) / cl.R, (bp.getY(i) - cl.c.y) / (cl.R * squash), (bp.getZ(i) - cl.c.z) / cl.R);
    b.normalizeNormals();
    return b;
  });
  return merge([g, ...cores]);
}

/** One nipa frond: a ribbon arching up and out along +z, wearing a painted leaflet strip. */
function frond(len, segs, r, rect) {
  const pos = [];
  const nor = [];
  const uvs = [];
  const col = [];
  const b1 = new V3(0, len * (0.72 + r() * 0.12), len * 0.3);
  const b2 = new V3(0, len * (0.42 + r() * 0.3), len);
  const half = len * 0.145;
  const roll = (r() - 0.5) * 0.6;
  const rows = [];
  const p = new V3();
  const tan = new V3();
  const side = new V3();
  const up = new V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = 1 - t;
    p.set(0, 0, 0).multiplyScalar(u * u).addScaledVector(b1, 2 * u * t).addScaledVector(b2, t * t);
    tan.copy(b1).multiplyScalar(2 * u).addScaledVector(new V3().subVectors(b2, b1), 2 * t).normalize();
    side.set(1, 0, 0);
    up.crossVectors(side, tan).normalize();
    // The blade rolls a little along its length so fronds catch light differently.
    const a = roll * t;
    const sx = new V3().addScaledVector(side, Math.cos(a)).addScaledVector(up, Math.sin(a));
    const nx = new V3().addScaledVector(up, Math.cos(a)).addScaledVector(side, -Math.sin(a));
    const shade = lerp(0.72, 1.0, t) ;
    rows.push({ l: p.clone().addScaledVector(sx, -half), rr: p.clone().addScaledVector(sx, half), n: nx.clone(), u: lerp(rect[0], rect[2], t), shade });
  }
  const push = (v, n, uu, vv, k) => {
    pos.push(v.x, v.y, v.z);
    nor.push(n.x, n.y, n.z);
    uvs.push(uu, vv);
    col.push(k, k, k);
  };
  for (let i = 0; i < segs; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    push(a.l, a.n, a.u, rect[1], a.shade); push(a.rr, a.n, a.u, rect[3], a.shade); push(b.rr, b.n, b.u, rect[3], b.shade);
    push(a.l, a.n, a.u, rect[1], a.shade); push(b.rr, b.n, b.u, rect[3], b.shade); push(b.l, b.n, b.u, rect[1], b.shade);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
    const parts = [bole(H * 0.62, 0.32, 0.15, { seg: lod ? 6 : 9, rows: lod ? 1 : 6, lean, leanDir: ld, color: '#dad5cd', flare: 0.5 })];
    if (!lod) for (let i = 0; i < 4; i++) parts.push(fin((i / 4) * TAU + r() * 0.6, 0.9 + r() * 0.5, 1.3 + r() * 0.7, '#cbc5bd'));
    const clusters = [{ c: new V3(lx, H - 2, lz), R: 2.9 + r() * 0.4, tint: leafTint(r) }];
    const n = lod ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.7;
      const rr = 2 + r() * 0.9;
      const y = H - 4.2 - r() * 2.2;
      const c = new V3(lx + Math.cos(a) * rr, y, lz + Math.sin(a) * rr);
      clusters.push({ c, R: 2.3 + r() * 0.7, tint: leafTint(r) });
      if (!lod && i % 2 === 0) parts.push(stick(new V3(lx * 0.4, H * 0.5, lz * 0.4), c.clone().multiply(new V3(0.78, 1, 0.78)).setY(y - 0.5), 0.1, 0.05, '#d2ccc4'));
    }
    const low = lod ? 1 : 2;
    for (let i = 0; i < low; i++) {
      const a = r() * TAU;
      clusters.push({ c: new V3(lx * 0.6 + Math.cos(a) * 2.4, H * 0.5 - r() * 1.2, lz * 0.6 + Math.sin(a) * 2.4), R: 1.7 + r() * 0.5, tint: leafTint(r).multiplyScalar(0.88) });
    }
    parts.push(crownCards(r, clusters, lod ? Q.farCards : Q.cards, 'sundari', { squash: 0.86, far: lod }));
    return merge(parts);
  },

  keora(seed, lod) {
    const r = rng(seed);
    const H = 11 + r() * 3;
    const lean = 0.6 + r() * 0.9;
    const ld = r() * TAU;
    const lx = Math.cos(ld) * lean;
    const lz = Math.sin(ld) * lean;
    const parts = [bole(H * 0.66, 0.25, 0.1, { seg: lod ? 6 : 8, rows: lod ? 1 : 6, lean, leanDir: ld, color: '#ded3c4', flare: 0.35 })];
    const n = lod ? 5 : 8;
    const clusters = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.8;
      const rr = 1.3 + r() * 2.2;
      const y = H * (0.46 + r() * 0.42);
      const c = new V3(lx + Math.cos(a) * rr, y, lz + Math.sin(a) * rr);
      clusters.push({ c, R: 1.6 + r() * 0.7, tint: leafTint(r, 0.14) });
      if (!lod) parts.push(stick(new V3(lx * 0.5, H * 0.55, lz * 0.5), c.clone().setY(y + 0.5), 0.07, 0.035, '#cfc3b3'));
    }
    // Keora hangs: its clusters are taller than they are wide.
    parts.push(crownCards(r, clusters, lod ? Q.farCards : Math.max(3, Q.cards - 2), 'keora', { squash: 1.4, spread: 0.75, size: 1.25, far: lod }));
    return merge(parts);
  },

  garjan(seed, lod) {
    const r = rng(seed);
    const H = 7 + r() * 2.5;
    const parts = [bole(H * 0.78, 0.2, 0.1, { seg: lod ? 6 : 8, rows: lod ? 1 : 6, color: '#d2c6b6', flare: 0.2 })];
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
      const tube = new THREE.TubeGeometry(curve, lod ? 4 : 7, 0.055, 5, false);
      cellUV(tube, atlas.rects.bark[0]);
      parts.push(paint(tube.toNonIndexed(), '#c9bcaa', { under: 0.8, top: 1 }));
    }
    const n = lod ? 4 : 6;
    const clusters = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r();
      const rr = i === 0 ? 0 : 1.5 + r() * 0.8;
      clusters.push({ c: new V3(Math.cos(a) * rr, H - 1.4 - (i ? r() * 2.4 : 0), Math.sin(a) * rr), R: 1.9 + r() * 0.6, tint: leafTint(r) });
    }
    parts.push(crownCards(r, clusters, lod ? Q.farCards : Math.max(3, Q.cards - 1), 'garjan', { squash: 0.9, far: lod }));
    return merge(parts);
  },

  gewa(seed, lod) {
    const r = rng(seed);
    const H = 8 + r() * 2.5;
    const parts = [bole(H * 0.7, 0.2, 0.09, { seg: lod ? 6 : 8, rows: lod ? 1 : 6, lean: 0.3, leanDir: r() * TAU, color: '#dcd1c2', flare: 0.3 })];
    const n = lod ? 4 : 6;
    const clusters = [];
    const red = seed % 2 === 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r();
      const rr = i === 0 ? 0.2 : 1.4 + r() * 1.2;
      clusters.push({ c: new V3(Math.cos(a) * rr, H - 1.6 - r() * 2.8, Math.sin(a) * rr), R: 1.8 + r() * 0.7, tint: leafTint(r, 0.12) });
    }
    parts.push(crownCards(r, clusters, lod ? Q.farCards : Math.max(3, Q.cards - 1), red ? 'gewaRed' : 'gewa', { squash: 0.9, far: lod }));
    return merge(parts);
  },

  goran(seed) {
    const r = rng(seed);
    const parts = [];
    const clusters = [];
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const rr = r() * 0.9;
      const y = 0.9 + r() * 1.5;
      parts.push(stick(new V3(0, 0, 0), new V3(Math.cos(a) * rr, y, Math.sin(a) * rr), 0.05, 0.03, '#c4b6a4', 4));
      clusters.push({ c: new V3(Math.cos(a) * rr, y + 0.3, Math.sin(a) * rr), R: 0.8 + r() * 0.45, tint: leafTint(r).multiplyScalar(0.82) });
    }
    parts.push(crownCards(r, clusters, 4, 'gewa', { squash: 0.9, size: 1.5, core: 0 }));
    return merge(parts);
  },

  nipa(seed, lod) {
    const r = rng(seed);
    const n = lod ? 6 : 10;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const len = 3.8 + r() * 3;
      const g = frond(len, lod ? 4 : 7, r, atlas.pick('nipa', r));
      g.rotateX(-0.1 - r() * 0.3);
      g.rotateY((i / n) * TAU + r() * 0.5);
      parts.push(g);
    }
    return merge(parts);
  },
};

/** A tuft of grass: two crossed cards, dark at the root. */
function tuft(r) {
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.PlaneGeometry(1.1, 0.85, 1, 2);
    g.translate(0, 0.425, 0);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 0.85;
      col.set([0.5 + 0.5 * t, 0.5 + 0.5 * t, 0.5 + 0.5 * t], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cellUV(g, atlas.pick('grass', r));
    g.rotateY(k * (Math.PI / 2) + (r() - 0.5) * 0.4);
    // Grass shades like a low mound, not a flat card.
    const nor = g.attributes.normal;
    for (let i = 0; i < p.count; i++) nor.setXYZ(i, p.getX(i) * 0.6, 0.7 + p.getY(i) * 0.3, p.getZ(i) * 0.6);
    g.normalizeNormals();
    parts.push(g.toNonIndexed());
  }
  return merge(parts);
}

/** A breathing root: a thin cone, dark where it leaves the mud, pale at its tip. */
function pneumatophore() {
  const g = new THREE.ConeGeometry(0.024, 0.32, 5, 1, true).toNonIndexed();
  g.translate(0, 0.15, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color('#3b332b');
  const b = new THREE.Color('#9a8a73');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, Math.min(1, p.getY(i) / 0.3));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/*
 * Leaf shading. The atlas is alpha-tested (and alpha-to-coverage smoothed where the canvas has MSAA).
 * Light wraps around the canopy's spherical normals, passes through blades held against the sun, and
 * glints faintly off the waxy surface. Back faces keep the front normal, so the far side of a card
 * shades as part of the same volume. Cards also flutter on their normals in the wind; bark does not.
 */
const LEAF_FRAG_LIGHTS = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  'vec3 irradiance = dotNL * directLight.color;',
  /* glsl */ `float wrapNL = saturate((dot(geometryNormal, directLight.direction) + 0.45) / 1.45);
	vec3 irradiance = wrapNL * directLight.color;
	float through = pow(saturate(dot(-geometryViewDir, directLight.direction)), 4.0);
	reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vec3(0.95, 1.0, 0.5) * through * 0.55;
	vec3 halfDir = normalize(directLight.direction + geometryViewDir);
	reflectedLight.directDiffuse += directLight.color * pow(saturate(dot(geometryNormal, halfDir)), 20.0) * 0.07;`
);
const LEAF_NORMAL = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
const FLUTTER_VERT = /* glsl */ `
  {
    float leafK = 1.0 - step(0.75, uv.x) * step(uv.y, 0.25);
    float fl = sin(uTime * 2.4 + dot(position, vec3(3.1, 1.7, 2.3)) + wPh) + 0.5 * sin(uTime * 5.3 + dot(position, vec3(1.3, 4.1, 0.7)));
    transformed += normal * (fl * 0.028 * uWind * leafK);
  }
  #include <project_vertex>`;

function withLeaves(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', FLUTTER_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', LEAF_FRAG_LIGHTS)
      .replace('#include <normal_fragment_begin>', LEAF_NORMAL)
      // Mip filtering thins alpha-tested leaves with distance; thicken them back so far crowns stay full.
      .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_FOG\ndiffuseColor.a = min(1.0, diffuseColor.a * (1.12 + vFogDepth * 0.005));\n#endif');
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key ? key.call(material) : ''}|leaf`;
  return material;
}

function leafMaterial(shared, bend, smooth) {
  const m = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  m.alphaToCoverage = smooth;
  withWind(m, shared, bend);
  withLeaves(m);
  withAir(m);
  // The same leaves, seen by the sun: the shadow pass needs the cut-out and the wind too.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  withWind(depth, shared, bend);
  const prev = depth.onBeforeCompile;
  depth.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', FLUTTER_VERT);
  };
  depth.customProgramCacheKey = () => 'depth-wind-leaf';
  m.userData.depth = depth;
  return m;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new V3();
const ps = new V3();

/**
 * Instances grouped into square cells so frustum culling can drop forest beside and behind the boat.
 * Each cell draws only while the camera is between `from` and `reach` metres away, measured from a
 * sphere around the trees themselves so a detailed cell and its distant twin hand over exactly.
 */
function instanced(geo, material, items, { layer = 0, chunk = 150, from = 0, reach = 950, shadow = false, receive = true, far = false } = {}) {
  const chunks = new Map();
  for (const it of items) {
    const k = `${Math.floor((Z_START - it.z) / chunk)}:${Math.floor(it.x / chunk)}`;
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
    mesh.receiveShadow = receive;
    if (shadow) {
      mesh.castShadow = true;
      if (material.userData.depth) mesh.customDepthMaterial = material.userData.depth;
    }
    const cell = new THREE.Sphere().setFromPoints(list.map((it) => new V3(it.x, it.y, it.z)));
    Object.assign(mesh.userData, { cell, from, reach, far });
    if (layer) mesh.layers.set(layer);
    meshes.push(mesh);
  }
  return meshes;
}

export function createFlora({ density = 1, tier = 2, smooth = false } = {}) {
  atlas = createLeafAtlas(tier > 0 ? 2048 : 1024, { anisotropy: tier > 0 ? 4 : 1 });
  Q.cards = [5, 7, 10][tier];
  Q.farCards = tier ? 3 : 2;
  Q.coreDetail = tier === 2 ? 1 : 0;
  // How far the distant forest draws: beyond this the fog and air leave nothing to see.
  Q.reach = [560, 680, 800][tier];
  let reachScale = 1;
  const shared = { uTime: { value: 0 }, uWind: { value: 1 } };
  const treeMat = leafMaterial(shared, 0.0009, smooth);
  const palmMat = leafMaterial(shared, 0.011, smooth);
  const grassMat = leafMaterial(shared, 0.22, smooth);
  const rootMat = withAir(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const clumps = noise2D(77);

  const r = rng(99);
  const items = { sundari: [], keora: [], garjan: [], gewa: [], goran: [], nipa: [], grass: [], roots: [] };
  const hosts = [];
  const tint = () => new THREE.Color().setRGB(0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.16);
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
          if (r() > (band.far && tier > 0 ? Math.max(density, 0.6) : density)) continue;
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
          add(sp, x, h - 0.1, zz, s, { lod: !!band.lod, cast: band.b0 < 70, hs: sp === 'sundari' ? 0.9 + r() * 0.25 : 1 });
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
      // Breathing roots across the mudflats, in clumps with open mud between; grass on the clearings.
      for (let z = Z_START; z > Z_END; z -= 1.7) {
        for (let b = 1; b < 17; b += 1.7) {
          const zz = z - r() * 1.7;
          const bb = b + r() * 1.7;
          const x = riverX(zz) + side * (riverW(zz) + bb);
          const h = heightAt(x, zz);
          const m = meadowAt(x, zz);
          if (m > 0.3) {
            if (r() < density * 0.7) {
              const gx = x + (r() - 0.5) * 1.4;
              const gz = zz + (r() - 0.5) * 1.4;
              items.grass.push({ x: gx, y: heightAt(gx, gz) - 0.02, z: gz, rot: r() * TAU, s: 0.55 + r() * 0.9, c: tint().multiplyScalar(0.72 + r() * 0.22) });
            }
            continue;
          }
          const clump = smoothstep(-0.15, 0.45, clumps(x * 0.09, zz * 0.09));
          if (h < -0.04 || h > 1.3 || r() > density * 0.6 * clump) continue;
          items.roots.push({ x, y: h - 0.03, z: zz, rot: r() * TAU, s: 0.7 + r() * 0.8, hs: 0.6 + r() * 0.9, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3 });
        }
      }
    }
  }
  // Islands: roots in drifts, young keora on the downstream end, golpata clumps at the tips. The
  // upstream half stays open.
  for (const c of CHARS) {
    const cx = riverX(c.z) + c.off;
    for (let i = 0; i < 900 * Math.max(density, 0.5); i++) {
      const a = r() * TAU;
      const rad = Math.sqrt(r()) * 0.86;
      const x = cx + Math.cos(a) * rad * c.rx;
      const z = c.z + Math.sin(a) * rad * c.rz;
      const h = heightAt(x, z);
      if (h < -0.02) continue;
      if (rad < 0.55 && r() < 0.6) continue;
      if (r() > smoothstep(-0.2, 0.4, clumps(x * 0.11, z * 0.11))) continue;
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
  const cells = [];
  const plant = (geo, mat, list, opts) => {
    for (const mesh of instanced(geo, mat, list, opts)) {
      group.add(mesh);
      cells.push(mesh);
    }
  };
  for (const sp of ['sundari', 'keora', 'garjan', 'gewa', 'nipa']) {
    const seeds = [11 + sp.length * 7, 53 + sp.length * 3];
    const near = seeds.map((seed) => SPECIES[sp](seed, false));
    // The distant forms share their near forms' seeds, so height, lean and trunk match across the hand-over.
    const far = seeds.map((seed) => SPECIES[sp](seed, true));
    const mat = sp === 'nipa' ? palmMat : treeMat;
    const nearA = items[sp].filter((it, i) => !it.lod && i % 2 === 0);
    const nearB = items[sp].filter((it, i) => !it.lod && i % 2 === 1);
    const lodNear = items[sp].filter((it) => it.lod && it.cast);
    const lodFar = items[sp].filter((it) => it.lod && !it.cast);
    // Bank trees keep full detail while near; past the haze line their cell hands over to the same
    // trees in the species' distant form. Only the first rows of the forest cast shadows: anything
    // deeper lands on a floor the river never sees.
    for (const [geo, twin, list] of [[near[0], far[0], nearA], [near[1], far[1], nearB]]) {
      if (!list.length) continue;
      plant(geo, mat, list, { reach: DETAIL_REACH, shadow: true, receive: false });
      plant(twin, mat, list, { from: DETAIL_REACH, reach: Q.reach, receive: false, far: true });
    }
    if (lodNear.length) plant(far[0], mat, lodNear, { reach: Q.reach, shadow: true, receive: false, far: true });
    if (lodFar.length) plant(far[1], mat, lodFar, { reach: Q.reach, receive: false, far: true });
  }
  // Understorey detail is lost in the haze long before the canopy, so it stops drawing much sooner.
  plant(SPECIES.goran(7), treeMat, items.goran, { layer: 1, reach: 450 });
  plant(tuft(r), grassMat, items.grass, { layer: 1, reach: 260 });
  plant(pneumatophore(), rootMat, items.roots, { layer: 1, chunk: 120, reach: 220 });

  return {
    group,
    hosts,
    /** The governor's geometry lever: scale how far the distant forest draws (1 = the tier's default). */
    setReach(k) {
      reachScale = clamp(k, 0.5, 1);
    },
    get reach() {
      return reachScale;
    },
    update(time, wind, eye) {
      shared.uTime.value = time;
      shared.uWind.value = wind;
      if (!eye) return;
      for (const mesh of cells) {
        const { cell, from, reach, far } = mesh.userData;
        const d = Math.max(0, cell.distanceToPoint(eye));
        mesh.visible = d >= from && d < (far ? Math.max(DETAIL_REACH + 1, reach * reachScale) : reach);
      }
    },
  };
}
