# Instructions for anyone (human or AI) working on this project

Read this whole file before changing anything. It is written to be followed literally.
If something here disagrees with what the owner tells you in chat, the owner wins.

## 1. What this is

A desktop pet app. Stick figures live in a transparent, always-on-top window over your desktop.
All of their motion is made by physics and code at run time; there are no pre-made animations.
Inspired by Alan Becker's _Animator vs. Animation_.

There are **two editions built from the same source**:

| Edition                 | What it is                                                                                               | Build command           | Settings window                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| **Packaged** ("release") | "Mallow Desk Buddies". The app people download as a ZIP. Simple settings, quiet defaults, no internet.   | `npm run build:release` | `src/settings/product.html` + `product.ts` + `product.css` |
| **Development**         | Every feature and experiment: cloud AI services, Mind tab, Chrome extension, file visits. Owner's sandbox. | `npm run build`         | `src/settings/index.html` + `settings.ts`          |

Code asks which edition it is with the constant `COMMERCIAL` from `src/shared/product.ts`
(`true` in the packaged edition). Both editions are written to the same `dist/` folder, so
**whichever you built last is the one that runs**.

The owner is a high-school student who is new to code. AI writes nearly all of it.

## 2. Rules that are never broken

1. **Never edit a test so that it passes.** If a check fails, the app is wrong (or your change is).
   Fix the app. The only time a test may change is when the owner asked for different behaviour;
   then say so in your message and in the commit.
2. **`src/core/` must not import Electron, Node (`node:fs`, `path`, ...) or anything about the
   operating system.** It has to run in a plain browser. Operating-system work goes in
   `src/electron/` and reaches the pages through `window.petShell` (`src/electron/preload.ts`).
3. **Figures only affect each other through `src/core/peer.ts`** (snapshots and messages). Never make
   one figure reach into another figure's objects directly.
4. **The packaged edition never contacts the internet.** The only AI it may use is Ollama on the
   same computer, off by default. The function `offlineEdition` in `src/shared/product.ts`
   enforces this; do not weaken it. Never put API keys, save files or anything from a user's
   data folder into the app or the repository.
5. **Do not change how the figures look or move by default** (body proportions, the movement
   presets, the five personalities) unless the owner asked. Offer options; the owner chooses.
6. **No visible health bars and no permanent death.** Limbs come off and go back on.
7. **Keep it light:** no new dependency without asking the owner. Installed size stays under 1 GB.
8. **No AI model names** in commit messages, code or documents.
9. **Explain in plain language.** When you tell the owner what you did, define any jargon the
   first time you use it.
10. **Do not say something works on a real Mac or Windows PC unless a person tried it there.**
    Checks in the cloud use pretend windows. Say "passed the automated checks", not "works".

## 3. Start here, every session

Run these, in this order, from the project folder:

```bash
npm ci
```

```bash
npm run typecheck
```

```bash
npm run check core
```

If any of them fails **before you changed anything**, stop and tell the owner; do not build on a
broken base. Then read `docs/HANDOFF.md` (current state, known problems, next steps).

Do **not** read `docs/archive/` unless the owner asks about history. It is old notes, and
parts of it are no longer true.

## 4. Where things are

```
src/core/        The figures themselves. Runs anywhere (browser, tests). No OS code.
  character.ts     the body: modes, poses, walking, climbing, gestures. Tune "feel" here.
  body.ts physics.ts   joints, bones, collisions (Verlet physics)
  mood.ts          feelings (energy, happiness, boredom, annoyance, trust ...)
  mind.ts          chooses what to do (instinct; scores options from the mood)
  skills.ts skills/  the things they can do (walk, sit, draw, read, duel, gifts ...)
  brain.ts brains/ conversation: built-in dialogue, and the optional AI
  items.ts items/*.json   belongings (pen, sword, book ...). One JSON file each.
  props.ts props/*.json   furniture and drawings that came to life
  peer.ts          the ONLY way two figures interact
  pet.ts           glues one figure together; mouse input
  config.ts        every setting, its default and its allowed range
  profiles.ts      the saved buddies (five, plus the bonus one)
src/app/         The overlay page (canvas, mouse, bags, chat box). renderer.ts is the entry.
src/settings/    The Settings window (two versions, see the table above).
src/electron/    The desktop shell: main.ts (window, tray, saving), preload.ts (the bridge),
                 llm.ts (AI requests), windows.ts + native/ (reads real window positions).
src/shared/      Small things both the shell and the pages use. product.ts = edition rules.
src/lab/         Development-only pages for comparing looks and 3D props.
scripts/         build.mjs, check.mjs (runs tests), verify.mjs (runs all tests),
                 package-release.mjs (makes the ZIP), release.mjs (used by GitHub only).
scripts/checks/  Every automated test. One file per group.
docs/            HANDOFF.md (current state), MAKING-THINGS.md (item/prop files),
                 release/ (documents that ship inside the ZIP), store/ (store page text),
                 archive/ (history; do not read unless asked).
product.json     The app's name and VERSION. The version here decides the release tag.
.github/workflows/build.yml   What GitHub runs when main changes.
```

