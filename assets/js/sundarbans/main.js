import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, smoothstep, track } from './util.js';
import { createSky, sampleAtmosphere } from './sky.js';
import { createTerrain, riverX } from './terrain.js';
import { createWater } from './water.js';
import { createFlora } from './flora.js';
import { createFauna } from './fauna.js';
import { createSoundscape } from './audio.js';

/*
 * The Sundarbans, behind the whole page. It opens on a tiger a few metres from the boat; then
 * scrolling is a journey down one tidal river from morning to night: the camera glides south between
 * the mangroves while the sky turns from the reference's luminous day to golden hour, dusk and a
 * starlit night. The page has no panels; its ink turns to moonlight when dusk falls (html.world-night).
 */

const root = document.documentElement;
const canvas = document.querySelector('[data-world]');
const soundButton = document.querySelector('[data-sound]');
const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// `?world-tier=0|1|2` pins the quality and keeps the world running on any device, for debugging.
const forced = params.has('world-tier');

function pickTier() {
  if (forced) return clamp(+params.get('world-tier'), 0, 2);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  if (coarse || small || cores <= 4 || memory <= 4) return 0;
  return cores >= 8 && memory >= 8 ? 2 : 1;
}

/** SwiftShader, llvmpipe and Windows' Basic Render Driver draw WebGL on the CPU; those visitors get the static design. */
function softwareRenderer(gl) {
  let name = String(gl.getParameter(gl.RENDERER));
  if (/^webkit/i.test(name)) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

function start() {
  if (!canvas) return;
  const tier = pickTier();
  const Q = [
    { dpr: 1, minDpr: 0.7, reflect: false, density: 0.42, clouds: 2, octaves: 4, aa: false },
    { dpr: 1.25, minDpr: 0.75, reflect: true, density: 0.7, clouds: 3, octaves: 4, aa: true },
    { dpr: 1.5, minDpr: 0.8, reflect: true, density: 1, clouds: 3, octaves: 5, aa: true },
  ][tier];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', stencil: false });
  } catch {
    return;
  }
  if (!forced && softwareRenderer(renderer.getContext())) {
    renderer.dispose();
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  let dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xe2ecf8, 0.0021);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 2600);
  camera.layers.enable(1);

  const hemi = new THREE.HemisphereLight(0xe3edf9, 0x5d553a, 1.08);
  const sun = new THREE.DirectionalLight(0xfff3df, 1.5);
  scene.add(hemi, sun, sun.target);

  const sky = createSky({ layers: Q.clouds, octaves: Q.octaves });
  const water = createWater({ reflect: Q.reflect });
  const flora = createFlora({ density: Q.density });
  scene.add(sky.mesh, createTerrain(), water.mesh, flora.group);

  const sound = createSoundscape({ hrtf: tier > 0 });
  const fauna = createFauna({
    hosts: flora.hosts,
    tier,
    emit(name, data) {
      if (data && data.ripple) water.addRipple(data.position.x, data.position.z, data.ripple, time);
      sound.event(name, data);
    },
  });
  scene.add(fauna.group);

  // Scroll → journey. The first screen of scrolling belongs to the tiger: it covers only a few metres of
  // river while the camera turns from the island to the channel ahead.
  let maxScroll = 1;
  let heroSpan = 0.06;
  const measure = () => {
    maxScroll = Math.max(1, root.scrollHeight - innerHeight);
    heroSpan = clamp(innerHeight / maxScroll, 0.02, 0.4);
  };
  const forcedP = params.has('world-p') ? clamp(+params.get('world-p')) : null;
  let pTarget = 0;
  let p = forcedP ?? clamp(scrollY / Math.max(1, root.scrollHeight - innerHeight));
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      pointerTarget.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    },
    { passive: true }
  );

  const DEPTH = 1000;
  const HERO_TRAVEL = 26;
  const OFFSET = [[0, -24], [60, -16], [118, 24], [190, 8], [272, -24], [350, -4], [430, 12], [560, 26], [640, 4], [705, -20], [838, -40], [1000, -8]];
  const HEIGHT = [[0, 4.4], [80, 6], [160, 9], [272, 6], [380, 11], [480, 8], [560, 5.5], [705, 5], [838, 3.6], [1000, 3.2]];
  const LOOK = [[0, 0], [70, 22], [118, 50], [200, 0], [272, -34], [350, 0], [430, 20], [560, 34], [640, 0], [705, -22], [838, -38], [1000, -6]];
  const TOD = [[0, 0], [0.5, 0], [0.72, 0.4], [0.86, 0.72], [0.965, 1]];
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const heroPos = new THREE.Vector3();
  const heroLook = new THREE.Vector3();
  const heroFocus = new THREE.Vector3();
  const debugCam = params.get('world-cam')?.split(',').map(Number);
  let heroYaw = 0;
  let heroPitch = 0;
  let framed = false;
  let viewTan = 1;

  /** Metres down the river for a scroll progress: a short hold on the tiger, then the full journey. */
  function depthAt(progress) {
    const k = HERO_TRAVEL / DEPTH;
    if (progress <= heroSpan) return DEPTH * k * (progress / heroSpan);
    return DEPTH * (k + ((1 - k) * (progress - heroSpan)) / (1 - heroSpan));
  }

  /**
   * The opening shot, operated like a documentary camera: it pans after the tiger (damped, so it never
   * jerks) to keep it right of the copy on wide screens and low in the frame, under the copy, on tall
   * ones.
   */
  function aimHero(dt) {
    const { eye, focus } = fauna.heroShot;
    if (framed) heroFocus.lerp(focus, 1 - Math.exp(-2.4 * dt));
    else heroFocus.copy(focus);
    const dx = heroFocus.x - eye.x;
    const dz = heroFocus.z - eye.z;
    const wide = smoothstep(0.75, 1.5, camera.aspect);
    const sx = lerp(0.12, 0.42, wide);
    const sy = lerp(-0.6, -0.34, wide);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const yaw = Math.atan2(dx, -dz) - Math.atan(sx * viewTan);
    const pitch = Math.atan2(heroFocus.y - eye.y, Math.hypot(dx, dz)) - Math.atan(sy * tanV);
    if (!framed || reducedMotion.matches) {
      heroYaw = yaw;
      heroPitch = pitch;
      framed = true;
    } else {
      heroYaw = dampAngle(heroYaw, yaw, 1.5, dt);
      heroPitch = damp(heroPitch, pitch, 1.5, dt);
    }
    heroLook.set(
      eye.x + Math.sin(heroYaw) * Math.cos(heroPitch) * 60,
      eye.y + Math.sin(heroPitch) * 60,
      eye.z - Math.cos(heroYaw) * Math.cos(heroPitch) * 60
    );
  }

  function placeCamera(progress, t, dt) {
    const still = reducedMotion.matches;
    const d = still ? 0 : depthAt(progress);
    const z = -d;
    const bob = still ? 0 : Math.sin(t * 0.45) * 0.14 + Math.sin(t * 0.21) * 0.08;
    camPos.set(riverX(z) + track(OFFSET, d), track(HEIGHT, d) + bob, z);
    const lz = z - 62;
    lookTarget.set(riverX(lz) + track(LOOK, d), track(HEIGHT, d) * 0.42, lz);
    aimHero(dt);
    const hero = still ? 1 : 1 - smoothstep(0, heroSpan * 1.05, progress);
    if (hero > 0) {
      const eye = fauna.heroShot.eye;
      heroPos.set(eye.x, eye.y + bob * 0.5, eye.z);
      camPos.lerp(heroPos, hero);
      lookTarget.lerp(heroLook, hero);
    }
    if (debugCam && debugCam.length === 6) {
      camPos.set(debugCam[0], debugCam[1], debugCam[2]);
      lookTarget.set(debugCam[3], debugCam[4], debugCam[5]);
    }
    camera.position.copy(camPos);
    forward.subVectors(lookTarget, camPos).normalize();
    right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    camera.position.addScaledVector(right, pointer.x * 0.9).addScaledVector(THREE.Object3D.DEFAULT_UP, -pointer.y * 0.45);
    camLook.copy(lookTarget).addScaledVector(right, pointer.x * 2.5);
    camera.lookAt(camLook);
  }

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    camera.aspect = w / h;
    camera.fov = w / h < 0.85 ? 62 : w / h < 1.2 ? 52 : 45;
    camera.updateProjectionMatrix();
    viewTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    renderer.setSize(w, h, false);
    water.setSize(w * dpr, h * dpr);
    measure();
  }
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(measure).observe(document.body);

  let time = 0;
  let last = performance.now();
  let raf = 0;
  let frame = 0;
  let ready = false;
  let lost = false;
  let retired = false;
  let nightInk = false;
  const stats = { tier, dpr, fps: 60 };
  window.__sundarbans = stats;
  if (params.has('world-debug')) Object.assign(stats, { scene, camera, fauna, renderer, sound });

  function setDpr(value) {
    dpr = value;
    stats.dpr = dpr;
    renderer.setPixelRatio(dpr);
    resize();
  }

  /** Hand the page back to the static design, fading the world out before releasing the GPU. */
  function retire() {
    retired = true;
    stats.retired = true;
    stop();
    root.classList.remove('has-world', 'world-glass', 'world-night');
    if (soundButton && soundButton.getAttribute('aria-pressed') !== 'true') soundButton.hidden = true;
    setTimeout(() => renderer.forceContextLoss(), 1800);
  }

  /*
   * Adaptive quality, timed in wall-clock milliseconds so a struggling device reacts as quickly as a capable
   * one: step resolution down while frames run long, then drop the water's mirror pass, and if even that
   * cannot hold ~18fps, retire the world rather than drag the whole page down with it. Resolution climbs
   * back with sustained headroom. A lone long gap after smooth frames is a pause (a throttled iframe, a
   * debugger), not a slow frame.
   */
  let avg = 16;
  let prevMs = 16;
  let warm = 0;
  let slowFor = 0;
  let fastFor = 0;
  let crawlFor = 0;
  function govern(ms) {
    const paused = ms > 1000 && prevMs < 100;
    prevMs = ms;
    if (paused) return;
    const span = Math.min(ms, 1000);
    avg = lerp(avg, Math.min(ms, 250), 1 - Math.exp(-span / 400));
    stats.fps = Math.round(1000 / avg);
    warm += span;
    if (warm < 2000) return;
    slowFor = avg > 24 ? slowFor + span : 0;
    fastFor = avg < 13 ? fastFor + span : 0;
    crawlFor = avg > 55 ? crawlFor + span : 0;
    if (slowFor > 1200 && (dpr > Q.minDpr || water.reflect)) {
      if (dpr > Q.minDpr) setDpr(Math.max(Q.minDpr, dpr - 0.15));
      else water.dropReflection();
      slowFor = 0;
      crawlFor = 0;
    } else if (crawlFor > 3000 && !forced) {
      retire();
    } else if (fastFor > 5000 && dpr < Math.min(window.devicePixelRatio || 1, Q.dpr)) {
      setDpr(Math.min(Q.dpr, dpr + 0.1));
      fastFor = 0;
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    // The simulation steps at most 50 ms; the governor needs the frame time as it really was.
    const frameMs = now - last;
    const dt = clamp(frameMs / 1000, 0, 0.05);
    last = now;
    const still = reducedMotion.matches;
    if (!still) time += dt;
    frame++;

    pTarget = forcedP ?? clamp(scrollY / maxScroll);
    p = damp(p, pTarget, 3, dt);
    pointer.x = damp(pointer.x, still ? 0 : pointerTarget.x, 3.5, dt);
    pointer.y = damp(pointer.y, still ? 0 : pointerTarget.y, 3.5, dt);
    placeCamera(p, time, dt);
    camera.updateMatrixWorld();

    const tod = track(TOD, p);
    // The page's ink follows the light: dark over the bright day, moonlight once the sky has dimmed.
    const dusk = tod > (nightInk ? 0.44 : 0.52);
    if (dusk !== nightInk) {
      nightInk = dusk;
      root.classList.toggle('world-night', dusk);
    }
    const atm = sampleAtmosphere(tod);
    const yaw = Math.atan2(forward.x, -forward.z);
    sky.update(atm, { time, camera, yaw, pointer });
    fog.color.copy(atm.fog);
    fog.density = atm.fogDensity;
    renderer.setClearColor(atm.fog);
    hemi.color.copy(atm.hemiSky);
    hemi.groundColor.copy(atm.hemiGround);
    hemi.intensity = atm.hemi;
    sun.color.copy(atm.light);
    sun.intensity = atm.lightI;
    const az = yaw + atm.sunAz;
    sun.position.set(Math.sin(az) * Math.cos(atm.lightEl), Math.sin(atm.lightEl), -Math.cos(az) * Math.cos(atm.lightEl)).multiplyScalar(100).add(camera.position);
    sun.target.position.copy(camera.position);
    sun.target.updateMatrixWorld();

    water.update(atm, time, fog);
    flora.update(time, 0.75 + Math.sin(time * 0.13) * 0.35, camera.position);
    fauna.update(dt * (still ? 0 : 1), time, { camera, night: atm.night, tod });
    sound.update({ camera, forward, tod, night: atm.night, progress: p, speed: Math.abs(pTarget - p) });

    if (water.reflect && (tier === 2 || frame % 2 === 0)) water.renderReflection(renderer, scene, camera);
    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      root.classList.add('has-world');
      if (tier > 0) root.classList.add('world-glass');
    }

    govern(frameMs);
  }

  function run() {
    if (raf || lost || retired) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      sound.suspend();
    } else {
      run();
      sound.resume();
    }
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    nightInk = false;
    stop();
    root.classList.remove('has-world', 'world-glass', 'world-night');
  });
  // three.js rebuilds its GPU resources on restore, and the first frame back fades the world in again.
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    ready = false;
    warm = 0;
    run();
  });
  run();

  if (soundButton) {
    const label = soundButton.querySelector('[data-sound-label]');
    const sync = (on) => {
      soundButton.setAttribute('aria-pressed', String(on));
      soundButton.setAttribute('aria-label', on ? 'Mute the sounds of the Sundarbans' : 'Play the sounds of the Sundarbans');
      if (label) label.textContent = on ? 'Sound on' : 'Sound off';
    };
    sync(false);
    soundButton.hidden = false;
    soundButton.addEventListener('click', async () => {
      const on = await sound.toggle();
      sync(on);
      if (on) setTimeout(() => fauna.cue('roar'), 2200);
    });
  }
}

start();
