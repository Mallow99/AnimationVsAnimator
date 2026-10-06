# Living Stickmen update

The owner's expanded Pet Quality request supersedes the previous stop point. Complete this
checklist in order, then stop before Out of the Box. Do not add Chrome/Finder integrations.

**Core principle: make the figures feel alive, even with no AI brain.** Actions need intention,
physical transitions, continuity, reactions and readable choices. A passing test alone is not
evidence that motion or interaction feels right. Preserve procedural figures and pixel artwork.

## 1. Repair the foundation

- [x] F1 Drawing a second object preserves every previously owned project and its progress.
- [x] F2 Gun reload advances exactly once in hand, bag, world, cursor use and passive transport;
  full bags, interrupted skills, transfer and restart cannot strand or restart it indefinitely.
- [x] F3 Reading-to-return movement releases stale targets and handles the closed book naturally.
- [x] F4 Book artwork, pickup region and physical contour agree in open/closed states.
- [x] F5 Custom book artwork stays custom; reading respects existing actual books.
- [x] F6 Book pages face the reader and the satchel/strap cannot draw over the held book.
- [x] F7 Reproduce and repair furniture/item penetration, jitter, drifting contacts and unstable
  stacking. Include mixed masses, multiple props and leaning; retain drag/push/carry/hit/throw.
- [x] F8 Make browser fixtures deterministic without weakening behavior assertions.

## 2. Character roster and unified controls

- [ ] R1 Replace name-specific population settings with 1 stick man, 2 stick men, through 5.
- [ ] R2 Select which preset characters appear, including one character other than the first.
- [ ] R3 Presets have distinct names, colors, personalities, preferences and reactions; changing
  the active roster preserves each character's saved possessions, relationships and settings.
- [ ] R4 One Settings window with a named character selector; app settings apply globally.
- [ ] R5 One inventory/supplies/activity interface with named selection and an All figures scope.
  Give the same supply to all selected figures, preserving separate real-item ownership.
- [ ] R6 Migrate existing saves/settings without removing edited names, appearances or items.

## 3. Physical and social life

- [ ] L1 Replace couch recentering slides with a lift/brace/scoot/settle motion; allow natural
  transient overlap and never teleport or continuously squeeze figures apart.
- [ ] L2 TV/furniture repositioning is discoverable and actually reaches a sensible destination;
  autonomous choices can use it. Occupied/blocked/grabbed furniture cancels or waits naturally.
- [ ] L3 Combat participants stay exclusive; incidental hits cannot recruit spectators into
  one-sided multi-opponent fights. Explicit fights and intentional cursor attacks still work.
- [ ] L4 Group conversations have shared turn-taking, listeners and personality-specific replies;
  autonomous invitations and ordinary conversation can involve 3–5, not only isolated pairs.
- [ ] L5 Relationships affect partner selection, cooperation, reassurance, rivalry and reactions.
- [ ] L6 Offline mood needs encourage purposeful activities and pauses; social/creative needs,
  frustration and contentment recover naturally. Preserve restful sleep and quiet work.
- [ ] L7 Mind UI and optional AI context describe the new needs/actions without requiring AI.

## 4. Acceptance and delivery

- [ ] V1 Built-in development sanity checks detect invalid ownership, NaN/offscreen state,
  stranded controllers and stale group/seat claims without spamming ordinary users.
- [ ] V2 Meaningful regression coverage for every confirmed bug and new roster/social behavior.
- [ ] V3 Simulations and 2–5 figure soaks; replay every failing seed and repair the underlying cause.
- [ ] V4 Actual Chromium/Electron input checks: settings selector, all-figure giving, passive
  pickup/use/drop/cancel/trash, keyboard/focus and small-window GUI bounds/scrolling/clutter.
- [ ] V5 Visual inspection of facing books, scoots, movement, conversation and multiplayer combat.
- [ ] V6 Performance with five figures and interacting props; saves/restarts, interrupted projects,
  sleeping pickup and removed/re-added characters; package Windows with real native helper files.
- [ ] V7 Update CHANGELOG after each working commit; summarize verification and remaining issues.
- [ ] V8 Update roadmap, current controls and handoff; update PR #3 if open, otherwise create a PR.
  Clearly separate Linux/cloud verification from Mac/Windows hardware acceptance.

## Ordered commit boundaries

1. Item/book/physics correctness and regression coverage.
2. Character roster and unified settings/inventory with migration.
3. Physical/social life and richer offline behavior.
4. Acceptance repairs, visual evidence, final documentation and PR.

These are working boundaries, not a limit on systems per batch. New evidence may require a smaller
repair commit. Every commit gets a concrete changelog and checks appropriate to its changes.
