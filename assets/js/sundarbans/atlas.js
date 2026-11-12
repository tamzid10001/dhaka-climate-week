import * as THREE from 'three';
import { TAU, rng, lerp, clamp } from './util.js';

/*
 * The foliage atlas: every leaf in the forest is painted here once, on a canvas, when the world starts.
 * A 4×4 grid of cells holds leaf clusters for each mangrove species, nipa frond strips, grass tufts and
 * bark. Crowns are built from cards that each show one cluster, so the canopy has real leaf
 * silhouettes, light through its edges and depth between leaves instead of faceted spheres.
 */

export const CELLS = {
  sundari: [0, 1, 2, 3],
  gewa: [4, 5],
  gewaRed: [6],
  keora: [7, 8],
  garjan: [9],
  core: [10],
  nipa: [11, 12],
  grass: [13, 14],
  bark: [15],
};

const col = (h, s, l, a = 1) => `hsla(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}% / ${a.toFixed(3)})`;

/** One leaf: an elliptic blade with a pointed tip and a pale midrib, drawn along +x from (x, y). */
function leaf(ctx, x, y, angle, len, width, hsl, { light = 1, shadow = true, tipLift = 0.35, fold = 0.18 } = {}) {
  const [h, s, l] = hsl;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const blade = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.18, -width * 0.9, len * 0.72, -width * 0.95, len, 0);
    ctx.bezierCurveTo(len * 0.72, width * 0.95, len * 0.18, width * 0.9, 0, 0);
    ctx.closePath();
  };
  if (shadow) {
    ctx.save();
    ctx.translate(len * 0.03, width * 0.5);
    blade();
    ctx.fillStyle = col(h, s * 0.7, l * 0.35, 0.3);
    ctx.fill();
    ctx.restore();
  }
  // Along the blade: a little darker at the base, lighter toward the tip. Across: one half folded away.
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, col(h + 4, s * 0.9, l * 0.78 * light));
  g.addColorStop(0.5, col(h, s, l * light));
  g.addColorStop(1, col(h - 6, s * 0.95, l * (1 + tipLift * 0.4) * light));
  blade();
  ctx.fillStyle = g;
  ctx.fill();
  const f = ctx.createLinearGradient(0, -width, 0, width);
  f.addColorStop(0, `rgba(255,255,255,${(0.1 * light).toFixed(3)})`);
  f.addColorStop(0.5, 'rgba(0,0,0,0)');
  f.addColorStop(1, `rgba(0,0,0,${fold.toFixed(3)})`);
  ctx.fillStyle = f;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(len * 0.04, 0);
  ctx.lineTo(len * 0.92, 0);
  ctx.strokeStyle = col(h - 8, s * 0.6, Math.min(0.58, l * 1.35), 0.42 * light);
  ctx.lineWidth = Math.max(1, width * 0.09);
  ctx.stroke();
  ctx.restore();
}

/** A roughly round cluster of leaves on radiating twigs, the unit every crown card shows. */
function cluster(ctx, S, r, spec) {
  const { count, len, width, hue, sat, light, hueSpread = 10, lightSpread = 0.1, twigs = 9, red = 0, narrow = 0, fold = 0.18, reach = 0.36 } = spec;
  const cx = S / 2;
  const cy = S / 2;
  const R = S * reach;
  ctx.lineCap = 'round';
  for (let i = 0; i < twigs; i++) {
    const a = (i / twigs) * TAU + r() * 0.6;
    const L = R * (0.45 + r() * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a + 0.3) * R * 0.05, cy + Math.sin(a + 0.3) * R * 0.05);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.15) * L * 0.5, cy + Math.sin(a + 0.15) * L * 0.5, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    ctx.strokeStyle = col(28, 0.3, 0.2 + r() * 0.1, 0.9);
    ctx.lineWidth = S * (0.006 + r() * 0.004);
    ctx.stroke();
  }
  // Leaves from the centre outward, so the outer ones lie on top; darker and more crowded in the heart.
  const items = [];
  for (let i = 0; i < count; i++) {
    const t = Math.sqrt(r());
    const rad = t * R;
    const a = r() * TAU;
    items.push({ rad, a, t, i });
  }
  items.sort((p, q) => p.rad - q.rad);
  for (const it of items) {
    const x = cx + Math.cos(it.a) * it.rad;
    const y = cy + Math.sin(it.a) * it.rad;
    const ang = it.a + (r() - 0.5) * 1.1;
    const L = S * len * (0.78 + r() * 0.44);
    const W = L * width * (narrow ? 0.7 + r() * 0.2 : 0.86 + r() * 0.28);
    const shade = lerp(0.58, 1.0, Math.pow(it.t, 1.1)) * (0.88 + r() * 0.24);
    const isRed = red > 0 && r() < red;
    const hsl = isRed ? [12 + r() * 10, 0.62, 0.42] : [hue + (r() - 0.5) * hueSpread, sat + (r() - 0.5) * 0.1, light + (r() - 0.5) * lightSpread];
    leaf(ctx, x - Math.cos(ang) * L * 0.3, y - Math.sin(ang) * L * 0.3, ang, L, W, hsl, { light: shade, fold });
  }
}

