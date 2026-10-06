import { convexHull, paddedVertices, polygonDistance, overlapOffset } from './geometry';
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
import chairDef from './props/chair.json';
import couchDef from './props/couch.json';
import bookshelfDef from './props/bookshelf.json';
import tvDef from './props/tv.json';
import scooterDef from './props/scooter.json';
import canvasDef from './props/canvas.json';
import deskDef from './props/desk.json';
import workbenchDef from './props/workbench.json';
import storageDef from './props/storage.json';
import { propActions, PROP_ACTIONS, type PropAction } from './capabilities';
import { Pong, paintPong } from './pong';
import { parseProject, type InkProject } from './crafting-state';
import type { WinRect } from './world';
import { drawSprite, parseSprite, type PixelSprite } from './pixel-art';
import { PixelLayer, DEFAULT_LOOK, type Ctx2D } from './render';
import type { Disc } from './board-game';
import { BLOCK_W, PLAYER_W, Runner } from './tv-game';

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
  step(
    dt: number,
    bounds: Bounds,
    platforms: Platform[],
    solids: Thing[] = [],
  ) {
    const p = this.p;
    if (this.heldBy) {
      p.px = p.x;
      p.py = p.y;
      p.x = this.hold.x;
      p.y = this.hold.y;
      return;
    }
    const x0 = p.x;
    integrate([p], dt, 0.999);
    p.grounded = false;
    collide([p], bounds, 0.01, 0.62);
    collidePlatforms([p], platforms, 0.01, 0.55);
    for (const solid of solids) {
      if (!solid.rigid) continue;
      const radius = this.r / Math.cos(Math.PI / 16);
      const circle = Array.from({ length: 16 }, (_, i) => ({
        x: p.x + radius * Math.cos((i * Math.PI) / 8),
        y: p.y + radius * Math.sin((i * Math.PI) / 8),
      }));
      const offset = overlapOffset(circle, solid.collisionHull);
      if (!offset) continue;
      const len = Math.hypot(offset.x, offset.y),
        nx = offset.x / len,
        ny = offset.y / len;
      const into = (p.x - p.px) * nx + (p.y - p.py) * ny;
      p.x += offset.x;
      p.y += offset.y;
      p.px += offset.x;
      p.py += offset.y;
      if (into < 0) {
        p.px += nx * into * 1.55;
        p.py += ny * into * 1.55;
      }
    }
    if (p.grounded) p.px += (p.x - p.px) * 0.004; // rolling resistance
    this.angle += (p.x - x0) / this.r;
  }
}

/** What kind of solid thing it is. */
export type ThingKind = 'box' | 'ledge' | 'ramp' | 'bridge' | 'prop';

/**
 * A prop: furniture and toys you drop in from his inventory (a chair, a couch, a TV, a scooter),
 * from a definition file like items have. Sizes in px at his normal size; y down, (0, 0) = top-left.
 */
export interface PropDef {
  id: string; name: string; about: string;
  /** What he does with it: sit on it, watch it, ride it, or just stand on it. */
  use: 'seat' | 'tv' | 'ride' | 'canvas' | 'work' | 'storage' | 'none';
  /** Its solid shape: points around its edge, clockwise on screen. Edges facing up are things to stand on. */
  outline: [number, number][];
  actions?: PropAction[];
  seats?: number;
  drawable?: boolean;
  refinable?: boolean;
  movable?: boolean;
  move?: 'carry' | 'drag' | 'push';
  /** Where his bottom goes when he sits on it. */
  seat?: [number, number];
  /** The TV screen: x, y, width, height. */
  screen?: [number, number, number, number];
  /** Which outline points are wheels (they roll), how big, and where he holds on. */
  wheels?: number[]; wheel?: number; bar?: [number, number];
  /** How grippy it is on the floor (0.6 = stays put, 0.01 = rolls). */
  friction: number;
  shape: PropShape[];
  sprite?: PixelSprite;
  /** Everything it draws fits in this box (x1, y1, x2, y2), in its own coordinates. */
  bounds?: [number, number, number, number];
}

/**
 * One piece of a prop's drawing: a line through `pts` (`color`, `width`), or a flat filled shape:
 * a polygon (`pts` + `fill`) or a rounded box (`rect` [x, y, w, h] + `radius` + `fill`).
 * A filled piece can have an edge line too (`color` + `width`).
 */
export interface PropShape { pts: [number, number][]; color: string; width: number; fill?: string; rect?: [number, number, number, number]; radius?: number }

/** The box around its outline, screen and drawing (for painting it as pixel art). */
function shapeBounds(outline: [number, number][], shape: PropShape[], screen?: [number, number, number, number]): [number, number, number, number] {
  const xs: number[] = [], ys: number[] = [];
  const add = (x: number, y: number, pad = 0) => { xs.push(x - pad, x + pad); ys.push(y - pad, y + pad); };
  for (const [x, y] of outline) add(x, y);
  if (screen) { add(screen[0], screen[1]); add(screen[0] + screen[2], screen[1] + screen[3]); }
  for (const st of shape) {
    if (st.rect) { add(st.rect[0], st.rect[1], st.width); add(st.rect[0] + st.rect[2], st.rect[1] + st.rect[3], st.width); }
    for (const [x, y] of st.pts) add(x, y, st.width);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Saved canvas pictures are bounded just like custom item files. */
export function parseCanvasArt(raw: unknown): Thing['art'] {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.shape)) return null;
  const shape = o.shape.slice(0, 16).flatMap((stroke) => {
    if (!Array.isArray(stroke)) return [];
    const pts = stroke.slice(0, 80).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Math.max(-0.5, Math.min(0.5, p.x)), y: Math.max(-0.5, Math.min(0.5, p.y)) }));
    return pts.length >= 2 ? [pts] : [];
  });
  return shape.length ? { shape, color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#2a2c44', title: typeof o.title === 'string' ? o.title.slice(0, 40) : 'drawing' } : null;
}

