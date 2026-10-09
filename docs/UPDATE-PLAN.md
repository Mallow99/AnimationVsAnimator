# Project roadmap

## Current priority: Pet Quality Update 2 (implementation complete)

Completed the ordered pass in [PET-QUALITY-2-PLAN.md](PET-QUALITY-2-PLAN.md): resources, physical
contact/intent, continuity, group social context, useful domestic objects, personalized motion/names,
richer friendships/moods/gifts, handheld peer play, TV console attachments and developing satchels.
[PET-QUALITY-2.md](PET-QUALITY-2.md) gives the exact changes, sanity assessment, 175 checks, final
feature soak, actual browser/Electron and visual evidence, measured RAM/performance and limits.

Stop before further Chrome/Finder integration. Next action is owner Mac/Windows acceptance of the
current build, especially focus/desktop return/Spaces and native helpers. No next milestone begins
without a new owner instruction. Shared controls, passive pickup and normal gun reloading remain.

## Previous priority: Pet Quality / Living Stickmen (completed)

The owner's expanded request overrides the integration roadmap. Core principle: **figures should feel
alive without AI** through purposeful activity, physical transitions, personality and social continuity.
The ordered checklist is [LIVING-STICKMEN-PLAN.md](LIVING-STICKMEN-PLAN.md). This update includes:

- Foundation repairs for drawn-project continuity, one reload clock per original gun, custom and
  reader-facing book artwork, returning hand targets, closed/open contours and stable rigid stacking.
- Selectable five-character presets and 1–5 population labels; one named/All figures Settings window
  and shared searchable Bag/Supplies/Activities, preserving legacy saves and individual ownership.
- Brace/lift/scoot/settle seating, actual discoverable furniture movement, exclusive duels and group
  conversations with timed turns/listeners. Stronger offline needs and saved cooperation/care/rivalry
  affect activities, reactions and partners. Roster departures/rejoins release/reconnect shared claims.
- Read-only built-in sanity checks, feature/lifecycle soak, simulations, real Chromium/Electron input,
  visual inspection, performance checks and Windows portable packaging. Native Mac/Windows checks
  remain explicit. Every working commit has a changelog and sanity checks.

Cups, dumbbells, yo-yos, handhelds, real bookshelf books and useful existing tools remain included.
**Fix broken/infinite reloading; retain reload mechanics.** Books were an example, not an item limit.
Pickup is passive; Use is explicit. Stable contact must retain manipulation and impact response.
See [PET-QUALITY.md](PET-QUALITY.md) for the item audit, evidence and limitations.

The owner requested research for **Pet Quality Update 2** after finishing this update. That research
has now been followed by explicit implementation authorization. No integration work resumes now.
The ordered, source-backed proposal is [PET-QUALITY-2-RESEARCH.md](PET-QUALITY-2-RESEARCH.md).

The existing five-update plan stays below for context. Workshop and Household are built on
`codex/roadmap-continuation`, stacked on `codex/desktop-life`; PR #3 remains the continuation PR.
Out of the Box and Mind & Ship are paused. Resume only on a new owner instruction, beginning with
real-hardware acceptance of what already exists. No new Chrome/Finder feature starts in this pass.

