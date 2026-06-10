/* Tiny pixel-art sprites drawn onto canvases and used as data-URL images. */
(function () {
  'use strict';
  var cache = {};

  function px(map, palette) {
    var h = map.length, w = map[0].length;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var col = palette[map[y][x]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return { url: c.toDataURL(), w: w, h: h };
  }

  var CAR = [
    '...oooo.....',
    '..obbbbo....',
    '.obwwbwwbo..',
    'obbbbbbbbbo.',
    'obbbbbbbbbbo',
    'oooooooooooo',
    '.ott....tto.',
    '..oo....oo..'
  ];

  var AWNING = [
    'oooooooooooo',
    'obwbwbwbwbwo',
    'obwbwbwbwbwo',
    'oooooooooooo',
    '.o........o.',
    '.o........o.'
  ];

  var ICONS = {
    start: [
      'kkkkk..',
      'k...kk.',
      'k....k.',
      'k...kk.',
      'kkkkk..',
      'k......',
      'k......',
      'k......'
    ],
    bank: [
      '...kk..',
      '.kkkkk.',
      'kk.k...',
      'kk.k...',
      '.kkkkk.',
      '...k.kk',
      '...k.kk',
      'kkkkkk.',
      '...kk..'
    ],
    cityhall: [
      '.....k.....',
      '....kkk....',
      '...kkkkk...',
      '..kkkkkkk..',
      'kkkkkkkkkkk',
      'k.k.k.k.k.k',
      'k.k.k.k.k.k',
      'k.k.k.k.k.k',
      'kkkkkkkkkkk'
    ],
    permission: [
      'kkkkkkkkk',
      'k.......k',
      'k.kkkk..k',
      'k.......k',
      'k.kk.kk.k',
      'k.......k',
      'k.kkkkk.k',
      'k.......k',
      'kkkkkkkkk'
    ],
    'free-build': [
      '.kkkkkk..',
      '.kkkkkkk.',
      '.kkkkkk..',
      '....k....',
      '....k....',
      '....k....',
      '....k....',
      '....k....'
    ],
    'free-entrance': [
      'kkkkkkkk',
      'k......k',
      'k.kkkk.k',
      'k.k..k.k',
      'k.k..k.k',
      'k.k.kk.k',
      'k.k..k.k',
      'k.kkkk.k',
      'kkkkkkkk'
    ]
  };

  window.Sprites = {
    car: function (color) {
      var key = 'car' + color;
      if (!cache[key]) cache[key] = px(CAR, { o: '#14141c', b: color, w: '#d9ecff', t: '#202026' });
      return cache[key];
    },
    awning: function (color) {
      var key = 'awn' + color;
      if (!cache[key]) cache[key] = px(AWNING, { o: '#14141c', b: color, w: '#f4f0e4' });
      return cache[key];
    },
    icon: function (name, ink) {
      var key = 'ic' + name + (ink || '');
      if (!cache[key]) cache[key] = px(ICONS[name], { k: ink || '#2b2b36' });
      return cache[key];
    }
  };
})();
