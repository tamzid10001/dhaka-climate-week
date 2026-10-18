import * as THREE from 'three';
import { clamp, damp, lerp, track } from './util.js';
import { createSky, sampleAtmosphere } from './sky.js';
import { createTerrain, riverX } from './terrain.js';
import { createWater } from './water.js';
import { createFlora } from './flora.js';
import { createFauna } from './fauna.js';
import { createSoundscape } from './audio.js';

/*
 * The Sundarbans, behind the whole page. Scrolling is a boat journey down one tidal river from morning
 * to night: the camera glides south between the mangroves while the sky turns from the reference's
 * luminous day to golden hour, dusk and a starlit night. Sections float over it as glass.
 */

const root = document.documentElement;
const canvas = document.querySelector('[data-world]');
const soundButton = document.querySelector('[data-sound]');
const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function pickTier() {
  if (params.has('world-tier')) return clamp(+params.get('world-tier'), 0, 2);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  if (coarse || small || cores <= 4 || memory <= 4) return 0;
  return cores >= 8 && memory >= 8 ? 2 : 1;
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

  const sound = createSoundscape();
  const fauna = createFauna({
    hosts: flora.hosts,
    tier,
    emit(name, data) {
      if (data && data.ripple) water.addRipple(data.position.x, data.position.z, data.ripple, time);
      sound.event(name, data);
    },
  });
  scene.add(fauna.group);

  // Scroll → journey.
  let maxScroll = 1;
  const measure = () => {
    maxScroll = Math.max(1, root.scrollHeight - innerHeight);
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
  const OFFSET = [[0, -24], [60, -16], [118, 24], [190, 8], [272, -24], [350, -4], [430, 12], [560, 26], [640, 4], [705, -20], [838, -26], [1000, -8]];
  const HEIGHT = [[0, 4.4], [80, 6], [160, 9], [272, 6], [380, 11], [480, 8], [560, 5.5], [705, 5], [838, 4], [1000, 3.2]];
  const LOOK = [[0, 0], [70, 10], [118, 34], [200, 0], [272, -34], [350, 0], [430, 20], [560, 34], [640, 0], [705, -22], [838, -32], [1000, -6]];
  const TOD = [[0, 0], [0.5, 0], [0.72, 0.4], [0.86, 0.72], [0.965, 1]];
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const debugCam = params.get('world-cam')?.split(',').map(Number);

  function placeCamera(progress, t) {
    const d = (reducedMotion.matches ? 0 : progress) * DEPTH;
    const z = -d;
    const bob = reducedMotion.matches ? 0 : Math.sin(t * 0.45) * 0.14 + Math.sin(t * 0.21) * 0.08;
    camPos.set(riverX(z) + track(OFFSET, d), track(HEIGHT, d) + bob, z);
    const lz = z - 62;
    lookTarget.set(riverX(lz) + track(LOOK, d), track(HEIGHT, d) * 0.42, lz);
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
  let slow = 0;
  let fast = 0;
  let avg = 16;
  let ready = false;
  const stats = { tier, dpr, fps: 60 };
  window.__sundarbans = stats;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const still = reducedMotion.matches;
    if (!still) time += dt;
    frame++;

    pTarget = forcedP ?? clamp(scrollY / maxScroll);
    p = damp(p, pTarget, 3, dt);
    pointer.x = damp(pointer.x, still ? 0 : pointerTarget.x, 3.5, dt);
    pointer.y = damp(pointer.y, still ? 0 : pointerTarget.y, 3.5, dt);
    placeCamera(p, time);
    camera.updateMatrixWorld();

    const tod = track(TOD, p);
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
    flora.update(time, 0.75 + Math.sin(time * 0.13) * 0.35);
    fauna.update(dt * (still ? 0 : 1), time, { camera, night: atm.night, tod });
    sound.update({ camera, forward, tod, night: atm.night, progress: p, speed: Math.abs(pTarget - p) });

    if (water.reflect && (tier === 2 || frame % 2 === 0)) water.renderReflection(renderer, scene, camera);
    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      root.classList.add('has-world');
      if (tier > 0) root.classList.add('world-glass');
    }

    // Adaptive resolution: hold ~60fps, step down when frames run long, recover when there is headroom.
    avg = lerp(avg, dt * 1000, 0.05);
    stats.fps = Math.round(1000 / avg);
    if (frame > 90) {
      if (avg > 24) slow++;
      else slow = 0;
      if (avg < 13) fast++;
      else fast = 0;
      if (slow > 45 && dpr > Q.minDpr) {
        dpr = Math.max(Q.minDpr, dpr - 0.15);
        renderer.setPixelRatio(dpr);
        resize();
        slow = 0;
      } else if (fast > 240 && dpr < Math.min(window.devicePixelRatio || 1, Q.dpr)) {
        dpr = Math.min(Q.dpr, dpr + 0.1);
        renderer.setPixelRatio(dpr);
        resize();
        fast = 0;
      }
      stats.dpr = dpr;
    }
  }

  function run() {
    if (raf) return;
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
    stop();
    root.classList.remove('has-world', 'world-glass');
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
    soundButton.addEventListener('click', async () => sync(await sound.toggle()));
  }
}

start();
