// Verlet physics. Every joint is a point that remembers where it was last step;
// its velocity is simply (now - before). Bones are "sticks" that keep two points
// a fixed distance apart. This is the classic, very stable way to do ragdolls.
//
// It's 3D: every point has a depth (z, positive = toward you). He lives in a thin
// band of depth just in front of your screen, so he can spin, flip and tumble
// for real, but never wanders off into the distance.

export interface Point {
  x: number; y: number; z: number;    // position now
  px: number; py: number; pz: number; // position last step
  r: number;              // collision radius
  invMass: number;        // 1 = normal, 0 = pinned (e.g. held by the mouse)
  grounded: boolean;      // touching the floor or a platform this step
  on: number;             // what it's touching: a platform id, FLOOR, or NONE
}

export const FLOOR = -1, NONE = -2;

/** A surface he can stand on: the visible part of a window's top edge. One-way (you can jump up through it). */
export interface Platform {
  id: number; x1: number; x2: number; y: number;
  win?: number; // which window this edge belongs to
  wx?: number;  // that window's left x (to tell real moves from parts getting covered)
}

/** A bone. `minOnly`: only keeps the ends from getting too close. `off`: broken (a limb came off). */
export interface Stick { a: Point; b: Point; len: number; minOnly?: boolean; off?: boolean }

/**
 * The space he lives in. In milestone 3 window tops became extra floors.
 * `depth`: how far in front of / behind the middle of his depth band he can go (z).
 */
export interface Bounds { left: number; right: number; top: number; floor: number; depth?: number }

export const GRAVITY = 2000; // pixels / second²
/** Default half-thickness of his depth band, in pixels. */
export const DEPTH = 48;

export function makePoint(x: number, y: number, r = 2, z = 0): Point {
  return { x, y, z, px: x, py: y, pz: z, r, invMass: 1, grounded: false, on: NONE };
}

export function integrate(points: Point[], dt: number, airDrag = 0.9995) {
  const g = GRAVITY * dt * dt;
  for (const p of points) {
    if (p.invMass === 0) continue;
    const vx = (p.x - p.px) * airDrag;
    const vy = (p.y - p.py) * airDrag;
    const vz = (p.z - p.pz) * airDrag;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.x += vx; p.y += vy + g; p.z += vz;
  }
}

export function solveSticks(sticks: Stick[]) {
  for (const s of sticks) {
    if (s.off) continue;
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, dz = s.b.z - s.a.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    if (s.minOnly && d >= s.len) continue;
    const w = s.a.invMass + s.b.invMass;
    if (w === 0) continue;
    const diff = (d - s.len) / d / w;
    s.a.x += dx * diff * s.a.invMass; s.a.y += dy * diff * s.a.invMass; s.a.z += dz * diff * s.a.invMass;
    s.b.x -= dx * diff * s.b.invMass; s.b.y -= dy * diff * s.b.invMass; s.b.z -= dz * diff * s.b.invMass;
  }
}

/** Keep points inside the bounds. Hitting a surface kills most velocity into it. */
export function collide(points: Point[], b: Bounds, friction = 0.25, bounce = 0.15) {
  const depth = b.depth ?? DEPTH;
  for (const p of points) {
    if (p.invMass === 0) continue;
    if (p.y + p.r >= b.floor) {
      const vy = p.y - p.py;
      p.y = b.floor - p.r;
      p.py = p.y + vy * bounce;
      p.px += (p.x - p.px) * friction; // floor friction slows sliding
      p.pz += (p.z - p.pz) * friction;
      p.grounded = true;
      p.on = FLOOR;
    }
    if (p.y - p.r < b.top) { const vy = p.y - p.py; p.y = b.top + p.r; p.py = p.y + vy * bounce; }
    if (p.x - p.r < b.left) { const vx = p.x - p.px; p.x = b.left + p.r; p.px = p.x + vx * bounce; }
    if (p.x + p.r > b.right) { const vx = p.x - p.px; p.x = b.right - p.r; p.px = p.x + vx * bounce; }
    // The front and back of his depth band: like invisible glass.
    if (p.z > depth) { const vz = p.z - p.pz; p.z = depth; p.pz = p.z + vz * bounce; }
    if (p.z < -depth) { const vz = p.z - p.pz; p.z = -depth; p.pz = p.z + vz * bounce; }
  }
}

/**
 * Window tops. A point lands on one only if it was above the edge last step and
 * is coming down through it now, so he can jump up through a window from below
 * and land on top — like a platformer.
 */
export function collidePlatforms(points: Point[], platforms: Platform[], friction = 0.25, bounce = 0.1) {
  if (!platforms.length) return;
  for (const p of points) {
    if (p.invMass === 0) continue;
    for (const pl of platforms) {
      if (p.x < pl.x1 || p.x > pl.x2) continue;
      const top = pl.y - p.r;
      if (p.py <= top + 0.5 && p.y > top) {
        const vy = p.y - p.py;
        p.y = top;
        p.py = p.y + vy * bounce;
        p.px += (p.x - p.px) * friction;
        p.pz += (p.z - p.pz) * friction;
        p.grounded = true;
        p.on = pl.id;
      }
    }
  }
}