**Short version**
1. **Steel**: combat (built; PR #2 and Mac acceptance still pending)
2. **Workshop**: tools, storage, drawing and crafting
3. **Household**: moving furniture, group life and games
4. **Out of the Box**: Chrome, windows and folders
5. **Mind & Ship**: understanding, AI and release

---

## 1. Steel: combat (built; PR #2 remains open)
Built: weapon choice by situation, recovery after a disarm, drawing a replacement weapon, swords/pistols/bows you wield with the cursor, backsteps, the Hyperactivity meter, reading, sleep-carry and full hitboxes.
Left: the Mac test, then tuning recovery windows and hit reactions based on what you actually see. Tune regressions as needed; preserve the existing procedural look and personalities.

## 2. Workshop: tools, drawing and crafting (old 2 + 3)
**Stage A: tools and storage**
- Grab bag, trash and undo (built)
- Sponge that wipes only the drawing under it
- Drag a figure's equipped item straight out of its hand
- A rack or toolbox for loose weapons and props, with placement saved
- Decide satchel vs. belt (owner selected wearable satchels)

**Stage B: objects that advertise their uses**
- ★ Every prop advertises what it's for (sit, watch, draw here, store, move), and the mind picks from those instead of a special case per prop. I moved this here from old Update 4 because everything after it depends on it.
- Prop-use audit: each existing prop gets a clear use. The desk becomes a work surface with seating.

**Stage C: ink and refining**
- Draw working furniture from blueprints. The art, collision shape and actions all match what was drawn.
- Visible tracing and emergence; ink items keep an ink look
- Workbench: color, polish, finish. A drawn katana becomes one real katana, keeping its owner and state, with no duplicate.
- Ink lifespan (tunable), paused while an item is held or holding someone up
- Projects saved, resumable, and stored in the bag
- ★ **Animator tools for you:** an eraser that removes ink objects (figures react, dodge, or object when you erase their work) and a paint bucket so you can do the coloring step yourself. That's the "vs. Animator" half of the premise. Right now your side is mostly weapons.

**Done when:** a figure draws a katana and refines it into one real katana that survives a restart, and the sponge, rack and desk all work without opening settings.

## 3. Household: furniture, group life and games (old 4 + 5 + 6)
**Stage A: moving things**
- Carry light props, drag medium ones and push heavy ones, with hand grips, braced feet and effort poses
- Pull the TV to the couch and turn it toward the seats. Plan a route, and cancel or replan if it's grabbed, occupied or tipped.
- Two-figure carries; saved arrangements

**Stage B: living together**
- Per-pair trust, rivalry, favorite activities and recent disagreements
- Invitations that account for being busy, tired or hurt; turn-taking; sparring without dogpiles
- Small moments: passing tools, comparing drawings, checking on someone who got knocked down
- Dialogue shaped by personality and relationship, with a cap on chatter
- ★ **Signature talents:** each figure is clearly better at one thing (drawing, fighting, building or games), so they defer to each other and roles form on their own. AvA IV's Color Gang works this way.
- ★ **Rivalry memory:** a figure remembers which moves a specific opponent falls for and adjusts, saved per pair, so the same matchup changes over weeks.
- ★ **Real-clock rhythm:** sleepy at night, up in the morning, and they notice and greet you when you come back after being away. Electron can report how long the computer has been idle.

**Stage C: game night**
- Pong first: real ball physics, a winner and a rematch
- The TV faces its viewers, with an occasional small preview above it that shows the real game state
- Invitations, spectators, natural stopping points; you can join in
- Handhelds; a console requirement (tunable) that doesn't break existing saves
- A second game only if Pong turns out fun

**Done when:** a figure moves the TV to the couch, two others play a full Pong match there while a third watches, the winner reacts, and the arrangement and relationships survive a restart.

## 4. Out of the Box: Chrome, windows and folders (old 7 + 8)
**Stage A: verify what's already built** on real hardware: installing the extension, closing a tab, closing a native window, the Finder association. Nothing new starts until this passes.
**Stage B: Chrome.** Tab awareness, perching on page elements, page fragments carried, tossed and restored.
**Stage C: windows and folders**
- Push, kick and surf reactions when real windows move or close
- ★ A short research check first: find out what icon geometry macOS actually exposes before committing to the crawl-in feature list
- Crawl-in animation using real icon positions, following the window, recall, and saving the association
- ★ **Quiet mode:** settle into a corner or hide during fullscreen apps, screen sharing or presentations, wherever macOS reports those. Plus a hotkey to hide everyone. Right now they're set to show over fullscreen apps, so the first sword fight over a class presentation will make the case for this. The hotkey is small enough to add sooner.
- ★ **Opt-in cursor tug-of-war:** a figure briefly grabs and drags your real cursor, which is Desktop Goose's best gag. Off by default, with an off switch. It probably needs a macOS permission, which still needs checking.

**Done when:** the installed extension works in real Chrome on your Mac and pages restore properly. A folder closed and reopened in Finder brings the same figure back with the crawl animation. Quiet mode triggers on a real fullscreen app.

## 5. Mind & Ship: understanding, AI and release (old 9 + 10)
- ★ **Rule change, effective now:** every update adds its new actions to the offline command list as it ships, so this update isn't catching up on four updates' worth of commands.
- Multi-step requests, asking only when a request is genuinely ambiguous, in-world replies when something isn't possible
- The optional AI uses the same action list (built in Workshop) and the same target names. Its plans are checked and limited to a few steps, and a slow or failed request can't trigger an outdated action.
- Model lists pulled from the real provider, cost controls, a "look at this" screenshot feature that only runs when you ask
- A way to see why a figure chose what it's doing
- Audit ownership, saves and physics; split oversized files; check CPU and power use with two to five figures
- Long automated test runs; multiple monitors and mixed screen resolutions
- First-run intro, reduced motion, keyboard alternatives, save backup and restore
- ★ **Replay clips:** keep the last ~30 seconds of the overlay in memory and save it as a video with one click. Browsers can record a canvas natively, so it works offline. Fights in this genre exist to be shared.
- Mac and Windows packaging, a final test list with you, then a decision on the separate studio/export project

---

**Research additions:** David Rosen's GDC 2014 talk is the best reference for the animation work. He got responsive, fluid motion out of 13 keyframes total using simple procedural tricks, which is the same approach this project takes. Keep the three sources already in the plan. Desktop Goose and Shimeji show what people expect from desktop pets: climbing windows, interfering with the cursor, and an easy off switch.

The previous ten-update plan is archived in UPDATE-PLAN-LEGACY.md. Its combat pose/readability tuning, decision inertia, optional-AI cost controls, settings profiles and separate studio/export discussion remain carried forward in Steel or Mind & Ship.

Sources:
- [Animator vs. Animation — Wikipedia](https://en.wikipedia.org/wiki/Animator_vs._Animation)
- [The Second Coming — AvA Wiki](https://animatorvsanimation.fandom.com/wiki/The_Second_Coming)
- [An Indie Approach to Procedural Animation (GDC 2014)](https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation)
- [Desktop Goose](https://samperson.itch.io/desktop-goose?download)
- [Shijima (Shimeji for Mac/Linux/Windows)](https://pixelomer.itch.io/shijima)
Original research sources retained:
- [Epic: Pose Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/pose-warping-in-unreal-engine)
- [Kevin Dill: Structural Architecture — Tricks of the Trade](https://www.gameaipro.com/papers/structural-architecture-tricks-of-the-trade.html)
- [GDC: Bringing Hell to Life — AI and Full Body Animation in DOOM](https://gdcvault.com/play/1024186/Bringing-Hell-to-Life-AI)
