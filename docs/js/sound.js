/* Synthesized sound effects (Web Audio, no files). Sound.play(name). */
(function () {
  'use strict';
  var ctx = null;
  var muted = localStorage.getItem('hotels-muted') === '1';

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, vol, slide) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    var t0 = c.currentTime + (start || 0);
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(start, dur, vol, freq) {
    var c = ac(); if (!c) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2500;
    var g = c.createGain();
    var t0 = c.currentTime + (start || 0);
    g.gain.setValueAtTime(vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  var FX = {
    dice: function () { // clatter
      noise(0, 0.05, 0.14, 3000); noise(0.07, 0.04, 0.12, 2400);
      noise(0.15, 0.05, 0.1, 2800); noise(0.24, 0.06, 0.08, 2000);
    },
    hop: function () { tone(330, 0, 0.06, 'sine', 0.05); },
    land: function () { tone(180, 0, 0.12, 'sine', 0.1, 120); },
    cash: function () { // cha-ching!
      tone(988, 0, 0.09, 'square', 0.06);
      tone(1319, 0.08, 0.22, 'square', 0.07);
      noise(0, 0.04, 0.05, 5000);
    },
    pay: function () { tone(440, 0, 0.12, 'triangle', 0.1, 240); tone(330, 0.1, 0.18, 'triangle', 0.09, 200); },
    build: function () { // squishy thunk
      tone(140, 0, 0.1, 'sine', 0.16, 70); noise(0.02, 0.06, 0.06, 700);
    },
    denied: function () { tone(196, 0, 0.18, 'sawtooth', 0.09, 185); tone(185, 0.18, 0.3, 'sawtooth', 0.1, 150); },
    free: function () { [659, 784, 988, 1319].forEach(function (f, i) { tone(f, i * 0.07, 0.14, 'triangle', 0.07); }); },
    double: function () { tone(523, 0, 0.1, 'square', 0.07); tone(523, 0.12, 0.1, 'square', 0.08); },
    bid: function () { tone(620, 0, 0.07, 'square', 0.07, 700); },
    gavel: function () { noise(0, 0.07, 0.18, 1200); tone(160, 0, 0.1, 'sine', 0.12, 90); },
    bankrupt: function () { [392, 370, 349, 311].forEach(function (f, i) { tone(f, i * 0.18, 0.22, 'sawtooth', 0.08); }); },
    win: function () {
      [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.2, 'triangle', 0.1); });
      noise(0.7, 0.3, 0.04, 4000);
    },
    buy: function () { tone(392, 0, 0.08, 'triangle', 0.09); tone(523, 0.07, 0.12, 'triangle', 0.09); }
  };

  window.Sound = {
    play: function (name) {
      if (muted || !FX[name]) return;
      try { FX[name](); } catch (e) {}
    },
    toggle: function () {
      muted = !muted;
      localStorage.setItem('hotels-muted', muted ? '1' : '0');
      return muted;
    },
    muted: function () { return muted; }
  };
})();
