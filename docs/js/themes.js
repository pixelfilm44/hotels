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

  /* Each theme provides hotel names (length 7) in the same order as
     GAMEDATA.HOTELS, plus an `abbr` array of 2-letter codes. `facilities` is an
     array of arrays — one inner array per hotel — so the hotel with two
     facilities (President) gets two names. `dir` is the asset folder under
     docs/assets/. Order: Safari, Taj Mahal, Royal, President, Le Grand, Waikiki, Fujiyama. */
  var THEMES = {
    normal: {
      id: 'normal',
      label: 'Classic',
      dir: 'clay',
      hotels:     ['Safari', 'Taj Mahal', 'Royal', 'President', 'Le Grand', 'Waikiki', 'Fujiyama'],
      abbrs:      ['SF',     'TM',        'RY',    'PR',        'LG',       'WK',      'FJ'],
      facilities: [['Swimming Pool'], ['Swimming Pool'], ['Swimming Pool'],
                   ['Golf Course', 'Swimming Pool'],
                   ['Swimming Pool'], ['Swimming Pool'], ['Swimming Pool']]
    },
    simpsons: {
      id: 'simpsons',
      label: 'The Simpsons',
      dir: 'simpsons',
      hotels:     ["Krusty Burger", "Moe's Tavern", 'Retirement Castle',
                   'Burns Manor', 'Kwik-E-Mart', 'Nuclear Plant', 'Aztec Theater'],
      abbrs:      ['KB', 'MT', 'RC', 'BM', 'KE', 'NP', 'AZ'],
      facilities: [['Duff Pool'], ['Squishee Bar'], ["Sir Putt-A-Lot's"],
                   ['Hounds of Burns', 'Money Pool'],
                   ['Krusty Klown Show'], ["Itchy & Scratchy Land"], ['Cooling Tower Lounge']]
    },
    starwars: {
      id: 'starwars',
      label: 'Star Wars',
      dir: 'starwars',
      hotels:     ['Mos Eisley Cantina', 'Cloud City', 'Theed Palace',
                   'Imperial Palace', "Jabba's Palace", 'Death Star', 'Jedi Temple'],
      abbrs:      ['ME', 'CC', 'TP', 'IP', 'JP', 'DS', 'JT'],
      facilities: [['Cantina Pool'], ['Tibanna Spa'], ['Naboo Gardens'],
                   ['Throne Course', 'Bacta Pool'],
                   ['Rancor Pit'], ['Superlaser Deck'], ['Meditation Chamber']]
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
      var facNames = t.facilities[i] || [];
      (h.facilities || []).forEach(function (fac, fi) {
        if (facNames[fi]) fac.name = facNames[fi];
      });
      if (h.facility && h.facilities && h.facilities[0]) h.facility = h.facilities[0];
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
