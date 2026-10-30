# Mallow Desk Buddies — features and customization

An offline desktop toy with up to five procedural stick-figure companions on screen.
Five saved buddies are included, with a sixth available through a bonus code.
Current candidate: 1.0.0-rc.4. Target platforms: Apple Silicon Mac and Windows 11 x64.
Physical release acceptance remains pending; see the installation guide.

## What you get

- **Desktop companions:** pet, poke, pick up and toss your buddies. They react,
  recover, wander, rest and choose activities on their own.
- **Individual lives:** each buddy keeps their name, moods, belongings, memories
  and friendships. Putting someone away preserves their progress.
- **Things to do:** reading with persistent bookmarks, drawing, exercise, dancing,
  drinks, catch, shared activities and cartoon sparring.
- **Games:** handheld play and shared handheld games; TV runner games, Pong and Othello.
  Activities show their required supplies and available companions. Quick actions explain
  what is missing and show the selected buddy's current activity.
- **A furnished desktop:** place chairs, a couch, TV, lamp, canvas, scooter, desk,
  workbench, storage and a bookshelf. Move furniture and give, carry or store items.
  New furniture supplies show a footprint and floor guide; optional Snap to floor
  aligns a clear near-floor placement before releasing normal physics.
- **Local conversation:** familiar topics, remembered details and branching stories.
  Saved transcripts can be exported or cleared for one buddy. No general-purpose
  AI answers, account, API key, model download or subscription is required.
- **Optional desktop play:** window climbing, cursor mischief, window movement,
  active-app reactions, talking sounds and sound effects. These start off on a
  fresh install. Pause, Hide/Show and Quit stay available in Settings and the tray.
- **Local persistence:** automatic saves, last-good recovery, visible write-error
  status, retry and full JSON backup export. Updates are manual.

## Make each buddy yours

Open **Settings → Buddies**, then choose the buddy in **Getting to know**.
Changes appear on the desktop immediately and save for that buddy.

| Change | Controls |
| --- | --- |
| Company | Show up to five buddies at once from the saved roster; putting someone away preserves them. Unlocking a bonus buddy never replaces another. |
| Name and colour | Name each buddy. Use the colour picker, exact six-digit hex code or hue, saturation and lightness sliders. |
| Size | Set the overall size from 0.6× to 2.5×. |
| Personality | Inventive, competitive, gentle, mischievous or adventurous; changes activity preferences, motion and local voice. |
| Appearance | Continuous line width and head-size sliders; choose smooth rendering or adjust pixel size. Each shows its current value. Arnold also has a JT arm tattoo toggle. |
| Movement | Expand Movement for leg straightness, stance width, step length, foot lift, arm motion, lean and walking bounce. Change each separately. |
| Activity pace | Activities → Activity pace, from calm to restless. |
| Desktop and sound | Settings → window climbing, volume, sounds and day/night rhythm. |
| Slapstick | Settings → Playful mischief: cursor/window play, swipe-to-smack, breakable limbs and sparring style. |
| Furniture and belongings | Things → bags/supplies, Give, Place, store, trash and Undo. |
| Your own items | Things → Make your own things opens local definition files, examples and the making guide. Reload definitions after editing. |

Personality changes preserve the buddy's identity, conversation, memories, items
and friendships. Each appearance or movement slider changes only its own setting;
changing colour preserves the other choices. Existing saved looks are retained.
Custom items and props currently use local JSON definition files rather than an
in-app visual editor. Custom character images and third-party character packs
are outside this candidate.

## Bonus buddy

Have a bonus buddy code? Open **Settings → Settings**, enter it in **Bonus code**
and choose **Unlock buddy**. This works offline and stays saved on that computer.
A repeated code does not create duplicate buddies. **Meet Arnold** opens his controls;
if five buddies are already out, put one away before bringing him onto the desktop.

Arnold carries a working feather quill for drawing and tells deliberately corny jokes. He has a JT tattoo on his arm and a talkative, cheerfully unfunny personality. His name,
colour and usual look/movement settings are editable. He has his own belongings,
book progress, conversation and memories, just like the original five buddies.

## Materials and custom art

Settings, bags, activities and chat use paper-fibre and woven-linen textures, with
inset fields, clear focus and selected states. Pong controls share the same finish.
Stock furniture has wood grain, woven upholstery and brushed metal; books have
leather covers, paper grain and page ink.
Textures stay attached as objects move and turn, including in pixel rendering.
These are lightweight procedural finishes, with no downloaded texture assets.

Custom prop shapes may set `material` to `wood`, `fabric`, `paper`, `metal`,
`leather`, `rubber`, `ceramic` or `none`. Unmodified older stock definitions receive
the new finishes automatically; edited artwork keeps its existing appearance.

## Scope and installation

Primary-monitor play. Mac minimum binary target is macOS 13; the accepted release
must list the actual tested OS versions. Direct downloads are unsigned on Windows
and ad-hoc signed on Mac, without Developer ID notarization. Read INSTALL.md.

All conversations and app state stay local. The commercial build disables cloud
AI, local-model connections, browser-extension pairing and file/document visits.
Cartoon sparring can include limbs coming off and being reattached; no gore or
permanent death. Breakable limbs can be switched off.

See PRIVACY.md and RECOVERY.md for data retention, backups and recovery limits.
