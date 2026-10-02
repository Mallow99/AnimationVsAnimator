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

## Things to try
- **Poke** him (quick click). How he reacts depends on his mood: playful → giggles, tags you back,
  or chases your cursor. Annoyed → stomps and pokes back. Sad → "..." and ignores you.
  Poke him a lot and watch him get angry.
- **Pick him up** (click and drag) and **throw** him. Small drops he lands on his feet;
  big ones knock him flat, and he'll remember he didn't like that.
- **Pet** him: rub the cursor back and forth over him without clicking. ♥
- **Leave him alone**: he wanders, sits, explores, gets bored, and eventually naps.
  Poke him while he's asleep at your own risk.

His mood is saved between runs.

## Commands
| Command | What it does |
|---|---|
| `npm start` | Build and launch the pet |
| `npm run preview` | Run in a regular browser window (handy for tweaking) |
| `npm run sim` | Headless physics tests |
| `npm run typecheck` | Check the TypeScript for errors |

See `CLAUDE.md` for the architecture and roadmap.
