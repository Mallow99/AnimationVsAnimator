# Where the project stands

Read [AGENTS.md](../AGENTS.md) first (how to work here). This file is the current state only.
Keep it short: replace old information, do not append a diary. History is in `docs/archive/`.

Last updated: 2026-11-12, version **1.0.0-rc.5**.

## What exists

One app, two editions built from the same source (see AGENTS.md section 1):

- **Packaged edition, "Mallow Desk Buddies"**: what people download. Up to five stick-figure
  buddies on the desktop (five saved, plus a sixth, Arnold, unlocked with the bonus code `ARNOLD`
  in Settings; do not put that code in public text). Petting, picking up, throwing; moods,
  personalities, friendships and memories per buddy; reading, drawing, catch, TV, handheld games,
  Pong, Othello, sword sparring; furniture and belongings; built-in conversation with no AI;
  saves with automatic recovery and backup export. Window climbing, sounds and cursor/window
  mischief are optional and start off. It never contacts the internet.
- **Development edition**: all of that plus the experiments: cloud AI services with your own key,
  the Mind tab, cursor weapons, the Chrome extension, visits to real folders and files.

## What changed last (2026-11-12)

- **Local AI in the packaged edition.** Settings → "Local AI (optional)" lets buddies answer with a
  model from Ollama running on the same computer. Off by default; one switch and one model for all
  buddies; falls back to built-in dialogue when Ollama is closed. Cloud AI stays impossible in
  this edition (`offlineEdition` in `src/shared/product.ts`).
- **Cleanup.** All code auto-formatted (Prettier; the built app was byte-for-byte identical before
  and after). Unused code removed, and `npm run typecheck` now fails on unused variables.
  ~35 npm commands became a handful: `npm run check <name>`, `npm run verify`, `npm run package`.
  Test files live in `scripts/checks/`. Two GitHub workflows became one
  (`.github/workflows/build.yml`), which publishes a test release by itself when the version in
  `product.json` is new. Old plans, the old handoff diary and test evidence moved to `docs/archive/`.
- Fixed: the packaged Settings window was 2 pixels too wide at its smallest size when a status line
  was long; its title bar changed to the old development title after any setting changed.

## What was actually tested, and where

| What                                                                 | How                                               | Result              |
| -------------------------------------------------------------------- | ------------------------------------------------- | ------------------- |
| Type check, 15 check groups, long simulation, overlay in headless Chrome | `npm run verify` in the cloud (Linux)          | pass                |
| Packaged edition in real Electron: first run, chat, Local AI switch, saves, quit | `npm run verify -- --app` (Linux, pretend windows) | pass      |
| Development edition in Electron, chat windows, Chrome bridge, file visits | `npm run check dev-app conversation-ui chrome-bridge file-visits` (Linux) | pass |
| Windows and Mac ZIPs: unzip, start, save, quit, restart              | GitHub, on real Windows and Mac machines (no person watching) | see the latest run of "Build and test the apps" |
| Local AI with a real Ollama and a real model                         | —                                                 | **never tried**     |
| Everything in "Needs a person at a real computer" below              | —                                                 | **never tried** for this version |

## Needs a person at a real computer

Nobody has confirmed these for the current version. Ask the owner what happened before assuming.

- **Windows 11**: the ZIP extracts and `Mallow-Desk-Buddies.exe` opens; the tray icon near the clock
  has Settings and Quit; clicks go through the overlay everywhere except on a buddy; display
  scaling 100/150/200%; window climbing (Settings → Climb on windows).
- **Mac (Apple Silicon)**: the app opens after the "unidentified developer" prompt; menu-bar icon;
  Accessibility permission for window climbing and moving windows; clicking a buddy must not steal
  keyboard focus from the app you are typing in.
- **Both**: the chat box takes typing; right-click menu; sound; sleep and wake; a second monitor
  (the overlay only covers the main screen); how five buddies feel on an 8 GB machine.
- **Local AI**: with Ollama running and a model pulled, switch it on, talk to a buddy, check the
  answer arrives and how long it takes. Small models may answer in a form the app cannot read;
  if so the buddy answers with built-in dialogue and Settings → Local AI shows "Last try: ...".

Older real-hardware evidence (an early Mac run where the window helper compiled and moved a window)
is in `docs/archive/HANDOFF-HISTORY.md`. It predates most of the current code.

## Known problems and limits

- The apps are **not code-signed**. Windows shows "Windows protected your PC" (More info → Run
  anyway); macOS blocks the first launch (see `docs/release/INSTALL.md`). Signing costs money.
- Mac build is Apple Silicon only. No Intel Mac, no Linux build.
- The overlay covers only the main display.
- Drawn-object physics is simple: side-by-side boxes pass through each other, figures walk through
  boxes rather than pushing them, ramps only go from flat ground up to a window.
- Furniture activities only work when the figure is on the floor, not up on a window.
- The 3D hinged-book model (`src/core/prop-model.ts`, `book-model.ts`) is in use and tested, but its
  development lab page (`npm run modellab`) was paused half-finished.
- Backup export has no one-click import; recovery is by hand (`docs/release/RECOVERY.md`).
- Several source files are very large (`character.ts`, `pet.ts`, `skills.ts`, `mind.ts`,
  `props.ts`). Splitting them was considered and deliberately not done in the cleanup: it is the
  kind of change that breaks behaviour quietly. If you must split one, move code without changing
  it, one file per commit, and run `npm run verify` plus `npm run check living-soak` each time.
- `sim` and `soak` use random numbers. A rare failure is a real bug with a seed; replay it
  (AGENTS.md section 7), do not re-run until green.

## If the owner wants to sell it (paused)

There is prepared text for an itch.io page in `docs/store/` and a checklist of what must be true
before charging money in `docs/release/ACCEPTANCE.md` (real-hardware tests, seller account, payout
and tax setup that only the owner can do). Nothing is for sale. Do not publish a store page.

## Ideas the owner has mentioned (none are approved work)

Ask before starting any of these: a personalised buddy for a friend (like Arnold was for JT; see
`docs/CHARACTER-TEMPLATES.md` and how `ARNOLD_ID` is used); splitting the figures into separate
apps that talk to each other (keep `peer.ts` as the only link so this stays possible);
Minecraft-style blocks; a house on a second monitor; more things to draw (ladder, trampoline);
screenshots for the AI to "look" at the screen (privacy: needs its own clear switch); learned
movement; an Android version.
