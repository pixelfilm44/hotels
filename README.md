# HOTELS — Pixel Tycoon

An online + offline multiplayer web version of the classic *Hotels* board game
with pixel-art graphics, responsive desktop/mobile layout, and AI bots.

**▶ Play it now: https://pixelfilm44.github.io/hotels/**

The GitHub Pages version runs entirely in your browser: play against 1–3 AI
bots (easy / medium / hard) or hot-seat with friends on one device.

## Online multiplayer (separate devices)

True online play uses a small Node server for rooms and synchronization.

### One-click cloud deploy (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pixelfilm44/hotels)

The included [render.yaml](render.yaml) blueprint creates a free web service
named `hotels-pixel-tycoon`. Once it's live:

- Play with full online rooms directly at `https://hotels-pixel-tycoon.onrender.com`
- The GitHub Pages site also connects to it automatically
  ([docs/js/config.js](docs/js/config.js) points at that URL — update it if your
  service gets a different name), so https://pixelfilm44.github.io/hotels/
  gains online rooms too.
- Note: the free tier sleeps when idle; the first visit can take up to a
  minute to wake the server. The online buttons enable automatically once
  it's awake, and offline play is always available immediately.

### Run it yourself

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

## Claymation image assets (optional upgrade)

The game ships with vector "clay" art drawn in code. To upgrade any piece to a
real claymation image (e.g. AI-generated), drop PNG files into
`docs/assets/clay/` and list their keys in `docs/assets/clay/manifest.json`,
e.g. `["board", "car-red", "icon-bank"]`. Anything not listed keeps the vector
art. All PNGs need transparent backgrounds except `board`.

| Key(s) | Size (px) | What it is |
|---|---|---|
| `board` | 1248×960 | Full board background incl. green clay courtyard (opaque) |
| `square` | 192×192 | One neutral cream track tile (specials get a colour wash on top) |
| `plot-3x2`, `plot-4x2` | 576×384, 768×384 | Neutral clay slabs for horizontal hotel plots (colour-washed per hotel) |
| `plot-2x3`, `plot-2x4` | 384×576, 384×768 | Vertical hotel plot slabs |
| `car-red/-blue/-green/-yellow` | 272×224 | Player car tokens, side view facing right |
| `icon-start/-bank/-cityhall/-permission/-free-entrance/-free-build` | 176×176 | Dark glyph icons for special squares |
| `building-main`, `building-wing` | 200×280, 170×230 | Hotel buildings (cream walls, terracotta roof) |
| `pool` | 200×150 | Leisure-facility pool |
| `awning-red/-blue/-green/-yellow` | 280×130 | Striped entrance awnings (white + player colour) |
| `logo` | 1200×240 | "HOTELS" clay letters for the board centre |

A consistent style across all images matters more than exact pixel sizes —
everything is scaled to fit (keep roughly these aspect ratios).

## Code layout

- `docs/` — the static client, served by GitHub Pages and the Node server
  - `docs/shared/gamedata.js` — board layout, hotels, constants
  - `docs/shared/engine.js` — authoritative rules engine (runs in Node *and* the browser)
  - `docs/shared/bot.js` — AI (easy / medium / hard heuristics)
  - `docs/js/local.js` — in-browser game driver for offline bots / hot-seat
- `server/server.js` — static files + WebSocket rooms, bot & auction timers
- `test/sim.js` — headless bot-vs-bot engine test (`npm run sim`)
- `test/multiplayer.js` — two-client sync test (needs a running server)
