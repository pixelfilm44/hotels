/* SVG board renderer with pixel-art sprites. */
(function () {
  'use strict';
  var G = window.GAMEDATA;
  var NS = 'http://www.w3.org/2000/svg';
  var C = G.CELL; // 48

  var svg, gSquares, gPlotsDyn, gEntrances, gHighlight, gTokens;
  var tokenEls = {};
  var onSquare = null, onPlot = null;
  var selectable = [];

  var SQ_FILL = {
    plain: '#ece4d2', start: '#d8d4c6', bank: '#f0e2a8', cityhall: '#e6d4f0',
    permission: '#cfe3f4', 'free-entrance': '#d4ecd4', 'free-build': '#f4dcca'
  };
  var SQ_LABEL = {
    start: 'CAR PARK', bank: 'BANK', cityhall: 'CITY HALL', permission: 'PLANNING',
    'free-entrance': 'FREE DOOR', 'free-build': 'FREE BUILD'
  };

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

  function init(container, handlers) {
    onSquare = handlers.onSquare;
    onPlot = handlers.onPlot;
    container.innerHTML = '';
    svg = el('svg', {
      viewBox: '0 0 ' + (G.GRID.w * C) + ' ' + (G.GRID.h * C),
      'shape-rendering': 'crispEdges', id: 'board'
    }, null);
    container.appendChild(svg);

    el('rect', { x: 0, y: 0, width: G.GRID.w * C, height: G.GRID.h * C, fill: '#3e7a45' }, svg);
    // inner courtyard
    el('rect', { x: C, y: C, width: (G.GRID.w - 2) * C, height: (G.GRID.h - 2) * C, fill: '#4c8a52' }, svg);

    gSquares = el('g', {}, svg);
    var gPlotsBase = el('g', {}, svg);
    gPlotsDyn = el('g', {}, svg);
    gEntrances = el('g', {}, svg);
    gHighlight = el('g', {}, svg);
    gTokens = el('g', {}, svg);

    // center decoration
    var cx = 6.5 * C, cy = 4.9 * C;
    txt(svg, cx, cy - 8, 'H O T E L S', 22, { fill: '#f4eed8', 'font-weight': 'bold', 'letter-spacing': '2' });
    txt(svg, cx, cy + 10, 'pixel tycoon', 9, { fill: '#d8e4c8' });

    // track squares
    G.TRACK.forEach(function (pos, i) {
      var type = G.SPECIALS[i] || 'plain';
      var g = el('g', { 'data-sq': i, cursor: 'pointer' }, gSquares);
      el('rect', {
        x: pos.x * C + 1, y: pos.y * C + 1, width: C - 2, height: C - 2,
        fill: SQ_FILL[type], stroke: '#2a2a33', 'stroke-width': 2
      }, g);
      if (type !== 'plain') {
        var ic = window.Sprites.icon(type);
        var s = 2;
        el('image', {
          href: ic.url, x: pos.x * C + (C - ic.w * s) / 2, y: pos.y * C + 7,
          width: ic.w * s, height: ic.h * s, class: 'pix'
        }, g);
        txt(g, pos.x * C + C / 2, pos.y * C + C - 7, SQ_LABEL[type], 6,
          { fill: '#2b2b36', 'font-weight': 'bold' });
      } else if (G.SQUARE_PLOT[i] !== undefined) {
        // small lot marker matching the hotel colour
        el('rect', { x: pos.x * C + C / 2 - 4, y: pos.y * C + C / 2 - 4, width: 8, height: 8,
          fill: G.HOTELS[G.SQUARE_PLOT[i]].color, stroke: '#2a2a33', 'stroke-width': 1 }, g);
      }
      g.addEventListener('click', function () {
        if (onSquare) onSquare(i);
      });
    });

    // plot bases
    G.PLOTS.forEach(function (pl, i) {
      var h = G.HOTELS[i];
      var g = el('g', { 'data-plot': i, cursor: 'pointer' }, gPlotsBase);
      el('rect', {
        x: pl.x * C + 3, y: pl.y * C + 3, width: pl.w * C - 6, height: pl.h * C - 6,
        fill: h.color, stroke: '#2a2a33', 'stroke-width': 2, rx: 2
      }, g);
      txt(g, (pl.x + pl.w / 2) * C, pl.y * C + 14, h.name.toUpperCase(), 8.5,
        { fill: '#1d1d26', 'font-weight': 'bold' });
      txt(g, (pl.x + pl.w / 2) * C, pl.y * C + 24, '★'.repeat(h.stars), 8, { fill: '#7a5a10' });
      g.addEventListener('click', function () { if (onPlot) onPlot(i); });
    });

    return svg;
  }

  /* small pixel building */
  function building(g, x, y, w, h, roofColor, isMain) {
    el('rect', { x: x, y: y, width: w, height: h, fill: '#f3e7cd', stroke: '#14141c', 'stroke-width': 1.5 }, g);
    el('rect', { x: x - 1, y: y, width: w + 2, height: 4, fill: roofColor, stroke: '#14141c', 'stroke-width': 1.5 }, g);
    for (var wy = y + 7; wy < y + h - 7; wy += 6) {
      for (var wx = x + 3; wx < x + w - 4; wx += 6) {
        el('rect', { x: wx, y: wy, width: 3, height: 3, fill: '#7fb4d8' }, g);
      }
    }
    if (isMain) {
      el('rect', { x: x + w / 2 - 2.5, y: y + h - 7, width: 5, height: 7, fill: '#7a4a2b', stroke: '#14141c', 'stroke-width': 1 }, g);
    }
  }

  function pool(g, x, y) {
    el('rect', { x: x, y: y, width: 18, height: 13, fill: '#46c0e0', stroke: '#14141c', 'stroke-width': 1.5 }, g);
    el('rect', { x: x + 3, y: y + 4, width: 5, height: 2, fill: '#aef0ff' }, g);
    el('rect', { x: x + 9, y: y + 8, width: 6, height: 2, fill: '#aef0ff' }, g);
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
          x: geo.x * C + 3, y: geo.y * C + 3, width: geo.w * C - 6, height: geo.h * C - 6,
          fill: 'none', stroke: colorOf[pl.owner] || '#fff', 'stroke-width': 4, rx: 2
        }, g);
        // owner flag
        el('rect', { x: (geo.x + geo.w) * C - 16, y: geo.y * C + 6, width: 9, height: 9,
          fill: colorOf[pl.owner], stroke: '#14141c', 'stroke-width': 1.5 }, g);
      }
      // buildings: row-wrapped slots inside the plot below the title
      var pad = 8, slotW = 24;
      var perRow = Math.max(1, Math.floor((geo.w * C - pad * 2) / slotW));
      var bx0 = geo.x * C + pad + 2, by0 = geo.y * C + 30;
      var n = pl.stages + (pl.facility ? 1 : 0);
      for (var s = 0; s < n; s++) {
        var row = Math.floor(s / perRow), col = s % perRow;
        var x = bx0 + col * slotW, y = by0 + row * 34;
        if (s < pl.stages) {
          var isMain = s === 0;
          building(g, x, y + (isMain ? 0 : 6), isMain ? 21 : 17, isMain ? 30 : 24,
            darken(h.color, 0.75), isMain);
        } else {
          pool(g, x, y + 18);
        }
      }
    });
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
        var aw = window.Sprites.awning(colorOf[pl.owner] || '#999');
        var s = 2, w = aw.w * s, hh = aw.h * s;
        var x = scx - w / 2, y = scy - hh / 2;
        // push the awning toward the hotel side of the square
        if (Math.abs(dx) > Math.abs(dy)) x = dx > 0 ? pos.x * C + C - w + 4 : pos.x * C - 4;
        else y = dy > 0 ? pos.y * C + C - hh + 2 : pos.y * C - 2;
        var g = el('g', { 'pointer-events': 'none' }, gEntrances);
        el('image', { href: aw.url, x: x, y: y, width: w, height: hh, class: 'pix' }, g);
      });
    });
  }

  function tokenOffset(idx) {
    var offs = [[-11, -11], [11, -11], [-11, 9], [11, 9]];
    return offs[idx % 4];
  }

  function drawTokens(view) {
    view.players.forEach(function (p, idx) {
      var t = tokenEls[p.id];
      if (!t) {
        t = el('g', { class: 'token' }, gTokens);
        var car = window.Sprites.car(p.color);
        el('circle', { cx: 0, cy: 2, r: 15, fill: 'rgba(255,255,255,0.85)',
          stroke: '#14141c', 'stroke-width': 1.5, class: 'token-ring' }, t);
        el('image', { href: car.url, x: -car.w, y: -car.h, width: car.w * 2, height: car.h * 2, class: 'pix' }, t);
        tokenEls[p.id] = t;
      }
      if (!p.alive) { t.style.display = 'none'; return; }
      t.style.display = '';
      var pos = G.TRACK[p.pos];
      var off = tokenOffset(idx);
      t.style.transform = 'translate(' + (pos.x * C + C / 2 + off[0]) + 'px,' +
        (pos.y * C + C / 2 + off[1]) + 'px)';
      t.classList.toggle('current', view.turn === p.id && view.phase === 'playing');
    });
  }

  function setSelectable(squares) {
    selectable = squares || [];
    if (!gHighlight) return;
    gHighlight.innerHTML = '';
    selectable.forEach(function (sq) {
      var pos = G.TRACK[sq];
      el('rect', {
        x: pos.x * C + 2, y: pos.y * C + 2, width: C - 4, height: C - 4,
        fill: 'none', stroke: '#ffe14a', 'stroke-width': 4, class: 'pulse',
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
    init: init, update: update, setSelectable: setSelectable,
    isSelectable: function (sq) { return selectable.indexOf(sq) >= 0; },
    reset: function () { tokenEls = {}; }
  };
})();
