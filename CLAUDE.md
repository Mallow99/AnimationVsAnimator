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
1. **Body** — Verlet physics (joints = points, bones = fixed-length sticks). "Muscles" pull
   joints toward a target pose; strength 0 = ragdoll. IK places feet and bends knees/elbows.
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
5. Memory file, periodically summarized.
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
- NEXT (new chat): milestone 4 — AI brain (chat/full modes), talking back, persona.
  Owner also wants more Desktop Goose / Shimeji behaviors and better animations over time.

## Ideas from research (not agreed yet — offer as options)
- Shimeji-style: climb screen/window sides and ceilings, dangle from window edges, sit on a
  window edge with legs hanging, peek from behind a window.
- Desktop Goose-style mischief: drag/fling windows, leave notes or doodles, "gifts", footprints.
- Becker's 12 principles: anticipation, follow-through, arcs, slow in/out, exaggeration.
- Similar project for reference: github.com/spyderweb47/Desktop-Virtual-buddy (Electron+TS,
  PowerShell window probe on Windows only, screenshot-based LLM brain, wall/ceiling climbing).

## Owner's wishlist (agreed, not built yet)
- Memories and personality views in settings are placeholders until milestones 4–5.
- Moods as blended bars where all of them matter (complex emotions), not just the loudest one.
  (The dials already exist in mood.ts; reactions mostly use the dominant label today.)
- A way to talk back to him once he can talk (milestone 4).

## Key files
- `src/core/character.ts` body controller (modes, stepping, gestures). Tune feel here.
- `src/core/mood.ts` dials + posture. `src/core/mind.ts` choices + reactions. `src/core/skills.ts` skills.
- `src/core/pet.ts` glue + input. `src/app/renderer.ts` page + click-through. `src/electron/main.ts` window.
- Debug in DevTools: `pet.paused = true`, `pet.mood.s`, `pet.char.walkTo(x)`, `pet.char.doGesture('wave')`.

## Commands
- `npm start`     build + launch the pet (Electron)
- `npm run preview` build + open in a normal browser window (no click-through)
- `npm run sim`   headless physics tests
- `npm run typecheck`
