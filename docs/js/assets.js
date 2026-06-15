/* Optional image assets, organized per theme. Drop PNGs into
   docs/assets/<theme-dir>/ and list keys in that folder's manifest.json
   (e.g. ["board","car-red"]). The loader tries the active theme's folder
   first, then falls back to `clay/`, then to the built-in vector art.

   The active theme is exposed by themes.js; this file re-loads when the
   theme changes so visuals swap without a page refresh. */
(function () {
  'use strict';

  var FALLBACK_DIR = 'clay';
  var have = {};            // key -> resolved URL
  var ready = false;
  var cbs = [];
  var loadToken = 0;        // cancels in-flight loads when theme changes

  function activeDir() {
    return (window.HotelsTheme && HotelsTheme.dir()) || FALLBACK_DIR;
  }

  function fetchManifest(dir) {
    return fetch('assets/' + dir + '/manifest.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function probe(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(url); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function load() {
    var token = ++loadToken;
    var dir = activeDir();
    ready = false;
    have = {};

    Promise.all([
      fetchManifest(dir),
      dir === FALLBACK_DIR ? Promise.resolve([]) : fetchManifest(FALLBACK_DIR)
    ]).then(function (manifests) {
      if (token !== loadToken) return;
      var primary = manifests[0] || [];
      var fallback = manifests[1] || [];
      var keys = {};
      primary.forEach(function (k) { keys[k] = true; });
      fallback.forEach(function (k) { keys[k] = true; });
      var list = Object.keys(keys);
      if (!list.length) { finish(token); return; }

      var pending = list.length;
      list.forEach(function (k) {
        var tryPrimary = primary.indexOf(k) >= 0
          ? probe('assets/' + dir + '/' + k + '.png')
          : Promise.resolve(null);
        tryPrimary.then(function (url) {
          if (url) return url;
          if (dir === FALLBACK_DIR || fallback.indexOf(k) < 0) return null;
          return probe('assets/' + FALLBACK_DIR + '/' + k + '.png');
        }).then(function (url) {
          if (token !== loadToken) return;
          if (url) have[k] = url;
          if (--pending <= 0) finish(token);
        });
      });
    });
  }

  function finish(token) {
    if (token !== loadToken) return;
    ready = true;
    var fired = cbs.slice();
    cbs = [];
    fired.forEach(function (cb) { try { cb(); } catch (e) {} });
  }

  load();
  if (window.HotelsTheme) HotelsTheme.onChange(function () { load(); });

  window.ClayAssets = {
    url: function (k) { return have[k] || null; },
    onReady: function (cb) { ready ? cb() : cbs.push(cb); }
  };
})();
