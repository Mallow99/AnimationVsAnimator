# Changelog

Every working commit records concrete additions, behavior changes, repairs, verification and
remaining issues here. Entries describe shipped behavior; unverified hardware behavior stays explicit.

## 2026-10-24 — textured controls and materials (rc.3)

- Replaced customer whole-look/palette labels (including blurple) with hue, saturation,
  lightness and exact hex controls, plus independent appearance and movement sliders.
  Existing saved looks and development/lab presets remain available and unchanged.
- Added paper/linen surfaces, consistent buttons and focus rings in Settings, bags,
  activities and desktop conversation. Controls reflow at narrow window widths.
- Added deterministic, bounded procedural wood, fabric, metal, paper, leather, rubber
  and ceramic finishes to stock furniture, books, handhelds, blankets and wrapping.
  Geometry, proportions, collision and grips are unchanged. Older unedited stock
  definitions get the finishes; custom art stays intact, with a material opt-out.
- Added 4,096-colour conversion checks, legacy/custom material checks and actual
  Electron smooth/pixel deterministic-render tests with no simulation randomness.
- Updated the feature/making guides and capture script. Added a complete itch.io
  page in Markdown and paste-ready HTML, with matching setup, pricing and media notes.
- Verification: types, all existing core/model/conversation checks, seven release
  check groups, full simulation and actual Chromium interaction/variant fixtures pass.
  Real Electron customization, scope/reload, narrow layout, save recovery, backup,
  offline enforcement and acknowledged quit pass. Native CI and extended soaks follow.
- Remaining: physical Mac/Windows acceptance, verified store access, payouts and
  entitlement testing before a public paid release. No income or publication claimed.

## 2026-10-24 — feature guide and per-buddy customization (rc.2)

- Added a complete feature/customization guide to customer downloads and store/readme links;
  Settings now includes a discoverable feature list and shortcut back to customization.
- Exposed the existing five personality styles per buddy, with descriptions that match the
  selected personality. Preserves identity, conversation, original items and friendships.
- Added mix-and-match stance, walk, colour, line/head and rendering preset rows alongside
  the existing whole looks and fine sliders. Choices apply immediately and save per buddy.
- Bumped the candidate to 1.0.0-rc.2. Draft preservation now reads the metadata version
  instead of replacing rc.1. Native acceptance and store access gates remain open.
- Verification: typecheck, real Electron customization/scope/persistence + existing
  save/offline/quit flow passed; workflow YAML and core-change/manual selection verified.
  Native rc.2 package jobs are next.
- Core logic is unchanged. CI repeats core/browser/customer/native checks and performance;
  extended soaks repeat for core/dependency changes or manual runs. UI-only changes reuse
  the already passed seed-7/32 core soaks. Final validation results follow in the handoff.

## 2026-10-24 — native candidate validation and runtime update

- Windows native packaging passed on CI. Corrected Mac `lipo` argument order after
  compilation and ad-hoc signing succeeded but architecture verification failed.
- Added target-OS extraction/launch/helper/save/quit/restart smoke checks, including
  a path with spaces. Kept physical desktop acceptance separate from CI smoke tests.
- Added a direct Settings Quit control using the same acknowledged shutdown path,
  including its typed bridge declaration (corrected after the first typecheck).
- Updated Electron to 44.9.1 and build-time undici to resolve the audit advisories.
  Final Electron/native validation is repeated against the patched runtime.
- Aggregate types, 218 core regressions plus release checks, simulation and actual
  Chromium controls passed. Extended two-seed soaks/resources remain in progress.

## 2026-10-24 — Mallow Desk Buddies commercial candidate

- Added a distinct offline customer build with four simple tabs, welcome setup, a small
  starter scene, stable roster/name/appearance choices, local chat, activities, supplies,
  emergency Pause/Hide controls, save status and backup export. Original proportions,
  movement presets, item ownership and the development edition remain.
