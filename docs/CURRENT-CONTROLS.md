# Current controls and Mac acceptance

Workshop and Household now include wearable satchels, animator tools, saved storage, crafting,
furniture arranging, two-to-five-person activities and Pong. See [UPDATE-PLAN.md](UPDATE-PLAN.md)
for the current five-update roadmap; batch scope is unlimited.

## Satchels, supplies and trash

Click a figure's pixel satchel, or choose **Open satchel** from its menu. The inventory contains
its actual owned items. **Tools & furniture supplies** opens the catalog; owner buttons choose who
receives a new tool. Pull an item onto the desktop or another figure. You can also grab an equipped
hand item directly. Actual weapons taken from a hand use the existing combat controls below.

General → **Show supplies bag shortcut** and **Show trash can** enable the optional pixel icons.
Both start hidden. Drag either shortcut to reposition it; its placement survives restart.
Mouse use leaves the overlay non-focusable. **Keyboard** explicitly enables Tab/Enter/Space.
Click a choice then click to place, or drag it; Escape/right-click drops transport safely.

Drop an in-app object into the optional trash can; **Undo** retrieves the last object with the same
identity, art and ammo. Undo lasts for this session. Trashed objects stay absent after restart.

## Workshop

Pull a **Sponge** and move it over raw pen strokes to wipe locally. **Eraser** removes ink objects;
**Paint bucket** does their coloring step. Put a desk, workbench or tool shelf on the desktop from
the catalog. Use the figure's action menu or talk commands, with no settings window needed:

- “Make a blueprint” traces a katana on desk paper and stores a copy in the satchel.
- “Sort tools” picks up loose tools and places them on the shelf; placements save.
- “Draw a katana / TV / couch / chair / desk” traces and brings a working ink object to life.
- “Refine it” works at the bench: color, polish, then one durable original object.
- Interrupted projects keep progress and resume after restart. General → Ink lifetime controls
  loose ink expiry; zero disables it. Held/stored items and occupied props pause expiry.

## Groups, arranging and game night

Add companions in settings (up to five). Actions work offline; only free, awake, unhurt figures join.

- “Group wave”, “Group conversation”, “Couch huddle”, and “Watch together” work with 2–5 figures.
- “Mirrored duet” needs two, “Hands in” three, “Two-pair dance” four, and “Wave relay” five.
- “Move the TV to the couch” moves and turns it toward the couch. “Carry it together” uses two
  figures. “Make a reading corner” and “Make a work corner” arrange their corresponding furniture.
- “Pass a tool”, “Compare drawings”, and “Check on your friend” create small peer moments.
- “Play Pong” starts a two-figure match to five points. Others can watch the same TV; **Join**
  lets you move a paddle with the mouse. **Keyboard** enables arrow keys; Escape/Leave releases
  keyboard focus. **Rematch** starts another round. “Play a handheld” uses its own runner screen.

General → Require a console for Pong is off by default for compatibility. When enabled, put a
console near the TV. Daily rhythm is optional: real night/morning and system idle time influence
sleep and welcome-back greetings. Drawing/building/game talents affect speed or skill; pair memories
retain shared activities, disagreements and effective fighting moves.

## Workshop/Household checks on your Mac

1. Start this branch with `npm ci` then `npm start`. Open a satchel and use supplies with the mouse;
   verify no one disappears or switches Spaces. Toggle and relocate the two shortcuts.
2. Pull, pass, store, trash and undo tools. Use Keyboard, Escape and a smaller display. Confirm
   normal Chrome focus/click-through returns after explicit keyboard navigation.
3. Wipe two nearby drawings locally. Draw/refine a katana, interrupt and restart mid-project;
   complete it and restart again. Verify one durable katana, saved ammo, shelf positions and desk art.
4. Seat all five figures on a couch. Run each count-specific activity; interrupt one participant
   and verify everyone releases its claims/hands. Busy and sleeping figures should decline.
5. Move the TV to the couch, grab/tip it mid-move and try occupied/blocked furniture. Restart to
   confirm arrangements. Play a full Pong match with two players and a third spectator; try joining,
   rematching, leaving and console gating. Try a handheld and returning after the computer is idle.

Cloud Linux/Chromium tests do not establish Mac Spaces/focus, real native helpers or Windows behavior.

## Use a figure's actual weapon

Take a weapon from its menu or Settings → Items → Take. Its original item follows your cursor;
the small weapon bar shows the current tool and relevant controls.

- Sword or mace: hold the left button and swipe quickly to swing.
- Pistol: press at the grip position, hold and drag away from it to aim/fire. Release to reposition.
  Its six-round magazine stays with the item. Press **R** to reload; the reload takes a moment.
- Bow: press at the grip position, hold and drag to aim/charge, then release to shoot an arcing arrow.
- **Esc** or **Put away** returns a taken item to its owner. Right-click over a figure to hand it back,
  or away from the figures to drop it. A dropped item can be picked up again.

General's practice weapons still work too. They are separate from taking an owned item.
Combat and weapon controls work offline. Health and guard pressure remain hidden by default;
General's developer combat toggle can expose them while tuning.

## Quiet companion life

Open each figure's **Mind → Hyperactivity** meter. Lower values encourage settling; higher values
make it more restless. Mood also affects duration. The default is 0.25 and settings are independent.
Calm viewing can last around half an hour; games and reading can last several minutes.

Use “Read a book” in the actions, or say “read a book.” TV activities require a placed TV.
Ordinary conversation can continue without ending the activity. Asking for a different action
still changes it, and removing/holding/tipping occupied furniture releases or interrupts its use.

Drag a sleeping figure to carry it without waking. Gentle release preserves sleep. A hard impact
or a hit wakes it; sleep also ends naturally when rested.

## Quick checks on your Mac

1. Start using `npm start`. Try running with a sword, backsteps during a duel, and a disarm. Check
   that recovery makes space and retrieves a safe reachable weapon or draws a working replacement.
2. Take a pistol, bow and sword. Aim away from the figures as well as at them, reload, return/drop,
   and pick them up again. Check for duplicate items or weapons left in both hands during combat.
3. Lower Hyperactivity and start reading or watching TV. Talk normally, then request a different
   activity. Check that conversation preserves the first activity and the explicit request changes it.
4. Carry a sleeping figure gently and release it close to the floor. Then try a hard drop/hit.
5. Pick up a mace by its wide head, a bow by its end, and furniture by visible extensions. Throw
   furniture, place two props together, stack items and check artwork stays above the floor.
6. Try two through five figures with your normal Chrome/Finder workflow. Check click-through and
   focus after returning a weapon, and verify existing native permissions/window behavior separately.

Native Chrome/Finder acceptance instructions remain in [DESKTOP-INTERACTIONS.md](DESKTOP-INTERACTIONS.md).
