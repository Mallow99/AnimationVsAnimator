# Current controls and Mac acceptance

The latest milestone adds the overlay grab bag and reversible trash. Adaptive combat, actual cursor
weapons, quiet activities, sleeping pickup and full hitboxes remain available. Future expansions are
in [UPDATE-PLAN.md](UPDATE-PLAN.md).

## Grab bag, giving and trash

Open the **bag at bottom left**. Choose a figure under **For**, then drag an illustrated tool or
furniture out of the catalog. Drop a tool on any figure to give it to that figure, or elsewhere to
drop/throw it. Loose items can be picked up and passed the same way. The same item and ammunition
travel together. Transporting a weapon this way does not fire/swing it; use Take for combat controls.

Click a catalog choice, or focus it with Tab and press Enter/Space, to hold an object until your next
click places it. **Escape** or right-click ends transport and drops it safely. Settings and the
existing equipped-item Take menu remain available.

Drag a held item, furniture or live drawing into the **trash can at bottom right**. **Undo** beside
the can retrieves the last object. Undo is one object deep and lasts until the app closes. Occupied
furniture releases its activity when trashed; restored furniture is available to use again. Trash
only handles in-app objects. Sponge cleaning and saved world storage are still future work.

## Bag/trash checks on your Mac

1. On `codex/roadmap-continuation`, run `npm ci`, then `npm start`. Open the bag and drag out a
   book, pistol and chair. Verify opening/closing the catalog does not switch Spaces.
2. Give the book to Leonard; drop the pistol, then pick it up and pass it. Take it through the menu,
   fire one round, drop it and pass it again. Check the magazine stays with the same item.
3. Trash an item and click Undo. Repeat with a chair, an occupied TV/couch and a live drawn object.
   Check activities stop, nothing duplicates, and the restored object can be used again.
4. Hold still after dragging furniture, then release; it should fall without a surprise throw.
   Try Tab/Enter/Space, Escape, a smaller viewport, and returning clicks/focus to Chrome afterward.
5. Trash an item, quit/restart and confirm it stays removed. Repeat with Undo before quitting and
   confirm the restored item reloads. Undo itself does not survive restart.

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
