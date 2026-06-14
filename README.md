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

The eight hotels are Waikiri, Hábel, L'Étoile, Royal, Fujiyama, Boomerang,
President and Safari, placed over the painted board image's regions.

## Claymation board image

The live board is a single painted claymation image, `docs/assets/clay/board.png`
(1560×1120, opaque), listed in `docs/assets/clay/manifest.json`. The game's road
cells, hotel zones and special squares (PARTENZA = start, MUNICIPIO = city hall,
BANCA = bank) are traced onto this image in `docs/shared/gamedata.js` (`CTRL`,
`PLOTS`, `SPECIALS`). When the image is present the code-drawn road/terrain are
hidden and only the functional overlay (special chips, contested diamonds, hotel
ownership outlines, growing buildings, entrance awnings, tokens) is rendered on
top. Remove the image (or empty the manifest) and the game falls back to the
fully code-drawn vector clay board using the same geometry.

To re-trace after changing the image, set `window.CALIB = true` in the console
before a game starts: a 100 px coordinate grid plus numbered cells and dashed
plot boxes overlay the board so you can read off new `CTRL`/`PLOTS` coordinates.

Other optional overrides (drop PNGs in `docs/assets/clay/` + add their keys to
the manifest): `car-red/-blue/-green/-yellow` tokens, `building-main`,
`building-wing`, `pool`, `awning-<colour>`, and `icon-<special>` chips.

### Per-hotel buildings, extensions, and facilities

Each hotel can have its own art. The renderer looks for per-hotel keys first
and falls back to the generic keys above, then to the built-in vector art.
Use these filenames (all transparent PNGs in `docs/assets/clay/`):

| Hotel        | Main building              | Extension wing             | Facility                |
|--------------|----------------------------|----------------------------|-------------------------|
| Waikiri      | `building-main-waikiri.png`| `building-wing-waikiri.png`| `facility-waikiri.png`  |
| Hábel        | `building-main-habel.png`  | `building-wing-habel.png`  | `facility-habel.png`    |
| L'Étoile     | `building-main-letoile.png`| `building-wing-letoile.png`| `facility-letoile.png`  |
| Royal        | `building-main-royal.png`  | `building-wing-royal.png`  | `facility-royal.png`    |
| Fujiyama     | `building-main-fujiyama.png`| `building-wing-fujiyama.png`| `facility-fujiyama.png`|
| Boomerang    | `building-main-boomerang.png`| `building-wing-boomerang.png`| `facility-boomerang.png`|
| President    | `building-main-president.png`| `building-wing-president.png`| `facility-president.png`|
| Safari       | `building-main-safari.png` | `building-wing-safari.png` | `facility-safari.png`   |

Suggested PNG sizes (the renderer scales to fit):
- **Main building**: ~200×280 px, portrait, base at the bottom edge.
- **Extension wing**: ~170×230 px (slightly smaller than the main).
- **Facility**: ~200×150 px, landscape. The painted facility theme per hotel is
  whatever you choose — the in-game name comes from `gamedata.js`
  (Beach Bar, Bazaar, Casino, Golf Course, Onsen Spa, Safari Pool, Sky Lounge,
  Grand Lodge).

Don't forget to add each filename's key (without `.png`) to
`docs/assets/clay/manifest.json`, e.g.:

```json
["board", "building-main-royal", "building-wing-royal", "facility-royal"]
```

Mix and match freely — provide art for one hotel or all eight, with or without
facilities; the rest will keep the vector clay art.

## Code layout

- `docs/` — the static client, served by GitHub Pages and the Node server
  - `docs/shared/gamedata.js` — board layout, hotels, constants
  - `docs/shared/engine.js` — authoritative rules engine (runs in Node *and* the browser)
  - `docs/shared/bot.js` — AI (easy / medium / hard heuristics)
  - `docs/js/local.js` — in-browser game driver for offline bots / hot-seat
- `server/server.js` — static files + WebSocket rooms, bot & auction timers
- `test/sim.js` — headless bot-vs-bot engine test (`npm run sim`)
- `test/multiplayer.js` — two-client sync test (needs a running server)
