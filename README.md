# HOTELS — Pixel Tycoon

An online + offline multiplayer web version of the classic *Hotels* board game
with pixel-art graphics, responsive desktop/mobile layout, and AI bots.

**▶ Play it now: https://pixelfilm44.github.io/hotels/**

The GitHub Pages version runs entirely in your browser: play against 1–3 AI
bots (easy / medium / hard) or hot-seat with friends on one device.

## Online multiplayer (separate devices)

True online play uses a small Node server for rooms and synchronization:

```bash
npm install
npm start          # http://localhost:3000
```

- **Create Online Game** — get a 4-letter room code / invite link to share.
- **Join Game** — enter a friend's code.
- 2–4 players per game; any mix of humans and bots.
- Disconnected players are auto-played by an easy bot after ~25 s and can
  rejoin by reopening the page in the same browser.

Friends on your network can visit `http://<your-ip>:3000`; deploy to any Node
host (Render, Fly, Railway, a VPS…) for internet play.

## Rules implemented (Hotel Tycoon edition)

- $12,000 starting cash; roll & move clockwise; rolling a 6 grants an extra turn;
  tokens never share a square (you skip ahead to the next free one).
- Land on a square beside an unowned plot to buy its deed (one deed per turn,
  buildable from your next turn). Beside an opponent's **unbuilt** land you may
  compulsorily purchase it at half price.
- **Planning permission** squares let you build stages on one site, gated by the
  planning die: 3× green (pay & build), H (build free), ×2 (pay double — if you
  can't afford double, the build is cancelled), red (denied).
- **Leisure facilities** are added to fully built hotels with no permission —
  buy them at the start of your turn.
- Passing **City Hall** lets you buy one entrance per built hotel; **Free Door**
  squares grant a free entrance; **Free Build** squares grant one free stage.
- Passing the **Bank** pays $2,000 (3+ player games only).
- Land on an opponent's entrance: roll for nights and pay nights × nightly rate.
  (Payment is collected automatically rather than needing a manual claim.)
- Can't pay? Hotels are auctioned as complete units (no minimum bid, 10 s timer).
  If nobody bids, the bank reclaims the plot for a token half-land refund and
  demolishes the buildings. Out of money and assets = bankrupt; last player wins.

The eight hotels are original creations (Surf Shack → The Meridian) with the
same cost/star/rate structure as the original board.

## Code layout

- `docs/` — the static client, served by GitHub Pages and the Node server
  - `docs/shared/gamedata.js` — board layout, hotels, constants
  - `docs/shared/engine.js` — authoritative rules engine (runs in Node *and* the browser)
  - `docs/shared/bot.js` — AI (easy / medium / hard heuristics)
  - `docs/js/local.js` — in-browser game driver for offline bots / hot-seat
- `server/server.js` — static files + WebSocket rooms, bot & auction timers
- `test/sim.js` — headless bot-vs-bot engine test (`npm run sim`)
- `test/multiplayer.js` — two-client sync test (needs a running server)
