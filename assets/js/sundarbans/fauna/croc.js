import * as THREE from 'three';
import { TAU, loft, merge, rng, damp } from '../util.js';
import { rod, ellipsoid, blobShadow, ground } from './rig.js';

const S = (z, w, h, y = 0, p = 2, bot = 1) => ({ z, w, h, y, p, bot });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A 4.5 m saltwater crocodile: flat armoured body, hinged jaw full of teeth, three-part tail. */
function buildCroc(mat) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  body.position.y = 0.09;
  root.add(body);

  const limbs = [];
  for (const s of [-1, 1]) {
    limbs.push(
      rod(V(s * 0.28, 0, 0.05), V(s * 0.48, -0.13, 0.12), 0.07, 0.05, 2),
      rod(V(s * 0.48, -0.13, 0.12), V(s * 0.5, -0.21, 0.22), 0.05, 0.04, 2),
      ellipsoid(0.07, 0.025, 0.08, { at: [s * 0.52, -0.22, 0.27], region: 2, n: 4, radial: 8 }),
      rod(V(s * 0.26, 0, -0.82), V(s * 0.46, -0.12, -0.75), 0.09, 0.06, 2),
      rod(V(s * 0.46, -0.12, -0.75), V(s * 0.5, -0.21, -0.62), 0.06, 0.045, 2),
      ellipsoid(0.08, 0.025, 0.1, { at: [s * 0.53, -0.22, -0.56], region: 2, n: 4, radial: 8 })
    );
  }
  const torso = loft(
    [S(-1.08, 0.17, 0.14, 0.02, 2.6, 0.6), S(-0.85, 0.3, 0.19, 0.04, 2.8, 0.6), S(-0.45, 0.4, 0.22, 0.05, 3, 0.62), S(-0.05, 0.36, 0.2, 0.05, 3, 0.62), S(0.16, 0.25, 0.15, 0.04, 2.6, 0.6), S(0.34, 0.2, 0.13, 0.03, 2.4, 0.6)],
    { radial: 16, region: 0 }
  );
  body.add(new THREE.Mesh(merge([torso, ...limbs]), mat));

  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.32);
  body.add(head);
  const skull = loft(
    [S(0, 0.2, 0.12, 0.02, 2.4, 0.55), S(0.14, 0.19, 0.11, 0.02, 2.4, 0.5), S(0.3, 0.14, 0.075, 0, 2.6, 0.45), S(0.55, 0.1, 0.055, -0.01, 2.6, 0.4), S(0.72, 0.085, 0.05, -0.01), S(0.78, 0.04, 0.03, -0.015)],
    { radial: 14, region: 1 }
  );
  const teeth = (y, zs) => [-1, 1].map((s) => rod(V(s * 0.165, y, zs[0]), V(s * 0.07, y, zs[1]), 0.013, 0.009, 7));
  head.add(
    new THREE.Mesh(
      merge([
        skull,
        ...[-1, 1].map((s) => ellipsoid(0.035, 0.032, 0.042, { at: [s * 0.085, 0.11, 0.16], region: 5, n: 4, radial: 8 })),
        ellipsoid(0.045, 0.03, 0.035, { at: [0, 0.035, 0.72], region: 1, n: 4, radial: 8 }),
        ...teeth(-0.045, [0.12, 0.72]),
      ]),
      mat
    )
  );
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.045, 0.03);
  head.add(jaw);
  const lower = loft([S(0, 0.19, 0.04, -0.02), S(0.3, 0.13, 0.035, -0.02), S(0.6, 0.08, 0.03, -0.02), S(0.74, 0.05, 0.025, -0.02)], { radial: 12, region: 6 });
  jaw.add(new THREE.Mesh(merge([lower, ...teeth(0.012, [0.1, 0.68])]), mat));

  const segs = [
    [S(0, 0.17, 0.14, 0, 2.4, 0.6), S(0.75, 0.11, 0.12, 0, 2.2, 0.6)],
    [S(0, 0.11, 0.12), S(0.75, 0.065, 0.1)],
    [S(0, 0.065, 0.1), S(0.55, 0.035, 0.07), S(0.8, 0.01, 0.02)],
  ];
  const tail = [];
  let parent = body;
  let along = 0;
  segs.forEach((secs, i) => {
    const g = new THREE.Group();
    g.position.set(0, i === 0 ? 0.03 : 0, i === 0 ? -1.06 : -segs[i - 1].at(-1).z);
    const geo = loft(secs, { radial: 10, region: 3, along0: along });
    geo.rotateY(Math.PI);
    g.add(new THREE.Mesh(geo, mat));
    parent.add(g);
    parent = g;
    tail.push(g);
    along += secs.at(-1).z;
  });
  return { root, body, head, jaw, tail };
}

/** Hauled out on the mud, head to the water, jaws agape; shuts them now and then with a hiss. */
export function createBaskingCroc({ mat, x, z, heading, emit, seed = 3 }) {
  const c = buildCroc(mat);
  c.root.add(blobShadow(1.5, 4.6));
  const r = rng(seed);
  const curl = (r() - 0.5) * 0.7;
  const agent = { x, z, heading };
  ground(c, agent, 0, 3.2);
  let timer = 8 + r() * 18;
  let shut = 0;
  return {
    object: c.root,
    position: c.root.position,
    update(dt, t) {
      timer -= dt;
      if (timer < 0) {
        timer = 16 + r() * 22;
        shut = 2 + r() * 2.5;
        if (r() < 0.6) emit('croc-hiss', { position: c.root.position });
      }
      shut -= dt;
      c.jaw.rotation.x = damp(c.jaw.rotation.x, shut > 0 ? 0 : 0.5 + Math.sin(t * 0.3 + seed) * 0.06, shut > 0 ? 14 : 1.2, dt);
      c.body.scale.y = 1 + Math.sin(t * 0.7 + seed) * 0.012;
      c.tail.forEach((g, i) => (g.rotation.y = curl * (0.6 + i * 0.4) + Math.sin(t * 0.4 + i) * 0.015));
    },
  };
}

/** Cruising low in the channel, only eyes, nostrils and back scutes breaking the surface. */
export function createSwimmingCroc({ mat, cx, cz, rx, rz, emit, seed = 5 }) {
  const c = buildCroc(mat);
  const r = rng(seed);
  let u = r() * TAU;
  let wake = 0;
  const perimeter = TAU * Math.sqrt((rx * rx + rz * rz) / 2);
  const snout = new THREE.Vector3();
  c.jaw.rotation.x = 0;
  return {
    object: c.root,
    position: c.root.position,
    update(dt, t) {
      u += (0.8 / perimeter) * TAU * dt;
      const x = cx + Math.cos(u) * rx;
      const z = cz + Math.sin(u) * rz;
      c.root.position.set(x, -0.2 + Math.sin(t * 0.9) * 0.015, z);
      c.root.rotation.y = Math.atan2(-Math.sin(u) * rx, Math.cos(u) * rz) + Math.sin(t * 2.1) * 0.05;
      c.tail.forEach((g, i) => (g.rotation.y = Math.sin(t * 2.1 - i * 0.9) * (0.16 + i * 0.13)));
      wake -= dt;
      if (wake < 0) {
        wake = 0.75;
        c.head.localToWorld(snout.set(0, 0, 0.5));
        emit('croc-wake', { position: snout, ripple: 0.5 });
      }
    },
  };
}
