# Current controls and Mac acceptance

Pet Quality now polishes the Workshop/Household foundation: smoother seating, quieter everyday
behavior, cups/dumbbells/yo-yos, real bookshelf storage, passive carrying and reliable reloads.
See [PET-QUALITY.md](PET-QUALITY.md) for the item audit and verification. See [UPDATE-PLAN.md](UPDATE-PLAN.md)
for the current five-update roadmap; batch scope is unlimited.

## Satchels, supplies and trash

Right-click a figure → **Open bag**, click its wearable satchel, or tell it “open bag.”
A brief hover hint points to this menu. The figure menu has one inventory entry instead of a separate
Take row for every owned item. **Activities…** opens the activity list directly.

- **Bag** contains that figure's actual items, with **In bag / In hand / Wearing** states and pistol ammo.
  Click a card to inspect it; this keeps the panel open. **Take out** puts the original item on your
  cursor for passive carrying. **Use with cursor** explicitly enables weapon or cleaner controls. **Store in bag**, **Drop beside figure** and
  **Trash** say what they do. Dragging a card remains available.
- **Supplies** creates new tools and furniture. Select a card, then **Give to [figure]** or **Place on
  desktop**. Owner buttons choose the recipient. A full bag asks you to free a slot or place the tool.
- **Activities** lists everyday, workshop, drawing, group, game, arranging and friend activities.
  Unavailable entries explain the missing tools, furniture or free companions. **Stop current activity**
  releases the current activity; **Wake up** is shown for a sleeping figure.
- **How to use this** explains these controls inside the panel. The tabs, title and close control
  remain visible while the choices scroll, and an open panel stays where you opened it.

After taking an object out, drag or click to place it, or drop it onto a figure to store/pass it.
The temporary controls in the top-right offer **Cancel** and, for weapons/cleaners, **Use with cursor**.
Cleaners offer **Stop using** to carry safely again. Controls themselves do not wipe/color/erase ink.
Escape/right-click/Cancel restores an existing item to its previous hand, worn state, bag slot or
world/shelf location; Carry → Cancel returns a cursor weapon to its bag;
unplaced new supplies are discarded. Figures cannot snatch a tool during user-controlled use.

**Trash** is also available from an object's right-click menu and Settings → Items. **Undo trash**
in the bag restores the last original object even when the trash shortcut is hidden. Undo lasts for
this session and preserves identity, art and ammo. Bulk furniture trash only allows the last object
back. Furniture actions such as **Sit here** and **Make a blueprint here** use the object clicked.

General → **Show supplies bag shortcut** and **Show trash can** enable optional pixel icons. Both
start hidden. Drag either to reposition it; placement survives restart. Mouse use leaves the overlay
non-focusable. **Keyboard** explicitly enables Tab/Enter/Space; Escape closes it and releases focus.

## Workshop

Pull a **Sponge**, choose **Use with cursor**, then move over raw pen strokes to wipe locally.
**Eraser** and **Paint bucket** also require explicit **Use with cursor**; they remove ink objects or
do their coloring step. **Stop using** restores passive carrying, and dropping/passing stops use. Put a desk, workbench or tool shelf on the desktop from
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

## Pet Quality checks on your Mac

1. Start this branch with `npm ci` then `npm start`. Confirm the Swift helper starts/compiles.
   Rapidly switch between pointer bag use, bag Keyboard, chat and Pong Keyboard. Close each control;
   confirm focus returns to your original app without disappearing figures or switching Spaces.
2. Take a pistol out: move it around before Use and confirm it stays passive. Explicitly Use it,
   empty/reload with the mouse button, then Carry, Drop, pick up, Cancel and Put away. Interrupt a
   figure's reload, let it resume and restart with a partially empty gun. Confirm one original gun.
3. Take a sponge/eraser/bucket out and carry without using. Use, Stop using, drop, pass, trash/Undo
   and Cancel; confirm drawings change only while explicitly using, away from the controls.
