/* App state, screens and game UI. */
(function () {
  'use strict';
  var G = window.GAMEDATA;
  var fmt = G.fmt;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    screen: 'home', code: null, playerId: null, token: null,
    lobby: null, view: null, boardReady: false,
    sel: null,            // {squares:[], make:fn(sq)->action}
    quickBots: false, auctionTimer: null, wasEnded: false,
    mode: 'online',       // 'online' (Net) or 'local' (in-browser engine)
    conn: window.Net, localBidder: null
  };

  /* ---------- helpers ---------- */
  function show(screen) {
    S.screen = screen;
    ['home', 'lobby', 'game'].forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== screen);
    });
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add('hidden'); }, 3500);
  }
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function btn(label, cls, fn, parent) {
    var b = el('button', 'btn ' + (cls || ''), label, parent);
    b.addEventListener('click', fn);
    return b;
  }
  function sendAction(a) { S.conn.send({ t: 'action', as: S.playerId, action: a }); }
  function sendActionAs(pid, a) { S.conn.send({ t: 'action', as: pid, action: a }); }
  function saveSession() {
    localStorage.setItem('hotels-session', JSON.stringify({ code: S.code, token: S.token }));
  }
  function clearSession() { localStorage.removeItem('hotels-session'); }
  function myName() { return $('name-input').value.trim() || 'Player'; }
  function me() {
    return S.view ? S.view.players.find(function (p) { return p.id === S.playerId; }) : null;
  }
  function playerById(id) {
    return S.view.players.find(function (p) { return p.id === id; });
  }

  function dieSVG(n, size) {
    size = size || 40;
    var pip = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
      4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
      6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n] || [];
    var s = '<svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '">' +
      '<rect x="2" y="2" width="36" height="36" rx="6" fill="#f7f2e2" stroke="#14141c" stroke-width="3"/>';
    pip.forEach(function (p) {
      s += '<circle cx="' + (p[0] * 9 + 2) + '" cy="' + (p[1] * 9 + 2) + '" r="3.6" fill="#14141c"/>';
    });
    return s + '</svg>';
  }
  function permChip(face) {
    var map = {
      green: ['GO', 'perm green'], red: ['NO', 'perm red'],
      free: ['H', 'perm gold'], double: ['×2', 'perm orange']
    }[face];
    return '<span class="' + map[1] + '">' + map[0] + '</span>';
  }

  /* ---------- networking (shared by Net and Local) ---------- */
  Net.on('joined', function (m) {
    S.mode = 'online'; S.conn = Net;
    S.code = m.code; S.playerId = m.playerId;
    if (m.token) { S.token = m.token; saveSession(); }
  });

  Net.on('lobby', function (m) {
    S.mode = 'online'; S.conn = Net;
    S.lobby = m; S.view = null; S.boardReady = false;
    renderLobby();
    show('lobby');
    if (S.quickBots) {
      S.quickBots = false;
      Net.send({ t: 'addBot', difficulty: 'easy' });
      Net.send({ t: 'addBot', difficulty: 'medium' });
      Net.send({ t: 'addBot', difficulty: 'hard' });
    }
  });

  function onState(m) {
    var fresh = !S.view || (S.wasEnded && m.game.phase === 'playing');
    S.view = m.game;
    S.wasEnded = m.game.phase === 'ended';
    if (fresh) { S.boardReady = false; }
    S.sel = null;
    if (S.mode === 'local') {
      // Hot-seat: "you" is whoever the pending decision belongs to (if human).
      var pd = m.game.pending;
      var humans = Local.humanIds();
      if (pd && pd.player && humans.indexOf(pd.player) >= 0) S.playerId = pd.player;
      else if (!S.playerId || humans.indexOf(S.playerId) < 0) S.playerId = humans[0] || null;
    }
    show('game');
    renderGame();
    Render.setSelectable([]);
  }
  function onError(m) {
    toast(m.msg || 'Error');
    if (m.fatal) { clearSession(); show('home'); }
  }
  Net.on('state', onState);
  Net.on('error', onError);
  Local.on('state', onState);
  Local.on('error', onError);

  Net.on('_open', function () {
    $('home-status').textContent = '';
    ['btn-create', 'btn-join', 'btn-bots'].forEach(function (id) { $(id).disabled = false; });
    $('online-note').classList.add('hidden');
    if (S.mode === 'local') return; // don't yank an offline game into a rejoin
    var sess = localStorage.getItem('hotels-session');
    if (sess) {
      try {
        var s = JSON.parse(sess);
        Net.send({ t: 'rejoin', code: s.code, token: s.token });
      } catch (e) { clearSession(); }
    }
  });
  Net.on('_close', function () {
    if (S.screen !== 'home') toast('Connection lost — reconnecting…');
  });

  /* ---------- home ---------- */
  $('name-input').value = localStorage.getItem('hotels-name') || '';
  $('name-input').addEventListener('change', function () {
    localStorage.setItem('hotels-name', myName());
  });
  var joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) $('code-input').value = joinParam.toUpperCase();

  $('btn-create').addEventListener('click', function () {
    clearSession();
    Net.send({ t: 'create', name: myName() });
  });
  $('btn-join').addEventListener('click', function () {
    var code = $('code-input').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Enter the 4-letter room code.');
    clearSession();
    Net.send({ t: 'join', code: code, name: myName() });
  });
  $('btn-bots').addEventListener('click', function () {
    clearSession();
    S.quickBots = true;
    Net.send({ t: 'create', name: myName() });
  });

  /* ---------- local (offline) game setup ---------- */
  $('btn-local').addEventListener('click', openLocalSetup);
  $('btn-local-cancel').addEventListener('click', function () {
    $('local-modal').classList.add('hidden');
  });

  function openLocalSetup() {
    var box = $('local-slots');
    box.innerHTML = '';
    var defaults = ['medium', 'none', 'none'];
    for (var i = 0; i < 4; i++) {
      var row = el('div', 'slot-row', null, box);
      var sw = el('span', 'swatch', null, row);
      sw.style.background = G.COLORS[i];
      if (i === 0) {
        el('span', 'slot-kind', 'You', row);
        var n0 = el('input', 'slot-name', null, row);
        n0.value = myName(); n0.maxLength = 12; n0.id = 'slot-name-0';
      } else {
        var sel = el('select', 'slot-kind', null, row);
        sel.id = 'slot-kind-' + i;
        [['none', '— Empty —'], ['easy', 'Easy bot'], ['medium', 'Medium bot'],
         ['hard', 'Hard bot'], ['human', 'Human (hot-seat)']].forEach(function (o) {
          var op = el('option', null, o[1], sel);
          op.value = o[0];
        });
        sel.value = defaults[i - 1];
        var ni = el('input', 'slot-name hidden', null, row);
        ni.id = 'slot-name-' + i; ni.maxLength = 12; ni.placeholder = 'Player ' + (i + 1);
        sel.addEventListener('change', (function (s, inp) {
          return function () { inp.classList.toggle('hidden', s.value !== 'human'); };
        })(sel, ni));
      }
    }
    $('local-modal').classList.remove('hidden');
  }

  $('btn-local-start').addEventListener('click', function () {
    var players = [{ name: ($('slot-name-0').value.trim() || 'Player'), bot: null }];
    for (var i = 1; i < 4; i++) {
      var kind = $('slot-kind-' + i).value;
      if (kind === 'none') continue;
      if (kind === 'human') {
        players.push({ name: ($('slot-name-' + i).value.trim() || 'Player ' + (i + 1)), bot: null });
      } else {
        var names = { easy: ['Sunny', 'Pebble'], medium: ['Marco', 'Vera'], hard: ['Magnus', 'Vex'] };
        var used = players.map(function (p) { return p.name; });
        var nm = (names[kind].filter(function (n) { return used.indexOf(n) < 0; })[0] ||
          'Bot ' + (i + 1)) + ' (' + kind + ')';
        players.push({ name: nm, bot: kind });
      }
    }
    if (players.length < 2) return toast('Add at least one opponent.');
    $('local-modal').classList.add('hidden');
    S.mode = 'local'; S.conn = Local;
    S.code = 'LOCAL'; S.playerId = null; S.localBidder = null;
    Local.start({ players: players });
  });

  /* ---------- lobby ---------- */
  function renderLobby() {
    var L = S.lobby;
    $('lobby-code').textContent = L.code;
    var box = $('lobby-players');
    box.innerHTML = '';
    L.players.forEach(function (p) {
      var row = el('div', 'lobby-player', null, box);
      var sw = el('span', 'swatch', null, row);
      sw.style.background = p.color;
      el('span', 'lp-name', p.name + (p.id === S.playerId ? ' (you)' : ''), row);
      if (p.bot) el('span', 'tag', 'BOT', row);
      if (p.host) el('span', 'tag host', 'HOST', row);
      if (!p.bot && !p.connected) el('span', 'tag off', 'OFFLINE', row);
      var iAmHost = L.players.some(function (x) { return x.id === S.playerId && x.host; });
      if (p.bot && iAmHost)
        btn('✕', 'mini danger', function () { Net.send({ t: 'removeBot', id: p.id }); }, row);
    });
    var iAmHost = L.players.some(function (x) { return x.id === S.playerId && x.host; });
    $('lobby-host').classList.toggle('hidden', !iAmHost);
    $('btn-start').disabled = L.players.length < 2;
    $('lobby-hint').textContent = iAmHost
      ? '2–4 players. Share the code or link with friends, or add bots.'
      : 'Waiting for the host to start the game…';
  }
  $('btn-addbot').addEventListener('click', function () {
    Net.send({ t: 'addBot', difficulty: $('bot-diff').value });
  });
  $('btn-start').addEventListener('click', function () { Net.send({ t: 'start' }); });
  $('btn-copy').addEventListener('click', function () {
    var url = location.origin + '/?join=' + S.code;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    toast('Invite link copied: ' + url);
  });
  $('btn-leave').addEventListener('click', function () {
    clearSession(); Net.send({ t: 'leave' }); location.reload();
  });

  /* ---------- game ---------- */
  function renderGame() {
    if (!S.boardReady) {
      Render.reset();
      Render.init($('board-wrap'), {
        onSquare: function (sq) {
          if (S.sel && S.sel.squares.indexOf(sq) >= 0) {
            var a = S.sel.make(sq);
            S.sel = null;
            Render.setSelectable([]);
            sendAction(a);
          }
        },
        onPlot: showDeed
      });
      S.boardReady = true;
    }
    Render.update(S.view);
    renderPlayers();
    renderDice();
    renderPrompt();
    renderLog();
    renderOverlay();
  }

  function renderPlayers() {
    var box = $('players');
    box.innerHTML = '';
    S.view.players.forEach(function (p) {
      var card = el('div', 'pcard' + (S.view.turn === p.id ? ' active' : '') +
        (p.alive ? '' : ' dead'), null, box);
      var img = document.createElement('img');
      img.src = Sprites.car(p.color).url;
      img.className = 'pix car-img';
      card.appendChild(img);
      var info = el('div', 'pinfo', null, card);
      el('div', 'pname', p.name +
        (S.mode === 'online' && p.id === S.playerId ? ' (you)' : '') +
        (p.bot ? ' 🤖' : ''), info);
      el('div', 'pcash', p.alive ? fmt(p.cash) : 'BANKRUPT', info);
      var hotels = el('div', 'photels', null, info);
      S.view.plots.forEach(function (pl, i) {
        if (pl.owner !== p.id) return;
        var chip = el('span', 'hchip', G.HOTELS[i].abbr +
          (pl.stages ? '·' + pl.stages : ''), hotels);
        chip.style.background = G.HOTELS[i].color;
        chip.title = G.HOTELS[i].name + ' — tap board plot for details';
      });
    });
  }

  function renderDice() {
    var v = S.view, html = '';
    if (v.lastRoll) {
      var rp = playerById(v.lastRoll.player);
      html += '<div class="die-box"><span class="die-label" style="color:' +
        rp.color + '">' + rp.name + '</span>' + dieSVG(v.lastRoll.value) + '</div>';
    }
    if (v.lastPerm) {
      html += '<div class="die-box"><span class="die-label">planning</span>' +
        permChip(v.lastPerm.face) + '</div>';
    }
    if (v.lastStay) {
      html += '<div class="die-box"><span class="die-label">last stay</span>' +
        '<span class="stay-chip">' + v.lastStay.nights + ' nights · ' +
        fmt(v.lastStay.owed) + '</span></div>';
    }
    $('dice-row').innerHTML = html;
  }

  var WAIT_DESC = {
    'roll': 'rolling the die', 'buy-land': 'eyeing a land deal',
    'choose-build': 'choosing what to build', 'permission-roll': 'at the planning office',
    'buy-entrances': 'shopping for entrances', 'free-entrance': 'placing a free entrance',
    'free-build': 'claiming a free build', 'stay-roll': 'checking in to a hotel',
    'raise-funds': 'scrambling to raise funds'
  };

  function renderPrompt() {
    var v = S.view, pd = v.pending, box = $('prompt');
    box.innerHTML = '';
    if (v.phase === 'ended') { el('div', 'wait', 'Game over!', box); return; }
    if (!pd) return;
    if (pd.type === 'auction') { el('div', 'wait', 'Auction in progress…', box); return; }
    var mine = pd.player === S.playerId;
    if (!mine) {
      var who = playerById(pd.player);
      el('div', 'wait', 'Waiting for ' + who.name + ' — ' +
        (WAIT_DESC[pd.type] || pd.type) + '…', box);
      return;
    }
    var m = me();

    switch (pd.type) {
      case 'roll': {
        var manyHumans = S.mode === 'local' && Local.humanIds().length > 1;
        el('div', 'prompt-title', manyHumans ? m.name + "'s turn!" : 'Your turn!', box);
        btn('🎲 ROLL', 'primary big', function () { sendAction({ t: 'roll' }); }, box);
        // facility offers
        S.view.plots.forEach(function (pl, i) {
          var h = G.HOTELS[i];
          if (pl.owner === S.playerId && pl.stages >= h.stages.length && !pl.facility) {
            var b = btn('Add ' + h.facility.name + ' to ' + h.name + ' — ' + fmt(h.facility.cost),
              'small', function () { sendAction({ t: 'buyFacility', plotId: i }); }, box);
            if (m.cash < h.facility.cost) b.disabled = true;
          }
        });
        break;
      }
      case 'buy-land': {
        var h1 = G.HOTELS[pd.plotId];
        el('div', 'prompt-title', (pd.compulsory ? 'Compulsory purchase! ' : '') +
          'Buy ' + h1.name + (pd.compulsory ? ' from ' + playerById(pd.toOwner).name : '') +
          ' for ' + fmt(pd.price) + '?', box);
        el('div', 'prompt-sub', '★'.repeat(h1.stars) + '  ·  top rate ' +
          fmt(h1.rates[h1.rates.length - 1]) + '/night — tap the plot for the full deed', box);
        var row1 = el('div', 'btn-row', null, box);
        btn('Buy', 'primary', function () { sendAction({ t: 'buy', yes: true }); }, row1);
        btn('Pass', '', function () { sendAction({ t: 'buy', yes: false }); }, row1);
        break;
      }
      case 'choose-build': {
        el('div', 'prompt-title', 'Planning office: choose a site', box);
        pd.sites.forEach(function (plotId) {
          var h = G.HOTELS[plotId], pl = S.view.plots[plotId];
          var sec = el('div', 'build-site', null, box);
          el('div', 'bs-name', h.name + ' (' + pl.stages + '/' + h.stages.length + ' built)', sec);
          var row = el('div', 'btn-row', null, sec);
          var cost = 0;
          for (var c = 1; c <= h.stages.length - pl.stages; c++) {
            cost += h.stages[pl.stages + c - 1];
            (function (count, cc) {
              var b = btn('+' + count + ' stage' + (count > 1 ? 's' : '') + ' ' + fmt(cc),
                'small', function () { sendAction({ t: 'build', plotId: plotId, count: count }); }, row);
              if (m.cash < cc) b.disabled = true;
            })(c, cost);
          }
        });
        btn('Skip building', '', function () { sendAction({ t: 'skip' }); }, box);
        break;
      }
      case 'permission-roll': {
        var h2 = G.HOTELS[pd.plotId];
        el('div', 'prompt-title', 'Apply to build at ' + h2.name + ' (' + fmt(pd.cost) + ')', box);
        el('div', 'prompt-sub', 'Green: pay & build · H: free · ×2: pay double · Red: denied', box);
        btn('🎲 Roll planning die', 'primary big', function () {
          sendAction({ t: 'rollPermission' });
        }, box);
        break;
      }
      case 'buy-entrances':
      case 'free-entrance': {
        var freebie = pd.type === 'free-entrance';
        el('div', 'prompt-title', freebie ? 'Free entrance! Pick a hotel:' :
          'City Hall: buy entrances (one per hotel)', box);
        pd.options.forEach(function (o) {
          var h = G.HOTELS[o.plotId];
          btn(h.name + (freebie ? ' — FREE' : ' — ' + fmt(o.cost)), 'small', function () {
            S.sel = {
              squares: o.squares,
              make: function (sq) { return { t: 'entrance', plotId: o.plotId, square: sq }; }
            };
            Render.setSelectable(o.squares);
            box.innerHTML = '';
            el('div', 'prompt-title', 'Tap a highlighted square beside ' + h.name, box);
            btn('Cancel', '', function () {
              S.sel = null; Render.setSelectable([]); renderPrompt();
            }, box);
          }, box);
        });
        btn(freebie ? 'No thanks' : 'Done / Skip', '', function () {
          sendAction({ t: 'skip' });
        }, box);
        break;
      }
      case 'free-build': {
        el('div', 'prompt-title', 'Free build! Choose:', box);
        pd.options.forEach(function (o) {
          btn(G.HOTELS[o.plotId].name + ': ' + o.label + ' (worth ' + fmt(o.value) + ')',
            'small', function () { sendAction({ t: 'freeBuild', plotId: o.plotId }); }, box);
        });
        btn('Skip', '', function () { sendAction({ t: 'skip' }); }, box);
        break;
      }
      case 'stay-roll': {
        var h3 = G.HOTELS[pd.plotId];
        el('div', 'prompt-title', 'You arrive at ' + playerById(pd.owner).name + "'s " +
          h3.name + '!', box);
        el('div', 'prompt-sub', 'Rate: ' + fmt(pd.rate) + ' per night. Roll for your stay…', box);
        btn('🎲 Roll nights', 'primary big', function () { sendAction({ t: 'rollStay' }); }, box);
        break;
      }
      case 'raise-funds': {
        el('div', 'prompt-title', 'You owe ' + fmt(pd.owed) +
          (pd.creditor ? ' to ' + playerById(pd.creditor).name : '') +
          ' and only have ' + fmt(m.cash) + '!', box);
        el('div', 'prompt-sub', 'Auction an asset (sold complete with buildings & entrances):', box);
        pd.assets.forEach(function (as) {
          btn(G.HOTELS[as.plotId].name + ' (value ' + fmt(as.value) + ')', 'small danger',
            function () { sendAction({ t: 'sell', plotId: as.plotId }); }, box);
        });
        break;
      }
    }
  }

  function renderLog() {
    var box = $('log');
    box.innerHTML = '';
    S.view.log.forEach(function (line) { el('div', 'log-line', line, box); });
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- overlays: auction + game over ---------- */
  function renderOverlay() {
    var ov = $('overlay');
    var v = S.view;
    clearInterval(S.auctionTimer);

    if (v.phase === 'ended') {
      ov.classList.remove('hidden');
      ov.innerHTML = '';
      var card = el('div', 'modal-card center', null, ov);
      var w = playerById(v.winner);
      el('div', 'winner-title', '🏆 ' + w.name + ' WINS! 🏆', card);
      el('p', 'muted', 'Last tycoon standing.', card);
      var row = el('div', 'btn-row center', null, card);
      btn('Play again', 'primary', function () { S.conn.send({ t: 'start' }); }, row);
      btn('Leave', '', function () {
        clearSession(); S.conn.send({ t: 'leave' }); location.reload();
      }, row);
      return;
    }

    var pd = v.pending;
    if (!pd || pd.type !== 'auction') { ov.classList.add('hidden'); ov.innerHTML = ''; return; }

    ov.classList.remove('hidden');
    ov.innerHTML = '';
    var h = G.HOTELS[pd.plotId];
    var seller = playerById(pd.seller);
    var c = el('div', 'modal-card center auction', null, ov);
    el('div', 'auction-title', '🔨 AUCTION: ' + h.name, c);
    el('p', 'prompt-sub', seller.name + ' must raise ' + fmt(pd.context.owed) +
      ' · asset value ' + fmt(pd.value), c);
    el('div', 'auction-bid', pd.high
      ? fmt(pd.high.amount) + ' — ' + playerById(pd.high.player).name
      : 'No bids yet', c);

    var bar = el('div', 'timer-bar', null, c);
    var fill = el('div', 'timer-fill', null, bar);
    var total = G.AUCTION_MS;
    S.auctionTimer = setInterval(function () {
      var left = Math.max(0, pd.deadline - Date.now());
      fill.style.width = (left / total * 100) + '%';
    }, 100);

    var bidder;
    if (S.mode === 'local') {
      var eligible = v.players.filter(function (p) {
        return p.alive && !p.bot && p.id !== pd.seller;
      });
      bidder = eligible.find(function (p) { return p.id === S.localBidder; }) || eligible[0];
      if (bidder) S.localBidder = bidder.id;
      if (eligible.length > 1) {
        var swRow = el('div', 'btn-row center', null, c);
        el('span', 'muted', 'Bidding as:', swRow);
        eligible.forEach(function (p) {
          var b = btn(p.name, 'mini' + (p.id === bidder.id ? ' primary' : ''), function () {
            S.localBidder = p.id; renderOverlay();
          }, swRow);
        });
      }
    } else {
      var m2 = me();
      bidder = (m2 && m2.alive && m2.id !== pd.seller) ? m2 : null;
    }

    if (bidder) {
      if (pd.high && pd.high.player === bidder.id) {
        el('p', 'prompt-sub good',
          (S.mode === 'local' ? bidder.name + ' is' : 'You are') + ' the highest bidder!', c);
      } else {
        var min = pd.high ? pd.high.amount + 50 : 50;
        var row = el('div', 'btn-row center', null, c);
        [min, min + 200, min + 500].forEach(function (amt) {
          var b = btn('Bid ' + fmt(amt), 'primary small', function () {
            sendActionAs(bidder.id, { t: 'bid', amount: amt });
          }, row);
          if (bidder.cash < amt) b.disabled = true;
        });
        btn('Pass', 'small', function () {
          sendActionAs(bidder.id, { t: 'pass' });
        }, row);
      }
    } else {
      var m3 = me();
      if (m3 && m3.id === pd.seller)
        el('p', 'prompt-sub', 'Your property is under the hammer…', c);
    }
  }

  /* ---------- deed modal ---------- */
  function showDeed(plotId) {
    var h = G.HOTELS[plotId];
    var pl = S.view ? S.view.plots[plotId] : null;
    var modal = $('deed-modal');
    modal.innerHTML = '';
    modal.classList.remove('hidden');
    var c = el('div', 'modal-card', null, modal);
    c.style.borderColor = h.color;
    el('h3', null, h.name + '  ' + '★'.repeat(h.stars), c);
    if (pl && pl.owner) {
      var ow = playerById(pl.owner);
      el('p', 'prompt-sub', 'Owned by ' + ow.name + ' · ' + pl.stages + '/' +
        h.stages.length + ' stages' + (pl.facility ? ' + ' + h.facility.name : '') +
        ' · ' + pl.entrances.length + ' entrance(s)', c);
    } else {
      el('p', 'prompt-sub', 'Unowned', c);
    }
    var tbl = el('table', 'deed-table', null, c);
    function tr(a, b2, hl) {
      var r = el('tr', hl ? 'hl' : null, null, tbl);
      el('td', null, a, r); el('td', 'num', b2, r);
    }
    tr('Land', fmt(h.land));
    h.stages.forEach(function (cost, i) { tr(G.STAGE_NAMES[i], fmt(cost)); });
    tr(h.facility.name + ' (facility)', fmt(h.facility.cost));
    tr('Each entrance', fmt(h.entrance));
    el('h4', null, 'Nightly rate (× die roll)', c);
    var tbl2 = el('table', 'deed-table', null, c);
    h.rates.forEach(function (rate, i) {
      var lvl = i < h.stages.length ? (i + 1) + ' stage' + (i ? 's' : '') : 'fully built + facility';
      var cur = pl && pl.stages && (pl.stages - 1 + (pl.facility ? 1 : 0)) === i;
      var r = el('tr', cur ? 'hl' : null, null, tbl2);
      el('td', null, lvl, r); el('td', 'num', fmt(rate) + '/night', r);
    });
    btn('Close', 'primary', function () { modal.classList.add('hidden'); }, c);
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) modal.classList.add('hidden');
    });
  }

  /* ---------- misc buttons ---------- */
  function openRules() { $('rules-modal').classList.remove('hidden'); }
  $('btn-rules-home').addEventListener('click', openRules);
  $('btn-rules-game').addEventListener('click', openRules);
  $('btn-rules-close').addEventListener('click', function () {
    $('rules-modal').classList.add('hidden');
  });
  $('btn-quit').addEventListener('click', function () {
    var msg = S.mode === 'local'
      ? 'Leave the game? Offline games are not saved.'
      : 'Leave the game? (You can rejoin from this browser while it runs.)';
    if (confirm(msg)) {
      if (S.mode === 'local') Local.send({ t: 'leave' });
      location.reload();
    }
  });

  /* ---------- boot ---------- */
  var isPages = /\.github\.io$/.test(location.hostname) || location.protocol === 'file:';
  function disableOnline(note) {
    ['btn-create', 'btn-join', 'btn-bots'].forEach(function (id) { $(id).disabled = true; });
    var n = $('online-note');
    n.textContent = note;
    n.classList.remove('hidden');
  }
  if (isPages) {
    disableOnline('Online rooms need the Node server — clone the repo and run "npm start". ' +
      'Bots & hot-seat play work right here!');
  } else {
    $('home-status').textContent = 'Connecting…';
    setTimeout(function () {
      if (!Net.connected()) {
        $('home-status').textContent = '';
        disableOnline('Game server not reachable — offline play still works.');
      }
    }, 4000);
    Net.start();
  }
})();
