# Before this could be sold: the checklist

Nothing is for sale. The downloads on the Releases page are free test builds.
This is the list of what must be true before charging money for it. It is paused until the
owner picks it up again. Only a person at a real computer can tick the boxes below; a passing
automated check on another system is not a tick.

## Automated checks (GitHub runs these for every build)

- `npm run verify -- --app`: type check, every check group, the long simulation, the overlay in
  headless Chrome, and the packaged edition running in real Electron (first run, old saves,
  no internet requests, Local AI only through Ollama on this computer, save failures, quit).
- `npm run check living-soak` with seeds 7 and 32: two simulated hours of every feature each.
  This is simulated time, not two hours on real hardware.
- `npm run check quality-profile`: one physics step must fit in 8.33 ms with two and five figures.
  Linux numbers are not a promise about frame rate on a Mac or PC.
- `npm run check ram-profile`: memory use (run by hand; results from older versions are in
  `docs/archive/verification/`).
- Each ZIP is built on its own operating system, unzipped, started, saved, quit and restarted.

Also look at real frames (opening, middle, closing, interrupted) of reading, pickup, throwing,
drawing, sitting, climbing, gifts, games and shared activities, facing both ways, with one, two
and five figures.

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
- [ ] Final stable version and checksums published; no candidate is advertised as finished.

No spend, signing certificate purchase or public store publication is automated here.
The current budget is $0; signed/notarized distribution is a separate future decision.
