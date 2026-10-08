# Pet Quality / Living Stickmen — 2026-10-08

This update takes priority over Out of the Box. It preserves the procedural figures, colors,
personalities, appearance/movement presets and offline operation. No new Chrome/Finder feature
is included. Stop after this update; the next roadmap milestone needs a new instruction.

## Living Stickmen extension

The expanded request is finished, including selectable preset rosters, unified Settings/Bag scope,
physical couch scoots, real group conversations, safe combat spectators and richer offline needs.
Delivered behavior is in [HANDOFF.md](HANDOFF.md); controls and native acceptance are in
[CURRENT-CONTROLS.md](CURRENT-CONTROLS.md).

Sanity review repaired five confirmed foundation bugs: earlier drawn projects being deleted,
idle/full-bag/passive reload stalls, stale returning-book hand targets, mismatched closed-book
contours and stock animation overriding custom artwork. Reader-facing pages/depth, stable stacks
and leaning, roster bookshelf-slot release and reconnecting furniture platforms have regressions.
Props remain draggable, throwable, movable and responsive to hits. Completed group/Pong/friendly-duel
history now feeds cooperation, care and friendly rivalry.

### Final cloud acceptance

| Check | Result and practical limit |
| --- | --- |
| Typecheck / build | Passed |
| Existing / roadmap / quality / Living Stickmen regressions | 72 + 30 + 18 + 20 = **140 passed** |
| Full simulation | Seed 7 passed, including its ten-minute windows/cursor phase |
| Scheduled feature/lifecycle soak | **2,092.4 simulated seconds (34m 52.4s), 2,159 live audits, 26 phases, zero reported issues**, seed 21 |
| Soak coverage | All 19 stock item and nine furniture take/place/drag/pass/cancel/trash/undo lifecycles; everyday activities, reading, TV/Othello, crafting, refining, sorting, all count-specific groups, Pong, arranging/carrying/corners, gifts/reassurance, duel spectators, cursor gun/reload/restart, roster rejoin, sleeping pickup, stacking/impact/leaning and unattended life |
| Soak activity contract | Confirms the requested skill starts, observes the phase, then verifies cleanup after completion or explicit interruption. Does not prove every possible combination or native integration. |
| Random life soaks | Earlier ten-minute seed-7 runs with two and five figures passed; scheduled acceptance also exercises groups of 2, 3, 4 and 5 |
| Actual Chromium | Pointer/keyboard bag, explicit Use/Carry/Reload/Drop/Cancel, cleaning, ownership, roster, bulk supplies, games and five-figure rendering/motion checks passed |
| Actual Linux Electron/Xvfb | Real preload/IPC, one Settings window, named/All targets, saved memory/config, fake windows, upgrades, pointer/keyboard/chat/game focus and live sanity UI passed |
| Core performance | Five figures + ten loose items + couch/bookshelf: mean **1.327ms**, p95 **1.805ms** per combined 120Hz update; two figures mean 0.511ms / p95 0.668ms. Shared cloud CPU; excludes rendering/native costs. |
| Rendered performance | Five-figure Chromium median **16.7ms**, p95 **33.4ms**, 120 intervals while other acceptance jobs shared CPU; earlier isolated runs gave p95 16.8ms. Not Mac performance. |
| Windows portable build | x64 packaged; renderer/settings/main/preload hashes match, two real PowerShell helpers + 28 definitions included; no local saves, keys or source |

The persistent [soak report](verification/living-soak-2026-10-08.json) records seed and each phase.
`npm run livingsoak` regenerates `.build/living-soak-report.json`; `LIVING_SOAK_SEED` selects a replay.
`npm run sanitycheck` runs the focused regressions. General → Development checks runs a bounded
read-only audit instead of changing/freezing the world. Logs/screenshots regenerate under `.build/`.

Visual inspection covered reader-facing books/strap ordering, five actual couch activities,
brace/lift/shift scoot frames, group listening, spectators, shared bag/settings and workshop handling.
Frames show the procedural style; motion feel still merits the owner's live Mac session.

![Five distinct couch seats](images/living-five-couch.png)

![Lift during a physical scoot](images/living-scoot-lift.png)

![Speaker and group listeners](images/living-group-listening.png)

### Remaining issues and limits

- Native Mac Swift compilation, permissions, focus hand-back/desktop return, Spaces and click-through
  need the owner's Mac. Guards and Linux checks do not establish that the original report is fully
  resolved. Real Windows input/helper/mixed-DPI checks also need hardware.
