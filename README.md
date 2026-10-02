# AnimationVsAnimator

A stick-figure desktop pet inspired by Alan Becker's *Animator vs. Animation*.
He lives on top of your screen, has his own physics and moods, and you can poke,
grab, and throw him.

## Run it (macOS or Windows)
1. Install [Node.js](https://nodejs.org) (LTS).
2. Get this repo (GitHub Desktop → Clone), then open a terminal in its folder.
3. `npm install` (first time only — downloads Electron, ~250 MB)
4. `npm start`

**Settings and Quit:** click his little stick-figure icon in the menu bar (macOS, top right)
or system tray (Windows, bottom right). From there: Settings, Smack mode, Drop him in again, Quit.

## Things to try
- **Poke** him (quick click). How he reacts depends on his mood: playful → giggles, tags you back,
  or chases your cursor. Annoyed → stomps and pokes back. Sad → "..." and ignores you.
  Poke him a lot and watch him get angry.
- **Pick him up** (click and drag) and **throw** him. Small drops he lands on his feet;
  big ones knock him flat, and he'll remember he didn't like that.
- **Smack** him (turn on Smack mode first): swipe the cursor through him fast.
- **Pet** him: rub the cursor back and forth over him without clicking. ♥
- **Windows are platforms**: he climbs onto your open windows, stands on title bars, gets carried
  when you drag a window, and falls when you close or minimize it. He learns which drops are too high.
  (First run on a Mac compiles a tiny helper, which takes a few seconds.)
- **Climbing**: he climbs window sides and the screen edges, and does monkey bars across the top.
- **Mischief mode** (Settings → General, off by default): Desktop Goose style, he grabs your cursor
  and drags it around for a moment. Move your mouse to take it back. He also doodles on your screen.
- **Control tab** in Settings: make him do anything on command, drag his mood bars, make him talk.
- **Talk to him** (AI brain, free): Settings → General → Brain. Pick a service (Google Gemini is the default), click
  "Get a free key", make the key on their site (no credit card), paste it, and pick **Chat** (AI only when you talk
  to him) or **Full** (he also decides what to do and comments on things). Type to him in Settings → Control →
  Talk to him, or pick "Talk to Blurp…" from the tray icon. Ask him for weird stuff ("do a handstand", "float"):
  with "Let the AI move his body" on, the AI makes up the move itself. Edit who he is under Mood → Personality.
  Free services have daily limits; Offline mode needs no internet and no key.
- **Leave him alone**: he wanders, sits, explores, gets bored, and eventually naps.
  Poke him while he's asleep at your own risk.

His mood is saved between runs. The **Settings** window shows his mood live and lets you change
his name, size, look (presets or every number by hand) and how he moves.

## Commands
| Command | What it does |
|---|---|
| `npm start` | Build and launch the pet |
| `npm run preview` | Run in a regular browser window (handy for tweaking) |
| `npm run sim` | Headless physics tests |
| `npm run lab` | Design lab: compare looks side by side |
| `npm run typecheck` | Check the TypeScript for errors |

See `CLAUDE.md` for the architecture and roadmap.
