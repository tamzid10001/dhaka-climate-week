import * as THREE from 'three';
import { TAU, loft, limb, merge, dampAngle, damp } from '../util.js';
import { heightAt } from '../terrain.js';

const Z = new THREE.Vector3(0, 0, 1);

/** A tapered rod between two points, as a loft (so it keeps the coat attribute and merges). */
export function rod(a, b, r0, r1, region = 0, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = loft([{ z: 0, w: r0, h: r0 }, { z: dir.length(), w: r1, h: r1 }], { radial, region });
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

export function ellipsoid(rx, ry, rz, { at = [0, 0, 0], region = 0, n = 6, radial = 10, p = 2 } = {}) {
  const secs = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const k = Math.sqrt(Math.max(0.002, 1 - t * t));
    secs.push({ z: at[2] + t * rz, w: rx * k, h: ry * k, x: at[0], y: at[1], p });
  }
  return loft(secs, { radial, region });
}

const shadowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(18,14,8,0.62)');
  grd.addColorStop(0.55, 'rgba(18,14,8,0.28)');
  grd.addColorStop(1, 'rgba(18,14,8,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

/** Soft contact shadow so animals sit on the mud instead of hovering over it. */
export function blobShadow(w, l) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
  );
  m.position.y = 0.04;
  m.renderOrder = 2;
  return m;
}

/**
 * Quadruped skeleton from lofted parts: root (ground, heading) → body (bob, roll) → neck → head → jaw,
 * four legs (hip → knee) and a tail chain. Everything faces +z.
 */
export function buildRig(spec, mat) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  body.add(new THREE.Mesh(loft(spec.torso, { radial: 14, region: 0 }), mat));

  const neck = new THREE.Group();
  neck.position.fromArray(spec.neck.at);
  body.add(neck);
  if (spec.neck.sections) neck.add(new THREE.Mesh(loft(spec.neck.sections, { radial: 12, region: 0 }), mat));
  const head = new THREE.Group();
  head.position.fromArray(spec.head.at);
  neck.add(head);
  head.add(new THREE.Mesh(merge(spec.head.parts), mat));
  let jaw = null;
  if (spec.head.jaw) {
    jaw = new THREE.Group();
    jaw.position.fromArray(spec.head.jaw.at);
    jaw.add(new THREE.Mesh(spec.head.jaw.geo, mat));
    head.add(jaw);
  }

  let drop = 0;
  const legs = spec.legs.map((L) => {
    const hip = new THREE.Group();
    hip.position.fromArray(L.at);
    body.add(hip);
    const up = L.upper.at(-1).z;
    const lo = L.lower.at(-1).z;
    hip.add(new THREE.Mesh(limb(L.upper, { radial: 9, region: 2 }), mat));
    const knee = new THREE.Group();
    knee.position.y = -up;
    hip.add(knee);
    const foot = loft(L.foot.map((s) => ({ ...s, y: (s.y || 0) - lo })), { radial: 8, region: L.footRegion ?? 2, along0: up + lo });
    knee.add(new THREE.Mesh(merge([limb(L.lower, { radial: 8, region: 2, along0: up }), foot]), mat));
    const rest = L.rest || 0;
    const kneeRest = L.kneeRest || 0;
    drop = Math.max(drop, up * Math.cos(rest) + lo * Math.cos(rest + kneeRest) + (L.sole || 0.03) - L.at[1]);
    return { hip, knee, front: L.front, offset: L.offset * TAU, rest, kneeRest };
  });

  const tail = [];
  let parent = body;
  let along = 0;
  for (let i = 0; i < (spec.tail?.segments.length || 0); i++) {
    const secs = spec.tail.segments[i];
    const g = new THREE.Group();
    if (i === 0) g.position.fromArray(spec.tail.at);
    else g.position.z = -spec.tail.segments[i - 1].at(-1).z;
    const geo = loft(secs, { radial: 8, region: 3, along0: along });
    geo.rotateY(Math.PI);
    g.add(new THREE.Mesh(geo, mat));
    g.rotation.x = spec.tail.rest?.[i] || 0;
    parent.add(g);
    along += secs.at(-1).z - secs[0].z;
    tail.push(g);
    parent = g;
  }

  const baseY = drop;
  body.position.y = baseY;
  return { root, body, neck, head, jaw, legs, tail, baseY, tailRest: spec.tail?.rest || [] };
}

/** Walk / trot cycle. `phase` advances with distance travelled; `amt` 0 stands still, 1 full stride. */
export function gait(rig, phase, amt, { swing = 0.42, lift = 0.75, bob = 0.025, roll = 0.025 } = {}) {
  for (const L of rig.legs) {
    const ph = phase + L.offset;
    const up = Math.max(0, Math.cos(ph));
    L.hip.rotation.x = L.rest - Math.sin(ph) * swing * amt;
    L.knee.rotation.x = L.kneeRest + (L.front ? 1 : -1) * up * up * lift * amt;
  }
  rig.body.position.y = rig.baseY + Math.cos(phase * 2) * bob * amt;
  rig.body.rotation.z = Math.sin(phase) * roll * amt;
}

export function swayTail(rig, time, amp = 0.22, speed = 1.1, droop = 0) {
  rig.tail.forEach((g, i) => {
    g.rotation.y = Math.sin(time * speed - i * 0.75) * amp * (0.5 + i * 0.25);
    g.rotation.x = (rig.tailRest[i] || 0) + droop * (i === 0 ? 1 : 0);
  });
}

/** Steer an agent ({ x, z, heading }) toward a target. Returns remaining distance and speed. */
export function steer(agent, tx, tz, speed, dt, turn = 2.4) {
  const dx = tx - agent.x;
  const dz = tz - agent.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  agent.heading = dampAngle(agent.heading, want, turn, dt);
  const align = Math.max(0, Math.cos(want - agent.heading));
  const v = Math.min(speed, dist * 1.4) * (0.25 + 0.75 * align * align);
  agent.x += Math.sin(agent.heading) * v * dt;
  agent.z += Math.cos(agent.heading) * v * dt;
  return { dist, v };
}

/** Put the rig on the ground at the agent position, pitched to the slope. */
export function ground(rig, agent, dt, length = 1.4, lift = 0) {
  const sx = Math.sin(agent.heading) * length * 0.5;
  const sz = Math.cos(agent.heading) * length * 0.5;
  const hf = heightAt(agent.x + sx, agent.z + sz);
  const hb = heightAt(agent.x - sx, agent.z - sz);
  const y = (hf + hb) * 0.5 + lift;
  rig.root.position.set(agent.x, dt ? damp(rig.root.position.y, y, 10, dt) : y, agent.z);
  rig.root.rotation.y = agent.heading;
  rig.root.rotation.x = damp(rig.root.rotation.x, -Math.atan2(hf - hb, length), 8, dt || 1);
}
