// His drawings coming to life, Animator vs. Animation style. A ball he drew turns into a
// real ball (he kicks it around; you can grab and throw it). Boxes, ramps, ledges and bridges
// turn into real things with weight: they fall, tip over, stack, and you can drag them around.
// He can stand on them (their top edges are platforms, sloped when they tilt).
//
// Everything is the same Verlet physics as his body: points that remember where they were,
// and sticks that keep them a set distance apart. A box is 4 corners with cross-braces (so it
// stays square). A bridge is a chain of planks pinned at both ends, so it sags, and sags more
// under his weight. A ledge is "stuck into the wall behind it": pinned in place until something
// hits it hard or you pull on it, then it falls like anything else.
// (A drawn sword becomes an item; see items.ts.)

import { collide, collidePlatforms, integrate, makePoint, platY, solveSticks, type Bounds, type Platform, type Point, type Stick } from './physics';
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

/** What kind of solid thing it is. */
export type ThingKind = 'box' | 'ledge' | 'ramp' | 'bridge';

/**
 * A solid thing he drew (or you dropped in): points + sticks. `outline` lists the points around
 * its edge in order; the edges facing up are platforms. A bridge is different: each plank of the
 * chain is a platform.
 */
export class Thing {
  readonly n = nextProp++;
  readonly points: Point[] = [];
  readonly sticks: Stick[] = [];
  outline: number[] = [];
  /** Pinned in place ("stuck into the wall behind it"): ledges and bridge ends, until knocked or pulled loose. */
  stuck = false;
  /** Which points are the stuck ones (all of them for a ledge, the two ends for a bridge). */
  pins: number[] = [];
  /** You're holding it by one point. */
  held: { idx: number; x: number; y: number; vx: number; vy: number; from: Vec } | null = null;
  /** The drawing, in the thing's own frame (so it turns and moves with it). */
  private local: { x: number; y: number }[][] = [];
  /** Extra weight on points this step (him standing on it), px/s² per point. */
  load = new Map<number, number>();
  /** Where its top edges were last step (to tell platforms how far they rose). */
  private lastTop = new Map<number, number>();
  platforms: Platform[] = [];
  /** Made by you from his inventory (not a drawing: doesn't fade). */
  forever = false;

  constructor(readonly kind: ThingKind, readonly doodle: Doodle) {}

  point(x: number, y: number) { const p = makePoint(x, y, 1.5); this.points.push(p); return this.points.length - 1; }
  stick(a: number, b: number, slack = 1, stiff = 1) {
    const A = this.points[a], B = this.points[b];
    this.sticks.push({ a: A, b: B, len: Math.hypot(A.x - B.x, A.y - B.y) * slack, stiff });
  }