- Convex contacts approximate concave gaps; extreme-speed throws may tunnel. Cross-owner loose items
  use peer snapshots rather than one simultaneous solver. Arbitrary collision combinations remain
  outside the guarantee of these tests.
- Books keep their owner, Undo restores one object for this session, and main-display limits remain.
  More expressive timing/contact materials are Pet Quality 2 research candidates. No next integration
  milestone was started.

## Initial Pet Quality changes (2026-10-06)

- Sitting and standing blend through the existing joint/muscle controller. Resting legs move less
  often. The couch retains its pixel artwork but has wider cushions and five spaced seats.
- Cups, dumbbells and yo-yos add reusable everyday activities: quiet sips, slow curls with breaks,
  and a toy that drops on a string and is caught before storage. Each activity handles its original
  item, finishes at a natural point and clears hand targets when interrupted.
- Personality affects activity choices and reactions: gentle figures favor a drink/reading,
  competitive figures training, mischievous figures pocket tricks, and inventive figures reading.
  Ambient invitations and challenges respect settled activities and queued explicit requests.
  Trusted partners are preferred after relevant talents; chatter and invitations have longer pauses.
- Reading fetches a real owned book, opens it, turns pages with a second hand, closes it at a page
  break, and walks back to a bookshelf. Arrival includes a reach before placing the book upright.
  Interruptions stow the local original; a cursor-held book is never replaced behind your back.
- A low bookshelf holds five actual books in distinct slots. Give books through Supplies and choose
  **Store on bookshelf** in the bag. Reading returns to a usable bookshelf automatically. Shelf homes
  and placements save; tipping, grabbing or removing the bookcase releases its contents. Shelved books
  are not treated as abandoned floor tools. Owners retain their books; borrowing is not implemented.
- **Take out** is passive transport. **Use with cursor** explicitly starts weapon/cleaner use.
  **Carry** returns an owned weapon to passive transport; **Drop** releases the original.
  Cleaners have **Stop using**, ignore control-panel traversal, and do not act while being handed
  back/dropped. Cancel restores prior storage, including a book's shelf slot. Bag/Supplies/Activities
  remain separate; optional movable desktop shortcuts remain off by default.
- Six-round gun magazines and reloading remain. Reload progress belongs to the gun, rather than
  a short-lived burst skill: interrupted bursts, storage, saves, cursor use and peer transfers preserve
  progress. The cursor bar offers a mouse **Reload** button and readable reload status, plus R.
- Supported props dissipate residual contact motion, with tangential contact friction and wall
  corrections that do not generate velocity. Loose item artwork also separates, including across
  owners using peer snapshots. Dragging, pushing, carrying, bouncing and throwing remain active.
- Group gatherings descend from elevated windows before meeting on the floor, and wait through
  landing recovery. This fixes a real stall found by the two-figure seed-7 soak.
- The Mac helper now receives explicit keyboard ownership. It clears pending refocus requests while
  chat, a game or bag keyboard navigation owns focus, and the shell suppresses new requests until
  that ownership ends. Linux verifies the IPC/focus behavior; native Mac acceptance is still needed.
- Stock book/couch examples upgrade on existing installs; edited and deleted examples are preserved.

## Existing-item audit

All items use the same take/store/pass/drop/cancel/trash paths; Trash has one session-only Undo.
This table describes useful behavior and any special activation, rather than adding hidden commands.

| Item | Useful behavior and controls |
| --- | --- |
| Pen | Figure drawing, blueprints and working ink objects; action menu/Activities. |
| Wooden sword, foam sword, katana | Existing practice/real fights, recovery and cursor swings; explicit Use. |
| Mace | Existing heavy swings/bonks; explicit cursor Use; passive Carry/Drop. |
| Pistol | Aimed bursts, six-round magazine, resumable reload; mouse Reload or R during cursor use. |
| Bow | Aim/charge/release with the original bow; existing play/real arrows and ownership retained. |
| Bouncy ball | Throw, bounce and catch; intentional low contact friction/bounce retained. |
| Helmet, boots | Wear/remove/store through the same bag controls; existing equipment poses retained. |
| Sponge | Explicit Use wipes local raw strokes; Stop using returns to passive carrying. |
| Ink eraser | Explicit Use removes an ink object with its maker's reaction. |
| Paint bucket | Explicit Use colors an ink project; a figure can then polish it. |
| Book | Fetch/open/read/page-turn/close/return; a saved shelf slot holds a real owned book. |
| Handheld | Two-hand horizontal grip, its real runner screen, natural game-over finish and cleanup. |
| Game console | Place near a TV to connect optional Pong gating; placement saves. |
| Cup | Reusable quiet drink; Give from Supplies, then Have a drink. |
| Dumbbell | Slow training sets with rests; Give, then Train with a dumbbell. |
| Yo-yo | Animated string/drop/catch; Give, then Play with a yo-yo. |