4. Give a cup, dumbbell, yo-yo and handheld from Supplies. Run their named Activities and interrupt
   each during a reach. Check natural handling, consistent limbs and no stranded hand/item state.
5. Place a bookshelf and five books, one per figure. Store books on it through the bag. Read, fetch,
   watch opening/page-turn/closing/return, interrupt, take a reading book and restart. Verify actual
   saved books and separate slots. Drag/tip the bookcase and check contents become normal loose items.
6. Seat all five on the couch. Let calm figures rest/read; talk, then explicitly change an activity.
   Ambient invitations should wait. Invite a figure standing on a window to a floor gathering.
7. Stack and lean furniture/items, leave them to settle, then drag, push, carry, strike and throw them.
   Carry a sleeping figure gently and release close to the floor; try a hard impact separately.
8. Leave two-to-five figures running during your normal workflow and return after idle. Restart and
   verify owned items, ammo/reload state, furniture, books and relationships.

Cloud Linux/Chromium/Electron checks do not establish native Mac focus/Spaces behavior. Windows
portable packaging is verified; real PowerShell/input/mixed-DPI behavior still needs a Windows machine.

## Workshop/Household checks on your Mac

1. Start this branch with `npm ci` then `npm start`. Open a satchel and use supplies with the mouse;
   verify no one disappears or switches Spaces. Toggle and relocate the two shortcuts.
2. Inspect, pull, pass, store, cancel, trash and undo tools with both shortcuts hidden. Use Keyboard, Escape and a smaller display. Confirm
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

Choose **Use with cursor** in its bag, or take it out and choose **Use with cursor** in the temporary controls. Its original item follows your cursor;
the small weapon bar shows the current tool and relevant controls.

- Sword or mace: hold the left button and swipe quickly to swing.
- Pistol: press at the grip position, hold and drag away from it to aim/fire. Release to reposition.
  Its six-round magazine stays with the item. Click **Reload** (or press **R** when the overlay has
  keyboard focus); the reload takes about 1.15 seconds. Progress follows the gun through interruptions,
  storage and restarts. Guns still reload; the repeated-reload failure has been fixed.
- Bow: press at the grip position, hold and drag to aim/charge, then release to shoot an arcing arrow.
- **Carry** switches the original weapon to passive transport; **Drop** leaves it on the desktop.
- **Esc** or **Put away** returns a taken item to its owner. Right-click over a figure to hand it back,
  or away from the figures to drop it. A dropped item can be picked up again.

General's practice weapons still work too. They are separate from taking an owned item.
Combat and weapon controls work offline. Health and guard pressure remain hidden by default;
General's developer combat toggle can expose them while tuning.

## Quiet companion life

Open each figure's **Mind → Hyperactivity** meter. Lower values encourage settling; higher values
make it more restless. Mood also affects duration. The default is 0.25 and settings are independent.
Calm viewing can last around half an hour; games and reading can last several minutes.

Use “Read a book” in Activities, or say “read a book.” Books open, turn pages, close, and return to a
placed bookshelf after reading. **Supplies → Bookshelf → Place on desktop** creates the bookcase.
Give real books from Supplies; an owned book's bag actions include **Store on bookshelf** when a
usable shelf is placed. It has five slots. Right-click a shelved book to take/store/trash the original.
Owners fetch their own shelved books; grabbing/tipping/removing the shelf releases them.

Give a **Cup**, **Dumbbell** or **Yo-yo** from Supplies, then choose **Have a drink**, **Train with a
dumbbell** or **Play with a yo-yo** in Activities. Offline phrases include “have a drink,” “lift weights”
and “play with a yo-yo.” The figure finishes a sip/set/catch before storage, with pauses between actions.
“Play a handheld” uses its actual pocket game. Missing supplies are explained in the activity list.
TV activities require a placed TV.
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