- Disabled commercial cloud/local AI, browser pairing server and file/document visits at
  shell boundaries. Quiet fresh defaults disable sound, window movement and cursor mischief.
  Mac focus hand-back keeps a helper mode that does not scan windows when features are off.
- Added acknowledged saves/quit, last-good backups, corrupt-original retention, visible
  write/quota failures and retry. Unread damaged saves are protected from replacement.
- Separated speech layout from body drawing so crowded bubbles can use free screen space.
  Fixed a long-soak crash: rotating modeled books cannot match previous convex-hull vertices
  by index. Platform contact now uses stable material vertices. Added 72-orientation landing
  coverage and repaired gift wording.
- Added allowlisted Mac ARM64 / Windows x64 packaging, compiled/ad-hoc-signed Mac helper,
  source manifests, SHA-256 archives, original icons and CI. Added install/privacy/recovery/
  distribution terms and truthful $5 store copy. No references, keys or saves are packaged.
- Verification so far: full pre-repair 217-check/core/Chromium suite, development Electron,
  final customer Electron IPC/reload/offline/failed-save/quit flow and the new 10-case model
  suite. Extended seed-7/32 soaks, final aggregate checks, resource measurement and CI native
  packaging are running; results will be recorded in the release implementation log.
- Candidate 1.0.0-rc.1 is not approved for sale. Native desktop/input/permissions/sleep/DPI/
  resources acceptance and seller payout/store entitlement verification remain required.

## 2026-10-20 — UX sanity and keyless long-form conversations

- Added a UX sanity guide with user controls, motion/contact contracts, interruption/recovery,
  conversation scope, truthful feedback, acceptance checks and a concrete remaining-cleanup list.
  General now includes an Experience guide; controls and README describe the new chat paths.
- Built-in local dialogue retains topics, facts, follow-up turns, personality and branching story
  choices without an account, model, download or key. Unknown subjects request direction rather
  than pretending to answer everything. Each figure saves its own bounded transcript/context,
  including visits and returns. Export saves text; scoped New conversation confirms before clearing.
- Desktop and Settings chat now have selectable scrollable transcripts, 4,000-character multiline
  composers, Enter/Shift+Enter/IME handling, persistent-in-session individual drafts, visible focus,
  accurate local capability text and private named scope. All/inactive scopes cannot send chat.
  New messages preserve history scrolling and append to live regions; desktop rendering updates
  the transcript only when its version changes. Long replies show a short bubble excerpt.
- Added optional Ollama on fixed local loopback for open-ended local-model conversations without
  keys or key-store reads. Installed-model discovery, JSON compatibility fallback and stopped-server
  feedback use the existing adapter without dependencies. Ollama/model installation is separate.
  Provider replies allow paragraphs; bounded recent model context restores from the saved transcript.
- Questions, ordinary activity mentions and negated clauses no longer start physical commands.
  Story choices stay fictional. Separate queued messages get separate answers. Stop/reset/provider
  changes invalidate late replies; reaching the call cap falls back to local dialogue.
- Open chat no longer stops a requested walk or an active activity's approach/return every frame.
  Pong court visibility is now explicitly controlled rather than appearing/disappearing on a timer.
- Diagnosed the modeled-book depth fixture: outer cover grips are not an interior depth plane.
  The test now checks both real cover contacts and depth around the spine in both facings. No depth
  assertion was simply removed. Full browser cursor-gun attachment passed; the earlier timeout was
  not reproduced, so no underlying weapon fix is claimed.
- Verification: typecheck/build; 217 focused regressions (78 general, 30 roadmap, 18 quality, 20 living,
  36 Update 2, 11 polish, 9 model, 15 conversation); full seed-1 simulation; complete Chromium
  pointer/keyboard/render/preset suite; final dedicated chat UI/reload/export/scope checks; local
  provider adapter with fake HTTP responses; Linux Electron/Xvfb including real preload/IPC,
  named/All chat, reset/cancel, saved story, provider controls and existing activity/file checks.
  New chat captures under docs/verification/ux-*.png are cloud previews, not native desktop evidence.
