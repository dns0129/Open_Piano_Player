/* 琴伴官网 · 交互（经典脚本，无模块/fetch，可直接双击 index.html 运行） */
(function () {
  'use strict';
  var E = window.QBE, A = window.QBA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var body = document.body, root = document.documentElement;
  var narrow = function () { return window.innerWidth < 900; };

  /* ---------------- 声音开关 ---------------- */
  var soundBtn = $('#sound');
  function syncSound(on) {
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('.sound-text b', soundBtn).textContent = on ? '开' : '关';
  }
  A.on(syncSound);
  soundBtn.addEventListener('click', function () { A.toggle(); });

  /* ---------------- 键盘生成 ---------------- */
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  function buildKeys(host, lo, hi, labels) {
    var map = {}, whites = [], m;
    for (m = lo; m <= hi; m++) if (!BLACK[m % 12]) whites.push(m);
    var w = 100 / whites.length, frag = document.createDocumentFragment(), wi = 0;
    for (m = lo; m <= hi; m++) {
      var k = document.createElement('div');
      k.dataset.m = m;
      if (BLACK[m % 12]) {
        k.className = 'k b'; k.style.left = (wi * w - w * 0.31) + '%'; k.style.width = (w * 0.62) + '%';
      } else {
        k.className = 'k w' + (m % 12 === 0 ? ' c' : '');
        if (labels && (m % 12 === 0 || true)) { var sp = document.createElement('span'); sp.textContent = E.pitchInfo(m).name; k.appendChild(sp); }
        k.style.flex = '1 1 0'; wi++;
      }
      map[m] = k; frag.appendChild(k);
    }
    host.appendChild(frag);
    // 黑键需要在白键之后绝对定位：host 为 position:relative
    host.style.position = 'relative';
    return map;
  }
  function bindKeys(host, onHit) {
    var down = false;
    function hit(el, fromHover) {
      var k = el && el.closest && el.closest('.k'); if (!k) return;
      var m = +k.dataset.m;
      onHit(m, k, fromHover);
    }
    host.addEventListener('pointerenter', function () { }, true);
    host.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'mouse' && e.target.closest) { var k = e.target.closest('.k'); if (k && k !== host._last) { host._last = k; hit(k, !down); } }
    });
    host.addEventListener('pointerleave', function () { host._last = null; });
    host.addEventListener('pointerdown', function (e) {
      down = true;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var k = e.target.closest('.k'); if (k) { host._last = k; hit(k, false, true); }
    });
    window.addEventListener('pointerup', function () { down = false; });
  }
  function flash(el) { el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 260); }
  function playKey(m, vel, dur) { A.play(m, vel || .72, dur || .9); }

  /* ================= 开场 ================= */
  function buildIntro() {
    var svg = $('#intro-svg'), wide = window.innerWidth >= 700;
    var W = wide ? 1200 : 620, H = 300, sp = wide ? 22 : 18, x0 = wide ? 50 : 20, x1 = W - x0;
    var g = E.geo(sp, 80), ns = 'http://www.w3.org/2000/svg', html = '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (var k = 0; k < 5; k++) { var y = g.tTop + k * sp; html += '<path class="l" pathLength="1" d="M' + x0 + ' ' + y + 'H' + x1 + '"/>'; }
    html += '<text class="g ink clef" x="' + (x0 + sp * .8) + '" y="' + (g.tBot - sp) + '" font-size="' + 4 * sp + '">' + E.G.clefG + '</text>';
    var xs = wide ? [x0 + 330, x0 + 520, x0 + 710, x0 + 900] : [x0 + 190, x0 + 290, x0 + 390, x0 + 490];
    ['E4', 'G4', 'C5', 'E5'].forEach(function (p, i) {
      html += '<g class="ink nt" data-i="' + i + '">' + E.noteSVG({ sp: sp, clef: 't', geo: g, d: E.dOf(p), dur: 1, x: xs[i] }) + '</g>';
    });
    html += '<path class="l bar" pathLength="1" d="M' + (x1 - 10) + ' ' + g.tTop + 'V' + g.tBot + '" style="stroke-width:1.3"/>';
    html += '<path class="l bar" pathLength="1" d="M' + (x1) + ' ' + g.tTop + 'V' + g.tBot + '" style="stroke-width:5"/>';
    svg.innerHTML = html;
    $$('.stem,.ledger', svg).forEach(function (n) { n.setAttribute('stroke', '#1c1b18'); n.style.strokeWidth = '1.6'; });
    return $$('.l', svg);
  }
  function runIntro(done) {
    var intro = $('#intro');
    if (root.classList.contains('nointro') || reduce) { intro.classList.add('done'); done(); return; }
    var lines = buildIntro(), svg = $('#intro-svg'), finished = false, timers = [];
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function finish() {
      if (finished) return; finished = true; timers.forEach(clearTimeout);
      intro.classList.add('run', 'turn'); done();
      setTimeout(function () { intro.classList.add('done'); }, 1100);
    }
    lines.forEach(function (l, i) { var bar = l.classList.contains('bar'); l.style.transition = 'stroke-dashoffset ' + (bar ? .5 : 1.3) + 's cubic-bezier(.65,.05,.25,1) ' + (bar ? 2.5 : i * .09) + 's'; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { lines.forEach(function (l) { l.style.strokeDashoffset = 0; }); }); });
    at(650, function () { var c = $('.clef', svg); c.style.animation = 'ink .9s cubic-bezier(.22,1,.36,1) both'; });
    $$('.nt', svg).forEach(function (n, i) { at(1250 + i * 300, function () { n.style.animation = 'ink .75s cubic-bezier(.22,1,.36,1) both'; if (A.enabled) A.play([64, 67, 72, 76][i], .6, .6); }); });
    at(1500, function () { intro.classList.add('run'); });
    at(3500, finish);
    function skip() { finish(); intro.removeEventListener('click', skip); }
    intro.addEventListener('click', skip); window.addEventListener('keydown', skip, { once: true });
    intro.style.cursor = 'pointer';
  }

  /* ================= 首屏谱带 ================= */
  var band = { notes: [], L: 0, off: 0, last: 0, running: false, speed: 0, headX: 0, keys: null };
  function buildBand() {
    var view = $('#band-view'), track = $('#band-track'), clef = $('#band-clef');
    var sp = narrow() ? 7.6 : 8.7, barW = sp * 24, phrase = 4 * barW, vw = window.innerWidth;
    var reps = Math.ceil((vw + phrase) / phrase) + 2, notes = [], r;
    for (r = 0; r < reps; r++) E.ODE.forEach(function (n) { notes.push({ p: n.p, t: n.t + 16 * r, d: n.d, h: n.h, m: n.m }); });
    var st = E.staff({ sp: sp, barW: barW, bars: 4 * reps, left: 0, clefs: false, notes: notes, top: 2.3 * sp, cls: 'band-svg', label: '沿五线谱行进的音符' });
    track.innerHTML = st.svg;
    var c = E.staff({ sp: sp, barW: 1, bars: 0, left: 0, right: 7.2 * sp, clefs: true, notes: [], top: 2.3 * sp, cls: 'band-clef-svg' });
    clef.innerHTML = c.svg;
    band.L = phrase; band.xAt = st.xAt; band.sp = sp; band.bw = barW / 4;
    band.notes = $$('.n', track).map(function (el, i) {
      var t = +el.dataset.t, n = notes[i];
      return { el: el, x0: st.xAt(t), x1: st.xAt(t + n.d), m: n.m, on: false, d: n.d };
    });
    band.speed = barW / 4 * (72 / 60);
    band.headX = vw * (narrow() ? .5 : .4);
    $('#band-head').style.left = band.headX + 'px';
    if (!band.keys) {
      var strip = $('#hero-keys'); strip.innerHTML = '';
      var lo = narrow() ? 48 : 36, hi = narrow() ? 84 : 96;
      band.keys = buildKeys(strip, lo, hi, false);
      bindKeys(strip, function (m, k) { A.enabled ? 0 : 0; if (A.enabled) playKey(m); flash(k); });
    }
  }
  function bandFrame(ts) {
    if (!band.running) return;
    var dt = band.last ? Math.min(.1, (ts - band.last) / 1000) : 0; band.last = ts;
    band.off = (band.off + dt * band.speed) % band.L;
    var base = -band.L - band.off;
    $('#band-track').style.transform = 'translate3d(' + base + 'px,0,0)';
    var hx = band.headX - base, i, n, on;
    for (i = 0; i < band.notes.length; i++) {
      n = band.notes[i];
      if (n.x1 < hx - 400 || n.x0 > hx + 400) { if (n.on) { n.on = false; n.el.classList.remove('on'); } continue; }
      on = hx >= n.x0 - 2 && hx < n.x1 - 3;
      if (on !== n.on) {
        n.on = on; n.el.classList.toggle('on', on);
        var k = band.keys[n.m]; if (k) k.classList.toggle('on', on);
        if (on && A.enabled) A.play(n.m, n.m < 60 ? .5 : .65, n.d * .8);
      }
    }
    requestAnimationFrame(bandFrame);
  }
  function startBand() { if (band.running) return; band.running = true; band.last = 0; requestAnimationFrame(bandFrame); }
  function stopBand() { band.running = false; }

  /* ================= 练习演示 ================= */
  var demo = { view: 'staff', bpm: 84, t: 0, playing: false, hands: { r: true, l: true }, loop: false, last: 0, st: null, els: [], cur: null, TOTAL: 16 };
  var D = { W: 1100, left: 140, barW: 240, sp: 11 };
  function demoGeo() { return E.geo(D.sp, 3.8 * D.sp); }
  function xAtT(t) { return D.left + 1.4 * D.sp + t * D.barW / 4; }
  function buildDemoStaff() {
    var st = E.staff({ sp: D.sp, barW: D.barW, bars: 4, left: D.left, clefs: true, final: true, measureNo: true, measureStart: 1, notes: E.ODE, top: 3.8 * D.sp, label: '《欢乐颂》五线谱', cls: 'demo-staff' });
    var g = st.geo;
    var ov = '<rect class="hl" x="' + D.left + '" y="' + (g.tTop - 6) + '" width="' + D.barW + '" height="' + (g.bBot - g.tTop + 12) + '" rx="3"/><line class="ph-line" y1="' + (g.tTop - 12) + '" y2="' + (g.bBot + 12) + '" x1="0" x2="0"/>';
    var svg = st.svg.replace('<g class="notes">', ov.split('<line')[0] + '<g class="notes">').replace('</svg>', '<line' + ov.split('<line')[1] + '</svg>');
    return { svg: svg, W: st.W, H: st.H };
  }
  function buildDemoJianpu() {
    var sp = D.sp, g = demoGeo(), H = g.h, W = D.left + 4 * D.barW, s = '', i, ryR = H * .36, ryL = H * .72;
    s += '<svg class="jp demo-jp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="《欢乐颂》简谱">';
    s += '<rect class="hl" x="' + D.left + '" y="' + (H * .1) + '" width="' + D.barW + '" height="' + (H * .8) + '" rx="3"/>';
    s += '<text class="lab" x="22" y="' + (ryR - 30) + '" style="font-size:15px;font-family:var(--serif);font-weight:700;fill:#1c1b18;letter-spacing:.06em">1 = C</text><text class="lab" x="22" y="' + (ryR - 8) + '">4 / 4</text>';
    s += '<text class="lab" x="22" y="' + (ryR + 24) + '" style="font-family:var(--serif)">右手</text><text class="lab" x="22" y="' + (ryL + 24) + '" style="font-family:var(--serif)">左手</text>';
    for (i = 0; i <= 4; i++) { var bx = D.left + i * D.barW; s += '<line class="bl" x1="' + bx + '" x2="' + bx + '" y1="' + (H * .14) + '" y2="' + (H * .86) + '"/>'; if (i < 4) s += '<text class="mno" x="' + (bx + 6) + '" y="' + (H * .14 - 8) + '">' + (i + 1) + '</text>'; }
    s += '<g class="notes">';
    var map = { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7' };
    E.ODE.forEach(function (n, idx) {
      var p = E.parse(n.p), x = xAtT(n.t) + .59 * sp, y = n.h === 'r' ? ryR : ryL, oct = p.o - 4, fs = 36;
      s += '<g class="n ' + (n.h === 'r' ? 'rh' : 'lh') + '" data-i="' + idx + '" data-t="' + n.t + '">';
      s += '<text x="' + x + '" y="' + y + '" font-size="' + fs + '" text-anchor="middle">' + map[p.l] + '</text>';
      var yy = y + 10, k;
      if (n.d <= .5) { s += '<line class="u" x1="' + (x - 11) + '" x2="' + (x + 11) + '" y1="' + (y + 8) + '" y2="' + (y + 8) + '"/>'; yy = y + 17; }
      if (oct < 0) for (k = 0; k < -oct; k++) s += '<circle class="dotm" cx="' + x + '" cy="' + (yy + 3 + k * 8) + '" r="2.5"/>';
      if (oct > 0) for (k = 0; k < oct; k++) s += '<circle class="dotm" cx="' + x + '" cy="' + (y - 34 - k * 8) + '" r="2.5"/>';
      if (n.d === 1.5) s += '<circle class="dotm" cx="' + (x + 19) + '" cy="' + (y - 7) + '" r="2.6"/>';
      var q; if (n.d >= 2) for (q = 1; q < n.d; q++) s += '<line class="u" x1="' + (xAtT(n.t + q) + .59 * sp - 8) + '" x2="' + (xAtT(n.t + q) + .59 * sp + 8) + '" y1="' + (y - 10) + '" y2="' + (y - 10) + '"/>';
      s += '</g>';
    });
    s += '</g><line class="ph-line" y1="' + (H * .08) + '" y2="' + (H * .92) + '" x1="0" x2="0"/></svg>';
    return { svg: s, W: W, H: H };
  }
  function buildDemoRoll() {
    var g = demoGeo(), H = g.h, W = D.left + 4 * D.barW, s = '', rows = 12, top = 26, rh = (H - top - 14) / rows, d0 = 21, i;
    function yD(d) { return top + (32 - d) * rh; }
    s += '<svg class="roll demo-roll" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="《欢乐颂》钢琴卷帘">';
    s += '<rect class="hl" x="' + D.left + '" y="' + top + '" width="' + D.barW + '" height="' + (rows * rh) + '" rx="3"/>';
    for (i = 0; i <= rows; i++) { var d = 32 - i + 1; s += '<line class="grid' + (((d % 7) === 0) ? ' c' : '') + '" x1="' + (D.left - 36) + '" x2="' + W + '" y1="' + (top + i * rh) + '" y2="' + (top + i * rh) + '"/>'; }
    [[21, 'C3'], [28, 'C4'], [32, 'G4']].forEach(function (a) { s += '<text class="lab" x="' + (D.left - 44) + '" y="' + (yD(a[0]) + rh * .72) + '" text-anchor="end">' + a[1] + '</text>'; });
    for (i = 0; i <= 4; i++) { var bx = D.left + i * D.barW; s += '<line class="bar" x1="' + bx + '" x2="' + bx + '" y1="' + top + '" y2="' + (top + rows * rh) + '"/>'; if (i < 4) s += '<text class="lab" x="' + (bx + 6) + '" y="' + (top - 8) + '">' + (i + 1) + '</text>'; }
    s += '<g class="notes">';
    E.ODE.forEach(function (n, idx) {
      var d = E.dOf(n.p), x = xAtT(n.t), w = n.d * D.barW / 4 - 4;
      s += '<g class="n ' + (n.h === 'r' ? 'rh' : 'lh') + '" data-i="' + idx + '" data-t="' + n.t + '"><rect x="' + x + '" y="' + (yD(d) + 1.5) + '" width="' + w + '" height="' + (rh - 3) + '"/></g>';
    });
    s += '</g><line class="ph-line" y1="' + (top - 8) + '" y2="' + (top + rows * rh + 6) + '" x1="0" x2="0"/></svg>';
    return { svg: s, W: W, H: H };
  }
  function renderDemo() {
    var cv = $('#demo-canvas'), b = demo.view === 'staff' ? buildDemoStaff() : demo.view === 'jianpu' ? buildDemoJianpu() : buildDemoRoll();
    cv.innerHTML = b.svg;
    var svg = $('svg', cv); demo.svg = svg; demo.W = b.W; demo.H = b.H;
    demo.els = $$('.n', svg); demo.ph = $('.ph-line', svg); demo.hl = $('.hl', svg);
    demo.cur = {};
    demo.els.forEach(function (el, i) { el.classList.toggle('muted', !demo.hands[E.ODE[i].h]); });
    paintDemo(true);
  }
  function paintDemo(force) {
    var t = demo.t, x = xAtT(t) - (demo.view === 'staff' ? 4 : 2);
    demo.ph.setAttribute('x1', x); demo.ph.setAttribute('x2', x); demo.ph.setAttribute('class', 'ph-line');
    var bar = Math.min(3, Math.floor(t / 4));
    demo.hl.setAttribute('x', D.left + bar * D.barW);
    E.ODE.forEach(function (n, i) {
      var on = demo.playing && demo.hands[n.h] && t >= n.t && t < n.t + n.d;
      if (force || demo.cur[i] !== on) { demo.cur[i] = on; demo.els[i].classList.toggle('on', on); }
    });
    // 移动端：跟随播放头
    var sc = $('#demo-scroll');
    if (sc.scrollWidth > sc.clientWidth + 4 && demo.playing) {
      var px = x * (sc.scrollWidth / demo.W); if (px > sc.scrollLeft + sc.clientWidth - 70 || px < sc.scrollLeft) sc.scrollTo({ left: Math.max(0, px - 90), behavior: 'smooth' });
    }
  }
  function demoFrame(ts) {
    if (!demo.playing) return;
    var dt = demo.last ? Math.min(.1, (ts - demo.last) / 1000) : 0; demo.last = ts;
    var prev = demo.t, db = dt * demo.bpm / 60; demo.t += db;
    var cur = demo.t, wrapped = false;
    if (cur >= demo.TOTAL) { wrapped = true; cur = demo.TOTAL - 1e-6; }
    E.ODE.forEach(function (n) {
      if (demo.hands[n.h] && n.t >= prev && n.t < Math.min(cur, demo.TOTAL) && n.t < demo.t + 1e-9) A.play(n.m, n.h === 'r' ? .74 : .55, n.d * 60 / demo.bpm);
    });
    if (wrapped) {
      if (demo.loop) { demo.t = demo.t - demo.TOTAL; demo.last = ts; E.ODE.forEach(function (n) { if (demo.hands[n.h] && n.t < demo.t) A.play(n.m, n.h === 'r' ? .74 : .55, n.d * 60 / demo.bpm); }); }
      else { setDemoPlaying(false); demo.t = 0; paintDemo(true); return; }
    }
    paintDemo(); requestAnimationFrame(demoFrame);
  }
  function setDemoPlaying(p) {
    demo.playing = p; demo.last = 0;
    $('#demo-play').classList.toggle('is-playing', p);
    if (p) { requestAnimationFrame(demoFrame); } else paintDemo(true);
  }
  function initDemo() {
    renderDemo();
    $('#demo-play').addEventListener('click', function () {
      if (!demo.playing) { A.enable(); setDemoPlaying(true); } else setDemoPlaying(false);
    });
    var bpm = $('#demo-bpm'), out = $('#demo-bpm-out');
    bpm.addEventListener('input', function () { demo.bpm = +bpm.value; out.textContent = bpm.value; });
    $$('.seg button').forEach(function (b) { b.addEventListener('click', function () { $$('.seg button').forEach(function (x) { x.classList.toggle('on', x === b); }); demo.view = b.dataset.view; renderDemo(); }); });
    $$('.tog button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.loop != null) { demo.loop = !demo.loop; b.classList.toggle('on', demo.loop); return; }
        var h = b.dataset.hand; demo.hands[h] = !demo.hands[h]; b.classList.toggle('on', demo.hands[h]);
        if (!demo.hands.r && !demo.hands.l) { demo.hands[h] = true; b.classList.add('on'); }
        demo.els.forEach(function (el, i) { el.classList.toggle('muted', !demo.hands[E.ODE[i].h]); }); paintDemo(true);
      });
    });
    $('#demo-canvas').addEventListener('click', function (e) {
      var r = demo.svg.getBoundingClientRect(), x = (e.clientX - r.left) * (demo.W / r.width);
      var t = (x - xAtT(0)) / (D.barW / 4 ); t = Math.max(0, Math.min(15.9, t));
      var best = 0, bd = 99; E.ODE.forEach(function (n) { if (Math.abs(n.t - t) < bd) { bd = Math.abs(n.t - t); best = n.t; } });
      demo.t = best; A.enable(); if (!demo.playing) setDemoPlaying(true); else { demo.last = 0; paintDemo(true); }
    });
  }

  /* ================= 键盘 · 音符落墨 ================= */
  var ks = { sp: 8.4, list: [], max: 8 };
  function initKeys() {
    var host = $('#kb'), m;
    var lo = 48, hi = 84; // C3–C6
    var map = buildKeys(host, lo, hi, true);
    host.style.minWidth = (22 * 38) + 'px';
    var box = $('#keys-staff'), sp = ks.sp, g = E.geo(sp, 3.5 * sp);
    var VW = narrow() ? 560 : 1000; ks.max = narrow() ? 4 : 8; ks.x0 = narrow() ? 190 : 270; ks.dx = narrow() ? 90 : 100;
    var st = E.staff({ sp: sp, barW: VW - 30, bars: 1, left: 30, clefs: true, final: false, notes: [], top: 3.5 * sp, cls: 'keys-svg', label: '键盘音符写在谱上' });
    box.innerHTML = st.svg.replace('</svg>', '<g class="live"></g></svg>');
    box.style.setProperty('--ar', VW + ' / 188'); var live = $('.live', box); ks.g = g; ks.live = live;
    var stSvg = $('svg', box); stSvg.removeAttribute('width'); stSvg.removeAttribute('height'); stSvg.style.height = '100%';
    function note(m) {
      var info = E.pitchInfo(m), clef = m >= 60 ? 't' : 'b';
      if (ks.list.length >= ks.max) { ks.list = []; live.innerHTML = ''; }
      var x = ks.x0 + ks.list.length * ks.dx;
      Array.prototype.forEach.call(live.children, function (c) { c.classList.add('old'); });
      var gEl = document.createElementNS('http://www.w3.org/2000/svg', 'g'); gEl.setAttribute('class', 'nt n');
      gEl.innerHTML = E.noteSVG({ sp: sp, clef: clef, geo: g, d: info.d, dur: 1, x: x, sharp: info.sharp });
      live.appendChild(gEl); ks.list.push(m);
      var nm = $('#kr-name'), sb = $('#kr-sub');
      nm.textContent = info.name.replace(/(\d)$/, '$1');
      var jp = E.JIANPU[info.pc] || E.JIANPU[info.pc - 1], pre = info.sharp ? '♯' : '';
      var reg = ['', '', '', '低音', '中音', '高音', '倍高音'][info.oct] || '';
      sb.textContent = (m === 60 ? '中央 C · ' : '') + '简谱 ' + pre + jp + (reg ? ' · ' + reg : '') + ' · ' + E.freq(m).toFixed(1) + ' Hz';
    }
    bindKeys(host, function (m, k, fromHover) {
      note(m); flash(k); A.init();
      if (!fromHover) { A.enable().then(function () { playKey(m, .78, 1.1); }); if (A.enabled && A.ready) playKey(m, .78, 1.1); }
      else if (A.enabled) playKey(m, .62, .9);
    });
    // 初始：写入中央 C 以示范
    note(60);
    var sc = $('#kb-scroll'); setTimeout(function () { sc.scrollLeft = 0; }, 0);
  }

  /* ================= 截图层叠 ================= */
  function initFolio() {
    var f = $('#folio'), leaves = $$('.plate', f), n = leaves.length, idx = 0, prev = 0, dots = $('#folio-dots');
    leaves.forEach(function (l, i) { var d = document.createElement('i'); d.addEventListener('click', function (e) { e.stopPropagation(); go(i); }); dots.appendChild(d); });
    var di = $$('i', dots), copy = $('.folio-copy');
    function paint(swapCopy) {
      leaves.forEach(function (l, i) {
        l.classList.toggle('is-on', i === idx);
        l.classList.toggle('is-prev', i === prev && i !== idx);
        l.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
      });
      di.forEach(function (d, i) { d.classList.toggle('on', i === idx); });
      $('#folio-i').textContent = idx + 1;
      if (!swapCopy) return;
      copy.classList.add('swap');
      setTimeout(function () { $('#folio-title').textContent = leaves[idx].dataset.title; $('#folio-text').textContent = leaves[idx].dataset.text; copy.classList.remove('swap'); }, 280);
    }
    function go(i) {
      var nextIdx = Math.max(0, Math.min(n - 1, i));
      if (nextIdx === idx) return;
      prev = idx; idx = nextIdx; paint(true);
    }
    function next() { go(idx >= n - 1 ? 0 : idx + 1); }
    $('#folio-next').addEventListener('click', next);
    $('#folio-prev').addEventListener('click', function () { go(idx <= 0 ? n - 1 : idx - 1); });
    f.addEventListener('click', next);
    f.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); next(); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); } });
    var sx = null; f.addEventListener('pointerdown', function (e) { sx = e.clientX; }); f.addEventListener('pointerup', function (e) { if (sx != null && Math.abs(e.clientX - sx) > 50) { e.preventDefault(); if (e.clientX < sx) go(idx + 1); else go(idx - 1); f._swiped = true; setTimeout(function () { f._swiped = false; }, 50); } sx = null; });
    f.addEventListener('click', function (e) { if (f._swiped) e.stopImmediatePropagation(); }, true);
    paint(false);
  }

  /* ================= 找谱：打字 ================= */
  function initSearch() {
    var box = $('#search-demo'), t = $('#sd-text'), hit = $('#sd-hit'), al = $('.sd-alias', box), word = '野蜂飞舞', done = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || done) return; done = true; t.textContent = '';
        var i = 0; (function step() { if (i < word.length) { t.textContent += word[i++]; setTimeout(step, 230); } else { setTimeout(function () { hit.classList.add('show'); al.classList.add('show'); }, 450); } })();
      });
    }, { threshold: .6 });
    io.observe(box);
    if (reduce) { hit.classList.add('show'); al.classList.add('show'); }
  }

  /* ================= 滚动：揭示 / 进度 / 小节计数 ================= */
  function countUp(el) {
    var end = +el.dataset.count, sep = el.dataset.sep, t0 = null, dur = 1700;
    function f(v) { v = Math.round(v); return sep ? v.toLocaleString('en-US') : String(v); }
    function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(end * e); if (p < 1) requestAnimationFrame(step); else el.textContent = f(end); }
    el.textContent = f(0); requestAnimationFrame(step);
  }
  function initReveal() {
    $$('[data-reveal]').forEach(function (el) {
      var sibs = $$('[data-reveal]', el.parentNode).filter(function (x) { return x.parentNode === el.parentNode; });
      el.style.setProperty('--rd', Math.min(.5, sibs.indexOf(el) * .09) + 's');
    });
    var targets = $$('[data-reveal], .sec-head, [data-strip], .finale');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in'); io.unobserve(e.target);
        $$('[data-count]', e.target).forEach(countUp);
      });
    }, { rootMargin: '0px 0px -9% 0px', threshold: .08 });
    targets.forEach(function (t) { io.observe(t); });
    window.__revealAll = function () { targets.forEach(function (t) { t.classList.add('is-in'); }); };
  }
  function initScroll() {
    var bar = $('.progress i'), top = $('#top-bar'), mc = $('#mc-num'), links = $$('.nav a'), secs = links.map(function (a) { return $(a.getAttribute('href')); }), tick = false;
    function upd() {
      tick = false;
      var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight, p = h > 0 ? y / h : 0;
      bar.style.transform = 'scaleX(' + p + ')'; top.classList.toggle('solid', y > 40);
      mc.textContent = 1 + Math.round(p * 63); $('.measure-counter').classList.toggle('show', y > window.innerHeight * .7);
      var cur = -1; secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < window.innerHeight * .4) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
      // 首屏谱带离开视口时暂停
      var hero = $('.hero').getBoundingClientRect(); if (hero.bottom < -50) stopBand(); else if (body.classList.contains('is-ready')) startBand();
    }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    window.addEventListener('resize', upd); upd();
  }

  /* ================= 启动 ================= */
  function ready() {
    $$('.hero-copy > *').forEach(function (el, i) { el.classList.add('h-in'); el.style.setProperty('--d', (.25 + i * .12) + 's'); });
    ['.hero-shot', '.hero-phone', '.hero-cap', '.band'].forEach(function (s, i) { var el = $(s); el.classList.add('h-in'); el.style.setProperty('--d', (.5 + i * .18) + 's'); });
    $('.hero-title').classList.remove('h-in');
    initReveal(); initScroll(); initDemo(); initKeys(); initFolio(); initSearch();
    buildBand();
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var w = window.innerWidth; if (Math.abs(w - (band._w || w)) > 40) { band._w = w; band.keys = null; buildBand(); } }, 250); });
    band._w = window.innerWidth;
    var started = false;
    function go() { if (started) return; started = true; body.classList.add('is-ready'); setTimeout(function () { body.classList.remove('is-loading'); startBand(); }, 150); }
    var fontsOk = (document.fonts && document.fonts.load) ? Promise.race([Promise.all([document.fonts.load('40px Bravura', '\uE050'), document.fonts.load('400 40px "Noto Serif SC"', '琴伴')]), new Promise(function (r) { setTimeout(r, 1600); })]) : Promise.resolve();
    fontsOk.then(function () { runIntro(go); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  window.__qb = { band: band, demo: demo };
})();
