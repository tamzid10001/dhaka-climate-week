import * as THREE from 'three';
import { TAU, loft, merge, paint, rng, damp, clamp, smoothstep } from '../util.js';
import { riverX, riverW } from '../terrain.js';
import { rod, ellipsoid } from './rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (g, c) => paint(g, c, { under: 0.72, top: 1.05 });

/** Rhesus macaques sitting in the canopy, looking about and leaping from crown to crown. */
export function createMonkeys({ mat, hosts, emit, seed = 17 }) {
  const group = new THREE.Group();
  const r = rng(seed);
  const troop = hosts.map((host, i) => {
    const root = new THREE.Group();
    const torso = loft([{ z: 0, w: 0.11, h: 0.1 }, { z: 0.14, w: 0.12, h: 0.11 }, { z: 0.3, w: 0.1, h: 0.09 }, { z: 0.36, w: 0.06, h: 0.06 }], { radial: 10, region: 0 });
    torso.rotateX(-1.2);
    const limbs = [-1, 1].flatMap((s) => [
      rod(V(s * 0.09, 0.3, 0.1), V(s * 0.08, 0.1, 0.2), 0.03, 0.022, 0),
      rod(V(s * 0.07, 0.05, 0.02), V(s * 0.08, 0.1, 0.22), 0.04, 0.03, 0),
      rod(V(s * 0.08, 0.1, 0.22), V(s * 0.07, -0.12, 0.24), 0.028, 0.022, 0),
    ]);
    root.add(new THREE.Mesh(merge([torso, ...limbs]), mat));
    const head = new THREE.Group();
    head.position.set(0, 0.4, 0.14);
    head.add(new THREE.Mesh(merge([ellipsoid(0.07, 0.075, 0.075, { region: 1 }), ...[-1, 1].map((s) => ellipsoid(0.012, 0.01, 0.008, { at: [s * 0.03, 0.015, 0.068], region: 5, n: 3, radial: 6 }))]), mat));
    root.add(head);
    const tail = new THREE.Group();
    tail.position.set(0, 0.03, -0.08);
    const tg = loft([{ z: 0, w: 0.022, h: 0.022 }, { z: 0.32, w: 0.016, h: 0.016 }], { radial: 6, region: 3 });
    tg.rotateX(Math.PI / 2);
    tail.add(new THREE.Mesh(tg, mat));
    root.add(tail);
    root.scale.setScalar(1.05);
    group.add(root);
    return { root, head, tail, at: host.clone(), from: host.clone(), to: host.clone(), leap: -1, next: 6 + r() * 14, look: 0, lookT: 0, heading: r() * TAU, ph: r() * TAU, i };
  });
  const tmp = new THREE.Vector3();
  return {
    object: group,
    update(dt, t) {
      for (const m of troop) {
        m.lookT -= dt;
        if (m.lookT < 0) {
          m.lookT = 1.5 + r() * 3.5;
          m.look = (r() - 0.5) * 2.2;
        }
        m.head.rotation.y = damp(m.head.rotation.y, m.look, 5, dt);
        m.head.rotation.x = Math.sin(t * 0.9 + m.ph) * 0.12;
        m.tail.rotation.z = Math.sin(t * 1.2 + m.ph) * 0.25;
        m.next -= dt;
        if (m.leap < 0 && m.next < 0) {
          m.next = 10 + r() * 18;
          const options = troop.length > 1 ? hosts.filter((h) => h.distanceTo(m.at) < 16 && h.distanceTo(m.at) > 2) : [];
          if (options.length) {
            m.from.copy(m.at);
            m.to.copy(options[Math.floor(r() * options.length)]);
            m.leap = 0;
            m.heading = Math.atan2(m.to.x - m.from.x, m.to.z - m.from.z);
            if (r() < 0.6) emit('monkey-call', { position: m.at });
          }
        }
        if (m.leap >= 0) {
          m.leap += dt / 1.1;
          const k = clamp(m.leap);
          tmp.copy(m.from).lerp(m.to, k);
          tmp.y += Math.sin(k * Math.PI) * 2.2;
          m.at.copy(tmp);
          m.root.rotation.x = Math.sin(k * Math.PI) * 0.9;
          if (m.leap >= 1) {
            m.leap = -1;
            m.at.copy(m.to);
            m.root.rotation.x = 0;
            emit('branch', { position: m.at });
          }
        }
        m.root.position.set(m.at.x, m.at.y - 1.1, m.at.z);
        m.root.rotation.y = m.heading;
      }
    },
  };
}

