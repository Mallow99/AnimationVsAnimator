// Small math helpers shared across the core.

export interface Vec { x: number; y: number }

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sign = (v: number) => (v < 0 ? -1 : 1);
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Distance from point p to the segment a-b. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

/**
 * Two-bone inverse kinematics ("IK"): given a root (hip/shoulder), a target
 * (foot/hand) and the two bone lengths, find where the middle joint (knee/elbow)
 * must go. `bend` (+1 / -1) picks which side the joint bends toward.
 */
export function twoBoneIK(ax: number, ay: number, tx: number, ty: number, l1: number, l2: number, bend: number): Vec {
  const d = clamp(dist(ax, ay, tx, ty), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(ty - ay, tx - ax);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = base + bend * a;
  return { x: ax + Math.cos(ang) * l1, y: ay + Math.sin(ang) * l1 };
}
