import * as THREE from 'three';
import { TAU, clamp, damp, smoothstep, rng } from '../util.js';
import { heightAt } from '../terrain.js';
import { blobShadow } from './rig.js';
import { buildTiger, reach, rotYZ, segYZ, SEG, REST, TAIL_REST, FRONT_Y, FRONT_Z, HIND_Y, HIND_Z } from './tiger-rig.js';

/*
 * How the tiger moves. Legs are solved with two-bone IK against paws that stay planted while the body
 * travels over them; the shoulder blades roll under the skin, the spine counter-twists, the head
 * steadies itself and turns to watch the boat. Poses blend into one another: stand, sit, lie, crouch
 * to drink, stretch. A small director plans what it does next on its stage.
 */

const FLAT = -Math.PI / 2;
const DUTY = 0.62;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/*
 * body: hips drop, hips slide, hips / spine / chest pitch, shoulder-blade correction.
 * front, hind: planted paw z and the pastern (hind: hock-to-paw) angle. head: neck and head pitch.
 * tail: base lift and sideways curl.
 */
const POSES = {
  stand: { body: [0, 0, 0, 0, 0, 0], front: [FRONT_Z, REST.pastern], hind: [HIND_Z, REST.meta], head: [0.08, 0.06], tail: [0, 0] },
  sit: { body: [-0.43, -0.06, -0.6, -0.05, 0, 0.45], front: [0.25, REST.pastern - 0.05], hind: [-0.3, FLAT], head: [0.2, 0.06], tail: [1.0, 0.24] },
  lie: { body: [-0.37, 0, 0, 0, -0.05, 0.05], front: [0.76, FLAT], hind: [-0.2, FLAT], head: [0.16, 0.02], tail: [0.62, 0.2] },
  crouch: { body: [-0.13, 0, 0.16, 0.04, 0.1, 0.12], front: [FRONT_Z + 0.07, REST.pastern - 0.25], hind: [HIND_Z + 0.06, REST.meta + 0.2], head: [0.9, 0.34], tail: [0.12, 0] },
  stretch: { body: [0, -0.04, 0.42, 0.1, 0.1, -0.1], front: [0.76, FLAT], hind: [HIND_Z, REST.meta], head: [0.12, -0.26], tail: [0.75, 0] },
};
const POSE_NAMES = Object.keys(POSES);

const pulse = (t, a, b, peak) => peak * smoothstep(a, a + 0.28, t) * (1 - smoothstep(b - 0.35, b, t));
/** The jaw over the three calls of the roar voice, which start at 0, 2.9 and 5.1 s. */
const roarJaw = (t) => Math.max(pulse(t, 0.05, 2.35, 0.8), pulse(t, 2.95, 4.55, 0.6), pulse(t, 5.15, 6.4, 0.42));
const yawnCurve = (t) => smoothstep(0, 1.1, t) * (1 - smoothstep(1.8, 2.7, t));

/**
 * A tiger with a stage: `points` to walk between and a `drink` spot ({ x, z, heading } at the
 * waterline). With `opening`, it starts with a set piece (walk across, look at the boat, sit and yawn,
 * lie down and stretch, walk back, drink) before improvising like every other tiger.
 */
