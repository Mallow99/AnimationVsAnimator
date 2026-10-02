// His drawings coming to life, Animator vs. Animation style: a ball he drew turns into a
// real ball (he kicks it around; you can grab and throw it), a box or a ledge turns into
// something he can stand on and vault over. They last as long as a doodle does, then fade.
// (A drawn sword becomes an item; see items.ts.)

import { collide, collidePlatforms, integrate, makePoint, type Bounds, type Platform, type Point } from './physics';
import { DOODLE_LIFE, type Doodle } from './doodles';
import type { Vec } from './math';

/** Platform ids for drawn things start here, far from any window's. */
const PROP_ID = 1_000_000_000;
let nextProp = 0;

export class Ball {
  readonly p: Point;
  angle = 0;
  heldBy: 'user' | null = null;
  private hold = { x: 0, y: 0, vx: 0, vy: 0 };
  constructor(readonly doodle: Doodle, x: number, y: number, readonly r: number) { this.p = makePoint(x, y, r); }
  get x() { return this.p.x; }
  get y() { return this.p.y; }
  get vx() { return (this.p.x - this.p.px) * 120; }
  get vy() { return (this.p.y - this.p.py) * 120; }
  /** Give it a kick (px/s). */
  kick(vx: number, vy: number) { this.p.px = this.p.x - vx / 120; this.p.py = this.p.y - vy / 120; }
  grab(x: number, y: number) { this.heldBy = 'user'; this.hold = { x, y, vx: 0, vy: 0 }; }
  moveHold(x: number, y: number, vx: number, vy: number) { this.hold = { x, y, vx, vy }; }
  release() { if (this.heldBy) { this.heldBy = null; this.kick(Math.max(-2500, Math.min(2500, this.hold.vx)), Math.max(-2500, Math.min(2500, this.hold.vy))); } }

  /** One physics step (1/120 s). Bouncy, and it rolls: its spin follows how far it travels. */
  step(dt: number, bounds: Bounds, platforms: Platform[]) {
    const p = this.p;
    if (this.heldBy) { p.px = p.x; p.py = p.y; p.x = this.hold.x; p.y = this.hold.y; return; }
    const x0 = p.x;
    integrate([p], dt, 0.999);
    p.grounded = false;
    collide([p], bounds, 0.01, 0.62);
    collidePlatforms([p], platforms, 0.01, 0.55);
    if (p.grounded) p.px += (p.x - p.px) * 0.004; // rolling resistance
    this.angle += (p.x - x0) / this.r;
  }
}

/** A box or a ledge he drew: the top is a platform. */
export interface Block { doodle: Doodle; platform: Platform }

export class Props {
  balls: Ball[] = [];
  blocks: Block[] = [];
  /** Called when blocks appear or vanish (the world's platforms need updating). */
  onPlatforms: (() => void) | null = null;

  /** A finished drawing comes to life. */
  bringToLife(d: Doodle, kind: 'ball' | 'box' | 'platform', bounds: Bounds) {
    const size = d.size ?? 46, cx = d.cx ?? 0, cy = d.cy ?? 0;
    d.alive = true;
    if (kind === 'ball') {
      const b = new Ball(d, cx, cy, size * 0.45);
      this.balls.push(b);
      if (this.balls.length > 4) this.balls.shift();
      return b;
    }
    // Box: its top is where it was drawn. Ledge: the plank's top.
    const top = kind === 'box' ? cy - size * 0.45 : cy - size * 0.05;
    const half = (kind === 'box' ? 0.45 : 0.5) * size;
    const platform: Platform = { id: PROP_ID + nextProp++, x1: Math.max(bounds.left, cx - half), x2: Math.min(bounds.right, cx + half), y: top };
    d.alive = false; // boxes and ledges stay where they were drawn: the doodle itself shows them
    this.blocks.push({ doodle: d, platform });
    if (this.blocks.length > 6) this.blocks.shift();
    this.onPlatforms?.();
    return platform;
  }

  get platforms() { return this.blocks.map((b) => b.platform); }

  update(dt: number, now: number, bounds: Bounds, platforms: Platform[]) {
    const before = this.blocks.length;
    this.blocks = this.blocks.filter((b) => now - b.doodle.born < DOODLE_LIFE);
    this.balls = this.balls.filter((b) => now - b.doodle.born < DOODLE_LIFE);
    if (this.blocks.length !== before) this.onPlatforms?.();
    for (const b of this.balls) b.step(dt, bounds, platforms);
  }

  ballAt(x: number, y: number, pad = 4) { return this.balls.find((b) => Math.hypot(b.x - x, b.y - y) < b.r + pad) ?? null; }

  /** The ball nearest to x (and on about the same level as y). */
  nearestBall(x: number, y: number) {
    let best: Ball | null = null, bd = Infinity;
    for (const b of this.balls) { const d = Math.abs(b.x - x) + Math.abs(b.y - y) * 0.5; if (d < bd) { bd = d; best = b; } }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    for (const b of this.balls) {
      const d = b.doodle, size = d.size ?? 46;
      ctx.globalAlpha = Math.max(0, Math.min(1, (DOODLE_LIFE - (now - d.born)) / 10));
      ctx.strokeStyle = d.color;
      const c = Math.cos(b.angle), s = Math.sin(b.angle);
      for (const st of d.shape ?? []) {
        ctx.beginPath();
        st.forEach((q: Vec, i) => {
          const x = b.x + (q.x * c - q.y * s) * size, y = b.y + (q.x * s + q.y * c) * size;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
