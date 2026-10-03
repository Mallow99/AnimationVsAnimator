# Current handoff

Start here after reading the project vision in `CLAUDE.md`. This branch includes the reliability and
cleanup roadmap, followed by the owner-approved pixel-prop/Othello polish pass. It deliberately stops before
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
- Props now have solid, shaded pixel sprites: chair, couch, CRT TV, scooter, desk, easel and an
  Othello table. Their physics and existing uses remain. Sprites are editable JSON rows/palette in
  `pixel-art.ts`, with bounded validation; custom line drawings still work. No new dependencies.
- Othello replaces tic-tac-toe. He chooses the nearest stool, faces the table, reaches toward the
  board when pieces change, invites you, and reacts to the result. Rules include eight-direction
  captures, legal-move hints, automatic passes, score, ties, and rematches. A casual offline opponent
  favors corners but is beatable. No model is called to choose a move.
- The game has an independent green-and-wood panel, anchored initially beside the table and then
  draggable by its title bar. Chat stays open alongside it; the input leaves room for his speech
  bubble. Normal Offline/AI conversation cannot accidentally replace the seated match with a wave
  or another incidental action. A direct activity request can interrupt. Removing/dragging/tipping
  the table, grabbing him, closing the game, or 15 minutes without game activity ends the session.
  An unanswered invitation expires after 45 seconds. A game is not saved between app restarts.
- Optional helmet and boots are cosmetic equipment: `wear: head`/`feet`, with `where: worn`.
  They use no hands/belt slots, follow head/feet in depth order and persist as equipped or unequipped.
  Give/Wear reuses existing gear; a different piece in the same equipment location drops the old one.
  Fetching loose gear puts it on. Take, drop, return and put-away work through existing item controls.
  No armor, damage reduction, health or death behavior was added.
- Inventory cards show actual item/prop art, descriptions and clearly labeled actions. Settings has
  tighter corners, a warmer light palette and scrolling tabs. Character look presets/persona are
  unchanged. Typing 's' into preview chat no longer switches on smacking.
- Asymmetric props no longer drift sideways across save/load cycles. Their spawn and save now use
  the same center. Unedited shipped examples upgrade via `assets/builtin-history.json`, including
  furniture from both earlier revisions; customized versions are preserved.
- Windows portable packaging is available. The recipient extracts the full folder and opens the EXE;
  no Node or terminal is needed. See `WINDOWS.md`.

## Trying the additions

Run `npm start`. Settings → Items shows sprite previews. [Preview image](images/othello-preview.png). Drop in the **Othello table**, wait for it
to land, then choose **Play Othello** under the placed prop or say “play Othello”. He sits at the
nearest stool. Accept **Play Othello**: you are black and go first. Marked squares are legal; the
most discs wins. **Talk to him** opens his usual chat without ending the match. Drag the game's
title bar to move it; Escape while the game has focus closes it. Arrow keys navigate the board;
Enter places a disc. **How to play** explains the rules.

Helmet and boots are in Inventory: **Wear** equips them; **Drop it in** lets him fetch them. Use
**Take** or **Put away** in “With him”, or his right-click menu, to remove gear. He starts with just
his pen. For canvas painting, drop in the easel and use **Paint**. TV has **Change channel**. The
mace remains optional alongside the old mallet; put the mallet away to encourage using the mace.

## Checks actually run in this cloud machine

- TypeScript, normal build, 150 existing simulation checks and 22 focused regressions pass.
- The earlier reliability batch passed full simulation with seeds 1–8; this polish revision passed
  seeds 1 and 2. One earlier unseeded run reported three falls in the
  “left alone 20 minutes” check. This was not reproduced with those full-suite seeds or 100 isolated
  two-minute lives each for the original and current code. It is not claimed fixed. Investigate a
  future occurrence using the printed seed; keep the assertion. No character behavior was disabled
  to make the test pass.
- Actual Chromium preview: canvas painting, seated Othello invitation, human mouse/keyboard moves,
  flipped discs, pet reply, simultaneous chat, 64 accessible board buttons, equipment attachments,
  draggable panel, viewport bounds (including a smaller viewport), and clean closing. No browser
  exceptions. `npm run browsercheck` writes `.build/browser-smoke.png`. Chromium is a system
  prerequisite, not an app dependency; data is disposable and the server is local.
- Actual Electron under Xvfb: overlay/preload/fake helper, sprite inventory cards, Wear command,
  opening Othello and chat together, closing game while chat keeps keyboard focus, closing chat
  returning the overlay to non-focusable, live AI-interval config, memory save and quit-time flush.
  The initial desktop test caught a focus-order bug that a plain browser could not expose; fixed
  by enabling overlay typing before focusing the board. Run:

  ```sh
  npm run build
  DISPLAY=:91 XDG_CACHE_HOME=/workspace/.cache XDG_CONFIG_HOME=/workspace/.config \
    node_modules/.bin/electron --no-sandbox scripts/electron-check.cjs
  ```

  Start Xvfb on display 91 first. In this machine its binary is
  `/workspace/.cloud-tools/xvfb/usr/bin/Xvfb`. The sandbox flag is only for this container.
  Disposable app data and fake windows do not establish real Mac/Windows mouse/focus behavior.
  The smoke check also writes `.build/settings-smoke.png`.
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

This work is pushed on `codex/reliability-and-items`, based on `claude/stoic-cray-wft87a`.
Fetch/Pull that branch in GitHub Desktop; `npm ci`, then `npm start`.

Next, test this revision on the Mac: move a normal Finder/browser window, try a protected/stubborn
window, then confirm the normal window still works. Check cursor hand-back, game/talk keyboard focus,
right-click, saved canvas pictures and sound. The stale-handle Swift retry has not been compiled in
this Linux container. Test Windows tray behavior, DPI conversion, cursor and window control on a PC
before distributing the ZIP. A signed installer and automated macOS/Windows CI remain future work.

## Remaining owner requests and roadmap

Stop here until the owner resumes the multiple-character stage. No shared pet registry, shared-world
ownership, pet-versus-pet attacks, health, killing, death or respawning system was added.

The gun idea and a game machine/computer remain for a later item milestone; the first playable activity
is Othello. Additional canvas/gallery tools and a dedicated desk activity can build on this work.
The wider `CLAUDE.md` list remains: full box side collisions, ramps between more surface types, props
on window tops, multi-monitor support, further file splitting, textures and easier signed distribution.
Screen vision or real clicking needs its own explicit control and owner approval. Do not treat ideas
in the old roadmap as authorization for a character/personality redesign.

## Main files for this polish pass

- `core/pixel-art.ts`: sprite parsing and painting; furniture/items JSON holds the art.
- `core/board-game.ts`: pure Othello rules and session/opponent; `skills/props.ts`: seated activity.
- `app/game-panel.ts` / `game.css`: independent board UI; `app/renderer.ts`: shared typing/click-through.
- `core/items.ts`: worn gear attachment poses, drawing parts and saves; `settings/item-card.ts`: previews.
- `scripts/checks.ts`: rule, pass, session/chat, equipment, migration and save-position regressions.

Keep prop sprites at two screen points per rendered pixel; do not change the character's presets to
make furniture match. The legacy line-definition path remains useful for his own drawings and custom
items. Future multi-character preparation is still paused at the owner's boundary.
