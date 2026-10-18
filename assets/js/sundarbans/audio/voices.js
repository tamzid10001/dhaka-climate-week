import { osc, noise, filter, amp, chain, wobble, shaperCurve } from './engine.js';

/*
 * The calls of the Sundarbans, synthesised: each voice is (A, out, t) and schedules itself from time t.
 * Shapes follow field recordings — formants, pitch contours, pulse rates and durations.
 */
const R = Math.random;

function note(A, out, t, dur, freq, gain, { type = 'sine', h2 = 0.12, attack = 0.03 } = {}) {
  const o = osc(A, type, t, dur, freq);
  chain(o, amp(A, t, [[0, 0], [attack, gain], [dur * 0.7, gain * 0.8], [dur, 0]]), out);
  if (h2) {
    const o2 = osc(A, 'sine', t, dur, freq.map(([s, f]) => [s, f * 2]));
    chain(o2, amp(A, t, [[0, 0], [attack, gain * h2], [dur, 0]]), out);
  }
}

/** Bengal tiger: a rough, formant-shaped "aaaouungh", then one or two fading moans. */
function roarOnce(A, out, t, dur, peak, level) {
  const f0 = [[0, peak * 0.45], [dur * 0.18, peak * 0.9], [dur * 0.45, peak], [dur * 0.8, peak * 0.72], [dur, peak * 0.45]];
  const src = osc(A, 'sawtooth', t, dur, f0);
  const sub = osc(A, 'sine', t, dur, f0.map(([s, f]) => [s, f * 0.5]));
  const body = A.ctx.createGain();
  body.gain.value = 0.5;
  wobble(A, body.gain, t, dur, 26 + R() * 8, 0.45);
  const grit = A.ctx.createWaveShaper();
  grit.curve = shaperCurve(5);
  src.connect(grit);
  const f1 = filter(A, 'bandpass', [[0, 320], [dur * 0.35, 720], [dur, 300]], 2.4, t);
  const f2 = filter(A, 'bandpass', [[0, 850], [dur * 0.35, 1250], [dur, 760]], 3.5, t);
  grit.connect(f1).connect(body);
  grit.connect(f2).connect(body);
  const breath = chain(noise(A, 'pink', t, dur), filter(A, 'bandpass', [[0, 500], [dur * 0.4, 900], [dur, 400]], 1.2, t));
  const e = amp(A, t, [[0, 0], [dur * 0.12, level], [dur * 0.6, level * 0.8], [dur, 0]]);
  chain(body, filter(A, 'lowpass', 2600, 0.7), e);
  chain(breath, amp(A, t, [[0, 0], [dur * 0.15, 0.5], [dur, 0]]), e);
  chain(sub, amp(A, t, [[0, 0], [dur * 0.2, 0.6], [dur, 0]]), e);
  e.connect(out);
}
export function roar(A, out, t) {
  roarOnce(A, out, t, 2.3, 150 + R() * 25, 0.9);
  roarOnce(A, out, t + 2.9, 1.6, 125 + R() * 20, 0.55);
  if (R() < 0.6) roarOnce(A, out, t + 5.1, 1.3, 110, 0.35);
}

/** Chital alarm: a sharp, high "ak!" — one deer, then others answering. */
export function chitalAlarm(A, out, t) {
  const reps = 1 + Math.floor(R() * 3);
  for (let i = 0; i < reps; i++) {
    const at = t + i * (0.5 + R() * 0.4);
    const f = 1600 + R() * 400;
    const o = osc(A, 'sawtooth', at, 0.2, [[0, f], [0.04, f * 1.35], [0.2, f * 0.8]]);
    chain(o, filter(A, 'bandpass', f * 1.3, 2.2), amp(A, at, [[0, 0], [0.01, 0.75], [0.07, 0.3], [0.2, 0]]), out);
    chain(noise(A, 'white', at, 0.06), filter(A, 'highpass', 2500), amp(A, at, [[0, 0], [0.005, 0.35], [0.05, 0]]), out);
  }
}

/** Rhesus macaque: harsh, jittery screams and barks. */
export function macaque(A, out, t) {
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.24 + R() * 0.2);
    const f = 900 + R() * 400;
    const o = osc(A, 'sawtooth', at, 0.28, [[0, f], [0.08, f * 1.8], [0.28, f * 1.2]]);
    wobble(A, o.frequency, at, 0.28, 34 + R() * 10, 110);
    chain(o, filter(A, 'bandpass', 1700, 1.3), amp(A, at, [[0, 0], [0.02, 0.4], [0.18, 0.3], [0.28, 0]]), out);
    chain(noise(A, 'white', at, 0.28), filter(A, 'bandpass', 2600, 1.2), amp(A, at, [[0, 0], [0.02, 0.12], [0.28, 0]]), out);
  }
}

