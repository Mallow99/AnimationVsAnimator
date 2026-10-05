import type { Item, ItemDef } from '../items';
import type { Vec } from '../math';

/** Plain-data weapon location, also sent across the peer boundary. */
export interface LooseWeapon {
  owner: string;
  uid: number;
  def: ItemDef;
  at: Vec;
  speed: number;
  ammo: number;
}

export const isWeapon = (d: ItemDef) =>
  ['swing', 'smash', 'gun', 'shoot'].includes(d.use);
export const isRanged = (d: ItemDef) => d.use === 'gun' || d.use === 'shoot';

/** Prefer effective weapons, but use the bow or a practice blade when that's what is available. */
export function weaponValue(d: ItemDef, real: boolean, distance: number) {
  if (!isWeapon(d)) return -Infinity;
  if (d.use === 'gun') return distance > 100 ? 12 : 5;
  if (d.cuts && real) return 11;
  if (d.use === 'shoot') return distance > 180 ? 7 : 1;
  return 3 + d.hit + (d.use === 'smash' ? 1 : 0);
}

export function carriedWeapon(
  items: Item[],
  real: boolean,
  distance: number,
): Item | null {
  return (
    items
      .filter((it) => ['hand', 'belt'].includes(it.where) && isWeapon(it.def))
      .sort(
        (a, b) =>
          weaponValue(b.def, real, distance) -
          weaponValue(a.def, real, distance),
      )[0] ?? null
  );
}

/** Recovery favors the closest reachable tool; never run through the opponent for a better one. */
export function nearestWeapon(
  weapons: LooseWeapon[],
  x: number,
  floor: number,
  foeX: number,
  scale: number,
) {
  return (
    weapons
      .filter(
        (w) =>
          isWeapon(w.def) &&
          w.speed < 500 &&
          Math.abs(w.at.y - floor) < 70 * scale &&
          Math.abs(w.at.x - x) < 420 * scale &&
          !(
            (w.at.x - x) * (foeX - x) > 0 &&
            Math.abs(w.at.x - x) > Math.abs(foeX - x) - 24 * scale
          ),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.at.x - x, a.at.y - floor) -
          Math.hypot(b.at.x - x, b.at.y - floor),
      )[0] ?? null
  );
}
