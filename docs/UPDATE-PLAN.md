# Expansion roadmap

Ten focused updates, with up to twelve features each. This is a proposed direction, not an instruction
to build all ten at once. Keep the existing procedural stick figures, current looks, complementary
personalities, Mac + Chrome support, and offline usefulness. Separate-app production/export stays
postponed until the owner is satisfied with the project.

The current batch is combat (Update 1), plus the owner's immediate activity-pacing/sleep-carry requests
from Update 5 and full visible-shape collision fixes from Update 2.
Physical tools and the desk belong to Update 2. Drawing/workshop crafting belongs to Update 3, moving
furniture to Update 4, and real games to Update 6. Finish the current batch before expanding those systems.

## Rules for every update

- Begin from the last tested build. Read the current handoff and this plan instead of rediscovering the project.
- Develop one or two connected systems, then stop adding features to that batch.
- Clean up the touched code and physics as part of the update. Keep core platform-free and peer exchanges plain data.
- Finish with a runnable build, meaningful regression checks, a visual check where animation changes,
  and a short Mac test list. Cloud tests and native Mac tests are separate evidence.
- Record what changed, what passed, what remains unfinished, and the next concrete step. Commit the milestone.
- Put new suggestions into the appropriate future update. Reorder only when there is a dependency or a user decision.
- No paid AI is required for combat, locomotion, prop physics, drawing, inventory or social behavior.
  Optional provider requests need the user's configured service; a ChatGPT subscription is separate from API usage.

## 1. Combat, movement and usable weapons — current batch

**Goal:** they fight according to the situation, with readable movement and consistent item ownership.

1. Explicit combat states: approach, defend, punish, recover, retreat, fetch and create a replacement.
2. Fluid speed-matched running, a steady sword-carry pose, and cleaner transitions to walking and stopping.
3. Backward steps that keep facing the opponent; guard footwork distinct from forward running.
4. More readable wind-ups, broad cuts, lunges and follow-through, with impact/recovery poses instead of constant motion.
5. Hidden guard pressure, visible stance/reaction cues, and the existing developer-only bar.
6. After a disarm, dodge back before trying to regain a weapon.
7. Choose the closest reachable loose weapon, including a companion's dropped weapon, with exclusive ownership.
8. Draw a working replacement when recovery is unsafe or unavailable; interrupt drawing if threatened.
9. Prefer effective equipment for the distance and fight mode: katana/pistol where suitable,
   foam/wood/bow as fallbacks; commit to choices long enough to avoid constant swapping.
10. Clear both hands for a combat tool, including firearms and bows; stow or drop obstructing items reliably.
11. Let the user wield actual taken swords, bows and pistols: swipe, manual aim, bow draw/release,
    item-owned ammunition and reload, return/drop controls.
12. Fix prop throws using measured hand momentum while retaining stable rigid shapes.

**Done when:** disarms lead to purposeful recovery or drawing, weapon switches never leave unrelated
items in either hand, arrows/rounds hit along their travel paths, backsteps face the opponent, and
seeded fights still finish. Review animation in motion on Mac; a passing simulation cannot judge its feel.

**Follow-up tuning:** readable recovery windows and consistent hit reactions deserve attention before
adding many more attacks. Keep toy rounds/practice behavior in play mode.

## 2. Physical tools, inventory and useful furniture

**Goal:** common actions happen in the world, with fewer trips through settings.

1. A grab bag in the overlay: pull out a tool or prop directly, using a compact illustrated selection only when opened.
2. Drag-and-drop item giving, taking and passing without needing a context-menu action each time.
3. A physical trash can for unwanted in-app items, props and drawn objects.
4. Undo/retrieve the last trashed object; trash never deletes actual computer files.
5. A sponge that wipes the drawing under it instead of clearing every drawing at once.
6. A sorting/storage area for loose weapons and props; saved placement survives restart.
7. Evaluate an optional small satchel/backpack instead of visible belt clutter. Preserve existing inventory saves,
   allow quick draws, and review the silhouette before changing the character design.
8. Make the desk a work surface: draw blueprints, rest tools on it and use nearby seating.
9. Give each existing prop a clear use and reaction: chair/couch seating, TV/game/channel controls,
   easel painting, scooter riding/braking, desk work. Audit unused props and explain custom ones.
10. Use direct object interactions plus brief hints; settings remain for configuration and troubleshooting.
11. Full visible item hitboxes: easy handle/head selection, with all artwork kept above floors and surfaces.
12. Full prop collision contours and stable body separation; preserve throws and stop furniture clipping into other furniture.

**Done when:** spawn, store, give, remove and clean can be done through the overlay; trash is reversible;
there is a demonstrable desk activity; inventory and prop saves still load correctly.

