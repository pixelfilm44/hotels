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
    { id: 0, name: 'Surf Shack',    abbr: 'SS', stars: 1, color: '#7fd4c1', land: 500,
      stages: [1000, 500],            facility: { name: 'Tiki Pool',   cost: 500 },
      entrance: 500,  rates: [100, 150, 250] },
    { id: 1, name: 'Cactus Court', abbr: 'CC',  stars: 1, color: '#dccb84', land: 700,
      stages: [1200, 700],            facility: { name: 'Cantina',     cost: 600 },
      entrance: 500,  rates: [150, 200, 300] },
    { id: 2, name: 'Lagoon Palms', abbr: 'LP',  stars: 2, color: '#8fd48f', land: 1000,
      stages: [1800, 900, 900],       facility: { name: 'Lagoon Pool', cost: 800 },
      entrance: 600,  rates: [200, 300, 400, 550] },
    { id: 3, name: 'Alpine Lodge', abbr: 'AL',  stars: 3, color: '#b9c7e8', land: 1500,
      stages: [2500, 1200, 1200],     facility: { name: 'Ski Lift',    cost: 1000 },
      entrance: 700,  rates: [300, 450, 600, 800] },
    { id: 4, name: 'Casa Sol', abbr: 'CS',      stars: 3, color: '#f0b27e', land: 1800,
      stages: [3000, 1500, 1500],     facility: { name: 'Beach Club',  cost: 1200 },
      entrance: 800,  rates: [350, 500, 700, 950] },
    { id: 5, name: 'Pagoda Garden', abbr: 'PG', stars: 4, color: '#e89ab0', land: 2200,
      stages: [3500, 1800, 1800, 1800], facility: { name: 'Zen Garden', cost: 1500 },
      entrance: 900,  rates: [400, 600, 800, 1000, 1300] },
    { id: 6, name: 'Sky Mirage', abbr: 'SM',    stars: 5, color: '#c9a6e8', land: 2800,
      stages: [4500, 2200, 2200, 2200], facility: { name: 'Sky Casino', cost: 2000 },
      entrance: 1000, rates: [500, 750, 1000, 1300, 1700] },
    { id: 7, name: 'The Meridian', abbr: 'MD',  stars: 5, color: '#ead98a', land: 3500,
      stages: [6000, 3000, 3000, 3000], facility: { name: 'Grand Spa',  cost: 2500 },
      entrance: 1200, rates: [600, 900, 1200, 1600, 2100] }
  ];

  /* ---------- curved board geometry ----------
     The track is a winding closed loop sampled from a Catmull-Rom spline.
     Hotels sit inside AND outside the road; square<->plot adjacency is
     computed by distance, so one square can serve two facing hotels —
     and only ONE entrance fits on a square (the entrance race). */
  var BOARD = { w: 780, h: 560 };
  var N_SQUARES = 42;

  var CTRL = [
    { x: 140, y: 120 }, { x: 235, y: 80 },  { x: 340, y: 90 },  { x: 425, y: 152 },
    { x: 505, y: 92 },  { x: 610, y: 95 },  { x: 680, y: 165 }, { x: 685, y: 255 },
    { x: 635, y: 320 }, { x: 655, y: 390 }, { x: 575, y: 445 }, { x: 445, y: 450 },
    { x: 300, y: 443 }, { x: 160, y: 435 }, { x: 85, y: 370 },  { x: 68, y: 262 },
    { x: 82, y: 165 }
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
  var SPECIALS = {
    0: 'start', 5: 'permission', 11: 'bank', 16: 'permission',
    18: 'free-entrance', 21: 'cityhall', 24: 'permission', 27: 'free-build',
    31: 'permission', 33: 'free-entrance', 36: 'permission', 39: 'free-build'
  };
  SPECIALS[41] = 'permission';

  /* Hotel plots in board pixels — inside and outside the road. */
  var PLOTS = [
    { x: 40,  y: 6,   w: 235, h: 64 },   // Surf Shack      (outside, top-left beach)
    { x: 145, y: 118, w: 150, h: 84 },   // Cactus Court    (inside, faces Surf Shack)
    { x: 365, y: 14,  w: 150, h: 85 },   // Lagoon Palms    (outside, above the dip)
    { x: 495, y: 135, w: 150, h: 88 },   // Alpine Lodge    (inside, top-right lobe)
    { x: 470, y: 325, w: 135, h: 82 },   // Casa Sol        (inside, bottom-right)
    { x: 430, y: 462, w: 160, h: 84 },   // Pagoda Garden   (outside, faces Casa Sol)
    { x: 150, y: 455, w: 175, h: 85 },   // Sky Mirage      (outside, bottom-left)
    { x: 115, y: 285, w: 200, h: 115 }   // The Meridian    (inside island, faces Sky Mirage)
  ];

  /* Adjacency by distance: a plain square within reach of a plot can host its
     entrance. Shared squares (two facing plots) hold only ONE entrance ever. */
  var ADJ_DIST = 46;
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
    PLOTS: PLOTS, PLOT_SQUARES: PLOT_SQUARES, SQUARE_PLOT: SQUARE_PLOT,
    SHARED: SHARED, fmt: fmt
  };
});
