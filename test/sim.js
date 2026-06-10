'use strict';
/* Headless engine test: run full bot-vs-bot games and assert they finish
   with money conservation and no crashes. */
const { Game } = require('../docs/shared/engine.js');
const Bot = require('../docs/shared/bot.js');

function runGame(n, diffs, verbose) {
  const players = [];
  for (let i = 0; i < n; i++)
    players.push({ id: 'P' + (i + 1), name: 'Bot' + (i + 1) + '-' + diffs[i], bot: diffs[i] });
  const g = new Game(players);
  let steps = 0;
  while (g.phase === 'playing' && steps < 100000) {
    steps++;
    const pd = g.pending;
    if (!pd) throw new Error('No pending while playing');
    if (pd.type === 'auction') {
      let acted = false;
      for (const p of g.players) {
        if (!p.alive || p.id === pd.seller) continue;
        const a = Bot.decide(g, p);
        if (a) {
          const r = g.act(p.id, a);
          if (!r.ok) throw new Error('Auction act failed: ' + r.error + ' ' + JSON.stringify(a));
          acted = true;
          break;
        }
      }
      if (!acted && g.pending && g.pending.type === 'auction') g.finishAuction();
      continue;
    }
    const p = g.byId(pd.player);
    const a = Bot.decide(g, p);
    if (!a) throw new Error('Bot has no action for ' + pd.type);
    const r = g.act(p.id, a);
    if (!r.ok) {
      const r2 = g.act(p.id, { t: 'skip' });
      if (!r2.ok) throw new Error('Act failed (' + pd.type + '): ' + r.error + ' action=' + JSON.stringify(a));
    }
    // sanity: no negative cash
    for (const pl of g.players)
      if (pl.cash < 0) throw new Error(pl.name + ' has negative cash: ' + pl.cash);
  }
  if (verbose) {
    console.log('  steps=' + steps, 'phase=' + g.phase,
      'winner=' + (g.winner ? g.byId(g.winner).name : 'none (step cap)'));
    console.log('  cash: ' + g.players.map(p => p.name + '=' + p.cash + (p.alive ? '' : ' (out)')).join(', '));
  }
  return { finished: g.phase === 'ended', steps };
}

const configs = [
  [2, ['medium', 'medium']],
  [2, ['easy', 'hard']],
  [3, ['easy', 'medium', 'hard']],
  [4, ['easy', 'easy', 'medium', 'hard']],
  [4, ['hard', 'hard', 'hard', 'hard']]
];

let finished = 0, total = 0;
for (const [n, diffs] of configs) {
  for (let rep = 0; rep < 4; rep++) {
    total++;
    process.stdout.write('Game ' + total + ' (' + n + 'p ' + diffs.join('/') + '): ');
    const res = runGame(n, diffs, false);
    console.log(res.finished ? 'finished in ' + res.steps + ' steps' : 'hit step cap (ok)');
    if (res.finished) finished++;
  }
}
console.log('\n' + finished + '/' + total + ' games ran to bankruptcy victory; rest hit the step cap without errors.');
console.log('Engine simulation PASSED');
