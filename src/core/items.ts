// Items: things he carries on his belt and uses with his hands — his pen (he draws
// with it), a wooden sword (he swings it). Each kind of item is described by a small
// definition file (see src/core/items/*.json, and your own in the app's items folder).
//
// An item is always in one of four places:
//   belt   — hanging in one of his three belt slots (left hip, right hip, back)
//   hand   — held in one of his hands (it follows his forearm, or a skill aims it)
//   world  — lying around: a little two-point physics object that falls and bounces
//   cursor — you took it: it dangles from your mouse pointer, and you can hit him with it

import { basis, clamp, cross3, dot3, norm3, scale3, sub3, add3, type V3, type Vec } from './math';
import { collide, collidePlatforms, integrate, makePoint, solveSticks, type Bounds, type Platform, type Point, type Stick } from './physics';
import type { Character } from './character';
import penDef from './items/pen.json';
import swordDef from './items/wooden-sword.json';

export type ItemUse = 'draw' | 'swing' | 'none';
export interface ItemStroke { pts: [number, number][]; color: string; width: number }
export interface ItemDef {
  id: string; name: string; about: string;
  use: ItemUse;
  length: number; grip: number;
  belt: 'side' | 'back' | 'none';
  hit: number;
  shape: ItemStroke[];
  /** Made from one of his drawings (not a file). */
  drawn?: boolean;
}

/** Check a definition (from a file you wrote, or from the AI). Returns null if it's unusable. */
export function parseItemDef(raw: unknown): ItemDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30) : '';
  if (!id) return null;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
  const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const length = num(o.length, 16, 4, 60), grip = num(o.grip, 3, 0, 20);
  let shape: ItemStroke[] = [];
  if (Array.isArray(o.shape)) {
    for (const st of o.shape.slice(0, 16)) {
      if (!st || typeof st !== 'object') continue;
      const s = st as Record<string, unknown>;
      const pts = (Array.isArray(s.pts) ? s.pts : []).filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
        .slice(0, 40).map((p) => [clamp(p[0], -grip - 5, length + 5), clamp(p[1], -20, 20)] as [number, number]);
      if (pts.length >= 2) shape.push({ pts, color: color(s.color, color(o.color, '#2a2c44')), width: num(s.width, 2.5, 0.5, 8) });
    }
  }
  if (!shape.length) shape = [{ pts: [[-grip, 0], [length, 0]], color: color(o.color, '#2a2c44'), width: 2.5 }];
  return {
    id, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 30) : id,
    about: typeof o.about === 'string' ? o.about.slice(0, 140) : '',
    use: o.use === 'draw' || o.use === 'swing' ? o.use : 'none',
    length, grip,
    belt: o.belt === 'side' || o.belt === 'back' ? o.belt : o.belt === 'none' ? 'none' : 'side',
    hit: num(o.hit, 0, 0, 3), shape,
  };
}

/** The items that come with him. */
export const BUILTIN_ITEMS: ItemDef[] = [penDef, swordDef].map((d) => parseItemDef(d)!);

/** Belt slots: 0 = his left hip, 1 = his right hip, 2 = his back. */
export const SLOT_NAMES = ['left hip', 'right hip', 'back'];

let nextUid = 1;

export class Item {
  readonly uid = nextUid++;
  where: 'belt' | 'hand' | 'world' | 'cursor' = 'world';
  slot = -1;
  hand: 'L' | 'R' = 'R';
  /** Where his hand (or your cursor) grips it, and which way it points (unit vector), right now. */
  at: V3 = { x: 0, y: 0, z: 0 };
  dir: V3 = { x: 0, y: 1, z: 0 };
  /** While it's in his hand, a skill can point it this way (else it follows his forearm). */
  aim: V3 | null = null;
  /** Physics for when it's lying around or dangling from your cursor: a = grip, b = tip. */
  readonly a: Point; readonly b: Point;
  private readonly sticks: Stick[];
  /** How fast its tip is moving (px/s), for hits. */
  tipSpeed = 0;
  private lastTip: V3 | null = null;

