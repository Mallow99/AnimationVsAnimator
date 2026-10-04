# AnimationVsAnimator

A stick-figure desktop pet inspired by Alan Becker's *Animator vs. Animation*.
He lives on top of your screen, has his own physics and moods, and you can poke,
grab, and throw him.

[See the couch, TV and video games](docs/images/tv-couch-preview.png).

## Run it (macOS or Windows)
1. Install [Node.js](https://nodejs.org) (LTS).
2. Get this repo (GitHub Desktop → Clone), then open a terminal in its folder.
3. `npm ci` (first run and after dependency changes — downloads Electron, ~250 MB)
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
- **Settings tabs**: Chat (talk to him), Mood (his feelings + make him do things), Mind (his neurons, personality, moves
  he made up, drawings, memories), Items (tools, equipment and furniture), Look, Movement, General.
- **Talk to him** (AI brain, free): Settings → General → Brain. Pick a service (Google Gemini is the default), click
  "Get a free key", make the key on their site (no credit card), paste it, and pick **Chat** (AI only when you talk
  to him) or **Full** (he also decides what to do and comments on things). Type to him in Settings → Chat →
  Talk to him, or pick "Talk to Blurp…" from the tray icon. Ask him for weird stuff ("do a handstand", "float"):
  with "Let the AI move his body" on, the AI makes up the move itself. Edit who he is under Mind → Personality.
  Free services have daily limits; Offline mode needs no internet and no key.
- **Talk to him right on the desktop**: double-click him, or right-click → Talk. A little text box pops up over his
  head. Even with his brain Offline he understands simple things ("dance", "sit down", "draw something", "fight me",
  "throw the ball", "surf", "kick that window", "my name is ...").
- **Right-click him**: talk, take his things (his pen, his wooden sword, his mallet, his ball), give them back, fix him up, settings.
- **His belt and inventory**: he starts with just his pen (he draws with it, so no pen = no drawing). Everything else is in
  his inventory (Settings → Items): **Drop it in** and it falls from the top of the screen and he goes to get it, or
  **Give him** to put it on his belt. Take something from him (right-click) and it dangles from your cursor: press and hold
  to swing it, let go to drop or throw it, let go on him to hand it back. He asks for his things back, and picks them up
  when they're lying around.
- **Props**: chair, couch, TV (with a game console), scooter, desk and canvas (Settings → Items → Props). He sits on the chair and couch, watches TV
  (from the couch if it's near), rides the scooter across the screen. Drag them around; tip his chair and he falls off.
- **Video games**: with a TV out he grabs a controller and plays his own little runner game (from the couch if
  it's near), and takes losing personally. Settings → Items → the placed TV → **Video games**, or ask him.
- **Othello together**: on the placed TV, choose **Play Othello** (or say "play Othello"). He picks up a controller
  and invites you; you play black, he plays white. The board shows on the TV and in its own draggable window.
  **Talk to him** keeps the match running while you chat. Works offline, with no AI calls for moves.
- **Optional gear**: helmet and boots in Items → Inventory. **Wear** puts them on; **Drop it in**
  lets him fetch them. Take them back or **Put away** whenever you like.
- **Make your own items and props**: it's just a text file. See [docs/MAKING-THINGS.md](docs/MAKING-THINGS.md)
  (also in the items folder: Settings → Items → Open items folder).
- **He's 3D now**: he really turns, spins and flips, and his arms and legs pass in front of and behind each other.
- **Breakable** (Settings → General, on by default): yank a hand or foot hard, smack him really hard, or slam him into
  the ground, and a limb can come off. No gore, just sparks. He stares at the stump, goes and gets it (hopping on one leg,
  or dragging himself along if both legs are gone), and sticks it back on. Hold a limb up to his stump to help.
- **Parkour**: he rolls out of big landings, does flips and wall jumps, and vaults onto low ledges.
- **He hits your cursor** (on by default; Settings → General or the tray icon): his punches, kicks, sword, mallet and ball
  send your real cursor flying across the screen. Move your mouse and it's yours again straight away.
  - When he's playful he spars with it ("fight me!"): fists up, punch combos, high kicks, jumping punches.
    Angry, it's a real brawl. Leave your cursor parked on his head and he swats it off.
  - Sometimes he jumps up, grabs your cursor and hangs off it, legs swinging, while you carry him around. Shake the
    mouse hard to fling him off (or click).
  - Swipe at him (Smack mode) while his sword is out and he might parry it and knock your cursor back.
- **His things do stuff**: the **mallet** on his left hip comes down overhead (on your cursor, or on the window he's standing
  on, which dips and springs back). The **bouncy ball** in his pocket gets thrown at your cursor, or bounced off the floor and
  caught. His sword and mallet whack his ball, things lying around, and the sides of windows. Throw one of his things at him
  and it bonks him.
- **He moves your windows** (on by default; the first time, macOS asks you to allow it under Privacy & Security →
  Accessibility, for Terminal or Electron; if he says "they won't budge", Settings → General says what the helper reported): he walks up and pushes a window along, kicks one across the screen, and
  stands on one and surfs it across. He also knocks on windows ("anyone home?") and sits on their edges with his legs
  dangling. He leaves alone the window you're working in, and anything he draws on a window moves with it.
- **His drawings come to life**, and they have weight: boxes fall, tumble and stack, and you can drag them. A ledge he
  draws is stuck to the wall behind it until something knocks it loose (punch it, hit it, or pull it). A rope bridge
  hangs limp in the middle. He draws a ball and kicks it around, and if you took his sword he draws a new one.
- **He draws his way up**: when he wants up onto a window and doesn't feel like climbing, he draws the base of a ramp along
  the floor, then walks up the slope while his pen draws it just ahead of his feet. A gap between windows: he draws a
  bridge across, walking out over the gap behind his pen. Both turn real (the bridge sags when he's on it).
- **He sees what you're doing** (Settings → General, on by default): he knows which app you're in and comments on it
  (videos, chats, homework, code, Minecraft...), and on a Mac he can hop up and sit on things in your front window, like
  your chat messages (and rides along when you scroll). Nothing inside your windows is read; with an AI brain on, the app
  name and window title go into what he tells the AI.
- **Emotions**: not just one mood but finer feelings. Annoyed (arms crossed, foot tapping, grumbling) isn't angry yet;
  happy (hands behind his back, humming) isn't playful; there's excited, lonely, nervous, and quick flashes of proud
  (hands on hips after a flip) and embarrassed (scratching his head after a faceplant).
- **Memories**: he remembers what you do to him (and, with an AI brain, what you tell him). See and edit them in
  Settings → Mind → Memories. Saved in memory.json next to his settings.
- **Inside his head** (Settings → Mind): his neurons in a 3D model of his head. Drag to turn it, drag a feeling to
  change it, click a choice to make him do it, drag a choice up or down to make him like it more or less.
- **Sounds**: footsteps, thuds, an "oof" when he crashes, snaps, whooshes. Volume and toggles in Settings → General.
- **Leave him alone**: he wanders, sits, explores, gets bored, and eventually naps.
  Poke him while he's asleep at your own risk.

His mood is saved between runs. The **Settings** window shows his mood live and lets you change
his name, size, look (presets or every number by hand) and how he moves.

## Commands

Recent additions: a flat, front-on couch and TV in his own style (pixelated with him), video games and
Othello on the TV, removable helmet and boots, a larger pen, optional mace and canvas painting. Drop props
in from Settings → Items, then use **Paint**, **Video games** or **Play Othello**.
Full AI mode has a thinking-interval control for lower free-tier usage. His persona and body look
remain the same. See [docs/HANDOFF.md](docs/HANDOFF.md) for verified changes and hardware checks.

For a portable Windows copy that friends can run without Node, see [docs/WINDOWS.md](docs/WINDOWS.md).

| Command | What it does |
|---|---|
| `npm start` | Build and launch the pet |
| `npm run preview` | Run in a regular browser window (handy for tweaking) |
| `npm run sim` | Headless physics tests |
| `npm run lab` | Design lab: compare looks side by side |
| `npm run typecheck` | Check the TypeScript for errors |
| `npm run checks` | Focused regression checks for saves, AI, items and activities |
| `npm run browsercheck` | Functional preview check (requires Chromium) |
| `npm run package:win` | Build a portable Windows x64 app |

See `CLAUDE.md` for the architecture and roadmap.