- Limits: built-in dialogue covers authored topics; actual Ollama inference/quality/resources were
  not tested. Mac/Windows hardware input/focus/permissions/DPI, isolated model performance, full
  prototype lifecycle/RAM acceptance and a new Windows package remain outstanding. The earlier
  model prototype is not declared complete. No new Chrome/Finder integration.

## 2026-10-12 — Paused WIP: reusable 3D props and hinged book prototype

- Added typed XYZ surfaces, solid boxes, named grips, visible-face projection/picking, shading and
  depth parts; retained the pixelated Canvas renderer and added no dependencies.
- Stock books now have solid hinged covers, spine/page blocks and a turning leaf. Reading points
  pages at the figure and connects XYZ hands to model grips. Rendering, picking and projected
  collision hulls share geometry; bounded caches reuse unchanged contours. Custom artwork, original
  ownership and progress stay supported; transient reading orientation clears during custody changes.
- Added nine model checks, updated old flat-art fixtures, book-axis live audits and a separate
  development preview for model rotation/hinge/page/grip/picking. No new production controls.
- Paused at the owner's request. Final typecheck/build/lab build passed; intermediate focused
  regressions and seed-1 simulation passed. Living-depth assertion and cursor-gun browser readiness
  failed and remain unresolved. Latest edits have not received full regression/visual acceptance.
- Five-figure profile p95 was 13.219 ms under concurrent tests; isolated measurement is pending.
  No new RAM/soak/native acceptance/Windows package. Existing delivery is still `b727a02`.
  PROP-MODEL-CHECKPOINT records exact next steps. This checkpoint is not a finished release.

## 2026-10-12 — Varied everyday life, raised books and occupied-seat clearance

- Separated self-chosen reading/TV/gaming/seating from long requested sessions, including joining a
  friend's TV. Added bounded quiet-activity repeat cooldowns and purposeful movement/tool choices
  after stationary time; work/play relieve boredom. Quiet seated figures can choose a next activity,
  sleeping stays protected, and autonomous reading uses owned unfinished books.
- Raised and tipped books toward the face, tightened the grip for neighboring heads, connected both
  hands and gaze to actual book/page geometry, avoided prone reading and quieted the seated helper.
  Turns count after finishing and before closing; covers close in the raised grip before the same
  original is stowed or returned to a real shelf. Existing proportions, presets and artwork remain.
- Added finite book lengths (96 default), saved progress/completed-reading counts, bounded old-save
  migration and custom `pages` metadata. Progress follows restart, custom shelves and actual gifts.
  Owned cards show page/total/percentage or Finished and offer exact-original Read this book/Read again;
  named Settings shows the live page without attributing one person's book to All figures.
- Idle standing spectators walk outside merged occupied-seat intervals through peer snapshots;
  seated readers retain their books and seats, and purposeful/social/combat contact keeps its timing.
  A new activity request clears a stale walk destination; this fixes the replayed seed-1 couch/TV
  failure without weakening its assertion. TV game comments have cooldowns while gameplay continues.
- Added eleven focused regressions, repeatable unattended observation, book-state live audits and
  actual browser pointer/facing/preset checks plus rendered opening/page/closing/departure previews.
  Independent peaceful browser fixtures clear preceding combat shots and wait for recovery/clear
  incidental recovery plans before starting the next acceptance scene.
- Verified typecheck/build, 193 regressions (182 existing + 11 new), full seed-1 simulation, functional
  35-phase soak (2,566.4 simulated seconds, 2,635 audits, zero issues), two 15-minute unattended
  profiles, actual Chromium/Electron input and visual review. Final tighter grip has additional
  head/reach regression and rendered acceptance. Windows x64 portable package rebuilt/inspected.
- In the controlled seed-32 scene, reading/TV/games fell from 79.0% to 22.2% of figure-time; seed 7
  measured 30.1%. Both had 900 live audits and no stranded seated-idle state. Fresh furnished Linux
  Electron RAM medians: 348 MiB PSS, 422 with Settings, 384 after closing; these are not Mac estimates.
