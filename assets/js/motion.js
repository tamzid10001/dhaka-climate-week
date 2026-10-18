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

  // Heat scale in °C above the late-1800s average: river teal (cool) > ochre > rust > ember (hot).
  // The chart is read on light ground (the misted day world, or the base design's moon surface), so every
  // stop is dark enough to hold at least 3:1 against it.
  const HEAT_STOPS = [
    [-0.3, [47, 93, 87]],
    [0.35, [135, 88, 26]],
    [0.85, [163, 70, 12]],
    [1.45, [138, 31, 8]],
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

  function heatColor(value) {
    let i = 1;
    while (i < HEAT_STOPS.length - 1 && value > HEAT_STOPS[i][0]) i++;
    const [v0, c0] = HEAT_STOPS[i - 1];
    const [v1, c1] = HEAT_STOPS[i];
    const t = clamp((value - v0) / (v1 - v0), 0, 1);
    const [r, g, b] = c0.map((channel, k) => Math.round(channel + (c1[k] - channel) * t));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function formatAnomaly(value) {
    const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '\u00b1';
    return `${sign}${Math.abs(value).toFixed(2)}\u00b0C`;
  }

  /* ---------- Signature: scroll-driven temperature chart with a live thermometer ---------- */
  function initWarming() {
    const section = document.querySelector('[data-warming]');
    const figure = section && section.querySelector('[data-w-figure]');
    if (!figure) return;
    const yearEl = section.querySelector('[data-w-year]');
    const anomEl = section.querySelector('[data-w-anom]');
    const swatchEl = section.querySelector('[data-w-swatch]');
    const noteEl = section.querySelector('[data-w-note]');

    const firstYear = GISTEMP_FIRST_YEAR;
    const count = GISTEMP.length;
    const lastYear = firstYear + count - 1;
    // Re-baselined from NASA's 1951-1980 reference to 1880-1900, the earliest years of the record and a
    // common stand-in for pre-industrial levels, so the 1.5°C Paris line sits where it belongs.
    const baseline = GISTEMP.slice(0, 21).reduce((sum, v) => sum + v, 0) / 2100;
    const values = GISTEMP.map((v) => v / 100 - baseline);

    let minIndex = 0;
    let maxIndex = 0;
    let best = -Infinity;
    const records = [];
    values.forEach((v, i) => {
      if (v < values[minIndex]) minIndex = i;
      if (v > values[maxIndex]) maxIndex = i;
      if (v > best) {
        best = v;
        if (firstYear + i >= 1930) records.push(i);
      }
    });
    const recordSet = new Set(records);
    const lastRank = values.filter((v) => v > values[count - 1]).length + 1;
    const RANKS = ['', 'Hottest', 'Second-hottest', 'Third-hottest'];

    function noteFor(i) {
      if (i === maxIndex) return 'Hottest year on record';
      if (i === minIndex) return 'Coldest year on record';
      if (i === count - 1) return RANKS[lastRank] ? `${RANKS[lastRank]} year on record` : 'Latest full year';
      if (firstYear + i === 2015) return 'Paris Agreement adopted';
      if (i === 0) return 'NASA\u2019s record begins';
      return recordSet.has(i) ? 'New record high' : '';
    }

    function setReadout(i) {
      if (yearEl) yearEl.textContent = String(firstYear + i);
      if (anomEl) anomEl.textContent = formatAnomaly(values[i]);
      if (swatchEl) swatchEl.style.background = heatColor(values[i]);
      if (noteEl) noteEl.textContent = noteFor(i);
    }

    const Y_MIN = -0.5;
    const Y_MAX = 1.75;
    const PARIS = 1.5;
    const recentRecords = records.filter((i) => firstYear + i >= 1980).length;
    const summary =
      `Line chart of Earth's average surface temperature each year from ${firstYear} to ${lastYear}, compared with the 1880 to 1900 average. ` +
      `The coldest year was ${firstYear + minIndex} at ${formatAnomaly(values[minIndex])} and the hottest was ` +
      `${firstYear + maxIndex} at ${formatAnomaly(values[maxIndex])}. Of the ${records.length} record highs set since 1930, ` +
      `${recentRecords} came after 1980. A dashed line marks the 1.5°C Paris Agreement limit.`;
    const px = (n) => n.toFixed(1);

    let geo = null;
    let current = 0;
    let shownIndex = -1;

    function build() {
      const W = Math.round(figure.clientWidth);
      const H = Math.round(figure.clientHeight);
      if (W < 60 || H < 60 || (geo && geo.W === W && geo.H === H)) return false;

      const compact = W < 560;
      const tubeW = compact ? 9 : 12;
      const bulbR = compact ? 9 : 11;
      const hw = tubeW / 2;
      const tx = W - (compact ? 38 : 46) - hw;
      const tubeL = tx - hw;
      const plotL = 0;
      const plotR = tubeL - (compact ? 16 : 26);
      const plotT = compact ? 16 : 20;
      const plotB = H - (compact ? 26 : 30);
      const xOf = (i) => plotL + (i / (count - 1)) * (plotR - plotL);
      const yOf = (v) => plotB - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (plotB - plotT);

      const pts = values.map((v, i) => [xOf(i), yOf(v)]);
      const line = `M${pts.map(([x, y]) => `${px(x)} ${px(y)}`).join('L')}`;
      const area = `${line}L${px(plotR)} ${px(plotB)}L${px(plotL)} ${px(plotB)}Z`;

      const s0 = HEAT_STOPS[0][0];
      const sN = HEAT_STOPS[HEAT_STOPS.length - 1][0];
      const gradient = (id, alphas) =>
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${px(yOf(s0))}" y2="${px(yOf(sN))}">` +
        HEAT_STOPS.map(
          ([v, c], k) =>
            `<stop offset="${((v - s0) / (sN - s0)).toFixed(3)}" stop-color="rgb(${c.join(',')})" stop-opacity="${alphas[k]}"/>`
        ).join('') +
        '</linearGradient>';

      const gridEnd = px(tubeL - 5);
      const grid = [0, 0.5, 1, PARIS]
        .map(
          (v) =>
            `<line${v === 0 ? ' class="wc-zero"' : v === PARIS ? ' class="wc-paris"' : ''} x1="${plotL}" x2="${gridEnd}" y1="${px(yOf(v))}" y2="${px(yOf(v))}"/>`
        )
        .join('');

      let years = '';
      for (let year = firstYear; year <= lastYear; year += compact ? 40 : 20) {
        years += `<text x="${px(xOf(year - firstYear))}" y="${H - 8}" text-anchor="${year === firstYear ? 'start' : 'middle'}">${year}</text>`;
      }

      const recordDots = records
        .map((i) => {
          const [x, y] = pts[i];
          return (
            `<g class="wc-rec"><circle class="wc-rec__ping" cx="${px(x)}" cy="${px(y)}" r="3"/>` +
            `<circle class="wc-rec__dot" cx="${px(x)}" cy="${px(y)}" r="${compact ? 2.4 : 2.9}"/></g>`
          );
        })
        .join('');

      const axisLabels =
        `<text class="wc-paris-label" x="${plotL}" y="${px(yOf(PARIS) - 8)}">${compact ? '1.5°C Paris limit' : '1.5°C · Paris Agreement limit'}</text>` +
        `<text class="wc-zero-label" x="${px(plotR)}" y="${px(yOf(0) - 8)}" text-anchor="end">Late-1800s average</text>`;

      const [cx, cy] = pts[minIndex];
      const [hx, hy] = pts[maxIndex];
      const notes =
        `<g class="wc-note"><circle class="wc-note__ring" cx="${px(cx)}" cy="${px(cy)}" r="5.5"/>` +
        `<text x="${px(cx)}" y="${px(Math.min(cy + 20, plotB - 2))}" text-anchor="middle">Coldest${compact ? '' : ' year'} · ${firstYear + minIndex}</text></g>` +
        `<g class="wc-note wc-note--hot"><circle class="wc-note__ring" cx="${px(hx)}" cy="${px(hy)}" r="5.5"/>` +
        `<text x="${px(hx - 10)}" y="${px(hy - 12)}" text-anchor="end">Hottest${compact ? '' : ' year'} · ${firstYear + maxIndex}</text></g>`;

      const bulbCy = plotB + bulbR * 0.45;
      const tubeTop = yOf(Y_MAX) - 2;
      const neck = bulbCy - Math.sqrt(bulbR * bulbR - hw * hw);
      const glass =
        `M${px(tx - hw)} ${px(tubeTop + hw)}A${hw} ${hw} 0 0 1 ${px(tx + hw)} ${px(tubeTop + hw)}` +
        `L${px(tx + hw)} ${px(neck)}A${bulbR} ${bulbR} 0 1 1 ${px(tx - hw)} ${px(neck)}Z`;
      const mw = hw - 2.5;
      const mR = bulbR - 3;
      const mNeck = bulbCy - Math.sqrt(mR * mR - mw * mw);
      const mercuryPath = (level) => {
        const top = Math.min(level, mNeck - mw);
        return (
          `M${(tx - mw).toFixed(2)} ${(top + mw).toFixed(2)}A${mw} ${mw} 0 0 1 ${(tx + mw).toFixed(2)} ${(top + mw).toFixed(2)}` +
          `L${(tx + mw).toFixed(2)} ${mNeck.toFixed(2)}A${mR} ${mR} 0 1 1 ${(tx - mw).toFixed(2)} ${mNeck.toFixed(2)}Z`
        );
      };
      const tickX = tx + hw + 2;
      let ticks = '';
      for (let k = -3; k <= 17; k++) {
        const y = yOf(k / 10);
        const major = k % 5 === 0;
        ticks += `<line class="wc-tick${major ? ' wc-tick--major' : ''}" x1="${px(tickX)}" x2="${px(tickX + (major ? 6 : 3))}" y1="${px(y)}" y2="${px(y)}"/>`;
        if (major) {
          ticks += `<text class="wc-tlabel${k === 15 ? ' wc-tlabel--paris' : ''}" x="${px(tickX + 9)}" y="${px(y + 4)}">${k === 0 ? '0°' : `+${(k / 10).toFixed(1)}°`}</text>`;
        }
      }
      const shine =
        `<line class="wc-shine" x1="${px(tx - hw + 2.3)}" x2="${px(tx - hw + 2.3)}" y1="${px(tubeTop + hw + 3)}" y2="${px(neck - 2)}"/>` +
        `<circle class="wc-shine-dot" cx="${px(tx - bulbR * 0.38)}" cy="${px(bulbCy - bulbR * 0.38)}" r="${px(bulbR * 0.2)}"/>`;

      figure.innerHTML =
        `<svg class="wc${compact ? ' is-compact' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">` +
        `<defs><clipPath id="wc-reveal"><rect class="wc-reveal" x="${plotL - 6}" y="0" width="0" height="${H}"/></clipPath>` +
        gradient('wc-heat-line', [1, 1, 1, 1]) +
        gradient('wc-heat-area', [0, 0.06, 0.18, 0.34]) +
        '</defs>' +
        `<g class="wc-grid">${grid}</g>` +
        `<g class="wc-years">${years}</g>` +
        `<g clip-path="url(#wc-reveal)"><path class="wc-area" fill="url(#wc-heat-area)" d="${area}"/>` +
        `<path class="wc-line" stroke="url(#wc-heat-line)" d="${line}"/></g>` +
        `<g class="wc-recs">${recordDots}</g>` +
        '<line class="wc-leader" x1="0" y1="0" x2="0" y2="0"/>' +
        `<g class="wc-axis">${axisLabels}</g>` +
        `<g class="wc-notes">${notes}</g>` +
        `<g class="wc-thermo"><path class="wc-glass" d="${glass}"/><path class="wc-mercury" d="${mercuryPath(yOf(0))}"/>${shine}${ticks}</g>` +
        `<g class="wc-head"><circle class="wc-head__halo" r="5"/><circle class="wc-head__dot" r="${compact ? 4.5 : 5.5}"/></g>` +
        '</svg>';

      const svg = figure.firstElementChild;
      const recordEls = svg.querySelectorAll('.wc-rec');
      const noteEls = svg.querySelectorAll('.wc-note');
      geo = {
        W,
        H,
        svg,
        xOf,
        yOf,
        plotL,
        tubeL,
        mercuryPath,
        reveal: svg.querySelector('.wc-reveal'),
        leader: svg.querySelector('.wc-leader'),
        head: svg.querySelector('.wc-head'),
        headDot: svg.querySelector('.wc-head__dot'),
        mercury: svg.querySelector('.wc-mercury'),
        records: records.map((i, k) => [i, recordEls[k]]),
        notes: [[minIndex, noteEls[0]], [maxIndex, noteEls[1]]],
      };
      return true;
    }

    function render(f, quiet) {
      if (!geo) return;
      f = clamp(f, 0, count - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(count - 1, i0 + 1);
      const v = values[i0] + (values[i1] - values[i0]) * (f - i0);
      const x = geo.xOf(f);
      const y = geo.yOf(v);
      const color = heatColor(v);
      const yAttr = y.toFixed(2);
      geo.reveal.setAttribute('width', (x - geo.plotL + 6).toFixed(2));
      geo.head.setAttribute('transform', `translate(${x.toFixed(2)} ${yAttr})`);
      geo.headDot.setAttribute('fill', color);
      geo.mercury.setAttribute('d', geo.mercuryPath(y));
      geo.mercury.setAttribute('fill', color);
      geo.leader.setAttribute('x1', (x + 11).toFixed(2));
      geo.leader.setAttribute('x2', Math.max(x + 11, geo.tubeL - 5).toFixed(2));
      geo.leader.setAttribute('y1', yAttr);
      geo.leader.setAttribute('y2', yAttr);
      geo.svg.classList.toggle('is-near', v >= 1.25);
      for (const [i, el] of geo.records) {
        const on = i <= f + 0.001;
        if (on === el.classList.contains('on')) continue;
        el.classList.toggle('on', on);
        el.classList.toggle('ping', on && !quiet);
      }
      for (const [i, el] of geo.notes) el.classList.toggle('on', i <= f + 0.001);
      const index = Math.round(f);
      if (index !== shownIndex) {
        shownIndex = index;
        setReadout(index);
      }
    }

    const scrolly = !reduceMotion && window.innerHeight >= 480;
    if (scrolly) section.classList.add('is-scrolly');
    figure.classList.add('is-live');
    current = reduceMotion ? count - 1 : 0;
    build();
    render(current, true);
    watch(figure);
    const rebuild = () => {
      if (build()) render(current, true);
    };
    if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(figure);
    else window.addEventListener('resize', rebuild);
    if (reduceMotion) return;

    if (!scrolly) {
      if (!('IntersectionObserver' in window)) {
        current = count - 1;
        render(current, true);
        return;
      }
      const play = () => {
        const start = performance.now();
        const step = (now) => {
          const t = clamp((now - start) / 3600, 0, 1);
          current = (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * (count - 1);
          render(current);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          io.disconnect();
          play();
        },
        { threshold: 0.4 }
      );
      io.observe(figure);
      return;
    }

    let top = 0;
    let travel = 1;
    let target = 0;
    let frame = 0;
    let last = 0;
    let primed = false;
    const glide = (now) => {
      const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
      last = now;
      current += (target - current) * (1 - Math.exp(-dt / 0.14));
      if (Math.abs(target - current) < 0.004) current = target;
      render(current);
      if (current === target) {
        frame = 0;
        last = 0;
      } else {
        frame = requestAnimationFrame(glide);
      }
    };
    measurers.push(() => {
      top = section.getBoundingClientRect().top + window.scrollY;
      travel = Math.max(1, section.offsetHeight - window.innerHeight);
    });
    scrollers.push((y) => {
      target = Math.min(clamp((y - top) / travel, 0, 1) / 0.86, 1) * (count - 1);
      if (!primed) {
        primed = true;
        current = target;
        render(current, true);
        return;
      }
      if (!frame) frame = requestAnimationFrame(glide);
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
