# AnimationVsAnimator — project brief

A desktop pet: a procedural stick figure living in a transparent, always-on-top,
click-through overlay. Inspired by Alan Becker's *Animator vs. Animation*.
No pre-baked animations — all motion comes from physics + procedural controllers.

## Working rules
- The owner is a high-school student, new to code. Claude writes nearly all of it.
  Explain decisions in plain language; define jargon the first time.
- Work in milestones. Each ends with something the owner can run and see.
  Go as far as can be verified in the cloud container; stop where only a real Mac/PC can confirm.
- Commit after every working step with a clear message.
- When something breaks: explain what went wrong and why, then fix.
- Look/feel/behavior choices: offer options, let the owner choose.
- Keep it LIGHTWEIGHT: total install < 1 GB, few dependencies, no ticket/process overhead.
- No model identifiers in commits or code.

## Architecture
```
src/core/      Platform-free TypeScript. Physics, body, skills, mood, mind, rendering.
               Must never import Electron, Node, or OS APIs. Runs in any browser view.
src/app/       The overlay page (canvas + input). Talks to the shell via a tiny bridge
               (window.petShell). Also runs in a plain browser as "preview mode".
src/electron/  Desktop shell (macOS + Windows): the transparent window, click-through,
               and later OS adapters (window positions, etc.) behind one interface.
android/       (future) Kotlin overlay hosting src/app in a WebView.
scripts/       Build (esbuild), headless physics sim tests, browser preview.
```

Layers inside core:
1. **Body** — 3D Verlet physics (joints = points with depth z, bones = fixed-length sticks) in a thin
   depth band in front of the screen. "Muscles" pull joints toward a target pose; strength 0 = ragdoll.
   Poses are built in his own frame (forward/up/left, `off()`, `basis()`), 3D two-bone IK with pole
   directions bends knees/elbows. Drawing is flat (x, y); z only sorts what's in front and shades.
2. **Skills** — small controllers: walk_to, jump, sit, sleep, stomp, chase/avoid cursor, say...
3. **Mood** — needs/emotion dials (energy, happiness, boredom, annoyance, trust).
   Events move dials; dials shape posture, speed, and reactions (e.g. ignores pokes when sad).
4. **Mind** — picks skills. Three modes (config):
   - Mode 0 offline: instinct (utility scoring over mood) + emotes/canned lines.
   - Mode 1 chat: same, plus an LLM only for conversation.
   - Mode 2 full: LLM also picks goals every several seconds / on events. Never drives joints.
   LLM provider swappable (cloud API or Ollama/OpenAI-compatible). Throttled.
5. **Cheap learning** — remembers outcomes (e.g. a big drop hurt → wary of big drops).

## Roadmap
1. Overlay + ragdoll body, drag/drop/throw, gets back up.            
2. Walk/jump/idle/sit/sleep, mood engine, offline reactions (Mode 0).
3. Window awareness (windows are platforms), cursor awareness, follow across desktops
   and optionally walk to another desktop on his own (fakes the desktop-switch shortcut).