/** Synchronous fireflies: clusters on the keora along the night banks flash together in waves. */
export function createFireflies({ count, zFrom, zTo, seed = 23 }) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const seedAttr = new Float32Array(count * 2);
  const clusters = Math.max(6, Math.round(count / 26));
  const centres = Array.from({ length: clusters }, () => {
    const z = zFrom + (zTo - zFrom) * r();
    const side = r() < 0.5 ? -1 : 1;
    return [riverX(z) + side * (riverW(z) + 1 + r() * 10), 1.5 + r() * 4, z, r() * TAU];
  });
  for (let i = 0; i < count; i++) {
    const c = centres[i % clusters];
    pos.set([c[0] + (r() - 0.5) * 7, c[1] + (r() - 0.5) * 3.5, c[2] + (r() - 0.5) * 7], i * 3);
    seedAttr.set([r(), c[3]], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr, 2));
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      uniform float uNight;
      uniform float uScale;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float s = aSeed.x * 6.2831;
        p += vec3(sin(uTime * 0.5 + s) * 0.6, sin(uTime * 0.7 + s * 1.3) * 0.35, cos(uTime * 0.43 + s * 0.7) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float wave = sin(uTime * 0.31 + aSeed.y) * 0.5 + 0.5;
        float flash = pow(max(0.0, sin(uTime * 5.4 + aSeed.y + aSeed.x * 0.5)), 10.0) * smoothstep(0.25, 0.6, wave);
        float idle = 0.12 + 0.1 * sin(uTime * 1.7 + s * 3.0);
        vGlow = (flash + idle) * uNight * exp(-length(mv.xyz) * 0.011);
        gl_PointSize = uScale * (5.0 + 9.0 * flash) * 22.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.86, 1.0, 0.48) * a * a * vGlow * 1.6, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    update(dt, t, ctx) {
      uniforms.uTime.value = t;
      uniforms.uNight.value = smoothstep(0.25, 0.75, ctx.night);
      uniforms.uScale.value = Math.min(2, window.devicePixelRatio || 1);
      points.visible = uniforms.uNight.value > 0.01;
    },
  };
}

