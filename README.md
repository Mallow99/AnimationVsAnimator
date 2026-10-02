# AnimationVsAnimator

A stick-figure desktop pet inspired by Alan Becker's *Animator vs. Animation*.
He lives on top of your screen, has his own physics and moods, and you can poke,
grab, and throw him.

## Run it (macOS or Windows)
1. Install [Node.js](https://nodejs.org) (LTS).
2. Get this repo (GitHub Desktop → Clone), then open a terminal in its folder.
3. `npm install` (first time only — downloads Electron, ~250 MB)
4. `npm start`

**Quit:** right-click his icon in the Dock (macOS) or taskbar (Windows) → Quit.

## Commands
| Command | What it does |
|---|---|
| `npm start` | Build and launch the pet |
| `npm run preview` | Run in a regular browser window (handy for tweaking) |
| `npm run sim` | Headless physics tests |
| `npm run typecheck` | Check the TypeScript for errors |

See `CLAUDE.md` for the architecture and roadmap.
