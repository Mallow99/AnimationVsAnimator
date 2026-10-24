# Commercial candidate implementation

## Current material and GUI polish candidate

The rc.3 pass replaces customer whole-look/palette buttons with hue, saturation,
lightness and hex colour controls plus independent appearance/movement sliders.
It adds paper/linen controls, deterministic stock prop/book/handheld materials and
preserves custom artwork and saved look values. All ten prop JSON files are unchanged
from rc.2 after removing the new material annotations; silhouettes/physics/grips remain.

Complete itch.io copy: [Markdown](../store/ITCH-PAGE.md) and
[paste-ready HTML](../store/itch-page.html). [Store setup](../store/LISTING.md)
records pricing, upload layout, platform disclosures and remaining seller gates.
The actual runtime media and capture recipe are in ../store/media; the stock finish
atlas is ../verification/mallow-material-atlas.png. Physical/store acceptance stays open.

The core/material candidate source is cf23c00. Its Mac/Windows extracted-app smokes,
aggregate checks and release Electron flow passed in run 40140358177; extended tests
are running. A final customer CSS correction wraps maximum-length names at 380px;
local release Electron verifies five long names, then restores the original names.
That UI-only correction will repeat customer/native CI against the verified core.

Isolated Linux/Xvfb rich five-figure memory: 407.9 / 407.0 / 404.2 MiB median PSS
before / after 20 Settings cycles / rested. Six processes and clean live audits.
Raw evidence: ../verification/mallow-material-memory.json. No native performance
claim follows from this short software-rendered measurement.


Latest UI candidate: **1.0.0-rc.2**, source `9e166bc`. Adds the feature/customization guide,
per-buddy personality selection, readable mixed presets and an in-app feature list.
CI run [40048614400](https://github.com/Mallow99/AnimationVsAnimator/actions/runs/40048614400)
passed all applicable checks and both native packages; core is unchanged from rc.1,
so the previously passed extended core soaks were retained. New evidence:
[../verification/mallow-customization.json](../verification/mallow-customization.json).
Draft downloads: https://github.com/Mallow99/AnimationVsAnimator/releases/tag/untagged-5d695bfa397f59ecb7b5

The earlier core and reliability baseline follows.

Version: 1.0.0-rc.1. Branch: `codex/paid-release`. Status: **not approved for sale**.

Implemented: customer interface and welcome scene, offline local dialogue, original
procedural figures/presets, 1–5 stable identities, activities/supplies/furniture,
quiet defaults, Pause/Hide, recoverable saves, acknowledged quit and backup export.
Development builds retain the old experimental interface/integrations. No paid APIs,
server hosting, subscriptions or telemetry are needed by the customer edition.

Packaging targets Apple Silicon macOS 13+ and Windows 11 x64. Mac helper is compiled
and ad-hoc signed on macOS. Windows retains a real PowerShell helper. Packages use an
explicit staging tree, no app data/provider credentials, source manifest and SHA-256.
Unsigned installation limits are disclosed. Actual tested OS versions remain pending.

Automated evidence is written to `.build/verification`, `.build/release` and the
seeded soak reports; CI retains checks and native archives as downloadable artifacts.
These ignored working outputs are not bundled into the customer download.

## Recorded verification

- All 218 focused core regressions, five release storage/layout checks, simulation and
  actual Chromium controls passed after the long-soak repair. Typecheck also passes.
- Real Linux Electron customer flow passed: onboarding, migration, activity/supply IPC,
  pause/hide/resume, local chat, failed quota/write+retry, exact reload and quit flush.
  Native windows were simulated; no HTTP requests or loopback listener were observed.
- Development Electron flow passed, including optional-provider controls with mocks.
- 10 model checks passed after the book collision repair. The new case drops rotating
  books on a one-way platform across 72 orientations with changing hull topology.
- Seed 7 passed 7,200 simulated seconds, 7,220 live audits and 35 feature phases. Seed 32
  also passed the same duration, audit count and feature coverage. This is simulated time, not two hours of hardware battery/focus testing.
- Isolated core p95 combined update: two figures 0.337ms, five 0.958ms (8.33ms target).
  Linux software-rendered whole-process-tree PSS medians: ordinary two 315MiB, five 319MiB;
  rich five 381MiB, after 20 Settings cycles 389MiB, after rest 397MiB; six processes.
  No long-term leak exclusion or native battery/60fps claim follows from those samples.
- Mac ARM64 and Windows x64 archives built and passed native CI extraction, real helper,
  Pause/Resume, save/normal quit/restart, with a path containing spaces. Run 40045300981,
  PR merge 603d06a (tree identical to a82b6f4). Both ZIP checksums/content verified locally.
- Final source 2a78d2b built and passed native smoke checks on both target OS runners
  in CI run 40046018836. All checks/customer Electron, both full soaks and the performance gate passed. Both
  archives and their SHA-256 files are preserved in the draft release; remote asset digests
  match the locally validated files. Final archive hashes and detailed results
  are in [../verification/mallow-release.json](../verification/mallow-release.json).
  Workspace credentials could create the draft but were refused by the upload endpoint;
  the workflow successfully used its own scoped token. Physical native acceptance remains pending.
- Runtime media and reproducible capture recipe are in `docs/store/media` and
  `scripts/capture-product.cjs`; SOURCE.json records the source and capture conditions.

## Work that requires access outside this cloud workspace

Follow every unchecked gate in [ACCEPTANCE.md](ACCEPTANCE.md). Ordinary physical Mac
and Windows testing cannot be inferred from a successful simulated helper or cross-build.
There is no authenticated itch.io seller session. Seller identity, payout and tax
information must be entered by the owner with the payment provider. Listing copy is
in [../store/LISTING.md](../store/LISTING.md); do not publish this candidate as final.

No purchases, reviews or income have been generated. A finished download alone does
not establish buyer demand; the $5 price is an initial experiment after acceptance.

Final CI proof: [../verification/mallow-ci-checks.txt](../verification/mallow-ci-checks.txt).
The combined CI evidence artifact was skipped because its `.build` paths were hidden.
The upload setting now explicitly includes the allowlisted hidden paths and fails if
no files are found. Actual CI results are retained in the repository; both native
evidence artifacts and all four draft download assets uploaded successfully.

Draft downloads: https://github.com/Mallow99/AnimationVsAnimator/releases/tag/untagged-8def72f382f8ae846806
