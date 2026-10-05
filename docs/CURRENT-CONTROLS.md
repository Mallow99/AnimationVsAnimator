# Current controls and Mac acceptance

This milestone adds adaptive combat, actual cursor weapons, quiet activities, sleeping pickup,
and full item/prop hitboxes. Future expansions are in [UPDATE-PLAN.md](UPDATE-PLAN.md).

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