/** Leaves and twigs thrashing as something lands in a crown. */
export function rustle(A, out, t) {
  const g = amp(A, t, [[0, 0], [0.03, 0.55], [0.25, 0.22], [0.45, 0.4], [1.1, 0]]);
  chain(noise(A, 'white', t, 1.1), filter(A, 'bandpass', 3200, 0.7), g, out);
  const crack = amp(A, t, [[0, 0], [0.02, 0.3], [0.6, 0]]);
  wobble(A, crack.gain, t, 0.6, 13 + R() * 8, 0.3, 'square');
  chain(noise(A, 'white', t, 0.6), filter(A, 'highpass', 4500), crack, out);
}

/** Crocodile: a long open-mouthed hiss over a low throat rumble. */
export function hiss(A, out, t) {
  chain(noise(A, 'white', t, 1.6), filter(A, 'highpass', 1800, 0.6), amp(A, t, [[0, 0], [0.12, 0.6], [1.1, 0.45], [1.6, 0]]), out);
  const r = osc(A, 'sine', t, 1.2, [[0, 52], [1.2, 40]]);
  const g = amp(A, t, [[0, 0], [0.1, 0.5], [1.2, 0]]);
  wobble(A, g.gain, t, 1.2, 9, 0.3);
  chain(r, g, out);
}

/** Water: a plop that sinks in pitch, with a splash of noise; `size` scales the body. */
export function plop(A, out, t, size = 1) {
  const o = osc(A, 'sine', t, 0.3, [[0, 1000 / size], [0.09, 260 / size]]);
  chain(o, amp(A, t, [[0, 0], [0.004, 0.55], [0.12, 0.12], [0.3, 0]]), out);
  chain(noise(A, 'white', t, 0.25), filter(A, 'bandpass', 1400 / size, 0.8), amp(A, t, [[0, 0], [0.004, 0.35 * size], [0.12 * size, 0]]), out);
  if (size > 1.1) chain(noise(A, 'brown', t, 0.7), filter(A, 'lowpass', 900), amp(A, t, [[0, 0], [0.02, 0.5], [0.6, 0]]), out);
}

export function swish(A, out, t, level = 0.25) {
  chain(noise(A, 'brown', t, 0.8), filter(A, 'lowpass', [[0, 400], [0.3, 900], [0.8, 350]], 0.8, t), amp(A, t, [[0, 0], [0.25, level], [0.8, 0]]), out);
}

/** Brahminy kite: a hoarse, wavering mew that slides down. */
export function kite(A, out, t) {
  const o = osc(A, 'triangle', t, 1.3, [[0, 2300], [0.15, 2750], [1, 1950], [1.3, 1700]]);
  wobble(A, o.frequency, t, 1.3, 13, 70);
  chain(o, amp(A, t, [[0, 0], [0.08, 0.35], [0.9, 0.26], [1.3, 0]]), out);
  chain(noise(A, 'white', t, 1.3), filter(A, 'bandpass', 2400, 3), amp(A, t, [[0, 0], [0.1, 0.12], [1.3, 0]]), out);
}

/** White-throated kingfisher: a loud descending whinny. */
export function kingfisher(A, out, t) {
  const dur = 1.3 + R() * 0.4;
  const o = osc(A, 'sine', t, dur, [[0, 3700], [dur, 2400]]);
  const g = amp(A, t, [[0, 0], [0.04, 0.32], [dur * 0.8, 0.22], [dur, 0]]);
  wobble(A, g.gain, t, dur, 20, 0.25, 'square');
  chain(o, g, out);
}

/** Oarlock creak, blade dip and drips. */
export function oar(A, out, t) {
  const o = osc(A, 'sawtooth', t, 0.5, [[0, 92], [0.5, 128]]);
  chain(o, filter(A, 'bandpass', [[0, 700], [0.5, 1150]], 7, t), amp(A, t, [[0, 0], [0.08, 0.14], [0.4, 0.08], [0.5, 0]]), out);
  swish(A, out, t + 0.4, 0.3);
  plop(A, out, t + 0.45, 1.25);
  for (let i = 0; i < 3; i++) plop(A, out, t + 1.1 + R() * 0.8, 0.45);
}

/** Irrawaddy dolphin surfacing: a short, wet "pfff". */
export function blow(A, out, t) {
  chain(noise(A, 'pink', t, 0.5), filter(A, 'bandpass', 950, 0.9), amp(A, t, [[0, 0], [0.02, 0.75], [0.16, 0.3], [0.5, 0]]), out);
  swish(A, out, t + 0.1, 0.25);
}