- Sampled both owner-supplied AvA/AvM videos and closer sequences; comparison/method/limits in
  docs/AVA-POLISH-COMPARISON.md. Reference videos/stills are not committed. More specific nonverbal
  acting/shared outcomes and complex crowded approaches remain; Mac/Windows native acceptance and
  existing file/physics/display limits remain. Stop before further integration.

## 2026-10-11 — Repair file/folder ownership, return and controls

- Replaced inventory recreation during visits/returns with original-object transfer; custom artwork,
  bookmarks, game progress, ink, ammunition and reload clocks follow the same tools. Released stale
  furniture claims and restored desktop subscriptions. Wired visitor bag/chat/save controls and
  custom-definition reloads; the live audit includes visiting inventories.
- Retained still-open document identities across another app's focus, followed current window
  geometry, and cleared closed/replaced/inaccessible documents. Moving a file window shifts body
  anchors and loose-item physics together without double movement or erasing velocity. Five initial
  same-folder visitors spawn apart.
- Added a separate File and folder visits card: named paths/kinds, detected/waiting status, helper
  messages and stable action feedback. All requires a name before choosing and can return all visitors.
  Hidden figures offer Return and open bag. Unsupported/undetected files and inactive targets refuse
  entry. Restarts respect the roster; turning visits off/removing visitors saves the return immediately.
- Added six regressions, five-figure file lifecycle soak coverage and actual Electron named/All,
  restart, bag/chat, pointer-return and platform-refusal checks. Explicit fake-file reports make cloud
  verification reproducible and visibly labeled. Updated controls, roadmap, handoff and visual evidence.
- Passed typecheck/build, 182 regressions, full seed-1 sim, actual Chromium/Electron checks and visual
  inspection. Seed-32 soak passed 2,566.4 simulated seconds, 2,635 audits and 35 phases with zero issues.
  Windows x64 portable package rebuilt and inspected. No new RAM measurement.
- Remaining: real Mac/Windows file detection, permissions, Spaces/focus/occlusion acceptance;
  Mac document-app limitations, unfinished icon entry and session-only visit furniture. This repairs
  the existing prototype and does not begin the next integration milestone.

## 2026-10-10 — Restore relaxed standing after owner feedback

- Removed permanent hands-on-hips/hands-behind-back personality defaults and their forced turn
  toward the viewer. Neutral standing respects the chosen stance again; individual walking, sitting,
  speech and satchels remain, with expressive poses driven by mood/activity context.
- Added a reaction-to-rest regression for all five personalities in both facings, and actual
  Chromium neutral-standing captures for the roster and every appearance/movement preset.
  Peaceful browser item/group fixtures now reset moods after the separate duel scene, preventing
  carried-over combat reactions from derailing their setup.
- Replayed the seed-1 scrolling-ledge simulation failure. Its fixed delay sampled a sit only
  0.167 seconds into the transition (or previously passed after standing up). The fixture now waits
  for a real settled sit and checks the same ledge and seated state after the scroll; displacement
  remains checked, with the full 50 pixels followed. No scrolling/controller behavior was changed.
- Passed typecheck/build, 176 regression checks, full seed-1 simulation and actual Chromium
  interactions/visual inspection. Rebuilt the Windows x64 portable package. Before/after captures,
  template guidance, roadmap and handoff record the correction. Mac/Windows native feel/focus/input
  acceptance remains pending; the prior two-hour quality soaks were not rerun for this small pose fix.

## 2026-10-09 — Pet Quality 2: final sanity, visual evidence and delivery

- Completed the ordered checklist and recorded the exact change list, fulfillment assessment,
  reusable character guide, controls, roadmap stop and final handoff in PET-QUALITY-2.md and related docs.
- Replaced the TV cabinet's decorative console with a plain drawer so the actual detachable console
  is clear. Verified stock TV upgrades while preserving custom/deleted examples.
