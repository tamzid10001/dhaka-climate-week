import * as V from './audio/voices.js';
import { createEngine, setListener, spot, bed, noise, osc, filter, chain, wobble } from './audio/engine.js';

/*
 * The sounds of the Sundarbans. Nothing plays until the visitor turns sound on. Beds (wind in the
 * canopy, the river, cicadas by day, crickets by night) cross-fade with the hour; birds and frogs call
 * from around the boat; the animals' own events arrive placed in 3D where they happen.
 */

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const FOREVER = 1e6;

const EVENTS = {
  'tiger-roar': { voice: V.roar, ref: 40, gain: 1, send: 0.45 },
  'tiger-lap': { voice: (A, o, t) => V.plop(A, o, t, 0.5), ref: 6, gain: 0.45, every: 2 },
  'tiger-chuff': { voice: V.chuff, ref: 8, gain: 0.8 },
  'deer-alarm': { voice: V.chitalAlarm, ref: 22, gain: 0.9 },
  'monkey-call': { voice: V.macaque, ref: 18, gain: 0.8 },
  branch: { voice: V.rustle, ref: 10, gain: 0.7 },
  'croc-hiss': { voice: V.hiss, ref: 10, gain: 0.8 },
  'croc-wake': { voice: (A, o, t) => V.swish(A, o, t, 0.12), ref: 6, gain: 0.6, every: 2 },
  splash: { voice: (A, o, t) => V.plop(A, o, t, 1.2), ref: 8, gain: 0.8 },
  'splash-small': { voice: (A, o, t) => V.plop(A, o, t, 0.8), ref: 6, gain: 0.6 },
  kite: { voice: V.kite, ref: 40, gain: 0.7 },
  kingfisher: { voice: V.kingfisher, ref: 18, gain: 0.7 },
  oar: { voice: V.oar, ref: 8, gain: 0.8 },
  dolphin: { voice: V.blow, ref: 14, gain: 0.9 },
};

/* Ambient callers: when they sing, how often (calls per minute at full presence) and from how far. */
const CALLERS = [
  { voice: V.koel, when: 'day', rate: 2.2, near: 35, far: 110, height: 10, gain: 0.8 },
  { voice: V.dove, when: 'day', rate: 2.5, near: 25, far: 80, height: 8, gain: 0.7 },
  { voice: V.bulbul, when: 'day', rate: 4, near: 15, far: 60, height: 6, gain: 0.7 },
  { voice: V.croak, when: 'dusk', rate: 2.5, near: 30, far: 90, height: 20, gain: 0.6 },
  { voice: V.owl, when: 'night', rate: 1.4, near: 40, far: 120, height: 9, gain: 0.8 },
  { voice: V.nightjar, when: 'night', rate: 1.2, near: 30, far: 90, height: 4, gain: 0.7 },
  { voice: V.gecko, when: 'night', rate: 0.7, near: 20, far: 60, height: 3, gain: 0.6 },
  { voice: V.frog, when: 'night', rate: 9, near: 8, far: 40, height: 0.3, gain: 0.6 },
];

