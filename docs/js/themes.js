/* Theme system: swaps hotel/facility display names and the asset folder used
   for board / building / facility art. Engine state is unchanged — names are
   display-only — so multiplayer clients can each pick their own theme.

   To add visuals for a theme, drop PNGs into docs/assets/<dir>/ and list keys
   in docs/assets/<dir>/manifest.json. Missing files fall back to clay/, then
   to the built-in vector art. Per-hotel keys use the canonical (normal) hotel
   slug, e.g. `building-waikiri.png`, regardless of the active theme. */
(function () {
  'use strict';

  var STORAGE_KEY = 'hotels.theme';

  /* Each theme provides hotel names (length 8) and facility names (length 8),
     in the same order as GAMEDATA.HOTELS, plus an `abbr` array of 2-letter
     codes shown on player chips. `dir` is the asset folder under docs/assets/. */
  var THEMES = {
    normal: {
      id: 'normal',
      label: 'Classic',
      dir: 'clay',
      hotels:     ['Waikiri', 'Hábel', "L'Étoile", 'Royal', 'Fujiyama', 'Boomerang', 'President', 'Safari'],
      abbrs:      ['WK',      'HB',    'LE',       'RY',    'FJ',       'BM',        'PR',        'SF'],
      facilities: ['Beach Bar', 'Bazaar', 'Casino', 'Golf Course', 'Onsen Spa', 'Safari Pool', 'Sky Lounge', 'Grand Lodge']
    },
    simpsons: {
      id: 'simpsons',
      label: 'The Simpsons',
      dir: 'simpsons',
      hotels:     ["Krusty Burger", "Moe's Tavern", 'Aztec Theater', 'Retirement Castle',
                   'Burns Manor', 'Kwik-E-Mart', 'Nuclear Plant', 'Mt. Springfield'],
      abbrs:      ['KB', 'MT', 'AZ', 'RC', 'BM', 'KE', 'NP', 'MS'],
      facilities: ['Krusty Klown Show', 'Duff Brewery Tour', 'Casino Royale Springfield',
                   "Sir Putt-A-Lot's", 'Hounds of Burns', 'Squishee Bar',
                   'Cooling Tower Lounge', "Itchy & Scratchy Land"]
    },
    starwars: {
      id: 'starwars',
      label: 'Star Wars',
      dir: 'starwars',
      hotels:     ['Mos Eisley Cantina', 'Jawa Sandcrawler', 'Cloud City', 'Theed Palace',
                   'Jedi Temple', "Jabba's Palace", 'Imperial Palace', 'Death Star'],
      abbrs:      ['ME', 'JS', 'CC', 'TP', 'JT', 'JP', 'IP', 'DS'],
      facilities: ['Smugglers Lounge', 'Scrap Bazaar', 'Tibanna Spa', 'Naboo Gardens',
                   'Meditation Chamber', 'Rancor Pit', 'Throne Room', 'Superlaser Deck']
    }
  };

  var listeners = [];
  var current = loadStored();

  function loadStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && THEMES[v]) return v;
    } catch (e) {}
    return 'normal';
  }

  function applyNames(themeId) {
    var t = THEMES[themeId] || THEMES.normal;
    if (!window.GAMEDATA || !GAMEDATA.HOTELS) return;
    GAMEDATA.HOTELS.forEach(function (h, i) {
      h.name = t.hotels[i];
      h.abbr = t.abbrs[i];
      if (h.facility) h.facility.name = t.facilities[i];
    });
  }

  function set(themeId, opts) {
    if (!THEMES[themeId]) themeId = 'normal';
    current = themeId;
    try { localStorage.setItem(STORAGE_KEY, themeId); } catch (e) {}
    applyNames(themeId);
    listeners.forEach(function (cb) { try { cb(themeId); } catch (e) {} });
  }

  /* Apply names immediately so first render uses themed names. gamedata.js is
     loaded before this file in index.html. */
  applyNames(current);

  window.HotelsTheme = {
    list: function () {
      return Object.keys(THEMES).map(function (k) {
        return { id: k, label: THEMES[k].label };
      });
    },
    get: function () { return current; },
    dir: function (id) { return (THEMES[id || current] || THEMES.normal).dir; },
    set: set,
    onChange: function (cb) { listeners.push(cb); }
  };
})();
