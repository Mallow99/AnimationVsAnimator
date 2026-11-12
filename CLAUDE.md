# AnimationVsAnimator / Mallow Desk Buddies

A desktop pet: procedural stick figures living in a transparent, always-on-top overlay.
Inspired by Alan Becker's _Animator vs. Animation_. No pre-made animations: all motion comes
from physics and code.

**The full working instructions are in [AGENTS.md](AGENTS.md). Read them first and follow them
literally.** The current state of the project, known problems and next steps are in
[docs/HANDOFF.md](docs/HANDOFF.md).

@AGENTS.md

## The short version

- The owner is a high-school student, new to code. Explain decisions in plain language and define
  jargon the first time. For look, feel and behaviour choices: offer options, the owner chooses.
- Work in small steps that end with something the owner can run and see. Commit each working step.
- `npm run verify` must pass before you say something is done. Never edit a test to make it pass.
- Go as far as the cloud can verify, then say clearly what only a real Mac or PC can confirm.
- Keep it lightweight: few dependencies, installed size under 1 GB, no process overhead.
- No AI model names in commits, code or documents.
- `docs/archive/` is history (old plans, old handoff notes, the original brief). Parts of it are
  no longer true. Do not read it unless the owner asks about the past.