## 5. Commands

| Command                     | What it does                                                                |
| --------------------------- | --------------------------------------------------------------------------- |
| `npm start`                 | Build the development edition and run it                                    |
| `npm run start:release`     | Build the packaged edition and run it                                       |
| `npm run preview`           | Open the overlay page in a normal browser (no Electron)                     |
| `npm run typecheck`         | Find TypeScript mistakes. Also fails on unused variables.                   |
| `npm run format`            | Auto-format the code. Run before every commit.                              |
| `npm run check`             | List every check and what it covers                                         |
| `npm run check <name>`      | Run one check, for example `npm run check contact`                          |
| `npm run verify`            | Type check + all everyday checks (about 10 minutes)                         |
| `npm run verify -- --app`   | The same, plus the packaged edition running in real Electron                |
| `npm run sim` / `npm run soak` | Shortcuts for `npm run check sim` / `npm run check soak`                 |
| `npm run package win32`     | Make the Windows ZIP in `out/` (works on any computer)                      |
| `npm run package darwin`    | Make the Mac ZIP in `out/` (**only works on a Mac**)                        |

## 6. How to make a change (follow every step)

1. Find the code. Search for a word from the feature (`grep -rn "word" src`). Read the whole
   function before editing it, and read who calls it.
2. Make the smallest change that does the job. Do not rename, reorganise or "improve" nearby
   code that the task did not ask about.
3. `npm run format`
4. `npm run typecheck` — fix every error.
5. Run the checks for what you touched (table below). All must print `PASS`.
6. If you changed how something looks or moves: build, take a screenshot or run the app, and
   **look at it**. Passing tests do not prove it looks right.
7. Before you finish the task: `npm run verify`. For packaged-edition changes: `npm run verify -- --app`.
8. Commit with a message that says what changed and why, in plain words.
9. Add a short entry at the top of `CHANGELOG.md`, and update `docs/HANDOFF.md` if the current
   state, known problems or next steps changed.

| You changed                                   | Run at least                                                     |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `src/core/character.ts`, `physics.ts`, `body.ts` | `npm run check core sim contact polish`                       |
| `src/core/mind.ts`, `mood.ts`, `skills*`      | `npm run check core sim living quality-2` then `npm run soak`    |
| `src/core/items.ts`, `props.ts`, JSON files   | `npm run check core quality living model placement`              |
| `src/core/brain.ts`, `brains/`                | `npm run check conversation core sim`                            |
| Anything about several figures, fights, peer  | `npm run check roadmap quality-2` then `npm run soak`            |
| `src/app/`                                    | `npm run check browser`                                          |
| `src/settings/product.*`, `src/shared/product.ts` | `npm run check release release-app bonus-app placement-app`  |
| `src/settings/settings.ts`, `index.html`      | `npm run check dev-app conversation-ui`                          |
| `src/electron/`                               | `npm run check release release-app dev-app local-ai`             |
| `scripts/`, `package.json`, the workflow      | `npm run verify -- --app`                                        |

## 7. When a check fails

1. Read the **first** error, not the last. The log is also saved in `.build/verification/<name>.log`
   when you used `npm run verify`.
2. Run that one check alone: `npm run check <name>`.
3. `sim` and `soak` use random numbers. To replay the same run, use the seed it printed:
   `SIM_SEED=123 npm run sim` or `SOAK_SEED=123 npm run soak`.
4. Undo your change (`git stash`) and run the check again. If it still fails, the problem was
   there before you; tell the owner instead of hiding it. `git stash pop` brings your change back.
5. Fix the cause in `src/`. Do not loosen the assertion, raise a timeout, or delete the test.
6. Tests that wait for something to happen are written as "it happened at some point", not
   "the last frame looks like X". Write new tests the same way.

## 8. Recipes

### Add or change a setting in the packaged Settings window