New everyday actions have offline phrases and validated AI action vocabulary. Missing tools are
explained in Activities. Reading retains the existing first-book fallback when an owner has none;
an existing owned book is always reused, including when it is shelved or temporarily with you.

## Physics reference and limits

[People Playground's developer changelog](https://github.com/studio-minus/people-playground-changelog/blob/master/CHANGELOG.md)
was consulted as the requested reference for contact/stacking expectations. This patch uses the
existing fixed-step Verlet solver: friction at contacts, repeated separation, and damping restricted
to supported bodies. It does not copy that game's engine or pin all resting objects in place.

The collision model still uses convex hulls: furniture cavities are not precise concave surfaces,
and extreme-speed throws can tunnel. Cross-owner loose contacts use snapshots and resolve locally,
so they are not a full simultaneous rigid-body impulse solver. These limits remain explicit.

## Verification

Cloud Linux verification:

- `npm run typecheck`, build, 72 existing regressions, 30 roadmap checks, 18 Pet Quality checks.
- Complete simulations with `SIM_SEED=1` and `7`; both pass. The window-life fixture explicitly
  exercises commanded climb/descent before its autonomous soak, so deliberate multi-minute reading
  does not turn an incidental random choice into a failed movement-capability assertion.
- Ten-minute soaks: five figures, seed 1; two figures, seed 7. Both end with no trouble. The original
  seed-7 elevated-group stall was reproduced, repaired and covered by a focused gathering test.
- Checks cover interrupted reloads, peer transfer/recovery, passive pickup, item saves/identity,
  everyday completion, open/page/close/return, five distinct shelf slots, shelf interruption/Cancel,
  ambient invitations, queued requests, trusted partners, couch clearance and stable/throwable stacks.
  Existing regressions also cover gentle sleeping pickup, hard-impact waking and interrupted projects.
- Actual Chromium pointer/keyboard interaction: right-click Open bag, ownership/supplies distinction,
  safe transport, explicit weapon use, mouse Reload, Carry/Drop/Cancel, cleaner Use/Stop, book shelving,
  Othello/Pong, small panels and five-figure rendered scenes. Median rendered interval 16.7ms,
  p95 16.8ms over 120 intervals in the five-figure scene (about 60 fps here).
- Linux Electron under Xvfb: real preload IPC/input, pointer-only bag transport/trash/undo, explicit
  keyboard/Escape, concurrent chat/game focus, settings and two independent companions. An existing
  install fixture verifies stock artwork upgrades, custom sponge preservation and deleted examples.
- `npm run qualityprofile`: two figures + four loose items average 0.157ms / p95 0.338ms; five figures
  + ten loose items average 0.822ms / p95 1.313ms per combined 120Hz core update (8.33ms budget).
  This excludes native/rendering costs and is not a Mac performance measurement.
- Windows x64 portable packaging succeeds; real PowerShell helpers, 19 item definitions and nine
  furniture definitions are included. Local app data, tests/source and provider credentials are excluded.

Visual inspection included five seated figures, workshop drawing/refining, the everyday items,
book opening/page/closing poses and the upright returned book. Browser checks regenerate the sequences
under `.build/quality-*.png`; representative captures are committed below.

![Everyday items and reading](images/pet-quality-everyday.png)

![Returned actual book](images/pet-quality-bookshelf.png)

![Five figures seated on a couch](images/pet-quality-couch.png)

Still needs the owner's Mac: compile/run the Swift helper, real keyboard ownership during rapid
pointer-to-chat/Pong/bag changes, desktop return/Spaces/click-through, native permissions, and a live
two-to-five-figure session. Real Windows input, PowerShell and mixed DPI also remain hardware checks.
See [CURRENT-CONTROLS.md](CURRENT-CONTROLS.md) for the acceptance sequence.
