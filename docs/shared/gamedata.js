/* Shared game data: board layout, hotels, constants.
   Loaded by the Node server (CommonJS) and the browser (window.GAMEDATA). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.GAMEDATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var START_CASH = 12000;
  var BANK_BONUS = 2000;
  var AUCTION_MS = 10000;
  var CELL = 48;
  var GRID = { w: 13, h: 10 };

  var COLORS = ['#e0413e', '#3d7be0', '#3fae49', '#e8b430'];
  var COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow'];

  var STAGE_NAMES = ['Main Building', 'East Wing', 'West Wing', 'Grand Tower'];

  /* 8 original hotels, cheap -> grand.
     rates[i] = price per night when (stagesBuilt-1 + facility) === i */
  var HOTELS = [
    { id: 0, name: 'Waikiri',   abbr: 'WK', stars: 1, color: '#e6c878', land: 500,
      stages: [1000, 500],            facility: { name: 'Beach Bar',   cost: 500 },
      entrance: 500,  rates: [100, 150, 250] },
    { id: 1, name: 'Hábel',     abbr: 'HB', stars: 1, color: '#a9764e', land: 700,
      stages: [1200, 700],            facility: { name: 'Bazaar',      cost: 600 },
      entrance: 500,  rates: [150, 200, 300] },
    { id: 2, name: "L'Étoile",  abbr: 'LE', stars: 2, color: '#e0b878', land: 1000,
      stages: [1800, 900, 900],       facility: { name: 'Casino',      cost: 800 },
      entrance: 600,  rates: [200, 300, 400, 550] },
    { id: 3, name: 'Royal',     abbr: 'RY', stars: 3, color: '#5fa45f', land: 1500,
      stages: [2500, 1200, 1200],     facility: { name: 'Golf Course', cost: 1000 },
      entrance: 700,  rates: [300, 450, 600, 800] },
    { id: 4, name: 'Fujiyama',  abbr: 'FJ', stars: 3, color: '#d77ab5', land: 1800,
      stages: [3000, 1500, 1500],     facility: { name: 'Onsen Spa',   cost: 1200 },
      entrance: 800,  rates: [350, 500, 700, 950] },
    { id: 5, name: 'Boomerang', abbr: 'BM', stars: 4, color: '#e0883e', land: 2200,
      stages: [3500, 1800, 1800, 1800], facility: { name: 'Safari Pool', cost: 1500 },
      entrance: 900,  rates: [400, 600, 800, 1000, 1300] },
    { id: 6, name: 'President', abbr: 'PR', stars: 5, color: '#9a7fc8', land: 2800,
      stages: [4500, 2200, 2200, 2200], facility: { name: 'Sky Lounge', cost: 2000 },
      entrance: 1000, rates: [500, 750, 1000, 1300, 1700] },
    { id: 7, name: 'Safari',    abbr: 'SF', stars: 5, color: '#cdb87f', land: 3500,
      stages: [6000, 3000, 3000, 3000], facility: { name: 'Grand Lodge', cost: 2500 },
      entrance: 1200, rates: [600, 900, 1200, 1600, 2100] }
  ];

  /* ---------- curved board geometry ----------
     The track is a winding closed loop sampled from a Catmull-Rom spline.
     Hotels sit inside AND outside the road; square<->plot adjacency is
     computed by distance, so one square can serve two facing hotels —
     and only ONE entrance fits on a square (the entrance race). */
  var BOARD = { w: 1560, h: 1120 };
  var N_SQUARES = 42;

  /* Control points trace the painted road centerline, clockwise, in board px
     (which equal the board.png pixels). Tuned against the image. */
  /* Ordered so index 0 = PARTENZA (the start), travelling clockwise down the
     right side per the painted arrow. */
  var CTRL = [
    { x: 1465, y: 440 }, { x: 1468, y: 600 }, { x: 1440, y: 755 }, { x: 1370, y: 855 },
    { x: 1255, y: 892 }, { x: 1120, y: 888 }, { x: 985, y: 898 },  { x: 855, y: 918 },
    { x: 720, y: 945 },  { x: 590, y: 932 },  { x: 470, y: 902 },  { x: 380, y: 860 },
    { x: 285, y: 795 },  { x: 190, y: 725 },  { x: 140, y: 650 },  { x: 118, y: 560 },
    { x: 132, y: 470 },  { x: 200, y: 398 },  { x: 300, y: 320 },  { x: 420, y: 298 },
    { x: 530, y: 300 },  { x: 620, y: 318 },  { x: 710, y: 298 },  { x: 790, y: 250 },
    { x: 845, y: 178 },  { x: 897, y: 103 },  { x: 987, y: 93 },   { x: 1072, y: 155 },
    { x: 1088, y: 258 }, { x: 1158, y: 243 }, { x: 1245, y: 188 }, { x: 1265, y: 160 },
    { x: 1380, y: 215 }, { x: 1450, y: 320 }
  ];

  function sampleLoop(pts, n) {
    var dense = [];
    var SEG = 40;
    var i, j;
    for (i = 0; i < pts.length; i++) {
      var p0 = pts[(i - 1 + pts.length) % pts.length];
      var p1 = pts[i];
      var p2 = pts[(i + 1) % pts.length];
      var p3 = pts[(i + 2) % pts.length];
      for (j = 0; j < SEG; j++) {
        var t = j / SEG, t2 = t * t, t3 = t2 * t;
        dense.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    var lens = [0];
    var total = 0;
    for (i = 1; i <= dense.length; i++) {
      var a = dense[i - 1], b = dense[i % dense.length];
      total += Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      lens.push(total);
    }
    var out = [];
    var di = 0;
    for (i = 0; i < n; i++) {
      var target = total * i / n;
      while (lens[di + 1] < target) di++;
      var f = (target - lens[di]) / (lens[di + 1] - lens[di] || 1);
      var pa = dense[di % dense.length], pb = dense[(di + 1) % dense.length];
      var px = pa.x + (pb.x - pa.x) * f, py = pa.y + (pb.y - pa.y) * f;
      var pn = dense[(di + 3) % dense.length];
      out.push({ x: px, y: py, a: Math.atan2(pn.y - py, pn.x - px) * 180 / Math.PI });
    }
    out.step = total / n;
    return out;
  }

  var TRACK = sampleLoop(CTRL, N_SQUARES);
  var CELL = Math.round(TRACK.step * 0.84);    // square size in px
  var GRID = BOARD;                            // legacy alias

  /* Special squares (all other squares are plain road / buying / entrance squares) */
  /* Special squares are pinned to painted-board pixel locations, then snapped to
     the nearest track cell — so they stay correct if the path is retuned.
     start=PARTENZA, bank=BANCA, cityhall=MUNICIPIO; rest spread around the loop. */
  var SPECIAL_TARGETS = [
    { x: 1465, y: 440, t: 'start' },
    { x: 705,  y: 945, t: 'bank' },
    { x: 1000, y: 100, t: 'cityhall' },
    { x: 1468, y: 600, t: 'permission' },
    { x: 1255, y: 892, t: 'free-entrance' },
    { x: 470,  y: 902, t: 'permission' },
    { x: 190,  y: 725, t: 'free-build' },
    { x: 118,  y: 560, t: 'permission' },
    { x: 300,  y: 320, t: 'permission' },
    { x: 710,  y: 298, t: 'free-entrance' },
    { x: 1245, y: 188, t: 'permission' },
    { x: 985,  y: 898, t: 'free-build' }
  ];
  var SPECIALS = {};
  SPECIAL_TARGETS.forEach(function (tg) {
    var best = -1, bestD = 1e18;
    TRACK.forEach(function (sq, i) {
      if (SPECIALS[i] !== undefined) return;
      var d = (sq.x - tg.x) * (sq.x - tg.x) + (sq.y - tg.y) * (sq.y - tg.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) SPECIALS[best] = tg.t;
  });

  /* Invisible adjacency/click boxes — extended toward the road so each hotel
     reaches its track cells. The visible region (ownership outline + buildings)
     comes from POLYS below. Order matches HOTELS[]. */
  var PLOTS = [
    { x: 250,  y: 160, w: 268, h: 185 },  // Waikiri
    { x: 445,  y: 120, w: 240, h: 205 },  // Hábel
    { x: 1180, y: 40,  w: 345, h: 200 },  // L'Étoile
    { x: 150,  y: 415, w: 305, h: 210 },  // Royal
    { x: 1010, y: 560, w: 425, h: 245 },  // Fujiyama
    { x: 1150, y: 820, w: 390, h: 245 },  // Boomerang
    { x: 55,   y: 775, w: 365, h: 250 },  // President
    { x: 694,  y: 60,  w: 180, h: 190 }   // Safari
  ];

  /* Polygons tracing each painted hotel region (board px), used to outline
     ownership on the image board so it hugs the artwork instead of a box.
     Order matches HOTELS[]. */
  var POLYS = [
    [[44,118],[58,40],[280,38],[290,160],[260,260],[120,270]],  // Waikiri (shifted left+down for more Hábel room)
    [[300,28],[506,28],[506,260],[310,265],[300,160]],  // Hábel (expanded down to fit 3 buildings)
    [[1180,15],[1180,180],[1248,180],[1248,106],[1293,101],[1342,115],[1406,155],[1454,201],[1526,200],[1526,15]],  // L'Étoile (added upper-left to fit main+wing+pool)
    [[470,560],[486,456],[360,414],[271,420],[197,486],[182,543],[192,606],[330,626]],  // Royal
    [[1170,796],[1322,726],[1322,606],[1180,564],[1014,586],[1000,666],[1030,762]],  // Fujiyama
    [[1540,836],[1471,836],[1416,900],[1347,938],[1273,954],[1180,956],[1176,1064],[1540,1064]],  // Boomerang
    [[396,1056],[396,940],[328,903],[181,800],[50,800],[50,1056]],  // President
    [[746,34],[520,34],[520,190],[746,190]]  // Safari
  ];

  /* Adjacency by distance: a plain square within reach of a plot can host its
     entrance. Shared squares (two facing plots) hold only ONE entrance ever. */
  var ADJ_DIST = 82;
  var PLOT_SQUARES = PLOTS.map(function () { return []; });
  var SQUARE_PLOT = {};
  TRACK.forEach(function (sq, i) {
    if (SPECIALS[i]) return;
    var best = null, bestD = 1e9;
    PLOTS.forEach(function (pl, pi) {
      var dx = Math.max(pl.x - sq.x, 0, sq.x - (pl.x + pl.w));
      var dy = Math.max(pl.y - sq.y, 0, sq.y - (pl.y + pl.h));
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= ADJ_DIST) {
        PLOT_SQUARES[pi].push(i);
        if (d < bestD) { bestD = d; best = pi; }
      }
    });
    if (best !== null) SQUARE_PLOT[i] = best;   // nearest plot is the buying side
  });

  // re-balance: every hotel keeps at least 2 buying squares
  PLOTS.forEach(function (pl, pi) {
    function mine() {
      return Object.keys(SQUARE_PLOT).filter(function (k) { return SQUARE_PLOT[k] === pi; });
    }
    PLOT_SQUARES[pi].forEach(function (sq) {
      if (mine().length >= 2) return;
      var owner = SQUARE_PLOT[sq];
      if (owner === pi) return;
      var ownerCount = Object.keys(SQUARE_PLOT).filter(function (k) {
        return SQUARE_PLOT[k] === owner;
      }).length;
      if (ownerCount > 2) SQUARE_PLOT[sq] = pi;
    });
  });

  /* Contested squares: a plain square reachable by 2+ plots. Only one entrance
     ever fits, so facing hotels race to claim it. SHARED[sq] = [plotIds]. */
  var SHARED = {};
  TRACK.forEach(function (sq, i) {
    var owners = [];
    PLOT_SQUARES.forEach(function (sqs, pi) { if (sqs.indexOf(i) >= 0) owners.push(pi); });
    if (owners.length > 1) SHARED[i] = owners;
  });

  function fmt(n) { return '$' + (n || 0).toLocaleString('en-US'); }

  return {
    START_CASH: START_CASH, BANK_BONUS: BANK_BONUS, AUCTION_MS: AUCTION_MS,
    CELL: CELL, GRID: GRID, BOARD: BOARD, CTRL: CTRL, COLORS: COLORS, COLOR_NAMES: COLOR_NAMES,
    STAGE_NAMES: STAGE_NAMES, HOTELS: HOTELS, TRACK: TRACK, SPECIALS: SPECIALS,
    PLOTS: PLOTS, POLYS: POLYS, PLOT_SQUARES: PLOT_SQUARES, SQUARE_PLOT: SQUARE_PLOT,
    SHARED: SHARED, fmt: fmt
  };
});
