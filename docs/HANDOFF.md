# Current handoff

Start here after reading the project vision in `CLAUDE.md`.

## Latest: sword fights rebuilt (stances, real moves, health instead of knockdowns), and the line between figures

Owner's asks: fights felt flat, they knocked each other over again and again, didn't always draw their weapons,
and the basic swing "looks so basic". Look at references and upgrade. Keep in mind: later Blurp and Leonard
become separate apps that run at the same time and interact; ideally a "master" app makes new stick figures,
produces an app for each to give to people, and all of them can interact.

References used: Alan Becker's fights (big wind-ups, smear-fast cuts, holds after a hit, using the space),
Nidhogg (three stance heights, thrusts, parries that throw you off balance, disarms), Sekiro (posture: blocks
and parries wear you down until you're open), kendo/iaido (stances, overhead cut, the dash-through draw cut).

- **Always swords** (`skills/duel.ts`): foam sword in play fights, katana in real ones (two-handed, `off: 'hilt'`).
  He draws it with a twirl at the start; disarmed (a parried heavy cut), he goes and picks it up; only if you're
  holding it does he fight with fists and feet. `Duel`'s old `armed` flag is ignored (always true).
- **Moves** (`skills/swordplay.ts`): keyframed poses in his own frame (`MOVES`): cut, thrust (lunge), rising cut
  (launches), heavy (two-handed overhead, breaks guards), smash (the mace), spin (a full turn through the front
  view), flurry, dash (iai dash-through, passes in front in depth), aircut (jumping), parry, draw, twirl;
  `STANCES` mid/high/low; blocks at three heights. `SwordMove` plays one; `guardPose` holds a guard. Body side
  (`character.ts`): `FightPose` (grip, blade angle, off hand, lean, crouch, fencing `stance` spreading the feet,
  `act` = the cutting part, `parry`, `block`), `fightVX`/`fightZ` (moves drive his feet and depth), shuffle
  footwork, `spin()`, `leap()`, `stumble()`, `fightHands()`. Items got `aimLocal` (aimed in his frame).
  The cursor swings (`SwordSwing`) use the same moves now; the old wind-up/slash/follow swing is gone.
- **Health and poise instead of knockdown counting** (`fighting.ts` `HITS`, `Pet.takeHit`): clean hits take
  `hp` and `poise`; blocks only poise; at 0 poise he staggers (open, not down). He goes down only to a sweep,
  a big hit while staggered, or the knockout (hp 0: `slowmo` for everyone, renderer slows all figures).
  Launched, he flips and lands on his feet (`knock` no longer ragdolls mid-air hits). Hit into the screen
  edge, he bounces off it. A hit stops a lunge dead. Health isn't shown anywhere (AGENTS: no health bars).
- **Blades meeting**: `Pet.bladeOnOthers`: both mid-cut = clash (both bounce, sparks); their parry = I'm thrown
  off balance (maybe disarmed); their block (right height: `HIT_HEIGHT`) = blocked; a sword idly on guard is in
  the way 25% of the time. Cuts land once per `act.id`. Real fights: limbs come off / run through only once the
  target is worn down (hp < 0.8), so they build up.
- **Fight AI rhythm**: tempo `circle` (blade tips just touching, guard height changes, depth drift, showing off)
  → `press` (a string of moves from `STRINGS`, closing in fast) → `break` (hop/backflip out) → circle.
  Defense reads `FighterView.move.hitIn`: misses the tell sometimes (slower = more), parries (timing),
  blocks (guesses the height, 75% right), dodges, or trades. Punishes staggers with big moves, rising cut
  against someone in the air, heavy/sweep/kick against a turtle, vaults over or dashes past when cornered.
  Ends: knockout, a limb (real), the other one stopping (`foeGone`), or a 70-100 s limit.
- **Look**: blade smears (only on the cutting part; crescent, pixelated, `Pet.trackSmear/drawSmear`), turned a
  little to you on guard, whoever's nearer drawn in front (renderer sorts by hip depth), a soft push so they don't
  stand inside each other (`bumpOthers`).
- **The line between figures** (`src/core/peer.ts`): a figure only sees another as a `FighterView` (plain-data
  snapshot) and only acts on it with `PeerMsg` messages (`hit`, `blocked`, `clash`, `challenge`, `backup`, `ko`);
  the one being hit decides what the hit does. `Pet implements Peer`; `others: Peer[]`; `ctx.foe()` returns a
  view. Nothing else crosses, so a figure in another app can be plugged in by sending these over a connection.
  A check runs a whole fight with every snapshot and message going through JSON.

Measured headless (scratch fight lab, 8-10 seeds each): play fights 24-77 s, all but one ending in a knockout,
1-2 times off their feet including the knockout, sword in hand 96-99% of the fight, 5-46 blade clashes.
Real fights 7-72 s (most 18-55): knockout, a limb, or run through. Checked: typecheck, 34 focused checks (new:
play fight, real fight, fight over JSON), sim seeds 1 and 2, Chromium browser check, Electron check under Xvfb.
Pictures: docs/images/sword-moves.png, docs/images/swordfight.png. Not run on a Mac or PC.

### Toward separate apps (owner's plan, not built)
1. **Transport**: each app finds the others on the same computer (a small local server on a fixed port range, or
   a shared folder of "who's running" files) and sends `FighterView` ~30 times a second plus `PeerMsg`s. A remote
   figure is drawn by the receiving app from its views (a "ghost" with the joints it sent), like a network game.
2. **Shared screen**: furniture/props and windows are per app today (props are shared in-process); decide who
   owns shared props, or keep each figure's props its own.
3. **Studio app**: the current settings + a "make a figure" flow (name, color, look, persona, items), then
   **Export** builds a packaged app with that figure baked in (electron-builder/packager, like package-win).
4. **Different computers** (a friend's figure visiting yours) needs a relay server online; same-computer needs none.

## Earlier: two equal stick figures, real fights, and two bug fixes

Owner's asks: Blurp ragdolled a lot "in front of things"; legs showed through boots; fights were the same
slash over and over with no knockback, kicks backwards, no fighting smarts; the friend should be a second
main stick figure with their own GUI in their color, talked to and handled the same way.

- **Ragdolling in front of things** (probably also the "TV physics box" report): standing in front of
  anything taller than his shoulders (TV, easel), his neck "landed" on its top edge = `headDown` = trip. Upright,
  only feet (and hips when sitting) collide with platforms now (`Character.step`, `onThings`). Not the helmet.
- **Boots**: depth-sorted by the foot alone; the leg drew over them when the knee was nearer. Now just in front
  of their own leg (`equipmentPoses`).
- **Fighting**: `Character.knock(vx, vy, launch, stun, down)` (skid back on the ground with a hard stop, or whole-
  body launch / knockdown), `hitstun`, `faceLock` (keeps facing the opponent while stepping back: kicks went
  backwards because walking turned him to face his drift), `attack` (what move, how far, still winding up?),
  `aimAhead` (attacks always go forward). New gestures `jab`, `uppercut`, `frontkick`, `sweep`; strikes carry an
  `AttackKind`. `Pet.takeHit` uses `KNOCK[kind]` (pet.ts); blocking (guard/sword, facing) recoils the attacker,
  sweeps go under. `skills/duel.ts` is a fighting CPU (reaction time/aggression from mood; block/dodge on wind-ups,
  jump sweeps, footsies, range-based moves, combos on hitstun, sweeps vs blockers, juggles, pressure on getup;
  sword footwork + kicks); three knockdowns wins. Knockdowns no longer end the duel (mind `tripped`/`crashed`);
  a challenge makes the other one square up too (`challenged`). Tests seed `Math.random` for fights.
- **Two equal stick figures**: main.ts keeps `configs[0..1]` (pet.json, pet-2.json; first time, pet-2 is made from
  `friendConfig` with `friend.name/color`), `SHARED` keys kept equal in both, a settings window per id
  (`settings/index.html?pet=N`; preload reads `petId`), memory files memory.json / memory-2.json, stats and
  collections routed by id, `brain:ask` per id, tray entries for both. renderer.ts is a `pets[]` list:
  each has its own save (`pet-save`, `pet-save-2`; old `friend-*` keys are picked up once), talk box in their
  color for whoever you double-click, its own settings; the Othello window follows whoever invited you.
  Settings page themes itself (`theme()`: `--accent`, `--accent-ink`) in its figure's color.
- Build: `dist/items` is cleared before copying examples (retired files were still shipping).

Checked: typecheck, 33 focused checks, full sim seeds 1 and 2, Chromium browser check, and the **Electron
check under Xvfb** (the Electron binary downloads in this container now): two settings windows in their own
colors, per-figure config changes, shared settings in step, talking to the second one, memory-2.json, pet-2.json.
Not run on a Mac or PC.

## Earlier: his friend, fights, and fixes from the owner's test

The owner tested this branch and asked for: straight boots, the Othello table removed (Othello stays on the
TV; I first misread this and removed the game too, then restored it), a friend with a combat system,
fixes for items knocking the cursor, the TV's physics box looking different from its drawing, sitting
sideways looking weird, the mallet removed, and a circuit-board look for the Mind tab.

- **Friend** (`config.friend`, `friendConfig()` in config.ts): a second `Pet` in the same overlay
  (`renderer.ts`: `syncFriend`). It shares the main pet's `Props` (`new Pet(bounds, cfg, { props })`;
  `ownsProps` false: the main pet steps, draws and saves the furniture). Own items, mood, mind (offline: no AI
  calls), save (`friend-save` / `friend-memory` in browser storage). Input goes to whichever one you click.
  `Pet.others` links them; `ctx.foe()` tells skills about the other one. Talking to the friend isn't built.
- **Fights** (`config.fightMode`: play | real). `skills/duel.ts` `Duel`: close in, swing (`SwordSwing` now takes
  a target, an item and `keepOut`) or punch/kick, back off, call it after 14 to 24 s. Hits between pets:
  `Pet.strikes` (fists/feet), `bladeHits` (swords), `flyingItems` (thrown things) → `hitFriend` → `takeHit`:
  blocking (sword out or fists up, facing the attacker), knock-back (foam barely), and in real fights with a
  `cuts` item: a limb comes off (`Character.detach`, so `Reattach` takes over) or a body hit runs him through
  (`stayDown` for 2.5 to 4 s). Mind: `duel` option (playful/bored/excited, 90 s cooldown), `hitByFriend` (fights
  back), `friendFighting` (backs him up against your cursor). New items: `foam-sword`, `katana` (`cuts: true`).
- **Your throws no longer hit your cursor**: letting go of a carried item counted as a throw starting on your
  cursor. `Item.thrownBy` ('him' | 'you'); only his throws and swats knock the cursor.
- **Seated poses**: furniture is front-on, so on a seat he turns mostly toward you (`SEAT_TURN` per style),
  knees apart over the seat edge (`seatPose`), lounging hands on the cushion. Lying stays side-on.
- **Mind tab**: `config.mindLook` head | circuit; `circuit()` in settings.ts draws the same `projected`
  hit-test data as a PCB (mood pins → bus → choice chips → processor; AI chip).
- Boots are straight sleeves on the shin. The mallet is gone (unedited copies are removed from the items folder
  via `builtin-history.json`). Othello stays on the TV; a hit from his friend doesn't break up your match.
- **TV mismatch: not reproduced.** Outline vs drawing checked resting, dragged, knocked over and stacked:
  they line up. Waiting on a screenshot from the owner.

Checked: typecheck, 32 focused checks (new: friend config/shared props, play fight, real fight, team-up, your
throws vs your cursor), full sim on seeds 1 and 2, Chromium browser check (friend present). The fight checks
are random; they passed 6 runs in a row. Not run on a Mac or PC; the Electron check wasn't re-run here.

## Earlier: house art style, and games on the TV

The owner set the art direction: **props are flat and front-on, in the same smooth style as him, and get
pixelated with him at his own pixel size** (he lives at pixel size 2; bigger pixel sizes aren't a target).
The reference is an *Animator vs. Animation* frame of three stick figures on a couch: the couch is drawn
straight-on with no perspective, in muted grey-beige with soft two-tone shading and a faint stripe; the
characters are bright, flat and outline-free on top of it. He still turns to face things side-on.

- `props.ts`: prop `shape` pieces can be filled (`rect` + `radius` + `fill`, or `pts` + `fill`), painted in
  order. Flat props render smooth, then through `PixelLayer` at `look.pixel` (`Props.draw(ctx, now, pixel)`).
  Older sprite props keep their own 2-point grid. A TV screen paints on top of a flat body.
- `couch.json` and `tv.json` are redrawn in that style. The couch is sized so a seated Blurp's head just
  clears the backrest (as in the reference); its solid outline is armrests + seat (the backrest is behind
  him, not something to stand on). The TV sits on a cabinet with a console and a second controller.
- **The Othello table is gone; games are on the TV.** `skills/props.ts` has one `AtTheTV` base (couch or
  chair near the TV, else the floor; faces it) with `WatchTV`, `PlayVideoGame` (`videogame`: his solo runner
  game, `tv-game.ts`, with fumbles that depend on mood, and reactions to crashes/records) and
  `PlayBoardGame` (`playgame`: Othello with you; the board mirrors onto the TV). `Character.gamepad` /
  `padMash` hold a controller in both hands (`render.ts` `controllerPart`).
- Settings → placed TV has Watch TV / Video games / Play Othello / Change channel. Chat understands
  "video games" and "play Othello"; the AI prompt lists `videogame` and `playgame`.
- `builtin-history.json` now records the previous shipped tv/couch/table, so unedited copies in the items
  folder upgrade, and an unedited old `board-game.json` is removed (`main.ts`); edited ones are kept.
- Every shipped prop and the helmet, boots and mace are now flat art ([all props](images/props-preview.png)).
  Chair, desk, easel are front-on; the scooter is side-on (wheels only read from the side). Items support
  `fill` shapes (`items.ts`), mirrored for boots. Pen, sword and ball were already smooth strokes in
  his style and are unchanged. Settings cards draw flat art and screens (`settings/item-card.ts`).
- Seating styles (`Character.seatStyle`: up / lounge / front / lie; he picks in `SitOnProp`, sprawling more
  when sleepy or sad). `front` turns him out to face you (three-quarters toward the way he faces);
  `lie` (couch only) lies along the cushions, head propped on the armrest behind him, feet toward the TV,
  one knee up, controller on his belly when gaming.
- More AvA references from the owner (not committed; they're Alan Becker's frames): environments the
  animator draws are thin black line art on white (stairs, doors, walls), which is what his own drawings
  already look like; items in the desktop fight are bright, flat colored segments; a pose sheet shows
  lying, crouching and flailing silhouettes. Furniture stays filled and muted per the couch reference.

Checked in the cloud machine: typecheck, 27 focused checks (new: TV Othello, couch from either side, video
game on/off, runner timing, flat-art parsing, couch poses, flat items), full sim on seeds 1 and 2, and the Chromium browser check.
The Electron/Xvfb check was updated for the TV but not re-run here. Not run on a Mac or PC.

## Previous round (Codex: reliability, items, polish)

(Since changed: the table and the mallet are removed, Othello is on the TV, furniture is flat art. Read the rest as history.)

This branch includes the reliability and
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
- Props got solid, shaded pixel sprites: chair, couch, CRT TV, scooter, desk, easel and an
  Othello table (couch/TV since redrawn and the table replaced; see above). Their physics and existing uses remain. Sprites are editable JSON rows/palette in
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

Run `npm start`. Settings → Items shows previews. [Preview image](images/tv-couch-preview.png). Drop in the **TV**
(and the couch), wait for them to land, then choose **Play Othello** under the placed TV or say “play Othello”.
He sits on the couch (or the floor), picks up a controller and invites you. Accept **Play Othello**: you are black and go first. Marked squares are legal; the
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

New props use the flat style and follow his pixel size; never change the character's presets to make
furniture match. Older sprite props keep their two-point grid until they're converted. The legacy line-definition path remains useful for his own drawings and custom
items. Future multi-character preparation is still paused at the owner's boundary.
