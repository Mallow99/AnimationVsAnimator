# Working on this pet

Read `CLAUDE.md` for the original vision, then `docs/HANDOFF.md` for the latest work and limits.
The user's latest instructions take priority over the historical roadmap.

- Preserve the existing personality, procedural stick-figure look, and movement presets. Ask before
  substantial character/design changes. Small tool improvements and clear activity UI are welcome.
- The owner resumed multiple characters: his friend is a second `Pet` in the same overlay (see the handoff).
  The owner wants them split into separate apps that talk to each other later; keep them one app for now.
  No health bars or permanent death: play fights, or real fights where limbs come off and go back on.
- Keep `src/core` free of Node, Electron and OS imports. Put native integration behind the shell bridge.
- Keep Windows distribution in working order. Package the PowerShell helper as a real file, retain
  the visible-pixel/DIP conversion, and never ship app-data files or provider keys.
- Work in runnable milestones and commit working steps. Do not change tests to hide a bug.
  Run typecheck, the simulation and focused checks for core changes. Replay a failed sim using its seed.
- Update the handoff with what was actually tested, remaining problems, and the next concrete step.
  Distinguish Mac/Windows hardware checks from cloud simulations and fake helpers.
- Cloud tasks are already isolated. Use the existing checkout; do not create a worktree unless asked.

Commands and architecture are documented in `docs/HANDOFF.md`. The pet must remain useful offline,
with a lightweight install and economical optional AI calls.