export function createTiger({ mat, emit = () => {}, stage, opening = false, seed = 7, scale = 1.12, hold = null }) {
  const rig = buildTiger(mat);
  const { root, hips, spine, ribs, chest, neck, head, jaw, tongue, ears, eyes, legs, tail } = rig;
  root.scale.setScalar(scale);
  // Big cats carry a heavy head; the modelled skull is a touch small for the body.
  head.scale.setScalar(1.1);
  root.add(blobShadow(1.05, 2.4));
  const r = rng(seed);

  const [sx, sz] = stage.points[0];
  const [nx, nz] = stage.points[1];
  const agent = { x: sx, z: sz, heading: Math.atan2(nx - sx, nz - sz), v: 0 };
  let groundY = heightAt(sx, sz);
  let slope = 0;

  const weights = Object.fromEntries(POSE_NAMES.map((k) => [k, k === 'stand' ? 1 : 0]));
  const want = { ...weights };
  let phase = 0;
  let gaitAmt = 0;
  let turnRate = 0;
  let prevHeading = agent.heading;
  let lookYaw = 0;
  let lookPitch = 0;
  let lookW = 0;
  let jawOpen = 0;
  let earsBack = 0;
  let blink = 0;
  let blinkIn = 2 + r() * 3;
  const earFlick = [0, 0];
  const earIn = [3 + r() * 4, 5 + r() * 4];
  let breathClock = 0;
  let tailClock = r() * 10;
  let flickAt = -10;
  let flickGap = 6;
  let glance = 0;
  let glanceIn = 5;
  let roarCooldown = opening ? 30 : 12;
  let lapIn = 0;
  let lastAct = '';
  const mouth = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const fallbackEye = new THREE.Vector3();

  const plan = [];
  let step = null;
  const begin = (list) => {
    plan.length = 0;
    plan.push(...list);
    step = null;
  };

  const bearing = (cam) => Math.atan2(cam.x - agent.x, cam.z - agent.z);
  /** Side-on to the boat, turned the way the tiger already faces: the angle that shows the most of it. */
  const quarter = (cam) => {
    const b = bearing(cam);
    return Math.abs(wrap(b + 1.05 - agent.heading)) < Math.abs(wrap(b - 1.05 - agent.heading)) ? b + 1.05 : b - 1.05;
  };

  function act(name) {
    lastAct = name;
    const pts = stage.points;
    switch (name) {
      case 'walk': {
        const dist = (p) => Math.hypot(p[0] - agent.x, p[1] - agent.z);
        const far = pts.reduce((best, p) => (dist(p) > dist(best) ? p : best), pts[0]);
        const p = r() < 0.6 ? far : pts[Math.floor(r() * pts.length)];
        return [{ kind: 'walk', x: p[0] + (r() - 0.5) * 0.8, z: p[1] + (r() - 0.5) * 0.8 }];
      }
      case 'walk-a':
        return [{ kind: 'walk', x: pts[0][0], z: pts[0][1] }];
      case 'walk-b':
        return [{ kind: 'walk', x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] }];
      case 'look':
        return [{ kind: 'turn', to: 'quarter' }, { kind: 'hold', pose: 'stand', time: 3.4, look: true, chuff: r() < 0.6 }];
      case 'sit':
        return [{ kind: 'turn', to: 'quarter' }, { kind: 'hold', pose: 'sit', time: 7.5, look: true, yawn: 2.8 }];
      case 'lie':
        return [
          { kind: 'turn', to: 'quarter' },
          { kind: 'hold', pose: 'lie', time: 9, look: true, yawn: r() < 0.4 ? 4.5 : -1 },
          { kind: 'hold', pose: 'stretch', time: 2.6 },
        ];
      case 'drink':
        return [
          { kind: 'walk', x: stage.drink.x, z: stage.drink.z },
          { kind: 'turn', to: stage.drink.heading },
          { kind: 'hold', pose: 'crouch', time: 7, drink: true },
        ];
      case 'roar':
        roarCooldown = 50 + r() * 25;
        return [{ kind: 'turn', to: 'camera' }, { kind: 'hold', pose: 'stand', time: 7, roar: true, look: true }];
      default:
        return [];
    }
  }

  function improvise() {
    const options = [['walk', 3], ['look', 1.5], ['sit', 1.2], ['lie', 0.9], ['drink', 0.9], ['roar', roarCooldown <= 0 ? 0.5 : 0]].filter(
      ([name, w]) => w > 0 && (name === 'walk' || name !== lastAct)
    );
    let pick = r() * options.reduce((sum, [, w]) => sum + w, 0);
    for (const [name, w] of options) {
      pick -= w;
      if (pick <= 0) return act(name);
    }
    return act('walk');
  }

  if (hold && POSES[hold]) begin([{ kind: 'hold', pose: hold, time: 1e9, look: true }]);
  else if (opening) begin(['walk-b', 'look', 'sit', 'lie', 'walk-a', 'drink'].flatMap(act));

  /** Walk toward a point with eased starts and stops; returns the distance left. */
  function walkTo(x, z, dt) {
    const dx = x - agent.x;
    const dz = z - agent.z;
    const dist = Math.hypot(dx, dz);
    const diff = wrap(Math.atan2(dx, dz) - agent.heading);
    agent.heading += clamp(diff, -1.5 * dt, 1.5 * dt) * Math.min(1, 0.4 + dist);
    const align = Math.max(0, Math.cos(diff));
    agent.v = damp(agent.v, Math.min(0.92, dist * 0.8) * align * align, 2.4, dt);
    agent.x += Math.sin(agent.heading) * agent.v * dt;
    agent.z += Math.cos(agent.heading) * agent.v * dt;
    return dist;
  }

  /** Advance the plan; returns whether the tiger wants to watch the boat. */
  function think(dt, cam) {
    if (!step) {
      if (!plan.length) plan.push(...improvise());
      step = plan.shift();
      step.t = 0;
      step.fired = {};
    }
    step.t += dt;
    for (const k of POSE_NAMES) want[k] = 0;
    if (step.kind === 'walk') {
      want.stand = 1;
      if (walkTo(step.x, step.z, dt) < 0.28 && agent.v < 0.12) step = null;
      return false;
    }
    if (step.kind === 'turn') {
      want.stand = 1;
      agent.v = damp(agent.v, 0, 4, dt);
      const goal = step.to === 'camera' ? bearing(cam) - 0.25 : step.to === 'quarter' ? (step.goal ??= quarter(cam)) : step.to;
      const diff = wrap(goal - agent.heading);
      agent.heading += clamp(diff, -1.3 * dt, 1.3 * dt);
      if (Math.abs(diff) < 0.06 || step.t > 4) step = null;
      return false;
    }
    want[step.pose] = 1;
    agent.v = damp(agent.v, 0, 4, dt);
    if (step.chuff && !step.fired.chuff && step.t > 0.7) {
      step.fired.chuff = true;
      emit('tiger-chuff', { position: root.position });
    }
    if (step.roar && !step.fired.roar && step.t > 0.4) {
      step.fired.roar = true;
      emit('tiger-roar', { position: root.position });
    }
    const watching = !!step.look;
    if (step.t > step.time) step = null;
    return watching;
  }

  function look(dt, cam, wanted) {
    const h = agent.heading;
    const s = root.scale.x;
    const neckX = agent.x + Math.sin(h) * 0.6 * s;
    const neckZ = agent.z + Math.cos(h) * 0.6 * s;
    const yaw = wrap(Math.atan2(cam.x - neckX, cam.z - neckZ) - h);
    const pitch = clamp(Math.atan2(cam.y - (groundY + 0.85 * s), Math.hypot(cam.x - neckX, cam.z - neckZ)), -0.45, 0.5);
    glanceIn -= dt;
    if (glanceIn < 0) {
      glance = glance > 0 ? 0 : 1;
      glanceIn = glance ? 1.6 : 6 + r() * 6;
    }
    const on = Math.abs(yaw) < 1.95 && (wanted || (glance > 0 && gaitAmt > 0.3));
    lookW = damp(lookW, on ? 1 : 0, 3, dt);
    lookYaw = damp(lookYaw, on ? clamp(yaw, -1.4, 1.4) : clamp(turnRate * 0.35, -0.4, 0.4), 3.4, dt);
    lookPitch = damp(lookPitch, on ? pitch : 0, 3.4, dt);
  }

  function pose(dt, t) {
    for (const k of POSE_NAMES) weights[k] = damp(weights[k], want[k], k === 'stretch' ? 3.2 : 2.4, dt);
    const total = POSE_NAMES.reduce((sum, k) => sum + weights[k], 0) || 1;
    const body = [0, 0, 0, 0, 0, 0];
    const front = [0, 0];
    const hind = [0, 0];
    const headP = [0, 0];
    const tailP = [0, 0];
    for (const k of POSE_NAMES) {
      const w = weights[k] / total;
      const P = POSES[k];
      for (let i = 0; i < 6; i++) body[i] += P.body[i] * w;
      for (let i = 0; i < 2; i++) {
        front[i] += P.front[i] * w;
        hind[i] += P.hind[i] * w;
        headP[i] += P.head[i] * w;
        tailP[i] += P.tail[i] * w;
      }
    }
    const standW = weights.stand / total;
    const lieW = weights.lie / total;

    const stepSpeed = Math.max(agent.v, Math.abs(turnRate) * 0.42);
    gaitAmt = damp(gaitAmt, stepSpeed > 0.04 ? Math.min(1, 0.35 + stepSpeed) * standW : 0, 3.2, dt);
    const stride = 0.95 + 0.4 * agent.v + (agent.v < 0.1 ? 0.25 : 0);
    phase = (phase + (stepSpeed / stride) * dt) % 1;
    const swing = Math.sin(phase * TAU);

    const held = step && step.kind === 'hold' ? step : null;
    const roarT = held && held.roar ? held.t - 0.4 : -1;
    const yawnT = held && held.yawn >= 0 && held.t > held.yawn ? held.t - held.yawn : -1;
    const roarJ = roarT >= 0 ? roarJaw(roarT) : 0;
    const yawn = yawnT >= 0 ? yawnCurve(yawnT) : 0;
    const lapping = !!(held && held.drink && weights.crouch > 0.75);
    const lap = lapping ? Math.max(0, Math.sin(t * 3.6 * TAU)) : 0;
    jawOpen = damp(jawOpen, Math.max(roarJ, yawn * 0.95, lapping ? 0.06 + lap * 0.07 : 0), 12, dt);
    earsBack = damp(earsBack, roarT >= 0 ? 1 : yawn * 0.7, 6, dt);

    const bob = -0.016 * gaitAmt * (0.5 - 0.5 * Math.cos(phase * 2 * TAU));
    const lean = roarJ * 0.05;
    const hy = 0.8 + body[0] + bob - lean * 0.6;
    const hz = -0.5 + body[1];
    const aH = body[2] + 0.012 * gaitAmt * Math.sin(phase * 2 * TAU + 0.6);
    const aS = aH + body[3];
    const aC = aS + body[4] + lean;
    hips.position.set(0, hy, hz);
    hips.rotation.set(aH, 0.045 * gaitAmt * swing - clamp(turnRate * 0.1, -0.12, 0.12), 0.03 * gaitAmt * swing);
    spine.rotation.set(body[3], -0.045 * gaitAmt * swing + clamp(turnRate * 0.2, -0.22, 0.22), 0);
    chest.rotation.set(body[4] + lean, -0.04 * gaitAmt * swing + clamp(turnRate * 0.16, -0.18, 0.18), -0.03 * gaitAmt * Math.sin(phase * TAU + 1.6));

    const [s1y, s1z] = rotYZ(0, 0.42, aH);
    const [c1y, c1z] = rotYZ(0.04, 0.4, aS);
    const chestY = hy + s1y + c1y;
    const chestZ = hz + s1z + c1z;
    const [hjy, hjz] = rotYZ(0, -0.12, aH);

    for (const L of legs) {
      let tz = L.front ? front[0] : hind[0];
      let ang = L.front ? front[1] : hind[1];
      let ty = L.front ? FRONT_Y : HIND_Y;
      let flex = 0;
      let load = 0;
      if (gaitAmt > 0.001) {
        const ph = (phase + L.offset) % 1;
        const sweep = DUTY * stride * gaitAmt;
        if (ph < DUTY) {
          const u = ph / DUTY;
          tz += (0.5 - u) * sweep;
          ang += (u - 0.5) * (L.front ? 0.55 : 0.95) * gaitAmt;
          load = Math.sin(Math.PI * u) * gaitAmt;
        } else {
          const u = (ph - DUTY) / (1 - DUTY);
          tz += (u * u * (3 - 2 * u) - 0.5) * sweep;
          ty += Math.sin(Math.PI * u) * (L.front ? 0.12 : 0.11) * gaitAmt;
          flex = Math.sin(Math.PI * Math.min(1, u * 1.25)) * gaitAmt;
          ang += flex * (L.front ? 1.1 : 0.55);
        }
      }
      if (L.front) {
        const lift = 0.02 * load;
        const [py, pz] = rotYZ(0.11 + lift, -0.05, aC);
        const scapAbs = aC + REST.scap + body[5] - 0.4 * (tz - front[0]);
        const [qy, qz] = segYZ(SEG.scap, scapAbs);
        const [oy, oz] = segYZ(SEG.pastern, ang);
        const [a1, a2] = reach(chestY + py + qy, chestZ + pz + qz, ty - oy, tz - oz, SEG.humerus, SEG.radius, false);
        L.scap.position.y = 0.11 + lift;
        L.scap.rotation.x = scapAbs - aC;
        L.upper.rotation.x = a1 - scapAbs;
        L.lower.rotation.x = a2 - a1;
        L.pastern.rotation.x = ang - a2;
        L.paw.rotation.x = REST.pastern + flex * 0.9 - ang;
      } else {
        const [oy, oz] = segYZ(SEG.meta, ang);
        const [a1, a2] = reach(hy + hjy, hz + hjz, ty - oy, tz - oz, SEG.femur, SEG.tibia, true);
        L.upper.rotation.set(a1 - aH, 0, L.side * 0.3 * lieW);
        L.lower.rotation.x = a2 - a1;
        L.pastern.rotation.x = ang - a2;
        L.paw.rotation.x = REST.meta + flex * 0.7 - ang;
      }
    }

    const lapBob = lapping ? 0.05 * Math.sin(t * 3.6 * TAU) : 0;
    const steady = 0.04 * gaitAmt * swing;
    neck.rotation.set(headP[0] - aC * 0.6 + lookPitch * lookW * 0.45 - roarJ * 0.12, lookYaw * 0.55 + steady, 0);
    head.rotation.set(headP[1] - aC * 0.25 + lookPitch * lookW * 0.45 - roarJ * 0.38 - yawn * 0.45 + lapBob, lookYaw * 0.45, lookW * 0.06 * Math.sin(t * 0.4));
    jaw.rotation.x = jawOpen;
    tongue.position.z = 0.04 + lap * 0.055 + yawn * 0.02;

    blinkIn -= dt;
    if (blinkIn < 0) {
      blink = 1;
      blinkIn = 2.2 + r() * 4.5;
    }
    blink = Math.max(0, blink - dt / 0.16);
    const lid = Math.max(Math.sin(Math.PI * blink), yawn, roarJ > 0.3 ? 0.35 : 0);
    for (const e of eyes) e.scale.set(1, 1 - lid * 0.85, 1);
    ears.forEach((e, i) => {
      earIn[i] -= dt;
      if (earIn[i] < 0) {
        earFlick[i] = 1;
        earIn[i] = 2.5 + r() * 6;
      }
      earFlick[i] = Math.max(0, earFlick[i] - dt / 0.22);
      const f = Math.sin(Math.PI * earFlick[i]);
      const s = i ? 1 : -1;
      e.rotation.set(earsBack * 0.75 + f * 0.35, s * f * 0.3, s * (earsBack * 0.45 - f * 0.12));
    });

    breathClock += dt * (roarCooldown > 40 ? 1.9 : 1.25);
    const breath = Math.sin(breathClock * TAU * 0.3);
    ribs.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1);

    tailClock += dt * (1 + gaitAmt * 0.6);
    if (t - flickAt > flickGap) {
      flickAt = t;
      flickGap = 4 + r() * 12;
    }
    const flick = Math.max(0, 1 - (t - flickAt) / 1.1);
    const alert = roarT >= 0 ? 1 : 0;
    tail.forEach((b, i) => {
      const k = i / (tail.length - 1);
      const wave = Math.sin((1 - flick) * 9 - i * 0.9) * flick * 0.35 * k;
      b.rotation.x = TAIL_REST[i] + (i === 0 ? tailP[0] + gaitAmt * 0.22 + alert * 0.3 : (tailP[0] > 0.3 ? -0.04 : 0) + gaitAmt * 0.02 * i);
      b.rotation.y = Math.sin(tailClock * 1.6 - i * 0.55) * (0.08 + 0.1 * gaitAmt) * (0.25 + k) + tailP[1] * (i ? 1 : 0.4) - clamp(turnRate, -1, 1) * 0.12 * (1 - k) + wave;
    });
  }

  function ground(dt) {
    const s = root.scale.x;
    const fx = Math.sin(agent.heading) * 0.75 * s;
    const fz = Math.cos(agent.heading) * 0.75 * s;
    const hf = heightAt(agent.x + fx, agent.z + fz);
    const hb = heightAt(agent.x - fx, agent.z - fz);
    const y = (hf + hb) / 2;
    const pitch = -Math.atan2(hf - hb, 1.5 * s);
    groundY = dt ? damp(groundY, y, 10, dt) : y;
    slope = dt ? damp(slope, pitch, 8, dt) : pitch;
    root.position.set(agent.x, groundY, agent.z);
    root.rotation.set(slope, agent.heading, 0);
  }

  function update(dt, t, ctx = {}) {
    const cam = ctx.camera ? ctx.camera.position : fallbackEye.set(agent.x - 6, groundY + 2, agent.z);
    roarCooldown -= dt;
    const watching = think(dt, cam);
    turnRate = damp(turnRate, dt > 0 ? clamp(wrap(agent.heading - prevHeading) / dt, -2, 2) : 0, 6, dt);
    prevHeading = agent.heading;
    look(dt, cam, watching);
    pose(dt, t);
    ground(dt);
    const s = root.scale.x;
    focus.set(agent.x, groundY + (0.62 + weights.sit * 0.12 - weights.lie * 0.3 - weights.crouch * 0.1) * s, agent.z);
    if (step && step.kind === 'hold' && step.drink && weights.crouch > 0.8) {
      lapIn -= dt;
      if (lapIn < 0) {
        lapIn = 0.55;
        root.updateMatrixWorld(true);
        head.localToWorld(mouth.set(0, -0.06, 0.3));
        emit('tiger-lap', { position: mouth, ripple: 0.3 });
      }
    }
  }

  // Settle straight into the opening pose, so a still frame (reduced motion) is already composed.
  update(0, 0);
  for (const k of POSE_NAMES) weights[k] = want[k];
  update(0, 0);

  return {
    object: root,
    position: root.position,
    /** Mid-body in world space, for the camera to frame. */
    focus,
    roar() {
      if (step && step.roar) return;
      begin(act('roar'));
    },
    update,
  };
}
