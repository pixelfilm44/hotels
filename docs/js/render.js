/* SVG board renderer — claymation style.
   Vector clay art by default; images from docs/assets/clay/ override it. */
(function () {
  'use strict';
  var G = window.GAMEDATA;
  var NS = 'http://www.w3.org/2000/svg';
  var C = G.CELL; // 48

  var INK = '#262a33';
  var CREAM = '#f5ead0';

  var svg, gSquares, gPlotsDyn, gEntrances, gDanger, gHighlight, gTokens;
  var tokenEls = {};   // pid -> {g, pos, timer}
  var onSquare = null, onPlot = null;
  var selectable = [];

  var SQ_FILL = {
    plain: '#efe3cb', start: '#ddd6c4', bank: '#f0d98e', cityhall: '#ddc1ec',
    permission: '#bdd9ef', 'free-entrance': '#c4e6c0', 'free-build': '#f3cfae'
  };
  var SQ_LABEL = {
    start: 'CAR PARK', bank: 'BANK', cityhall: 'CITY HALL', permission: 'PLANNING',
    'free-entrance': 'FREE DOOR', 'free-build': 'FREE BUILD'
  };
  var COLOR_KEY = {};
  G.COLORS.forEach(function (c, i) { COLOR_KEY[c] = G.COLOR_NAMES[i].toLowerCase(); });

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, str, size, attrs) {
    var t = el('text', Object.assign({ x: x, y: y, 'font-size': size,
      'text-anchor': 'middle', 'font-family': 'inherit' }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function darken(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.floor(((n >> 16) & 255) * f), g = Math.floor(((n >> 8) & 255) * f),
        b = Math.floor((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function wob(i) { return (((i * 37) % 7) - 3) * 0.35; } // deterministic clay wobble

  function assetImage(key, x, y, w, h, parent) {
    var url = window.ClayAssets && ClayAssets.url(key);
    if (!url) return null;
    return el('image', { href: url, x: x, y: y, width: w, height: h,
      preserveAspectRatio: 'xMidYMid meet' }, parent);
  }

  /* ---------- clay drawing helpers ---------- */
  function clayRect(g, x, y, w, h, fill, rx, sw) {
    var r = el('rect', { x: x, y: y, width: w, height: h, rx: rx || 9,
      fill: fill, stroke: INK, 'stroke-width': sw || 2.2 }, g);
    el('rect', { x: x + 3, y: y + 2.5, width: w - 6, height: 4, rx: 2.5,
      fill: '#ffffff', opacity: 0.22, 'pointer-events': 'none' }, g);
    return r;
  }

  function drawIcon(g, type, cx, cy) {
    if (assetImage('icon-' + type, cx - 11, cy - 11, 22, 22, g)) return;
    switch (type) {
      case 'start':
        txt(g, cx, cy + 7, 'P', 21, { fill: INK, 'font-weight': 'bold' });
        break;
      case 'bank':
        txt(g, cx, cy + 8, '$', 23, { fill: INK, 'font-weight': 'bold' });
        break;
      case 'cityhall': {
        el('path', { d: 'M' + (cx - 12) + ' ' + (cy - 2) + ' L' + cx + ' ' + (cy - 11) +
          ' L' + (cx + 12) + ' ' + (cy - 2) + ' Z', fill: INK }, g);
        for (var i = -1.5; i <= 1.5; i++)
          el('rect', { x: cx + i * 6 - 1.6, y: cy - 1, width: 3.2, height: 9, rx: 1.4, fill: INK }, g);
        el('rect', { x: cx - 12, y: cy + 8, width: 24, height: 3, rx: 1.4, fill: INK }, g);
        break;
      }
      case 'permission': {
        el('rect', { x: cx - 8, y: cy - 11, width: 16, height: 21, rx: 2.5, fill: INK }, g);
        for (var j = 0; j < 3; j++)
          el('rect', { x: cx - 5, y: cy - 7 + j * 5, width: 10 - j * 3, height: 2.2, rx: 1.1,
            fill: SQ_FILL.permission }, g);
        break;
      }
      case 'free-entrance': {
        el('rect', { x: cx - 8, y: cy - 11, width: 16, height: 22, rx: 4, fill: INK }, g);
        el('circle', { cx: cx + 4, cy: cy + 1, r: 1.8, fill: SQ_FILL['free-entrance'] }, g);
        break;
      }
      case 'free-build': {
        el('rect', { x: cx - 10, y: cy - 10, width: 20, height: 9, rx: 4, fill: INK }, g);
        el('rect', { x: cx - 2, y: cy - 3, width: 4, height: 14, rx: 2, fill: INK }, g);
        break;
      }
    }
  }

  function drawCar(g, color) {
    // clay car, ~32 wide, centred on 0,0
    el('ellipse', { cx: 0, cy: 7, rx: 15, ry: 3.4, fill: '#000', opacity: 0.25 }, g);
    el('rect', { x: -15, y: -5, width: 30, height: 11, rx: 5.5,
      fill: color, stroke: INK, 'stroke-width': 2 }, g);
    el('path', { d: 'M -8 -5 Q -6 -13 0 -13 Q 7 -13 9 -5 Z',
      fill: color, stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M -5 -6 Q -4 -10.5 0 -10.5 L 0 -6 Z', fill: '#cfe6f5' }, g);
    el('path', { d: 'M 2 -6 L 2 -10.5 Q 6 -10 7 -6 Z', fill: '#cfe6f5' }, g);
    el('rect', { x: -13, y: -3.4, width: 13, height: 2.6, rx: 1.3, fill: '#fff', opacity: 0.35 }, g);
    [-8.5, 8.5].forEach(function (wx) {
      el('circle', { cx: wx, cy: 6, r: 3.6, fill: '#2c2c34', stroke: INK, 'stroke-width': 1.4 }, g);
      el('circle', { cx: wx, cy: 6, r: 1.4, fill: '#8b8f99' }, g);
    });
  }

  function carMarkup(color) { // standalone SVG markup for the HTML panel
    var key = 'car-' + COLOR_KEY[color];
    var url = window.ClayAssets && ClayAssets.url(key);
    if (url) return '<img src="' + url + '" class="car-img" alt="">';
    var tmp = document.createElementNS(NS, 'svg');
    tmp.setAttribute('viewBox', '-17 -16 34 28');
    tmp.setAttribute('class', 'car-img');
    var g = el('g', {}, tmp);
    drawCar(g, color);
    return tmp.outerHTML;
  }

  /* ---------- init ---------- */
  function init(container, handlers) {
    onSquare = handlers.onSquare;
    onPlot = handlers.onPlot;
    container.innerHTML = '';
    svg = el('svg', {
      viewBox: '0 0 ' + (G.GRID.w * C) + ' ' + (G.GRID.h * C), id: 'board'
    }, null);
    container.appendChild(svg);

    var defs = el('defs', {}, svg);
    var sh = el('filter', { id: 'fShadow', x: '-20%', y: '-20%', width: '140%', height: '150%' }, defs);
    el('feDropShadow', { dx: 0, dy: 2.4, stdDeviation: 1.7,
      'flood-color': '#15241a', 'flood-opacity': 0.5 }, sh);
    var wf = el('filter', { id: 'fWobble', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.016, numOctaves: 2, seed: 7, result: 'n' }, wf);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 3 }, wf);
    var gr = el('filter', { id: 'fGrain' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.8, numOctaves: 2, seed: 4 }, gr);
    el('feColorMatrix', { type: 'matrix',
      values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.95  0 0 0 0.05 0' }, gr);

    // board base: green clay
    if (!assetImage('board', 0, 0, G.GRID.w * C, G.GRID.h * C, svg)) {
      el('rect', { x: 0, y: 0, width: G.GRID.w * C, height: G.GRID.h * C, fill: '#447d4c' }, svg);
      el('rect', { x: C - 6, y: C - 6, width: (G.GRID.w - 2) * C + 12, height: (G.GRID.h - 2) * C + 12,
        rx: 18, fill: '#4e8a56' }, svg);
      el('rect', { x: C + 4, y: C + 4, width: (G.GRID.w - 2) * C - 8, height: (G.GRID.h - 2) * C - 8,
        rx: 14, fill: '#56945e', opacity: 0.7 }, svg);
    }

    var gWob = el('g', { filter: 'url(#fWobble)' }, svg);
    gSquares = el('g', { filter: 'url(#fShadow)' }, gWob);
    var gPlotsBase = el('g', { filter: 'url(#fShadow)' }, gWob);
    gPlotsDyn = el('g', {}, svg);
    gEntrances = el('g', {}, svg);
    gDanger = el('g', {}, svg);
    gHighlight = el('g', {}, svg);
    gTokens = el('g', {}, svg);

    // centre title
    var cx = 6.5 * C, cy = 4.9 * C;
    if (!assetImage('logo', cx - 150, cy - 40, 300, 60, svg)) {
      txt(svg, cx, cy - 6, 'H O T E L S', 24,
        { fill: '#f3edd9', 'font-weight': 'bold', 'letter-spacing': '2', filter: 'url(#fShadow)' });
      txt(svg, cx, cy + 13, 'clay tycoon', 9.5, { fill: '#cfe0c2' });
    }

    // track squares
    G.TRACK.forEach(function (pos, i) {
      var type = G.SPECIALS[i] || 'plain';
      var scx = pos.x * C + C / 2, scy = pos.y * C + C / 2;
      var g = el('g', { 'data-sq': i, cursor: 'pointer',
        transform: 'rotate(' + wob(i) + ' ' + scx + ' ' + scy + ')' }, gSquares);
      if (assetImage('square', pos.x * C + 1.5, pos.y * C + 1.5, C - 3, C - 3, g)) {
        if (type !== 'plain') {
          el('rect', { x: pos.x * C + 2.5, y: pos.y * C + 2.5, width: C - 5, height: C - 5, rx: 9,
            fill: SQ_FILL[type], opacity: 0.4 }, g);
        }
      } else {
        clayRect(g, pos.x * C + 2.5, pos.y * C + 2.5, C - 5, C - 5, SQ_FILL[type], 9);
      }
      if (type !== 'plain') {
        drawIcon(g, type, scx, scy - 4);
        txt(g, scx, pos.y * C + C - 7.5, SQ_LABEL[type], 5.6,
          { fill: INK, 'font-weight': 'bold', 'letter-spacing': '0.4' });
      } else if (G.SQUARE_PLOT[i] !== undefined) {
        el('rect', { x: scx - 5, y: scy - 5, width: 10, height: 10, rx: 3,
          fill: G.HOTELS[G.SQUARE_PLOT[i]].color, stroke: INK, 'stroke-width': 1.6 }, g);
      }
      g.addEventListener('click', function () { if (onSquare) onSquare(i); });
    });

    // plots
    var PLOT_ASSET = { '3x2': 'plot-3x2', '2x3': 'plot-2x3', '4x2': 'plot-4x2', '2x4': 'plot-2x4' };
    G.PLOTS.forEach(function (pl, i) {
      var h = G.HOTELS[i];
      var pcx = (pl.x + pl.w / 2) * C, pcy = (pl.y + pl.h / 2) * C;
      var g = el('g', { 'data-plot': i, cursor: 'pointer',
        transform: 'rotate(' + (wob(i + 11) * 0.6) + ' ' + pcx + ' ' + pcy + ')' }, gPlotsBase);
      var ak = PLOT_ASSET[pl.w + 'x' + pl.h];
      if (assetImage(ak, pl.x * C + 3, pl.y * C + 3, pl.w * C - 6, pl.h * C - 6, g)) {
        el('rect', { x: pl.x * C + 3, y: pl.y * C + 3, width: pl.w * C - 6, height: pl.h * C - 6,
          rx: 11, fill: h.color, opacity: 0.45 }, g);
      } else {
        clayRect(g, pl.x * C + 3.5, pl.y * C + 3.5, pl.w * C - 7, pl.h * C - 7, h.color, 11, 2.4);
      }
      txt(g, pcx, pl.y * C + 16, h.name.toUpperCase(), 9,
        { fill: '#2b2620', 'font-weight': 'bold', 'letter-spacing': '0.6' });
      txt(g, pcx, pl.y * C + 26, '★'.repeat(h.stars), 8, { fill: '#6b5210' });
      g.addEventListener('click', function () { if (onPlot) onPlot(i); });
    });

    // clay grain over the static art
    el('rect', { x: 0, y: 0, width: G.GRID.w * C, height: G.GRID.h * C,
      filter: 'url(#fGrain)', 'pointer-events': 'none' }, svg);
    // dynamic layers live above the grain
    svg.appendChild(gPlotsDyn); svg.appendChild(gEntrances);
    svg.appendChild(gDanger); svg.appendChild(gHighlight); svg.appendChild(gTokens);
    return svg;
  }

  /* ---------- dynamic: buildings, owners, entrances ---------- */
  function building(g, x, y, w, h, roofColor, isMain) {
    if (assetImage(isMain ? 'building-main' : 'building-wing', x - 2, y - 2, w + 4, h + 4, g)) return;
    el('rect', { x: x, y: y + 3, width: w, height: h - 3, rx: 3,
      fill: CREAM, stroke: INK, 'stroke-width': 1.8 }, g);
    el('rect', { x: x - 1.5, y: y, width: w + 3, height: 6.5, rx: 3,
      fill: roofColor, stroke: INK, 'stroke-width': 1.8 }, g);
    for (var wy = y + 10; wy < y + h - 8; wy += 7) {
      for (var wx = x + 3.5; wx < x + w - 5; wx += 6.5) {
        el('rect', { x: wx, y: wy, width: 3.6, height: 4, rx: 1.2, fill: '#7fb4d8',
          stroke: INK, 'stroke-width': 0.8 }, g);
      }
    }
    if (isMain) {
      el('rect', { x: x + w / 2 - 3, y: y + h - 8.5, width: 6, height: 8.5, rx: 2.5,
        fill: '#8a5a36', stroke: INK, 'stroke-width': 1.2 }, g);
    }
  }

  function pool(g, x, y) {
    if (assetImage('pool', x, y, 19, 14, g)) return;
    el('rect', { x: x, y: y, width: 19, height: 14, rx: 5,
      fill: '#54c4e4', stroke: INK, 'stroke-width': 1.8 }, g);
    el('path', { d: 'M' + (x + 3) + ' ' + (y + 5) + ' q 2 -2 4 0 q 2 2 4 0',
      fill: 'none', stroke: '#d9f4fc', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M' + (x + 6) + ' ' + (y + 9.5) + ' q 2 -2 4 0 q 2 2 4 0',
      fill: 'none', stroke: '#d9f4fc', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
  }

  function drawPlotDynamics(view, players) {
    gPlotsDyn.innerHTML = '';
    var colorOf = {};
    players.forEach(function (p) { colorOf[p.id] = p.color; });

    view.plots.forEach(function (pl, i) {
      var geo = G.PLOTS[i], h = G.HOTELS[i];
      var g = el('g', { 'pointer-events': 'none' }, gPlotsDyn);
      if (pl.owner) {
        el('rect', {
          x: geo.x * C + 3.5, y: geo.y * C + 3.5, width: geo.w * C - 7, height: geo.h * C - 7,
          fill: 'none', stroke: colorOf[pl.owner] || '#fff', 'stroke-width': 4, rx: 11
        }, g);
        el('circle', { cx: (geo.x + geo.w) * C - 13, cy: geo.y * C + 13, r: 5.5,
          fill: colorOf[pl.owner], stroke: INK, 'stroke-width': 1.8 }, g);
      }
      var pad = 9, slotW = 25;
      var perRow = Math.max(1, Math.floor((geo.w * C - pad * 2) / slotW));
      var bx0 = geo.x * C + pad + 2, by0 = geo.y * C + 31;
      var n = pl.stages + (pl.facility ? 1 : 0);
      for (var s = 0; s < n; s++) {
        var row = Math.floor(s / perRow), col = s % perRow;
        var x = bx0 + col * slotW, y = by0 + row * 35;
        if (s < pl.stages) {
          var isMain = s === 0;
          building(g, x, y + (isMain ? 0 : 6), isMain ? 21 : 17, isMain ? 31 : 25,
            darken(h.color, 0.72), isMain);
        } else {
          pool(g, x, y + 19);
        }
      }
    });
  }

  var awnSeq = 0;
  function awning(g, x, y, w, h, color) {
    var key = 'awning-' + COLOR_KEY[color];
    if (assetImage(key, x, y - 2, w, h + 6, g)) return;
    var stripes = 5, sw = w / stripes;
    var clipId = 'awn' + (awnSeq++);
    var cp = el('clipPath', { id: clipId }, g);
    el('rect', { x: x, y: y, width: w, height: h, rx: 3.5 }, cp);
    var inner = el('g', { 'clip-path': 'url(#' + clipId + ')' }, g);
    for (var i = 0; i < stripes; i++) {
      el('rect', { x: x + i * sw, y: y, width: sw + 0.5, height: h,
        fill: i % 2 ? '#f6f1e2' : color }, inner);
    }
    el('rect', { x: x, y: y, width: w, height: h, rx: 3.5,
      fill: 'none', stroke: INK, 'stroke-width': 1.8 }, g);
  }

  function drawEntrances(view, players) {
    gEntrances.innerHTML = '';
    var colorOf = {};
    players.forEach(function (p) { colorOf[p.id] = p.color; });
    view.plots.forEach(function (pl, i) {
      if (!pl.entrances.length) return;
      var geo = G.PLOTS[i];
      var pcx = (geo.x + geo.w / 2) * C, pcy = (geo.y + geo.h / 2) * C;
      pl.entrances.forEach(function (sq) {
        var pos = G.TRACK[sq];
        var scx = pos.x * C + C / 2, scy = pos.y * C + C / 2;
        var dx = pcx - scx, dy = pcy - scy;
        var w = 26, h = 9;
        var x = scx - w / 2, y = scy - h / 2;
        if (Math.abs(dx) > Math.abs(dy)) x = dx > 0 ? pos.x * C + C - w + 5 : pos.x * C - 5;
        else y = dy > 0 ? pos.y * C + C - h + 4 : pos.y * C - 4;
        var g = el('g', { 'pointer-events': 'none', filter: 'url(#fShadow)' }, gEntrances);
        awning(g, x, y, w, h, colorOf[pl.owner] || '#999');
      });
    });
  }

  /* ---------- tokens with hop animation ---------- */
  function tokenOffset(idx) {
    var offs = [[-11, -11], [11, -11], [-11, 9], [11, 9]];
    return offs[idx % 4];
  }
  function tokenXY(pos, idx) {
    var p = G.TRACK[pos];
    var off = tokenOffset(idx);
    return [p.x * C + C / 2 + off[0], p.y * C + C / 2 + off[1]];
  }

  function drawTokens(view) {
    view.players.forEach(function (p, idx) {
      var t = tokenEls[p.id];
      if (!t) {
        var g = el('g', { class: 'token' }, gTokens);
        el('circle', { cx: 0, cy: 0, r: 17, fill: 'rgba(255,255,230,0.75)',
          stroke: INK, 'stroke-width': 1.8, class: 'token-ring' }, g);
        var url = window.ClayAssets && ClayAssets.url('car-' + COLOR_KEY[p.color]);
        var inner = el('g', { class: 'token-car' }, g);
        if (url) el('image', { href: url, x: -17, y: -15, width: 34, height: 28 }, inner);
        else drawCar(inner, p.color);
        t = tokenEls[p.id] = { g: g, pos: p.pos, timer: null };
        setTokenPos(t, p.pos, idx);
      }
      if (!p.alive) {
        t.g.style.display = 'none';
        if (t.timer) { clearInterval(t.timer); t.timer = null; }
        return;
      }
      t.g.style.display = '';
      t.g.classList.toggle('current', view.turn === p.id && view.phase === 'playing');
      if (t.pos !== p.pos) hopTo(t, p.pos, idx);
    });
  }

  function setTokenPos(t, pos, idx) {
    var xy = tokenXY(pos, idx);
    t.pos = pos;
    t.g.style.transform = 'translate(' + xy[0] + 'px,' + xy[1] + 'px)';
  }

  function hopTo(t, target, idx) {
    if (t.timer) { clearInterval(t.timer); t.timer = null; }
    var path = [];
    var cur = t.pos;
    var guard = 0;
    while (cur !== target && guard++ < G.TRACK.length + 1) {
      cur = (cur + 1) % G.TRACK.length;
      path.push(cur);
    }
    if (!path.length || path.length > 14 || document.hidden) { setTokenPos(t, target, idx); return; }
    var step = 0;
    t.timer = setInterval(function () {
      if (step >= path.length) {
        clearInterval(t.timer); t.timer = null;
        if (window.Sound) Sound.play('land');
        return;
      }
      setTokenPos(t, path[step], idx);
      t.g.classList.remove('hopping');
      void t.g.getBoundingClientRect(); // restart the hop animation
      t.g.classList.add('hopping');
      if (window.Sound && step % 2 === 0) Sound.play('hop');
      step++;
    }, 130);
  }

  function setDanger(list) {
    if (!gDanger) return;
    gDanger.innerHTML = '';
    (list || []).forEach(function (d) {
      var pos = G.TRACK[d.sq];
      el('rect', {
        x: pos.x * C + 1.5, y: pos.y * C + 1.5, width: C - 3, height: C - 3,
        fill: 'none', stroke: '#e8463c', rx: 10,
        class: 'danger danger-' + d.tier, 'pointer-events': 'none'
      }, gDanger);
    });
  }

  function setSelectable(squares) {
    selectable = squares || [];
    if (!gHighlight) return;
    gHighlight.innerHTML = '';
    selectable.forEach(function (sq) {
      var pos = G.TRACK[sq];
      el('rect', {
        x: pos.x * C + 2.5, y: pos.y * C + 2.5, width: C - 5, height: C - 5,
        fill: 'none', stroke: '#ffe14a', 'stroke-width': 4.5, rx: 10, class: 'pulse',
        'pointer-events': 'none'
      }, gHighlight);
    });
  }

  function update(view) {
    drawPlotDynamics(view, view.players);
    drawEntrances(view, view.players);
    drawTokens(view);
  }

  window.Render = {
    init: init, update: update, setSelectable: setSelectable, setDanger: setDanger,
    isSelectable: function (sq) { return selectable.indexOf(sq) >= 0; },
    carMarkup: carMarkup,
    reset: function () {
      Object.keys(tokenEls).forEach(function (k) {
        if (tokenEls[k].timer) clearInterval(tokenEls[k].timer);
      });
      tokenEls = {};
    }
  };
})();