  constructor(readonly def: ItemDef, at: Vec = { x: 0, y: 0 }, public scale = 1) {
    this.a = makePoint(at.x, at.y, 2);
    this.b = makePoint(at.x, at.y + def.length * scale, 2);
    this.sticks = [{ a: this.a, b: this.b, len: def.length * scale }];
    this.at = { x: at.x, y: at.y, z: 0 };
  }

  get tip(): V3 { return add3(this.at, scale3(this.dir, this.def.length * this.scale)); }
  get butt(): V3 { return add3(this.at, scale3(this.dir, -this.def.grip * this.scale)); }

  /** Start physics from where it is now, moving at (vx, vy). */
  loosen(vx = 0, vy = 0, dt = 1 / 60) {
    const tip = this.tip;
    Object.assign(this.a, { x: this.at.x, y: this.at.y, z: this.at.z, px: this.at.x - vx * dt, py: this.at.y - vy * dt, pz: this.at.z });
    Object.assign(this.b, { x: tip.x, y: tip.y, z: tip.z, px: tip.x - vx * dt, py: tip.y - vy * dt, pz: tip.z });
    this.sticks[0].len = this.def.length * this.scale;
  }

  step(dt: number, bounds: Bounds, platforms: Platform[]) {
    integrate([this.a, this.b], dt, 0.995);
    this.a.grounded = this.b.grounded = false;
    for (let i = 0; i < 4; i++) {
      solveSticks(this.sticks);
      collide([this.a, this.b], bounds, 0.5, 0.3);
      collidePlatforms([this.a, this.b], platforms, 0.5, 0.25);
    }
    this.at = { x: this.a.x, y: this.a.y, z: this.a.z };
    this.dir = norm3(sub3(this.b, this.a));
  }

  /** Keep track of how fast the tip moves (for hits). */
  measure(dt: number) {
    const tip = this.tip;
    this.tipSpeed = this.lastTip && dt > 0 ? Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y) / dt : 0;
    this.lastTip = tip;
  }

  /** Distance from (x, y) to the item on screen. */
  distTo(x: number, y: number) {
    const p = this.butt, q = this.tip, dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / l2, 0, 1);
    return Math.hypot(x - (p.x + dx * t), y - (p.y + dy * t));
  }
}

/** Everything he owns (and what you took), where it is, and moving it between places. */
export class Items {
  defs = new Map<string, ItemDef>(BUILTIN_ITEMS.map((d) => [d.id, d]));
  list: Item[] = [];
  /** What's in each belt slot. */
  belt: (Item | null)[] = [null, null, null];
  /** Called when something moves between places (the Items tab updates). */
  onChange: (() => void) | null = null;

  /** Add definitions (from your items folder). Same id replaces the old one. */
  addDefs(list: unknown[]) {
    for (const raw of list) { const d = parseItemDef(raw); if (d) this.defs.set(d.id, d); }
    for (const it of this.list) { const d = this.defs.get(it.def.id); if (d && !it.def.drawn) (it as { def: ItemDef }).def = d; }
    this.onChange?.();
  }

  /** A new item of this kind: onto his belt if there's room, else dropped next to him. */
  give(defId: string | ItemDef, ch: Character): Item | null {
    const def = typeof defId === 'string' ? this.defs.get(defId) : defId;
    if (!def) return null;
    const it = new Item(def, { x: ch.x, y: ch.body.j.hip.y }, ch.scale);
    this.list.push(it);
    if (!this.stow(it)) { it.where = 'world'; it.at = { x: ch.x + ch.facing * 20, y: ch.body.j.hip.y, z: 0 }; it.loosen(ch.facing * 60, -150); }
    this.onChange?.();
    return it;
  }

  remove(it: Item) {
    this.unslot(it);
    this.list = this.list.filter((x) => x !== it);
    this.onChange?.();
  }