/** A nipa frond laid out as a strip: rachis along the middle, leaflets sweeping toward the tip (+x). */
function frond(ctx, S, r, variant) {
  const y0 = S / 2;
  const x0 = S * 0.02;
  const x1 = S * 0.985;
  ctx.lineCap = 'round';
  const hue = 92 + variant * 6;
  const n = 46;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < n; i++) {
      const t = (i + (side > 0 ? 0.5 : 0)) / n;
      if (t < 0.07) continue;
      const x = lerp(x0, x1, t);
      const taper = 1 - Math.pow(t, 2.2) * 0.9;
      const L = S * (0.13 + 0.2 * taper) * (0.85 + r() * 0.3);
      const ang = side * (0.95 - t * 0.5 + (r() - 0.5) * 0.18);
      const W = L * 0.09;
      const shade = 0.72 + 0.28 * r() + (side > 0 ? 0.06 : -0.04);
      leaf(ctx, x, y0 + side * S * 0.006, ang, L, W, [hue + (r() - 0.5) * 12, 0.46, 0.4 + t * 0.12], { light: shade, tipLift: 0.5, fold: 0.26 });
    }
  }
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, col(60, 0.35, 0.32));
  g.addColorStop(1, col(75, 0.45, 0.44));
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.strokeStyle = g;
  ctx.lineWidth = S * 0.018;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, y0 - S * 0.004);
  ctx.lineTo(x1, y0 - S * 0.002);
  ctx.strokeStyle = 'rgba(255,255,230,0.35)';
  ctx.lineWidth = S * 0.005;
  ctx.stroke();
}