  /** Remember the drawing relative to the thing's frame (points 0 and 1 set its angle). */
  setDrawing(strokes: Vec[][]) {
    const f = this.frame();
    this.local = strokes.map((st) => st.map((q) => ({ x: (q.x - f.ox) * f.ux + (q.y - f.oy) * f.uy, y: -(q.x - f.ox) * f.uy + (q.y - f.oy) * f.ux })));
  }
  private frame() {
    const a = this.points[0], b = this.points[1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { ox: a.x, oy: a.y, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l };
  }

  pin(on: boolean) { for (const i of this.pins) this.points[i].invMass = on ? 0 : 1; this.stuck = on && this.pins.length > 0; }
  /** Knocked or pulled loose: now it's just a thing with weight. */
  unstick() { if (!this.stuck) return false; this.pin(false); return true; }

  /** The middle of it (average of its points). */
  get center(): Vec {
    let x = 0, y = 0;
    for (const p of this.points) { x += p.x; y += p.y; }
    return { x: x / this.points.length, y: y / this.points.length };
  }

  /** The main surface to stand on (the highest one). */
  get platform(): Platform { return this.platforms.reduce((a, b) => (Math.min(a.y, a.y2 ?? a.y) <= Math.min(b.y, b.y2 ?? b.y) ? a : b), this.platforms[0] ?? { id: -999, x1: 0, x2: 0, y: 1e9 }); }

  /** Is (x, y) on it (inside its outline, or close to a bridge)? */
  contains(x: number, y: number, pad = 4) {
    if (this.kind === 'bridge') {
      for (let i = 0; i + 1 < this.points.length; i++) {
        const a = this.points[i], b = this.points[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        if (Math.hypot(x - a.x - dx * u, y - a.y - dy * u) < pad + 4) return true;
      }
      return false;
    }
    // Point in polygon (even-odd), with a little padding at the edges.
    const o = this.outline.map((i) => this.points[i]);
    let inside = false;
    for (let i = 0, k = o.length - 1; i < o.length; k = i++) {
      const a = o[i], b = o[k];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return true;
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      if (Math.hypot(x - a.x - dx * u, y - a.y - dy * u) < pad) return true;
    }
    return false;
  }

  /** The point nearest (x, y). */
  nearest(x: number, y: number) {
    let best = 0, bd = Infinity;
    this.points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Shove it at (x, y) with this velocity (px/s): the nearest point gets it (that's how things spin). */
  hit(x: number, y: number, vx: number, vy: number) {
    const p = this.points[this.nearest(x, y)];
    if (p.invMass === 0) return;
    p.px = p.x - vx / 120; p.py = p.y - vy / 120;
  }

  grab(x: number, y: number) {
    const idx = this.nearest(x, y);
    this.held = { idx, x, y, vx: 0, vy: 0, from: { x, y } };
  }
  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const p = this.points[h.idx];
    if (!this.stuck || !this.pins.includes(h.idx)) { p.invMass = 1; p.px = p.x - Math.max(-2500, Math.min(2500, h.vx)) / 120; p.py = p.y - Math.max(-2500, Math.min(2500, h.vy)) / 120; }
  }

  private above: [Point, Platform][] = [];

  /** Start a physics step: weight, gravity and momentum, your hand, and which surfaces it's above. */
  begin(dt: number, others: Platform[]) {
    const pts = this.points;
    // Pulled far enough, a stuck thing pops loose.
    const h = this.held;
    if (h && this.stuck && Math.hypot(h.x - h.from.x, h.y - h.from.y) > 28) this.unstick();
    // His weight on whatever he's standing on.
    for (const [i, g] of this.load) { const p = pts[i]; if (p.invMass) p.y += g * dt * dt; }
    this.load.clear();
    integrate(pts, dt, 0.998);
    if (h) {
      const p = pts[h.idx];
      if (!this.stuck || !this.pins.includes(h.idx)) { p.invMass = 0; p.px = p.x; p.py = p.y; p.x = h.x; p.y = h.y; }
    }
    for (const p of pts) p.grounded = false;
    // One-way surfaces (window tops, other things' tops): a point can only land on one it started
    // this step above. Worked out once up front, because the passes move the points around.
    this.above = [];
    for (const p of pts) {
      if (p.invMass === 0) continue;
      for (const pl of others) if (p.px >= pl.x1 - 3 && p.px <= pl.x2 + 3 && p.py <= platY(pl, p.px) - p.r + 0.5 + (pl.lift ?? 0)) this.above.push([p, pl]);
    }
  }

  /** One pass of keeping its shape and keeping it out of the floor and off surfaces. */
  pass(bounds: Bounds) {
    solveSticks(this.sticks);
    collide(this.points, bounds, 0.6, 0.15);
    for (const [p, pl] of this.above) {
      if (p.x < pl.x1 || p.x > pl.x2) continue;
      const top = platY(pl, p.x) - p.r;
      if (p.y <= top) continue;
      p.y = top;
      p.px += (p.x - p.px) * 0.6; // friction
      p.grounded = true;
    }
  }

  /** Finish the step: what landed stops falling; work out its platforms. */
  end() {
    for (const [p] of this.above) if (p.grounded && p.py > p.y) p.py = p.y;
    this.refresh();
  }

  /** Recompute its platforms from where its points are now. */
  refresh() {
    const out: Platform[] = [];
    const base = PROP_ID + this.n * 64;
    const edge = (a: Point, b: Point, k: number) => {
      // Only edges that face up (not too steep) are something to stand on.
      const l = a.x <= b.x ? a : b, r = a.x <= b.x ? b : a;
      const w = r.x - l.x, slope = Math.abs(r.y - l.y) / (w || 1e-6);
      if (w < 6 || slope > 1.1) return;
      const id = base + k;
      const p: Platform = { id, x1: l.x, x2: r.x, y: l.y, y2: Math.abs(r.y - l.y) > 0.5 ? r.y : undefined };
      const was = this.lastTop.get(id), top = Math.min(p.y, p.y2 ?? p.y);
      p.lift = was !== undefined ? Math.max(0, was - top) : 0;
      this.lastTop.set(id, top);
      out.push(p);
    };
    if (this.kind === 'bridge') {
      for (let i = 0; i + 1 < this.points.length; i++) edge(this.points[i], this.points[i + 1], i);
    } else {
      const o = this.outline;
      for (let i = 0; i < o.length; i++) {
        const a = this.points[o[i]], b = this.points[o[(i + 1) % o.length]];
        // The outline goes clockwise on screen, so an edge going right (a.x < b.x) is a top edge.
        if (b.x > a.x) edge(a, b, i);
      }
    }
    this.platforms = out;
  }

  /** Him standing on platform `id` at x: his weight pushes down on the ends of that edge. */
  carry(id: number, x: number, weight = 2600) {
    const k = id - (PROP_ID + this.n * 64);
    const pair = this.kind === 'bridge' ? [k, k + 1] : [this.outline[k], this.outline[(k + 1) % this.outline.length]];
    const a = this.points[pair[0]], b = this.points[pair[1]];
    if (!a || !b) return;
    const u = Math.max(0, Math.min(1, (x - a.x) / ((b.x - a.x) || 1e-6)));
    this.load.set(pair[0], (this.load.get(pair[0]) ?? 0) + weight * (1 - u));
    this.load.set(pair[1], (this.load.get(pair[1]) ?? 0) + weight * u);
  }

  /** Is it moving? (Platforms need updating every step while it is.) */
  get moving() { return this.points.some((p) => Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 0.02) || this.held !== null; }

  draw(ctx: CanvasRenderingContext2D, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.doodle.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.kind === 'bridge') {
      // The chain itself: a rope line, with a plank across every link.
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      this.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.lineWidth = 4;
      for (let i = 0; i + 1 < this.points.length; i++) {
        const a = this.points[i], b = this.points[i + 1];
        ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * 0.15, a.y + (b.y - a.y) * 0.15); ctx.lineTo(a.x + (b.x - a.x) * 0.85, a.y + (b.y - a.y) * 0.85); ctx.stroke();
      }
      // Stuck ends: little nails into the wall behind.
      if (this.stuck) for (const i of this.pins) { const p = this.points[i]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.stroke(); }
    } else {
      ctx.lineWidth = 3;
      const f = this.frame();
      for (const st of this.local) {
        ctx.beginPath();
        st.forEach((q, i) => {
          const x = f.ox + q.x * f.ux - q.y * f.uy, y = f.oy + q.x * f.uy + q.y * f.ux;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      if (this.stuck) for (const i of this.pins.slice(0, 2)) { const p = this.points[i]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
  }
}

/** A box: 4 corners (top-left, top-right, bottom-right, bottom-left) with cross-braces so it stays square. */
export function makeBox(d: Doodle, x1: number, y1: number, x2: number, y2: number, stuck = false) {
  const t = new Thing(stuck ? 'ledge' : 'box', d);
  t.point(x1, y1); t.point(x2, y1); t.point(x2, y2); t.point(x1, y2);
  t.outline = [0, 1, 2, 3];
  t.stick(0, 1); t.stick(1, 2); t.stick(2, 3); t.stick(3, 0); t.stick(0, 2); t.stick(1, 3);
  if (stuck) { t.pins = [0, 1, 2, 3]; t.pin(true); }
  t.refresh();
  return t;
}

/**
 * A ramp: a wedge sitting on the ground, the slope going up toward `dir`.
 * Points: 0 = the low end of the slope, 1 = the top of the slope, 2 = under the top.
 */
export function makeRamp(d: Doodle, xLow: number, xHigh: number, floor: number, top: number) {
  const t = new Thing('ramp', d);
  const right = xHigh > xLow;
  t.point(xLow, floor); t.point(xHigh, top); t.point(xHigh, floor);
  // Clockwise on screen: slope first when it goes up to the right, else the vertical side first.
  t.outline = right ? [0, 1, 2] : [2, 1, 0];
  t.stick(0, 1); t.stick(1, 2); t.stick(2, 0);
  t.refresh();
  return t;
}

/**
 * A bridge: a chain of planks from (x1, y1) to (x2, y2), both ends stuck. `slack` > 1 makes it
 * sag (1.04: a little; 1.25: hanging limp like a rope).
 */
export function makeBridge(d: Doodle, x1: number, y1: number, x2: number, y2: number, slack = 1.04) {
  const t = new Thing('bridge', d);
  const n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
  for (let i = 0; i <= n; i++) t.point(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
  for (let i = 0; i < n; i++) t.stick(i, i + 1, slack, 0.3); // a bit stretchy: it gives under him
  t.pins = [0, n]; t.pin(true);
  t.refresh();
  return t;
}

/** Compatibility with older code: a thing he can stand on, and its main platform. */
export interface Block { doodle: Doodle; platform: Platform; thing: Thing }

export class Props {
  balls: Ball[] = [];
  things: Thing[] = [];
  /** Called when platforms change (appear, vanish, or move): the world's platforms need updating. */
  onPlatforms: (() => void) | null = null;

  /** A finished drawing comes to life. */
  bringToLife(d: Doodle, kind: 'ball' | 'box' | 'platform' | 'ramp' | 'bridge', bounds: Bounds) {
    const size = d.size ?? 46, cx = d.cx ?? 0, cy = d.cy ?? 0;
    d.alive = true;
    if (kind === 'ball') {
      const b = new Ball(d, cx, cy, size * 0.45);
      this.balls.push(b);
      if (this.balls.length > 4) this.balls.shift();
      return b;
    }
    let t: Thing;
    if (kind === 'box') t = makeBox(d, cx - size * 0.45, cy - size * 0.45, cx + size * 0.45, cy + size * 0.45);
    else if (kind === 'platform') t = makeBox(d, Math.max(bounds.left, cx - size * 0.5), cy - size * 0.05, Math.min(bounds.right, cx + size * 0.5), cy + size * 0.06, true);
    else if (kind === 'ramp') {
      // The ramp shape: base along the bottom of the box, slope up to the right (or the way it was drawn).
      const dir = d.dir ?? 1, x0 = cx - dir * size * 0.5, x1 = cx + dir * size * 0.5;
      t = makeRamp(d, x0, x1, cy + size * 0.45, cy - size * 0.2);
    } else t = makeBridge(d, cx - size * 0.5, cy, cx + size * 0.5, cy, 1.12);
    if (kind !== 'bridge') t.setDrawing(d.shape?.map((st) => st.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size }))) ?? []);
    this.add(t);
    return t.platform;
  }

  add(t: Thing) {
    this.things.push(t);
    const drawn = this.things.filter((x) => !x.forever);
    if (drawn.length > 8) this.things.splice(this.things.indexOf(drawn[0]), 1);
    this.onPlatforms?.();
  }

  remove(t: Thing) { this.things = this.things.filter((x) => x !== t); this.onPlatforms?.(); }

  get platforms() { return this.things.flatMap((t) => t.platforms); }
  /** Things he can get on top of (for "get on what he drew"). */
  get blocks(): Block[] { return this.things.filter((t) => t.platforms.length).map((t) => ({ doodle: t.doodle, platform: t.platform, thing: t })); }

  /** The thing (if any) a platform id belongs to. */
  thingOf(id: number) { return id >= PROP_ID ? this.things.find((t) => Math.floor((id - PROP_ID) / 64) === t.n) ?? null : null; }

  /**
   * One physics step for everything. `world` = window tops (things land on them, and on each other).
   * Returns true if any platform moved (so his ground gets updated).
   */
  update(dt: number, now: number, bounds: Bounds, world: Platform[]) {
    const before = this.things.length;
    this.things = this.things.filter((t) => t.forever || now - t.doodle.born < DOODLE_LIFE);
    this.balls = this.balls.filter((b) => now - b.doodle.born < DOODLE_LIFE);
    const moved = this.things.length !== before || this.things.length > 0;
    // Everything steps every time: there are only ever a few, and a thing resting on a window
    // has to notice when the window moves out from under it. All of them are solved together,
    // so things resting on things settle properly.
    // Window tops and the tops of other things are one-way surfaces: things land on them from above.
    for (const t of this.things) t.begin(dt, [...world, ...this.things.filter((o) => o !== t).flatMap((o) => o.platforms)]);
    for (let i = 0; i < 6; i++) {
      for (const t of this.things) t.pass(bounds);
      this.restOnEachOther();
    }
    for (const t of this.things) t.end();
    const all = [...world, ...this.platforms];
    for (const b of this.balls) b.step(dt, bounds, all);
    if (moved) this.onPlatforms?.();
    return moved;
  }

  /**
   * Things resting on things: each thing's points land on the others' top edges (in `step`); this
   * is the other way round: the corners of a thing below hold up the bottom edges of a thing above,
   * so a box resting with one corner over the edge doesn't just tip off.
   */
  private restOnEachOther() {
    for (const up of this.things) {
      if (up.kind === 'bridge') continue;
      const o = up.outline;
      for (let e = 0; e < o.length; e++) {
        const p = up.points[o[e]], q = up.points[o[(e + 1) % o.length]];
        if (q.x >= p.x - 1) continue; // bottom edges go right-to-left (the outline is clockwise)
        for (const low of this.things) {
          if (low === up || low.kind === 'bridge') continue;
          for (const c of low.points) {
            if (c.x <= q.x + 0.5 || c.x >= p.x - 0.5) continue;
            const u = (c.x - q.x) / (p.x - q.x), y = q.y + (p.y - q.y) * u, dig = y - c.y;
            const was = q.py + (p.py - q.py) * u - c.py;
            if (dig <= 0 || was > 0.5) continue; // not touching, or it didn't come from above
            const wq = q.invMass * (1 - u), wp = p.invMass * u, w = wq + wp;
            if (w <= 0) continue;
            q.y -= dig * (wq / w); p.y -= dig * (wp / w);
            if (q.py > q.y) q.py = q.y;
            if (p.py > p.y) p.py = p.y;
            // Friction: resting on it, it doesn't slide around.
            const fx = 0.5;
            q.px += (q.x - q.px) * fx; p.px += (p.x - p.px) * fx;
          }
        }
      }
    }
  }

  ballAt(x: number, y: number, pad = 4) { return this.balls.find((b) => Math.hypot(b.x - x, b.y - y) < b.r + pad) ?? null; }
  /** The drawn thing under (x, y), front-most (newest) first. */
  thingAt(x: number, y: number) { for (let i = this.things.length - 1; i >= 0; i--) if (this.things[i].contains(x, y)) return this.things[i]; return null; }

  /** The ball nearest to x (and on about the same level as y). */
  nearestBall(x: number, y: number) {
    let best: Ball | null = null, bd = Infinity;
    for (const b of this.balls) { const d = Math.abs(b.x - x) + Math.abs(b.y - y) * 0.5; if (d < bd) { bd = d; best = b; } }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    for (const t of this.things) t.draw(ctx, t.forever ? 1 : Math.max(0, Math.min(1, (DOODLE_LIFE - (now - t.doodle.born)) / 10)));
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

export { platY };
