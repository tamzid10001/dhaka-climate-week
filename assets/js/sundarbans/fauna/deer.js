import * as THREE from 'three';
import { TAU, loft, rng, damp, lerp } from '../util.js';
import { buildRig, gait, swayTail, steer, ground, blobShadow, ellipsoid, rod } from './rig.js';

const S = (z, w, h, y = 0, p = 2, bot = 1) => ({ z, w, h, y, p, bot });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function antlers() {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(
      rod(V(s * 0.035, 0.085, 0), V(s * 0.13, 0.4, -0.16), 0.017, 0.012, 6),
      rod(V(s * 0.13, 0.4, -0.16), V(s * 0.11, 0.6, -0.05), 0.012, 0.006, 6),
      rod(V(s * 0.045, 0.13, 0), V(s * 0.08, 0.2, 0.14), 0.011, 0.005, 6),
      rod(V(s * 0.125, 0.38, -0.15), V(s * 0.06, 0.5, -0.21), 0.009, 0.004, 6)
    );
  }
  return out;
}

function deerSpec(stag) {
  const ears = [-1, 1].map((s) => {
    const e = ellipsoid(0.03, 0.065, 0.01, { region: 4, n: 4, radial: 8 });
    e.translate(0, 0.055, 0);
    e.rotateZ(-s * 0.95);
    e.translate(s * 0.05, 0.06, -0.035);
    return e;
  });
  const leg = (front) => ({
    upper: front ? [S(0, 0.06, 0.085), S(0.16, 0.042, 0.05), S(0.33, 0.03, 0.035)] : [S(0, 0.08, 0.14), S(0.22, 0.05, 0.06), S(0.42, 0.028, 0.034)],
    lower: front ? [S(0, 0.025, 0.03), S(0.2, 0.02, 0.024), S(0.37, 0.022, 0.026)] : [S(0, 0.024, 0.028), S(0.18, 0.02, 0.024), S(0.34, 0.022, 0.026)],
    foot: [S(-0.02, 0.022, 0.02, 0.018), S(0.04, 0.02, 0.018, 0.016)],
    footRegion: 7,
    sole: 0.0,
    front,
    rest: front ? -0.04 : 0.32,
    kneeRest: front ? 0.05 : -0.52,
  });
  return {
    torso: [S(-0.56, 0.07, 0.08, 0.84), S(-0.5, 0.15, 0.18, 0.83), S(-0.36, 0.17, 0.2, 0.82), S(-0.1, 0.16, 0.19, 0.81, 2, 1.05), S(0.16, 0.165, 0.2, 0.82), S(0.36, 0.16, 0.21, 0.85), S(0.5, 0.12, 0.17, 0.9), S(0.56, 0.08, 0.12, 0.94)],
    neck: { at: [0, 0.9, 0.48], sections: [S(0, 0.085, 0.11), S(0.26, 0.062, 0.078), S(0.52, 0.052, 0.062)] },
    head: {
      at: [0, 0, 0.52],
      parts: [
        loft([S(-0.06, 0.055, 0.06, 0.02), S(0.03, 0.065, 0.07, 0.02), S(0.12, 0.05, 0.055), S(0.22, 0.033, 0.04, -0.02), S(0.27, 0.025, 0.03, -0.025)], { radial: 12, region: 1 }),
        ellipsoid(0.022, 0.016, 0.012, { at: [0, -0.018, 0.27], region: 7, n: 4, radial: 8 }),
        ...[-1, 1].map((s) => ellipsoid(0.016, 0.014, 0.012, { at: [s * 0.055, 0.04, 0.06], region: 5, n: 4, radial: 8 })),
        ...ears,
        ...(stag ? antlers() : []),
      ],
    },
    legs: [
      { at: [0.1, 0.74, 0.36], ...leg(true) },
      { at: [-0.1, 0.74, 0.36], ...leg(true) },
      { at: [0.1, 0.78, -0.42], ...leg(false) },
      { at: [-0.1, 0.78, -0.42], ...leg(false) },
    ].map((L, i) => ({ ...L, offset: [0.75, 0.25, 0, 0.5][i] })),
    tail: { at: [0, 0.88, -0.55], segments: [[S(0, 0.035, 0.04), S(0.16, 0.03, 0.03), S(0.2, 0.012, 0.012)]], rest: [-1.1] },
  };
}

const WALK = [0.75, 0.25, 0, 0.5];
const TROT = [0.5, 0, 0, 0.5];

