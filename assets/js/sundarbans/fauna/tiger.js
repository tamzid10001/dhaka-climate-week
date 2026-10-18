import * as THREE from 'three';
import { TAU, loft, rng, damp, dampAngle } from '../util.js';
import { buildRig, gait, swayTail, steer, ground, blobShadow, ellipsoid } from './rig.js';

const S = (z, w, h, y = 0, p = 2, bot = 1) => ({ z, w, h, y, p, bot });

function tigerSpec() {
  const ears = [-1, 1].map((s) => ellipsoid(0.05, 0.05, 0.016, { at: [s * 0.1, 0.13, -0.02], region: 4, n: 4, radial: 8 }));
  const eyes = [-1, 1].map((s) => ellipsoid(0.022, 0.016, 0.012, { at: [s * 0.068, 0.045, 0.152], region: 5, n: 4, radial: 8 }));
  const ruff = [-1, 1].map((s) => ellipsoid(0.072, 0.082, 0.08, { at: [s * 0.12, -0.03, 0.04], region: 6, n: 5 }));
  const pads = [-1, 1].map((s) => ellipsoid(0.048, 0.038, 0.05, { at: [s * 0.034, -0.052, 0.198], region: 6, n: 4, radial: 8 }));
  const leg = (front) => ({
    upper: front ? [S(-0.02, 0.115, 0.15), S(0.17, 0.095, 0.115), S(0.34, 0.07, 0.08)] : [S(-0.02, 0.135, 0.19), S(0.2, 0.1, 0.12), S(0.4, 0.058, 0.068)],
    lower: front ? [S(-0.05, 0.072, 0.078), S(0.18, 0.062, 0.064), S(0.35, 0.064, 0.068)] : [S(-0.05, 0.058, 0.064), S(0.15, 0.05, 0.056), S(0.29, 0.056, 0.062)],
    foot: [S(-0.07, 0.07, 0.04, 0.035), S(0, 0.085, 0.05, 0.04), S(0.08, 0.08, 0.045, 0.035), S(0.13, 0.05, 0.03, 0.03)],
    front,
    rest: front ? -0.05 : 0.3,
    kneeRest: front ? 0.08 : -0.48,
  });
  return {
    torso: [
      S(-0.78, 0.07, 0.07, 0.8),
      S(-0.7, 0.2, 0.22, 0.8),
      S(-0.54, 0.25, 0.28, 0.78, 2.2),
      S(-0.32, 0.23, 0.25, 0.77, 2.2, 0.85),
      S(-0.08, 0.235, 0.26, 0.77, 2.2, 0.95),
      S(0.18, 0.26, 0.3, 0.79, 2.2, 1.12),
      S(0.4, 0.27, 0.32, 0.81, 2.2, 1.1),
      S(0.58, 0.23, 0.28, 0.84),
      S(0.7, 0.17, 0.21, 0.88),
    ],
    neck: { at: [0, 0.86, 0.64], sections: [S(0, 0.17, 0.2), S(0.14, 0.15, 0.17, 0.03), S(0.26, 0.13, 0.15, 0.05)] },
    head: {
      at: [0, 0.06, 0.34],
      parts: [
        loft([S(-0.1, 0.1, 0.1, 0.03), S(-0.02, 0.16, 0.15, 0.03, 2.2), S(0.07, 0.17, 0.145, 0.02, 2.3), S(0.14, 0.14, 0.115, 0, 2.3), S(0.2, 0.1, 0.085, -0.03, 2.2), S(0.235, 0.075, 0.06, -0.04), S(0.25, 0.04, 0.035, -0.04)], { radial: 14, region: 1 }),
        ellipsoid(0.032, 0.02, 0.022, { at: [0, -0.008, 0.245], region: 7, n: 4, radial: 8 }),
        ...ears,
        ...eyes,
        ...ruff,
        ...pads,
      ],
      jaw: { at: [0, -0.06, 0.04], geo: loft([S(0, 0.07, 0.035, -0.02), S(0.1, 0.075, 0.035, -0.02), S(0.18, 0.05, 0.025, -0.02)], { radial: 10, region: 6 }) },
    },
    legs: [
      { at: [0.15, 0.72, 0.44], offset: 0.75, ...leg(true) },
      { at: [-0.15, 0.72, 0.44], offset: 0.25, ...leg(true) },
      { at: [0.15, 0.69, -0.5], offset: 0, ...leg(false) },
      { at: [-0.15, 0.69, -0.5], offset: 0.5, ...leg(false) },
    ],
    tail: {
      at: [0, 0.82, -0.74],
      segments: [[S(0, 0.055, 0.055), S(0.24, 0.05, 0.05)], [S(0, 0.05, 0.05), S(0.24, 0.045, 0.045)], [S(0, 0.045, 0.045), S(0.24, 0.04, 0.04)], [S(0, 0.04, 0.04), S(0.2, 0.044, 0.044), S(0.25, 0.012, 0.012)]],
      rest: [-1.05, -0.25, 0.25, 0.45],
    },
  };
}