- Passed typecheck/build, 175 regressions and full simulation; actual Chromium interactions plus
  Linux Electron upgrade/preload/input/settings/focusability checks; visually inspected procedural
  item/motion frames and all preset variants/both facings. Committed representative captures.
- Final seed-32 feature/unattended soak: 7,200 simulated seconds, 7,215 live audits, 34 phases, no
  reported issues. Earlier expanded seed-31 and core seeds 7/17/21 also passed two hours each;
  persistent reports identify their stages. One-time apology behavior is included in the final run.
- Recorded current RAM: one ordinary 293 MiB PSS, five furnished 344–378, Settings open 425;
  twelve Settings cycles 384 and another minute 391. Isolated five-figure core mean/p95 1.168/2.351 ms;
  loaded Chromium frame median/p95 16.7/33.4 ms. No Mac measurement or leak guarantee.
- Rebuilt and inspected the 368.5 MiB Windows x64 portable package: matching current bundle/TV art
  hashes, real PowerShell helper, 32 definitions and no source maps/saves/provider keys.
- Remaining: native Mac focus/desktop return/Spaces/Swift/permissions/click-through and Windows
  helpers/input/mixed DPI; documented rotation/extreme-speed/snapshot physics, crowded simultaneous
  bubbles, one handheld runner and session-only suspended activities. Stop before the next milestone.

## 2026-10-09 — Pet Quality 2: personalized figures, friendships, gifts and pocket games

- Added reusable five-personality motion/voice/satchel templates over the existing body presets,
  distinct sitting/walking/conversation accents, Cobalt/Amber default-name migration and saved
  keepsake stickers at shared-activity milestones; custom names and stable roster slots remain.
- Added bounded friendship trust/familiarity/respect/generosity, stages/preferences/history,
  confidence/affection/stress and contextual reassurance. Intentional bumps record both sides;
  apologies resolve a pending incident once and preserve the longer relationship history.
- Added flowers, considerate original-item gift selection, three pen-drawn wrapping styles,
  unwrapping/inspection/storage, receipt/refusal/cancel protection and preserved identity/progress.
- Reworked handheld handling/perspective around its real runner, actual thumb presses, saved best
  scores and short two-owner shared sessions. Consoles are detachable TV attachments with explicit
  Bag controls; optional gating agrees across TV games and does not affect handhelds.
- Kept shared GUI organization, aligned gift/pass requirements, skipped closed-bag catalog rebuilding,
  and extended live sanity checks to moods, saved progress and attachment state. Fixed mood boundary
  drift found by the soak. Added current controls and a future-character template guide.
- Verified typecheck, the 140 existing regressions, full simulation and 35 focused Update 2 checks;
  actual Chromium interactions/three wrappers/game/attachment/motion frames and Linux Electron
  upgrade/settings/input/focus checks pass. Expanded seed-31 two-hour soak passed 34 phases and
  7,215 audits; final seed-32 replays the last apology repair before delivery. Windows x64 packaging
  completed. Final evidence/resource/profile/handoff and PR update follow in the delivery commit.
- Current Linux medians: one ordinary figure 293 MiB PSS; five furnished 378, after twelve Settings
  cycles 384 and after another minute 391. Hardware focus/Spaces/permissions and physics rotation/
  extreme-speed limits remain. Handheld sharing compares runner games; it is not a cable-link game.

## 2026-10-08 — Pet Quality 2: contact, handling, continuity and domestic life

- Added bounded compound furniture contours, persistent resting friction, density-weighted contact
  and swept fast translation; preserved dragging, pushing, throws and custom artwork fallback.
- Added reusable notice/reach/grip handling, saved original-book bookmarks and one safe interrupted
  activity that resumes after brief reactions. Explicit commands and lost resources cancel it.
- Improved directed group turns, listener timing and saved shared history; conversations can continue
  when one member leaves. Added an automatic/manual lamp, blanket, snack box and actual-ball catch.
- Hardened ownership cleanup, object hit-testing and body selection through shared furniture; All
  activities choose an eligible initiator and shared catch/lamp commands start once.