  /** Put it in a belt slot (its favorite free one). False if the belt is full or it doesn't go on a belt. */
  stow(it: Item): boolean {
    if (it.def.belt === 'none') return false;
    if (it.where === 'belt') return true;
    const prefer = it.def.belt === 'back' ? [2, 1, 0] : [1, 0, 2];
    const slot = prefer.find((s) => !this.belt[s]);
    if (slot === undefined) return false;
    this.unslot(it);
    this.belt[slot] = it; it.slot = slot; it.where = 'belt'; it.aim = null;
    this.onChange?.();
    return true;
  }

  private unslot(it: Item) { if (it.slot >= 0 && this.belt[it.slot] === it) this.belt[it.slot] = null; it.slot = -1; }

  /** Into his hand. */
  toHand(it: Item, hand: 'L' | 'R') {
    const other = this.inHand(hand);
    if (other && other !== it) this.drop(other, 0, 0);
    this.unslot(it);
    it.where = 'hand'; it.hand = hand; it.aim = null;
    this.onChange?.();
  }

  /** Let go of it: it falls from where it is with this speed. */
  drop(it: Item, vx: number, vy: number) {
    this.unslot(it);
    it.where = 'world'; it.aim = null;
    it.loosen(vx, vy);
    this.onChange?.();
  }

  /** You take it: it dangles from your cursor. */
  toCursor(it: Item, at: Vec) {
    this.unslot(it);
    it.where = 'cursor'; it.aim = null;
    it.at = { x: at.x, y: at.y, z: 30 };
    it.dir = { x: 0, y: 1, z: 0 };
    this.lastCursor = null; this.cursorV = { x: 0, y: 0 };
    it.loosen();
    this.onChange?.();
  }

  inHand(hand: 'L' | 'R') { return this.list.find((x) => x.where === 'hand' && x.hand === hand) ?? null; }
  /** The item your cursor is carrying, if any. */
  get carried() { return this.list.find((x) => x.where === 'cursor') ?? null; }
  /** Things on him (belt or hands). */
  get onHim() { return this.list.filter((x) => x.where === 'belt' || x.where === 'hand'); }
  /** The first item of his that does this (on him first, then lying around, then with you). */
  find(use: ItemUse) {
    const order = { hand: 0, belt: 1, world: 2, cursor: 3 } as const;
    return this.list.filter((x) => x.def.use === use).sort((a, b) => order[a.where] - order[b.where])[0] ?? null;
  }

  /** Where a belt slot is right now, and which way an item hangs from it. */
  slotPose(ch: Character, slot: number): { at: V3; dir: V3 } {
    const j = ch.body.j, sc = ch.scale, B = basis(ch.yaw);
    // The belt sits around his hips, square to his torso.
    const up = norm3(sub3(j.neck, j.hip));
    const left = norm3(sub3(B.left, scale3(up, dot3(B.left, up))));
    const fwd = norm3(cross3(left, up));
    const fixedFwd = dot3(fwd, B.fwd) < 0 ? scale3(fwd, -1) : fwd;
    const r = 4.5 * sc;
    const off = slot === 0 ? scale3(left, r) : slot === 1 ? scale3(left, -r) : scale3(fixedFwd, -r);
    const at = add3(j.hip, off);
    if (slot === 2) {
      // Across his back: handle up behind his shoulder, blade down the back of his leg.
      return { at: add3(at, scale3(up, 5 * sc)), dir: norm3(add3(scale3(up, -0.85), scale3(fixedFwd, -0.45))) };
    }
    // At a hip: hanging down, clipped to the belt, tipped back a little.
    return { at, dir: norm3(add3(scale3(up, -1), scale3(fixedFwd, -0.25))) };
  }