1. The setting must already exist in `src/core/config.ts` (`PetConfig`, `DEFAULT_CONFIG`). If it is
   new, add it there with a default, and handle it in `mergeConfig` if it needs validating.
2. Add the control to `src/settings/product.html`, with an `id`.
3. In `src/settings/product.ts`: show the saved value inside `render()`, and send a change with
   `set({ key: value })` (one buddy) or `shell.setConfig({ key: value }, 0)` (settings shared by all).
4. A setting shared by every buddy must be listed in `SHARED` in `src/electron/main.ts`.
5. If the packaged edition must force a value, do it in `offlineEdition` / `productDefaults` in
   `src/shared/product.ts` and add an assertion to `scripts/checks/release.ts`.
6. Add a step to `scripts/checks/release-app.electron.cjs` that changes the control and checks the
   figure's config changed. Run `npm run check release release-app`.

The Local AI card (`aiMode`, `aiModel`, `findModels` in `product.ts`) is a complete worked example.

### Add an item or a piece of furniture

Read `docs/MAKING-THINGS.md`. A user can add one with only a JSON file in their items folder; no
code. To make it built in, copy how an existing one is wired: search for `quillDef` in
`src/core/items.ts` (items) or `lampDef` in `src/core/props.ts` (furniture) and do the same for yours.
Then `npm run check core living quality model`.

### Add a check

1. Create `scripts/checks/<name>.ts`. Copy the top of `scripts/checks/contact.ts` (the `test()`
   helper, the fixed random seed, the `pets()` helper).
2. Add one line to the `CHECKS` list in `scripts/check.mjs`. Put `true` in the fourth position if
   it should be part of `npm run verify`.
3. `npm run check <name>`.

### Ship a new build (Windows and Mac ZIPs)

GitHub builds the apps; you do not build them by hand.

1. Everything is committed and `npm run verify -- --app` passes.
2. Raise `"version"` in `product.json` (for example `1.0.0-rc.5` to `1.0.0-rc.6`). A version that
   is already public is never replaced.
3. Update the version in the download links at the top of `README.md` (three places), and the
   "Last updated" line in `docs/HANDOFF.md`. If features changed, update
   `docs/release/RELEASE-NOTES.md` and `docs/release/FEATURES.md` (they ship inside the ZIP).
4. Get the change onto the `main` branch (the owner must ask for this; do not push to `main` on
   your own).
5. GitHub runs `.github/workflows/build.yml`: all checks, two long soaks, builds both apps on real
   Windows and Mac machines, starts each one, then publishes
   `https://github.com/Mallow99/AnimationVsAnimator/releases/tag/v<version>`. About 30 minutes.
6. If a job fails, open its log, fix the cause, push again. Nothing is published on failure.

The Windows ZIP is the folder to send someone: they extract all of it and open
`Mallow-Desk-Buddies.exe`. It is not code-signed, so Windows shows a "protected your PC" warning
once (More info → Run anyway).

### Local AI (Ollama)

The app talks to Ollama at `http://127.0.0.1:11434` (the same computer). It never downloads a model.
To try it for real: install Ollama, run `ollama pull llama3.2:3b`, start the app, then
Settings → Local AI (packaged edition) or Settings → General → Brain → Ollama (development edition).
The request code is `src/electron/llm.ts`; what is asked and how replies are read is `src/core/brain.ts`.
`npm run check local-ai` tests it with a pretend server, so it has **never been tried with a real
model in the packaged edition** until a person does.

## 9. What cannot be tested in the cloud

The automated checks run on Linux with pretend windows. Only a person at a real computer can
confirm: clicks passing through the overlay, staying on top, window climbing on real windows, the
macOS Accessibility permission, moving the real cursor and windows, sound, multiple monitors,
sleep/wake, and the Windows "unknown publisher" prompt. When you finish work that touches any of
these, list them for the owner as "please try this on your computer".

## 10. Saves and test switches

- Saves live in the user's app-data folder (`animation-vs-animator`): `pet.json`, `pet-2.json` ...
  (settings per buddy), `memory*.json`, `product-state.json`. Never ship or commit these.
- `PET_DATA_DIR=/some/folder` makes the app use a throwaway save folder. Use it for experiments.
- `PET_FAKE_WINDOWS='[{"id":1,"x":100,"y":500,"w":400,"h":300}]'` gives the app pretend windows.
- Renaming the app must never lose saves: `legacyDataName` in `product.json` stays as it is.