/** Check a prop definition (from a file). Returns null if it's unusable. */
export function parsePropDef(raw: unknown): PropDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== 'prop') return null;
  const id = typeof o.id === 'string' ? o.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30) : '';
  const pt = (v: unknown): [number, number] | null => Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && Number.isFinite(v[0] + v[1])
    ? [Math.max(-200, Math.min(400, v[0])), Math.max(-200, Math.min(400, v[1]))] : null;
  const outline = (Array.isArray(o.outline) ? o.outline : []).slice(0, 12).map(pt).filter((p): p is [number, number] => !!p);
  if (!id || outline.length < 3) return null;
  const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#2a2c44');
  const shape = (Array.isArray(o.shape) ? o.shape : []).slice(0, 60).flatMap((st): PropShape[] => {
    const s = st as Record<string, unknown>;
    if (!s || typeof s !== 'object') return [];
    const pts = (Array.isArray(s.pts) ? s.pts : []).slice(0, 40).map(pt).filter((p): p is [number, number] => !!p);
    const rect = Array.isArray(s.rect) && s.rect.length === 4 && s.rect.every((v) => typeof v === 'number' && Number.isFinite(v)) && s.rect[2] > 0 && s.rect[3] > 0
      ? s.rect.map((v: number) => Math.max(-200, Math.min(400, v))) as [number, number, number, number] : undefined;
    const fill = typeof s.fill === 'string' && /^#[0-9a-f]{6}$/i.test(s.fill) ? s.fill : undefined;
    if (s.fill !== undefined && !fill) return []; // a fill it can't read: leave the piece out rather than guess
    // A filled piece only gets an edge line if it asks for one.
    const width = typeof s.width === 'number' && Number.isFinite(s.width) ? Math.max(0, Math.min(12, s.width)) : fill ? 0 : 3;
    const radius = typeof s.radius === 'number' && Number.isFinite(s.radius) ? Math.max(0, Math.min(30, s.radius)) : 0;
    if (rect) return fill || width ? [{ pts: [], rect, radius, fill, color: color(s.color), width }] : [];
    if (pts.length < (fill ? 3 : 2)) return [];
    return [{ pts, fill, color: color(s.color), width: fill ? width : Math.max(0.5, width) }];
  });
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const scr = Array.isArray(o.screen) && o.screen.length === 4 && o.screen.every(Number.isFinite) && o.screen[2] > 0 && o.screen[3] > 0
    ? o.screen.map((v) => Math.max(-200, Math.min(400, v))) as [number, number, number, number] : undefined;
  const sprite = parseSprite(o.sprite);
  return {
    id, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 30) : id,
    about: typeof o.about === 'string' ? o.about.slice(0, 160) : '',
    use: o.use === 'seat' || o.use === 'tv' || o.use === 'ride' || o.use === 'canvas' || o.use === 'work' || o.use === 'storage' ? o.use : 'none',
    actions: Array.isArray(o.actions) ? o.actions.filter((s): s is PropAction => PROP_ACTIONS.includes(s)).slice(0,8) : [],
    seats: Math.round(num(o.seats, id === 'couch' ? 5 : 1, 1, 5)),
    move: o.move === 'carry' || o.move === 'drag' || o.move === 'push' ? o.move : undefined,
    drawable: o.drawable !== false, refinable: o.refinable !== false, movable: o.movable !== false,
    outline, seat: pt(o.seat) ?? undefined, screen: scr, bar: pt(o.bar) ?? undefined,
    wheels: Array.isArray(o.wheels) ? o.wheels.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < outline.length) : undefined,
    wheel: num(o.wheel, 4, 1, 20), friction: num(o.friction, 0.6, 0, 1),
    sprite,
    shape: shape.length ? shape : sprite ? [] : [{ pts: [...outline, outline[0]], color: '#2a2c44', width: 3 }],
    bounds: shapeBounds(outline, shape, scr),
  };
}

/**
 * A solid thing he drew (or you dropped in): points + sticks. `outline` lists the points around
 * its edge in order; the edges facing up are platforms. A bridge is different: each plank of the
 * chain is a platform.
 */
export class Thing {
  readonly points: Point[] = [];
  readonly sticks: Stick[] = [];
  outline: number[] = [];
  /** Pinned in place ("stuck into the wall behind it"): ledges and bridge ends, until knocked or pulled loose. */
  stuck = false;
  /** Which points are the stuck ones (all of them for a ledge, the two ends for a bridge). */
  pins: number[] = [];
  private anchors = new Map<number, { win: number; dx: number; dy: number }>();

  /** A bridge end is attached to a window, rather than to a fixed screen position. */
  attachWindow(index: number, win: WinRect) {
    const p = this.points[index];
    if (p && this.pins.includes(index)) this.anchors.set(index, { win: win.id, dx: p.x - win.x, dy: p.y - win.y });
  }

