# Brick Arcade: notes for Claude

This repo is a collection of browser games made with and for young students (about ages 4–10).
Students and teachers use Claude Code to change the games and build new ones. Many students are still
learning to read, so **explain what you did in short, simple, friendly sentences** and offer one fun next idea.

## Layout
- `index.html`: the arcade main page. The `GAMES` list at the top of its script has one line per game card.
- `games/<slug>/index.html`: each game is ONE self-contained file (HTML + CSS + JS). `thumb.jpg` next to it is the card picture.
- `make/index.html`: "Build with Claude" page (how-to steps + typing studio with wishes to type).
- `arcade/`: images for the main page.
- No build step, no package.json. Open a file in a browser or run `python -m http.server` from the repo root.

## Rules every game follows
1. Fun within 5 seconds; every button does something satisfying (sound + particles + wobble).
2. **No lose state**: no game over, no failing timers, no lives. Falling off just pops you back.
3. **No reading needed**: prompts are pictures, icons, arrows or spoken words (`speechSynthesis`).
4. Forgiving controls: big hitboxes, magnet pickups, auto camera.
5. Works with a **gamepad** (standard mapping: A=0, B=1, X=2, Y=3, LB=4, RB=5, Start=9, Back=8), keyboard and touch.
6. A 🏠 button in the top-left corner links to `../../index.html`; gamepad Start and keyboard Escape go home too. Back / M = mute.
7. Progress saved in `localStorage` under `brick-arcade-<slug>`, wrapped in try/catch.
8. Three.js `0.160.0` from jsDelivr via an importmap (see any game). Sounds are synthesized with Web Audio; no sound or image files.
9. Keep it light enough for school Chromebooks (pixel ratio ≤ 1.5, low-poly, few draw calls).
10. Tweakable numbers and colours live in a `CONFIG` object near the top, so students can find them.

## When a student asks for a change
- Make the smallest change that does the wish, keep the style, and test it in a browser if you can.
- If a wish would break a rule above (for example "add a game over screen"), suggest a fun no-lose version instead.
- When adding a new game: create `games/<slug>/index.html`, add a card to `GAMES` in `index.html`, and save a gameplay screenshot as `games/<slug>/thumb.jpg`.
- Work on a branch and open a pull request for a grown-up to merge; merged changes go live on GitHub Pages.
