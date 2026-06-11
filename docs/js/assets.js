/* Optional claymation image assets. Drop PNGs into docs/assets/clay/ and list
   their keys in docs/assets/clay/manifest.json (e.g. ["board","car-red"]).
   Anything missing falls back to the built-in vector clay art. */
(function () {
  'use strict';
  var have = {};
  var ready = false;
  var cbs = [];

  fetch('assets/clay/manifest.json')
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(function (keys) {
      var pending = keys.length;
      if (!pending) { done(); return; }
      keys.forEach(function (k) {
        var img = new Image();
        img.onload = function () { have[k] = 'assets/clay/' + k + '.png'; tick(); };
        img.onerror = tick;
        img.src = 'assets/clay/' + k + '.png';
      });
      function tick() { if (--pending <= 0) done(); }
    });

  function done() {
    ready = true;
    cbs.forEach(function (cb) { cb(); });
    cbs = [];
  }

  window.ClayAssets = {
    url: function (k) { return have[k] || null; },
    onReady: function (cb) { ready ? cb() : cbs.push(cb); }
  };
})();
