# Paused checkpoint: reusable 3D props and hinged book

Paused at the owner's request on 2026-10-12. This is an unfinished prototype, not a completed
Pet Quality release. The last completed/verified repair is `b727a02`. Continue on
`codex/roadmap-continuation`, draft PR #3; do not start another integration milestone.

## Implemented so far

- `src/core/prop-model.ts`: platform-independent XYZ surfaces, solid boxes, transforms, named grips,
  visible-face projection/picking, shading and individual depth parts for the existing canvas renderer.
- `src/core/book-model.ts`: solid covers, spine, page blocks and a hinged turning leaf. Reading
  orientation faces the pages toward the figure. Model grips connect the covers/page to actual hands.
- Stock book rendering, projected collision hulls and picking use the same model. Geometry/contour
  caches avoid repeatedly rebuilding unchanged vertices. Custom edited artwork retains its old path;
  gift wrapping retains its existing drawing until unwrapped. Book identity/progress saves are unchanged.
- Reading supplies explicit XYZ hand targets, including seated grip control and a secondary grip
  anchored to the real main hand. Storing/dropping/taking clears transient reading orientation.
- Read-only sanity audits check finite, unit-length book axes. Nine focused model checks and updated
  existing artwork fixtures exercise geometry, grips, ownership, progress and custom-art fallback.
- A separate development lab previews the book and a generic solid box with rotation, hinge/page
  controls, grip display and surface picking. Build with `node scripts/build.mjs modellab`, or serve
  and open with `npm run modellab`. It adds no bag/Settings controls or runtime dependencies.

The figures and props still render through the pixelated Canvas pipeline. This is real XYZ model
geometry with orthographic projection, not a full GPU scene/depth buffer or 3D rigid-body migration.
Face/limb depth sorting remains approximate; prop physics uses projected contours.

## Verification at the pause

Final source typecheck, normal build and model-lab build passed immediately before checkpointing.
Earlier intermediate revisions passed 78 general, 30 roadmap, 18 quality, 36 Update 2, 11 polish and
9 model checks, plus the full seed-1 simulation. They were not all rerun after the latest shading,
custody-cleanup and axis-audit changes. Do not carry forward the prior release's “all checks passed”
claim to this checkpoint.

Two checks remain unresolved:

1. `npm run sanitycheck`: the revised stock-book depth fixture in `scripts/living-checks.ts` fails
   with `AssertionError: faces should interleave at their actual depth`. It expects face centroids
   on both sides of the main grip, although that grip is at the outer cover edge. Investigate whether
   the fixture or depth behavior is wrong; keep a meaningful real-grip/occlusion contract rather than
   simply relaxing the assertion. The preceding modeled hull/custom-art/shelf-return checks passed.
2. `npm run browsercheck`: readiness times out at `scripts/browser-check.mjs:287`, waiting for
   `window.cursorWeapon.item === window.bagGun` after `window.friend.useItem(window.bagGun)`.
   This is the cursor-gun transfer section, before book acceptance. Root cause is undiagnosed.

An interim focused Chromium reading render passed actual book controls, five readers, both facings
and original-item departure handling. Visually inspected frames showed exterior blue covers toward
the viewer and the pages toward the figures. Those renders precede later grip/cache/shading changes;
final animation acceptance and the new lab's real pointer interactions are still pending. Existing
committed `verification/polish-*` previews belong to `b727a02`, not this prototype.

After caches, a profile run alongside other tests measured combined 120 Hz update mean/p95:

| Scene | Mean | p95 |
| --- | ---: | ---: |
| 2 figures, 4 loose items, couch/bookshelf | 1.337 ms | 4.568 ms |
| 5 figures, 10 loose items, couch/bookshelf | 3.888 ms | 13.219 ms |

The five-figure tail exceeds the 8.33 ms update budget in that loaded run. An isolated like-for-like
baseline/prototype comparison is still required. No fresh RAM measurement, full prototype feature
soak, native Electron acceptance or Windows package was completed. The existing portable output is
the previous `b727a02` build. Prior 348/422/384 MiB Linux PSS measurements are not prototype or Mac RAM
measurements. Real Mac/Windows native checks remain outstanding.

Disposable investigation logs currently live in ignored `.build/model-*.log` and
`.build/book-model-*.log`; they are not durable evidence. Exact failures and timings are recorded
above so resuming does not depend on those files surviving.

## Resume in this order

1. Diagnose the depth failure using actual reading grips/poses and verify limb/cover occlusion.
2. Diagnose the cursor-gun browser timeout; preserve passive pickup, explicit Use and original custody.
3. Profile isolated baseline/prototype performance; rerun focused/all affected checks and seed-1 sim
   against the final source, including transient cleanup and live audits.
4. Interact with the model lab and real books in Chromium. Inspect open/turn/close/return with five
   readers, both facings and every preset; check interrupted reading, wrapping/custom art and saves.
   Capture fresh, clearly labeled model previews for the owner's visual judgement.
5. Run the full feature/lifecycle soak, fresh RAM/native Linux checks and, when ready to deliver,
   rebuild/inspect Windows packaging. Decide explicitly whether the development lab ships.
6. Record final results/limits, update changelog/handoff/PR, and stop for owner judgement before
   Chrome/Finder work. Do not label this prototype complete until the unresolved checks are addressed.

## UX continuation verification — 2026-10-20

The owner resumed UX cleanup/conversation work on this source. The book-depth fixture was diagnosed:
its main-hand anchor is an outer cover edge, so visible face centroids need not surround it. The
revised check proves both real cover contacts and face depths around the interior spine, for both
facings. `sanitycheck`, all nine model checks and the full Chromium interaction/preset/render suite
passed. The earlier cursor-gun timeout was not reproduced; no weapon implementation repair is
claimed. This does not close isolated model performance, full model lifecycle/RAM, extended lab/
visual acceptance or current Windows packaging. The prototype remains unfinished.
