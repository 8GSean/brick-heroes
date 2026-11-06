# Brick Heroes co-op server

A tiny relay server so several kids can play Brick Heroes together in the same room.
It is a Cloudflare Worker with one Durable Object per room code. It does not know the
game rules: it passes messages between players and remembers a small "world" (things
built, targets smashed...) so late joiners see it. Message format: see `PROTOCOL.md`.

## 1. Deploy it (once, on your own computer)

You need Node.js 18+ and a free Cloudflare account.

```sh
cd server
npm install
npx wrangler login      # opens the browser once to sign in to Cloudflare
npx wrangler deploy
```

Wrangler prints the address, something like:

```
https://brick-heroes-coop.<your-subdomain>.workers.dev
```

(The first time, Cloudflare may ask you to pick a `workers.dev` subdomain.)
Open that address in a browser: it should say **Brick Heroes co-op server OK**.

## 2. Put it in the game

In `games/brick-heroes/index.html`, near the top, set the server address
(note `wss://`, not `https://`):

```js
CONFIG.COOP_SERVER = 'wss://brick-heroes-coop.<your-subdomain>.workers.dev';
```

The game connects to `CONFIG.COOP_SERVER + '/room/' + roomCode`.
Room codes are 1-24 characters of `a-z`, `0-9` and `-` (for example `class-3b`).

## 3. Only allow your own website (recommended)

By default any web page can connect. To allow only the GitHub Pages site, edit
`wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://8gsean.github.io"
```

and run `npx wrangler deploy` again. Several sites: separate them with commas,
e.g. `"https://8gsean.github.io,http://localhost:8000"`.
(The origin is just the scheme + host, no path. When this is set, tools that send
no `Origin` header, like `test-client.mjs`, are refused too.)

## 4. Test on your computer

```sh
cd server
npx wrangler dev                 # local server on http://localhost:8787
node test-client.mjs             # in a second terminal: prints PASS/FAIL lines
```

Test the deployed server too:

```sh
node test-client.mjs wss://brick-heroes-coop.<your-subdomain>.workers.dev/room/test
```

To also check the "empty room is wiped" timer quickly:

```sh
npx wrangler dev --var EMPTY_ROOM_WIPE_SECONDS:3
WIPE_TEST=3 node test-client.mjs
```

While developing the game locally, set `CONFIG.COOP_SERVER = 'ws://localhost:8787'`.

## Free plan notes

- It uses **SQLite-backed Durable Objects** and the **WebSocket Hibernation API**, which
  work on the Workers **Free** plan. Idle rooms sleep and cost nothing.
- Free-plan limits are daily (they reset every day). Cloudflare counts incoming
  WebSocket messages at roughly 20 messages = 1 request, and the free plan gives about
  100,000 requests/day. A room of 6 players sending ~12 updates/second is roughly
  13,000 requests per hour, so several class-hours a day fit. If you hit the limit, the
  game just can't connect until the next day (nothing breaks, no bill). Check the current
  numbers at https://developers.cloudflare.com/durable-objects/platform/pricing/
- Rooms hold at most **12** players (4-8 is the sweet spot). Player 13 gets `{t:"full"}`.
- When a room has been empty for **30 minutes**, its world state is wiped, so each class
  starts fresh. Rejoining before then keeps everything.
- Safety limits: messages over 2 KB are dropped, more than 40 messages/second from one
  player are dropped (way more gets the player disconnected), max 500 world entries/room.

## Files

- `src/index.js` - the Worker + `Room` Durable Object (tweakable numbers in `CONFIG` at the top)
- `wrangler.toml` - Cloudflare settings
- `PROTOCOL.md` - message format for the game developer
- `test-client.mjs` - automatic test (Node 22+)
