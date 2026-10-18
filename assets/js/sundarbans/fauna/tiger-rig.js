import * as THREE from 'three';
import { TAU, clamp, merge } from '../util.js';
import { HEAD_PIVOT } from './tiger-coat.js';

/*
 * The tiger's body: one continuous skin over a 40-bone skeleton. Every ring of the torso, legs and tail
 * is weighted across the joints it spans, so the body flexes instead of hinging. Units are the tiger's
 * own metres, ground at y = 0, facing +z. Angles are pitches in the side plane: 0 hangs straight
 * down, positive swings back (exactly what Bone.rotation.x does to a bone pointing down −y).
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const FORWARD = V(0, 0, 1);

export const SEG = { scap: 0.3, humerus: 0.27, radius: 0.31, pastern: 0.085, femur: 0.335, tibia: 0.34, meta: 0.223 };
export const REST = { scap: -0.45, humerus: 0.263, radius: -0.064, pastern: -0.4, femur: -0.4636, tibia: 0.7437, meta: -0.2721 };
export const TAIL_REST = [-0.95, -0.25, 0, 0.12, 0.2, 0.28, 0.34, 0.4];
const TAIL_SEG = 0.125;

/** Rotate a side-plane offset (y, z) by pitch `a`. */
export const rotYZ = (y, z, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [y * c - z * s, y * s + z * c];
};
/** Offset of a bone of length `l` hanging at absolute pitch `a`. */
export const segYZ = (l, a) => [-l * Math.cos(a), -l * Math.sin(a)];

function restPaw(y, z, chain) {
  for (const [l, a] of chain) {
    const [dy, dz] = segYZ(l, a);
    y += dy;
    z += dz;
  }
  return [y, z];
}
export const [FRONT_Y, FRONT_Z] = restPaw(0.95, 0.27, [[SEG.scap, REST.scap], [SEG.humerus, REST.humerus], [SEG.radius, REST.radius], [SEG.pastern, REST.pastern]]);
export const [HIND_Y, HIND_Z] = restPaw(0.8, -0.62, [[SEG.femur, REST.femur], [SEG.tibia, REST.tibia], [SEG.meta, REST.meta]]);