**Suggested extra later:** a toolbox/weapon rack could be easier to read than a large inventory panel.
Choose one main storage metaphor before adding several competing ones.

## 3. Pen creativity and workshop crafting

**Goal:** they create working ink objects, then can refine them into durable finished objects.

1. Draw recognizable working items and furniture from blueprints, including TV, chair, couch and desk.
2. Keep the art, collision shape and advertised actions consistent with what was drawn.
3. Show tracing, completion and emergence; unfinished ink stays unfinished.
4. Give drawn objects a visible ink identity instead of instantly looking factory-made.
5. Add a usable workshop/workbench with room for tools and a project.
6. Color an ink item in, polish it, then complete it into the corresponding full item:
   **a drawn katana becomes a full katana** through an observable crafting sequence.
7. Preserve ownership, position, ammunition and other relevant state through refinement; no duplicate item.
8. Explore a configurable lifespan for unfinished ink items to motivate refinement, with clear fading cues.
9. Pause/defer expiration while the user is holding an item or it is supporting someone; do not vanish it mid-use.
10. Store materials/blueprints and projects in the grab bag/satchel; avoid another permanent crafting panel.
11. Allow interruptions and resuming an unfinished project, with projects saved across restarts.
12. Let custom definitions advertise drawing/refinement capabilities without hardcoding every object.

**Done when:** a figure draws a working katana, brings it to the workshop, colors/polishes it into
one durable katana, and reloads the same item/project without duplication. The ink lifespan is a
proposed gameplay choice to tune, not a reason to delete existing user saves.

## 4. Prop arranging and shared space

**Goal:** they can create a comfortable space and physically move furniture into it.

1. Carry light props, drag medium props and push heavier furniture.
2. Add contextual hand grips, braced feet and effort poses for moving objects.
3. **Pull the TV toward the couch and turn it toward the seats**, using actual shared-world furniture.
4. Plan a destination with space for the prop and a clear route; stop if the user grabs it.
5. Respect occupied seats and companions using an object; ask, wait or replan.
6. Give two figures a cooperative carry for larger furniture, with a shared destination.
7. Recover safely when furniture tips, gets blocked or loses support.
8. Save arrangements and the functions of drawn/refined props; restore without duplication.
9. Allow small personal corners: TV/couch, reading chair or workshop, with limits on screen clutter.
10. Let objects advertise where they can be used, moved or stored, including custom props.

**Done when:** a figure can draw a usable TV, move it beside an existing couch, orient it toward
the seats, use it there and reload that arrangement. Occupied, tipped or held furniture must
cause a sensible cancellation or replan.

**Research-inspired suggestion:** objects advertise “sit,” “watch,” “draw here,” “move here” and
“store,” and the local mind chooses among those capabilities. This follows Kevin Dill's smart-object
and modular-decision discussion and avoids a special branch for every prop.

## 5. Companion personalities and group life

**Goal:** two feel complementary, and three to five remain a believable small group.

1. Extend existing personality differences into combat style, preferred activities and reactions; preserve their identities.
2. Relationships per pair: trust, rivalry, favorite shared activities and recent disagreements.
3. Invitations that account for being busy, tired, injured or already involved with someone else.
4. Spacing and turn-taking around props, conversation and shared activities.
5. Spontaneous short interactions: passing tools, comparing drawings, helping recover a weapon and checking on someone knocked down.
6. Cooperative furniture arranging tied to Update 4's carry system.
7. Small group activities: watch together, drawing contest, training turns and cooperative prop play; games use Update 6.
8. Coordinated sparring: avoid surprise dogpiles; bystanders watch/react or wait for their turn.
9. Vary dialogue by personality, relationship and context; keep bubbles short and avoid chatter spam.
10. Tune scale and occupied screen space for groups, with an optional automatic fit rule instead of shrinking everyone unconditionally.
11. **Hyperactivity meter in Mind settings**, combined with mood: longer commitments to games/TV,
    calm downtime and natural stopping points; watching a movie can last around half an hour.
12. **Read a book** and add other sustained quiet activities over time, keeping short conversations,
    companion reactions and direct user requests responsive during them. Preserve sleep when gently
    picked up/carried; wake on hard impacts or hits, including floor and wall contact.

**Done when:** two independent pairs can interact without stealing partners, a fifth figure can join an
available activity, and shared resources/reservations release cleanly when a figure leaves.

## 6. Real games, TV imagination and handhelds

**Goal:** visible entertainment has actual game state and gives the figures things to enjoy together.