export function createSoundscape({ hrtf = true } = {}) {
  let A = null;
  let beds = null;
  let on = false;
  let last = 0;
  const counts = {};
  const presence = { day: 1, dusk: 0, night: 0 };
  let speed = 0;
  const pos = { x: 0, y: 0, z: 0 };

  function gate(A, t, rate, type = 'square') {
    const g = A.ctx.createGain();
    g.gain.value = 0.5;
    wobble(A, g.gain, t, FOREVER, rate, 0.5, type);
    return g;
  }

  function buildBeds() {
    const t = A.ctx.currentTime;
    const wind = [-0.6, 0.6].map((pan, i) => {
      const out = bed(A, { pan, send: 0.2 });
      const bp = filter(A, 'bandpass', 520 + i * 160, 0.55);
      wobble(A, bp.frequency, t, FOREVER, 0.05 + i * 0.023, 260);
      const gust = A.ctx.createGain();
      gust.gain.value = 0.6;
      wobble(A, gust.gain, t, FOREVER, 0.031 + i * 0.017, 0.4);
      chain(noise(A, 'pink', t), bp, gust, out);
      return out;
    });
    const leaves = bed(A, { send: 0.12 });
    const lg = A.ctx.createGain();
    lg.gain.value = 0.35;
    wobble(A, lg.gain, t, FOREVER, 0.031, 0.33);
    chain(noise(A, 'white', t), filter(A, 'highpass', 3800, 0.5), lg, leaves);

    const water = bed(A, { send: 0.1 });
    const lap = A.ctx.createGain();
    lap.gain.value = 0.55;
    wobble(A, lap.gain, t, FOREVER, 0.37, 0.22);
    wobble(A, lap.gain, t, FOREVER, 0.61, 0.15);
    chain(noise(A, 'brown', t), filter(A, 'lowpass', 420, 0.6), lap, water);
    const rush = bed(A, { send: 0.05 });
    chain(noise(A, 'pink', t), filter(A, 'bandpass', 900, 0.5), rush);

    const cicadas = [[4900, 66, -0.5], [6300, 79, 0.45]].map(([f, buzz, pan]) => {
      const out = bed(A, { pan, send: 0.25 });
      const swell = A.ctx.createGain();
      swell.gain.value = 0.6;
      wobble(A, swell.gain, t, FOREVER, 0.045 + Math.random() * 0.03, 0.4);
      chain(noise(A, 'white', t), filter(A, 'bandpass', f, 7), gate(A, t, buzz), swell, out);
      return out;
    });
    const crickets = [[4300, 30, 2.1, -0.7], [4650, 26, 1.6, 0.2], [3950, 33, 2.6, 0.75]].map(([f, pulse, chirp, pan]) => {
      const out = bed(A, { pan, send: 0.3 });
      chain(osc(A, 'sine', t, FOREVER, f), gate(A, t, pulse), gate(A, t, chirp), out);
      return out;
    });
    const trill = bed(A, { send: 0.3 });
    chain(osc(A, 'sine', t, FOREVER, 2850), gate(A, t, 46), trill);
    return { wind, leaves, water, rush, cicadas, crickets, trill };
  }

  function mix() {
    const t = A.ctx.currentTime;
    const set = (node, v, k = 0.8) => node.gain.setTargetAtTime(v, t, k);
    const { day, dusk, night } = presence;
    beds.wind.forEach((n) => set(n, 0.14 + 0.1 * day));
    set(beds.leaves, 0.04 + 0.03 * day);
    set(beds.water, 0.2);
    set(beds.rush, Math.min(0.22, speed * 4), 0.25);
    // Insects sit a few dB under wind and water: a shimmer by day, a pulse at night, never a whine.
    beds.cicadas.forEach((n) => set(n, 0.22 * day));
    beds.crickets.forEach((n) => set(n, 0.02 * Math.max(dusk, night)));
    set(beds.trill, 0.012 * night);
  }

  function call(c, t) {
    const a = Math.random() * Math.PI * 2;
    const d = c.near + Math.random() * (c.far - c.near);
    const p = { x: pos.x + Math.cos(a) * d, y: c.height + Math.random() * 3, z: pos.z + Math.sin(a) * d };
    c.voice(A, spot(A, p, { ref: 14, gain: c.gain, send: 0.35 }), t + 0.05);
  }

  return {
    event(name, data) {
      const e = EVENTS[name];
      if (!on || !A || !e || !data?.position) return;
      if (e.every && (counts[name] = (counts[name] || 0) + 1) % e.every) return;
      const p = data.position;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) > 320) return;
      e.voice(A, spot(A, p, { ref: e.ref, gain: e.gain, send: e.send ?? 0.3 }), A.ctx.currentTime + 0.02);
    },
    update({ camera, forward, tod = 0, night = 0, speed: s = 0 }) {
      presence.day = 1 - smooth(0.42, 0.78, tod);
      presence.dusk = smooth(0.3, 0.55, tod) * (1 - smooth(0.8, 0.97, tod));
      presence.night = night;
      speed = s;
      if (!on || !A) return;
      const now = A.ctx.currentTime;
      const dt = now - last;
      if (dt < 0.1) return;
      last = now;
      Object.assign(pos, { x: camera.position.x, y: camera.position.y, z: camera.position.z });
      setListener(A, camera.position, forward);
      mix();
      for (const c of CALLERS) {
        if (Math.random() < (c.rate / 60) * Math.min(dt, 0.5) * presence[c.when]) call(c, now);
      }
    },
    suspend() {
      if (A && A.ctx.state === 'running') A.ctx.suspend();
    },
    resume() {
      if (A && on) A.ctx.resume();
    },
    async toggle() {
      if (!A) {
        try {
          A = createEngine({ hrtf });
          beds = buildBeds();
        } catch {
          A = null;
          return false;
        }
      }
      on = !on;
      const t = A.ctx.currentTime;
      A.master.gain.cancelScheduledValues(t);
      if (on) {
        await A.ctx.resume();
        last = A.ctx.currentTime;
        mix();
        A.master.gain.setTargetAtTime(0.9, A.ctx.currentTime, 0.7);
        const welcome = CALLERS.find((c) => presence[c.when] > 0.5) || CALLERS[0];
        setTimeout(() => on && call(welcome, A.ctx.currentTime), 1400);
      } else {
        A.master.gain.setTargetAtTime(0, t, 0.25);
        setTimeout(() => !on && A.ctx.suspend(), 1000);
      }
      return on;
    },
  };
}
