/*
 * Web Audio plumbing for the soundscape: looped noise colours, a generated forest reverb (dense early
 * reflections off trunks, a damped tail), 3D voices with distance air absorption, and small synthesis
 * primitives the animal voices are built from.
 */

function noiseBuffer(ctx, kind, seconds = 5) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
  }
  return buf;
}

function forestImpulse(ctx, seconds = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const k = 0.2 + 0.75 * Math.min(1, t / seconds);
      lp += (Math.random() * 2 - 1 - lp) * (1 - k);
      d[i] = lp * Math.exp(-t / 0.5) * Math.min(1, t / 0.015);
    }
    for (let e = 0; e < 18; e++) {
      const at = Math.floor((0.006 + Math.random() * 0.1) * rate);
      d[at] += (Math.random() - 0.5) * 1.2 * Math.exp(-at / rate / 0.06);
    }
  }
  return buf;
}

export function createEngine({ hrtf = true } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  // iOS mutes Web Audio under the silent switch unless the session is declared as playback.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  const ctx = new AC({ latencyHint: 'playback' });
  const master = ctx.createGain();
  master.gain.value = 0;
  const soften = ctx.createBiquadFilter();
  soften.type = 'highshelf';
  soften.frequency.value = 8500;
  soften.gain.value = -4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 14;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.008;
  comp.release.value = 0.3;
  master.connect(soften).connect(comp).connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = forestImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  reverb.connect(wet).connect(master);
  const noise = { white: noiseBuffer(ctx, 'white'), pink: noiseBuffer(ctx, 'pink'), brown: noiseBuffer(ctx, 'brown') };
  const listenerPos = { x: 0, y: 0, z: 0 };
  return { ctx, master, reverb, noise, listenerPos, hrtf };
}

/** Smooth automation through [secondsFromT, value] points. */
export function env(param, t, points) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(points[0][1], t + points[0][0]);
  for (let i = 1; i < points.length; i++) param.linearRampToValueAtTime(points[i][1], t + points[i][0]);
}

export function osc(A, type, t, dur, freq) {
  const o = A.ctx.createOscillator();
  o.type = type;
  if (Array.isArray(freq)) env(o.frequency, t, freq);
  else o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

export function noise(A, kind, t, dur) {
  const s = A.ctx.createBufferSource();
  s.buffer = A.noise[kind];
  s.loop = true;
  s.start(t, Math.random() * 4);
  if (dur) s.stop(t + dur + 0.05);
  return s;
}

export function filter(A, type, f, Q = 1, t = A.ctx.currentTime) {
  const b = A.ctx.createBiquadFilter();
  b.type = type;
  if (Array.isArray(f)) env(b.frequency, t, f);
  else b.frequency.value = f;
  b.Q.value = Q;
  return b;
}

export function amp(A, t, points) {
  const g = A.ctx.createGain();
  g.gain.value = 0;
  if (points) env(g.gain, t, points);
  return g;
}

/** Route `src` through `nodes` in series and return the last one. */
export function chain(src, ...nodes) {
  return nodes.reduce((a, b) => (a.connect(b), b), src);
}

/** Frequency modulation: adds `depth` Hz of `rate` Hz wobble to an AudioParam. */
export function wobble(A, param, t, dur, rate, depth, type = 'sine') {
  const o = osc(A, type, t, dur, rate);
  const g = A.ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
}

export function setListener(A, pos, fwd) {
  const l = A.ctx.listener;
  const t = A.ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(pos.x, t, 0.05);
    l.positionY.setTargetAtTime(pos.y, t, 0.05);
    l.positionZ.setTargetAtTime(pos.z, t, 0.05);
    l.forwardX.setTargetAtTime(fwd.x, t, 0.05);
    l.forwardY.setTargetAtTime(fwd.y, t, 0.05);
    l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
  }
  Object.assign(A.listenerPos, { x: pos.x, y: pos.y, z: pos.z });
}

/**
 * A voice placed in the world: input → air absorption → HRTF panner → dry + reverb send. Distant
 * calls lose their highs and arrive wetter, the way they do across water and through forest.
 */
export function spot(A, p, { ref = 12, gain = 1, send = 0.3 } = {}) {
  const { ctx } = A;
  const d = Math.hypot(p.x - A.listenerPos.x, p.y - A.listenerPos.y, p.z - A.listenerPos.z);
  const input = ctx.createGain();
  input.gain.value = gain;
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = Math.max(900, 18000 * Math.exp(-d / 150));
  const pan = ctx.createPanner();
  pan.panningModel = A.hrtf ? 'HRTF' : 'equalpower';
  pan.distanceModel = 'inverse';
  pan.refDistance = ref;
  pan.rolloffFactor = 1.1;
  pan.maxDistance = 800;
  if (pan.positionX) {
    pan.positionX.value = p.x;
    pan.positionY.value = p.y;
    pan.positionZ.value = p.z;
  } else pan.setPosition(p.x, p.y, p.z);
  chain(input, air, pan).connect(A.master);
  const s = ctx.createGain();
  s.gain.value = send * (1 + Math.min(1.5, d / 120));
  pan.connect(s).connect(A.reverb);
  return input;
}

/** A stereo bed that is not placed in the world (wind, insects, water). */
export function bed(A, { gain = 0, send = 0.15, pan = 0 } = {}) {
  const g = A.ctx.createGain();
  g.gain.value = gain;
  const p = A.ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(A.master);
  const s = A.ctx.createGain();
  s.gain.value = send;
  p.connect(s).connect(A.reverb);
  return g;
}
