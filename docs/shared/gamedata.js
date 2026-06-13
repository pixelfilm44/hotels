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
  var CTRL = [
    { x: 1260, y: 180 }, { x: 1400, y: 250 }, { x: 1460, y: 400 }, { x: 1455, y: 545 },
    { x: 1410, y: 690 }, { x: 1330, y: 805 }, { x: 1190, y: 860 }, { x: 1040, y: 865 },
    { x: 890, y: 910 },  { x: 740, y: 955 },  { x: 560, y: 915 },  { x: 410, y: 865 },
    { x: 270, y: 795 },  { x: 165, y: 675 },  { x: 120, y: 548 },  { x: 140, y: 425 },
    { x: 215, y: 330 },  { x: 330, y: 275 },  { x: 460, y: 255 },  { x: 560, y: 335 },
    { x: 670, y: 258 },  { x: 780, y: 165 },  { x: 862, y: 95 },   { x: 970, y: 100 },
    { x: 1055, y: 205 }, { x: 1145, y: 212 }, { x: 1235, y: 185 }
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
  /* Mapped onto the painted board: 0=PARTENZA, 16=BANCA, 37=MUNICIPIO; the rest
     fall on cells no hotel needs (so hotels keep their buying squares). */
  var SPECIALS = {
    0: 'start',
    5: 'permission',
    6: 'free-entrance',
    12: 'free-build',
    13: 'permission',
    16: 'bank',
    18: 'permission',
    28: 'free-entrance',
    33: 'permission',
    36: 'permission',
    37: 'cityhall',
    39: 'free-build'
  };

  /* Hotel plots in board pixels, placed over the painted regions of board.png.
     Order matches HOTELS[]. Tuned against the image. */
  var PLOTS = [
    { x: 70,   y: 45,  w: 330, h: 170 },  // Waikiri      top-left beach
    { x: 300,  y: 28,  w: 200, h: 165 },  // Hábel        top-center brown (left)
    { x: 1245, y: 35,  w: 265, h: 165 },  // L'Étoile     top-right tan
    { x: 200,  y: 415, w: 290, h: 195 },  // Royal        left green lobe
    { x: 1015, y: 575, w: 330, h: 190 },  // Fujiyama     right pink lobe
    { x: 1180, y: 825, w: 355, h: 225 },  // Boomerang    bottom-right orange
    { x: 55,   y: 805, w: 335, h: 235 },  // President    bottom-left purple
    { x: 520,  y: 35,  w: 210, h: 150 }   // Safari       top-center brown (right)
  ];

  /* Polygons tracing each painted hotel region (board px), used to outline
     ownership on the image board so it hugs the artwork instead of a box.
     Order matches HOTELS[]. */
  var POLYS = [
    [[58,48],[372,38],[398,108],[300,188],[120,206],[44,118]],            // Waikiri
    [[286,30],[502,28],[506,196],[300,200],[274,104]],                     // Hábel
    [[1248,40],[1522,38],[1526,200],[1248,202]],                           // L'Étoile
    [[176,426],[360,414],[486,456],[470,560],[330,626],[190,606],[150,506]], // Royal
    [[1014,586],[1180,564],[1322,606],[1322,726],[1170,796],[1030,762],[1000,666]], // Fujiyama
    [[1300,836],[1540,836],[1540,1064],[1176,1064],[1182,906]],            // Boomerang
    [[50,800],[396,800],[396,1056],[50,1056]],                            // President
    [[520,34],[746,34],[746,190],[520,190]]                               // Safari
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
