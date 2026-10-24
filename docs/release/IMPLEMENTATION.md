# Commercial candidate implementation

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

## Evidence at the first implementation checkpoint

- Full original 217 regressions, release storage/layout checks, simulation and Chromium
  passed before the long-soak repair. Final aggregate verification is in progress.
- Real Linux Electron customer flow passed: onboarding, migration, activity/supply IPC,
  pause/hide/resume, local chat, failed quota/write+retry, exact reload and quit flush.
  Native windows were simulated; no HTTP requests or loopback listener were observed.
- Development Electron flow passed, including optional-provider controls with mocks.
- 10 model checks passed after the book collision repair. The new case drops rotating
  books on a one-way platform across 72 orientations with changing hull topology.
- Extended seed-7/32 simulation soaks and isolated final resource profiles are pending.
- Mac and Windows package jobs and actual native acceptance are pending.

## Work that requires access outside this cloud workspace

Follow every unchecked gate in [ACCEPTANCE.md](ACCEPTANCE.md). Ordinary physical Mac
and Windows testing cannot be inferred from a successful simulated helper or cross-build.
There is no authenticated itch.io seller session. Seller identity, payout and tax
information must be entered by the owner with the payment provider. Listing copy is
in [../store/LISTING.md](../store/LISTING.md); do not publish this candidate as final.

No purchases, reviews or income have been generated. A finished download alone does
not establish buyer demand; the $5 price is an initial experiment after acceptance.