- Passed typecheck, 140 existing regressions, full simulation, actual Chromium/Linux Electron input,
  18 focused regressions (lamp intent check added for this commit), and three two-hour simulated
  feature soaks (seeds 7/21: 7,274 audits each; seed 17: 7,200 including unattended life), no issues.
  Browser visual fixtures cover all presets and both facings; final visual/expanded acceptance continues.
- Furnished Linux Electron median PSS about 321 MiB, 339 after twelve Settings cycles, 385 after another
  minute. No Mac estimate or leak guarantee. Native hardware and rotation/extreme-speed limits remain.
- Owner expanded Update 2 with personalized motion/names, richer friendships/gifts, handheld peer
  play and developing satchel details; those features are the next working milestone.

## 2026-10-08 — Start Pet Quality 2 with bounded rendering and resource evidence

- Recorded the owner's authorization and ordered implementation/acceptance checklist.
- Pixel workspaces clip offscreen throws to the Retina-aware viewport, reuse the same canvas,
  shrink after sustained smaller use and reuse outline masks. Procedural art/presets remain intact.
- Added disposable whole-Electron RAM profiling with ordinary/furnished/Settings lifecycle cases.
- Passed typecheck, focused canvas allocation regression and full actual Chromium controls/rendering;
  visually inspected five seats. Furnished/after-cycle medians about 360/381 MiB PSS: no RAM reduction
  claimed from variable short samples. Longer resource/native checks and the remaining quality work
  stay on the active checklist.

## 2026-10-08 — Research Pet Quality Update 2

- Added a source-backed proposal grounded in animation principles, offline decision continuity,
  group steering/turn-taking, official Box2D contacts and People Playground object properties.
- Ranked native acceptance, attention/motion, resumable routines, social history/timing, contact
  fidelity and useful item candidates; included measurable acceptance and clutter/ownership checks.
- Linked the research from roadmap/handoff. Research only: no runtime changes or new integration.
- Verified source content and local document links; git diff whitespace check passed. The completed
  implementation (`7a9e0a0`) and its 140 checks/34m52s soak remain the acceptance baseline.

## 2026-10-08 — Complete physical/social life and Pet Quality acceptance (`7a9e0a0`)

- Replaced seat slides with brace/lift/small scoot/settle motion and fixed spawn walking references.
  Group conversations share turns, listening and distinct preset replies; ordinary chat includes
  available 3–5 figures while reading, sleep and queued work retain their activity.
- Kept duels exclusive and protected spectators from incidental figure attacks/third challengers.
  Exposed exact-object Move beside furniture actions and strengthened autonomous TV arrangement.
- Added social/creative need, frustration and contentment with activity/rest causes, saved state,
  Mood/Mind rows and optional AI context. Cooperation, care and friendly rivalry affect invitations,
  reassurance and partners. Group/Pong/friendly-duel completion records real shared history;
  interrupted activities do not automatically lower affection.
- Fixed inactive owners reserving hidden bookshelf slots and restored furniture-platform subscriptions
  on rejoin. Added a bounded read-only in-app sanity audit and removed hidden duplicate Settings catalogs.
- Added a repeatable scheduled lifecycle/activity soak with requested-skill assertions and a saved
  phase report. Passed typecheck/build, 140 regressions, full seed-7 sim, and 2,092.4 simulated seconds /
  2,159 audits / 26 phases with no reported issues (seed 21). Actual Chromium and Linux Electron
  input/focus checks passed; visually inspected books, scoots, five seats and group/combat artwork.
- Five-figure core mean/p95 1.327/1.805ms; loaded Chromium median/p95 16.7/33.4ms. Windows x64 package
  includes current bundles/helpers/definitions without saves/keys. Updated checklist, controls,
  roadmap, handoff and visual evidence. Stop before more Chrome/Finder work.
- Remaining: real Mac focus/Spaces/Swift/click-through and Windows native input/DPI; approximate
  concave contacts, extreme-speed tunneling, snapshot contacts, session-only Undo and main display.

