'use strict';
/* HTTP static server + WebSocket game rooms. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('../docs/shared/engine.js');
const Bot = require('../docs/shared/bot.js');
const G = require('../docs/shared/gamedata.js');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* ---------- static files ---------- */
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  let file = path.normalize(path.join(ROOT, 'docs', url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------- rooms ---------- */
const rooms = new Map(); // code -> room

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function makeRoom() {
  const room = {
    code: genCode(), players: [], game: null, nextId: 1,
    botTimers: [], auctionTimer: null, idleTimer: null
  };
  rooms.set(room.code, room);
  touch(room);
  return room;
}

function touch(room) {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  // Destroy rooms with no connected humans after 15 minutes.
  room.idleTimer = setTimeout(() => {
    if (room.players.some(p => !p.bot && p.ws)) { touch(room); return; }
    clearBotTimers(room);
    rooms.delete(room.code);
  }, 15 * 60 * 1000);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function lobbyView(room) {
  return {
    t: 'lobby', code: room.code,
    players: room.players.map((p, i) => ({
      id: p.id, name: p.name, bot: p.bot, color: G.COLORS[i],
      connected: !!p.ws || !!p.bot, host: p.id === hostId(room)
    }))
  };
}

function hostId(room) {
  const h = room.players.find(p => !p.bot);
  return h ? h.id : null;
}

function broadcast(room) {
  const msg = room.game
    ? { t: 'state', code: room.code, game: room.game.view() }
    : lobbyView(room);
  for (const p of room.players) if (p.ws) send(p.ws, msg);
}

/* ---------- bot / timer driving ---------- */
function clearBotTimers(room) {
  room.botTimers.forEach(clearTimeout);
  room.botTimers = [];
  if (room.auctionTimer) { clearTimeout(room.auctionTimer); room.auctionTimer = null; }
}

function actAndContinue(room, playerId, action) {
  const g = room.game;
  if (!g) return;
  const res = g.act(playerId, action);
  if (!res.ok) {
    // A bot produced an illegal move (shouldn't happen) — fail safe by skipping.
    const fallback = { t: 'skip' };
    g.act(playerId, fallback);
  }
  broadcast(room);
  scheduleBots(room);
}

function scheduleBots(room) {
  clearBotTimers(room);
  const g = room.game;
  if (!g || (g.phase !== 'playing' && g.phase !== 'rolloff') || !g.pending) return;
  const pd = g.pending;
  const seq = g.seq;

  if (pd.type === 'auction') {
    // End-of-auction timer.
    room.auctionTimer = setTimeout(() => {
      if (g.pending && g.pending.type === 'auction') {
        g.finishAuction();
        broadcast(room);
        scheduleBots(room);
      }
    }, Math.max(100, pd.deadline - Date.now() + 80));
    // Stagger bot bids.
    let delay = 600 / g.speed;
    for (const p of g.players) {
      if (!p.alive || p.id === pd.seller) continue;
      const rp = room.players.find(x => x.id === p.id);
      const isBot = !!p.bot;
      const isGone = rp && !rp.bot && !rp.ws;
      if (!isBot && !isGone) continue;
      const d = delay += (400 + Math.random() * 600) / g.speed;
      room.botTimers.push(setTimeout(() => {
        if (g.seq !== seq || !g.pending || g.pending.type !== 'auction') return;
        const player = g.byId(p.id);
        const a = isBot ? Bot.decide(g, player)
                        : (g.pending.passed.indexOf(p.id) < 0 ? { t: 'pass' } : null);
        if (a) actAndContinue(room, p.id, a);
      }, d));
    }
    return;
  }

  const owner = g.byId(pd.player);
  if (!owner) return;
  if (owner.bot) {
    const delay = (700 + Math.random() * 900) / g.speed;
    room.botTimers.push(setTimeout(() => {
      if (g.seq !== seq) return;
      const a = Bot.decide(g, owner);
      if (a) actAndContinue(room, owner.id, a);
    }, delay));
    return;
  }
  // Disconnected human: autoplay with the easy bot after a grace period.
  const rp = room.players.find(x => x.id === pd.player);
  if (rp && !rp.ws) {
    room.botTimers.push(setTimeout(() => {
      if (g.seq !== seq) return;
      if (rp.ws) return; // came back
      const ghost = Object.assign({}, owner, { bot: 'easy' });
      const a = Bot.decide(g, ghost);
      if (a) actAndContinue(room, owner.id, a);
    }, 25000));
  }
}

/* ---------- websocket ---------- */
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    try { handle(ws, m); } catch (e) {
      console.error(e);
      send(ws, { t: 'error', msg: 'Server error.' });
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.players.find(x => x.ws === ws);
    if (!p) return;
    p.ws = null;
    if (!room.game) {
      // In the lobby, leaving really removes you.
      room.players = room.players.filter(x => x !== p);
      if (!room.players.some(x => !x.bot)) {
        clearBotTimers(room);
        rooms.delete(room.code);
        return;
      }
      broadcast(room);
    } else {
      broadcast(room);
      scheduleBots(room); // start the autoplay grace timer if it was their move
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function joinReply(ws, room, p) {
  send(ws, { t: 'joined', code: room.code, playerId: p.id, token: p.token });
  if (room.game) send(ws, { t: 'state', code: room.code, game: room.game.view() });
  broadcast(room);
}

function handle(ws, m) {
  const room = ws.room;
  const me = room ? room.players.find(p => p.ws === ws) : null;

  switch (m.t) {
    case 'create': {
      const r = makeRoom();
      const p = { id: 'P' + r.nextId++, name: cleanName(m.name), bot: null,
                  token: crypto.randomUUID(), ws };
      r.players.push(p);
      ws.room = r;
      joinReply(ws, r, p);
      return;
    }

    case 'join': {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'error', msg: 'Room not found.' });
      if (r.game) return send(ws, { t: 'error', msg: 'That game already started.' });
      if (r.players.length >= 4) return send(ws, { t: 'error', msg: 'Room is full.' });
      const p = { id: 'P' + r.nextId++, name: cleanName(m.name), bot: null,
                  token: crypto.randomUUID(), ws };
      r.players.push(p);
      ws.room = r;
      touch(r);
      joinReply(ws, r, p);
      return;
    }

    case 'rejoin': {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'error', msg: 'That game no longer exists.', fatal: true });
      const p = r.players.find(x => x.token === m.token);
      if (!p) return send(ws, { t: 'error', msg: 'Could not rejoin.', fatal: true });
      if (p.ws) try { p.ws.close(); } catch (e) {}
      p.ws = ws;
      ws.room = r;
      touch(r);
      joinReply(ws, r, p);
      scheduleBots(r);
      return;
    }

    case 'addBot': {
      if (!room || !me || room.game) return;
      if (me.id !== hostId(room)) return send(ws, { t: 'error', msg: 'Only the host can add bots.' });
      if (room.players.length >= 4) return send(ws, { t: 'error', msg: 'Room is full.' });
      const diff = ['easy', 'medium', 'hard'].includes(m.difficulty) ? m.difficulty : 'medium';
      const names = { easy: ['Sunny', 'Pebble', 'Doodle'], medium: ['Marco', 'Vera', 'Felix'], hard: ['Magnus', 'Sterling', 'Vex'] };
      const used = room.players.map(p => p.name);
      const name = (names[diff].find(n => !used.includes(n)) || 'Bot' + room.nextId) +
        ' (' + diff + ')';
      room.players.push({ id: 'P' + room.nextId++, name, bot: diff, token: null, ws: null });
      broadcast(room);
      return;
    }

    case 'removeBot': {
      if (!room || !me || room.game) return;
      if (me.id !== hostId(room)) return;
      room.players = room.players.filter(p => !(p.bot && p.id === m.id));
      broadcast(room);
      return;
    }

    case 'start': {
      if (!room || !me) return;
      if (me.id !== hostId(room)) return send(ws, { t: 'error', msg: 'Only the host can start.' });
      if (room.game && room.game.phase !== 'ended')
        return send(ws, { t: 'error', msg: 'Game already running.' });
      if (room.players.length < 2 || room.players.length > 4)
        return send(ws, { t: 'error', msg: 'You need 2–4 players (add a bot?).' });
      room.game = new Game(room.players.map(p => ({ id: p.id, name: p.name, bot: p.bot })));
      broadcast(room);
      scheduleBots(room);
      return;
    }

    case 'action': {
      if (!room || !me || !room.game) return;
      const g = room.game;
      if (m.action && m.action.t === 'ffAuction') {
        if (!g.pending || g.pending.type !== 'auction')
          return send(ws, { t: 'error', msg: 'No auction running.' });
        if (!g.auctionHumansDone())
          return send(ws, { t: 'error', msg: 'Other players can still bid.' });
        g.resolveAuctionWithBots(Bot.decide);
        touch(room);
        broadcast(room);
        scheduleBots(room);
        return;
      }
      const res = g.act(me.id, m.action || {});
      if (!res.ok) return send(ws, { t: 'error', msg: res.error });
      touch(room);
      broadcast(room);
      scheduleBots(room);
      return;
    }

    case 'speed': {
      if (!room || !me || !room.game) return;
      if (me.id !== hostId(room)) return send(ws, { t: 'error', msg: 'Only the host can change the speed.' });
      room.game.speed = (m.speed === 3 ? 3 : 1);
      broadcast(room);
      scheduleBots(room);
      return;
    }

    case 'leave': {
      try { ws.close(); } catch (e) {}
      return;
    }
  }
}

function cleanName(n) {
  n = String(n || '').trim().slice(0, 12);
  return n || 'Player';
}

server.listen(PORT, () => {
  console.log('Hotels server running at http://localhost:' + PORT);
});