/** Asian koel: the rising "ku-OOO", repeated, climbing with urgency. */
export function koel(A, out, t) {
  const n = 4 + Math.floor(R() * 4);
  const base = 820 + R() * 90;
  let at = t;
  for (let i = 0; i < n; i++) {
    const k = 1 + i * 0.045;
    note(A, out, at, 0.22, [[0, base * k], [0.2, base * k * 1.18]], 0.32);
    note(A, out, at + 0.3, 0.42, [[0, base * k * 1.22], [0.18, base * k * 1.42], [0.42, base * k * 1.36]], 0.38);
    at += 0.95 - i * 0.04;
  }
}

/** Spotted dove: soft "kroo-kroo-krooo". */
export function dove(A, out, t) {
  for (const [d, len, f] of [[0, 0.25, 520], [0.38, 0.32, 560], [0.86, 0.48, 495]]) {
    note(A, out, t + d, len, [[0, f * 0.88], [len * 0.3, f], [len, f * 0.92]], 0.26, { attack: len * 0.25, h2: 0.05 });
  }
}

/** Red-vented bulbul: a bright, bubbling phrase of quick whistles. */
export function bulbul(A, out, t) {
  let at = t;
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const f = 1700 + R() * 1300;
    const len = 0.08 + R() * 0.12;
    note(A, out, at, len, [[0, f], [len * 0.5, f * (1.15 + R() * 0.35)], [len, f * 0.9]], 0.2, { attack: 0.01, h2: 0.08 });
    at += len + 0.03 + R() * 0.08;
  }
}

/** Egret / heron: a harsh, low "kraak" overhead. */
export function croak(A, out, t) {
  const o = osc(A, 'sawtooth', t, 0.4, [[0, 190], [0.4, 150]]);
  const g = amp(A, t, [[0, 0], [0.02, 0.35], [0.3, 0.2], [0.4, 0]]);
  wobble(A, g.gain, t, 0.4, 55, 0.25, 'square');
  chain(o, filter(A, 'bandpass', 680, 2), g, out);
}

/** Brown fish owl: two deep, hollow "boom-boom" hoots. */
export function owl(A, out, t) {
  note(A, out, t, 0.32, [[0, 255], [0.32, 235]], 0.42, { attack: 0.06, h2: 0.06 });
  note(A, out, t + 0.62, 0.42, [[0, 250], [0.42, 225]], 0.38, { attack: 0.08, h2: 0.06 });
}

/** Large-tailed nightjar: the knocking "chaunk… chaunk… chaunk" of Sundarbans nights. */
export function nightjar(A, out, t) {
  const n = 6 + Math.floor(R() * 9);
  for (let i = 0; i < n; i++) {
    const at = t + i * 0.36;
    chain(osc(A, 'sawtooth', at, 0.09, [[0, 1250], [0.09, 1000]]), filter(A, 'bandpass', 1300, 4), amp(A, at, [[0, 0], [0.005, 0.32], [0.09, 0]]), out);
  }
}

/** Tokay gecko: the barking "to-KAY" from the dark. */
export function gecko(A, out, t) {
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const at = t + i * 1.05;
    chain(osc(A, 'sawtooth', at, 0.12, [[0, 480], [0.12, 720]]), filter(A, 'bandpass', 900, 2), amp(A, at, [[0, 0], [0.02, 0.22], [0.12, 0]]), out);
    chain(osc(A, 'sawtooth', at + 0.16, 0.26, [[0, 900], [0.26, 600]]), filter(A, 'bandpass', 1100, 2), amp(A, at + 0.16, [[0, 0], [0.03, 0.26], [0.26, 0]]), out);
  }
}

/** Frogs: a deep pulsed croak, or a chorus of little "tink"s. */
export function frog(A, out, t) {
  if (R() < 0.45) {
    const dur = 0.45 + R() * 0.3;
    const g = amp(A, t, [[0, 0], [0.05, 0.35], [dur, 0]]);
    wobble(A, g.gain, t, dur, 22 + R() * 8, 0.35, 'square');
    chain(osc(A, 'sawtooth', t, dur, 140 + R() * 40), filter(A, 'bandpass', 420, 3), g, out);
  } else {
    for (let i = 0; i < 4; i++) note(A, out, t + i * (0.18 + R() * 0.2), 0.05, [[0, 2400 + R() * 600], [0.05, 2300]], 0.12, { attack: 0.004, h2: 0 });
  }
}