/** Two-bone reach in the side plane: absolute pitch of both bones from joint (y, z) to target (y, z). */
export function reach(jy, jz, ty, tz, l1, l2, kneeForward) {
  const d = clamp(Math.hypot(ty - jy, tz - jz), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const base = Math.atan2(-(tz - jz), -(ty - jy));
  const bend = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a1 = kneeForward ? base - bend : base + bend;
  const [ky, kz] = segYZ(l1, a1);
  return [a1, Math.atan2(-(tz - jz - kz), -(ty - jy - ky))];
}

export function buildTiger(material) {
  const bones = [];
  const bone = (parent, x, y, z, rx = 0) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    b.rotation.x = rx;
    if (parent) parent.add(b);
    bones.push(b);
    return b;
  };
  const base = bone(null, 0, 0, 0);
  const hips = bone(base, 0, 0.8, -0.5);
  const spine = bone(hips, 0, 0, 0.42);
  const ribs = bone(spine, 0, -0.1, 0.12);
  const chest = bone(spine, 0, 0.04, 0.4);
  const neck = bone(chest, 0, -0.02, 0.26);
  const head = bone(neck, 0, 0.06, 0.3);
  neck.rotation.order = 'YXZ';
  head.rotation.order = 'YXZ';
  const jaw = bone(head, 0, -0.068, 0.05);
  const tongue = bone(jaw, 0, 0.018, 0.04);
  const ears = [-1, 1].map((s) => bone(head, s * 0.088, 0.098, -0.012));
  const eyes = [-1, 1].map((s) => bone(head, s * 0.082, 0.036, 0.162));

  // Lateral-sequence walk: left hind, left fore, right hind, right fore.
  const legs = [];
  for (const s of [-1, 1]) {
    const scap = bone(chest, s * 0.115, 0.11, -0.05, REST.scap);
    const upper = bone(scap, s * 0.015, -SEG.scap, 0, REST.humerus - REST.scap);
    const lower = bone(upper, 0, -SEG.humerus, 0, REST.radius - REST.humerus);
    const pastern = bone(lower, 0, -SEG.radius, 0, REST.pastern - REST.radius);
    const paw = bone(pastern, 0, -SEG.pastern, 0);
    legs.push({ front: true, side: s, scap, upper, lower, pastern, paw, offset: s < 0 ? 0.25 : 0.75 });
  }
  for (const s of [-1, 1]) {
    const upper = bone(hips, s * 0.12, 0, -0.12, REST.femur);
    const lower = bone(upper, 0, -SEG.femur, 0, REST.tibia - REST.femur);
    const pastern = bone(lower, 0, -SEG.tibia, 0, REST.meta - REST.tibia);
    const paw = bone(pastern, 0, -SEG.meta, 0);
    legs.push({ front: false, side: s, upper, lower, pastern, paw, offset: s < 0 ? 0 : 0.5 });
  }
  const tail = [];
  let parent = hips;
  TAIL_REST.forEach((rx, i) => {
    parent = bone(parent, 0, i ? 0 : 0.07, i ? -TAIL_SEG : -0.38, rx);
    tail.push(parent);
  });

  base.updateMatrixWorld(true);
  const index = new Map(bones.map((b, i) => [b, i]));
  const at = (b, x = 0, y = 0, z = 0) => b.localToWorld(V(x, y, z));
  const between = (a, b, t, dy = 0, dz = 0) => a.clone().lerp(b, t).add(V(0, dy, dz));

  /** A tube through sections; rings sit square to the path and carry their own bone weights. */
  function tube(secs, { radial = 16, region = 0, ref = UP } = {}) {
    const ring = radial + 1;
    const n = secs.length;
    const pos = [];
    const coat = [];
    const sIdx = [];
    const sWgt = [];
    const idx = [];
    const t = V();
    const X = V();
    const U = V();
    const p = V();
    const skin = (list) => {
      const total = list.reduce((sum, [, w]) => sum + w, 0);
      for (let k = 0; k < 4; k++) {
        sIdx.push(list[k] ? index.get(list[k][0]) : 0);
        sWgt.push(list[k] ? list[k][1] / total : 0);
      }
    };
    let along = 0;
    for (let i = 0; i < n; i++) {
      const s = secs[i];
      t.subVectors(secs[Math.min(n - 1, i + 1)].at, secs[Math.max(0, i - 1)].at).normalize();
      if (i) along += s.at.distanceTo(secs[i - 1].at);
      U.copy(ref).addScaledVector(t, -t.dot(ref)).normalize();
      X.crossVectors(U, t);
      const e = 2 / (s.p || 2);
      for (let k = 0; k < ring; k++) {
        const ang = (k / radial) * TAU;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const cx = Math.sign(c) * Math.abs(c) ** e;
        const sy = Math.sign(sn) * Math.abs(sn) ** e;
        p.copy(s.at).addScaledVector(X, cx * s.w).addScaledVector(U, sy * (sy < 0 ? s.h * (s.bot ?? 1) : s.h));
        pos.push(p.x, p.y, p.z);
        coat.push(along, sn, c, region);
        skin(s.bones);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = i * ring + k;
        idx.push(a, a + 1, a + ring, a + ring, a + 1, a + ring + 1);
      }
    }
    for (const [s, a, end] of [[secs[0], 0, false], [secs[n - 1], along, true]]) {
      const c = pos.length / 3;
      pos.push(s.at.x, s.at.y, s.at.z);
      coat.push(a, 0, 0, region);
      skin(s.bones);
      const first = end ? (n - 1) * ring : 0;
      for (let k = 0; k < radial; k++) {
        if (end) idx.push(c, first + k, first + k + 1);
        else idx.push(c, k + 1, k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('coat', new THREE.Float32BufferAttribute(coat, 4));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nor = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const a = i * ring;
      const b = a + radial;
      t.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
      nor.setXYZ(a, t.x, t.y, t.z);
      nor.setXYZ(b, t.x, t.y, t.z);
    }
    return g;
  }

  /** A rounded part along z, turned and placed relative to `origin`. */
  function blob(rx, ry, rz, { origin, at: off = [0, 0, 0], euler = [0, 0, 0], region, bones: weights, n = 6, radial = 12, p = 2 }) {
    const secs = [];
    for (let i = 0; i <= n; i++) {
      const t = -1 + (2 * i) / n;
      const k = Math.sqrt(Math.max(0.0025, 1 - t * t));
      secs.push({ at: V(0, 0, t * rz), w: rx * k, h: ry * k, p, bones: weights });
    }
    const g = tube(secs, { radial, region });
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], 'YXZ')));
    g.translate(origin.x + off[0], origin.y + off[1], origin.z + off[2]);
    return g;
  }
  const fang = (from, dir, len, r, b) =>
    tube([0, 0.55, 1].map((t, i) => ({ at: from.clone().addScaledVector(dir, len * t), w: r * [1, 0.62, 0.08][i], h: r * [1, 0.62, 0.08][i], bones: [[b, 1]] })), { radial: 6, region: 8, ref: FORWARD });

  const parts = [];
  const TORSO = [
    [-0.95, 0.84, 0.74, 0.07, [[hips, 1]]],
    [-0.9, 0.9, 0.62, 0.15, [[hips, 1]]],
    [-0.82, 0.935, 0.53, 0.195, [[hips, 1]]],
    [-0.7, 0.95, 0.49, 0.215, [[hips, 1]]],
    [-0.56, 0.95, 0.5, 0.21, [[hips, 1]]],
    [-0.42, 0.94, 0.52, 0.195, [[hips, 0.75], [spine, 0.25]]],
    [-0.26, 0.93, 0.545, 0.19, [[hips, 0.4], [spine, 0.6]]],
    [-0.1, 0.93, 0.53, 0.195, [[spine, 0.7], [hips, 0.1], [ribs, 0.2]]],
    [0.05, 0.935, 0.49, 0.205, [[spine, 0.55], [ribs, 0.3], [chest, 0.15]]],
    [0.2, 0.95, 0.44, 0.21, [[spine, 0.3], [ribs, 0.3], [chest, 0.4]]],
    [0.34, 0.975, 0.42, 0.205, [[chest, 0.85], [ribs, 0.15]]],
    [0.46, 0.985, 0.43, 0.19, [[chest, 1]]],
    [0.56, 0.97, 0.47, 0.17, [[chest, 0.9], [neck, 0.1]]],
    [0.64, 0.955, 0.55, 0.15, [[chest, 0.55], [neck, 0.45]]],
    [0.72, 0.95, 0.62, 0.135, [[chest, 0.2], [neck, 0.8]]],
    [0.8, 0.955, 0.69, 0.125, [[neck, 0.85], [head, 0.15]]],
    [0.86, 0.96, 0.74, 0.115, [[neck, 0.5], [head, 0.5]]],
  ];
  parts.push(tube(TORSO.map(([z, top, bot, w, b]) => ({ at: V(0, (top + bot) / 2, z), w, h: (top - bot) / 2, p: 2.15, bones: b })), { radial: 24, region: 0 }));

  for (const L of legs) {
    const s = L.side;
    if (L.front) {
      const [J0, J1, J2, J3, J4] = [L.scap, L.upper, L.lower, L.pastern, L.paw].map((b) => at(b));
      // The shoulder starts inside the ribcage and swells out through it, so there is no seam.
      parts.push(tube([
        { at: between(J0, J1, 0.3).setX(s * 0.11), w: 0.04, h: 0.07, bones: [[chest, 1]] },
        { at: between(J0, J1, 0.62), w: 0.074, h: 0.125, bones: [[chest, 0.4], [L.scap, 0.6]] },
        { at: J1.clone(), w: 0.094, h: 0.13, bones: [[L.scap, 0.5], [L.upper, 0.5]] },
        { at: between(J1, J2, 0.45), w: 0.09, h: 0.114, bones: [[L.upper, 1]] },
        { at: between(J1, J2, 1, 0, -0.015), w: 0.078, h: 0.092, bones: [[L.upper, 0.5], [L.lower, 0.5]] },
        { at: between(J2, J3, 0.28), w: 0.071, h: 0.076, bones: [[L.lower, 1]] },
        { at: between(J2, J3, 0.68), w: 0.06, h: 0.06, bones: [[L.lower, 1]] },
        { at: J3.clone(), w: 0.054, h: 0.052, bones: [[L.lower, 0.5], [L.pastern, 0.5]] },
        { at: between(J3, J4, 0.55), w: 0.058, h: 0.054, bones: [[L.pastern, 1]] },
        { at: between(J3, J4, 0.95), w: 0.05, h: 0.04, bones: [[L.pastern, 0.6], [L.paw, 0.4]] },
      ], { radial: 14, region: 2, ref: FORWARD }));
      parts.push(blob(0.07, 0.036, 0.052, { origin: J4, at: [s * 0.004, 0.004, 0.022], region: 2, bones: [[L.paw, 1]], p: 2.4 }));
    } else {
      const [H0, H1, H2, H3] = [L.upper, L.lower, L.pastern, L.paw].map((b) => at(b));
      parts.push(tube([
        { at: H0.clone().add(V(0, 0.07, 0.02)), w: 0.046, h: 0.1, bones: [[hips, 1]] },
        { at: H0.clone().add(V(0, 0, -0.01)), w: 0.096, h: 0.165, bones: [[hips, 0.55], [L.upper, 0.45]] },
        { at: between(H0, H1, 0.32), w: 0.116, h: 0.162, bones: [[L.upper, 1]] },
        { at: between(H0, H1, 0.68), w: 0.1, h: 0.124, bones: [[L.upper, 1]] },
        { at: H1.clone(), w: 0.085, h: 0.094, bones: [[L.upper, 0.5], [L.lower, 0.5]] },
        { at: between(H1, H2, 0.32), w: 0.07, h: 0.082, bones: [[L.lower, 1]] },
        { at: between(H1, H2, 0.72), w: 0.053, h: 0.062, bones: [[L.lower, 1]] },
        { at: H2.clone().add(V(0, 0, -0.008)), w: 0.047, h: 0.058, bones: [[L.lower, 0.5], [L.pastern, 0.5]] },
        { at: between(H2, H3, 0.45), w: 0.045, h: 0.046, bones: [[L.pastern, 1]] },
        { at: between(H2, H3, 0.9), w: 0.05, h: 0.044, bones: [[L.pastern, 0.6], [L.paw, 0.4]] },
      ], { radial: 14, region: 2, ref: FORWARD }));
      parts.push(blob(0.064, 0.034, 0.05, { origin: H3, at: [s * 0.004, 0.002, 0.016], region: 2, bones: [[L.paw, 1]], p: 2.4 }));
    }
  }

  const tailPts = [at(hips, 0, 0.07, -0.34), ...tail.map((b) => at(b)), at(tail[tail.length - 1], 0, 0, -0.1)];
  const tailOwners = [hips, ...tail];
  const tailLen = tailPts.reduce((sum, p, i) => sum + (i ? p.distanceTo(tailPts[i - 1]) : 0), 0);
  const thickness = (u) => (u < 0.86 ? 0.058 - 0.022 * (u / 0.86) : u < 0.95 ? 0.036 + 0.008 * Math.sin(((u - 0.86) / 0.09) * Math.PI) : 0.006 + 0.034 * (1 - (u - 0.95) / 0.05));
  const tailSecs = [];
  let run = 0;
  for (let i = 0; i < tailPts.length - 1; i++) {
    const a = tailPts[i];
    const b = tailPts[i + 1];
    const seg = a.distanceTo(b);
    const owner = tailOwners[Math.min(i, tailOwners.length - 1)];
    const prev = tailOwners[Math.max(0, i - 1)];
    for (const f of i === tailPts.length - 2 ? [0, 0.5, 0.8, 1] : [0, 0.5]) {
      const r = thickness((run + seg * f) / tailLen);
      tailSecs.push({ at: a.clone().lerp(b, f), w: r, h: r, bones: f === 0 && i ? [[owner, 0.5], [prev, 0.5]] : [[owner, 1]] });
    }
    run += seg;
  }
  parts.push(tube(tailSecs, { radial: 12, region: 3 }));

  const hp = V(...HEAD_PIVOT);
  const H = [[head, 1]];
  const SKULL = [
    [-0.075, 0.05, 0.05, 0.02, 2],
    [-0.04, 0.112, 0.105, 0.026, 2],
    [0, 0.138, 0.122, 0.026, 2],
    [0.05, 0.146, 0.12, 0.022, 2.05],
    [0.095, 0.138, 0.108, 0.014, 2.1],
    [0.135, 0.118, 0.092, 0, 2.2],
    [0.17, 0.098, 0.076, -0.018, 2.35],
    [0.205, 0.088, 0.066, -0.03, 2.45],
    [0.24, 0.08, 0.057, -0.037, 2.45],
    [0.268, 0.068, 0.047, -0.04, 2.35],
    [0.286, 0.045, 0.032, -0.04, 2.2],
  ];
  parts.push(tube(SKULL.map(([z, w, h, y, p]) => ({ at: V(0, hp.y + y, hp.z + z), w, h, p, bones: H })), { radial: 22, region: 1 }));
  for (const s of [-1, 1]) {
    parts.push(blob(0.062, 0.074, 0.082, { origin: hp, at: [s * 0.118, -0.04, 0.035], euler: [0, s * 0.28, 0], region: 9, bones: H, n: 8, radial: 14 }));
    parts.push(blob(0.04, 0.034, 0.052, { origin: hp, at: [s * 0.034, -0.058, 0.232], region: 9, bones: H }));
    parts.push(blob(0.044, 0.024, 0.042, { origin: hp, at: [s * 0.06, 0.072, 0.136], euler: [0.15, s * 0.2, 0], region: 1, bones: H }));
    parts.push(fang(at(head, s * 0.03, -0.066, 0.238), V(0, -1, 0.12).normalize(), 0.032, 0.009, head));
  }
  parts.push(blob(0.029, 0.017, 0.018, { origin: hp, at: [0, -0.008, 0.284], region: 7, bones: H }));
  parts.push(blob(0.058, 0.012, 0.095, { origin: hp, at: [0, -0.064, 0.165], region: 6, bones: H }));
  ears.forEach((b, i) => {
    const s = i ? 1 : -1;
    parts.push(blob(0.037, 0.04, 0.012, { origin: at(b), at: [s * 0.004, 0.03, -0.006], euler: [-0.1, s * 0.38, -s * 0.24], region: 4, bones: [[b, 1]], radial: 14 }));
  });
  // Eyes sit on the surface where the brow meets the muzzle, turned forward and a little out.
  eyes.forEach((b, i) => {
    const s = i ? 1 : -1;
    parts.push(blob(0.021, 0.0165, 0.014, { origin: at(b), euler: [-0.1, s * 0.45, 0], region: 5, bones: [[b, 1]], radial: 14 }));
  });

  const jp = at(jaw);
  const JAW = [[0, 0.076, 0.03, 0], [0.07, 0.074, 0.032, -0.008], [0.14, 0.062, 0.03, -0.012], [0.19, 0.046, 0.024, -0.012], [0.215, 0.026, 0.016, -0.01], [0.226, 0.01, 0.008, -0.008]];
  parts.push(tube(JAW.map(([z, w, h, y]) => ({ at: V(0, jp.y + y, jp.z + z), w, h, p: 2.2, bones: [[jaw, 1]] })), { radial: 16, region: 10 }));
  parts.push(blob(0.04, 0.009, 0.075, { origin: at(tongue), at: [0, 0, 0.06], region: 6, bones: [[tongue, 1]] }));
  for (const s of [-1, 1]) parts.push(fang(at(jaw, s * 0.026, 0.01, 0.185), V(0, 1, 0.1).normalize(), 0.024, 0.008, jaw));

  const mesh = new THREE.SkinnedMesh(merge(parts), material);
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(base, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius *= 1.45;
  return { root, mesh, hips, spine, ribs, chest, neck, head, jaw, tongue, ears, eyes, legs, tail };
}
