/* Authoritative rules engine for Hotels. Runs on the Node server (online
   games) and in the browser (offline bots / hot-seat games). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports)
    module.exports = factory(require('./gamedata.js'));
  else root.ENGINE = factory(root.GAMEDATA);
})(typeof self !== 'undefined' ? self : this, function (G) {
'use strict';

const PERM_FACES = ['green', 'green', 'green', 'red', 'free', 'double'];
const fmt = G.fmt;

class Game {
  constructor(players, rng) {
    this.rng = rng || Math.random;
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, bot: p.bot || null, color: G.COLORS[i],
      pos: 0, cash: G.START_CASH, alive: true, turns: 0
    }));
    this.plots = G.HOTELS.map(() => ({
      owner: null, stages: 0, facility: 0, entrances: [], boughtOnTurn: -1
    }));
    this.turn = 0;
    this.phase = 'rolloff';
    this.winner = null;
    this.rolloff = { queue: [this.players.map(p => p.id)], rolls: {}, ranking: [] };
    this.turnOrder = null;
    this.orderSeq = 0;
    this.history = [];
    this.queue = [];
    this.pending = null;
    this.log = [];
    this.seq = 0;            // bumped on every successful action (timer guards)
    this.speed = 1;          // bot pacing multiplier (1 or 3)
    this.rollSeq = 0;
    this.permSeq = 0;
    this.lastRoll = null;
    this.lastPerm = null;
    this.lastStay = null;
    this.boughtDeed = false;
    this.rolledSix = false;
    this.addLog('The game begins! ' + this.players.map(p => p.name).join(', ') +
      ' each start with ' + fmt(G.START_CASH) + '.');
    this.addLog('Everyone rolls to see who goes first — highest leads off!');
    this.nextOrderRoll();
  }

  /* ---------- pre-game roll-off ---------- */
  nextOrderRoll() {
    const ro = this.rolloff;
    while (ro.queue.length) {
      const group = ro.queue[0];
      if (group.length === 1) { ro.ranking.push(group[0]); ro.queue.shift(); continue; }
      const unrolled = group.find(id => ro.rolls[id] === undefined);
      if (unrolled !== undefined) {
        this.pending = { type: 'order-roll', player: unrolled,
          group: group.slice(), rolls: Object.assign({}, ro.rolls),
          ranking: ro.ranking.slice() };
        return;
      }
      // everyone in the group rolled: split by value, ties re-roll among themselves
      const byVal = {};
      group.forEach(id => {
        (byVal[ro.rolls[id]] = byVal[ro.rolls[id]] || []).push(id);
      });
      const sub = Object.keys(byVal).map(Number).sort((a, b) => b - a)
        .map(v => byVal[v]);
      sub.forEach(s => {
        if (s.length > 1)
          this.addLog('Tie! ' + s.map(id => this.byId(id).name).join(' & ') + ' roll again.');
      });
      ro.queue.shift();
      ro.queue = sub.concat(ro.queue);
      group.forEach(id => { delete ro.rolls[id]; });
    }
    this.finishRolloff();
  }

  finishRolloff() {
    const order = this.rolloff.ranking;
    this.players.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    this.turn = 0;
    this.phase = 'playing';
    this.rolloff = null;
    this.orderSeq++;
    this.turnOrder = order.slice();
    this.addLog('Turn order: ' +
      order.map(id => this.byId(id).name).join(' → ') + '. ' +
      this.byId(order[0]).name + ' goes first!');
    this.sampleHistory();
    this.startTurn();
  }

  netWorth(p) {
    if (!p.alive) return 0;
    let w = p.cash;
    this.plots.forEach((pl, i) => { if (pl.owner === p.id) w += this.plotValue(i); });
    return w;
  }

  sampleHistory() {
    this.history.push(this.players.map(p => this.netWorth(p)));
    if (this.history.length > 1200)
      this.history = this.history.filter((row, i) => i % 2 === 0);
  }

  /* ---------- helpers ---------- */
  cur() { return this.players[this.turn]; }
  byId(id) { return this.players.find(p => p.id === id); }
  addLog(msg) { this.log.push(msg); if (this.log.length > 150) this.log.shift(); }
  roll() { return 1 + Math.floor(this.rng() * 6); }
  ok() { this.seq++; return { ok: true }; }
  err(msg) { return { ok: false, error: msg }; }
  occupied(sq) { return this.players.some(p => p.alive && p.pos === sq); }

  rateOf(plotId) {
    const pl = this.plots[plotId];
    if (pl.stages === 0) return 0;
    return G.HOTELS[plotId].rates[pl.stages - 1 + pl.facility];
  }

  plotValue(plotId) {
    const pl = this.plots[plotId], h = G.HOTELS[plotId];
    let v = h.land;
    for (let i = 0; i < pl.stages; i++) v += h.stages[i];
    for (let i = 0; i < pl.facility; i++) v += h.facilities[i].cost;
    v += pl.entrances.length * h.entrance;
    return v;
  }

  entranceAtSq(sq) {
    for (let i = 0; i < this.plots.length; i++)
      if (this.plots[i].entrances.indexOf(sq) >= 0) return i;
    return null;
  }

  /* Plots the player may build a stage on (land must rest one turn after purchase) */
  buildableSites(p) {
    const res = [];
    this.plots.forEach((pl, i) => {
      if (pl.owner !== p.id) return;
      if (pl.stages >= G.HOTELS[i].stages.length) return;
      if (pl.boughtOnTurn >= p.turns) return;
      res.push(i);
    });
    return res;
  }

  /* Hotels with a main building and at least one free adjacent square */
  entranceOptions(p) {
    const res = [];
    this.plots.forEach((pl, i) => {
      if (pl.owner !== p.id || pl.stages < 1) return;
      const squares = G.PLOT_SQUARES[i].filter(s => this.entranceAtSq(s) === null);
      if (squares.length) res.push({ plotId: i, cost: G.HOTELS[i].entrance, squares });
    });
    return res;
  }

  /* Land deals available to p across a set of plots (one square can border two
     facing plots — both unowned, or one ownable via compulsory purchase). */
  landOptions(p, plotIds) {
    const res = [];
    (plotIds || []).forEach(plotId => {
      if (plotId === undefined) return;
      const pl = this.plots[plotId], h = G.HOTELS[plotId];
      if (pl.owner === null) {
        if (p.cash >= h.land) res.push({ plotId, price: h.land, toOwner: null });
      } else if (pl.owner !== p.id && pl.stages === 0) {
        const price = Math.round(h.land / 2 / 50) * 50;
        if (p.cash >= price) res.push({ plotId, price, toOwner: pl.owner, compulsory: true });
      }
    });
    return res;
  }

  freeBuildOptions(p) {
    const res = [];
    this.plots.forEach((pl, i) => {
      const h = G.HOTELS[i];
      if (pl.owner !== p.id) return;
      if (pl.stages < h.stages.length) {
        if (pl.boughtOnTurn < p.turns)
          res.push({ plotId: i, what: 'stage', label: G.STAGE_NAMES[pl.stages], value: h.stages[pl.stages] });
      } else if (pl.facility < h.facilities.length) {
        const fac = h.facilities[pl.facility];
        res.push({ plotId: i, what: 'facility', label: fac.name, value: fac.cost });
      }
    });
    return res;
  }

  /* ---------- turn flow ---------- */
  startTurn() {
    this.sampleHistory();
    const p = this.cur();
    p.turns++;
    this.boughtDeed = false;
    this.rolledSix = false;
    this.pending = { type: 'roll', player: p.id };
  }

  endTurn() {
    this.pending = null;
    if (this.phase === 'ended') return;
    const p = this.cur();
    if (this.rolledSix && p.alive) { this.startTurn(); return; }
    let n = this.turn;
    do { n = (n + 1) % this.players.length; } while (!this.players[n].alive);
    this.turn = n;
    this.startTurn();
  }

  advance() {
    if (this.phase === 'ended') { this.pending = null; return; }
    const p = this.cur();
    while (this.queue.length) {
      const item = this.queue.shift();
      const pend = this.preparePending(item, p);
      if (pend) { this.pending = pend; return; }
    }
    this.endTurn();
  }

  preparePending(item, p) {
    switch (item.type) {
      case 'buy-entrances': {
        const options = this.entranceOptions(p).filter(o => o.cost <= p.cash);
        if (!options.length) return null;
        return { type: 'buy-entrances', player: p.id, options };
      }
      case 'buy-land': {
        if (this.boughtDeed || p.cash < item.price) return null;
        const pl = this.plots[item.plotId];
        if (item.toOwner === null && pl.owner !== null) return null;
        if (item.toOwner !== null && (pl.owner !== item.toOwner || pl.stages > 0)) return null;
        return { type: 'buy-land', player: p.id, plotId: item.plotId, price: item.price,
                 toOwner: item.toOwner, compulsory: !!item.compulsory };
      }
      case 'choose-land': {
        if (this.boughtDeed) return null;
        const options = this.landOptions(p, item.plotIds);
        if (!options.length) return null;
        if (options.length === 1) {
          const o = options[0];
          return { type: 'buy-land', player: p.id, plotId: o.plotId, price: o.price,
                   toOwner: o.toOwner, compulsory: !!o.compulsory };
        }
        return { type: 'choose-land', player: p.id, options };
      }
      case 'choose-build': {
        const sites = this.buildableSites(p);
        if (!sites.length) return null;
        return { type: 'choose-build', player: p.id, sites };
      }
      case 'free-entrance': {
        const options = this.entranceOptions(p);
        if (!options.length) return null;
        return { type: 'free-entrance', player: p.id, options };
      }
      case 'free-build': {
        const options = this.freeBuildOptions(p);
        if (!options.length) return null;
        return { type: 'free-build', player: p.id, options };
      }
      case 'stay-roll': {
        const pl = this.plots[item.plotId];
        if (pl.owner === null || pl.owner === p.id || pl.stages === 0) return null;
        return { type: 'stay-roll', player: p.id, plotId: item.plotId,
                 rate: this.rateOf(item.plotId), owner: pl.owner };
      }
    }
    return null;
  }

  /* ---------- the move ---------- */
  doRoll(p) {
    const r = this.roll();
    this.rollSeq++;
    this.lastRoll = { seq: this.rollSeq, player: p.id, value: r };
    this.rolledSix = (r === 6);
    let sq = p.pos;
    const passed = [];
    for (let i = 0; i < r; i++) { sq = (sq + 1) % G.TRACK.length; passed.push(sq); }
    while (this.occupied(sq)) { sq = (sq + 1) % G.TRACK.length; passed.push(sq); }
    p.pos = sq;
    this.addLog(p.name + ' rolls a ' + r + (r === 6 ? ' — extra turn!' : '') + '.');

    let cityhall = false;
    for (const s of passed) {
      const t = G.SPECIALS[s];
      if (t === 'bank' && this.players.length > 2) {
        p.cash += G.BANK_BONUS;
        this.addLog(p.name + ' collects ' + fmt(G.BANK_BONUS) + ' passing the Bank.');
      }
      if (t === 'cityhall') cityhall = true;
    }

    this.queue = [];
    if (cityhall && this.entranceOptions(p).length)
      this.queue.push({ type: 'buy-entrances' });
    this.queueLanding(p, sq);
    this.advance();
  }

  queueLanding(p, sq) {
    const entPlot = this.entranceAtSq(sq);
    if (entPlot !== null) {
      const pl = this.plots[entPlot];
      if (pl.owner !== null && pl.owner !== p.id)
        this.queue.push({ type: 'stay-roll', plotId: entPlot });
      else
        this.addLog(p.name + ' relaxes at their own ' + G.HOTELS[entPlot].name + '.');
      return;
    }
    const t = G.SPECIALS[sq];
    if (!t) {
      if (this.boughtDeed) return;
      const plotIds = G.SHARED[sq] ||
        (G.SQUARE_PLOT[sq] !== undefined ? [G.SQUARE_PLOT[sq]] : []);
      if (plotIds.length) this.queue.push({ type: 'choose-land', plotIds });
      return;
    }
    if (t === 'permission') {
      if (this.buildableSites(p).length) this.queue.push({ type: 'choose-build' });
    } else if (t === 'free-entrance') {
      if (this.entranceOptions(p).length) this.queue.push({ type: 'free-entrance' });
    } else if (t === 'free-build') {
      if (this.freeBuildOptions(p).length) this.queue.push({ type: 'free-build' });
    }
  }

  /* ---------- actions ---------- */
  act(pid, a) {
    if (this.phase === 'rolloff') {
      const pd = this.pending;
      if (!pd || pd.type !== 'order-roll') return this.err('Hold on…');
      if (pd.player !== pid) return this.err('Not your roll.');
      if (a.t !== 'orderRoll') return this.err('Roll the die.');
      const r = this.roll();
      this.rollSeq++;
      this.lastRoll = { seq: this.rollSeq, player: pid, value: r };
      this.rolloff.rolls[pid] = r;
      this.addLog(this.byId(pid).name + ' rolls a ' + r + ' for turn order.');
      this.seq++;
      this.nextOrderRoll();
      return { ok: true };
    }
    if (this.phase !== 'playing') return this.err('The game is over.');
    const pd = this.pending;
    if (!pd) return this.err('Nothing to do right now.');
    const p = this.byId(pid);
    if (!p || !p.alive) return this.err('You are not in the game.');

    if (pd.type === 'auction') return this.actAuction(p, a);

    if (a.t === 'buyFacility') {
      if (pd.type !== 'roll' || pd.player !== pid) return this.err('You can only buy a facility at the start of your turn.');
      return this.buyFacility(p, a.plotId);
    }

    if (pd.player !== pid) return this.err('Not your move.');

    switch (pd.type) {
      case 'roll':
        if (a.t !== 'roll') return this.err('Roll the die.');
        this.doRoll(p);
        return this.ok();

      case 'buy-land': {
        if (a.t === 'skip' || (a.t === 'buy' && !a.yes)) {
          this.addLog(p.name + ' passes on ' + G.HOTELS[pd.plotId].name + '.');
          this.advance(); return this.ok();
        }
        if (a.t !== 'buy') return this.err('Buy or pass.');
        if (this.boughtDeed) return this.err('Only one deed per turn.');
        if (p.cash < pd.price) return this.err('Not enough cash.');
        p.cash -= pd.price;
        const pl = this.plots[pd.plotId];
        if (pd.toOwner !== null) {
          const prev = this.byId(pd.toOwner);
          prev.cash += pd.price;
          this.addLog(p.name + ' compulsorily purchases ' + G.HOTELS[pd.plotId].name +
            ' from ' + prev.name + ' for ' + fmt(pd.price) + ' (half price).');
        } else {
          this.addLog(p.name + ' buys the land for ' + G.HOTELS[pd.plotId].name +
            ' for ' + fmt(pd.price) + '.');
        }
        pl.owner = p.id;
        pl.boughtOnTurn = p.turns;
        this.boughtDeed = true;
        this.advance(); return this.ok();
      }

      case 'choose-land': {
        if (a.t === 'skip') {
          this.addLog(p.name + ' passes on this corner.');
          this.advance(); return this.ok();
        }
        if (a.t !== 'choose') return this.err('Choose a property or skip.');
        const opt = pd.options.find(o => o.plotId === a.plotId);
        if (!opt) return this.err('Not one of the offered plots.');
        this.pending = Object.assign({ type: 'buy-land', player: p.id }, opt);
        return this.ok();
      }

      case 'choose-build': {
        if (a.t === 'skip') { this.addLog(p.name + ' decides not to build.'); this.advance(); return this.ok(); }
        if (a.t !== 'build') return this.err('Choose a site or skip.');
        if (pd.sites.indexOf(a.plotId) < 0) return this.err('Not a buildable site.');
        const pl = this.plots[a.plotId], h = G.HOTELS[a.plotId];
        const remaining = h.stages.length - pl.stages;
        const count = a.count | 0;
        if (count < 1 || count > remaining) return this.err('Bad stage count.');
        let cost = 0;
        for (let i = 0; i < count; i++) cost += h.stages[pl.stages + i];
        if (p.cash < cost) return this.err('Not enough cash for that.');
        this.pending = { type: 'permission-roll', player: p.id, plotId: a.plotId, count, cost };
        return this.ok();
      }

      case 'permission-roll': {
        if (a.t !== 'rollPermission') return this.err('Roll the planning die.');
        const face = PERM_FACES[Math.floor(this.rng() * 6)];
        const pl = this.plots[pd.plotId], h = G.HOTELS[pd.plotId];
        const what = pd.count === 1 ? G.STAGE_NAMES[pl.stages] : pd.count + ' stages';
        let built = false, paid = 0;
        if (face === 'red') {
          this.addLog('Planning permission DENIED for ' + h.name + '. No building this time.');
        } else if (face === 'free') {
          pl.stages += pd.count;
          built = true;
          this.addLog('Jackpot! The council builds the ' + what + ' at ' + h.name + ' for FREE.');
        } else if (face === 'double') {
          if (p.cash >= pd.cost * 2) {
            p.cash -= pd.cost * 2;
            paid = pd.cost * 2;
            pl.stages += pd.count;
            built = true;
            this.addLog('Permission granted at DOUBLE cost: ' + p.name + ' pays ' +
              fmt(pd.cost * 2) + ' to build the ' + what + ' at ' + h.name + '.');
          } else {
            this.addLog('Double cost demanded (' + fmt(pd.cost * 2) + ') — ' + p.name +
              ' cannot afford it. Building cancelled.');
          }
        } else { // green
          p.cash -= pd.cost;
          paid = pd.cost;
          pl.stages += pd.count;
          built = true;
          this.addLog('Permission granted! ' + p.name + ' pays ' + fmt(pd.cost) +
            ' to build the ' + what + ' at ' + h.name + '.');
        }
        this.permSeq++;
        this.lastPerm = { seq: this.permSeq, player: p.id, face, plotId: pd.plotId,
          count: pd.count, cost: pd.cost, paid, built, what,
          complete: pl.stages >= h.stages.length && built };
        if (pl.stages >= h.stages.length && built)
          this.addLog(h.name + ' is fully built! (' + '★'.repeat(h.stars) + ')');
        this.advance(); return this.ok();
      }

      case 'buy-entrances': {
        if (a.t === 'skip') { this.advance(); return this.ok(); }
        if (a.t !== 'entrance') return this.err('Pick an entrance or skip.');
        const opt = pd.options.find(o => o.plotId === a.plotId);
        if (!opt) return this.err('That hotel cannot take an entrance now.');
        if (opt.squares.indexOf(a.square) < 0 || this.entranceAtSq(a.square) !== null)
          return this.err('Square not available.');
        if (p.cash < opt.cost) return this.err('Not enough cash.');
        p.cash -= opt.cost;
        this.plots[a.plotId].entrances.push(a.square);
        this.addLog(p.name + ' buys an entrance for ' + G.HOTELS[a.plotId].name +
          ' (' + fmt(opt.cost) + ').');
        pd.options = pd.options.filter(o => o.plotId !== a.plotId && o.cost <= p.cash);
        pd.options.forEach(o => { o.squares = o.squares.filter(s => this.entranceAtSq(s) === null); });
        pd.options = pd.options.filter(o => o.squares.length);
        if (!pd.options.length) this.advance();
        return this.ok();
      }

      case 'free-entrance': {
        if (a.t === 'skip') { this.advance(); return this.ok(); }
        if (a.t !== 'entrance') return this.err('Pick an entrance or skip.');
        const opt = pd.options.find(o => o.plotId === a.plotId);
        if (!opt) return this.err('That hotel cannot take an entrance.');
        if (opt.squares.indexOf(a.square) < 0 || this.entranceAtSq(a.square) !== null)
          return this.err('Square not available.');
        this.plots[a.plotId].entrances.push(a.square);
        this.addLog(p.name + ' places a FREE entrance for ' + G.HOTELS[a.plotId].name + '.');
        this.advance(); return this.ok();
      }

      case 'free-build': {
        if (a.t === 'skip') { this.advance(); return this.ok(); }
        if (a.t !== 'freeBuild') return this.err('Pick what to build or skip.');
        const opt = pd.options.find(o => o.plotId === a.plotId);
        if (!opt) return this.err('Not an option.');
        const pl = this.plots[a.plotId];
        if (opt.what === 'stage') pl.stages++;
        else pl.facility++;
        this.addLog(p.name + ' builds the ' + opt.label + ' at ' +
          G.HOTELS[a.plotId].name + ' for FREE.');
        this.advance(); return this.ok();
      }

      case 'stay-roll': {
        if (a.t !== 'rollStay') return this.err('Roll for your stay.');
        const nights = this.roll();
        const rate = this.rateOf(pd.plotId);
        const owed = nights * rate;
        const owner = this.byId(this.plots[pd.plotId].owner);
        this.staySeq = (this.staySeq || 0) + 1;
        this.lastStay = { seq: this.staySeq, player: p.id, owner: owner.id,
          plotId: pd.plotId, nights, rate, owed, covered: p.cash >= owed };
        this.addLog(p.name + ' checks in at ' + G.HOTELS[pd.plotId].name + ' for ' +
          nights + ' night' + (nights > 1 ? 's' : '') + ' — the bill is ' + fmt(owed) + '.');
        this.seq++;
        this.charge(p, owed, owner);
        return { ok: true };
      }

      case 'raise-funds': {
        if (a.t !== 'sell') return this.err('Choose an asset to auction.');
        if (!pd.assets.some(as => as.plotId === a.plotId)) return this.err('You do not own that.');
        this.startAuction(p, a.plotId, { owed: pd.owed, creditor: pd.creditor });
        return this.ok();
      }
    }
    return this.err('Bad action.');
  }

  buyFacility(p, plotId) {
    const pl = this.plots[plotId];
    if (!pl || pl.owner !== p.id) return this.err('Not your hotel.');
    const h = G.HOTELS[plotId];
    if (pl.stages < h.stages.length) return this.err('Hotel must be fully built first.');
    if (pl.facility >= h.facilities.length) return this.err('All facilities built.');
    const fac = h.facilities[pl.facility];
    if (p.cash < fac.cost) return this.err('Not enough cash.');
    p.cash -= fac.cost;
    pl.facility++;
    this.addLog(p.name + ' adds the ' + fac.name + ' to ' + h.name +
      ' for ' + fmt(fac.cost) + '.');
    return this.ok();
  }

  /* ---------- debt, auctions, bankruptcy ---------- */
  charge(p, owed, creditor) {
    if (p.cash >= owed) {
      p.cash -= owed;
      if (creditor) {
        creditor.cash += owed;
        this.addLog(p.name + ' pays ' + fmt(owed) + ' to ' + creditor.name + '.');
      }
      this.advance();
      return;
    }
    const assets = this.plots
      .map((pl, i) => (pl.owner === p.id ? i : -1))
      .filter(i => i >= 0);
    if (!assets.length) { this.bankrupt(p, creditor); return; }
    this.addLog(p.name + ' cannot pay ' + fmt(owed) + ' and must auction assets!');
    this.pending = {
      type: 'raise-funds', player: p.id, owed,
      creditor: creditor ? creditor.id : null,
      assets: assets.map(i => ({ plotId: i, value: this.plotValue(i) }))
    };
  }

  startAuction(seller, plotId, context) {
    this.addLog(seller.name + ' puts ' + G.HOTELS[plotId].name +
      ' up for auction (complete with buildings and entrances)!');
    this.pending = {
      type: 'auction', player: null, seller: seller.id, plotId,
      value: this.plotValue(plotId), high: null, passed: [],
      deadline: Date.now() + Math.round(G.AUCTION_MS / this.speed), context
    };
  }

  /* True when no human can still bid — fast-forwarding is then fair game. */
  auctionHumansDone() {
    const pd = this.pending;
    if (!pd || pd.type !== 'auction') return false;
    const min = pd.high ? pd.high.amount + 50 : 50;
    return !this.players.some(p =>
      !p.bot && p.alive && p.id !== pd.seller &&
      (!pd.high || pd.high.player !== p.id) &&
      pd.passed.indexOf(p.id) < 0 && p.cash >= min);
  }

  /* Let the bots slug it out instantly, then settle the auction. */
  resolveAuctionWithBots(decide) {
    let guard = 0;
    while (this.pending && this.pending.type === 'auction' && guard++ < 500) {
      let acted = false;
      for (const p of this.players) {
        const pd = this.pending;
        if (!pd || pd.type !== 'auction') break;
        if (!p.bot || !p.alive || p.id === pd.seller) continue;
        if (pd.high && pd.high.player === p.id) continue;
        if (pd.passed.indexOf(p.id) >= 0) continue;
        const a = decide(this, p);
        if (a) {
          const r = this.actAuction(p, a);
          if (r.ok) acted = true;
        }
      }
      if (!acted) {
        if (this.pending && this.pending.type === 'auction') this.finishAuction();
        break;
      }
    }
  }

  actAuction(p, a) {
    const pd = this.pending;
    if (p.id === pd.seller) return this.err('You cannot bid on your own auction.');
    if (a.t === 'pass') {
      if (pd.passed.indexOf(p.id) < 0) pd.passed.push(p.id);
      this.seq++;
      if (!this.biddersLeft()) this.finishAuction();
      return { ok: true };
    }
    if (a.t !== 'bid') return this.err('Bid or pass.');
    const amount = Math.round((a.amount | 0) / 50) * 50;
    const min = pd.high ? pd.high.amount + 50 : 50;
    if (amount < min) return this.err('Bid at least ' + fmt(min) + '.');
    if (p.cash < amount) return this.err('You cannot afford that bid.');
    pd.high = { player: p.id, amount };
    pd.passed = pd.passed.filter(id => id !== p.id);
    pd.deadline = Date.now() + Math.round(G.AUCTION_MS / this.speed);
    this.addLog(p.name + ' bids ' + fmt(amount) + ' for ' + G.HOTELS[pd.plotId].name + '.');
    this.seq++;
    return { ok: true };
  }

  biddersLeft() {
    const pd = this.pending;
    return this.players.some(p =>
      p.alive && p.id !== pd.seller &&
      (!pd.high || pd.high.player !== p.id) &&
      pd.passed.indexOf(p.id) < 0 &&
      p.cash >= (pd.high ? pd.high.amount + 50 : 50));
  }

  finishAuction() {
    const pd = this.pending;
    if (!pd || pd.type !== 'auction') return;
    const seller = this.byId(pd.seller);
    const pl = this.plots[pd.plotId];
    const h = G.HOTELS[pd.plotId];
    if (pd.high) {
      const buyer = this.byId(pd.high.player);
      buyer.cash -= pd.high.amount;
      seller.cash += pd.high.amount;
      pl.owner = buyer.id;
      pl.boughtOnTurn = -1;
      this.addLog('SOLD! ' + buyer.name + ' wins ' + h.name + ' for ' + fmt(pd.high.amount) + '.');
    } else {
      const refund = Math.round(h.land / 2 / 50) * 50;
      seller.cash += refund;
      pl.owner = null; pl.stages = 0; pl.facility = 0;
      pl.entrances = []; pl.boughtOnTurn = -1;
      this.addLog('No bids — the bank reclaims ' + h.name + ' and pays ' + seller.name +
        ' a token ' + fmt(refund) + '. The buildings are demolished.');
    }
    const ctx = pd.context;
    this.pending = null;
    this.seq++;
    this.charge(seller, ctx.owed, ctx.creditor ? this.byId(ctx.creditor) : null);
  }

  bankrupt(p, creditor) {
    if (p.cash > 0 && creditor) creditor.cash += p.cash;
    p.cash = 0;
    this.plots.forEach(pl => {
      if (pl.owner === p.id) {
        pl.owner = null; pl.stages = 0; pl.facility = 0;
        pl.entrances = []; pl.boughtOnTurn = -1;
      }
    });
    p.alive = false;
    this.addLog('💥 ' + p.name + ' is BANKRUPT and out of the game!');
    this.sampleHistory();
    const alive = this.players.filter(x => x.alive);
    if (alive.length === 1) {
      this.phase = 'ended';
      this.winner = alive[0].id;
      this.pending = null;
      this.queue = [];
      this.addLog('🏆 ' + alive[0].name + ' is the last tycoon standing and WINS!');
      return;
    }
    this.queue = [];
    this.rolledSix = false;
    this.endTurn();
  }

  /* ---------- snapshot sent to clients ---------- */
  view() {
    return {
      phase: this.phase,
      winner: this.winner,
      speed: this.speed,
      turn: this.cur() ? this.cur().id : null,
      players: this.players.map(p => ({
        id: p.id, name: p.name, bot: p.bot, color: p.color,
        pos: p.pos, cash: p.cash, alive: p.alive, turns: p.turns,
        worth: this.netWorth(p)
      })),
      turnOrder: this.turnOrder,
      orderSeq: this.orderSeq,
      history: this.phase === 'ended' ? this.history : null,
      plots: this.plots.map(pl => ({
        owner: pl.owner, stages: pl.stages, facility: pl.facility,
        entrances: pl.entrances.slice(), boughtOnTurn: pl.boughtOnTurn
      })),
      pending: this.pending,
      lastRoll: this.lastRoll,
      lastPerm: this.lastPerm,
      lastStay: this.lastStay,
      log: this.log.slice(-50)
    };
  }
}


return { Game: Game, PERM_FACES: PERM_FACES };
});
