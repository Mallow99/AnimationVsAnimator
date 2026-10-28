# Current handoff

Start here after reading the project vision in `CLAUDE.md`.

## Seeded gift follow-up — 2026-10-28

Initial rc.4 source 21965d9 passed aggregate, all three customer Electron flows and
both real-helper native package/restart checks in run 40757881932, but seed 7 failed
before the extended tail at the wrapped gift receipt assertion. Draft preservation
correctly skipped. This is a real bag reach failure, not a recipient-selection
fixture problem; the existing soak assertion stays unchanged.

The seeded replay isolated body-following feedback: normal floor stoop lowers the
hips while reaching for the hip-mounted satchel, moving the target away. Scoped
body-relative reach metadata now suppresses that floor bend while keeping arm IK,
lengths, timings and contact distance. Explicit arm metadata makes stow/wrapping/
gift validation use the hand holding the original after a turn. Replacing or
clearing the target removes both modes. Gift stop clears late pen cleanup targets.

Typecheck and all 14 contact checks pass, including actual held-arm contact, both
facing directions, missing-arm rejection and world/floor reaching after replacement.
Both unchanged lifecycle seeds and final CI/native/archive evidence are being repeated.
The first run's native hashes are historical and must not identify the fixed downloads.

## Arnold and release-quality continuation — 2026-10-28

The owner approved the quality plan and specified **JT letters on Arnold's arm**,
then asked to continue after the usage limit reset. Product metadata is **1.0.0-rc.4**.
The following implementation is current; the rc.3 evidence below remains historical.

**Internal bonus setup:** Settings → Settings → Bonus code accepts `ARNOLD`
(case-insensitive, with surrounding whitespace ignored). Unlocking persists the known
`arnold` flag in product-state.json before announcing success, adds stable profile id 5
(pet-6.json / memory-6.json), and sends one roster update. Reusing the code does not
add another buddy. Failed writes and unread damaged setup saves do not grant an unlock.
Do not put the actual code in public store copy; recipients can enter their bonus code.

Arnold starts copper (`#c47d48`), with the existing competitive personality and a friendly
trainer persona. His proportions and movement presets are unchanged. JT is drawn on his
left upper arm, including a detached arm, in smooth or pixel rendering. The Arnold-only
JT arm tattoo toggle can hide it; name, colour and other usual controls remain editable.
There are now six saved profiles after redemption, but **at most five active**. Redemption
does not activate him or replace anyone. Meet Arnold selects his controls; when five are
out it asks the user to put one away first. Original five ids and saves stay intact.
Each profile keeps its own original items, book progress, chat, memory and friendships.
The development UI also reads the dynamic saved roster; it does not gain a second code form.

Customer Settings, bag, activities, conversation and Pong surfaces now use embedded paper
fibres, woven linen and quiet wood grain with clearer inset/selected/focus states. All are
local; the overlay remains transparent outside controls. Reduced-motion and narrow-name
layouts are retained. New furniture supplies show their actual footprint and a floor guide.
Snap to floor is a visible saved option: it only aligns clear near-floor drops, checks
furniture, loose items, balls, active figures and edges, then releases normal physics.
Existing furniture drags retain their previous physical behaviour. Cancel removes a newly
pulled supply. This is placement assistance, not a general collision/stacking overhaul.

Handling no longer succeeds after a timeout. Actual hand distance gates pickup, stow,
gifts, lamps and furniture claims. Unreachable attempts reposition within a bounded budget
or abort without transferring ownership or claiming an action happened. Floor pickup uses
a bounded knee bend; shelf return approaches the real free slot. Preserve these geometry
repairs and the unchanged regression assertions rather than restoring timed success.
Settings quick activities share the bag's availability rules, show current friendly labels,
explain blockers and receive an acceptance result. An accepted request is queued/running
work, not proof of completion. Shared activities still use the existing peer interface.

Backup export format is now **2**, adding `productState` (including known unlocks) to the
existing configs/worlds/memories/definitions allowlist. It still excludes credentials and
still has no one-click importer. Preserve product-state.json in whole-folder recovery;
older version-1 JSON exports contain no unlock field.

Focused bonus/contact/placement/activity-request checks and working-tree release Electron
checks have passed locally, including failed-write/retry, repeat redemption, cap handling,
private sixth-book/chat/memory state, JT attached/detached render differences, reload and
backup. These are Linux/Xvfb checks with simulated desktop reports, not native physical QA.
The tests ran before a new source commit; refresh their source evidence after commit.
Actual working-tree GUI and Arnold/JT captures have been visually reviewed. An initial
aggregate run exposed the legacy base-five spawn-order default assertion; merge now
appends only base ids while preserving an explicitly supplied bonus id. The test was
not weakened. Final aggregate verification, both seed-7/32 7,200-second soaks, native
Mac/Windows packages and exact draft archives are being repeated. Record their committed source/results before
calling rc.4 a verified delivered candidate. Real native smoke checks must also retain the
sixth profile/unlock on process restart.

Next: finish those checks and visual inspection, preserve rc.4 as a separate draft candidate,
refresh media/evidence and update draft PR #4. **Do not publish a paid release** until physical
Mac/Windows and authenticated seller/payout/download-entitlement acceptance in
[release/ACCEPTANCE.md](release/ACCEPTANCE.md) passes. No new Chrome/Finder feature work.

## Validated rc.3 delivery — 2026-10-24