1. Let the TV face its viewers rather than always facing the user; coordinate with Update 4's orientation.
2. Show an occasional small gameplay/film preview **above the TV**, similar in scale to a compact Othello view.
3. Keep that preview intermittent and restrained so long activities do not create a permanent distracting HUD.
4. Reuse the actual game state for the preview, including scores/turns/events; never invent game progress.
5. Add a real two-figure game such as Pong: ball physics, paddles, goals, winner and rematch.
6. Add another compact game if the first is fun and stable: cooperative block puzzle or turn-based strategy.
7. Let companions invite each other, share controllers, spectate, react and stop at natural round boundaries.
8. Add handheld consoles with small playable displays for solo or linked play away from the TV.
9. Consider a **game console required for TV games**, with controllers and a connection animation;
    implement this without breaking existing saved TV/Othello sessions.
10. Let the user join supported games through the existing compact game UI.
11. Combine game sessions with the hyperactivity/mood pacing from Update 5, lasting minutes rather than seconds.
12. Add varied little shows/films or stories for viewing sessions, with occasional reactions and brief previews.

**Done when:** two figures play a real complete match, the preview shows the same state, the winner
reacts, and they can rematch or leave cleanly. Handheld/TV/console ownership survives interruption and restart.

**Suggested first game:** Pong is small enough to verify real shared play before adding a larger game library.
The console requirement and ink lifespan are proposed gameplay rules to tune with the owner.

## 7. Chrome and native-window interaction

**Goal:** interaction changes real supported windows/pages and feels connected to what the user is doing.

1. Harden the installed Chrome extension's connection and permission experience.
2. Real connected-tab awareness: title, visible page geometry and lifecycle, with clear opt-in scope.
3. Climb/perch on page elements where geometry is available; adapt when the page scrolls or changes.
4. Take a real page fragment as an overlay object, with a visible removal animation and reversible restoration.
5. Carry, toss or incorporate that fragment into a drawing scene.
6. Close an authorized connected tab with the real Chrome API; handle permission failure and vanished tabs.
7. Close a normal native window using its normal close action; preserve save prompts and protected-window refusals.
8. Improve push, kick, surf and edge-grip reactions when real windows move or close.
9. Make interactions predictable: explicit user commands first, optional autonomous mischief only within chosen grants.
10. Mac acceptance pass for Accessibility, Chrome capture, click-through, focus hand-back and Spaces.

**Done when:** the installed extension works in real Chrome on Mac, the page can be restored, and native
window close/move behavior is verified on hardware. Never describe simulated extension APIs as a real installation test.

**Suggested extra later:** interact with actual tab-strip positions only if Chrome/native access exposes
reliable geometry; do not fake it with a second browser UI.

## 8. Real folders and file-window presence

**Goal:** they enter an existing folder/file location and appear when its real matching window is opened.

1. Verify existing-path matching with Finder, supported document apps and Chrome where relevant.
2. Detect real folder/icon geometry where the OS exposes it; establish a real entry destination.
3. Animate approaching, reaching and crawling through that icon/edge instead of an instant state transfer.
4. Associate the figure with the exact path and keep identity, memory, relationships and inventory.
5. Show it through the overlay inside the matching Finder/document window; hide it when that location is not visible.
6. Follow window movement, resizing, tab changes, occlusion and Spaces without switching the user's desktop.
7. Handle renamed/moved/deleted paths and multiple windows without inventing files or losing the figure.
8. Add a clear return/recall interaction so a hidden figure is never stranded.
9. Save the association and restore it after restarting, with sensible behavior if permission is unavailable.
10. Document supported app/file cases and the actual rendering boundary; explore extensions only where an app supports them.

**Done when:** an actual existing folder can be closed and reopened in Finder and the same figure
returns inside its detected window, with entry/exit animation and reliable recall on Mac.

**Boundary:** arbitrary animated content embedded into every file format/app has not been established.
Finder overlay presence is a concrete implementation to test, not a claim that the figure becomes
native Finder content. No mock HTML rooms or placeholder files as a substitute.

## 9. Offline understanding and optional AI

**Goal:** the base mode understands ordinary requests and the optional AI adds useful intent/personality.

1. Expand local commands for names, items, locations and the capabilities added in earlier updates.
2. Ordered plans such as “draw a TV, put it near the couch, then ask Leonard to watch.”
3. Clarify only genuinely ambiguous targets; offer a short in-world response when an action is unavailable.
4. Contextual replies using mood, relationship, recent activities and small saved facts.
5. Local planning and replanning for everyday actions; combat and physics never depend on a model call.
6. AI uses the same capability vocabulary and target IDs as offline mode, with validated plans and bounded steps.
7. Update provider/model discovery from real service listings rather than assuming old model IDs remain available.
8. Cost controls: explicit conversation, configurable autonomous intervals, short context, caching and failure backoff.
9. Optional “look at this” vision only when requested, with a clear indication that the image goes to the configured provider.
10. Inspectable short explanations for selected actions; preserve useful local behavior through provider errors and no connection.