4. LLM modes 1 & 2, speech bubbles, `pet.json` persona (name, persona, color, model).
5. Memory file, periodically summarized. ✅
6. Interacting with other apps, incl. drawing with his OWN pen (not the user's cursor),
   e.g. hosting JS Paint (jspaint.app) inside our app.
7. Learned movement (experimental; physics runs headless for training).
8. Customization (accessories/items with definition files), tray settings, packaging.
Then: Android shell.

## Status
- Milestone 1 ✅ overlay, ragdoll, drag/poke/throw, getting up.
- Milestone 2 ✅ walking/running/jumping/sitting/sleeping, gestures, mood engine,
  offline instinct mind (`src/core/mind.ts`), speech bubbles, petting, mood saved in localStorage.
- Verified in the cloud container: physics + mind via `npm run sim`, rendering via
  headless Chromium screenshots, Electron launch under Xvfb. NOT yet verified on a real
  Mac/PC: click-through, always-on-top, feel.

- Design pass ✅ Owner picked: Straight stance, Quick steps, Deep blurple, Chunky, Pixel S → defaults.
  Name: Blurp (placeholder; owner may want something based on "Mallow" later). Stands tall, subtle mood hunch.
- Settings window ✅ (src/settings): mood bars, look/movement presets + sliders, name, size, smack
  mode, mind mode (only offline enabled). Config = `src/core/config.ts`, saved by main as
  userData/pet.json, broadcast to all windows over IPC. Menu-bar/tray icon; Dock icon hidden on macOS.
- Smacking is a toggle (off by default). Owner later wants weapons/items to hit him with, and him
  hitting back / moving the cursor (items milestone).

- Milestone 3 (window awareness) — built, needs testing on a real Mac/PC:
  - `src/electron/windows.ts` runs a per-OS helper (`src/electron/native/`): Swift on macOS
    (compiled once with `xcrun swiftc`, cached in userData/bin), PowerShell+C# on Windows.
    Each prints window rects as JSON lines; main converts to overlay coords and sends them over IPC.
    `PET_FAKE_WINDOWS='[...]'` env var injects fake windows for testing.
  - `src/core/world.ts` turns rects into platforms (visible top edges only; covered parts removed).
  - Character: one-way platform collision, `support` (what he stands on), carried when a window
    moves, falls when it vanishes / he walks off. Skills: ClimbOnto, GetDown. Mind: climb/getdown/
    "stuck" options. Cheap learning: `lessons.safeDrop` shrinks after a painful jump down, grows
    after a good one; saved with his mood.
  - Preview mode draws two fake windows to climb.
  - NOT done yet: following across desktops (Spaces) is just "visible on all workspaces";
    walking to another desktop on his own is not built.

- Round of owner feedback (fixed): legs now lock straight (hip height was measured from the floor,
  not the feet) + stance width; smooth window riding (track window x, glide between updates,
  adaptive 60/10 Hz polling); macOS focus hand-back via the Swift helper (Electron 44 bug
  electron/electron#53889: panel windows activate the app); Control tab (commands, say) and
  draggable mood bars + presets; moods have causes (AFTERGLOW in mind.ts, energy from moving,
  greeting/loneliness); short rest between activities; `why` shown in settings.
  Owner says: AvA-style = legs straight when standing. Offered to share reference images.

- Last session before the AI milestone (built, sim-tested; Mac/PC test pending):
  - Climbing (`climb`/`ceiling` modes in character.ts, walls from `windowWalls` in world.ts):
    window sides + screen edges, monkey bars across the top of the screen, pull-up onto
    windows, climb-down. Route planner `routeTo` in skills.ts (jump → side → over the ceiling).
    Window tops without headroom for him aren't platforms (most Mac windows sit under the menu bar).
  - Diagnostics: Terminal prints `[windows] window helper compiled` / `helper running: sees N window(s)`;
    settings → General shows how many windows he sees. Owner's first Mac run only showed
    "compiling…" — next run should tell us whether the Swift helper works.
  - Animations: stretch, laugh, continuous dance, AvA-style run. Petting: easier + hearts + 'nuzzle'.
  - Mischief mode (off by default): GrabCursor skill drags the real cursor (Swift helper
    CGWarpMouseCursorPosition / PowerShell SetCursorPos via stdin "cursor X Y"); moving the
    mouse frees it. Doodles (`src/core/doodles.ts`): he draws small pictures with his own pen;
    they fade after 150 s.
- Polish round (built, sim-tested): grip system in character.ts (`grip`/`releaseGrip`: a gripped
  hand is pinned in place, the body hangs from it). Climbing is real hand-over-hand (pull until the
  top hold is at his chin, other hand reaches 0.75 arm past it and latches); monkey bars the same
  along the top of the screen; legs bend up toward the wall. `leapAt(wall)`: runs and jumps at a wall,
  catching it mid-air. Mood gaits (`gait`: normal/pocket/skip/stomp/sulk, set by the mind from his
  mood) and a dedicated run cycle (`runPose`). Cursor glances instead of constant staring.
  The grip system is meant to be reused for items later.
- Climbing smoothness fix: grips slide onto holds (no teleport); pulls and reaches are timed, eased
  motions that overlap a little (reach starts at 65% of the pull); the reaching hand travels in an arc.
  Feet stand on footholds and step one at a time; knees bend TOWARD the wall (was flipped = "spider legs");
  hips move out from the wall when a foot is high so the knee has room. ~56 px/s up a wall.
- Milestone 4 (AI brain) — built, sim-tested with a fake AI and end-to-end in Electron with a faked web response;
  a real call NOT yet tried (needs the owner's free key). Owner has no money for paid APIs: FREE services only.
  - `src/core/brain.ts` (platform-free): decides when to ask, builds the prompt (stable system prompt = persona +
    rules + body guide; each turn = a [state] block with mood/doing/where/recent events + what you said), parses the
    reply `{say, do, move}` leniently (finds JSON in fences/extra text). Chat mode: only when you talk to him. Full mode:
    thinks every ≥40 s when idle (instinct waits up to 8 s via `mind.holdUntil`), comments on notable events
    (≥15 s apart). Cap: 120 calls/hour. Remembers 8 exchanges.
  - Body control (owner asked for it: "weird things he couldn't normally do"): `move` = up to 16 keyframes / 10 s,
    positions [x forward, y UP] in px from the ground under him; parts left out stay put, elbows/knees/head
    auto-bent. `Character.puppet()` / 'puppet' mode: muscles (0.3) pull toward interpolated poses, NOT internal,
    so he can levitate; physics still applies; ends in 'air' so he lands/crashes normally. `PuppetMove` skill,
    `mind.perform()`. Config `puppet` (on by default).
  - `src/electron/llm.ts`: plain fetch to OpenAI-compatible chat completions (no SDK, no new dependency).
    Providers in config.ts `PROVIDERS`: Google Gemini (default, model `gemini-flash-latest`), Groq (default model `openai/gpt-oss-120b`), OpenRouter
    `:free` models. JSON mode, retried without it on a 400. "Find models" lists what the key can use (model names
    change often). Keys per provider in userData/brain-keys, encrypted with safeStorage.
  - The Claude SDK version was dropped (owner can't pay); it's in git history if ever wanted.
- Owner's first real tests (Groq, openai/gpt-oss-120b): works, but one action per reply, "[hop]" tags in the log,
  and a mean message got a ChatGPT-style crisis answer. Fixed in the next round:
  - Replies are `{say, feel, plan}`: plan = up to 8 steps in order (`do`, `say`, `wait`, `walk`, `move` + name,
    `replay` a saved move, `draw` strokes -50..50 y-up). `PlanSkill` in mind.ts runs them; `mind.makeSkill()` builds
    any command. `feel` nudges his mood (±0.4). Prompt rewritten with examples: in his own voice, never helpdesk/
    therapist; takes insults personally; EXCEPTION: if the person says THEY are in danger, he drops the act and
    points to a trusted adult / 988. Chat log shows actions as a grey "*hop ×3*" line (`describePlan`).
  - 2.5D: `yaw` angle (0 right, π left, π/2 facing you). Physics stays 2D; poses use `turnF`=cos(yaw) for forward
    offsets and `turnS`=sin(yaw) to spread limbs sideways (`SIDE` table), so turning is an eased ~0.32 s spin through
    a front view. Puppet poses are stored in his own frame and projected every step; keyframe `turn` (degrees) spins.
    Owner's idea; true 3D physics would be part of the later physics overhaul (with limb ripping).
  - Indie feel: `pixelfont.ts` (hand-made 5x7), `drawPixelBubble` (stepped corners/tail), typed-out speech with
    square-wave blips (pitch from mood; `onBlip` → Web Audio in renderer; config `sound`), dust puffs, hit-stop.
    Owner wants the "There Is No Game" indie feel; asked for reference screenshots/clips.
  - Settings tabs: Chat | Mood (+ commands) | Mind | Look | Movement | General. Mind = neurons (live from
    `mind.weigh()`: mood → options sized by score → current action; AI node), persona, moves (save AI-made
    moves, do/forget; instinct 'showoff' uses saved ones), drawings gallery (persisted in the pet save, redraw/forget).
    Look: `outline` option.
- Owner's later ideas (agreed, not built): a belt with tools (pen, wooden sword) he grabs and uses (hit the
  cursor, draw); interactable drawings; ripping limbs off — all with the items + physics overhaul.
- (Earlier NEXT, now done: talking to him on the desktop. Still offered: a local/free model via Ollama.)
  Owner also wants more Desktop Goose / Shimeji behaviors and better animations over time.

- The big overhaul round (owner asked for everything in the plan except the visitor; built while the owner
  was away, all sim-tested and checked in headless Chromium; Electron launches under Xvfb; NOT yet tried on a real Mac/PC):
  - Milestone 5 memories (`memory.ts`): notes {text, kind you/event/opinion, by him/ai/you, weight}, a lifetime tally
    (thrown, poked, petted, smacked, ripped...), firsts/repeats become notes offline (MILESTONES), `recall()` lines
    offline. AI reply field `remember` (≤3); prompt has a WHAT YOU REMEMBER section; every 18 new notes the AI tidies
    them (`tidyRequest`/`applyTidy`, separate request), rules-based `tidyOffline` otherwise. memory.json in userData
    (main `memory:load/save`), localStorage in preview. Mind tab: summary, notes (edit in place, delete, add), tidy, forget.
  - 3D body: Point has z; `collide` keeps |z| ≤ depth (default 40*scale); `twoBoneIK3` with poles (knees forward,
    elbows back/out); `fillLimbs(t, hip, neck, nod, cock, ...)`; gestures "present" (turn toward you) via
    GESTURE_PRESENT. Puppet keyframes take [x, y, z] and `turn`/`flip`/`roll`. render.ts depth-sorts limbs.
  - Destructible (`limbs.ts`, config `destructible`, on by default): `detach(limb)` breaks the limb's sticks
    (`Stick.off`) and ghosts its joints (`body.ghost`, parked at the stump); a `LooseLimb` carries on with physics.
    Triggers: yanking a hand/foot >2700 px/s, smacks >3400, limb ends hitting the ground >1700 (`checkImpacts`).
    `Reattach` skill: stare (ch.stare) → walk/hop/crawl → stoop + pick up (`holdLimb`) → hold to stump (snaps on
    within 9px) → try it out; can't reach / you hold it → redraws it (`regrow`). One leg: `hopPose`; none: `crawlPose`.
    Reaching low anywhere uses `stoop()`.
  - Items (`items.ts`, definitions are JSON in `src/core/items/`; user files in userData/items, copied examples +
    README on first run; main `items:defs/reload/openFolder`): belt with 3 slots (0 left hip, 1 right hip, 2 back),
    drawn as a 3D ring (`beltParts`). Item places: belt/hand/world/cursor. `Tool` helper fetches/stows. Pen: DoodleSkill
    draws with the pen tip (no pen → can't draw). Sword: `SwordSwing` (wind-up/slash/follow), 'slash' at the cursor
    (`hitCursor`: sparks, knocks cursor in mischief mode). `FetchItem`, `AskBack` (after 20 s he asks, snatches back).
    You: right-click menu (`contextMenu`, drawn in core: Talk / Take x / Give back / Fix him up / Settings);
    carried items dangle from the cursor (`followCursor`) and hit him (`itemHits`); click him = give back,
    elsewhere = drop. Items tab in settings.
  - Parkour: landing rolls (850–1400 px/s feet-first while whole → 'roll' mode, `tuck()`), `flipJump`, `wallJump`
    (+ `WallJump` skill), `vault()` (scripted puppet frames; routeTo 'vault' route for 40–85 px ledges).
  - Talk on the desktop: double-click him (a click waits 0.25 s to rule out a double-click before it pokes) or Talk in
    the menu → DOM text box over his head (app/index.html #talk); main `pet:typing` makes the overlay focusable while
    open. Offline he understands simple words (`offlineAnswer` in brain.ts: dance, sit, draw, my name is...).
  - Drawings come to life (`props.ts`, `LIVE_SHAPES`): `becomes` ball (kick it: 'kick' gesture + `KickBall`; you can
    throw it; it bonks him), box (floor; platform top; he vaults on), platform (ledge in the air), item (drawn sword →
    `itemFromDrawing`). Prop platforms merged with window platforms (`refreshPlatforms`).
  - Sound effects: `src/app/sfx.ts` (Web Audio, no files); Pet emits names via `onSound`; config `sfx`, `volume`.
  - Animation principles: run wind-up, jump arms-back anticipation, follow-through spring on arms (`sway`), head
    bob after landing (`nodSpring`), squash & stretch (`squashSpring`, drawing only, `Pet.squashFor`).
  - Mind tab neurons → a 3D head (settings.ts `neurons()`): drag to rotate; drag a feeling to set it; click a choice
    to do it; drag/scroll a choice to change his preference (config `biases`, multiplied into instinct scores).
- Untested on real hardware this round: the desktop talk box getting keyboard focus (macOS panel window / Windows
  focusable toggle), right-click on the overlay, sounds through real speakers, opening the items folder.
- NEXT: owner tests the overhaul on the Mac (talk box focus is the riskiest bit), then picks what's next.

## Ideas from research (not agreed yet — offer as options)
- Shimeji-style: climb screen/window sides and ceilings, dangle from window edges, sit on a
  window edge with legs hanging, peek from behind a window.
- Desktop Goose-style mischief: drag/fling windows, leave notes or doodles, "gifts", footprints.
- Becker's 12 principles: anticipation, follow-through, arcs, slow in/out, exaggeration.
- Similar project for reference: github.com/spyderweb47/Desktop-Virtual-buddy (Electron+TS,
  PowerShell window probe on Windows only, screenshot-based LLM brain, wall/ceiling climbing).

## Owner's wishlist (agreed, not built yet)
- A visitor (a second stick figure: rival, friend, or the "virus") — offered, owner passed on it for now.
- Moods as blended bars where all of them matter (complex emotions), not just the loudest one.
  (The dials already exist in mood.ts; reactions mostly use the dominant label today.)

## Key files
- `src/core/character.ts` body controller (modes, stepping, gestures, limbs, parkour). Tune feel here.
- `src/core/mood.ts` dials + posture. `src/core/mind.ts` choices + reactions. `src/core/skills.ts` skills.
- `src/core/memory.ts` memories. `src/core/limbs.ts` loose limbs. `src/core/items.ts` + `src/core/items/*.json` items.
- `src/core/props.ts` drawings that came to life. `src/app/sfx.ts` sound effects.
- `src/core/pet.ts` glue + input. `src/app/renderer.ts` page + click-through. `src/electron/main.ts` window.
- Debug in DevTools: `pet.paused = true`, `pet.mood.s`, `pet.char.walkTo(x)`, `pet.char.doGesture('wave')`.

## Commands
- `npm start`     build + launch the pet (Electron)
- `npm run preview` build + open in a normal browser window (no click-through)
- `npm run sim`   headless physics tests
- `npm run typecheck`
