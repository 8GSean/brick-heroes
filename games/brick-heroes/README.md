# Brick Heroes – Mission 1

A small, cheerful 3D brick-city adventure you play in the browser, with a keyboard or a gamepad.
You can't lose. Run around, smash things into studs, build stuff from jiggling brick piles, switch between four heroes and hunt for 10 gold bricks.
It's made so a kid who can't read yet still has fun: every prompt is a picture.

**Play it now:** https://8gsean.github.io/brick-heroes/games/brick-heroes/ (part of the [Brick Arcade](../../README.md))

## Controls

| Action | Gamepad | Keyboard / mouse |
|---|---|---|
| Move | Left stick / D-pad | WASD or arrow keys |
| Camera | Right stick | Mouse drag, Q / E |
| Jump (double/triple jump for some heroes, hold in the air to fly as the red hero) | A | Space |
| Punch | X | J or left click |
| Hero power | RB / RT / LT | K, Shift or right click |
| Build (hold near a pile with the 🔨 bubble) | B | B (or F) |
| Switch hero | Y / LB | Tab, or 1–4 |
| Mute | Back/View | M |
| Talking on/off (🗣️ button) | | V |
| Language English / Hebrew (flag button) | | L |

**On a phone or tablet** the game switches to touch controls automatically. The first tap goes full screen and turns to landscape (on Android and iPad). On iPhone, use Share → Add to Home Screen to play full screen.
- Touch and drag anywhere on the left side for a joystick that follows your thumb.
- Use the round buttons on the right: 🦘 jump (hold to fly), 👊 punch, ⚡ power and 🔨 build. The 🔨 button lights up when you're next to a brick pile.
- Drag anywhere else on the screen to look around. While you run, the camera slowly turns to stay behind your hero.
- Tap a hero portrait to switch heroes.

The game can be installed as an app, and after the first visit it also works offline.

Things to build (hold B at a brick pile): trampoline, stud fountain, golden statue, race car (walk in to drive, jump to get out), pizza stand (catch the pizzas), giant piano (step on the keys), rainbow stairs + rooftop slide, hero cannon (flies you onto the tallest tower), rocket (ride it up into the fireworks), hot-air balloon (float over the city), merry-go-round, and a dancing robot with a disco floor.

A friendly voice talks about what is happening (turn it off with 🗣️). The game speaks and shows its text in English or Hebrew; all words live in the `STRINGS` table near the top of the script, so you can add another language.

Heroes: red flyer (flight and lasers), shield captain (boomerang shield), big green smasher (ground pound) and web hero (web zip, triple jump). The last two are unlocked by finding their glowing tokens.

---

## For AI agents: how to install and run this

This section is written for an AI coding assistant (Claude Code, Copilot, Cursor, etc.) setting the game up for a user.

### What this project is
- The entire game is a **single file: `games/brick-heroes/index.html`**. There is no build step, no `package.json` and no dependencies to install.
- It uses **Three.js 0.160.0**, loaded at runtime from the jsDelivr CDN through an `<script type="importmap">`, plus the "Lilita One" Google Font. **An internet connection is required** the first time it loads.
- Audio is synthesized with the Web Audio API (there are no sound files). Progress is saved to `localStorage` under the key `brick-heroes-v1`.

### Steps
1. Get the code:
   ```bash
   git clone https://github.com/8GSean/brick-heroes.git
   cd brick-heroes
   ```
2. Run it. Pick **one** option:
   - **Simplest:** open `games/brick-heroes/index.html` directly in a modern browser (Chrome, Edge or Firefox). All game code is inline, so `file://` works.
   - **Local web server** (recommended if the browser blocks anything under `file://`):
     ```bash
     python -m http.server 8000
     ```
     or
     ```bash
     npx serve .
     ```
     Then open http://localhost:8000/games/brick-heroes/ (or the port `serve` prints). Run the server from the repo root.
3. Click the page or press any key to start. Browsers only allow sound after a click or key press; a gamepad button alone does not unlock audio.

### Verifying it works
- The title screen shows "BRICK HEROES" over an orbiting view of the city. After you click, the HUD appears (stud counter top-left, gold brick slots top-right, hero portraits bottom-center).
- The browser console should show no errors. If it reports failed module imports, the machine can't reach `cdn.jsdelivr.net`.
- For debugging, game state is exposed at `window.__game` (`player`, `buildables`, `smashables`, `goons`, `goldBricks`, `save`, `boss`, `studs`, `targets`, plus helpers like `tp(x, z)`, `buildAll()` and `speed`).
- Multiplayer hooks: world events go through `completeBuild(b, remote)`, `smashTarget(t, dir, remote)` and `collectGold(g, remote)`; local events call `NET.send(type, data)`. Buildables, smashables and goons have stable `id`s (creation order), gold bricks have string ids.

### Common tasks
- **Reset progress:** click "Reset progress" on the title screen, or run `localStorage.removeItem('brick-heroes-v1')` in the console.
- **Deploy:** any static host works (GitHub Pages, Netlify, Cloudflare Pages). Serve the whole repo as-is; the arcade page is `index.html` at the root.
- **Edit the game:** everything lives in the `<script type="module">` block of `index.html`. The code is split into sections by banner comments (Audio, Renderer, Minifigures, Heroes, Studs, Targets, Gold bricks, Jump pads & buildables, Player, Input, Camera, HUD, World, Main loop). The level layout is in `buildWorld()`.

## License
MIT. Have fun!
