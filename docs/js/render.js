/* SVG board renderer — claymation style, curved winding track.
   Vector clay art by default; images from docs/assets/clay/ override it. */
(function () {
  'use strict';
  var G = window.GAMEDATA;
  var NS = 'http://www.w3.org/2000/svg';
  var C = G.CELL;          // square size in px
  var BW = G.BOARD.w, BH = G.BOARD.h;

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

  function assetImage(key, x, y, w, h, parent) {
    var url = window.ClayAssets && ClayAssets.url(key);
    if (!url) return null;
    return el('image', { href: url, x: x, y: y, width: w, height: h,
      preserveAspectRatio: 'xMidYMid meet' }, parent);
  }

  /* smooth closed Catmull-Rom path through points */
  function loopPath(pts) {
    var n = pts.length;
    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' +
        c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' +
        p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d + ' Z';
  }

  /* ---------- clay drawing helpers ---------- */
  function clayRectAt(g, cx, cy, w, h, fill, rx, sw) {
    el('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: rx || 9,
      fill: fill, stroke: INK, 'stroke-width': sw || 2.2 }, g);
    el('rect', { x: cx - w / 2 + 3, y: cy - h / 2 + 2.5, width: w - 6, height: 3.4, rx: 2,
      fill: '#ffffff', opacity: 0.22, 'pointer-events': 'none' }, g);
  }

  function drawIcon(g, type, cx, cy) {
    if (assetImage('icon-' + type, cx - 10, cy - 10, 20, 20, g)) return;
    switch (type) {
      case 'start':
        txt(g, cx, cy + 6, 'P', 18, { fill: INK, 'font-weight': 'bold' });
        break;
      case 'bank':
        txt(g, cx, cy + 7, '$', 20, { fill: INK, 'font-weight': 'bold' });
        break;
      case 'cityhall': {
        el('path', { d: 'M' + (cx - 10) + ' ' + (cy - 1) + ' L' + cx + ' ' + (cy - 9) +
          ' L' + (cx + 10) + ' ' + (cy - 1) + ' Z', fill: INK }, g);
        for (var i = -1; i <= 1; i++)
          el('rect', { x: cx + i * 5 - 1.4, y: cy, width: 2.8, height: 7, rx: 1.2, fill: INK }, g);
        el('rect', { x: cx - 10, y: cy + 7, width: 20, height: 2.6, rx: 1.2, fill: INK }, g);
        break;
      }
      case 'permission': {
        el('rect', { x: cx - 7, y: cy - 9, width: 14, height: 18, rx: 2.2, fill: INK }, g);
        for (var j = 0; j < 3; j++)
          el('rect', { x: cx - 4.5, y: cy - 6 + j * 4.5, width: 9 - j * 2.5, height: 2, rx: 1,
            fill: SQ_FILL.permission }, g);
        break;
      }
      case 'free-entrance': {
        el('rect', { x: cx - 7, y: cy - 9, width: 14, height: 19, rx: 3.4, fill: INK }, g);
        el('circle', { cx: cx + 3.4, cy: cy + 1, r: 1.6, fill: SQ_FILL['free-entrance'] }, g);
        break;
      }
      case 'free-build': {
        el('rect', { x: cx - 9, y: cy - 9, width: 18, height: 8, rx: 3.4, fill: INK }, g);
        el('rect', { x: cx - 1.8, y: cy - 3, width: 3.6, height: 12, rx: 1.8, fill: INK }, g);
        break;
      }
    }
  }

  function drawCar(g, color) {
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

  function carMarkup(color) {
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
    svg = el('svg', { viewBox: '0 0 ' + BW + ' ' + BH, id: 'board' }, null);
    container.appendChild(svg);

    var defs = el('defs', {}, svg);
    var sh = el('filter', { id: 'fShadow', x: '-30%', y: '-30%', width: '160%', height: '170%' }, defs);
    el('feDropShadow', { dx: 0, dy: 2.2, stdDeviation: 1.6,
      'flood-color': '#13241a', 'flood-opacity': 0.5 }, sh);
    var wf = el('filter', { id: 'fWobble', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.018, numOctaves: 2, seed: 7, result: 'n' }, wf);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 2.4 }, wf);
    var soft = el('filter', { id: 'fSoft', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feGaussianBlur', { stdDeviation: 11 }, soft);
    var gr = el('filter', { id: 'fGrain' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.8, numOctaves: 2, seed: 4 }, gr);
    el('feColorMatrix', { type: 'matrix',
      values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.95  0 0 0 0.05 0' }, gr);

    // board base + terrain regions
    if (!assetImage('board', 0, 0, BW, BH, svg)) {
      el('rect', { x: 0, y: 0, width: BW, height: BH, fill: '#4e8a56' }, svg);
      var terrain = el('g', { filter: 'url(#fSoft)', opacity: 0.92 }, svg);
      [ ['#e6d6a2', 120, 60, 150, 95],     // sand, top-left (Surf Shack)
        ['#b98f63', 360, 60, 130, 80],     // earth, top-middle (Lagoon)
        ['#9fd3a6', 205, 330, 150, 130],   // bright grass island (Meridian)
        ['#e7a9b0', 540, 360, 130, 95],    // clay-red flats (Casa Sol)
        ['#8fb9d8', 150, 470, 200, 130],   // water, bottom-left
        ['#d8c98a', 560, 150, 120, 90]     // sand, right (Alpine)
      ].forEach(function (r) {
        el('ellipse', { cx: r[1], cy: r[2], rx: r[3], ry: r[4], fill: r[0] }, terrain);
      });
    }

    // winding road ribbon under the tiles
    var roadD = loopPath(G.TRACK);
    el('path', { d: roadD, fill: 'none', stroke: '#2c2c33',
      'stroke-width': C + 13, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      opacity: 0.32, filter: 'url(#fSoft)' }, svg);           // soft road shadow
    el('path', { d: roadD, fill: 'none', stroke: '#3a3a44',
      'stroke-width': C + 9, 'stroke-linejoin': 'round' }, svg);
    el('path', { d: roadD, fill: 'none', stroke: '#4a4a57',
      'stroke-width': C + 4, 'stroke-linejoin': 'round', 'stroke-dasharray': '1 7',
      'stroke-linecap': 'round', opacity: 0.5 }, svg);

    var gPlotsBase = el('g', { filter: 'url(#fShadow)' }, svg);
    var gWob = el('g', { filter: 'url(#fWobble)' }, svg);
    gSquares = el('g', { filter: 'url(#fShadow)' }, gWob);
    gPlotsDyn = el('g', {}, svg);
    gEntrances = el('g', {}, svg);
    gDanger = el('g', {}, svg);
    gHighlight = el('g', {}, svg);
    gTokens = el('g', {}, svg);

    // centre title
    var cx = BW / 2, cy = BH / 2 + 6;
    if (!assetImage('logo', cx - 130, cy - 34, 260, 54, svg)) {
      txt(svg, cx, cy, 'H O T E L S', 26,
        { fill: '#f3edd9', 'font-weight': 'bold', 'letter-spacing': '3', filter: 'url(#fShadow)' });
      txt(svg, cx, cy + 19, 'clay tycoon', 10, { fill: '#cfe0c2' });
    }

    // plots (free-positioned rects, inside & outside the loop)
    G.PLOTS.forEach(function (pl, i) {
      var h = G.HOTELS[i];
      var pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
      var g = el('g', { 'data-plot': i, cursor: 'pointer' }, gPlotsBase);
      var ak = 'plot-' + pl.w + 'x' + pl.h;
      if (assetImage(ak, pl.x, pl.y, pl.w, pl.h, g)) {
        el('rect', { x: pl.x, y: pl.y, width: pl.w, height: pl.h, rx: 13,
          fill: h.color, opacity: 0.4 }, g);
      } else {
        el('rect', { x: pl.x, y: pl.y, width: pl.w, height: pl.h, rx: 13,
          fill: h.color, stroke: INK, 'stroke-width': 2.4 }, g);
        el('rect', { x: pl.x + 4, y: pl.y + 3, width: pl.w - 8, height: 5, rx: 3,
          fill: '#ffffff', opacity: 0.2 }, g);
      }
      txt(g, pcx, pl.y + 16, h.name.toUpperCase(), 10,
        { fill: '#2b2620', 'font-weight': 'bold', 'letter-spacing': '0.6' });
      txt(g, pcx, pl.y + 28, '★'.repeat(h.stars), 9, { fill: '#6b5210' });
      g.addEventListener('click', function () { if (onPlot) onPlot(i); });
    });

    // track tiles (rotated to the road tangent; labels stay upright)
    G.TRACK.forEach(function (pos, i) {
      var type = G.SPECIALS[i] || 'plain';
      var g = el('g', { 'data-sq': i, cursor: 'pointer',
        transform: 'rotate(' + pos.a.toFixed(1) + ' ' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')'
      }, gSquares);
      if (assetImage('square', pos.x - C / 2, pos.y - C / 2, C, C, g)) {
        if (type !== 'plain')
          el('rect', { x: pos.x - C / 2 + 1, y: pos.y - C / 2 + 1, width: C - 2, height: C - 2,
            rx: 8, fill: SQ_FILL[type], opacity: 0.4 }, g);
      } else {
        clayRectAt(g, pos.x, pos.y, C - 2, C - 2, SQ_FILL[type], 8);
      }
      g.addEventListener('click', function () { if (onSquare) onSquare(i); });

      // upright overlay (icons/labels/markers)
      var u = el('g', { 'data-sq': i, cursor: 'pointer' }, gSquares);
      if (type !== 'plain') {
        drawIcon(u, type, pos.x, pos.y - 3);
        txt(u, pos.x, pos.y + C / 2 - 5, SQ_LABEL[type], 5.4,
          { fill: INK, 'font-weight': 'bold', 'letter-spacing': '0.3' });
      } else if (G.SHARED[i]) {
        // contested square: split diamond showing both racing hotels
        var o = G.SHARED[i], s = 6.5;
        el('path', { d: 'M' + pos.x + ' ' + (pos.y - s) + ' L' + (pos.x + s) + ' ' + pos.y +
          ' L' + pos.x + ' ' + (pos.y + s) + ' Z', fill: G.HOTELS[o[1]].color,
          stroke: INK, 'stroke-width': 1.4 }, u);
        el('path', { d: 'M' + pos.x + ' ' + (pos.y - s) + ' L' + (pos.x - s) + ' ' + pos.y +
          ' L' + pos.x + ' ' + (pos.y + s) + ' Z', fill: G.HOTELS[o[0]].color,
          stroke: INK, 'stroke-width': 1.4 }, u);
        el('path', { d: 'M' + pos.x + ' ' + (pos.y - s) + ' L' + (pos.x + s) + ' ' + pos.y +
          ' L' + pos.x + ' ' + (pos.y + s) + ' L' + (pos.x - s) + ' ' + pos.y + ' Z',
          fill: 'none', stroke: INK, 'stroke-width': 1.4 }, u);
      } else if (G.SQUARE_PLOT[i] !== undefined) {
        el('rect', { x: pos.x - 4.5, y: pos.y - 4.5, width: 9, height: 9, rx: 2.5,
          fill: G.HOTELS[G.SQUARE_PLOT[i]].color, stroke: INK, 'stroke-width': 1.5 }, u);
      }
      u.addEventListener('click', function () { if (onSquare) onSquare(i); });
    });

    // grain wash over static art
    el('rect', { x: 0, y: 0, width: BW, height: BH,
      filter: 'url(#fGrain)', 'pointer-events': 'none' }, svg);
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
    for (var wy = y + 10; wy < y + h - 7; wy += 7) {
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
        el('rect', { x: geo.x, y: geo.y, width: geo.w, height: geo.h,
          fill: 'none', stroke: colorOf[pl.owner] || '#fff', 'stroke-width': 4, rx: 13 }, g);
        el('circle', { cx: geo.x + geo.w - 12, cy: geo.y + 12, r: 5.5,
          fill: colorOf[pl.owner], stroke: INK, 'stroke-width': 1.8 }, g);
      }
      var pad = 9, slotW = 25;
      var perRow = Math.max(1, Math.floor((geo.w - pad * 2) / slotW));
      var bx0 = geo.x + pad + 2, by0 = geo.y + 33;
      var n = pl.stages + (pl.facility ? 1 : 0);
      for (var s = 0; s < n; s++) {
        var row = Math.floor(s / perRow), col = s % perRow;
        var x = bx0 + col * slotW, y = by0 + row * 33;
        if (s < pl.stages) {
          var isMain = s === 0;
          building(g, x, y + (isMain ? 0 : 6), isMain ? 21 : 17, isMain ? 30 : 24,
            darken(h.color, 0.72), isMain);
        } else {
          pool(g, x, y + 18);
        }
      }
    });
  }

  var awnSeq = 0;
  function awning(g, cx, cy, ang, color) {
    var w = 24, h = 9;
    var key = 'awning-' + COLOR_KEY[color];
    var gg = el('g', { transform: 'rotate(' + ang.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')' }, g);
    if (assetImage(key, cx - w / 2, cy - h / 2 - 1, w, h + 6, gg)) return;
    var x = cx - w / 2, y = cy - h / 2;
    var stripes = 5, sw = w / stripes;
    var clipId = 'awn' + (awnSeq++);
    var cp = el('clipPath', { id: clipId }, gg);
    el('rect', { x: x, y: y, width: w, height: h, rx: 3.5 }, cp);
    var inner = el('g', { 'clip-path': 'url(#' + clipId + ')' }, gg);
    for (var i = 0; i < stripes; i++) {
      el('rect', { x: x + i * sw, y: y, width: sw + 0.5, height: h,
        fill: i % 2 ? '#f6f1e2' : color }, inner);
    }
    el('rect', { x: x, y: y, width: w, height: h, rx: 3.5,
      fill: 'none', stroke: INK, 'stroke-width': 1.8 }, gg);
  }

  function drawEntrances(view, players) {
    gEntrances.innerHTML = '';
    var colorOf = {};
    players.forEach(function (p) { colorOf[p.id] = p.color; });
    view.plots.forEach(function (pl, i) {
      if (!pl.entrances.length) return;
      var geo = G.PLOTS[i];
      var pcx = geo.x + geo.w / 2, pcy = geo.y + geo.h / 2;
      pl.entrances.forEach(function (sq) {
        var pos = G.TRACK[sq];
        var dx = pcx - pos.x, dy = pcy - pos.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var off = C / 2 - 1;
        var ex = pos.x + dx / len * off, ey = pos.y + dy / len * off;
        var ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        var g = el('g', { 'pointer-events': 'none', filter: 'url(#fShadow)' }, gEntrances);
        awning(g, ex, ey, ang, colorOf[pl.owner] || '#999');
      });
    });
  }

  /* ---------- tokens with hop animation ---------- */
  function tokenOffset(idx) {
    var offs = [[-9, -9], [9, -9], [-9, 9], [9, 9]];
    return offs[idx % 4];
  }
  function tokenXY(pos, idx) {
    var p = G.TRACK[pos];
    var off = tokenOffset(idx);
    return [p.x + off[0], p.y + off[1]];
  }

  function drawTokens(view) {
    view.players.forEach(function (p, idx) {
      var t = tokenEls[p.id];
      if (!t) {
        var g = el('g', { class: 'token' }, gTokens);
        el('circle', { cx: 0, cy: 0, r: 15, fill: 'rgba(255,255,230,0.72)',
          stroke: INK, 'stroke-width': 1.8, class: 'token-ring' }, g);
        var url = window.ClayAssets && ClayAssets.url('car-' + COLOR_KEY[p.color]);
        var inner = el('g', { class: 'token-car' }, g);
        if (url) el('image', { href: url, x: -16, y: -14, width: 32, height: 26 }, inner);
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
    t.g.style.transform = 'translate(' + xy[0].toFixed(1) + 'px,' + xy[1].toFixed(1) + 'px)';
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
      void t.g.getBoundingClientRect();
      t.g.classList.add('hopping');
      if (window.Sound && step % 2 === 0) Sound.play('hop');
      step++;
    }, 130);
  }

  function ringAt(parent, sq, cls, stroke, sw) {
    var pos = G.TRACK[sq];
    el('rect', {
      x: pos.x - C / 2 + 1, y: pos.y - C / 2 + 1, width: C - 2, height: C - 2,
      rx: 9, fill: 'none', stroke: stroke, 'stroke-width': sw, class: cls,
      transform: 'rotate(' + pos.a.toFixed(1) + ' ' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')',
      'pointer-events': 'none'
    }, parent);
  }

  function setDanger(list) {
    if (!gDanger) return;
    gDanger.innerHTML = '';
    (list || []).forEach(function (d) {
      ringAt(gDanger, d.sq, 'danger danger-' + d.tier, '#e8463c', 3.5);
    });
  }

  function setSelectable(squares) {
    selectable = squares || [];
    if (!gHighlight) return;
    gHighlight.innerHTML = '';
    selectable.forEach(function (sq) {
      ringAt(gHighlight, sq, 'pulse', '#ffe14a', 4.5);
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
