import * as THREE from 'three';
import { TAU, loft, merge, paint, rng, damp, smoothstep, clamp } from '../util.js';
import { heightAt } from '../terrain.js';
import { rod, ellipsoid } from './rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (g, c) => paint(g, c, { under: 0.8, top: 1.04 });

const KINDS = {
  egret: { body: '#f2f0e8', wing: '#f6f4ee', tip: '#e6e4dc', bill: '#e0b13b', leg: '#1f1c18', s: 1, span: 0.55, chord: 0.18, bill_: 0.13, legs: true, hz: 15 },
  kite: { body: '#94451f', head: '#f0ebe0', wing: '#9a4a22', tip: '#2a1c14', bill: '#d9c36c', s: 1.05, span: 0.64, chord: 0.21, bill_: 0.04, hz: 11 },
  kingfisher: { body: '#1d6fb6', head: '#6e3519', wing: '#2179c4', tip: '#123d6b', bill: '#c62f1b', s: 0.5, span: 0.2, chord: 0.075, bill_: 0.1, hz: 40 },
  bat: { body: '#2a211c', wing: '#35281f', tip: '#221a15', s: 0.62, span: 0.5, chord: 0.17, bill_: 0, hz: 46 },
};

function wing(k, side) {
  const g = loft(
    [
      { z: 0, w: k.chord * 0.5, h: 0.012 },
      { z: k.span * 0.45, w: k.chord * 0.48, h: 0.01, x: side * 0.01 },
      { z: k.span * 0.8, w: k.chord * 0.34, h: 0.007, x: side * 0.035 },
      { z: k.span, w: k.chord * 0.1, h: 0.004, x: side * 0.06 },
    ],
    { radial: 6 }
  );
  g.rotateY((side * Math.PI) / 2);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const a = new THREE.Color(k.wing);
  const b = new THREE.Color(k.tip);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    t.copy(a).lerp(b, smoothstep(0.55, 1, Math.abs(p.getX(i)) / k.span));
    c.set([t.r, t.g, t.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function makeBird(kind, mat) {
  const k = KINDS[kind];
  const s = k.s;
  const parts = [
    col(ellipsoid(0.062 * s, 0.066 * s, 0.18 * s, { n: 6 }), k.body),
    col(ellipsoid(0.04 * s, 0.042 * s, 0.05 * s, { at: [0, 0.03 * s, 0.2 * s], n: 4, radial: 8 }), k.head || k.body),
    col(loft([{ z: -0.33 * s, w: 0.065 * s, h: 0.006 }, { z: -0.15 * s, w: 0.03 * s, h: 0.012 }], { radial: 6 }), k.tip),
  ];
  if (k.bill_) parts.push(col(rod(V(0, 0.028 * s, 0.24 * s), V(0, 0.018 * s, 0.24 * s + k.bill_ * s), 0.012 * s, 0.002, 0, 5), k.bill));
  if (k.legs) for (const x of [-0.02, 0.02]) parts.push(col(rod(V(x, -0.03, -0.1), V(x, -0.045, -0.46), 0.007, 0.005, 0, 4), k.leg));
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(new THREE.Mesh(merge(parts), mat));
  const wl = new THREE.Mesh(wing(k, -1), mat);
  const wr = new THREE.Mesh(wing(k, 1), mat);
  wl.position.set(-0.04 * s, 0.02 * s, 0.03 * s);
  wr.position.set(0.04 * s, 0.02 * s, 0.03 * s);
  root.add(wl, wr);
  return { root, wl, wr, k };
}

const flap = (b, a) => {
  b.wr.rotation.z = a;
  b.wl.rotation.z = -a;
};

function standingEgret(mat) {
  const k = KINDS.egret;
  const root = new THREE.Group();
  const body = col(ellipsoid(0.07, 0.075, 0.17, { n: 6 }), k.body);
  body.rotateX(-0.55);
  body.translate(0, 0.58, 0);
  const legs = [-0.03, 0.03].map((x) => col(rod(V(x, 0.52, 0), V(x, -0.05, 0.02), 0.008, 0.006, 0, 4), k.leg));
  root.add(new THREE.Mesh(merge([body, ...legs]), mat));
  const neck = new THREE.Group();
  neck.position.set(0, 0.66, 0.09);
  neck.add(
    new THREE.Mesh(
      merge([
        col(rod(V(0, 0, 0), V(0, 0.12, 0.05), 0.022, 0.018, 0, 6), k.body),
        col(rod(V(0, 0.12, 0.05), V(0, 0.22, -0.01), 0.018, 0.016, 0, 6), k.body),
        col(ellipsoid(0.028, 0.03, 0.045, { at: [0, 0.235, 0.02], n: 4, radial: 8 }), k.body),
        col(rod(V(0, 0.232, 0.05), V(0, 0.22, 0.17), 0.009, 0.002, 0, 5), k.bill),
      ]),
      mat
    )
  );
  root.add(neck);
  return { root, neck };
}

/**
 * Egret flocks crossing the river (larger ones flying to roost at dusk), Brahminy kites circling, a
 * kingfisher diving from its perch, wading egrets striking at fish and fruit bats after dark.
 */
export function createBirds({ mat, emit, tier, perch, waders }) {
  const group = new THREE.Group();
  const r = rng(41);
  const tmp = new THREE.Vector3();

  const flock = Array.from({ length: tier ? 13 : 7 }, (_, i) => ({ ...makeBird('egret', mat), slot: (i % 2 ? 1 : -1) * Math.ceil(i / 2), ph: r() * TAU, dy: (r() - 0.5) * 1.6 }));
  flock.forEach((b) => group.add(b.root));
  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let flight = -1;
  let wait = 3;

  const kites = Array.from({ length: 3 }, () => ({ ...makeBird('kite', mat), R: 22 + r() * 22, w: (r() < 0.5 ? -1 : 1) * (0.16 + r() * 0.08), ph: r() * TAU, h: 32 + r() * 26 }));
  kites.forEach((b) => group.add(b.root));
  const kiteCentre = new THREE.Vector3();
  let kiteCall = 9;

  const bats = Array.from({ length: tier ? 12 : 6 }, () => ({ ...makeBird('bat', mat), ph: r() * TAU, a: 0.3 + r() * 0.4, R: 10 + r() * 18, h: 9 + r() * 16 }));
  bats.forEach((b) => group.add(b.root));

  const king = makeBird('kingfisher', mat);
  const stick = new THREE.Mesh(col(rod(V(0, -0.4, 0), V(0.08, 1.15, 0.02), 0.035, 0.018, 0, 5), '#5a4a3a'), mat);
  stick.position.copy(perch.base);
  group.add(king.root, stick);
  const seat = perch.base.clone().add(V(0.08, 1.2, 0.02));
  let dive = 6 + r() * 6;
  let diveT = -1;
  let kingCall = 14;

  const wading = waders.map((p, i) => {
    const e = standingEgret(mat);
    e.root.position.set(p.x, heightAt(p.x, p.z), p.z);
    e.root.rotation.y = p.heading;
    group.add(e.root);
    return { ...e, next: 3 + r() * 9, strike: -1, look: 0, i };
  });

  return {
    object: group,
    update(dt, t, ctx) {
      const { camera, forward, night, tod } = ctx;
      const day = 1 - smoothstep(0.55, 0.85, night);

      // Egret flights: a line across the river ahead of the boat; dusk brings the big roosting flocks.
      const active = tod > 0.45 && tod < 0.85 ? flock.length : Math.ceil(flock.length * 0.45);
      if (flight < 0) {
        wait -= dt;
        flock.forEach((b) => (b.root.visible = false));
        if (wait < 0 && day > 0.2) {
          const ahead = 60 + r() * 100;
          const ang = Math.atan2(forward.x, forward.z) + (r() < 0.5 ? 1 : -1) * (1.25 + r() * 0.6);
          dir.set(Math.sin(ang), 0, Math.cos(ang));
          from.set(camera.position.x + forward.x * ahead - dir.x * 110, 9 + r() * 14, camera.position.z + forward.z * ahead - dir.z * 110);
          flight = 0;
        }
      } else {
        flight += dt * 8.5;
        flock.forEach((b, i) => {
          b.root.visible = i < active;
          if (!b.root.visible) return;
          const back = Math.abs(b.slot) * 1.7;
          const lat = b.slot * 1.4;
          b.root.position.set(from.x + dir.x * (flight - back) - dir.z * lat, from.y + b.dy + Math.sin(t * 0.8 + b.ph) * 0.25, from.z + dir.z * (flight - back) + dir.x * lat);
          b.root.rotation.y = Math.atan2(dir.x, dir.z);
          const glide = smoothstep(0.6, 0.9, Math.sin(t * 0.4 + b.ph));
          flap(b, Math.sin(t * b.k.hz + b.ph) * 0.55 * (1 - glide * 0.85) + 0.05);
        });
        if (flight > 230) {
          flight = -1;
          wait = 6 + r() * 12;
        }
      }

      // Kites ride thermals over the channel ahead.
      tmp.copy(camera.position).addScaledVector(forward, 85);
      if (kiteCentre.lengthSq() === 0) kiteCentre.copy(tmp);
      kiteCentre.x = damp(kiteCentre.x, tmp.x, 0.25, dt);
      kiteCentre.z = damp(kiteCentre.z, tmp.z, 0.25, dt);
      kites.forEach((b) => {
        b.root.visible = day > 0.15;
        const a = t * b.w + b.ph;
        b.root.position.set(kiteCentre.x + Math.cos(a) * b.R, b.h + Math.sin(t * 0.2 + b.ph) * 2, kiteCentre.z + Math.sin(a) * b.R);
        b.root.rotation.y = Math.atan2(-Math.sin(a) * b.w, Math.cos(a) * b.w);
        b.root.rotation.z = -Math.sign(b.w) * 0.3;
        const burst = smoothstep(0.85, 0.95, Math.sin(t * 0.23 + b.ph * 3));
        flap(b, 0.1 + Math.sin(t * b.k.hz) * 0.45 * burst);
      });
      kiteCall -= dt;
      if (kiteCall < 0 && day > 0.4) {
        kiteCall = 16 + r() * 24;
        emit('kite', { position: kites[0].root.position });
      }

      // Kingfisher: perch, plunge, splash, back to the perch.
      kingCall -= dt;
      if (kingCall < 0 && day > 0.3) {
        kingCall = 18 + r() * 20;
        emit('kingfisher', { position: seat });
      }
      if (diveT < 0) {
        dive -= dt;
        king.root.position.copy(seat);
        king.root.position.y += 0.02;
        king.root.rotation.set(-0.5, perch.heading + Math.sin(t * 0.7) * 0.4, 0);
        flap(king, -0.9);
        if (dive < 0) diveT = 0;
      } else {
        diveT += dt;
        const out = clamp(diveT / 0.7);
        const back = clamp((diveT - 1.1) / 0.9);
        const k = diveT < 1.1 ? out : 1 - back;
        tmp.copy(seat).lerp(perch.water, k);
        tmp.y = seat.y * (1 - k) + perch.water.y * k + Math.sin(k * Math.PI) * 0.8;
        king.root.position.copy(tmp);
        king.root.rotation.set(diveT < 1.1 ? 0.9 * out : -0.3, perch.heading + (diveT < 1.1 ? 0 : Math.PI), 0);
        king.root.visible = !(diveT > 0.7 && diveT < 1.1);
        flap(king, Math.sin(t * king.k.hz) * 0.7);
        if (diveT > 0.7 && diveT - dt <= 0.7) emit('splash', { position: perch.water, ripple: 0.8 });
        if (diveT > 2) {
          diveT = -1;
          dive = 9 + r() * 10;
          king.root.visible = true;
        }
      }

      // Wading egrets.
      for (const w of wading) {
        w.next -= dt;
        if (w.next < 0 && w.strike < 0) {
          w.strike = 0;
          w.next = 5 + r() * 12;
          w.look = (r() - 0.5) * 1.2;
        }
        let x = 0;
        if (w.strike >= 0) {
          w.strike += dt;
          x = w.strike < 0.14 ? (w.strike / 0.14) * 1.25 : 1.25 * Math.max(0, 1 - (w.strike - 0.25) / 0.6);
          if (w.strike > 0.14 && w.strike - dt <= 0.14) {
            w.neck.localToWorld(tmp.set(0, 0.22, 0.2));
            emit('splash-small', { position: tmp, ripple: 0.35 });
          }
          if (w.strike > 0.9) w.strike = -1;
        }
        w.neck.rotation.x = x;
        w.neck.rotation.y = damp(w.neck.rotation.y, w.look, 1.5, dt);
      }

      // Fruit bats wheel over the trees once the light goes.
      const batsOn = smoothstep(0.35, 0.7, night);
      tmp.copy(camera.position).addScaledVector(forward, 45);
      bats.forEach((b) => {
        b.root.visible = batsOn > 0.05;
        if (!b.root.visible) return;
        const a = t * b.a + b.ph;
        b.root.position.set(tmp.x + Math.sin(a) * b.R, b.h + Math.sin(a * 2.3) * 3, tmp.z + Math.sin(a * 0.7 + 1) * b.R);
        b.root.rotation.y = a + Math.PI / 2;
        flap(b, Math.sin(t * b.k.hz + b.ph) * 0.8);
      });
    },
  };
}
