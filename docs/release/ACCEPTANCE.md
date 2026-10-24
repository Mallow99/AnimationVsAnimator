# Release acceptance — 1.0.0-rc.1

Status: **candidate; not approved for sale**. Automated CI produces downloadable test
archives. A successful package job does not complete native or commercial acceptance.

## Repeatable automated checks

- `npm ci`, `npm run verify`: types, all existing focused checks, storage/release tests,
  simulation and actual Chromium controls/rendering.
- `npm run build:release`; run `scripts/release-electron-check.cjs` with Electron:
  customer UI, old-config migration, offline boundary, no loopback service or outgoing
  requests, ownership/reload, injected quota/write failures and acknowledged quit.
- `LIVING_SOAK_SEED=7 LIVING_SOAK_SECONDS=7200 LIVING_SOAK_TAIL_FPS=30 npm run livingsoak`;
  repeat seed 32. This is simulated time with every-second invariants, not two hours of hardware use.
- Run `npm run qualityprofile` by itself. Combined p95 update work must fit 8.33 ms
  for two and five figures. Linux measurements are not native frame-rate claims.
- Run `npm run ramprofile` with two/five figures and rich/churn fixtures. Record
  process-tree memory and whether it settles after repeated UI lifecycle changes.
- Inspect actual opening, mid-action, closing and interruption frames for reading,
  pickup, throwing, drawing, sitting, climbing, gifts, games and shared activities.
  Check both facings, all presets and 1/2/5 figures.

## Native gates — outstanding until evidence is recorded

Use the built, downloaded archive on an ordinary user account without Node or developer tools.
Record OS, hardware, version, source commit, archive SHA-256, result and any failure.

- [ ] Apple Silicon Mac: extraction, app-specific security prompt, bundled helper launch,
  menu-bar controls, no first-run compiler/download prompt.
- [ ] Windows 11 x64: full ZIP extraction, executable, tray, native PowerShell helper;
  verify path with spaces, 100/150/200% scaling and ordinary non-admin applications.
- [ ] Both: clean launch → welcome → play → customize → quit → reopen; all data retained.
- [ ] Both: no unexpected focus theft; click-through outside controls; keyboard/input/IME;
  drag interruption, Escape, cursor hand-back and emergency Hide/Pause/Quit.
- [ ] Mac: permission refused, later granted/revoked; normal and protected windows;
  Spaces/full-screen behavior; the desktop floor remains usable on failure.
- [ ] Both: laptop sleep/wake, display resolution/primary-monitor changes and disconnect.
- [ ] Both: default scene targets 60 fps on an 8 GB machine; no persistent battery/CPU
  spike, no growing memory trend after 20 Settings open/close cycles. Measure separately
  from concurrent tests and document methodology.
- [ ] Both: five figures, crowds/mixed sizes, hands/feet contact and speech readability.
- [ ] Both: upgrade over a previous candidate, settings/memories/items retained; uninstall
  removes the app while intentionally leaving recoverable data.

A crash, lost save, trapped pointer/focus, broken core action or failed clean install
blocks sale. Fix and repeat the affected scenarios. Do not change a failure to “passed”
because a simulated adapter or another OS passed.

## Commercial gate

- [ ] Real native results above attached to the exact candidate.
- [ ] Listing matches actual supported systems and unsigned installation requirements.
- [ ] Owner's seller identity, payout and tax setup completed directly with itch.io.
- [ ] Download entitlement and full archive verified with a test download key.
- [ ] Cover/demo/screenshots show this exact product; AI assistance disclosed accurately.
- [ ] Final stable version and checksums published; rc.1 is not advertised as finished.

No spend, signing certificate purchase or public store publication is automated here.
The current budget is $0; signed/notarized distribution is a separate future decision.