  followWindows(wins: WinRect[]) {
    if (!this.stuck) { this.anchors.clear(); return; }
    for (const [i, a] of this.anchors) {
      const w = wins.find((w) => w.id === a.win), p = this.points[i];
      if (!w) {
        p.invMass = 1; this.anchors.delete(i); this.pins = this.pins.filter((n) => n !== i);
        if (!this.pins.length) this.stuck = false;
        continue;
      }
      p.x = p.px = w.x + a.dx; p.y = p.py = w.y + a.dy;
    }
    // Pulling the windows farther apart than the rope reaches tears it loose.
    if (this.kind === 'bridge' && this.pins.length === 2) {
      const [a, b] = this.pins.map((i) => this.points[i]);
      if (Math.hypot(a.x - b.x, a.y - b.y) > this.sticks.reduce((sum, s) => sum + s.len, 0) * 1.1) this.unstick();
    }
  }
  /**
   * You're holding it: where your cursor is, and where on the thing you grabbed it (`local`: in its own
   * rest shape, so you can pick it up from anywhere and it hangs from that spot). Bridges are held by a point.
   */
  held: { idx: number; x: number; y: number; vx: number; vy: number; from: Vec; local?: Vec } | null = null;
  /**
   * Its shape at rest (each point relative to the middle). Everything but a bridge is rigid: after each
   * physics pass it's snapped back to exactly this shape (moved and turned to fit where its points got to).
   * That's "shape matching": however hard it's shaken, what you see and what it bumps into stay the same.
   */
  private rest: Vec[] | null = null;
  private visualContour: Vec[] | null = null;
  get rigid() { return this.kind !== 'bridge'; }
  /** The drawing, in the thing's own frame (so it turns and moves with it). */
  private local: { x: number; y: number }[][] = [];
  /** Extra weight on points this step (him standing on it), px/s² per point. */
  load = new Map<number, number>();
  /** Where its top edges were last step (to tell platforms how far they rose). */
  private lastTop = new Map<number, number>();
  platforms: Platform[] = [];
  /** Made by you from his inventory (not a drawing: doesn't fade). */
  forever = false;
  ink?: InkProject;
  movingBy: string | null = null;
  facing: 1 | -1 = 1;
  /** For props: its definition, and the drawing with its own colors. */
  def: PropDef | null = null;
  private localColored: { pts: { x: number; y: number }[]; color: string; width: number }[] = [];
  /** How grippy it is on the floor. */
  friction = 0.6;
  /** A TV: switched on (he's watching). */
  on = false;
  channel = 0;
  /** A TV with its console on: what's on screen instead of a show (his own game, or the board you two are playing). */
  arcade: Runner | null = null;
  pong: Pong | null = null;
  consoleConnected = false;
  /** Two players: the second one's game (split screen), and who's playing (player one first). */
  arcade2: Runner | null = null;
  players: string[] = [];
  board: readonly Disc[] | null = null;
  art: { shape: Vec[][]; color: string; title: string } | null = null;
  /** Size it was made at (props scale with him). */
  scale = 1;

  constructor(readonly kind: ThingKind, readonly doodle: Doodle, readonly n = nextProp++) {}

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

  /** Turn a point in the prop's own coordinates (its definition file's, times its size) into screen coordinates. */
  toWorld(lx: number, ly: number): Vec {
    const f = this.frame(), o = this.def!.outline[0], x = (lx - o[0]) * this.scale, y = (ly - o[1]) * this.scale;
    return { x: f.ox + x * f.ux - y * f.uy, y: f.oy + x * f.uy + y * f.ux };
  }
  /** A conservative convex contour covers all visible art, including handles, wheels and antennae. */
  get collisionHull(): Vec[] {
    if (!this.def)
      return this.outline.map((i) => ({
        x: this.points[i].x,
        y: this.points[i].y,
      }));
    if (!this.visualContour) {
      const d = this.def,
        sprite = d.sprite;
      this.visualContour = convexHull([
        ...paddedVertices(d.outline),
        ...(d.wheels ?? []).flatMap((i) =>
          paddedVertices([d.outline[i]], (d.wheel ?? 4) * 2),
        ),
        ...d.shape.flatMap((st) =>
          paddedVertices(
            st.rect
              ? [
                  [st.rect[0], st.rect[1]],
                  [st.rect[0] + st.rect[2], st.rect[1]],
                  [st.rect[0] + st.rect[2], st.rect[1] + st.rect[3]],
                  [st.rect[0], st.rect[1] + st.rect[3]],
                ]
              : st.pts,
            st.width,
          ),
        ),
        ...(sprite
          ? paddedVertices([
              [sprite.x, sprite.y],
              [sprite.x + sprite.rows[0].length * sprite.pixel, sprite.y],
              [
                sprite.x + sprite.rows[0].length * sprite.pixel,
                sprite.y + sprite.rows.length * sprite.pixel,
              ],
              [sprite.x, sprite.y + sprite.rows.length * sprite.pixel],
            ])
          : []),
      ]);
    }
    return this.visualContour.map((p) => this.toWorld(p.x, p.y));
  }

  /** Where he sits, if it's a seat. */
  get seatAt(): Vec | null { return this.def?.seat ? this.toWorld(this.def.seat[0], this.def.seat[1]) : null; }

