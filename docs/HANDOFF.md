# Current handoff

Start here after reading the project vision in `CLAUDE.md`. This batch follows the reliability and
cleanup roadmap, with item/activity improvements added by the owner. It deliberately stops before
the multiple-character stage. The existing persona, body design and look presets are preserved.

## What changed

- AI response parse errors now reach the error handler and allow later conversation. Replies from an
  older mode/provider/persona are ignored, including after switching Offline. Failed autonomous
  thoughts release the instinct hold. Full mode has 40-second, 2-minute and 5-minute controls; the
  original 40-second default is retained. Event comments slow with that choice. Detailed body and
  drawing guides are omitted from ordinary conversation, without changing his persona.
- Settings and memory use serialized atomic writes; settings flush on quit. Invalid saved moves,
  gallery data, prop positions and custom-definition geometry are filtered. Model-list responses
  from a previous provider cannot overwrite the current provider's list.
- One stuck/protected window gets a 60-second backoff, instead of disabling all windows for ten
  minutes. Other windows remain usable. Stale Mac AX handles are refreshed and retried once.
  Windows handles retain their full identity instead of masking the high bits. Helper spawn/pipe
  failures are handled and timers stop on shutdown. Screen awareness can run independently of climbing.
- Bridge ends attach to windows, follow their movement, release a vanished endpoint, and tear free
  when pulled beyond rope length. Full rigid-body side collisions and general route planning remain
  future work; boxes can still overlap sideways.
- `skills/context.ts` holds skill contracts and the common arrival helper. `skills/props.ts` holds
  chair/TV/scooter/game activities. The original `skills.ts` exports are kept for compatibility. The
  larger movement/combat files are only partly split; no wholesale behavior rewrite was attempted.
- The pen is slightly longer and more legible. Fast weapon hits include the tip's path between
  frames, and taking a weapon mid-swing cancels the action. A toy mace is an optional new item with
  a slower overhead wind-up; the old mallet remains in inventory/saves. Wide loose items render
  without clipping. The scooter exits on the correct side. TV has channel controls and small detail
  improvements; scooter details are slightly clearer.
- New props: a sturdy desk, an easel canvas he can paint on, and a tic-tac-toe board. Canvas pictures
  move with the easel and survive saving. The game is offline, beatable, and uses a small panel above
  him. He can invite you when bored/playful, at most once per five minutes; you can decline. Removing
  the board, interrupting him, or closing the panel cancels the session. It adds no second pet system.
- Unedited shipped pen/TV/scooter files upgrade automatically. `assets/builtin-history.json` records
  their earlier defaults; customized versions are preserved. New examples appear once each.
- Windows portable packaging is available. The recipient extracts the full folder and opens the EXE;
  no Node or terminal is needed. See `WINDOWS.md`.

## Trying the additions

Run `npm start`. Settings → Items contains the mace and the Canvas, Desk and Board game props.
Drop in the canvas, wait for it to land, then use **Paint** or tell him “paint on your canvas”.
Drop in the board, then use **Play together** or say “play a board game”. Join the invitation; you
are X and he is O. Change the TV channel from its row in Items. To try the mace, give it to him;
put away the mallet if both are equipped and he keeps choosing it.

## Checks actually run in this cloud machine

- TypeScript, normal build, 150 existing simulation checks and 15 focused regressions pass.
- Full simulation passed with seeds 1–8. One earlier unseeded run reported three falls in the
  “left alone 20 minutes” check. This was not reproduced with those full-suite seeds or 100 isolated
  two-minute lives each for the original and current code. It is not claimed fixed. Investigate a
  future occurrence using the printed seed; keep the assertion. No character behavior was disabled
  to make the test pass.
- Actual Chromium preview: paints a canvas, invites a game, accepts a button click, responds with
  its own move, renders accessible board buttons, keeps the panel on screen and closes cleanly.
  `npm run browsercheck` reproduces this and writes `.build/browser-smoke.png`. Chromium is a system
  prerequisite, not an app dependency. The browser uses disposable data and a temporary local server.
- Actual Electron under Xvfb: overlay renderer, preload bridge, fake window updates, settings,
  live AI-interval changes, memory persistence and quit-time settings flush pass. Reproduce with:

  ```sh
  npm run build
  DISPLAY=:91 XDG_CACHE_HOME=/workspace/.cache XDG_CONFIG_HOME=/workspace/.config \
    node_modules/.bin/electron --no-sandbox scripts/electron-check.cjs
  ```

  Start Xvfb on display 91 first. In this machine its binary is
  `/workspace/.cloud-tools/xvfb/usr/bin/Xvfb`. The cloud-only sandbox flag is needed by this container;
  normal Mac/Windows `npm start` does not use it. The smoke check uses disposable app data and fake
  windows; it does not demonstrate real OS window movement.
- A Windows x64 portable build was produced and inspected for its executable, built pages, items,
  native PowerShell helper and start guide. Source maps, development dependencies, user data and
  keys are excluded. It was **not launched on Windows**. ARM packaging is available but untested.
- No real AI-provider call was made or key requested. Provider model availability is still dynamic;
  use **Find models** rather than assume the old OpenRouter model ID is valid.

## Commands

```sh
npm ci
npm run typecheck
npm run sim
npm run checks
npm run build
npm run browsercheck       # optional Chromium functional check
npm run package:win        # portable Windows x64 build; refuses to overwrite an existing release
```

Replay a simulation with `SIM_SEED=7 npm run sim` (PowerShell: `$env:SIM_SEED=7; npm run sim`).
Dependencies are locked. Node 24 LTS is the tested toolchain. In the cloud, use a writable npm cache
and Node's environment-proxy support when downloading Electron; saved environment instructions
capture these steps. Do not disable TLS, signature or checksum verification.

## Hardware evidence and next steps

The owner supplied this Mac log: the helper saw two windows and successfully moved one with
Accessibility, then reported AX error -25202 and could not find another app's window. This establishes
that compilation and permission worked on that run. It does not establish that every window is movable.

Next, test this revision on the Mac: move a normal Finder/browser window, try a protected/stubborn
window, then confirm the normal window still works. Check cursor hand-back, game/talk keyboard focus,
right-click, saved canvas pictures and sound. The stale-handle Swift retry has not been compiled in
this Linux container. Test Windows tray behavior, DPI conversion, cursor and window control on a PC
before distributing the ZIP. A signed installer and automated macOS/Windows CI remain future work.

## Remaining owner requests and roadmap

Stop here until the owner resumes the multiple-character stage. No shared pet registry, shared-world
ownership, pet-versus-pet attacks, health, killing, death or respawning system was added.

The gun idea and a game machine/computer remain for a later item milestone; the first playable activity
is the board game. Additional canvas/gallery tools and a dedicated desk activity can build on this work.
The wider `CLAUDE.md` list remains: full box side collisions, ramps between more surface types, props
on window tops, multi-monitor support, further file splitting, textures and easier signed distribution.
Screen vision or real clicking needs its own explicit control and owner approval. Do not treat ideas
in the old roadmap as authorization for a character/personality redesign.
