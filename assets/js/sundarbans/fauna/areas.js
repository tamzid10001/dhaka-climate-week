import { bankX } from '../terrain.js';

/*
 * Where an animal may wander. pick() returns a dry spot, edge() a spot at the waterline, faceWater()
 * the heading that looks out over the river from there.
 */

/** A grassy clearing on one bank; the waterline sits about 2.5 m onto the bank. */
export function bankArea(md, { near = 3.5, far = 0.5, span = 1.1 } = {}) {
  return {
    center: [bankX(md.z, md.side, md.depth * 0.3), md.z],
    pick(r) {
      const z = md.z + (r() - 0.5) * md.len * span;
      return [bankX(z, md.side, near + r() * (md.depth * far - near)), z];
    },
    edge(r) {
      const z = md.z + (r() - 0.5) * md.len * 0.8;
      return [bankX(z, md.side, 2.7), z];
    },
    faceWater() {
      return md.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    },
  };
}
