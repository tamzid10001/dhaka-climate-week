import { riverX, bankX } from '../terrain.js';

/*
 * Where an animal may wander. pick() returns a dry spot, edge() a spot at the waterline, faceWater()
 * the heading that looks out over the river from there.
 */

/** The open, upstream half of a mud island (its downstream half is planted). */
export function islandArea(c, { side = -1, u: [u0, u1] = [-0.55, 0.55], v: [v0, v1] = [0.08, 0.68] } = {}) {
  const cx = riverX(c.z) + c.off;
  return {
    center: [cx, c.z],
    pick(r) {
      for (let i = 0; i < 24; i++) {
        const u = u0 + r() * (u1 - u0);
        const v = v0 + r() * (v1 - v0);
        if (u * u + v * v < 0.46) return [cx + u * c.rx, c.z + v * c.rz];
      }
      return [cx, c.z + c.rz * (v0 + v1) * 0.5];
    },
    edge(r) {
      const v = Math.max(0.05, v0) + r() * (Math.min(0.54, v1) - Math.max(0.05, v0));
      const u = side * Math.sqrt(Math.max(0, 0.6 - v * v));
      return [cx + u * c.rx, c.z + v * c.rz];
    },
    faceWater(a) {
      return Math.atan2((a.x - cx) / (c.rx * c.rx), (a.z - c.z) / (c.rz * c.rz));
    },
  };
}

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