/** A chital herd: grazing, wandering, alarm calls that snap every head up, and the odd bolt. */
export function createDeerHerd({ mat, area, emit, count = 6, seed = 11 }) {
  const group = new THREE.Group();
  const r = rng(seed);
  const herd = [];
  for (let i = 0; i < count; i++) {
    const stag = i === 0 || i === 3;
    const fawn = !stag && i === count - 1;
    const rig = buildRig(deerSpec(stag), mat);
    rig.root.scale.setScalar(fawn ? 0.62 : stag ? 1.06 : 0.92);
    rig.root.add(blobShadow(0.75, 1.4));
    const [x, z] = area.pick(r);
    const d = { rig, x, z, heading: r() * TAU, state: 'graze', timer: 2 + r() * 6, phase: r() * TAU, target: [x, z], trot: 0, look: 0, seed: r() * 10 };
    ground(rig, d, 0, 1.1);
    rig.neck.rotation.x = 1.1;
    group.add(rig.root);
    herd.push(d);
  }
  let alarm = 12 + r() * 18;

  return {
    object: group,
    position: group.position,
    center: area.center,
    update(dt, t) {
      alarm -= dt;
      if (alarm < 0) {
        alarm = 26 + r() * 30;
        const caller = herd[Math.floor(r() * herd.length)];
        emit('deer-alarm', { position: caller.rig.root.position });
        const flee = r() < 0.45;
        for (const d of herd) {
          d.state = 'alert';
          d.timer = 1.6 + r() * 2.4;
          d.flee = flee;
          d.look = (r() - 0.5) * 1.3;
        }
      }
      for (const d of herd) {
        const { rig } = d;
        let speed = 0;
        let neck = -0.85;
        let head = 0.95;
        let trot = 0;
        d.timer -= dt;
        if (d.state === 'graze') {
          neck = 1.12;
          head = 0.48 + Math.sin(t * 5 + d.seed) * 0.06;
          if (d.timer < 0) {
            const v = r();
            if (v < 0.55) {
              d.state = 'walk';
              d.target = [d.x + (r() - 0.5) * 7, d.z + (r() - 0.5) * 7];
              const [ax, az] = area.pick(r);
              if (Math.hypot(d.target[0] - area.center[0], d.target[1] - area.center[1]) > 20) d.target = [ax, az];
            } else if (v < 0.8) {
              d.state = 'alert';
              d.timer = 1.5 + r() * 2;
              d.flee = false;
              d.look = (r() - 0.5) * 1.4;
            } else d.timer = 3 + r() * 5;
          }
        } else if (d.state === 'walk' || d.state === 'flee') {
          const fast = d.state === 'flee';
          const s = steer(d, d.target[0], d.target[1], fast ? 3.4 : 0.75, dt, fast ? 3.5 : 2);
          speed = s.v;
          trot = fast ? 1 : 0;
          neck = fast ? -0.7 : -0.2;
          head = fast ? 0.8 : 0.75;
          if (s.dist < 0.4) {
            d.state = fast ? 'alert' : 'graze';
            d.timer = fast ? 2 + r() * 2 : 4 + r() * 6;
            d.flee = false;
          }
        } else if (d.state === 'alert') {
          neck = -1.02;
          head = 1.06;
          if (d.timer < 0) {
            if (d.flee) {
              d.state = 'flee';
              d.target = area.pick(r);
            } else {
              d.state = 'graze';
              d.timer = 4 + r() * 6;
            }
          }
        }
        d.trot = damp(d.trot, trot, 4, dt);
        rig.legs.forEach((L, i) => (L.offset = lerp(WALK[i], TROT[i], d.trot) * TAU));
        d.phase += (speed / lerp(1.0, 2.1, d.trot)) * TAU * dt;
        gait(rig, d.phase, Math.min(1, speed / 0.7), { swing: lerp(0.4, 0.62, d.trot), lift: lerp(0.8, 1.15, d.trot), bob: lerp(0.015, 0.05, d.trot), roll: 0.015 });
        rig.neck.rotation.x = damp(rig.neck.rotation.x, neck, d.state === 'alert' ? 7 : 2.6, dt);
        rig.neck.rotation.y = damp(rig.neck.rotation.y, d.state === 'alert' ? d.look : 0, 3, dt);
        rig.head.rotation.x = damp(rig.head.rotation.x, head, 4, dt);
        rig.body.rotation.x = d.state === 'graze' ? 0.05 : 0;
        swayTail(rig, t + d.seed, d.state === 'alert' ? 0.05 : 0.22, d.state === 'graze' ? 3.2 : 1.4, d.state === 'alert' || d.state === 'flee' ? 0.9 : 0);
        ground(rig, d, dt, 1.1);
      }
    },
  };
}