/** A wooden nouka with a golpata canopy and a boatman at the stern oar; its lantern lights at dusk. */
export function createBoat({ mat, z0 = -690, z1 = -830, off = 6, emit }) {
  const root = new THREE.Group();
  const hull = col(
    loft(
      [
        { z: -3, w: 0.05, h: 0.05, y: 0.8 },
        { z: -2.6, w: 0.35, h: 0.25, y: 0.45, p: 2.4 },
        { z: -1.6, w: 0.72, h: 0.32, y: 0.24, p: 3 },
        { z: 0, w: 0.86, h: 0.34, y: 0.2, p: 3.2 },
        { z: 1.6, w: 0.72, h: 0.32, y: 0.24, p: 3 },
        { z: 2.6, w: 0.35, h: 0.25, y: 0.45, p: 2.4 },
        { z: 3.05, w: 0.05, h: 0.05, y: 0.85 },
      ],
      { radial: 16 }
    ),
    '#3e2c1f'
  );
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const roof = col(new THREE.CylinderGeometry(0.78, 0.78, 2.2, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.5, 0.2), '#8c6c3e');
  const man = merge([
    col(rod(V(0, 0.5, -2.2), V(0, 1.05, -2.15), 0.13, 0.12, 0, 8), '#3b5f7c'),
    col(rod(V(0, 1.05, -2.15), V(0, 1.5, -2.12), 0.14, 0.12, 0, 8), '#d9d2c2'),
    col(ellipsoid(0.1, 0.12, 0.1, { at: [0, 1.66, -2.1] }), '#5e3f2b'),
    col(ellipsoid(0.11, 0.05, 0.11, { at: [0, 1.76, -2.1] }), '#b8442e'),
  ]);
  root.add(new THREE.Mesh(merge([hull, man]), mat), new THREE.Mesh(roof, roofMat));
  const oar = new THREE.Group();
  oar.position.set(0.25, 0.9, -2.35);
  oar.add(new THREE.Mesh(merge([col(rod(V(0, 0.4, 0.1), V(0.4, -1.1, -1.4), 0.03, 0.03, 0, 5), '#6a5034'), col(ellipsoid(0.05, 0.16, 0.22, { at: [0.42, -1.15, -1.45] }), '#6a5034')]), mat));
  root.add(oar);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf7a', fog: false }));
  flame.position.set(0, 0.95, 2.55);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffb54d', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, map: glowTexture() }));
  glow.position.copy(flame.position);
  root.add(flame, glow);

  let z = z0;
  let stroke = 0;
  const blade = new THREE.Vector3();
  root.position.set(riverX(z) + off, 0, z);
  return {
    object: root,
    position: root.position,
    update(dt, t, ctx) {
      z -= dt * 0.55;
      if (z < z1 && Math.abs(ctx.camera.position.z - z) > 160) z = z0;
      const x = riverX(z) + off;
      const ahead = riverX(z - 2) + off;
      root.position.set(x, -0.08 + Math.sin(t * 1.1) * 0.03, z);
      root.rotation.set(Math.sin(t * 0.9) * 0.015, Math.atan2(ahead - x, -2), Math.sin(t * 0.7) * 0.02);
      const row = Math.sin(t * 1.4);
      oar.rotation.y = row * 0.35;
      oar.rotation.x = Math.max(0, Math.cos(t * 1.4)) * 0.12;
      stroke -= dt;
      if (stroke < 0) {
        stroke = TAU / 1.4;
        oar.localToWorld(blade.set(0.42, -1.15, -1.45));
        blade.y = 0;
        emit('oar', { position: blade, ripple: 0.45 });
      }
      const lit = smoothstep(0.42, 0.62, ctx.tod);
      flame.visible = lit > 0.02;
      glow.visible = flame.visible;
      glow.material.opacity = lit * (0.85 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04);
      glow.scale.setScalar(1.6 + lit * 1.2);
    },
  };
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Irrawaddy dolphins rolling up through the brown water ahead of the boat with a soft blow. */
export function createDolphins({ mat, count = 2, emit, seed = 29 }) {
  const r = rng(seed);
  const group = new THREE.Group();
  const geo = merge([
    col(loft([{ z: -0.9, w: 0.03, h: 0.05 }, { z: -0.6, w: 0.12, h: 0.14 }, { z: 0, w: 0.24, h: 0.26 }, { z: 0.5, w: 0.22, h: 0.23 }, { z: 0.75, w: 0.12, h: 0.12 }], { radial: 12 }), '#7b878a'),
    col(rod(V(0, 0.2, -0.1), V(0, 0.33, -0.28), 0.06, 0.01, 0, 5), '#6c777a'),
  ]);
  const pods = Array.from({ length: count }, () => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.order = 'YXZ';
    m.visible = false;
    group.add(m);
    return { m, wait: 4 + r() * 10, t: -1, at: new THREE.Vector3(), heading: 0 };
  });
  return {
    object: group,
    update(dt, t, ctx) {
      for (const d of pods) {
        if (d.t < 0) {
          d.wait -= dt;
          if (d.wait < 0) {
            const ahead = 35 + r() * 90;
            const zz = ctx.camera.position.z + ctx.forward.z * ahead;
            d.at.set(riverX(zz) + (r() - 0.5) * riverW(zz) * 1.1, 0, zz);
            d.heading = r() * TAU;
            d.t = 0;
            d.m.visible = true;
            emit('dolphin', { position: d.at, ripple: 0.9 });
          }
          continue;
        }
        d.t += dt / 1.6;
        const k = d.t;
        d.m.position.set(d.at.x + Math.sin(d.heading) * (k - 0.5) * 2, Math.sin(k * Math.PI) * 0.75 - 0.62, d.at.z + Math.cos(d.heading) * (k - 0.5) * 2);
        d.m.rotation.set((k - 0.5) * 1.4, d.heading, 0);
        if (k >= 1) {
          d.t = -1;
          d.wait = 7 + r() * 12;
          d.m.visible = false;
          emit('splash-small', { position: d.m.position, ripple: 0.6 });
        }
      }
    },
  };
}