  /**
   * Who's sitting on it, and on which side (-1 left, 0 the middle, 1 right). A couch holds up to five side by side
   * (whoever was there first scoots over to make room); a chair holds one; someone lying along it takes it all.
   */
  storageKey = '';
  readonly sitters = new Map<string, { side: number; lying: boolean }>();
  /** Who's watching (a TV): it stays on while anyone is. */
  readonly watchers = new Set<string>();
  get seatRoom() { return this.def?.seats ?? 1; }
  /** Take a seat, coming from x. False if it's full. */
  claimSeat(who: string, fromX: number, lying = false): boolean {
    if (this.sitters.has(who)) return true;
    const others = [...this.sitters.values()];
    if (others.length >= this.seatRoom || (lying && others.length)) return false;
    // Someone lying along the couch sits up to make room.
    for (const [k, o] of this.sitters) if (o.lying) this.sitters.set(k, { ...o, lying: false });
    const old = [...this.sitters.entries()].sort((a, b) => a[1].side - b[1].side);
    if (fromX < (this.seatAt?.x ?? 0)) old.unshift([who, { side: 0, lying }]);
    else old.push([who, { side: 0, lying }]);
    this.sitters.clear();
    for (const [id, value] of old) this.sitters.set(id, value);
    this.reseat();
    return true;
  }
  private reseat() {
    const n = this.sitters.size;
    let i = 0;
    for (const [who, value] of this.sitters) this.sitters.set(who, { ...value, side: n < 2 ? 0 : (i++ / (n - 1) * 2 - 1) * (n > 2 ? 1.5 : 1) });
  }
  leaveSeat(who: string) { this.sitters.delete(who); this.reseat(); }
  /** Where this one sits (his side of the couch). */
  seatFor(who: string): Vec | null {
    const s = this.def?.seat;
    if (!s) return null;
    const side = this.sitters.get(who)?.side ?? 0, w = this.def!.bounds ? this.def!.bounds[2] - this.def!.bounds[0] : 0;
    return this.toWorld(s[0] + side * w * 0.215, s[1]);
  }
  /** Move the existing rigid body, preserving identity, art and claims. */
  place(at: Vec, angle = this.tilt) {
    const center = this.center, turn = angle - this.tilt, cs = Math.cos(turn), sn = Math.sin(turn);
    for (const p of this.points) { const x = p.x - center.x, y = p.y - center.y; p.x = at.x + cs * x - sn * y; p.y = at.y + sn * x + cs * y; p.px = p.x; p.py = p.y; }
    this.refresh();
  }
  /** How far it's tipped over (radians; 0 = upright). */
  get tilt() { const f = this.frame(); return Math.atan2(f.uy, f.ux); }

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
    if (this.def && polygonDistance({x,y},this.collisionHull) <= pad) return true;
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
    if (this.rigid) { const f = this.fit(); this.held.local = f.toLocal(x, y); }
  }
  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (this.rigid) {
      // Solver corrections are not a throw velocity. Apply the measured hand velocity explicitly,
      // preserving a bounded angular component from the off-center grab.
      const speed = Math.hypot(h.vx, h.vy), k = Math.min(1, 2500 / (speed || 1));
      const c = this.center;
      const vx = this.points.reduce((v, p) => v + (p.x - p.px) * 120, 0) / this.points.length;
      const vy = this.points.reduce((v, p) => v + (p.y - p.py) * 120, 0) / this.points.length;
      const inertia = this.points.reduce((v, p) => v + (p.x - c.x) ** 2 + (p.y - c.y) ** 2, 0) || 1;
      const omega = Math.max(-8, Math.min(8, this.points.reduce((v, p) => v + (p.x - c.x) * ((p.y - p.py) * 120 - vy) - (p.y - c.y) * ((p.x - p.px) * 120 - vx), 0) / inertia));
      for (const p of this.points) {
        p.px = p.x - (h.vx * k - omega * (p.y - c.y)) / 120;
        p.py = p.y - (h.vy * k + omega * (p.x - c.x)) / 120;
      }
      this.limitSpeed(3000);
      return;
    }
    const p = this.points[h.idx];
    if (!this.stuck || !this.pins.includes(h.idx)) { p.invMass = 1; p.px = p.x - Math.max(-2500, Math.min(2500, h.vx)) / 120; p.py = p.y - Math.max(-2500, Math.min(2500, h.vy)) / 120; }
  }

  /** Where its middle is and how far it's turned from its rest shape (the best fit to where its points are). */
  private fit() {
    const pts = this.points;
    this.rest ??= (() => { const c = this.center; return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y })); })();
    const c = this.center, r = this.rest;
    let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i++) { const qx = pts[i].x - c.x, qy = pts[i].y - c.y; sx += r[i].x * qx + r[i].y * qy; sy += r[i].x * qy - r[i].y * qx; }
    const a = Math.atan2(sy, sx), cos = Math.cos(a), sin = Math.sin(a);
    return {
      c, a, cos, sin,
      toWorld: (lx: number, ly: number) => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos }),
      toLocal: (x: number, y: number) => ({ x: (x - c.x) * cos + (y - c.y) * sin, y: -(x - c.x) * sin + (y - c.y) * cos }),
    };
  }

  /** Snap the points back onto its rigid shape (keeping where it is and how it's turned). */
  private matchShape() {
    if (!this.rigid || this.stuck) return;
    const f = this.fit(), r = this.rest!;
    this.points.forEach((p, i) => { const w = f.toWorld(r[i].x, r[i].y); p.x = w.x; p.y = w.y; });
  }

  /**
   * Your hand pulls the spot you grabbed toward your cursor, the way a real rigid thing moves: pulling
   * off-center both moves it and turns it, so it swings and hangs below where you hold it.
   */
  private pullHeld() {
    const h = this.held;
    if (!h?.local || this.stuck) return;
    const f = this.fit(), g = f.toWorld(h.local.x, h.local.y);
    const dx = h.x - g.x, dy = h.y - g.y, d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    const nx = dx / d, ny = dy / d, rx = g.x - f.c.x, ry = g.y - f.c.y;
    const m = this.points.length, I = this.rest!.reduce((s, q) => s + q.x * q.x + q.y * q.y, 0) || 1;
    const rn = rx * ny - ry * nx, w = 1 / m + (rn * rn) / I, lam = d / w;
    const mx = (nx * lam) / m, my = (ny * lam) / m, turn = (rn * lam) / I, cos = Math.cos(turn), sin = Math.sin(turn);
    for (const p of this.points) {
      const ox = p.x - f.c.x, oy = p.y - f.c.y;
      p.x = f.c.x + mx + ox * cos - oy * sin;
      p.y = f.c.y + my + ox * sin + oy * cos;
    }
  }

  /** Nothing moves faster than this (px/s): fast enough to throw, slow enough not to skip through things. */
  private limitSpeed(max: number) {
    const k = max / 120;
    for (const p of this.points) {
      const vx = p.x - p.px, vy = p.y - p.py, v = Math.hypot(vx, vy);
      if (v > k) { p.px = p.x - (vx / v) * k; p.py = p.y - (vy / v) * k; }
    }
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
    this.limitSpeed(3000);
    integrate(pts, dt, 0.998);
    if (h && !h.local) {
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
    if (this.rigid && !this.stuck) { this.matchShape(); this.pullHeld(); } else solveSticks(this.sticks);
    collide(this.points, bounds, this.friction, 0.15);
    for (const [p, pl] of this.above) {
      if (p.x < pl.x1 || p.x > pl.x2) continue;
      const top = platY(pl, p.x) - p.r;
      if (p.y <= top) continue;
      p.y = top;
      p.px += (p.x - p.px) * this.friction; // friction
      p.grounded = true;
    }
  }

  /** Finish the step: what landed stops falling; work out its platforms. */
  end(bounds?: Bounds) {
    if (this.rigid && !this.stuck) {
      // Exactly its own shape again, then lifted (or pushed) out of anything that shape now pokes into:
      // the floor, the screen's sides, and the tops it landed on.
      this.matchShape();
      if (bounds) {
        let up = 0, side = 0;
        for (const p of this.collisionHull) {
          up = Math.max(up, p.y + 1.5 - bounds.floor);
          if (p.x - 1.5 < bounds.left) side = Math.max(side, bounds.left - (p.x - 1.5));
          if (p.x + 1.5 > bounds.right) side = Math.min(side, bounds.right - (p.x + 1.5));
        }
        for (const [p, pl] of this.above) if (p.x >= pl.x1 && p.x <= pl.x2) up = Math.max(up, p.y - (platY(pl, p.x) - p.r));
        if (up > 0 || side) for (const p of this.points) { p.y -= Math.max(0, up); p.x += side; p.px += side; if (up > 0 && p.py > p.y) p.py = p.y; }
      }
    }
    for (const [p] of this.above) if (p.grounded && p.py > p.y) p.py = p.y;
    this.refresh();
  }

  /** A supported body dissipates tiny residual contact motion; hits/drags wake it immediately. */
  settleContacts(dt: number) {
    if (!this.rigid || this.held || this.stuck || this.movingBy || !this.points.some(p => p.grounded)) return;
    const speed = Math.max(...this.points.map(p => Math.hypot(p.x-p.px,p.y-p.py)/dt));
    if (speed > 35 || this.friction < 0.1) return;
    const damp = Math.min(0.65, this.friction * dt * 35);
    for (const p of this.points) {
      p.px += (p.x-p.px)*damp; p.py += (p.y-p.py)*damp;
    }
  }

  private drawProp(ctx: Ctx2D, alpha: number, now: number) {
    const def = this.def!;
    // Flat, filled art (the newer style) paints its screen on top of the body; line art paints it underneath.
    const flat = def.shape.some((st) => st.fill);
    ctx.save();
    ctx.globalAlpha = alpha * (this.ink && this.ink.remaining >= 0 ? Math.max(0.15,Math.min(1,this.ink.remaining/15)) : 1);
    if (propActions(def).includes('watch') && this.facing === -1) {
      const center = this.center;ctx.translate(center.x,center.y);ctx.rotate(this.tilt);ctx.scale(-1,1);ctx.rotate(-this.tilt);ctx.translate(-center.x,-center.y);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (def.sprite) {
      const at = this.toWorld(0, 0);
      ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(this.tilt); ctx.scale(this.scale, this.scale);
      drawSprite(ctx, def.sprite); ctx.restore();
    }
    if (!flat) this.drawScreen(ctx, now, false);
    for (const st of def.shape) {
      if (!st.fill && !st.width) continue;
      ctx.beginPath();
      if (st.rect) this.roundRect(ctx, st.rect, st.radius ?? 0);
      else {
        st.pts.forEach(([x, y], i) => { const q = this.toWorld(x, y); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        if (st.fill) ctx.closePath();
      }
      if (st.fill) { ctx.fillStyle = st.fill; ctx.fill(); }
      if (st.width) { ctx.strokeStyle = st.color; ctx.lineWidth = st.width * this.scale; ctx.stroke(); }
    }
    if (flat) this.drawScreen(ctx, now, true);
    if (propActions(def).includes('watch')) { const p = this.toWorld(this.facing > 0 ? def.bounds![2] : def.bounds![0], 14);ctx.fillStyle='#e7d3a0';ctx.fillRect(p.x-2,p.y,4*this.scale,4*this.scale); }
    ctx.restore();
  }

  /** A rounded box in the prop's own frame (so it tips over with it). Adds to the current path. */
  private roundRect(ctx: Ctx2D, [x, y, w, h]: [number, number, number, number], r: number) {
    const at = this.toWorld(x, y);
    ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(this.tilt); ctx.scale(this.scale, this.scale);
    ctx.roundRect(0, 0, w, h, Math.min(r, w / 2, h / 2));
    ctx.restore();
  }

  /** A TV's screen (dark when off; a show, his game or your board when on), or a canvas and its picture. */
  private drawScreen(ctx: Ctx2D, now: number, rounded: boolean) {
    const def = this.def!;
    if (!def.screen) return;
    const [sx, sy, sw, sh] = def.screen;
    ctx.beginPath();
    if (rounded) this.roundRect(ctx, def.screen, 3);
    else {
      const c = [this.toWorld(sx, sy), this.toWorld(sx + sw, sy), this.toWorld(sx + sw, sy + sh), this.toWorld(sx, sy + sh)];
      c.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
    }
    ctx.fillStyle = (propActions(def).includes('paint') || propActions(def).includes('drawhere')) ? '#fff8e8' : this.on ? '#1d2b4a' : '#22232c';
    ctx.fill();
    if (this.on && propActions(def).includes('watch')) {
      ctx.save(); ctx.clip();
      if (this.pong) {
        const at = this.toWorld(sx,sy); ctx.save();ctx.translate(at.x,at.y);ctx.rotate(this.tilt);ctx.scale(this.scale,this.scale);paintPong(ctx,this.pong,0,0,sw,sh);ctx.restore();
      } else if (this.board) this.drawBoard(ctx, this.board, sx, sy, sw, sh);
      else if (this.arcade && this.arcade2) {
        // Split screen: player one on top, player two below.
        this.drawArcade(ctx, this.arcade, sx, sy, sw, sh / 2, '#ffd23f');
        this.drawArcade(ctx, this.arcade2, sx, sy + sh / 2, sw, sh / 2, '#7fd6ff');
      } else if (this.arcade) this.drawArcade(ctx, this.arcade, sx, sy, sw, sh);
      else this.drawShow(ctx, sx, sy, sw, sh, now);
      ctx.restore();
    }
    if (this.art && (propActions(def).includes('paint') || propActions(def).includes('drawhere'))) {
      ctx.save(); ctx.clip(); ctx.strokeStyle = this.art.color; ctx.lineWidth = 2 * this.scale;
      const size = Math.min(sw, sh) * 0.8;
      for (const stroke of this.art.shape) {
        ctx.beginPath();
        stroke.forEach((p, i) => { const q = this.toWorld(sx + sw / 2 + p.x * size, sy + sh / 2 + p.y * size); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Your Othello game, on the TV: a green board with the discs, small enough to read from the couch. */
  private drawBoard(ctx: Ctx2D, board: readonly Disc[], sx: number, sy: number, sw: number, sh: number) {
    const size = Math.min(sw, sh) - 4, x0 = sx + (sw - size) / 2, y0 = sy + (sh - size) / 2, cell = size / 8;
    ctx.beginPath(); this.roundRect(ctx, [x0 - 1, y0 - 1, size + 2, size + 2], 1.5);
    ctx.fillStyle = '#2f7a55'; ctx.fill();
    board.forEach((d, i) => {
      if (!d) return;
      const q = this.toWorld(x0 + (i % 8 + 0.5) * cell, y0 + (Math.floor(i / 8) + 0.5) * cell);
      ctx.fillStyle = d === 'black' ? '#1b1d26' : '#f1ead8';
      ctx.beginPath(); ctx.arc(q.x, q.y, cell * 0.42 * this.scale, 0, 7); ctx.fill();
    });
  }

  /** His own game on the TV: a little guy hopping over blocks, and his score. */
  private drawArcade(ctx: Ctx2D, g: Runner, sx: number, sy: number, sw: number, sh: number, player = '#ffd23f') {
    const box = (u: number, v: number, w: number, h: number, color: string) => {
      ctx.beginPath(); this.roundRect(ctx, [sx + u * sw, sy + v * sh, w * sw, h * sh], 1); ctx.fillStyle = color; ctx.fill();
    };
    box(0, 0.8, 1, 0.2, '#3d5a3a'); // the ground
    for (const o of g.blocks) box(o.x - BLOCK_W / 2, 0.8 - o.h, BLOCK_W, o.h, '#e0704a');
    const hurt = g.crashedAt >= 0 && g.time - g.crashedAt < 0.6;
    box(g.x - PLAYER_W / 2, 0.8 - 0.14 - g.y, PLAYER_W, 0.14, hurt ? '#ff5a5a' : player);
    // The score: one tick per point, up in the corner (big enough to read as pixels).
    for (let i = 0; i < Math.min(g.score, 10); i++) box(0.05 + i * 0.06, 0.07, 0.04, 0.08, '#cfe8ff');
  }

  /** What's on TV: a few little shows that take turns (a stick figure running about, a bouncing ball, static, color bars). */
  private drawShow(ctx: Ctx2D, sx: number, sy: number, sw: number, sh: number, now: number) {
    const show = (Math.floor(now / 7) + this.channel) % 4, t = now % 7;
    const at = (u: number, v: number) => this.toWorld(sx + u * sw, sy + v * sh);
    const line = (pts: [number, number][], color: string, w = 1.6) => {
      ctx.strokeStyle = color; ctx.lineWidth = w * this.scale; ctx.beginPath();
      pts.forEach(([u, v], i) => { const q = at(u, v); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke();
    };
    if (show === 0) {
      // A tiny stick figure running back and forth, now and then doing a flip. (Hi, Animator vs. Animation.)
      const u = 0.5 + Math.sin(t * 1.3) * 0.35, run = Math.sin(t * 14) * 0.08, dir = Math.cos(t * 1.3) > 0 ? 1 : -1;
      const q = at(u, 0.32); ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.2 * this.scale, 0, 7); ctx.fill();
      line([[u, 0.4], [u + dir * 0.02, 0.62]], '#ff9a3c');
      line([[u + dir * 0.02, 0.62], [u - run, 0.85]], '#ff9a3c'); line([[u + dir * 0.02, 0.62], [u + run, 0.85]], '#ff9a3c');
      line([[u - 0.07, 0.48], [u + dir * 0.02, 0.45], [u + 0.07, 0.52]], '#ff9a3c');
      line([[0, 0.88], [1, 0.88]], '#4a6a9a', 1);
    } else if (show === 1) {
      const u = 0.5 + Math.sin(t * 2) * 0.4, v = 0.85 - Math.abs(Math.sin(t * 4.5)) * 0.6;
      const q = at(u, v); ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.arc(q.x, q.y, 3 * this.scale, 0, 7); ctx.fill();
    } else if (show === 2) {
      // Static.
      for (let i = 0; i < 70; i++) { const q = at(Math.random(), Math.random()); ctx.fillStyle = Math.random() < 0.5 ? '#c9ccd8' : '#5a5e70'; ctx.fillRect(q.x, q.y, 1.6 * this.scale, 1.6 * this.scale); }
    } else {
      const bars = ['#e8e8e8', '#f2d43a', '#3ad0f2', '#3af25a', '#e33ad6', '#f23a3a', '#3a4af2'];
      bars.forEach((c, i) => line([[(i + 0.5) / bars.length, 0], [(i + 0.5) / bars.length, 1]], c, (sw / bars.length) * 0.95));
    }
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

  private pixels = new PixelLayer();
  /** `pixel` is his pixel size: furniture in the flat style is drawn smooth and pixelated with him, so it always matches. */
  draw(ctx: CanvasRenderingContext2D, alpha: number, now = 0, pixel = 1) {
    if (this.def) {
      const box = (b: [number, number, number, number]) => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => this.toWorld(x, y));
      if (this.def.sprite) {
        // Hand-made pixel sprites keep their own grid.
        const s = this.def.sprite, w = s.rows[0].length * s.pixel, h = s.rows.length * s.pixel;
        ctx.save(); ctx.globalAlpha *= alpha;
        this.pixels.paint(ctx, box([s.x, s.y, s.x + w, s.y + h]), 2, { ...DEFAULT_LOOK, pixel: 2, outline: false }, (g) => this.drawProp(g, 1, now));
        ctx.restore();
      } else if (pixel > 1 && this.def.bounds) {
        ctx.save(); ctx.globalAlpha *= alpha;
        this.pixels.paint(ctx, box(this.def.bounds), 2 * pixel, { ...DEFAULT_LOOK, pixel, outline: false }, (g) => this.drawProp(g, 1, now));
        ctx.restore();
      } else this.drawProp(ctx, alpha, now);
      return;
    }
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

/** A prop from its definition, with its top-left corner at (x, y), at his size. Rigid (every point braced to every other). */
export function makeProp(def: PropDef, x: number, y: number, scale: number) {
  const t = new Thing('prop', { strokes: [], color: '#2a2c44', born: 0, done: true, title: def.name });
  t.storageKey = `shelf-${t.n}-${Math.random().toString(36).slice(2,10)}`;
  t.def = def; t.forever = true; t.scale = scale; t.friction = def.friction;
  for (const [px, py] of def.outline) t.point(x + px * scale, y + py * scale);
  for (const i of def.wheels ?? []) t.points[i].r = (def.wheel ?? 4) * scale;
  t.outline = def.outline.map((_, i) => i);
  for (let a = 0; a < t.points.length; a++) for (let b = a + 1; b < t.points.length; b++) t.stick(a, b);
  t.refresh();
  return t;
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
export function makeRamp(d: Doodle, xLow: number, xHigh: number, floor: number, top: number, n?: number) {
  const t = new Thing('ramp', d, n);
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

/** The id a ramp's slope will have once it's a real thing (so wet ink he's standing on turns into it seamlessly). */
export function rampSlopeId(n: number, up: 1 | -1) { return PROP_ID + n * 64 + (up > 0 ? 0 : 1); }
/** A fresh number for a thing that doesn't exist yet. */
export const reserveThing = () => nextProp++;

/** The props that come with him (in his inventory; none are out until you drop them in). */
export const BUILTIN_PROPS: PropDef[] = [chairDef, couchDef, tvDef, scooterDef, canvasDef, deskDef, workbenchDef, storageDef, bookshelfDef].map((d) => parsePropDef(d)!);

export class Props {
  balls: Ball[] = [];
  things: Thing[] = [];
  /** Wet ink: a line he's drawing right now that's already solid enough to stand on (a ramp or bridge on its way). */
  wet = new Map<number, Platform>();
  setWet(id: number, p: Platform | null) { if (p) this.wet.set(id, p); else this.wet.delete(id); this.changedPlatforms(); }
  /** Called when platforms change (appear, vanish, or move): the world's platforms need updating. */
  onPlatforms: (() => void) | null = null;
  private platformListeners=new Set<()=>void>();
  subscribePlatforms(listener:()=>void) {this.platformListeners.add(listener);return ()=>{this.platformListeners.delete(listener);};}
  private changedPlatforms(){this.onPlatforms?.();for(const listener of this.platformListeners)listener();}

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
    this.changedPlatforms();
  }

  remove(t: Thing) { this.things = this.things.filter((x) => x !== t); this.changedPlatforms(); }

  // ── props from his inventory ──
  defs = new Map<string, PropDef>(BUILTIN_PROPS.map((d) => [d.id, d]));
  addDefs(list: unknown[]) { for (const raw of list) { const d = parsePropDef(raw); if (d) this.defs.set(d.id, d); } }
  get placed() { return this.things.filter((t) => t.def); }
  /** Drop a prop in, its middle at x, falling from y. */
  spawn(id: string, x: number, y: number, scale: number, art?: unknown) {
    const def = this.defs.get(id);
    if (!def) return null;
    // Save/load uses Thing.center (mean of outline points). Use the same center here;
    // otherwise asymmetric furniture slides a little every time the app restarts.
    const centerX = def.outline.reduce((sum, p) => sum + p[0], 0) / def.outline.length * scale;
    const t = makeProp(def, x - centerX, y, scale);
    t.art = parseCanvasArt(art);
    this.add(t);
    return t;
  }
  /** Which props are where (saved between runs). */
  savePlaced() { return this.placed.map(t => ({ id: t.def!.id, storageKey: t.storageKey, x: t.center.x, y: t.center.y, tilt: t.tilt, facing: t.facing, consoleConnected: t.consoleConnected, scale: t.scale, ...(t.ink ? { ink: t.ink, def: t.def } : {}), ...(t.art ? { art: t.art } : {}) })); }
  restore(p: { id: string; storageKey?: string; x: number; y?: number; tilt?: number; scale?: number; facing?: number; consoleConnected?: boolean; ink?: unknown; def?: unknown; art?: unknown }, floor: number, scale: number) {
    if (p.def) { const def = parsePropDef({ ...p.def as object, type: 'prop' }); if (def) this.defs.set(def.id, def); }
    const def = this.defs.get(p.id); if (!def) return null;
    const sc = Number.isFinite(p.scale) ? Math.max(0.2, Math.min(4, p.scale!)) : scale;
    const t = this.spawn(p.id, p.x, floor - Math.max(...def.outline.map(q => q[1])) * sc - 2, sc, p.art)!;
    if (Number.isFinite(p.y) && Math.abs(p.y!) < 20000) t.place({ x: p.x, y: p.y! }, Number.isFinite(p.tilt) ? p.tilt! : 0);
    if (typeof p.storageKey === 'string' && /^[a-z0-9-]{1,60}$/.test(p.storageKey)) t.storageKey = p.storageKey;
    t.consoleConnected = p.consoleConnected === true;
    t.facing = p.facing === -1 ? -1 : 1;
    t.ink = parseProject(p.ink); return t;
  }

  get platforms() { return [...this.things.flatMap((t) => t.platforms), ...this.wet.values()]; }
  /** Things he can get on top of (for "get on what he drew"). */
  get blocks(): Block[] { return this.things.filter((t) => t.platforms.length).map((t) => ({ doodle: t.doodle, platform: t.platform, thing: t })); }

  /** The thing (if any) a platform id belongs to. */
  thingOf(id: number) { return id >= PROP_ID ? this.things.find((t) => Math.floor((id - PROP_ID) / 64) === t.n) ?? null : null; }

  /**
   * One physics step for everything. `world` = window tops (things land on them, and on each other).
   * Returns true if any platform moved (so his ground gets updated).
   */
  update(dt: number, now: number, bounds: Bounds, world: Platform[], wins?: WinRect[]) {
    for (const t of this.things) if (t.pong && t.on) t.pong.step(dt);
    const before = this.things.length;
    for (const t of this.things) if (t.ink && t.ink.remaining >= 0 && !t.held && !t.movingBy && !t.sitters.size && !t.watchers.size && !t.players.length && !t.load.size) t.ink.remaining = Math.max(0, t.ink.remaining - dt);
    this.things = this.things.filter(t => t.ink ? t.ink.remaining !== 0 : t.forever || !!t.held || !!t.sitters.size || !!t.load.size || now - t.doodle.born < DOODLE_LIFE);
    this.balls = this.balls.filter((b) => !!b.heldBy || now - b.doodle.born < DOODLE_LIFE);
    const moved = this.things.length !== before || this.things.length > 0;
    if (wins) for (const t of this.things) t.followWindows(wins);
    // Everything steps every time: there are only ever a few, and a thing resting on a window
    // has to notice when the window moves out from under it. All of them are solved together,
    // so things resting on things settle properly.
    // Window tops and the tops of other things are one-way surfaces: things land on them from above.
    for (const t of this.things) t.begin(dt, [...world, ...this.things.filter((o) => o !== t).flatMap((o) => o.platforms)]);
    for (let i = 0; i < 6; i++) {
      for (const t of this.things) t.pass(bounds);
      this.restOnEachOther();
    }
    for (const t of this.things) t.end(bounds);
    for (let i=0;i<4;i++) {
      if (!this.separateSolids()) break;
      for (const t of this.things) t.end(bounds);
    }
    for (const t of this.things) t.settleContacts(dt);
    const all = [...world, ...this.platforms];
    for (const b of this.balls) b.step(dt, bounds, all, this.things);
    if (moved) this.changedPlatforms();
    return moved;
  }

  /** Resolve whole-body overlap, with no positional correction added as artificial velocity. */
  private separateSolids() {
    let moved = false;
    for (let i = 0; i < this.things.length; i++)
      for (let j = i + 1; j < this.things.length; j++) {
        const a = this.things[i],
          b = this.things[j];
        if (!a.rigid || !b.rigid) continue;
        const wa = a.stuck || a.held ? 0 : 1 / a.points.length,
          wb = b.stuck || b.held ? 0 : 1 / b.points.length;
        if (!(wa + wb)) continue;
        const offset = overlapOffset(a.collisionHull, b.collisionHull);
        if (!offset) continue;
        const length = Math.hypot(offset.x, offset.y);
        if (length < 0.05) continue;
        moved = true;
        const nx = offset.x / length,
          ny = offset.y / length;
        const velocity = (t: Thing) => ({
          x:
            t.points.reduce((v, p) => v + (p.x - p.px) * 120, 0) /
            t.points.length,
          y:
            t.points.reduce((v, p) => v + (p.y - p.py) * 120, 0) /
            t.points.length,
        });
        const av = velocity(a),
          bv = velocity(b),
          closing = (av.x - bv.x) * nx + (av.y - bv.y) * ny;
        const tangent = -(av.x-bv.x)*ny + (av.y-bv.y)*nx;
        const friction = Math.sqrt(a.friction*b.friction);
        const drag = Math.max(-Math.max(0,-closing)*friction, Math.min(Math.max(0,-closing)*friction, tangent));
        for (const [t, w, sign] of [
          [a, wa, 1],
          [b, wb, -1],
        ] as const) {
          if (!w) continue;
          const fraction = w / (wa + wb),
            dx = offset.x * fraction * sign,
            dy = offset.y * fraction * sign;
          for (const p of t.points) {
            p.x += dx;
            p.y += dy;
            p.px += dx;
            p.py += dy;
            if (closing < 0) {
              const impulse = -Math.max(-3000, closing) * fraction * sign;
              p.px -= (nx * impulse) / 120;
              p.py -= (ny * impulse) / 120;
            }
            // Equal/opposite tangential impulses remove contact slip, not intended free motion.
            p.px -= ny * drag * fraction * sign / 120;
            p.py += nx * drag * fraction * sign / 120;
            if (ny * sign < -0.5) p.grounded = true;
          }
        }
      }
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

  draw(ctx: CanvasRenderingContext2D, now: number, pixel = 1) {
    for (const t of this.things) t.draw(ctx, t.forever ? 1 : Math.max(0, Math.min(1, (DOODLE_LIFE - (now - t.doodle.born)) / 10)), now, pixel);
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
