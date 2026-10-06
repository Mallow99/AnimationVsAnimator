# Changelog

Every working commit records concrete additions, behavior changes, repairs, verification and
remaining issues here. Entries describe shipped behavior; unverified hardware behavior stays explicit.

## 2026-10-06 — Repair item continuity, book handling and rigid prop contact

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
