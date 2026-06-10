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

  /* Track: ring of 42 squares on a 13x10 cell grid, clockwise from top-left. */
  var TRACK = [];
  var x, y;
  for (x = 0; x <= 12; x++) TRACK.push({ x: x, y: 0 });   // 0..12  top
  for (y = 1; y <= 8; y++)  TRACK.push({ x: 12, y: y });  // 13..20 right
  for (x = 12; x >= 0; x--) TRACK.push({ x: x, y: 9 });   // 21..33 bottom
  for (y = 8; y >= 1; y--)  TRACK.push({ x: 0, y: y });   // 34..41 left

  /* Special squares (all other squares are plain road / buying / entrance squares) */
  var SPECIALS = {
    0:  'start',          // Car Park — everyone starts here
    12: 'bank',           // collect 2000 when passing (3+ players)
    13: 'permission',
    16: 'permission',
    17: 'free-entrance',
    21: 'cityhall',       // passing: may buy one entrance per built hotel
    22: 'free-entrance',
    30: 'free-build',
    32: 'permission',
    33: 'permission',
    34: 'free-build',
    35: 'permission'
  };
  SPECIALS[41] = 'permission';

  /* Plot rectangles on the cell grid (for rendering) */
  var PLOTS = [
    { x: 1,  y: 1, w: 3, h: 2 },  // Surf Shack
    { x: 4,  y: 1, w: 3, h: 2 },  // Cactus Court
    { x: 7,  y: 1, w: 3, h: 2 },  // Lagoon Palms
    { x: 10, y: 1, w: 2, h: 3 },  // Alpine Lodge
    { x: 10, y: 6, w: 2, h: 3 },  // Casa Sol
    { x: 6,  y: 7, w: 4, h: 2 },  // Pagoda Garden
    { x: 2,  y: 7, w: 4, h: 2 },  // Sky Mirage
    { x: 1,  y: 3, w: 2, h: 4 }   // The Meridian
  ];

  /* Track squares adjacent to each plot: these are its buying squares and
     the only squares where its entrances may be placed. */
  var PLOT_SQUARES = [
    [1, 2, 3, 40],      // Surf Shack
    [4, 5, 6],          // Cactus Court
    [7, 8, 9],          // Lagoon Palms
    [10, 11, 14, 15],   // Alpine Lodge
    [18, 19, 20, 23],   // Casa Sol
    [24, 25, 26, 27],   // Pagoda Garden
    [28, 29, 31],       // Sky Mirage
    [36, 37, 38, 39]    // The Meridian
  ];

  var SQUARE_PLOT = {};
  PLOT_SQUARES.forEach(function (squares, plotId) {
    squares.forEach(function (sq) { SQUARE_PLOT[sq] = plotId; });
  });

  function fmt(n) { return '$' + (n || 0).toLocaleString('en-US'); }

  return {
    START_CASH: START_CASH, BANK_BONUS: BANK_BONUS, AUCTION_MS: AUCTION_MS,
    CELL: CELL, GRID: GRID, COLORS: COLORS, COLOR_NAMES: COLOR_NAMES,
    STAGE_NAMES: STAGE_NAMES, HOTELS: HOTELS, TRACK: TRACK, SPECIALS: SPECIALS,
    PLOTS: PLOTS, PLOT_SQUARES: PLOT_SQUARES, SQUARE_PLOT: SQUARE_PLOT, fmt: fmt
  };
});
