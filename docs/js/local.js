/* Offline game driver: runs the rules engine + bots entirely in the browser.
   Presents the same on/send interface as Net so the game UI is agnostic. */
(function () {
  'use strict';
  var handlers = {}, game = null, config = null, timers = [], auctionTimer = null;

  function on(t, fn) { handlers[t] = fn; }
  function emit(t, m) { if (handlers[t]) handlers[t](m); }
  function clearTimers() {
    timers.forEach(clearTimeout); timers = [];
    if (auctionTimer) { clearTimeout(auctionTimer); auctionTimer = null; }
  }

  function broadcast() {
    emit('state', { t: 'state', code: 'LOCAL', game: game.view() });
    scheduleBots();
  }

  function start(cfg) {
    if (cfg) config = cfg;
    if (!config) return;
    clearTimers();
    game = new ENGINE.Game(config.players.map(function (p, i) {
      return { id: 'P' + (i + 1), name: p.name, bot: p.bot };
    }));
    broadcast();
  }

  function act(pid, action) {
    if (!game) return;
    var r = game.act(pid, action);
    if (!r.ok) { emit('error', { msg: r.error }); return; }
    broadcast();
  }

  function scheduleBots() {
    clearTimers();
    if (!game || game.phase !== 'playing' || !game.pending) return;
    var pd = game.pending, seq = game.seq;

    if (pd.type === 'auction') {
      auctionTimer = setTimeout(function () {
        if (game && game.pending && game.pending.type === 'auction') {
          game.finishAuction();
          broadcast();
        }
      }, Math.max(100, pd.deadline - Date.now() + 80));
      var delay = 500 / game.speed;
      game.players.forEach(function (p) {
        if (!p.alive || p.id === pd.seller || !p.bot) return;
        delay += (400 + Math.random() * 600) / game.speed;
        timers.push(setTimeout(function () {
          if (!game || game.seq !== seq || !game.pending || game.pending.type !== 'auction') return;
          var a = BOT.decide(game, p);
          if (a) act(p.id, a);
        }, delay));
      });
      return;
    }

    var owner = game.byId(pd.player);
    if (owner && owner.bot) {
      timers.push(setTimeout(function () {
        if (!game || game.seq !== seq) return;
        var a = BOT.decide(game, owner);
        if (a) act(owner.id, a);
      }, (600 + Math.random() * 800) / game.speed));
    }
  }

  function send(m) {
    if (m.t === 'action') {
      if (m.action && m.action.t === 'ffAuction') {
        if (game && game.pending && game.pending.type === 'auction' &&
            game.auctionHumansDone()) {
          game.resolveAuctionWithBots(BOT.decide);
          broadcast();
        }
        return;
      }
      act(m.as, m.action || {});
    }
    else if (m.t === 'speed') { if (game) { game.speed = (m.speed === 3 ? 3 : 1); broadcast(); } }
    else if (m.t === 'start') start(null);
    else if (m.t === 'leave') { clearTimers(); game = null; }
  }

  window.Local = {
    on: on, send: send, start: start, isLocal: true,
    humanIds: function () {
      if (!config) return [];
      return config.players
        .map(function (p, i) { return p.bot ? null : 'P' + (i + 1); })
        .filter(Boolean);
    }
  };
})();
