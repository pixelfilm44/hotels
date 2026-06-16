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

  var STAGE_NAMES = ['Main Building', 'East Wing', 'West Wing', 'North Wing', 'Grand Tower'];

  /* 7 hotels, cheap -> grand. `facilities` is an array (President has two);
     `facility` aliases facilities[0] for legacy code paths.
     rates[i] = price per night when (stagesBuilt-1 + facilitiesBuilt) === i */
  function H(spec) {
    spec.facilities = spec.facilities || (spec.facility ? [spec.facility] : []);
    spec.facility = spec.facilities[0] || null;
    return spec;
  }
  var HOTELS = [
    H({ id: 0, name: 'Safari',    abbr: 'SF', stars: 1, color: '#cdb87f', land: 500,
        stages: [1000, 500, 500],
        facilities: [{ name: 'Swimming Pool', cost: 500 }],
        entrance: 500,  rates: [100, 150, 250, 350] }),
    H({ id: 1, name: 'Taj Mahal', abbr: 'TM', stars: 2, color: '#e0b878', land: 800,
        stages: [1500, 800, 800],
        facilities: [{ name: 'Swimming Pool', cost: 700 }],
        entrance: 600,  rates: [150, 250, 400, 550] }),
    H({ id: 2, name: 'Royal',     abbr: 'RY', stars: 3, color: '#5fa45f', land: 1200,
        stages: [2200, 1100, 1100, 1100],
        facilities: [{ name: 'Swimming Pool', cost: 1000 }],
        entrance: 700,  rates: [250, 400, 550, 700, 950] }),
    H({ id: 3, name: 'President', abbr: 'PR', stars: 4, color: '#9a7fc8', land: 1800,
        stages: [2800, 1400, 1400, 1400],
        facilities: [{ name: 'Golf Course',  cost: 1500 },
                     { name: 'Swimming Pool', cost: 1200 }],
        entrance: 900,  rates: [300, 500, 700, 900, 1200, 1500] }),
    H({ id: 4, name: 'Le Grand',  abbr: 'LG', stars: 4, color: '#e0883e', land: 2200,
        stages: [3500, 1500, 1500, 1500, 1500],
        facilities: [{ name: 'Swimming Pool', cost: 1500 }],
        entrance: 900,  rates: [350, 500, 700, 900, 1100, 1400] }),
    H({ id: 5, name: 'Waikiki',   abbr: 'WK', stars: 5, color: '#e6c878', land: 2800,
        stages: [4500, 1800, 1800, 1800, 1800],
        facilities: [{ name: 'Swimming Pool', cost: 2000 }],
        entrance: 1000, rates: [400, 600, 800, 1000, 1300, 1700] }),
    H({ id: 6, name: 'Fujiyama',  abbr: 'FJ', stars: 3, color: '#d77ab5', land: 1000,
        stages: [1800, 900, 900],
        facilities: [{ name: 'Swimming Pool', cost: 900 }],
        entrance: 600,  rates: [200, 300, 450, 600] }),
    H({ id: 7, name: 'Boomerang', abbr: 'BM', stars: 2, color: '#7fb5d7', land: 2000,
        stages: [2000],
        facilities: [{ name: 'Swimming Pool', cost: 250 }],
        entrance: 150,  rates: [100, 400] })
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
    { x: 250,  y: 160, w: 450, h: 185 },  // 0 Safari    (was Waikiri art; extended right to reach top-row squares + absorb the orphaned Hábel painted area)
    { x: 1180, y: 40,  w: 345, h: 200 },  // 1 Taj Mahal (was L'Étoile art)
    { x: 150,  y: 415, w: 305, h: 280 },  // 2 Royal     (extended down to share squares with President)
    { x: 1010, y: 560, w: 425, h: 245 },  // 3 President (was Fujiyama art — widest, fits two facilities)
    { x: 1150, y: 820, w: 390, h: 245 },  // 4 Le Grand  (was Boomerang art)
    { x: 55,   y: 775, w: 365, h: 250 },  // 5 Waikiki   (was President art)
    { x: 694,  y: 60,  w: 180, h: 190 },  // 6 Fujiyama  (was Safari art)
    { x: 1060, y: 250, w: 300, h: 200 }   // 7 Boomerang (inside the loop, south of Taj Mahal — shares track squares with TM)
  ];

  /* Polygons tracing each painted hotel region (board px), used to outline
     ownership on the image board so it hugs the artwork instead of a box.
     Order matches HOTELS[]. */
  var POLYS = [
    [[44,118],[58,40],[460,28],[460,220],[290,230],[120,240]],  // 0 Safari
    [[1120,15],[1120,110],[1200,130],[1280,110],[1342,115],[1406,155],[1454,201],[1526,200],[1526,15]],  // 1 Taj Mahal
    [[470,560],[486,456],[360,414],[271,420],[197,486],[182,543],[192,606],[330,626]],  // 2 Royal
    [[1170,796],[1322,726],[1322,606],[1180,564],[1014,586],[1000,666],[1030,762]],  // 3 President
    [[1540,910],[1471,920],[1416,940],[1347,960],[1200,970],[1000,970],[1000,1064],[1540,1064]],  // 4 Le Grand
    [[396,1056],[396,940],[328,903],[181,800],[50,800],[50,1056]],  // 5 Waikiki
    [[746,34],[520,34],[520,190],[746,190]],  // 6 Fujiyama
    [[1060,300],[1360,300],[1360,460],[1060,460]]  // 7 Boomerang
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