/** A Bengal tiger that prowls an area: walks, stops to look around, drinks at the edge, roars. */
export function createTiger({ mat, area, emit, seed = 7, scale = 1.08 }) {
  const rig = buildRig(tigerSpec(), mat);
  rig.root.scale.setScalar(scale);
  rig.root.add(blobShadow(1.1, 2.5));
  const r = rng(seed);
  const [x, z] = area.pick(r);
  const agent = { x, z, heading: r() * TAU };
  let state = 'walk';
  let target = area.pick(r);
  let timer = 0;
  let phase = 0;
  let look = 0;
  let crouch = 0;
  let lap = 0;
  let roarCooldown = 6;
  let roared = false;
  const mouth = new THREE.Vector3();

  function next() {
    const v = r();
    if (v < 0.3) {
      state = 'look';
      timer = 3 + r() * 4;
      look = (r() - 0.5) * 1.7;
    } else if (v < 0.52) {
      state = 'to-water';
      target = area.edge(r);
    } else if (v < 0.66 && roarCooldown <= 0) {
      state = 'roar';
      timer = 3.4;
      roared = false;
      roarCooldown = 38 + r() * 30;
    } else {
      state = 'walk';
      target = area.pick(r);
    }
  }

  ground(rig, agent, 0, 1.5);

  return {
    object: rig.root,
    position: rig.root.position,
    roar() {
      if (state === 'roar') return;
      state = 'roar';
      timer = 3.4;
      roared = false;
      roarCooldown = 40;
    },
    update(dt, t) {
      roarCooldown -= dt;
      let speed = 0;
      let neckX = 0.04;
      let neckY = 0;
      let headX = 0.04;
      let jaw = 0;
      let crouchTo = 0;
      if (state === 'walk' || state === 'to-water') {
        const s = steer(agent, target[0], target[1], 1.05, dt, 1.8);
        speed = s.v;
        neckX = 0.16;
        if (s.dist < 0.35) {
          if (state === 'to-water') {
            state = 'drink';
            timer = 7 + r() * 5;
          } else next();
        }
      } else if (state === 'look') {
        timer -= dt;
        neckY = look;
        neckX = -0.12;
        if (timer < 0) next();
      } else if (state === 'drink') {
        timer -= dt;
        agent.heading = dampAngle(agent.heading, area.faceWater(agent), 3, dt);
        crouchTo = 1;
        neckX = 0.9;
        headX = 0.36 + Math.sin(t * 7.5) * 0.07;
        lap -= dt;
        if (lap < 0 && crouch > 0.8) {
          lap = 0.6;
          rig.head.localToWorld(mouth.set(0, -0.04, 0.3));
          emit('tiger-lap', { position: mouth, ripple: 0.3 });
        }
        if (timer < 0) {
          state = 'walk';
          target = area.pick(r);
        }
      } else if (state === 'roar') {
        timer -= dt;
        neckX = -0.32;
        headX = -0.28;
        jaw = timer > 0.5 && timer < 3 ? 0.62 : 0;
        if (!roared && timer < 3) {
          roared = true;
          emit('tiger-roar', { position: rig.root.position });
        }
        if (timer < 0) {
          state = 'look';
          timer = 2.5;
          look = 0.5;
        }
      }

      phase += (speed / 1.3) * TAU * dt;
      gait(rig, phase, Math.min(1, speed / 0.85), { swing: 0.38, lift: 0.85, bob: 0.02, roll: 0.02 });
      crouch = damp(crouch, crouchTo, 2.5, dt);
      for (const L of rig.legs) {
        L.hip.rotation.x += (L.front ? 0.75 : -0.9) * crouch;
        L.knee.rotation.x += (L.front ? -1.5 : 2.0) * crouch;
      }
      rig.body.position.y -= 0.22 * crouch;
      rig.body.rotation.x = 0.05 * crouch;
      rig.neck.rotation.x = damp(rig.neck.rotation.x, neckX + Math.sin(phase * 2) * 0.03, 4, dt);
      rig.neck.rotation.y = damp(rig.neck.rotation.y, neckY, 2.5, dt);
      rig.head.rotation.x = damp(rig.head.rotation.x, headX, 6, dt);
      rig.jaw.rotation.x = damp(rig.jaw.rotation.x, jaw, 9, dt);
      swayTail(rig, t, state === 'look' ? 0.32 : 0.18, state === 'look' ? 1.7 : 1.0);
      ground(rig, agent, dt, 1.5);
    },
  };
}