/** A tuft of grass fanning up from the bottom centre. */
function tuft(ctx, S, r, variant) {
  const bx = S / 2;
  const by = S * 0.985;
  const blades = 44;
  for (let i = 0; i < blades; i++) {
    const lean = (r() - 0.5) * 1.5;
    const H = S * (0.42 + r() * 0.54);
    const bend = lean * H * 0.55;
    const w = S * (0.012 + r() * 0.012);
    const dry = r() < 0.2 + variant * 0.2;
    const hue = dry ? 52 + r() * 10 : 84 + r() * 16;
    const light = dry ? 0.5 : 0.36;
    const tipX = bx + bend + lean * H * 0.35;
    const tipY = by - H;
    const cX = bx + bend * 0.3;
    const cY = by - H * 0.55;
    ctx.beginPath();
    ctx.moveTo(bx - w, by);
    ctx.quadraticCurveTo(cX - w * 0.5, cY, tipX, tipY);
    ctx.quadraticCurveTo(cX + w * 0.5, cY, bx + w, by);
    ctx.closePath();
    const g = ctx.createLinearGradient(bx, by, tipX, tipY);
    g.addColorStop(0, col(hue - 10, 0.42, light * 0.55));
    g.addColorStop(0.55, col(hue, 0.5, light));
    g.addColorStop(1, col(hue + 8, 0.55, light * 1.55));
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/** The inside of a crown: packed, shaded leaves with no gaps, for the core behind every cloud of cards. */
function core(ctx, S, r) {
  for (let i = 0; i < 520; i++) {
    const x = r() * S;
    const y = r() * S;
    const L = S * (0.07 + r() * 0.07);
    const shade = 0.55 + r() * 0.5;
    leaf(ctx, x, y, r() * TAU, L, L * 0.42, [122 + r() * 18, 0.34, 0.3], { light: shade, shadow: false, fold: 0.3 });
  }
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** Bark: streaked, fissured, lighter where the trunk catches the sky. */
function bark(ctx, S, r, x, y) {
  ctx.fillStyle = col(26, 0.2, 0.3);
  ctx.fillRect(x, y, S, S);
  for (let i = 0; i < 160; i++) {
    const sx = x + r() * S;
    const w = S * (0.004 + r() * 0.02);
    const dark = r() < 0.55;
    ctx.fillStyle = col(24 + r() * 8, 0.18 + r() * 0.1, dark ? 0.2 + r() * 0.07 : 0.36 + r() * 0.1, 0.5);
    const h = S * (0.2 + r() * 0.8);
    ctx.fillRect(sx, y + r() * (S - h), w, h);
  }
  for (let i = 0; i < 48; i++) {
    const sx = x + r() * S;
    const sy = y + r() * S;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (r() - 0.5) * S * 0.05, sy + S * (0.06 + r() * 0.16));
    ctx.strokeStyle = col(22, 0.25, 0.12, 0.6);
    ctx.lineWidth = S * (0.003 + r() * 0.004);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(x, 0, x + S, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.65, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, S, S);
}

const SPECIES = {
  // Sundari: dense, dark, leathery elliptic leaves.
  sundari: { count: 160, len: 0.135, width: 0.42, hue: 128, sat: 0.36, light: 0.27, hueSpread: 14, lightSpread: 0.1, twigs: 10 },
  // Gewa: broader, yellow-green, glossy; a winter variant turns a few leaves red.
  gewa: { count: 112, len: 0.15, width: 0.52, hue: 92, sat: 0.42, light: 0.37, hueSpread: 16, lightSpread: 0.12, twigs: 8 },
  gewaRed: { count: 112, len: 0.15, width: 0.52, hue: 90, sat: 0.4, light: 0.36, hueSpread: 16, lightSpread: 0.12, twigs: 8, red: 0.22 },
  // Keora: small, pale, grey-green leaves on hanging twigs, open enough to see sky through.
  keora: { count: 175, len: 0.1, width: 0.42, hue: 96, sat: 0.26, light: 0.44, hueSpread: 12, lightSpread: 0.12, twigs: 12, narrow: 1, reach: 0.4 },
  // Garjan: glossy, deep green, blue-leaning leaves in tight rosettes.
  garjan: { count: 124, len: 0.14, width: 0.46, hue: 140, sat: 0.34, light: 0.3, hueSpread: 10, lightSpread: 0.1, twigs: 9, fold: 0.24 },
};

/**
 * Paint the atlas. `size` is the canvas edge; 2048 gives 512 px cells, enough for the nearest bank trees.
 * Returns the texture and a lookup of UV rectangles per cell.
 */
export function createLeafAtlas(size = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const S = size / 4;
  const r = rng(7);
  const cellRect = (i) => ({ x: (i % 4) * S, y: Math.floor(i / 4) * S });
  const draw = (i, fn) => {
    const { x, y } = cellRect(i);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, S, S);
    ctx.clip();
    ctx.translate(x, y);
    fn();
    ctx.restore();
  };
  for (const [name, cells] of Object.entries(CELLS)) {
    cells.forEach((cell, k) => {
      if (name === 'nipa') draw(cell, () => frond(ctx, S, r, k));
      else if (name === 'grass') draw(cell, () => tuft(ctx, S, r, k));
      else if (name === 'bark') bark(ctx, S, r, cellRect(cell).x, cellRect(cell).y);
      else if (name === 'core') draw(cell, () => core(ctx, S, r));
      else draw(cell, () => cluster(ctx, S, r, SPECIES[name]));
    });
  }
  /*
   * Upload the pixels ourselves. A canvas keeps premultiplied colour, and the browser's un-premultiply on
   * upload turns the faint antialiased rim of every leaf into near-white texels; mipmapping then spreads
   * that rim over the whole distant canopy as white speckle. Here the empty texels of each cell take the
   * cell's own mean leaf colour instead, so filtered leaves stay leaf-coloured at every distance.
   */
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let cell = 0; cell < 16; cell++) {
    const { x, y } = cellRect(cell);
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let j = y; j < y + S; j++) {
      for (let i = x; i < x + S; i++) {
        const k = (j * size + i) * 4;
        if (d[k + 3] >= 200) {
          sr += d[k];
          sg += d[k + 1];
          sb += d[k + 2];
          n++;
        }
      }
    }
    if (!n) continue;
    const mr = sr / n;
    const mg = sg / n;
    const mb = sb / n;
    for (let j = y; j < y + S; j++) {
      for (let i = x; i < x + S; i++) {
        const k = (j * size + i) * 4;
        const a = d[k + 3];
        if (a >= 96) continue;
        // Faint texels lean on the mean; empty ones take it outright.
        const t = a / 96;
        d[k] = mr + (d[k] - mr) * t;
        d[k + 1] = mg + (d[k + 1] - mg) * t;
        d[k + 2] = mb + (d[k + 2] - mb) * t;
      }
    }
  }
  const texture = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  // UV rectangle of a cell, inset a little so mip filtering never bleeds a neighbour in.
  const uv = (i) => {
    const { x, y } = cellRect(i);
    const inset = S * 0.012;
    return [(x + inset) / size, 1 - (y + S - inset) / size, (x + S - inset) / size, 1 - (y + inset) / size];
  };
  const rects = {};
  for (const [name, cells] of Object.entries(CELLS)) rects[name] = cells.map(uv);
  return { texture, rects, canvas, pick: (name, rr) => rects[name][Math.floor(clamp(rr(), 0, 0.999) * rects[name].length)] };
}
