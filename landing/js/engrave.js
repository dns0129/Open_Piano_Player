/* 琴伴官网 · 迷你五线谱排版器（SMuFL / Bravura） */
(function () {
  var G = {
    clefG: '\uE050', clefF: '\uE062', head: '\uE0A4', half: '\uE0A3', whole: '\uE0A2',
    flagUp: '\uE240', flagDown: '\uE241', sharp: '\uE262', dig: function (n) { return String.fromCharCode(0xE080 + n); }
  };
  var LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  var SEMI = [0, 2, 4, 5, 7, 9, 11];
  var PC2LET = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  var PC_SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function parse(n) { var m = /^([A-G])(#?)(-?\d)$/.exec(n); return { l: LET[m[1]], s: m[2] ? 1 : 0, o: +m[3] }; }
  function dOf(n) { var p = parse(n); return p.o * 7 + p.l; }
  function midiOf(n) { var p = parse(n); return (p.o + 1) * 12 + SEMI[p.l] + p.s; }
  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function fmt(v) { return Math.round(v * 100) / 100; }

  /* 《欢乐颂》主题前 4 小节（公有领域旋律），C 大调 4/4 */
  var ODE = [
    ['E4', 0, 1, 'r'], ['E4', 1, 1, 'r'], ['F4', 2, 1, 'r'], ['G4', 3, 1, 'r'],
    ['G4', 4, 1, 'r'], ['F4', 5, 1, 'r'], ['E4', 6, 1, 'r'], ['D4', 7, 1, 'r'],
    ['C4', 8, 1, 'r'], ['C4', 9, 1, 'r'], ['D4', 10, 1, 'r'], ['E4', 11, 1, 'r'],
    ['E4', 12, 1.5, 'r'], ['D4', 13.5, 0.5, 'r'], ['D4', 14, 2, 'r'],
    ['C3', 0, 2, 'l'], ['G3', 2, 2, 'l'], ['D3', 4, 2, 'l'], ['G3', 6, 2, 'l'],
    ['C3', 8, 2, 'l'], ['G3', 10, 2, 'l'], ['D3', 12, 2, 'l'], ['G3', 14, 2, 'l']
  ].map(function (a) { return { p: a[0], t: a[1], d: a[2], h: a[3], m: midiOf(a[0]) }; });

  /* 几何：返回 y 位置函数 */
  function geo(sp, top) {
    var tTop = top, tBot = top + 4 * sp, bTop = top + 11 * sp, bBot = top + 15 * sp;
    return {
      tTop: tTop, tBot: tBot, bTop: bTop, bBot: bBot, h: bBot + top,
      y: function (d, clef) {
        var bottom = clef === 't' ? tBot : bBot, base = clef === 't' ? 30 : 18;
        return bottom - (d - base) * sp / 2;
      }
    };
  }

  /* 单个音符：返回 SVG 字符串。x 为音头中心 */
  function noteSVG(o) {
    var sp = o.sp, clef = o.clef, g = o.geo, d = o.d, y = g.y(d, clef), base = clef === 't' ? 30 : 18;
    var dur = o.dur || 1, hw = (dur >= 4 ? 1.69 : 1.18) * sp, xl = o.x - hw / 2, s = '';
    var lines = clef === 't' ? [g.tTop, g.tBot] : [g.bTop, g.bBot];
    // 加线
    var k, ly;
    for (k = base - 2; k >= d; k -= 2) { ly = g.y(k, clef); s += '<line class="ledger" x1="' + fmt(xl - 0.5 * sp) + '" x2="' + fmt(xl + hw + 0.5 * sp) + '" y1="' + fmt(ly) + '" y2="' + fmt(ly) + '"/>'; }
    for (k = base + 10; k <= d; k += 2) { ly = g.y(k, clef); s += '<line class="ledger" x1="' + fmt(xl - 0.5 * sp) + '" x2="' + fmt(xl + hw + 0.5 * sp) + '" y1="' + fmt(ly) + '" y2="' + fmt(ly) + '"/>'; }
    if (o.sharp) s += '<text class="g" x="' + fmt(xl - 1.15 * sp) + '" y="' + fmt(y) + '" font-size="' + 4 * sp + '">' + G.sharp + '</text>';
    var glyph = dur >= 4 ? G.whole : (dur >= 2 ? G.half : G.head);
    s += '<text class="g head" x="' + fmt(xl) + '" y="' + fmt(y) + '" font-size="' + 4 * sp + '">' + glyph + '</text>';
    if (dur < 4) {
      var up = d < base + 4, sx = up ? xl + hw - 0.065 * sp : xl + 0.065 * sp, len = 3.5 * sp;
      var mid = g.y(base + 4, clef), ey = up ? y - len : y + len;
      if (up && ey > mid) ey = mid; if (!up && ey < mid) ey = mid;
      s += '<line class="stem" x1="' + fmt(sx) + '" x2="' + fmt(sx) + '" y1="' + fmt(y) + '" y2="' + fmt(ey) + '"/>';
      if (dur <= 0.5) s += '<text class="g flag" x="' + fmt(sx - 0.065 * sp) + '" y="' + fmt(ey) + '" font-size="' + 4 * sp + '">' + (up ? G.flagUp : G.flagDown) + '</text>';
    }
    var dots = 0, dd = dur; // 附点：1.5 / 0.75 / 3
    if (dur === 1.5 || dur === 3 || dur === 0.75) dots = 1;
    if (dots) {
      var onLine = ((d - base) % 2 === 0);
      s += '<circle class="dot" cx="' + fmt(xl + hw + 0.55 * sp) + '" cy="' + fmt(y - (onLine ? 0.5 * sp : 0)) + '" r="' + fmt(0.2 * sp) + '"/>';
    }
    return s;
  }

  /* 整行（大谱表）：opts = {sp, barW, bars, left, padIn, padOut, clefs, notes, measureNo, extraT, top} */
  function staff(o) {
    var sp = o.sp || 10, g = geo(sp, o.top || 3.6 * sp), bars = o.bars, barW = o.barW, left = o.left || 0;
    var padIn = o.padIn != null ? o.padIn : 1.4 * sp;
    var beatW = barW / 4;
    var W = left + bars * barW, LW = W + (o.right || 0);
    function xAt(t) { return left + padIn + t * beatW; }
    var s = '', i, k, hw = 1.18 * sp;
    var cls = o.cls || '';
    s += '<svg class="staff-svg ' + cls + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + fmt(W + (o.right || 0)) + ' ' + fmt(g.h) + '" width="' + fmt(W + (o.right || 0)) + '" height="' + fmt(g.h) + '" role="img" aria-label="' + (o.label || '五线谱') + '">';
    // 谱线
    s += '<g class="lines">';
    [['t', g.tTop], ['b', g.bTop]].forEach(function (p) { for (k = 0; k < 5; k++) { var yy = p[1] + k * sp; s += '<line x1="0" x2="' + fmt(LW) + '" y1="' + fmt(yy) + '" y2="' + fmt(yy) + '"/>'; } });
    s += '</g>';
    // 小节线
    s += '<g class="bars">';
    if (o.clefs) s += '<line class="sys" x1="' + 0.5 + '" x2="' + 0.5 + '" y1="' + g.tTop + '" y2="' + g.bBot + '"/>';
    for (i = 1; i <= bars; i++) {
      var bx = left + i * barW;
      if (o.final && i === bars) s += '<line class="b-thin" x1="' + fmt(bx - 0.45 * sp) + '" x2="' + fmt(bx - 0.45 * sp) + '" y1="' + g.tTop + '" y2="' + g.bBot + '"/><line class="b-thick" x1="' + fmt(bx - 0.14 * sp) + '" x2="' + fmt(bx - 0.14 * sp) + '" y1="' + g.tTop + '" y2="' + g.bBot + '"/>';
      else s += '<line x1="' + fmt(bx) + '" x2="' + fmt(bx) + '" y1="' + g.tTop + '" y2="' + g.bBot + '"/>';
    }
    s += '</g>';
    // 谱号、拍号
    if (o.clefs) {
      s += '<g class="clefs">';
      s += '<text class="g" x="' + fmt(0.9 * sp) + '" y="' + fmt(g.tBot - sp) + '" font-size="' + 4 * sp + '">' + G.clefG + '</text>';
      s += '<text class="g" x="' + fmt(0.9 * sp) + '" y="' + fmt(g.bTop + sp) + '" font-size="' + 4 * sp + '">' + G.clefF + '</text>';
      var tx = 4.3 * sp;
      [g.tTop, g.bTop].forEach(function (t0) {
        s += '<text class="g" x="' + fmt(tx) + '" y="' + fmt(t0 + 2 * sp) + '" font-size="' + 4 * sp + '">' + G.dig(4) + '</text>';
        s += '<text class="g" x="' + fmt(tx) + '" y="' + fmt(t0 + 4 * sp) + '" font-size="' + 4 * sp + '">' + G.dig(4) + '</text>';
      });
      s += '</g>';
    }
    // 小节序号
    if (o.measureNo) {
      s += '<g class="mno">';
      for (i = 0; i < bars; i++) s += '<text x="' + fmt(left + i * barW + padIn * 0.5) + '" y="' + fmt(g.tTop - 2.1 * sp) + '" font-size="' + fmt(1.55 * sp) + '">' + (o.measureStart + i) + '</text>';
      s += '</g>';
    }
    // 音符
    s += '<g class="notes">';
    o.notes.forEach(function (n, idx) {
      var d = dOf(n.p), clef = n.h === 'r' ? 't' : 'b';
      s += '<g class="n ' + (n.h === 'r' ? 'rh' : 'lh') + '" data-i="' + idx + '" data-t="' + n.t + '" data-m="' + n.m + '">' + noteSVG({ sp: sp, clef: clef, geo: g, d: d, dur: n.d, x: xAt(n.t) + hw / 2 }) + '</g>';
    });
    s += '</g>';
    s += '</svg>';
    return { svg: s, geo: g, xAt: xAt, W: LW, padIn: padIn, H: g.h, beatW: beatW, barW: barW, sp: sp };
  }

  /* 键盘小谱：把某个 MIDI 音写在谱上 */
  function pitchInfo(m) {
    var pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1;
    return { d: oct * 7 + PC2LET[pc], sharp: !!PC_SHARP[pc], name: NAMES[pc] + oct, pc: pc, oct: oct };
  }
  var JIANPU = { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };

  window.QBE = { G: G, parse: parse, dOf: dOf, midiOf: midiOf, freq: freq, ODE: ODE, geo: geo, noteSVG: noteSVG, staff: staff, pitchInfo: pitchInfo, JIANPU: JIANPU, NAMES: NAMES, SEMI: SEMI, fmt: fmt };
})();
