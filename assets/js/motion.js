/* Dhaka Climate Week: motion layer */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // NASA GISS Surface Temperature Analysis (GISTEMP v4): annual global mean (J-D),
  // in hundredths of a degree Celsius relative to the 1951-1980 average.
  const GISTEMP_FIRST_YEAR = 1880;
  const GISTEMP = [
    -17, -9, -11, -18, -28, -33, -31, -36, -18, -11, // 1880s
    -36, -22, -27, -31, -30, -23, -11, -11, -28, -18, // 1890s
    -8, -16, -28, -37, -47, -26, -22, -38, -42, -48, // 1900s
    -44, -44, -37, -34, -15, -14, -36, -46, -30, -27, // 1910s
    -27, -18, -28, -26, -27, -22, -11, -22, -20, -36, // 1920s
    -15, -9, -16, -28, -13, -20, -15, -3, 0, -2, // 1930s
    12, 18, 6, 9, 20, 9, -7, -3, -11, -11, // 1940s
    -17, -7, 1, 8, -13, -14, -19, 5, 6, 3, // 1950s
    -2, 6, 3, 5, -20, -11, -6, -2, -8, 5, // 1960s
    3, -8, 1, 16, -7, -1, -10, 18, 7, 16, // 1970s
    26, 32, 14, 31, 16, 12, 18, 32, 39, 27, // 1980s
    45, 41, 22, 23, 31, 45, 33, 47, 61, 38, // 1990s
    39, 53, 63, 62, 53, 68, 64, 66, 54, 66, // 2000s
    72, 61, 65, 67, 75, 89, 101, 91, 85, 98, // 2010s
    101, 85, 89, 117, 128, 118, // 2020s
  ];

  // Brand palette as a diverging scale: forest green (cool) > linen > mustard > coral (hot).
  const STRIPE_STOPS = [
    [-0.5, [27, 77, 46]],
    [-0.25, [36, 92, 56]],
    [0.12, [239, 237, 230]],
    [0.6, [250, 197, 90]],
    [1.28, [200, 75, 47]],
  ];

  const ITEM_GROUPS = ['.subthemes', '.lenses', '.program', '.speakers-grid', '.team-grid', '.logos', '.facts', '.cards', '.foot__grid'];
  const SPLIT_HEADINGS = '.head__title, .framework-head h2, .theme-core__title, .warming__title';

  const scrollers = [];
  const measurers = [];
  let frameQueued = false;

  const revealObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('m-in');
          revealObserver.unobserve(entry.target);
        }
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    : null;
  const watch = (el) => (revealObserver ? revealObserver.observe(el) : el.classList.add('m-in'));

  function runScrollers() {
    frameQueued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    for (const update of scrollers) update(y, vh);
  }

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(runScrollers);
  }

  function measure() {
    for (const read of measurers) read();
    requestFrame();
  }

  function stripeColor(value) {
    let i = 1;
    while (i < STRIPE_STOPS.length - 1 && value > STRIPE_STOPS[i][0]) i++;
    const [v0, c0] = STRIPE_STOPS[i - 1];
    const [v1, c1] = STRIPE_STOPS[i];
    const t = clamp((value - v0) / (v1 - v0), 0, 1);
    const [r, g, b] = c0.map((channel, k) => Math.round(channel + (c1[k] - channel) * t));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function formatAnomaly(value) {
    const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '\u00b1';
    return `${sign}${Math.abs(value).toFixed(2)}\u00b0C`;
  }

  /* ---------- Signature: scroll-driven warming stripes ---------- */
  function initWarming() {
    const section = document.querySelector('[data-warming]');
    const figure = section && section.querySelector('[data-w-figure]');
    if (!figure) return;
    const yearEl = section.querySelector('[data-w-year]');
    const anomEl = section.querySelector('[data-w-anom]');
    const swatchEl = section.querySelector('[data-w-swatch]');
    const noteEl = section.querySelector('[data-w-note]');

    const values = GISTEMP.map((v) => v / 100);
    const count = values.length;
    const lastYear = GISTEMP_FIRST_YEAR + count - 1;
    let maxIndex = 0;
    let minIndex = 0;
    values.forEach((v, i) => {
      if (v > values[maxIndex]) maxIndex = i;
      if (v < values[minIndex]) minIndex = i;
    });
    const min = values[minIndex];
    const max = values[maxIndex];
    const colors = values.map(stripeColor);
    const PAD = 0.1;
    const ys = values.map((v) => 1 - (PAD + ((v - min) / (max - min)) * (1 - PAD * 2)));

    const stripes = document.createElement('div');
    stripes.className = 'warming__stripes';
    stripes.setAttribute('role', 'img');
    stripes.setAttribute(
      'aria-label',
      `Warming stripes: one stripe per year of global surface temperature from ${GISTEMP_FIRST_YEAR} to ${lastYear}. ` +
        `The coolest year was ${GISTEMP_FIRST_YEAR + minIndex} at ${formatAnomaly(min)} and the warmest was ` +
        `${GISTEMP_FIRST_YEAR + maxIndex} at ${formatAnomaly(max)}, relative to the 1951 to 1980 average.`
    );
    const bars = colors.map((color) => {
      const bar = document.createElement('i');
      bar.style.setProperty('--c', color);
      stripes.appendChild(bar);
      return bar;
    });

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const trace = document.createElementNS(SVG_NS, 'svg');
    trace.setAttribute('class', 'warming__trace');
    trace.setAttribute('viewBox', '0 0 1000 300');
    trace.setAttribute('preserveAspectRatio', 'none');
    trace.setAttribute('aria-hidden', 'true');
    const d = ys
      .map((y, i) => `${i ? 'L' : 'M'}${(((i + 0.5) / count) * 1000).toFixed(2)} ${(y * 300).toFixed(2)}`)
      .join(' ');
    for (const cls of ['halo', 'line']) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', cls);
      path.setAttribute('d', d);
      trace.appendChild(path);
    }

    const marker = document.createElement('div');
    marker.className = 'warming__marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.appendChild(document.createElement('span')).className = 'warming__dot';

    figure.append(stripes, trace, marker);

    function setReadout(i) {
      figure.style.setProperty('--x', ((i + 0.5) / count).toFixed(4));
      figure.style.setProperty('--y', ys[i].toFixed(4));
      if (yearEl) yearEl.textContent = String(GISTEMP_FIRST_YEAR + i);
      if (anomEl) anomEl.textContent = formatAnomaly(values[i]);
      if (swatchEl) swatchEl.style.background = colors[i];
      if (noteEl) {
        noteEl.textContent =
          i === maxIndex ? 'Warmest year on record'
          : i === minIndex ? 'Coolest year on record'
          : i === count - 1 ? 'Latest full year'
          : '';
      }
    }

    let shown = 0;
    function show(n) {
      n = clamp(n, 1, count);
      if (n === shown) return;
      for (let i = shown; i < n; i++) bars[i].classList.add('on');
      for (let i = n; i < shown; i++) bars[i].classList.remove('on');
      shown = n;
      figure.style.setProperty('--p', (n / count).toFixed(4));
      setReadout(n - 1);
    }

    if (reduceMotion || window.innerHeight < 480) {
      show(count);
      setReadout(maxIndex);
      return;
    }

    section.classList.add('is-scrolly');
    let top = 0;
    let travel = 1;
    measurers.push(() => {
      top = section.getBoundingClientRect().top + window.scrollY;
      travel = Math.max(1, section.offsetHeight - window.innerHeight);
    });
    scrollers.push((y) => {
      const progress = clamp((y - top) / travel, 0, 1);
      show(Math.round(1 + Math.min(progress / 0.86, 1) * (count - 1)));
    });
  }

  /* ---------- Four lenses: one more ripple per widening scope ---------- */
  function initLensRipples() {
    document.querySelectorAll('.lens').forEach((lens, index) => {
      let rings = '<circle class="lens__dot" cx="100" cy="100" r="3.5"/>';
      for (let r = 0; r <= index; r++) {
        rings += `<circle class="lens__ring" cx="100" cy="100" r="${24 + r * 22}" style="--r:${r}"/>`;
      }
      lens.insertAdjacentHTML(
        'afterbegin',
        `<svg class="lens__ripple" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${rings}</svg>`
      );
    });
  }

  /* ---------- Headings: wrap words so each can rise from a mask ---------- */
  function splitWords(heading) {
    const label = heading.innerText.replace(/\s+/g, ' ').trim();
    let index = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              continue;
            }
            const word = document.createElement('span');
            word.className = 'w';
            word.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--wi', index++);
            word.appendChild(inner);
            frag.appendChild(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      }
    };
    walk(heading);
    heading.setAttribute('aria-label', label);
  }

  function initHeadings() {
    document.querySelectorAll(SPLIT_HEADINGS).forEach((heading) => {
      splitWords(heading);
      heading.classList.add('m-split');
      watch(heading);
    });
  }

  /* ---------- Grid items: stagger by column so every row cascades ---------- */
  function initItems() {
    document.querySelectorAll('.program__icon > *').forEach((shape) => shape.setAttribute('pathLength', '1'));
    const groups = document.querySelectorAll(ITEM_GROUPS.join(','));
    groups.forEach((group) => {
      for (const item of group.children) {
        item.classList.add('m-item');
        watch(item);
      }
    });
    measurers.push(() => {
      groups.forEach((group) => {
        let rowTop = null;
        let column = 0;
        for (const item of group.children) {
          if (!item.classList.contains('m-item')) continue;
          const top = item.offsetTop;
          if (rowTop === null || Math.abs(top - rowTop) > 4) {
            rowTop = top;
            column = 0;
          }
          item.style.setProperty('--i', column++);
        }
      });
    });
  }

  /* ---------- Programme: a boat travels the five days ---------- */
  function initProgramRiver() {
    const program = document.querySelector('.program');
    if (!program) return;
    const days = [...program.querySelectorAll('.program__day')];
    const river = document.createElement('div');
    river.className = 'program__river';
    river.setAttribute('aria-hidden', 'true');
    river.innerHTML = '<svg class="program__boat" focusable="false"><use href="#ic-boat"></use></svg>';
    program.appendChild(river);

    let top = 0;
    let height = 1;
    let active = false;
    let current = -1;
    measurers.push(() => {
      const rect = program.getBoundingClientRect();
      top = rect.top + window.scrollY;
      height = rect.height;
      active = getComputedStyle(river).display !== 'none';
    });
    scrollers.push((y, vh) => {
      if (!active) {
        if (current !== -1) {
          days.forEach((day) => day.classList.remove('is-current'));
          current = -1;
        }
        return;
      }
      const start = top - vh * 0.85;
      const end = top + height - vh * 0.4;
      const progress = clamp((y - start) / (end - start), 0, 1);
      program.style.setProperty('--river', progress.toFixed(4));
      const index = progress > 0.02 ? Math.min(days.length - 1, Math.floor(progress * days.length)) : -1;
      if (index === current) return;
      current = index;
      days.forEach((day, i) => day.classList.toggle('is-current', i === index));
    });
  }

  /* ---------- Hero: content lifts away, the delta sinks slower ---------- */
  function initHero() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    let height = 1;
    let parked = false;
    measurers.push(() => {
      height = hero.offsetHeight || 1;
    });
    scrollers.push((y) => {
      const progress = clamp(y / height, 0, 1);
      if (progress === 1 && parked) return;
      parked = progress === 1;
      hero.style.setProperty('--hero-p', progress.toFixed(4));
    });
  }

  /* ---------- Header: step aside while reading, return on scroll up ---------- */
  function initHeader() {
    const header = document.getElementById('header');
    if (!header) return;
    let lastY = window.scrollY;
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    scrollers.push((y) => {
      const delta = y - lastY;
      lastY = y;
      if (y < 320 || document.body.classList.contains('menu-open')) {
        header.classList.remove('is-hidden');
        return;
      }
      if (delta > 6) header.classList.add('is-hidden');
      else if (delta < -6) header.classList.remove('is-hidden');
    });
  }

  /* ---------- Marquee: follows scroll direction with inertia ---------- */
  function initMarquee() {
    const row = document.querySelector('.strip__row');
    const animation = row && typeof row.getAnimations === 'function' ? row.getAnimations()[0] : null;
    if (!animation) return;
    const period = Number(animation.effect && animation.effect.getComputedTiming().duration) || 40000;
    animation.currentTime = (Number(animation.currentTime) || 0) + period * 100;

    let visible = false;
    let ticking = false;
    let rate = 1;
    let direction = 1;
    let velocity = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }).observe(row);

    const tick = () => {
      const target = direction * (1 + Math.min(Math.abs(velocity) * 3.5, 5));
      rate += (target - rate) * 0.08;
      velocity *= 0.92;
      animation.playbackRate = rate;
      if (Math.abs(target - rate) < 0.005 && Math.abs(velocity) < 0.002) {
        ticking = false;
        return;
      }
      requestAnimationFrame(tick);
    };

    scrollers.push((y) => {
      const now = performance.now();
      const delta = y - lastY;
      velocity = delta / Math.max(16, now - lastT);
      lastY = y;
      lastT = now;
      if (delta) direction = delta > 0 ? 1 : -1;
      if (visible && !ticking) {
        ticking = true;
        requestAnimationFrame(tick);
      }
    });
  }

  /* ---------- Buttons: a gentle magnetic pull ---------- */
  function initMagnetic() {
    document.querySelectorAll('.btn').forEach((btn) => {
      let targetX = 0;
      let targetY = 0;
      let x = 0;
      let y = 0;
      let frame = 0;
      const step = () => {
        x += (targetX - x) * 0.2;
        y += (targetY - y) * 0.2;
        if (Math.abs(targetX - x) < 0.05 && Math.abs(targetY - y) < 0.05) {
          x = targetX;
          y = targetY;
          frame = 0;
          btn.style.translate = x || y ? `${x}px ${y}px` : '';
          return;
        }
        btn.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
        frame = requestAnimationFrame(step);
      };
      const run = () => {
        if (!frame) frame = requestAnimationFrame(step);
      };
      btn.addEventListener('pointermove', (event) => {
        const rect = btn.getBoundingClientRect();
        targetX = (event.clientX - (rect.left - x + rect.width / 2)) * 0.25;
        targetY = (event.clientY - (rect.top - y + rect.height / 2)) * 0.35;
        run();
      });
      btn.addEventListener('pointerleave', () => {
        targetX = 0;
        targetY = 0;
        run();
      });
    });
  }

  initWarming();
  initLensRipples();
  if (!reduceMotion) {
    initHeadings();
    initItems();
    initProgramRiver();
    initHero();
    initHeader();
    initMarquee();
    if (finePointer) initMagnetic();
  }

  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  measure();
})();