## 2026-10-06 — Select the roster and unify settings, inventory and supplies (`8bc46a8`)

- Added 1–5 stickmen count labels and a selectable five-character preset roster, including Ruby solo.
  Stable config/save identities preserve removed characters' actual items and relationship saves.
  The active first character runs shared furniture; canonical furniture saves stay in slot zero.
- Consolidated Settings into one window with named/All figures targeting. Kept edited names,
  colors and personalities during legacy migration and reset; private memories require a name.
- Unified desktop/tray/Settings inventory entry into the same Bag/Supplies/Activities panel.
  Added a target dropdown, search, owned shelf/world item visibility and bulk supplies with separate
  ownership and explicit full-bag feedback. Shared furniture/activity commands run once.
- Verified typecheck, ten sanity checks, actual Chromium roster/bulk ownership/removal controls,
  and Linux Electron single-window settings, target switching, shared settings, bulk supplies and
  pointer/keyboard/Othello/chat focus. Inspected unified bag and settings artwork.
- Personality reactions and physical/social-life improvements are next in this authorized update.
  Mac focus/Spaces and Windows native hardware checks remain open.

## 2026-10-06 — Repair item continuity, book handling and rigid prop contact (`af56778`)

- Fixed deletion of earlier drawn projects/tools, stranded full-bag/passive-carry reloads and
  double-clock reloads. Owned guns now advance once on the inventory clock; practice guns use
  their controller. Deliberately drawing twice keeps two distinct saved projects.
- Fixed stale reading targets on book-return walks. Stock pages tilt toward the reader and draw
  in front of the satchel; edited covers retain their art. Book opening and closed collision size
  now agree, including its physical grip/tip length. Prefer the book's original usable shelf.
- Fixed five-body stack drift and angled-furniture launches by removing duplicate rigid contact
  constraints, preserving velocities during shape correction and projecting rigid motion.
  Stacks settle without pinning; hits, grabs and throws remain active.
- Fixed browser fixture sleep/injury contamination and explicit movement requests blocked by reading.
- Added the ordered Living Stickmen checklist, the offline-life core principle and npm run sanitycheck.
- Verified typecheck, 72 regression/30 roadmap/18 quality checks, nine new sanity checks, full seed-7
  simulation, actual Chromium controls and visually inspected reader-facing books/return poses.
  Later roster/social work remains in progress; native Mac/Windows acceptance is still open.

## 2026-10-06 — Polish pet life, item handling, reloads and prop contact (`9790ec7`)

- Added cups, dumbbells, yo-yos and a bookshelf with five actual owned-book slots.
- Changed seating/couch spacing, quieter personality choices and book opening/page/closing/return.
- Changed pickup to passive transport with explicit cursor Use, Carry, Drop and cleaner Stop.
- Fixed interrupted-burst reload resets, some prop contact drift, elevated group gatherings and
  keyboard/refocus ownership. Preserved six-round reload mechanics.
- Verified 72 regression, 30 roadmap and 18 quality checks; simulations seeds 1/7; ten-minute
  2/5 figure soaks; Chromium and Linux Electron interaction; Windows portable packaging.
- Subsequent sanity review found deletion of older ink projects, idle/full-bag and passive-carry
  reload stalls, stale returning-book hand targets, closed-book collision mismatch and overridden
  custom book art. These are tracked in the Living Stickmen checklist. Native Mac remains unverified.

## 2026-10-06 — Make bags and activities discoverable (`269d561`)

- Added right-click Open bag, separate Bag/Supplies/Activities, requirements and explicit controls.
- Fixed Cancel restoration, queued Stop, panel placement, leaked accessory limb widths and Pong UI.
- Verified 72 regression/30 roadmap checks, simulation, Chromium and Linux Electron input checks.
- Native desktop focus/Spaces still requires Mac acceptance.

## 2026-10-06 — Complete Workshop and Household (`1965e71`)

- Added satchels, blueprints, ink crafting/refining, workbench/storage, furniture movement,
  relationships/talents/daily rhythm, group activities, Pong and handheld games.
