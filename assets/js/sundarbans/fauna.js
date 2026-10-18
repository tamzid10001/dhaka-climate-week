import * as THREE from 'three';
import { riverX, bankX, heightAt, CHARS, MEADOWS } from './terrain.js';
import { coatMaterial, coatUniforms, paintedMaterial } from './fauna/coat.js';
import { bankArea } from './fauna/areas.js';
import { createDeerHerd } from './fauna/deer.js';
import { createBaskingCroc, createSwimmingCroc } from './fauna/croc.js';
import { createBirds } from './fauna/birds.js';
import { createMonkeys, createFireflies, createBoat, createDolphins } from './fauna/life.js';

/*
 * The wildlife along the journey. Chital and macaques keep to the clearings, crocodiles to the mud,
 * egrets and kites overhead, the boatman at dusk and fireflies at night. Animals far from the boat
 * are hidden and not simulated.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const meadowCentre = (md) => V(bankX(md.z, md.side, md.depth * 0.3), 0, md.z);

function islandPoint(c, v, e, side = -1) {
  const u = side * Math.sqrt(Math.max(0, e - v * v));
  const x = riverX(c.z) + c.off + u * c.rx;
  const z = c.z + v * c.rz;
  return V(x, heightAt(x, z), z);
}

function nearestHosts(hosts, centre, radius, max) {
  return hosts
    .map((h) => [h, Math.hypot(h.x - centre.x, h.z - centre.z)])
    .filter(([, d]) => d < radius)
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([h]) => h);
}

export function createFauna({ hosts = [], tier = 1, emit = () => {} }) {
  const group = new THREE.Group();
  const mats = {
    deer: coatMaterial('deer'),
    croc: coatMaterial('croc', { roughness: 0.6 }),
    monkey: coatMaterial('monkey'),
    paint: paintedMaterial(),
  };
  const actors = [];
  const add = (actor, range = 220, anchor) => {
    group.add(actor.object);
    actors.push({ actor, range, anchor: anchor === undefined ? actor.position || null : anchor });
    return actor;
  };

  // Herds graze the downstream end of each clearing, which is where the camera is looking as it passes.
  const grazing = [{ ...MEADOWS[0], z: -140, len: 30 }, { ...MEADOWS[2], z: -580, len: 30 }];
  add(createDeerHerd({ mat: mats.deer, area: bankArea(grazing[0]), emit, count: tier ? 7 : 4, seed: 11 }), 260, meadowCentre(grazing[0]));
  add(createDeerHerd({ mat: mats.deer, area: bankArea(grazing[1], { near: 3, far: 0.4 }), emit, count: tier ? 5 : 3, seed: 31 }), 260, meadowCentre(grazing[1]));

  const m1 = MEADOWS[1];
  for (const [z, seed] of [[m1.z + 14, 3], [m1.z - 16, 9]]) {
    const x = bankX(z, m1.side, 2.2);
    add(createBaskingCroc({ mat: mats.croc, x, z, heading: m1.side > 0 ? -Math.PI / 2 : Math.PI / 2, emit, seed }));
  }
  const c1 = CHARS[1];
  for (const [v, seed] of [[0.35, 4], [0.05, 8]]) {
    const p = islandPoint(c1, v, 0.6);
    add(createBaskingCroc({ mat: mats.croc, x: p.x, z: p.z, heading: -Math.PI / 2 + (v - 0.2), emit, seed }));
  }
  add(createSwimmingCroc({ mat: mats.croc, cx: riverX(c1.z + 35) - 8, cz: c1.z + 35, rx: 10, rz: 26, emit }));

  // A kingfisher perches on the first island, the one the journey opens on; egrets wade its shallows
  // and the clearings downstream.
  const c0 = CHARS[0];
  const perchBase = islandPoint(c0, 0.8, 0.8);
  const perch = { base: perchBase, water: V(perchBase.x - 2.5, 0, perchBase.z), heading: -Math.PI / 2 };
  const waders = [
    [islandPoint(c0, 0.55, 0.7, 1), 1.2],
    [islandPoint(c0, -0.42, 0.7), -1.6],
    ...[MEADOWS[0].z + 12, MEADOWS[0].z - 10].map((z) => [V(bankX(z, MEADOWS[0].side, 1.8), 0, z), 2.6]),
    [V(bankX(m1.z - 2, m1.side, 1.8), 0, m1.z - 2), 0.6],
    [islandPoint(c1, 0.5, 0.7), -1.4],
  ].map(([p, heading]) => ({ x: p.x, z: p.z, heading }));
  add(createBirds({ mat: mats.paint, emit, tier, perch, waders }), 0, null);

  for (const [centre, radius, max] of [[V(riverX(c0.z) + c0.off, 0, c0.z), 30, 2], [meadowCentre(grazing[0]), 55, 4], [meadowCentre(grazing[1]), 50, 3]]) {
    const perches = nearestHosts(hosts, centre, radius, max);
    if (perches.length) add(createMonkeys({ mat: mats.monkey, hosts: perches, emit, seed: Math.round(centre.z) }), 240, perches[0]);
  }

  add(createFireflies({ count: [240, 460, 720][tier], zFrom: -640, zTo: -1010 }), 0, null);
  add(createBoat({ mat: mats.paint, emit }), 280);
  add(createDolphins({ mat: mats.paint, count: tier ? 2 : 1, emit }), 0, null);

  const forward = new THREE.Vector3();
  return {
    group,
    update(dt, time, { camera, night = 0, tod = 0 }) {
      coatUniforms.uNight.value = night;
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const ctx = { camera, forward, night, tod };
      const cx = camera.position.x;
      const cz = camera.position.z;
      for (const { actor, range, anchor } of actors) {
        if (anchor) {
          const on = Math.hypot(anchor.x - cx, anchor.z - cz) < range;
          actor.object.visible = on;
          if (!on) continue;
        }
        actor.update(dt, time, ctx);
      }
    },
  };
}