  /** Move every item to where it belongs this frame (and run physics for loose ones). */
  update(ch: Character, dt: number, bounds: Bounds, platforms: Platform[], cursor: Vec | null) {
    const j = ch.body.j;
    for (const it of this.list) {
      it.scale = ch.scale;
      if (it.where === 'belt') {
        const p = this.slotPose(ch, it.slot);
        it.at = p.at; it.dir = p.dir;
      } else if (it.where === 'hand') {
        const arm = it.hand === 'L' ? 'armL' : 'armR';
        if (!ch.hasLimb(arm)) { this.drop(it, 0, -100); continue; } // the arm came off: it falls
        const hand = j[it.hand === 'L' ? 'handL' : 'handR'], elbow = j[it.hand === 'L' ? 'elbowL' : 'elbowR'];
        it.at = { x: hand.x, y: hand.y, z: hand.z };
        it.dir = it.aim ? norm3(it.aim) : norm3(sub3(hand, elbow));
      } else if (it.where === 'world') {
        it.step(dt, bounds, platforms);
      } else if (it.where === 'cursor') {
        if (cursor) this.followCursor(it, cursor, dt);
      }
      it.measure(dt);
    }
  }

  private lastCursor: Vec | null = null;
  private cursorV = { x: 0, y: 0 };
  /**
   * You're holding it by the handle: it hangs tip-down from your cursor and trails behind
   * when you move, swinging into whatever you swipe it at.
   */
  private followCursor(it: Item, cur: Vec, dt: number) {
    if (dt > 0 && this.lastCursor) {
      const k = Math.min(1, dt * 20);
      this.cursorV.x += ((cur.x - this.lastCursor.x) / dt - this.cursorV.x) * k;
      this.cursorV.y += ((cur.y - this.lastCursor.y) / dt - this.cursorV.y) * k;
    }
    this.lastCursor = { x: cur.x, y: cur.y };
    const want = norm3({ x: clamp(-this.cursorV.x / 900, -1.6, 1.6), y: 1 - clamp(this.cursorV.y / 1500, -0.6, 0.6), z: 0 });
    const e = Math.min(1, dt * 14);
    it.dir = norm3({ x: it.dir.x + (want.x - it.dir.x) * e, y: it.dir.y + (want.y - it.dir.y) * e, z: 0 });
    it.at = { x: cur.x, y: cur.y, z: 30 };
    it.loosen(this.cursorV.x, this.cursorV.y, dt || 1 / 60);
  }

  /** Which loose item (lying around) is under (x, y)? */
  hitWorld(x: number, y: number, pad = 7) { return this.list.find((it) => it.where === 'world' && it.distTo(x, y) < pad) ?? null; }

  // ── saving: what he owns and where (anything lying around or with you goes back on his belt) ──
  save() {
    return this.list.filter((it) => !it.def.drawn || it.where !== 'world').map((it) => ({ id: it.def.id, slot: it.where === 'belt' ? it.slot : -1, def: it.def.drawn ? it.def : undefined }));
  }
  load(data: unknown, ch: Character) {
    if (!Array.isArray(data)) return;
    this.list = []; this.belt = [null, null, null];
    for (const d of data.slice(0, 12)) {
      if (!d || typeof d !== 'object') continue;
      const o = d as { id?: string; slot?: number; def?: unknown };
      const def = o.def ? parseItemDef(o.def) : this.defs.get(String(o.id));
      if (!def) continue;
      if (o.def) def.drawn = true;
      const it = new Item(def, { x: ch.x, y: ch.body.j.hip.y }, ch.scale);
      this.list.push(it);
      if (typeof o.slot === 'number' && o.slot >= 0 && o.slot < 3 && !this.belt[o.slot] && def.belt !== 'none') { this.belt[o.slot] = it; it.slot = o.slot; it.where = 'belt'; }
      else if (!this.stow(it)) { it.where = 'world'; it.at = { x: ch.x + 20, y: ch.body.j.hip.y, z: 0 }; it.loosen(); }
    }
  }
}

/** Draw an item along its current direction. Smooth lines (the pixel layer can pixelate it). */
export function drawItem(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, it: Item, alpha = 1) {
  const sc = it.scale, d = it.dir;
  // "across" = sideways to the item on screen.
  let ax = -d.y, ay = d.x;
  const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of it.def.shape) {
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width * sc;
    ctx.beginPath();
    st.pts.forEach(([along, across], i) => {
      const x = it.at.x + d.x * along * sc + ax * across * sc, y = it.at.y + d.y * along * sc + ay * across * sc;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}