- Added offline and validated AI action vocabulary; saved projects, placements and relationships.
- Verified 72 regression/25 roadmap checks, simulation, 2/5 figure soaks, Chromium/Electron and
  Windows portable packaging. Native hardware behavior and precise concave contact remain open.

## 2026-10-05 — Overlay grab bag and reversible trash (`23a1788`)

- Added overlay supplies, original-item transport/transfers, trash and one session-only Undo.
- Added pointer/keyboard interaction and ownership/restore regression coverage.
- Linux simulation/browser/Electron checks are recorded in the handoff; Mac desktop behavior
  was not verified.

### Candidate evidence and preservation follow-up

- Mac ARM64 and Windows x64 candidates passed native CI extraction, real helper,
  Pause/Resume, save/normal quit/restart checks. Downloaded ZIP hashes and packaged
  contents were independently verified; the PR test-merge tree matches a82b6f4.
- Added actual runtime store media/capture recipe and draft release notes. Direct
  release asset uploads were refused by the workspace upload credential; the CI
  preservation job uses its own scoped token after all tests and keeps releases draft.
- Backup export now waits for every memory load, refuses unread/corrupt state, and
  passes real Electron full-identity export, credential-exclusion and cancel checks.
- Fixed Windows path normalization in package exclusions and made the existing
  8.33ms core p95 target fail CI when exceeded. Removed duplicate PR/push runs.
- Isolated Linux core p95: 0.337ms (two) / 0.958ms (five). Whole-tree PSS medians:
  315/319MiB ordinary two/five; rich five 381MiB, 389MiB after 20 Settings cycles,
  397MiB after rest. Six processes; this does not prove settled long-term memory.
- Seed 7 passed 7,200 simulated seconds / 7,220 live audits / 35 feature phases.
  Final seed 32, candidate preservation and release record are in progress.

### Final local acceptance and runtime media

- Seed 32 also passed 7,200 simulated seconds, 7,220 live audits and 35 phases.
  Both final archives at 2a78d2b pass native smoke checks and local checksum/content audit.
- Updated source-labelled runtime cover/screenshots and 15-second demo, with measured
  wall-time capture (about 15 seconds). The capture recipe passes Node syntax checks.
- Recorded focused test totals, both full soaks, isolated core profile, whole-process-tree
  memory samples and exact final ZIP hashes in docs/verification/mallow-release.json.
- Final CI soak repetition and draft preservation are in progress. Physical native QA,
  seller/payout access, store entitlement testing and stable public sale remain open.

### Final CI and draft delivery

- CI run 40046018836 passed aggregate checks, patched Electron/export flow, both full
  seeded soaks, the core performance gate, both native packages/smokes and draft preservation.
- Both final ZIPs and checksum files are uploaded in the draft release. GitHub asset
  digests match the locally validated files; source is 2a78d2b. CI core p95 was
  0.308ms / 0.777ms for two/five figures, separately from the earlier local measurements.
- The combined evidence artifact was skipped by GitHub's hidden-directory default.
  Saved the actual completed CI result lines in the repository, explicitly enabled
  the allowlisted hidden paths and made future missing-evidence uploads fail. Workflow
  YAML parses; this reporting-only correction does not change the tested app archives.
- Updated handoff/checklist and complete machine-readable verification. Physical
  desktop acceptance and authenticated store/seller verification remain open. No public sale.

### rc.2 customization acceptance and media

- CI 40048614400 passed aggregate checks, real Electron personality/preset scope and
  reload, existing save/backup/offline/quit flow, both native candidate/helper smokes,
  packaged feature guide presence, and performance (two/five p95 0.429/1.095ms).
- Both ZIPs/checksums are preserved in a separate rc.2 draft. Remote digests match
  native CI package hashes. Core is unchanged, retaining rc.1's passed extended soaks.
- Refreshed runtime media and added an expanded customization screenshot/capture recipe.
  Recorded exact results and download provenance; physical QA/store setup remain open.
