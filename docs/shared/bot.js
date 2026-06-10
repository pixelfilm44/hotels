/* AI decision-making. decide(game, player) returns one action for the
   current pending state, or null if the bot has nothing to do. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports)
    module.exports = factory(require('./gamedata.js'));
  else root.BOT = factory(root.GAMEDATA);
})(typeof self !== 'undefined' ? self : this, function (G) {
'use strict';

const PROFILES = {
  easy:   { reserve: 400,  buyChance: 0.55, entranceChance: 0.6, maxStages: 1, bidFactor: 0.55, doubleSafety: 1.0 },
  medium: { reserve: 1200, buyChance: 0.95, entranceChance: 1.0, maxStages: 2, bidFactor: 0.85, doubleSafety: 1.2 },
  hard:   { reserve: 800,  buyChance: 1.0,  entranceChance: 1.0, maxStages: 4, bidFactor: 1.05, doubleSafety: 1.5 }
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function decide(game, player) {
  const pd = game.pending;
  if (!pd) return null;
  const prof = PROFILES[player.bot] || PROFILES.easy;

  if (pd.type === 'auction') return decideAuction(game, player, prof);
  if (pd.player !== player.id) return null;

  switch (pd.type) {
    case 'roll': {
      // Consider buying a leisure facility before rolling (no permission needed).
      if (player.bot !== 'easy' || Math.random() < 0.4) {
        for (let i = 0; i < game.plots.length; i++) {
          const pl = game.plots[i], h = G.HOTELS[i];
          if (pl.owner === player.id && pl.stages >= h.stages.length && !pl.facility &&
              player.cash - h.facility.cost >= prof.reserve)
            return { t: 'buyFacility', plotId: i };
        }
      }
      return { t: 'roll' };
    }

    case 'buy-land': {
      const afford = player.cash - pd.price >= (pd.compulsory ? prof.reserve / 2 : prof.reserve);
      const wants = pd.compulsory ? true : Math.random() < prof.buyChance;
      return { t: 'buy', yes: afford && wants };
    }

    case 'choose-build': {
      // Score each site by rate gain per dollar; build as many stages as is safe.
      let best = null;
      for (const plotId of pd.sites) {
        const pl = game.plots[plotId], h = G.HOTELS[plotId];
        const remaining = h.stages.length - pl.stages;
        for (let count = Math.min(remaining, prof.maxStages); count >= 1; count--) {
          let cost = 0;
          for (let i = 0; i < count; i++) cost += h.stages[pl.stages + i];
          if (player.cash < cost * prof.doubleSafety || player.cash - cost < prof.reserve / 2) continue;
          const oldRate = pl.stages ? h.rates[pl.stages - 1] : 0;
          const newRate = h.rates[pl.stages + count - 1];
          const score = (newRate - oldRate) / cost +
            (pl.stages === 0 ? 0.2 : 0); // getting a main building unlocks entrances
          if (!best || score > best.score) best = { plotId, count, score };
        }
      }
      if (best) return { t: 'build', plotId: best.plotId, count: best.count };
      return { t: 'skip' };
    }

    case 'permission-roll':
      return { t: 'rollPermission' };

    case 'buy-entrances': {
      if (Math.random() > prof.entranceChance) return { t: 'skip' };
      // Highest nightly rate first.
      const opts = pd.options
        .filter(o => player.cash - o.cost >= prof.reserve / 2)
        .sort((a, b) => game.rateOf(b.plotId) - game.rateOf(a.plotId));
      if (!opts.length) return { t: 'skip' };
      const o = opts[0];
      return { t: 'entrance', plotId: o.plotId, square: pick(o.squares) };
    }

    case 'free-entrance': {
      const opts = pd.options.slice()
        .sort((a, b) => game.rateOf(b.plotId) - game.rateOf(a.plotId));
      const o = opts[0];
      return { t: 'entrance', plotId: o.plotId, square: pick(o.squares) };
    }

    case 'free-build': {
      // Take the most valuable free thing.
      const o = pd.options.slice().sort((a, b) => b.value - a.value)[0];
      return { t: 'freeBuild', plotId: o.plotId };
    }

    case 'stay-roll':
      return { t: 'rollStay' };

    case 'raise-funds': {
      // Sell the asset with the worst income-to-value ratio (easy sells at random).
      if (player.bot === 'easy') return { t: 'sell', plotId: pick(pd.assets).plotId };
      const ranked = pd.assets.slice().sort((a, b) => {
        const ra = (game.rateOf(a.plotId) + 1) / (a.value + 1);
        const rb = (game.rateOf(b.plotId) + 1) / (b.value + 1);
        return ra - rb;
      });
      return { t: 'sell', plotId: ranked[0].plotId };
    }
  }
  return null;
}

function decideAuction(game, player, prof) {
  const pd = game.pending;
  if (player.id === pd.seller) return null;
  if (pd.high && pd.high.player === player.id) return null;   // already winning
  if (pd.passed.indexOf(player.id) >= 0) return null;

  let cap = Math.round(pd.value * prof.bidFactor / 50) * 50;
  // Hard bots bid harder against the cash leader to deny them assets.
  if (player.bot === 'hard') {
    const seller = game.byId(pd.seller);
    const leader = game.players.filter(p => p.alive)
      .sort((a, b) => b.cash - a.cash)[0];
    if (seller && leader && seller.id !== leader.id) cap = Math.round(cap * 1.1 / 50) * 50;
  }
  cap = Math.min(cap, player.cash - Math.round(prof.reserve / 2));

  const min = pd.high ? pd.high.amount + 50 : 50;
  if (min > cap) return { t: 'pass' };
  // Open with a real bid, then climb in small steps.
  const amount = pd.high ? min
    : Math.max(50, Math.min(cap, Math.round(pd.value * 0.4 / 50) * 50));
  return { t: 'bid', amount };
}


return { decide: decide, PROFILES: PROFILES };
});