Latest tested app source: **09fd9eb**. All four jobs in UI/native run
[40141842676](https://github.com/Mallow99/AnimationVsAnimator/actions/runs/40141842676)
passed. The core/material baseline **cf23c00** passed full aggregate/customer/native,
both seed-7/32 extended soaks and draft preservation in run
[40140358177](https://github.com/Mallow99/AnimationVsAnimator/actions/runs/40140358177).
Each soak: 7,200 simulated seconds, 7,220 audits, 35 phases, no issues. Final UI run
correctly skipped redoing the unchanged core's soaks; all other checks repeated.
Core combined p95: 0.297 ms (two figures), 0.788 ms (five), within 8.33 ms.

Both exact final ZIPs/checksums are in the [rc.3 draft](https://github.com/Mallow99/AnimationVsAnimator/releases/tag/untagged-51f75ab71a059bcef180).
Remote asset digests/bytes match native package logs for 09fd9eb. Full results:
verification/mallow-materials.json; core evidence: verification/mallow-material-core.json.
Customer features/material/customization and making guides are packaged. Final media
source is 09fd9eb, including an actual 15-second demo; see store/media/SOURCE.json.
Complete itch.io copy: store/ITCH-PAGE.md and store/itch-page.html; setup: store/LISTING.md.

Next: physical Mac/Windows acceptance and authenticated seller/payout/download-entitlement
checks in release/ACCEPTANCE.md. The listing is written but unpublished, and the release
stays in draft. No paid launch or income is claimed. No new Chrome/Finder feature work.

## Final narrow-window correction — 2026-10-24

Maximum-length unbroken names previously expanded the 380px customer window to 854px.
Roster and status now wrap (365px content with the 15px scrollbar). Five simultaneous
40-character names, usable checkbox/swatch sizes and name restoration are verified in
release Electron; see verification/mallow-custom-names-small.png. Only customer CSS and
its QA change; core remains cf23c00. The correction was pushed after run 40140358177 passed; final UI CI correctly retained
its successful core baseline.

Both independent local cf23c00 soaks passed 7,200 seconds, 7,220 audits and 35 phases;
combined source/bundle evidence: verification/mallow-material-soak-local.json. Store copy,
HTML and all media are complete. Final CI/archive recording is complete; see the delivery entry above.

## Verification continuation — 2026-10-24

The browser diagnostic listener exposed a QA cleanup bug: signal-exited children have
null exitCode but a nonnull signalCode. Waiting for a close event that already fired
hung verification. An injected SIGTERM reproduced it (timeout 124); cleanup now checks
both properties and reports the failure immediately (exit 1 with stderr). CI attempt a9a3859 actually passed the aggregate (including browser) and release
Electron, as its retrieved artifact confirms. It was cancelled during extended soak
while the connector still reported verify as active. Do not describe it as a failed
browser run. The final cf23c00 run includes the chat CSS and signal-cleanup corrections.
Local Chromium passed with diagnostics enabled. Desktop chat CSS precedence is also fixed and computed-style
asserted in actual release Electron, alongside the existing flow (passed).

Isolated release rich five-figure RAM evidence is verification/mallow-material-memory.json:
407.9 MiB PSS before, 407.0 after 20 Settings cycles, 404.2 rested, six processes and
clean audits. An earlier run overlapped capture and is not used for the resource result.
No native performance or long-term leak guarantee follows from this short Linux run.

## Textured UI and continuous customization — 2026-10-24

The owner requested release cleanup, richer textures and sliders/hue controls in
place of prototype presets, followed by a complete itch.io page. Metadata is rc.3.
Customer UI now has HSL/hex colour controls and independent value-labelled look/body
sliders. Personality remains separate. Saved look values are preserved. Development
and lab presets are retained. Paper/linen GUI surfaces extend to bags and chat.

Stock furniture and selected handheld/domestic/book surfaces use tiny cached local
procedural tiles, no new runtime dependencies or downloaded assets. Tiles are bounded;
per-context patterns use a WeakMap. Materials do not consume simulation randomness or
modify geometry. Legacy stock art matches receive materials; edited art and explicit
`material: none` preserve the original finish. MAKING-THINGS and FEATURES document it.

Local verification: typecheck and existing core/model/conversation groups; seven
release groups (including 4,096 exact colour round-trips and all ten legacy/custom
prop definitions); full simulation; Chromium controls, activities and all variant/
facing fixtures; actual release Electron smooth/pixel render determinism, HSL/hex,
rapid independent slider edits, scope/reload, 380px expanded layout, offline/save/
backup/quit flow pass. Initial aggregate run stopped at a newly written parser fixture
missing the required `type: prop`; corrected the fixture, release checks then passed,
and simulation/browser ran independently. Full aggregate/native/extended CI follows.

Complete store description: store/ITCH-PAGE.md and store/itch-page.html. Internal
listing/settings/media notes: store/LISTING.md. Keep unpublished until native/store
acceptance. Refreshed media and a stock-material atlas are prepared. CI run 40139716478 passed
both native archives and all core groups/simulation, but Chrome launch timed out in
both attempts before any page loaded. Browser QA now logs bounded startup stderr and
checks early exit; full CI repeats. Extended checks now compare the last successful
workflow source, preventing a failed core update from being skipped on a follow-up.
Exact rc.3 archive/evidence recording remains next.

## Feature list and customization — 2026-10-24

The owner requested a feature list and customization. Candidate metadata is now rc.2.
Customer downloads include release/FEATURES.md. Buddies exposes five existing personality
choices, whole-look bundles, mix-and-match stance/walk/colour/line/render presets and fine
sliders; all apply per selected buddy. Settings contains a feature list and shortcut.
Core character proportions, personality templates and movement presets are unchanged.

Draft preservation uses product.json's version, preserving the verified rc.1 download.
CI skips the already-passed extended soaks for UI-only pushes; any core/shared/build/dependency
change or a manual run repeats them. Aggregate/browser/customer flow and native package
smokes still run. Candidate rc.2 verification passed in CI run 40048614400: aggregate/browser/customer
flow, customization scope/reload, both native packages and performance. The packaged
feature guide is asserted in native extraction checks. Both ZIPs/checksums are in a
separate rc.2 draft; remote digests match the CI-built archives. See
verification/mallow-customization.json and release/FEATURES.md. Prior evidence below
is rc.1. Physical desktop/store acceptance remains open.

## Latest owner request: commercial product implementation — 2026-10-24

The owner approved turning this repository into a $5 offline product, **Mallow Desk Buddies**,
with Apple Silicon Mac and Windows 11 x64 candidates, no upfront spend and minimal intervention.
Work is on `codex/paid-release`, based on `codex/roadmap-continuation` (609a844). The request
resumes the relevant model quality/lifecycle work and supersedes historical pause instructions.
No new Chrome/Finder feature work is authorized or necessary.

Use [release/IMPLEMENTATION.md](release/IMPLEMENTATION.md) for current scope/evidence and
[release/ACCEPTANCE.md](release/ACCEPTANCE.md) for the unchecked release gates. Commercial
build: `npm run build:release`; development build remains `npm run build`. Both use `dist`,
so do not rebuild one while testing/reloading the other. Keep `product.json` as version source.

Customer features and reliability are implemented, including original-look figures, quiet
fresh defaults, welcome scene, four tabs, offline enforcement, pause/hide, acknowledged saves,
backup recovery and quit. Native packages are candidates, not proof of native acceptance.
The Mac helper is compiled on macOS CI; customers never compile it. Mac focus-only mode
keeps hand-back available while window scanning is off. Real hardware behavior is unverified.

The extended soak exposed a rotating-book crash in platform contact. Convex hull counts/order
are unstable under rotation; stable model vertices now pair current/previous material points.
A 72-orientation landing regression passes. Both seed-7/32 two-hour simulated soaks passed
(7,220 audits and 35 phases each). All 218 core checks, five release groups, simulation,
Chromium and patched Electron customer/export flow pass. Native Mac/Windows CI archives
from 2a78d2b pass extraction/real-helper/quit/restart; full CI repetition and draft archive
preservation passed in run 40046018836. Both ZIPs and checksums are in the draft release. Resource figures and exact SHA-256s are
in release/IMPLEMENTATION.md and verification/mallow-release.json. No physical QA is claimed.

No authenticated itch.io session is available. Store copy, support/privacy/install/recovery
and licensing documents are prepared. Seller verification/payout/tax setup must be completed
by the owner directly. Do not publish or describe rc.1 as ready for sale before native gates pass.

## Latest owner request: UX sanity and keyless conversation — 2026-10-20

The owner resumed work for broad UX cleanup, a sanity guide, and sustained dynamic conversations
without AI keys. This pass continues the existing draft PR #3, on `codex/roadmap-continuation`.
It does not complete the older 3D prototype or start new Chrome/Finder integration.

Start with [UX-SANITY-GUIDE.md](UX-SANITY-GUIDE.md): user controls, keyless setup, exact retention,
interaction/motion contracts, repeatable acceptance, known limits and next cleanup priorities.
General → Experience guide provides the short version in the app. Preserve the original character
proportions/presets and the passive-carry/explicit-Use ownership contract.

Implemented: per-figure saved local dialogue with facts/topics/follow-ups/personality/branching
stories; full desktop/Settings transcripts; multiline 4,000-character input; Enter/Shift+Enter/IME;
per-figure session drafts; history-scroll preservation; export and confirmed scoped reset. All or
inactive selections cannot broadcast private chat. Separate messages stay separate; Stop/new chat
invalidate late provider actions. Mentions and negated clauses cannot trigger physical requests.
The listening controller now allows explicit walking and active approach/return transitions.
Pong has an explicit stable court toggle. Settings honors reduced-motion for interface transitions.

Ollama is an optional fixed-loopback provider with no key or credential-store access. It supports
installed-model discovery and the existing optional Chat/Full modes. It requires the user's own
Ollama/model installation; no background downloads or new dependencies. Built-in authored dialogue
is ready immediately. Missing local service/model errors explain setup and fall back to local
responses. Optional model replies support up to 2,000 characters and bounded recent context restores
from the transcript. Retention: 240 log entries/120,000 text characters; model context 32 turns/
16,000 characters. Name notes remain in Mind when a chat is reset; the reset explains this distinction.

Verification: typecheck/build, all 217 focused regressions (including 15 new conversation checks),
full seed-1 simulation, full Chromium interaction/preset/rendered activity suite and final dedicated
chat UI checks (export download, long input, keyboard/IME, drafts/scope, bounds, scroll, reload and
story continuity). Linux Electron/Xvfb passed the real preload/IPC and Settings conversation/reset/
persistence/provider controls, plus existing file/activity/focusability checks. Native window/file
reports remain explicitly fake. Provider adapter verification uses fake HTTP, never a downloaded
model. Captures: verification/ux-local-conversation.png and ux-settings-conversation.png.
Use `npm run conversationcheck`, `npm run conversationui`, `npm run localbraincheck` to repeat the
new checks. The existing Electron smoke script now contains actual bridge conversation acceptance.

The book-depth failure was a fixture anchored to an outside cover edge. It now checks attachment
of both real grips, solid contact, projected face depths and interior spine depth for both facings.
No model rendering code was changed for that correction. Full browser cursor-gun readiness passed;
the earlier timeout is not reproduced or claimed fixed. The unfinished prototype's isolated
performance, full lifecycle/RAM, model-lab/extended visual acceptance and Windows packaging remain
pending. Do not reclassify it as completed based on these chat/UX checks.

Next: owner review of the conversations and UX guide; real Mac/Windows and actual local inference
acceptance. Crowded bubble layout, richer action-specific anticipation/recovery and crowded mixed
scales remain cleanup candidates. Existing Windows binaries are older; no package rebuilt here.

## Paused WIP: modeled props and hinged book — 2026-10-12

The owner chose a reusable 3D prop system with a hinged book prototype, then requested a pause.
The source is checkpointed but **not accepted as a finished update**. Typed XYZ surfaces/grips,
reader-facing solid books, model-based hulls/picking and a separate development lab are implemented.
Final typecheck/build/lab build pass; a depth regression and cursor-gun browser timeout remain
unresolved. Final visual acceptance, isolated performance, soak, RAM and packaging are pending.
[PROP-MODEL-CHECKPOINT.md](PROP-MODEL-CHECKPOINT.md) records exact failures, partial verification,
limits and ordered resume steps. Leave development paused until the owner resumes it.

The following completed repair/evidence refers to `b727a02`, not the unfinished prototype now at
the branch head. Existing Windows portable output also remains that prior build.

## Latest repair: varied life and readable books — 2026-10-12

The owner reported reading-dominated routines, awkward adjacent readers and standing/seated clipping.
They supplied AvA/AvM reference videos through the v1.0.0 release; sampled full-timeline sheets and
closer frame sequences informed this repair. Exact comparison, behavior changes, preview captures,
measurements and limits: [AVA-POLISH-COMPARISON.md](AVA-POLISH-COMPARISON.md).

- Shorter self-chosen read/TV/game/seat sessions (including joining TV), bounded repeat cooldowns,
  energetic movement/tool choices after long stationary periods and work/play boredom relief.
  Explicit requests retain long pacing; tasks complete at natural page/game breaks. Quietly seated
  idle figures can move on; sleeping figures stay asleep. Autonomous reading uses owned unfinished
  books rather than creating supplies.
- Raised/tipped compact book grips, both hands following the open width/page reach, actual page gaze,
  no prone couch reading or unrelated child-seat chatter. Counts update after the completed turn and
  before closing, with a steady grip until shut. Same originals return to bag/shelf, and interruptions
  release claims. Eleven focused regressions include five readers facing one way with head clearance.
- Finite books (default 96 pages), per-original saved progress/completed-reading count, bounded legacy
  migration, custom `pages` metadata, custom shelf restoration and actual gift preservation. Existing
  owned cards show page/total/percent or Finished; Read this book/Read again chooses the exact original.
  Named Settings shows current book/page; All does not display one person's progress.
- An idle standing spectator walks outside merged occupied-seat intervals, using peer snapshots and
  actual vertical overlap. Seated readers remain seated; shared contact, approach and combat keep
  their choreography. Peer snapshots are reused within the contact check.
- New requests stop old walking destinations. Replaying the failing seed-1 couch/TV assertion found
  a stale goal taking the figure away from the selected couch until timeout; the assertion was kept,
  the behavior fixed and a direct opposite-goal regression added. TV game speech has cooldowns while
  game/button motion continues. Sanity checks also validate finite book state.

Verified typecheck/build, all 193 regressions (182 existing + 11 focused), full seed-1 simulation,
actual Chromium book controls and all existing pointer/keyboard cases, both facings/every preset,
and final rendered opening/page/closing/departure frames. Linux Electron/Xvfb passed overlay/preload,
inventory/keyboard/focusability, visiting bag/chat/status/restart and five-visitor All/pointer-return
checks with explicitly fake native reports. Windows x64 portable package rebuilt and inspected.
Functional feature soak:
2,566.4 simulated seconds, 2,635 audits, 35 phases, zero issues; final compact grip refinement has
additional focused head/reach checks and rendered browser/preset acceptance. Separate 15-minute
unattended profiles use seeds 32 and 7, with 900 audits each; reports under verification/polish-*.
Independent peaceful browser fixtures clear prior combat shots, stop/stow previous activities and
wait for actual grounded recovery, clearing its incidental plan/gesture before gift/catch selection;
no acceptance assertion is weakened. Current reports are separate from historical Update 2 evidence.

The 900-second seed-32 furnished offline observation changed reading/TV/games from 79.0% of all
figure-time to 22.2%; seed 7 measured 30.1%. Each run had 900 clean audits. None of the old or new
profiles showed stranded seated idle; do not describe the baseline as a universal deadlock.

Fresh Linux Electron/Xvfb furnished five-figure RAM: 348 MiB PSS, 422 with Settings, 384 after closing;
software rendering, nine furniture/twenty items, disposable offline saves. This is not a Mac estimate
or leak proof. Windows portable output must match final bundles and exclude source maps/saves/keys.
Core five-figure/ten-loose-item profile: mean/p95 2.483/6.040 ms per combined 120 Hz update with
another browser check active. Final Chromium frame median/p95: 16.7/16.7 ms. Concurrent heavy tests
increased tail timings; native rendering remains unmeasured here.

Remaining: action-specific nonverbal anticipation/recovery and coherent shared outcomes still trail
the directed reference films. Complex crowded approaches/mixed scales, authored book content, more
handheld games and existing physics/display limits remain. Mac Swift/focus/Spaces/native file return
and Windows native helpers/input/DPI still need hardware. Reference movies/stills are not committed.
Continue on `codex/roadmap-continuation`, open draft PR #3; stop after this repair and owner judgement.

## Latest repair: file/folder visits — 2026-10-11

The owner reported file features as broken/unclear. This is a repair of the existing prototype;
no further Chrome/Finder milestone has started. Continue on `codex/roadmap-continuation`, PR #3.

- Visits move actual item objects between parked/visiting owners, preserving UID, customized stock
  art, ink, book/game progress, magazines and reloads. Desktop bookshelf/seat/player claims release,
  and furniture subscriptions reconnect on return. Visiting bodies get the same bag/chat/save callbacks
  and live custom-definition updates. Live sanity includes visiting inventory, even when hidden.
- Still-open document identities survive focusing another app. Native window reports supply current
  bounds and clear closed/replaced document identities; loss of Mac Accessibility clears cached docs
  and explains the permission. Window relocation shifts walking anchors and item physics together,
  without double movement or resetting loose-item velocity. Initial same-folder visitors spread out.
- File and folder visits have their own General card with named path/kind, Window detected/Waiting,
  separate helper/permission messages and action feedback. All requires a named chooser and offers
  Return all visitors. Hidden visitors have an explicit Return and open bag action. Unsupported
  platforms and undetected documents refuse entry; Windows documents are disabled, Explorer folders
  remain. Choosing an inactive/departed figure is refused. Turning visits off/removing a visitor
  returns them and clears saved associations immediately; restarts restore only the selected roster.
- Six new regressions cover original ownership, custom art, clocks/claims/subscriptions, frame
  movement, inactive/transport refusal, saved window coordinates/progress, document focus and controls.
  The soak adds six repeated five-figure visit/close/move/return cycles. `PET_FAKE_FILES` parallels
  `PET_FAKE_WINDOWS` for explicitly simulated native reports; the UI labels this verification mode.

Verified in cloud/Linux: typecheck/build, all 182 regressions (78 general, 30 roadmap, 18 quality,
20 living, 36 Update 2), full seed-1 simulation, complete actual Chromium interaction check, actual
Electron preload/input/settings/visit-restart checks and focused five-visitor/All/pointer-return UI
check. Seed-32 expanded soak: 2,566.4 simulated seconds, 2,635 audits, 35 phases, zero reported issues;
see verification/file-visits-soak-32.json. The requested duration is a minimum; scheduled feature
phases plus a required unattended tail make this run longer. Inspected named/All panels and five
visitors; captures under verification/file-*.png are labeled cloud/fake reports. The focused check is
reproducible with `npm run build` then, on Linux with an X server,
`DISPLAY=:91 electron --no-sandbox scripts/file-visits-ui-check.cjs`.
Windows portable package rebuilt and inspected; it was not run on Windows hardware.

Remaining: Finder/Explorer matching, Mac Swift/Automation/Accessibility, Spaces, occlusion and
foreground focus/return still need real hardware. Document detection remains limited to Mac apps
reporting their document path; no new native integration or icon-crawl animation was added. Furniture
created inside a visit is session-only, not persistent room storage. Your files are never modified.
No new RAM measurements were made; prior measured resource evidence below remains the available data.

Next concrete step: owner file/folder hardware acceptance using CURRENT-CONTROLS.md. Stop there.

## Latest correction: relaxed standing — 2026-10-10

The owner disliked the new standing poses. All five personality templates now default to `idle: none`;
neutral standing uses the chosen stance rather than permanent hips/behind-back hands and a turn
toward the viewer. Personalized walking, sitting, speech and satchels remain; mood/activity reactions
still express feelings. Keep personality in context instead of turning resting figures into poses.

Verified typecheck/build, all 176 regressions (36 Update 2), full seed-1 simulation and actual Chromium
input plus neutral-standing/reading fixtures for all presets and both facings; inspected before/after
frames under `docs/verification/pq2-standing-*.png`. The seed-1 replay exposed a simulation fixture
sampling only 0.167 seconds into a sit. It now measures a settled seated figure and asserts the same
ledge/state after moving 50 pixels; the scrolling controller was unchanged. Windows x64 package
rebuild and bundle inspection passed. Peaceful browser fixtures reset moods after the separate duel
scene. Native hardware acceptance remains pending. Earlier Electron/RAM/two-hour soak evidence below
belongs to the prior delivery, not new measurements for this correction. Stop before integration work.

## Latest update: Pet Quality 2 complete — 2026-10-09

The owner authorized completion and the personalization expansion. Implementation is complete on
`codex/roadmap-continuation`, continuing open draft PR #3, stacked on `codex/desktop-life`. Stop
before the next Chrome/Finder milestone. Do not resume it without a new owner instruction.

Working checkpoints: `143850c` resources; `2b92188` contact, physical handling, book bookmarks,
one brief safe activity continuation, directed group turns, lamp/blanket/snack/catch; `df5d138`
personalized walking/sitting/speech/satchels, Cobalt/Amber default migration, richer saved friendship
and moods, thoughtful original gifts/three wrappers/flowers, meaningful handhelds/shared runner
sessions and detachable actual TV consoles. The final delivery clarifies the TV cabinet drawer,
records evidence and closes the checklist. Custom names, stock-custom/deleted examples, body presets,
owned originals and gun reload mechanics remain; taking items stays passive until explicit Use.

Exact change/assessment/resource/limit record: [PET-QUALITY-2.md](PET-QUALITY-2.md).
Completed checklist: [PET-QUALITY-2-PLAN.md](PET-QUALITY-2-PLAN.md).
Future preset basis: [CHARACTER-TEMPLATES.md](CHARACTER-TEMPLATES.md).
Current controls and hardware sequence: [CURRENT-CONTROLS.md](CURRENT-CONTROLS.md).

Cloud acceptance: typecheck/build, 175 regression checks (72 general, 30 roadmap, 18 original quality,
20 living and 35 Update 2), full seed-7 sim, actual Chromium/Linux Electron pointer/keyboard/preload/
configuration/upgrades/focusability checks and visual motion inspection. Three two-hour core soaks
and two two-hour expanded soaks passed; final seed-32: 7,200 simulated seconds, 7,215 live audits,
34 phases and zero reported issues. Reports under `docs/verification` label the earlier candidates.
Windows x64 portable package rebuilt: 368.5 MiB, current bundle hashes, 32 definitions, real
PowerShell helper, no source maps/saves/provider keys; it has not run on Windows hardware.

Isolated Linux core mean/p95: two figures 0.237/0.532 ms; five 1.168/2.351 ms per combined 120 Hz
update. Loaded Chromium frame median/p95 16.7/33.4 ms. Linux whole-process RAM medians: one ordinary
figure 293 MiB PSS; five furnished 344–378; Settings open 425; twelve Settings cycles 384, another
minute 391. Seven closed/eight Settings-open processes, zero swap. These are software-rendered Xvfb
measurements, not Mac estimates, a proven reduction or a leak guarantee.

Remaining: actual Mac Swift compilation, focus/foreground desktop return, Spaces, permissions and
click-through; Windows helpers/input/mixed DPI; main-display limitation, rotation/extreme-speed
physics limits and snapshot cross-owner contacts. Dense simultaneous bubbles can crowd. Handheld
sharing compares the one runner game, sticker marks are preset, and brief suspended activities are
session-only. Native window integration was inspected/tested through fake helpers; no new integration
was added and no Mac foreground-return fix can be declared accepted without the owner's machine.

Next concrete step: owner hardware acceptance of this build using CURRENT-CONTROLS.md. Stop there.

## Previous update: Pet Quality / Living Stickmen — 2026-10-08

The owner expanded the Pet Quality scope and authorized completion. The update continues open draft
PR #3 on `codex/roadmap-continuation`, stacked on `codex/desktop-life`. No new Chrome/Finder feature
was started. Stop before the next roadmap milestone. This is the historical first quality update; later owner instructions explicitly authorized Update 2. Every working commit includes CHANGELOG.md and a chat changelog.
The ordered request checklist is [LIVING-STICKMEN-PLAN.md](LIVING-STICKMEN-PLAN.md).

- Foundation (`af56778`): drawing a new tool preserves earlier original projects; reload clocks advance
  once for owned guns in hand/bag/world/passive transport/cursor use. Six-round reload mechanics remain.
  Stock books have reader-facing pages, correct open/closed contours and depth ahead of the satchel;
  custom book artwork stays custom. Returning books release stale reading targets and prefer their
  original usable shelf. Cups, dumbbells, yo-yos, handhelds and the broader item audit remain included.
- Roster/shared controls (`8bc46a8`): 1–5 stickmen count labels, selectable preset characters (including
  Ruby alone), stable identity/config/save slots and one Settings window with named/All figures scope.
  Bag/Supplies/Activities is shared, searchable and reachable from right-click Open bag, tray and
  Settings. Bulk supplies create separately owned originals; full bags explain the limit. Existing
  edited names/colors/personalities and old solo saves migrate. Removed characters retain possessions.
- Physical/social life: brace/lift/small scoot/settle replaces seat slides; five fit the couch and can
  overlap briefly during movement. Ordinary conversation joins available 3–5 figures with timed turns,
  listeners and distinct preset replies. Busy readers/queued work are protected; quiet seated figures
  can join. Duels keep one opponent and incidental figure attacks cannot recruit or hurt spectators.
- Social/creative need, frustration and contentment have activity/rest causes and saved values. Existing
  bonds plus cooperation influence partners/invitations; care influences reassurance; friendly rivalry
  favors familiar game partners. Completed activities record shared history for all participants,
  including Pong and friendly duels; interruption does not automatically damage affection. Optional
  AI context and Mind nodes describe the new needs while all behavior remains usable offline.
- TV/furniture menus expose Move beside the matching furniture and target the exact clicked original.
  Autonomous TV arranging is more likely when the TV is far from a couch. Occupied/held/blocked objects
  release their move claims. Departing figures put away shelved books and reconnect furniture-platform
  notifications when rejoining, avoiding invisible slot reservations and stale collision platforms.
- Physics: rigid contacts resolve once, share separation by mass/support and preserve velocity during
  shape correction. Rigid linear/angular projection prevents deformation energy from launching leaning
  furniture. Five-box stacks settle while impacts/dragging/carrying/throwing remain active.
- Development checks in General run a bounded read-only ownership/coordinate/controller/group/claim/
  bookshelf-slot audit. Hidden duplicate Settings catalogs were removed. Native focus guards from the
  preceding update remain; the earlier desktop-return report still needs reproduction on the Mac.

Final cloud acceptance: typecheck/build; 140 regressions; full seed-7 sim; scheduled seed-21 soak
(2,092.4 simulated seconds, 2,159 audits, 26 phases, zero reported issues); actual Chromium/Linux
Electron controls and visual inspection; current Windows x64 portable package. Core five-figure
mean/p95 1.327/1.805ms; loaded Chromium median/p95 16.7/33.4ms. Persistent phase report:
docs/verification/living-soak-2026-10-08.json.

Acceptance details, commands and representative images: [PET-QUALITY.md](PET-QUALITY.md).
Current owner controls and native hardware sequence: [CURRENT-CONTROLS.md](CURRENT-CONTROLS.md).

Cloud checks cover the platform-free simulation and real Chromium/Electron input with fake windows
and disposable app data. They cannot establish Swift compilation, actual Mac focus hand-back, Spaces,
permissions or click-through. Real Windows input, PowerShell helpers and mixed DPI also need hardware.
Convex contacts approximate concave gaps and have extreme-speed tunneling limits; cross-owner loose
items resolve against peer snapshots. Undo is one session-only object, books retain ownership, and
main-display limits remain. A soak checks exercised paths, not every possible native/user action.

Historical next step: owner hardware acceptance. The owner subsequently authorized Update 2.
Research only: [PET-QUALITY-2-RESEARCH.md](PET-QUALITY-2-RESEARCH.md) ranks attention/motion,
activity continuity, social timing, physical affordances and useful everyday objects, with primary
sources and acceptance criteria. The research preceded the Update 2 implementation described above.

## Previous update: interaction and rendering cleanup

The owner reported clunky/discoverability problems, thin limbs while drawing/sitting, and returning
behavior that may involve native focus. This pass finishes those bugs and interaction coherence;
the owner hit their usage limit and explicitly asked to stop before further roadmap work.

- Figure right-click → Open bag / Activities, plus an offline “open bag” request and a brief hover
  hint. The menu no longer grows a Take row for every item. Clicking an item inspects it; dragging
  remains available. Bag / Supplies / Activities tabs separate existing possessions, new objects
  and actual offline actions. Item state/ammo, descriptions, explicit actions, requirements, in-panel
  instructions and a stable panel position make the controls visible. Scrolling retains navigation.
- Take out/Place, Give to a figure, Store, Drop, Use with cursor, Trash and Cancel are consistent across
  bag, object menus and Settings. Settings' misleading Put away deletion labels are now Trash.
  Undo remains accessible in the bag with both shortcuts hidden. Transport controls sit top-right
  so they don't cover the floor figures; clicking Cancel/Use does not first drop the held object.
- Cancel restores an existing item's previous hand/worn/bag state; unplaced supplies are removed.
  Removing the original owner returns an existing held item through a current figure. User-controlled
  transport/weapons cannot be reclaimed by AskBack. Settings returns also release transport ownership.
- Each depth accessory draws inside save/restore. The satchel's narrow brush width no longer leaks
  into limbs drawn afterward. Furniture menus target the exact clicked seat/TV/desk/bench/shelf.
  Explicit group leaders can start from sitting, and Stop clears a queued activity too.
- Pong controls stay above its intermittent preview, and visibility is applied before measuring.
  The stage's canvas CSS is scoped to the stage, so it cannot override hidden preview canvases.
- Mac refocus only activates the previous app when our own app actually became foreground. This
  prevents unnecessary reactivation; the Swift helper and Spaces behavior remain unverified here.
  The owner's earlier “return to the original thing” report still needs precise hardware confirmation.

Validated: typecheck/build, 72 existing regressions plus 30 roadmap/cleanup checks, and the complete
simulation with seed 1. Actual Chromium pointer/keyboard checks cover right-click Open bag with both
shortcuts hidden, inspect without taking/closing, Give/Place, safe Cancel, stable panels, visible
requirements/instructions, hidden-shortcut Trash/Undo, Settings take/return, full bag refusal, existing
weapon/Othello/book flows, five-seat/workshop rendering and Pong Join/Keyboard/Escape/Rematch.
Linux Electron/Xvfb passes real preload focus/input paths and the existing settings/chat/group checks.
Inspected inventory, activities, small-screen supplies, couch and workshop screenshots. Mac Swift
compilation/Spaces and real Windows behavior were not tested. No next roadmap update is started.

## Latest milestone: Workshop and Household

The owner authorized completing missing Update 2 work plus the next two old updates, then supplied
an expanded five-update plan. [UPDATE-PLAN.md](UPDATE-PLAN.md) is now the current plan; the previous
plan is archived in UPDATE-PLAN-LEGACY.md. Batch scope is unlimited by explicit owner instruction.
This branch completes Workshop and Household, including their new tools/talents/clock/Pong additions.
Work is on `codex/roadmap-continuation`, stacked on `codex/desktop-life` (`a674a44`). GitHub PR #2
is still draft/open; the uploaded plan's assumption that combat was merged was not true on inspection.

Implemented:

- Pixel supplies/trash shortcuts, hidden by default, independently enabled in General and draggable
  with saved placements. Satchel click/menu works with both hidden. Pointer catalog use never toggles
  native focus; Keyboard explicitly enables it, including a held selection that Escape can cancel.
  Duplicate typing IPC is ignored. This was intended to address overlay flicker;
  Mac Spaces behavior still needs real hardware verification.
- Wearable satchels replace belt rendering, with a reach/flap motion and 16 slots. Legacy slot indices
  still load, and worn helmets/boots remain attached. Owned satchel entries move the original item.
  Direct equipped-hand selection uses visible art. Existing weapon cursor controls remain available.
- Sponge clips only local raw strokes; eraser removes ink objects and prompts a reaction; paint bucket
  colors a project before polishing. Supplies expose a useful desk, workbench and tool shelf. Desk paper
  receives a traced katana blueprint and a copy goes in the satchel. Shelf sorting picks/places loose
  tools; world item placements/ammo and furniture position/tilt/facing/art save.
- Definitions advertise use capabilities, movement type and draw/refine permissions. Blueprint drawing
  traces actual tool/furniture art, with matching outline and actions. Workbench color/polish progresses
  on the same object, preserving state and ownership. Interrupted ink projects save/resume. General's
  ink lifetime is tunable; zero disables expiry, and held/stored/supporting objects pause it.
- Group invitations coordinate 2–5 through JSON peer snapshots/messages: wave/chat/couch/watch for
  any group, duet for two, hands-in for three, paired mirroring for four, relay for five. Couch seating
  reserves five distinct spots and recenters them. Forward-facing legs hang in front of furniture;
  backrest collision no longer lifts hips off the cushions. Late-added companions use local clocks
  for synchronized starts. Interruptions release claims, hands, watcher/controller state and movement.
- Carry/drag/push furniture, clear routes, braced grips, light lifting, and cooperative TV carries.
  Occupied furniture waits briefly; grabbing/tipping/blocking cancels. TV/couch, reading and work
  arrangements save. Moving platform reports cannot carry a figure beyond screen bounds between steps.
- Pair trust, shared activity preferences, disagreement memory and landed-move rivalry memory save.
  Small tool gifts use exclusive ownership and bounded JSON/deduplication; compare/check moments work
  offline. Personality specialties improve drawing/refining speed or game skill, favor a game expert
  for invitations and a drawing expert for feedback. Real system idle/time arrives via Electron;
  daily rhythm is optional and doesn't wake an explicit daytime nap.
- Real Pong physics, first-to-five scoring, winners, rematches, spectators and the same live TV state
  in a pixel preview. Join supports mouse or explicit keyboard controls. Handhelds run the existing
  runner on their own screens. Optional console gating starts off for legacy compatibility.
- Every new action ships with an offline command and the optional AI's validated action vocabulary.
  Custom named drawing requests take priority over incidental words in their names. Existing provider
  cadence/cost controls remain; no paid provider calls were used.

Validation: typecheck/build; 72 existing regressions and 25 roadmap regressions; full simulation seed 1;
300-second two- and five-figure soaks seed 1 with no trouble. Chromium checks cover pointer/keyboard
supplies, trash/undo, hidden shortcuts, saved repositioning, small-screen bounds, existing combat/book/
Othello controls, rendered five-seat/workshop scenes, and real Pong mouse/keyboard/join/rematch controls. Linux Electron/Xvfb checks actual preload
focus IPC and mouse transport, explicit keyboard pulling/Escape and existing configuration/chat/game
behavior. Inspected normal/small supplies, couch and workshop screenshots. Windows x64 portable
packaging succeeds; its real PowerShell helpers are present and app-data/provider keys are excluded.

Remaining: no real Mac/Windows run was possible here. Use [CURRENT-CONTROLS.md](CURRENT-CONTROLS.md)
for acceptance. Native permissions/Spaces/click-through, multiple monitors/mixed DPI and clock/idle
behavior need hardware checks. Props use conservative convex collision, not precise concave gaps.
Undo remains one session-only object. Talents use existing personality specialties, not new artwork.

Next: owner acceptance of Steel/Workshop/Household. Out of the Box starts by verifying installed Chrome,
native closing and Finder associations on real hardware; its explicit gate remains in the new plan.
Mind & Ship (provider discovery, onboarding, profiling, backup/restore, reduced motion and replay clips)
remains later authorized roadmap work, not claimed shipped in this milestone.

## Previous milestone: adaptive weapons, quiet activities, sleeping pickup and full hitboxes

The owner asked to plan future work in focused updates instead of rediscovering the whole project.
Read the archived [UPDATE-PLAN-LEGACY.md](UPDATE-PLAN-LEGACY.md): ten updates, each with 8–12 features, dependencies, completion
criteria and a new-ideas inbox. It includes every request about combat, fewer GUI controls, satchel
storage, drawing/moving furniture, TV orientation/previews, real companion games, handhelds/console,
workshop refinement and possible ink lifespans, quiet pacing, sleep-carry, Chrome, real folders,
offline/optional AI and eventual distribution. Workshop/TV/game suggestions are roadmap additions,
not permission to replace the current combat batch.

Implemented in this milestone:

- Adaptive Duel equipment: contextual weapon preference, a short commitment to a choice, clearing
  both hands through one `Items.wield` operation, backward retreat on disarm, fetching a nearby safe
  loose weapon, and drawing a functional replacement when recovery is unavailable. Drawing can be
  interrupted by a nearby opponent. Recovery reaches down before foot contact so the figure does
  not repeatedly kick away the weapon it is trying to retrieve. A companion's loose weapon is
  transferred through plain peer request/grant messages with exclusive ownership and ammunition intact.
- Actual taken weapons use the cursor controller: held fast sword/mace swipes, pistol manual aim,
  its own magazine and R reload, bow charge/release and arcing swept arrows. Return/drop controls
  preserve the original item. Legacy cursor practice tools remain available.
- Directional backsteps maintain facing; speed-matched run stance/swing and carrying poses improve
  armed locomotion. Existing combat moves, hidden health/pressure, looks and movement presets remain.
- Mind → Hyperactivity (0–1, default 0.25) changes activity choice and commitment together with mood.
  TV viewing, video gaming, reading and furniture sitting last minutes; calm movie sessions can last
  around half an hour. A book has a seated reading/page-turn pose. Ordinary chat and ambient AI plans
  preserve settled activities; explicit activity requests can replace them. No real provider calls were used.
- Gentle pickup/carry/release preserves sleeping and a limp held body. Actual hard contacts at the
  floor, platforms, walls or ceiling wake them; hits wake them and stop the sleep skill. The hard-contact
  threshold is 600 px/s. Soft placement and floor/wall/ball/weapon waking have dedicated regressions.
- Item selection uses visible strokes/fills/sprites, including handles and wide heads. Loose item
  floor/wall/furniture contact covers all art rather than only the grip and tip. Custom definition reload
  refreshes cached contours. Prop contours include artwork, wheel radii and sprite bounds; whole rigid
  bodies separate from each other without adding artificial velocity. Drawn balls bounce from furniture
  sides. Rigid prop releases retain measured hand momentum. Scooter boarding now explicitly hops
  onto its raised deck instead of waiting below it after the wheel collision fix.

Validation: typecheck/build; 66 focused checks; full simulation seed 1; two-figure and five-figure
300-second soaks seed 1 with no trouble reported; actual Chromium mouse checks for owned pistol aim,
ammo/reload/return and bow charge/release, plus book rendering and existing Othello/chat/gear controls.
Linux Electron/Xvfb passed preload IPC, group add/remove, the local Chrome bridge/cutout controls,
and the actual Mind slider applying to its own figure independently through IPC. Inspected browser
book/bow screenshots, the settings page, and several armed locomotion phases in Electron.
AI cadence/fallback simulation fixtures omit the new book capability so those tests still exercise
their original timing assertions; separate checks verify long reading and interruption behavior.

These are cloud/Linux checks, not a Mac/Windows hardware acceptance pass. Full art collision uses
conservative convex contours, not precise concave shapes between chair legs. Flexible bridges retain
their plank constraints. Review run/backstep feel and resting/stacked props on the owner's Mac.

Next: Mac acceptance using [CURRENT-CONTROLS.md](CURRENT-CONTROLS.md), then Update 2's physical
grab bag, reversible trash, sponge, inventory/storage and useful desk activity. Those tools, bag
replacement, workshop, furniture-moving skills, handhelds and new companion games are planned.
The real-file prototype still needs Mac testing and a crawl/entry animation; no mock folder rooms
were reintroduced. Native integration boundaries and checks in the following section still apply.

## Latest work: combat, cursor weapons, a larger group, and native integration

The owner uses Chrome on Mac. They asked for cleaner physics/code, guns and cursor weapons, broader
combat animation with purposeful hidden guard pressure, more pen-created tools, richer offline/AI life,
and up to five interacting figures. Exporting separate pet apps is explicitly postponed.
Break pressure stays hidden; General has a developer toggle. Existing appearance and movement presets remain.

- Combat: wider winding/follow-through poses, full arm extension, a telegraphed feint, and state-based
  attack sequences (recover, approach, probe, break a guard, punish). Match approach distances to physical
  blade reach rather than the animation's nominal reach. Pressure takes time to recover and a broken
  guard leaves a punish window. Separate swept-projectile and cursor-weapon modules.
- Pistol: foam rounds in play mode, aimed bursts and recoil, an item-owned six-round magazine, reloads,
  and swept hits against figures/window tops. Cursor sword/mace/pistol in General; hold to swing/fire.
  Arming catches desktop clicks, with a visible Put away control. It does not require a paid service.
- Pen: drawtool/drawgun draw a functional ink item, including its original use. Replacements do not
  accumulate. Duel picks an existing ink version before handing out a replacement built-in.
- Group: 2–5 via General. Every figure has stable identity, config/memory, its own relationship map,
  a selected partner, and a distinct default personality. All peer exchanges remain snapshots/messages.
  Shared prop subscriptions can be removed when a figure leaves, avoiding callback accumulation.
- Offline: ordered requests, named partners, simple memory/mood conversation and varied replies.
  AI sees the group and available actions, can target a companion with `with`, and falls back locally
  when a request fails. Autonomous failed requests back off; explicit chat can retry immediately.
- Chrome: unpacked extension in dist/extension/chrome. Per-page activeTab permission, explicit element
  picker, local authenticated loopback bridge, screenshot fragments rather than executable page HTML,
  reversible visibility changes, restoration, and actual tab closing. Native window closing presses
  the normal close button / posts WM_CLOSE; success means requested, since an app may show a save prompt.
- **File request correction:** the owner rejected HTML rooms opened in Chrome. That approach was removed
  before integration. FileHabitats now associates a figure with an **existing** file/folder path and
  follows its actual Finder/Explorer/document window. It hides when the window closes and clips behind
  other windows. No placeholder files are written. This is still rendering through our overlay, not
  arbitrary animated content injected into Finder. Do not describe it as native Finder content.
  Finder enumeration is a fixed read-only JXA script, Explorer uses Shell.Application. Accessibility's
  document URL supports Mac document apps that expose it; universal file-app detection is not established.

Verified: typecheck/build; 50 focused checks; full simulation seed 1; two-figure and five-figure
300-second soaks seed 1 (both report no trouble seen); expanded Chromium overlay smoke; Chrome picker,
real screenshot crop, extraction and restoration against actual DOM/canvas with simulated extension APIs.
Electron was downloaded using the inherited proxy and a workspace cache; Xvfb was extracted under /tmp.
Real Electron on Linux/Xvfb passed preload IPC, config broadcasts, five-figure add/remove, stable IDs,
hidden pressure by default, cursor equipment, disabled-window-close gate, actual local bridge delivery,
cutout image rendering, and the fifth figure's settings window. All test app data was isolated under /tmp.
No provider keys or real model calls were used. Separate the Linux shell smoke from native Mac/Windows checks.

Remaining: installed Chrome activeTab/capture permissions, real tab close, native normal-window close,
Finder Automation/Accessibility, actual document URLs, window placement/clipping/Spaces, and Windows helper
execution need hardware checks. Entry is currently a state transfer; **crawl-through-icon animation is not
implemented**. The native-file prototype does not complete every part of that request. Check the owner's
acceptance of drawing through an overlay before treating it as satisfied. Universal arbitrary document
embedding has not been established. Studio/export remains postponed.

Next concrete step: the owner runs General → Enter a folder… on Mac and opens the exact folder in Finder.
Verify native path/frame reports, hiding on close/tab changes, z-order clipping, moving the window, returning
with the same memories, and no Space switching. Then implement entry/crawl using real detected icon geometry;
do not substitute browser rooms. Setup and verification boundaries: [DESKTOP-INTERACTIONS.md](DESKTOP-INTERACTIONS.md).
Primary references: Apple Finder Sync supports badges/menus/toolbars, not an arbitrary animation pane;
kAXDocumentAttribute is the represented document's URL.

## Latest: two figures that live together, rigid furniture, bows, a soak test, and the desktop-switch bug

Owner's asks: they walk into each other and stall; they hardly interact; things pop in and out of each other
(the second one flickers in and out of the couch), props break when shaken (the old "TV glitch") and can only be
picked up by a corner; give them ranged weapons; run a long simulation and fix what turns up; more together
(patty cake, handshakes, bumping shoulders when mad, sleeping in a pile like cubs); clicking a figure switched
macOS to the desktop the app was started on.

- **Soak test** (`npm run soak`, `SOAK_SECONDS`, `SOAK_SEED`, `SOAK_PROBE=<time>` dumps state): both figures,
  couch + TV + chair, two windows, a wandering cursor, furniture grabbed and shaken hard every 20 s. Reports NaN,
  off screen, stuck modes, same skill for minutes, walking but stuck, standing inside each other, sitting off the
  seat, furniture stretched/in the floor/off screen, and prints how often they did each thing and their bond.
  Bugs it found and fixed: furniture losing its shape when shaken; figures stopping 4-5 px short of where they
  walk (balance compliance vs a crawl-speed approach; now a 24 px/s minimum and a 5*scale arrival, `arrive()`
  never tighter than 6*scale); hopping down off furniture to reach a spot past its edge (`arrive` uses offEdge);
  both figures sitting on the same couch point; one figure switching the TV off on the other; hips landing on a
  couch's armrest/back while sitting down; a ramp drawn over the couch lifting the sitter (`rampPlan` keeps clear
  of furniture); the Mind queue dropping a follow-up queued while a skill starts; `Mind.end` re-entrance (an
  endless cancel loop between the two); Reattach looping forever when the limb fell far below him (now hops down,
  and gives up into a redraw after a few misses); a gesture started while hopping on one leg never finishing (hop/crawl
poses don't play gestures: now refused and cleared) and a leftover crouch freezing a crawl; walking to a spot off the
edge of furniture he's standing on (now steps off, in `walkTo`); a duel accepted while sitting on a window ledge
(sat in "fight mode" forever: now declined from up high, stands up otherwise, and ends if the other one left).
16 seeds x 5 min end with "no trouble seen". Typical 5 minutes: 2-4 things together, 1-3 call-outs, couch
small talk, 2-4 fights.
- **Furniture** (`props.ts`): every thing except a bridge is rigid by shape matching (`Thing.fit/matchShape`: after
  each pass its points are snapped back to its rest shape, moved and turned to fit), so the drawing and the hitbox
  can't disagree; after the passes it's lifted out of the floor/sides/tops it pokes into; speed limited to 3000 px/s.
  Grab anywhere (`held.local`, `pullHeld`: a rigid-body point constraint, so pulling off-center turns it and it
  hangs from where you hold it). Props are drawn by the app before both figures (`Pet.drawProps`), fixing the
  couch flicker (figures are depth-sorted, and props used to be drawn inside the first figure's draw).
- **Seats and TV are shared** (`Thing.sitters`, `claimSeat/leaveSeat/seatFor`, `seatRoom`): a couch holds two side
  by side (the first scoots over; someone lying along it sits up to make room), a chair one. `Thing.watchers`: the
  TV stays on while anyone watches. Floor spots in front of the TV spread out. `Ctx.who` identifies a figure.
- **Passing** (`Pet.bumpOthers`, `Character.stepAside/goalDir/nudge`): walking toward the other one, he steps
  toward/away from you in depth and walks past; standing on top of each other they shuffle apart.
- **Together** (`skills/together.ts`, messages `invite`/`reply`/`go`/`cancel`/`bump` in peer.ts, `FighterView.social/
  asleep/mood`): high five, fist bump, handshake, patty cake, hug. `AskTogether` asks; the other decides
  (`Mind.answerInvite`: mood, bond, busy); both run `Together` (meet in the middle, face each other, the asker
  says `go` when both show `ready`, beats counted from then; hands go where the other's actually are;
  `Character.handsAt` places both hands). `ShoulderBump` (annoyed, low bond): walks through him; the bumped one
  takes it personally and may start a fight. `NapTogether`: sleepy and he's asleep: curls up beside him.
  `jointv`: join him watching, or as player two (split screen: `Thing.arcade2/players`, PlayVideoGame).
  `chat` (walk over, a line of small talk each: `TALK`, the topic sent with `go`), `WaveAt` (across levels: up on a
  window, or he's sitting: a wave and a "hey!"; the `talk` message makes the other answer and wave back, see
  `Pet.pendingTalk`), `sitwith` (sit next to him on the couch), and small talk while sharing a seat (`seatedTalk`).
  The soak showed why they rarely interacted: most of the time they're on different levels (`SOAK_SOCIAL=1`).
  **Bond** (`ctx.feel.bond`, -1..1, saved as `bond`): up with things done together and shared games, down
  with refusals and bumps; it shapes what they choose (and real-fight anger). Options in `Mind.socialOptions`.
- **Bow** (`items/bow.json`, use `shoot`; `skills/archery.ts` `ShootBow`, `aimAngle`; arrows in `Pet.stepArrows/
  arrowHits/drawBowAndArrows`): turns side-on, aims with a real arc (950 px/s, gravity 900), draws the string to
  his cheek (`Item.pull`), looses. Arrows stick in floors/window tops/furniture and in whoever they hit (a red
  suction cup in play fights, steel in real ones); a sword held up to block, parrying or swinging knocks them
  aside; at your cursor they knock it flying. In duels (`Duel.shooting`): at range he may sheathe, shoot once or
  twice, and draw again; the other reads `move: 'shoot'` (hitIn) and blocks, dodges or dashes in. Hits with
  `ranged: true` skip the random guard block and don't recoil the shooter. New: `Character.actionMove`.
- **Desktop switching (macOS)**: clicking activated the app and macOS jumped to the desktop holding its other
  window. The overlay is now `focusable: false` on macOS too (and `setVisibleOnAllWorkspaces(..., skipTransformProcessType)`),
  made focusable only while the talk box is open. NOT verified: needs the owner's Mac. If it still switches, the next
  step is moving the settings windows to the active Space, or a tiny native call.

Checked: typecheck, 42 focused checks (new: rigid furniture shaken + held from the middle, passing, two on the
couch + TV, high five, shoulder bump, nap together, split-screen games, arrows hit / blocked), sim seeds 1-3,
soak 16 seeds x 5 min, fight lab (play fights 30-57 s with bows used 1-2 times), Chromium and Electron checks.
Pictures: docs/images/together.png, docs/images/bow.png.

## Earlier: sword fights rebuilt (stances, real moves, health instead of knockdowns), and the line between figures

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
