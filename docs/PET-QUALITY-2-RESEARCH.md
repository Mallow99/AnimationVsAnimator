# Pet Quality Update 2 — research, 2026-10-08

The original Pet Quality / Living Stickmen update is complete in `7a9e0a0`, following foundation
`af56778` and shared-roster `8bc46a8`. This document proposes the next quality pass. It adds no runtime
features and does not resume Chrome/Finder work. The priorities below are recommendations, not a new
implementation commitment. Preserve the procedural stick figures, fixed proportions, pixel style,
presets, offline operation and visible controls.

**Recommendation: spend the next pass on intention, continuity and physical affordances.** Another
large integration would not address the remaining differences between a working pet and a figure
whose actions feel connected. The current primitives already support most of this work.

## Evidence and application

| Source | Finding | Application to this project |
| --- | --- | --- |
| [Lasseter, SIGGRAPH 1987](https://courses.cs.washington.edu/courses/cse458/20au/resources/lasseter.pdf), pp. 37–39 | Timing, anticipation, staging and follow-through make an action readable. Looking toward an object can prepare the viewer for a reach. | Extend the existing brace/lift/scoot structure to pickup, putting tools away and furniture moving; let gaze lead the hand. Keep bone lengths and line widths consistent. |
| [Kevin Dill, Game AI Pro, chapter 5](https://www.gameaipro.com/papers/structural-architecture-tricks-of-the-trade.html), sections 5.4–5.6 | Persistent choices avoid rapid indecision. A bounded option stack can temporarily suspend work and then resume it; objects can expose useful actions. | Build on existing activity clocks, queued requests, ink progress and capabilities. Separate a temporary reaction from abandoning a task. |
| [Craig Reynolds, GDC 1999](https://www.red3d.com/cwr/steer/gdc99/) | Arrival slows near a destination; local separation and predictive avoidance help moving groups maintain space. | Improve gathering and passing traffic through speed/yield choices. Keep seated scoots and intentional transient overlap physical; do not continuously push every figure apart. |
| [Stivers et al., PNAS 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/) | In the studied conversations, transitions cluster near the end of a turn; gaze and visible responses relate to response timing, with contextual/cultural variation. | Let listeners react while the speaker finishes, and vary pauses with the reply. Text bubbles require reading time, so human millisecond timings are inspiration, not a literal timer. |
| [Box2D 3.1 simulation documentation](https://box2d.org/documentation/md_simulation.html) | Materials affect friction/restitution; contact identities support reuse between steps; selective continuous collision detection addresses tunneling. Sleep differs from disabling collision. | Prototype persistent contacts, better compound contours and selective swept collision in the current solver. Compare contact stability and cost before considering an engine change. |
| [People Playground developer description](https://store.steampowered.com/app/1118200/People_Playground/) | Objects combine physical properties and interact through rigid-body simulation, producing behavior beyond individual scripted uses. | Borrow the expectation that manipulation and materials are consistent across objects: weight, grip, contact and activation should predict what happens. The store description does not reveal its solver, and I did not run the game here. |

These are primary papers, author/publisher material and official documentation, checked on the date
above. Proposed settings, budgets and item ideas below are our design choices, not findings claimed
by those sources. The current custom Verlet/SAT solver differs from Box2D; its APIs and impulse
formulas are not a drop-in repair.

## Proposed order

| Order | Quality improvement | Current starting point | Acceptance before calling it finished |
| --- | --- | --- | --- |
| 0 | Native focus and desktop-return acceptance | Existing refocus/keyboard ownership guards and Linux input checks; Mac reproduction remains open | On the owner's Mac, compile the helper and repeatedly move between the original app, pointer bag, chat and game Keyboard. Close each; retain the original app/Space and character visibility. Record any failing sequence before changing native behavior. |
| 1 | Attention and physical intent | Scoot brace/lift/settle, item reaches, hand IK and looking targets | Watch slow and normal-speed pickup/store/read/move clips for all five presets. Gaze precedes reach; hands land on the grip; heavy props elicit preparation; feet stay planted when appropriate. No teleport, strap overlap or changed limb proportions. |
| 2 | Activity continuity and small offline plans | Natural activity clocks, protected readers, saved ink projects and one queued action | A short interruption resumes the same safe task/object. Explicit Stop or a lost resource ends it cleanly. Saved reading bookmarks/project stages survive restart; no duplicated objects or ever-growing suspended-task stack. |
| 3 | Social timing and shared history | Working group turns/listeners; bonds, cooperation, care, rivalry and last shared activity | Test every 2–5 count with a late arrival, departing member and busy reader. Replies address a real participant/topic; listeners acknowledge without everyone moving/speaking together. Shared history changes a visible choice or reaction, and user-directed activity remains authoritative. |
| 4 | More predictable object contact and weight | Stable five-box stacks, friction, rigid projection and live dragging/impact response | Mixed props rest/lean without growing drift or energy; gaps match artwork. Fast throws hit within a defined tested speed range. Grab/push/carry/throw still wake/move objects immediately. Compare the same seeds at different display rates. |
| 5 | More useful everyday objects and existing-item depth | Nineteen tools/items, nine furniture types, shared supplies and explicit Use | Add a small selection with distinct roles and real ownership/cleanup. Every new item passes passive pickup, Use, cancel, pass, store/drop, trash/undo, interrupted use and restart. Every action is discoverable in the shared bag. |
| 6 | Quality evidence and uncluttered controls | Live sanity button, 140 regressions, scheduled soak and screenshot sequences | Extend the soak only for new behavior. Capture short motion clips and failure seeds. Check small Settings/bag sizes, named/All scope and keyboard exit; no duplicate catalogs, unexplained commands or permanent debugging overlays. |

For order 1, a useful concrete sequence is **notice → prepare → reach → grip → act → settle**.
Reuse this shape across existing actions while varying pauses and gestures by preset. Blurp might
inspect a tool, Leonard test its balance, Moss handle it carefully, Violet add a pocket trick and Ruby
lean into exploring it. These should remain small variations around reliable shared handling.

For order 2, resume only after rechecking ownership, furniture availability and body state. A bookmark
belongs to its original book. Temporary reactions must not retain seat/mover claims while absent.
There is no need for an LLM or a general-purpose planner to make a drink/read/return routine coherent.

For order 3, replace uniform turn duration with readable content-length pauses and bounded variation.
Occasional nods, glances, disagreement/reconciliation and remembered games can add life without more
speech bubbles. Care should favor reassurance, cooperation shared work, and rivalry friendly games;
none should override sleep, unfinished work or explicit user controls.

## Useful item candidates

| Candidate | Purposeful behavior | Why it belongs in a quality pass |
| --- | --- | --- |
| Pixel lamp | Switch on before reading/work, off afterward; movable like other furniture | Connects an object to an existing routine and makes preparation visible. |
| Cushion or blanket | Fetch, arrange on couch, rest, then put away | Adds caring/shared behavior and softer rest without another large integration. Needs careful ownership and seated layering. |
| Snack box | Take a small snack, pause, store the original box | Adds a quiet everyday action and cleanup. Keep supplies reusable; avoid a hunger chore loop. |
| Existing bouncy ball | Catch/pass/dribble with a willing partner | Gives an existing item more purpose rather than adding a duplicate toy. Ball ownership and spectator-safe interaction need clear rules. |

Start with the existing bouncy ball plus one or two new roles after motion/contact improvements.
More supplies should each offer an understandable activity, not merely increase the catalog size.

## Physics investigation boundary

The current definitions already have friction; adding a friction slider alone would repeat existing
work. First measure contact persistence, contour accuracy, mass ratios and fast motion. Candidate
experiments: cached contact features, compound convex shapes for concave furniture, selective swept
tests for fast objects, and coherent rest/wake behavior across a contact group. Keep intentional
manipulation responsive and retain peer-message ownership boundaries.

Use the existing five-stack/angled-furniture reproductions plus mixed-material stacks and impacts.
Provisional targets: less than 0.5px additional stack drift over 20 settled seconds, no energy growth
in an untouched lean, and p95 core update below the 8.33ms budget with the defined five-figure workload.
Add denser prop loads as a separately reported stress profile. These are future acceptance targets,
not claims that arbitrary stacks, concave geometry or tunneling are solved today.

## Stop point

The owner subsequently authorized Pet Quality 2 while away from their Mac. The implementation
and evidence are tracked in [PET-QUALITY-2-PLAN.md](PET-QUALITY-2-PLAN.md). Collect native hardware
feedback before resuming integration work. Keep Chrome/Finder milestones paused. The implementation and original acceptance
results remain in [PET-QUALITY.md](PET-QUALITY.md), with the owner sequence in
[CURRENT-CONTROLS.md](CURRENT-CONTROLS.md).
