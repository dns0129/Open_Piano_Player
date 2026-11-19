/* 琴伴官网 · 钢琴采样播放（Salamander Grand Piano，CC BY 3.0）。采样内嵌于 audio/samples.js，file:// 下可用 */
(function () {
  var NOTE = { C: 0, Ds: 3, Fs: 6, A: 9 };
  var A = { ctx: null, bufs: [], ready: false, enabled: false, loading: null, master: null, listeners: [] };

  function b64ToBuf(b64) { var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

  A.on = function (fn) { A.listeners.push(fn); };
  function emit() { A.listeners.forEach(function (f) { f(A.enabled); }); }

  A.init = function () {
    if (A.ctx) return A.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    A.ctx = new AC();
    var comp = A.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    var g = A.ctx.createGain(); g.gain.value = 0.9; g.connect(comp); comp.connect(A.ctx.destination); A.master = g;
    return A.ctx;
  };

  A.load = function () {
    if (A.loading) return A.loading;
    var ctx = A.init(); if (!ctx || !window.QB_SAMPLES) return Promise.resolve();
    var names = Object.keys(window.QB_SAMPLES);
    A.loading = Promise.all(names.map(function (name) {
      var m = /^(C|Ds|Fs|A)(\d)$/.exec(name); var midi = (+m[2] + 1) * 12 + NOTE[m[1]];
      return new Promise(function (res) {
        var ab = b64ToBuf(window.QB_SAMPLES[name]);
        var done = function (buf) { A.bufs.push({ midi: midi, buf: buf }); res(); };
        try { var p = ctx.decodeAudioData(ab); if (p && p.then) p.then(done, function () { res(); }); else res(); } catch (e) { res(); }
      });
    })).then(function () { A.bufs.sort(function (a, b) { return a.midi - b.midi; }); A.ready = A.bufs.length > 0; });
    return A.loading;
  };

  A.enable = function () {
    var ctx = A.init(); if (!ctx) return Promise.resolve(false);
    A.enabled = true; emit();
    var r = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    return Promise.resolve(r).then(A.load).then(function () { return true; });
  };
  A.disable = function () { A.enabled = false; emit(); };
  A.toggle = function () { return A.enabled ? (A.disable(), Promise.resolve(false)) : A.enable(); };

  /* 播放一个音：midi，力度 0–1，时长（秒） */
  A.play = function (midi, vel, dur, when) {
    if (!A.enabled || !A.ready || !A.ctx) return;
    var ctx = A.ctx, best = A.bufs[0], i;
    for (i = 1; i < A.bufs.length; i++) if (Math.abs(A.bufs[i].midi - midi) < Math.abs(best.midi - midi)) best = A.bufs[i];
    var src = ctx.createBufferSource(); src.buffer = best.buf; src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
    var g = ctx.createGain(), t0 = when || ctx.currentTime, v = (vel == null ? 0.7 : vel);
    var rel = Math.max(0.35, Math.min(1.6, dur || 0.9));
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.006);
    g.gain.setValueAtTime(v, t0 + Math.max(0.05, (dur || 0.6) * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, (dur || 0.6) * 0.8) + rel);
    src.connect(g); g.connect(A.master); src.start(t0); src.stop(t0 + (dur || 0.6) + rel + 0.1);
  };

  window.QBA = A;
})();
