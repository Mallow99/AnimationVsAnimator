# Personalized procedural figures

`src/core/character-template.ts` is the reusable template for future preset characters. It adds accents
to the chosen appearance/movement presets; the body controller still owns bone lengths, reach limits,
line thickness, inverse kinematics and physical contact. Do not replace it with a second renderer.

| Preset | Motion and sitting | Speech | Satchel | Gift preferences |
| --- | --- | --- | --- | --- |
| Cobalt / inventive | Thoughtful steps, restrained arms, forward/lap sitting | Measured, thinking gesture | Slate, brass clip, pencil | Books, pens, handhelds |
| Amber / competitive | Longer steps, upright knees, restrained foot swing | Faster, lower blips, presenting | Warm brown, gold clip, star | Weights, balls, handhelds, practice sword |
| Moss / gentle | Quiet short steps, relaxed/lap sitting | Slower, softer timing, wave | Green, pale clip, leaf | Flowers, books, cup, blanket, snacks |
| Violet / mischievous | Bouncy steps, edge sitting and more foot swing | Quick, higher blips, shrug | Purple, pink clip, heart | Yo-yo, pens, balls, handhelds |
| Ruby / adventurous | Higher energetic steps, forward feet, edge sitting | Brisk, presenting | Rust, blue clip, bolt | Balls, handhelds, yo-yo, snacks |

The names describe defaults. Saved custom names and appearance choices remain independent of
personality. The exact old defaults Blurp and Leonard/Leanord migrate to Cobalt and Amber; stable
roster and save identities do not change. The legacy Blurp appearance bundle remains available.

## Template fields

- `walk`: stride, lift, swing and bob multipliers. These are modest accents over the selected preset;
  sword-fight positioning keeps its original controls. Existing emotional gaits continue to apply.
- `sit`: lean, knee spread, foot offset, hanging-foot swing and resting hand style. Active tools,
  shared gamepads and scooting override resting hands when necessary.
- `voice`: character typing rate, blip pitch multiplier, punctuation pause and conversation gesture.
  This is procedural bubble/blip speech, not recorded voices. Group turns account for reading time.
- `idle`: neutral resting hands; mood can override this with crossed arms, comfort or confidence.
- `bag`: body/flap/clip colors and signature sticker. Shared satchel geometry and pixel sizing remain.
- `gifts`: ordered preferred item ids. These guide spare-original selection and appreciation; owning
  a favorite is optional and giving gifts is not required to maintain a friendship.

Add a new personality to the `Personality` union and `CHARACTER_TEMPLATES`, then register its stable
preset identity/config in `config.ts`. Update offline activity preferences and canned reactions if
needed. Never reuse an existing save id for a new figure. App editing of these templates is not needed.
Current roster size is capped at five; extending that cap is a separate change.

## Social and item contracts

Relationships save bounded bond, trust, familiarity, respect, cooperation, care, rivalry, generosity,
counts, favorite activity and eight recent shared moments. Repetition has diminishing returns.
Friendship stages explain progress without presenting permanent failure or requiring daily upkeep.
Satchels earn distinct keepsake marks at 4, 12 and 30 completed shared moments; duplicates are skipped
and no more than three marks are saved. Moods keep confidence, affection and stress alongside the
existing needs. The offline Mind uses these states; optional AI gets the same context/actions.

A gift transfers an owned original with its identity, artwork, bookmark, game score, ink and remaining
reload. Receipt validation protects full/busy/sleeping recipients and interrupted handoffs. Wrapping
has three drawn styles, uses the giver's pen when available and opens during recipient inspection.
Flowers are offered directly. A gift is inspected and stored rather than automatically used.

Peers exchange snapshots and JSON messages through `peer.ts`. Do not access another figure's body,
inventory or Mind directly from a skill. The gift receipt callback is local dispatch bookkeeping;
peer messages contain data only. Core code must remain free of OS/Electron imports.

## Acceptance for another preset

Check both facings and all appearance/movement presets, walking/ground and furniture sitting,
reading, carrying, fighting, group turn timing and satchel layering. Verify exact bone dimensions
and thickness, owned-original gift refusal/acceptance/Stop, saves, removed roster members and five
simultaneous figures. Run the focused suite and actual browser motion fixtures, then inspect the
frames: a finite pose can still look wrong. Hardware acceptance remains separate from Linux fixtures.