**Done when:** representative natural requests work offline, named targets stay correct in a group,
a failed/delayed model request cannot trigger stale actions, and optional AI behavior is demonstrably
better in the same scenarios without frequent background requests.

## 10. Reliability, onboarding and a build worth sharing

**Goal:** finish the experience and make a stable install before considering a character-producing studio.

1. Audit ownership, interrupted animations, physics energy, collisions and save/load across all prior updates.
2. Split oversized code where responsibilities are now clear; remove superseded code and duplicated controls.
3. Frame-time profiling and idle power tuning for two to five figures.
4. Extended deterministic life/combat/prop soaks with saved seeds and useful diagnostics.
5. Multiple monitor placement and changing display/scale handling, including mixed-DPI checks where supported.
6. Small-screen and accessibility controls: readable hints, keyboard alternatives and optional reduced motion.
7. A brief first-run introduction to grab bag, weapons, sponge and native permissions.
8. Backup/restore saves and simple settings profiles without exporting keys or private data.
9. Real Mac and Windows packaging/run checks; evaluate signing/updates separately if distribution needs them.
10. Final acceptance checklist with the owner, then reassess separate-character export/studio as its own project.

**Done when:** the owner's regular Mac workflow has no recurring focus, physics, ownership or save bugs;
long runs remain stable; setup and recovery are understandable; distributable builds have been tested
on their target platforms. “Build produced” alone does not mean “Windows tested.”

## Research used and practical recommendations

- [Epic: Pose Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/pose-warping-in-unreal-engine)
  describes adjusting orientation and stride to actual locomotion direction/speed. Application here:
  procedural speed-matched foot contacts and explicit backward movement. This does not require importing Unreal.
- [Kevin Dill: Structural Architecture — Tricks of the Trade](https://www.gameaipro.com/papers/structural-architecture-tricks-of-the-trade.html)
  discusses decision inertia, temporary reactions, modular reasoners and smart objects. Application here:
  committed weapon choices, interruptible recovery, and props advertising their uses.
- [GDC: Bringing Hell to Life — AI and Full Body Animation in DOOM](https://gdcvault.com/play/1024186/Bringing-Hell-to-Life-AI)
  presents combat AI built around stylized full-body animation. Application here: clear action poses,
  readable anticipation/recovery and reactions that change the action. The public talk description was reviewed;
  this is a design inference, not a claim to have watched the recording.

Keep these improvements procedural and lightweight. Motion-capture libraries, a new game engine and
frame-by-frame AI joint control would add cost/complexity before solving the current problems.

## New suggestions inbox

Move additions into the right future update, preserving the current batch's focus.

- Figures draw their own props; pull the TV toward the couch: Updates 3 and 4.
- Slower action cycling, mood-dependent hyperactivity, long games/movies and reading, with a Mind meter:
  Update 5; basic pacing and reading included in the current batch at the owner's request.
- TV faces the figures; intermittent animation/game preview above it, like a small Othello UI: Updates 4 and 6.
- Actual companion games, handheld/Game Boy-style devices, optional required TV console: Update 6.
- Workshop colors/polishes drawings into finished items; drawn katana → full katana; possible ink lifespan:
  Update 3. Bag storage connects this to Update 2.
- Bag instead of belt: evaluate in Update 2, integrate with workshop/tools in Update 3.
- Carry sleeping figures without waking them; hard impacts/hits wake them: Update 5, included in the current batch.
- Fix visible item/prop selection and floor contact, and furniture colliding with furniture: Update 2,
  included in the current batch.

## Execution order and current status

1. Finish Update 1, the requested basic activity-pacing/sleep-carry changes from Update 5,
   and full item/prop hitboxes from Update 2.
2. Physical tools/storage and useful desk (Update 2).
3. Pen/workshop crafting (Update 3), then movement/arrangement (Update 4).
4. Expand companion life/pacing (Update 5) and actual entertainment (Update 6).
5. Verify and extend Chrome/native windows (Update 7), then real folder/file entry (Update 8).
6. Expand local/optional AI understanding (Update 9); clean up, test hardware and package (Update 10).

Current file/folder support is a prototype; workshops, ink lifespans, furniture-moving skills,
physical grab bag/trash/sponge, handhelds and a new companion game are **planned, not implemented**.
Avoid counting a feature complete because it has a name in this document.
