// A limb that came off: three points (the torn end, the elbow or knee, the hand or foot)
// joined by two bones. It flops around with the same physics as his body, can be
// picked up (by you or by him), and snaps back on when it's held to the stump.

import { collide, collidePlatforms, integrate, makePoint, solveSticks, type Bounds, type Platform, type Point, type Stick } from './physics';
import type { LimbId } from './body';

export class LooseLimb {
  readonly points: [Point, Point, Point];
  readonly sticks: Stick[];
  /** Who's holding it: you (with the cursor), him (in a hand), or nobody. */
  heldBy: 'user' | 'him' | null = null;
  /** Seconds since it came off. */
  age = 0;
  /** Fading away (he grew a new one). 1 = solid … 0 = gone. */
  fade = 1;
  fading = false;

  constructor(readonly limb: LimbId, from: [Point, Point, Point], lens: [number, number]) {
    this.points = from.map((p) => {
      const q = makePoint(p.x, p.y, 2, p.z);
      q.px = p.px; q.py = p.py; q.pz = p.pz;
      return q;
    }) as [Point, Point, Point];
    const [a, b, c] = this.points;
    this.sticks = [
      { a, b, len: lens[0] }, { a: b, b: c, len: lens[1] },
      { a, b: c, len: (lens[0] + lens[1]) * 0.3, minOnly: true },
    ];
  }

  /** The torn end (what goes back onto the shoulder or hip). */
  get root() { return this.points[0]; }
  get isArm() { return this.limb === 'armL' || this.limb === 'armR'; }

  step(dt: number, bounds: Bounds, platforms: Platform[]) {
    this.age += dt;
    if (this.fading) this.fade = Math.max(0, this.fade - dt / 0.8);
    integrate(this.points, dt);
    for (const p of this.points) { p.grounded = false; }
    for (let i = 0; i < 6; i++) {
      solveSticks(this.sticks);
      collide(this.points, bounds, 0.45, 0.25);
      collidePlatforms(this.points, platforms, 0.45, 0.2);
    }
  }

  /** Distance from (x, y) to the limb on screen (for clicking on it). */
  distTo(x: number, y: number) {
    let best = Infinity;
    for (const s of this.sticks.slice(0, 2)) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2));
      best = Math.min(best, Math.hypot(x - (s.a.x + dx * t), y - (s.a.y + dy * t)));
    }
    return best;
  }

  /** Which of its points is nearest (x, y). */
  nearest(x: number, y: number) {
    let bi = 0, bd = Infinity;
    this.points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }
}
