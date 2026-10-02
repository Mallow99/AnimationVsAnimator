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

// ───────────── 3D ─────────────
// His world is your screen plus a thin band of depth: x right, y down (like the screen),
// z toward you (out of the screen). Drawing ignores z except to decide what's in front.

export interface V3 { x: number; y: number; z: number }

export const v3 = (x: number, y: number, z = 0): V3 => ({ x, y, z });
export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const dist3 = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
export const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const cross3 = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export function norm3(a: V3): V3 { const l = len3(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }

/**
 * Two-bone IK in 3D. Like `twoBoneIK`, but the middle joint (knee/elbow) bends toward
 * `pole`, a direction: knees toward where he faces, elbows backward and out. The joint
 * ends up in the plane that holds the root, the target and the pole.
 */
export function twoBoneIK3(a: V3, t: V3, l1: number, l2: number, pole: V3): V3 {
  const raw = sub3(t, a), d0 = len3(raw);
  const dir = d0 > 1e-6 ? scale3(raw, 1 / d0) : { x: 0, y: 1, z: 0 };
  const d = clamp(d0, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  // The part of the pole that's sideways to the bone line: that's the way the joint pokes out.
  let side = sub3(pole, scale3(dir, dot3(pole, dir)));
  if (len3(side) < 1e-4) side = Math.abs(dir.y) < 0.9 ? sub3({ x: 0, y: 1, z: 0 }, scale3(dir, dir.y)) : sub3({ x: 1, y: 0, z: 0 }, scale3(dir, dir.x));
  side = norm3(side);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  return { x: a.x + (dir.x * cosA + side.x * sinA) * l1, y: a.y + (dir.y * cosA + side.y * sinA) * l1, z: a.z + (dir.z * cosA + side.z * sinA) * l1 };
}

/**
 * His body's own directions for a body angle: `fwd` = where he faces, `left` = his left side,
 * `up` = up. With pitch (tipping forward, as in a front flip) and roll (tipping toward his
 * left, as in a cartwheel) the whole frame tilts too.
 */
export interface Basis { fwd: V3; up: V3; left: V3 }
export function basis(yaw: number, pitch = 0, roll = 0): Basis {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let fwd: V3 = { x: c, y: 0, z: s }, up: V3 = { x: 0, y: -1, z: 0 }, left: V3 = { x: s, y: 0, z: -c };
  if (pitch) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    [fwd, up] = [sub3(scale3(fwd, cp), scale3(up, sp)), add3(scale3(up, cp), scale3(fwd, sp))];
  }
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    [up, left] = [add3(scale3(up, cr), scale3(left, sr)), sub3(scale3(left, cr), scale3(up, sr))];
  }
  return { fwd, up, left };
}

/** A point given in his own directions (forward, up, left) from an origin, in the world. */
export const inFrame = (o: V3, b: Basis, f: number, u: number, l = 0): V3 => ({
  x: o.x + b.fwd.x * f + b.up.x * u + b.left.x * l,
  y: o.y + b.fwd.y * f + b.up.y * u + b.left.y * l,
  z: o.z + b.fwd.z * f + b.up.z * u + b.left.z * l,
});
