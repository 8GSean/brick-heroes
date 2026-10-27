# Brick Arcade 🧱🎮

Cheerful browser games for kids, made with Claude Code to show students what they can build.
Every game follows the same rules: **fun in 5 seconds, no way to lose, no reading needed, and great with a game controller** (keyboard and touch work too).

**Play:** https://8gsean.github.io/brick-heroes/

| Game | What you do |
|---|---|
| 🦸 [Brick Heroes](games/brick-heroes/) | Smash, build and hunt gold bricks in a brick city with four heroes. |
| 🧱 [Brick Buddies](https://8gsean.github.io/brick-buddies/) | A toy world full of buttons, ducks and honks (separate repo). |
| 🦖 [Dino Island Rescue](games/dino-island/) | Ride a T-Rex, Pterodactyl and Longneck to find 12 lost baby dinos and lead them home. |
| 🐶 [Space Pup Planets](games/space-pup/) | Hop a puppy astronaut around tiny round planets, finding what the aliens lost. |
| 🛻 [Monster Truck Junkyard](games/monster-trucks/) | Smash towers, cars and giant bowling pins with a bouncy monster truck. |
| 🐒 [Drum Jungle](games/drum-jungle/) | Everything in the jungle plays music; build a looping song and find your animal band. |
| 🔤 [Brick Learning Lab](games/learning-lab/) | Letters and first sounds, counting and adding, and keyboard typing, all spoken aloud. |
| 🛠️ [Build With Claude](make/) | How students change and make games with Claude Code, plus a typing studio. |

In every game: the 🏠 button, gamepad **Start** or **Escape** go back to the arcade; gamepad **Back** or **M** mutes.

## Running it
No build step and nothing to install. Each game is one HTML file using Three.js 0.160.0 from jsDelivr (internet needed on first load).

```bash
git clone https://github.com/8GSean/brick-heroes.git
cd brick-heroes
python -m http.server 8000   # then open http://localhost:8000
```
Opening `index.html` straight from the folder also works in Chrome and Edge.

## Building more with Claude
Open this repo in Claude Code and describe your wish ("In Drum Jungle, add a cow that moos when I bonk it").
[`CLAUDE.md`](CLAUDE.md) tells Claude the arcade rules so new games and changes fit in.
Each game keeps its tweakable numbers and colours in a `CONFIG` object near the top of its file.

## Layout
```
index.html            arcade main page (the GAMES list adds cards)
games/<slug>/         one game per folder: index.html + thumb.jpg
make/                 Build With Claude page
arcade/               main page images
CLAUDE.md             rules Claude follows when editing
```

## License
MIT. Have fun!
