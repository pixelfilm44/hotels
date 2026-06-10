'use strict';
/* Two-client online multiplayer smoke test against a running server. */
const WebSocket = require('ws');
const URL = 'ws://localhost:' + (process.env.PORT || 3000);

function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, code: null, state: null, queue: [] };
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { c.id = m.playerId; c.code = m.code; }
    if (m.t === 'state') { c.state = m.game; c.stateCount = (c.stateCount || 0) + 1; }
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.lastError = m.msg;
  });
  c.send = o => ws.send(JSON.stringify(o));
  c.open = new Promise(res => ws.on('open', res));
  return c;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Timeout waiting for ' + what);
    await wait(100);
  }
}

(async () => {
  const a = client('Alice'), b = client('Bob');
  await a.open; await b.open;

  a.send({ t: 'create', name: 'Alice' });
  await until(() => a.code, 'room code');
  console.log('Alice created room', a.code);

  b.send({ t: 'join', code: a.code, name: 'Bob' });
  await until(() => b.id, 'Bob joined');
  await until(() => a.lobby && a.lobby.players.length === 2, 'lobby sync');
  console.log('Bob joined; lobby shows', a.lobby.players.map(p => p.name).join(', '));

  // non-host cannot start
  b.send({ t: 'start' });
  await wait(300);
  if (a.state) throw new Error('Non-host was able to start the game!');
  console.log('Non-host start correctly rejected:', b.lastError);

  a.send({ t: 'start' });
  await until(() => a.state && b.state, 'game start on both clients');
  console.log('Game started; first turn:', a.state.turn);

  // play 30 pending steps alternating whoever owns the pending action
  for (let i = 0; i < 30; i++) {
    await until(() => a.state && a.state.pending, 'pending');
    const pd = a.state.pending;
    const actor = pd.player === a.id ? a : b;
    const cash = a.state.players.find(p => p.id === actor.id).cash;
    let action;
    switch (pd.type) {
      case 'roll': action = { t: 'roll' }; break;
      case 'stay-roll': action = { t: 'rollStay' }; break;
      case 'permission-roll': action = { t: 'rollPermission' }; break;
      case 'buy-land': action = { t: 'buy', yes: cash >= pd.price }; break;
      case 'raise-funds': action = { t: 'sell', plotId: pd.assets[0].plotId }; break;
      case 'auction': {
        // both clients pass; the seller's pass is rejected harmlessly
        a.send({ t: 'action', action: { t: 'pass' } });
        b.send({ t: 'action', action: { t: 'pass' } });
        break;
      }
      default: action = { t: 'skip' };
    }
    const countBefore = a.stateCount || 0;
    if (process.env.DEBUG) console.log('step', i, pd.type, 'actor', actor.id, JSON.stringify(action));
    if (action) actor.send({ t: 'action', action });
    await until(() => (a.stateCount || 0) > countBefore,
      'state advance from ' + pd.type + ' (err=' + (actor.lastError || '') + ')', 15000);
    await until(() => JSON.stringify(a.state.pending) === JSON.stringify(b.state.pending),
      'client sync', 5000);
  }
  const pa = a.state.players;
  console.log('After 30 steps:', pa.map(p => p.name + ' pos=' + p.pos + ' cash=' + p.cash).join(' | '));
  if (JSON.stringify(a.state) !== JSON.stringify(b.state)) throw new Error('Client states diverged');
  console.log('Both clients fully in sync. ONLINE MULTIPLAYER TEST PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
