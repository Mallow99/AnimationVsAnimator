import { convexHull, paddedVertices, polygonDistance, segmentDistance, overlapOffset, sweepConvex } from './geometry';
import blanketDef from './items/blanket.json';
import snackDef from './items/snack-box.json';
import type { Thing } from './props';
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
import { collide, collidePlatforms, integrate, makePoint, platY, solveSticks, type Bounds, type Platform, type Point, type Stick } from './physics';
import type { Character } from './character';
import penDef from './items/pen.json';
import spongeDef from './items/sponge.json';
import eraserDef from './items/eraser.json';
import bucketDef from './items/paint-bucket.json';
import handheldDef from './items/handheld.json';
import consoleDef from './items/console.json';
import type { Runner } from './tv-game';
import swordDef from './items/wooden-sword.json';
import ballDef from './items/bouncy-ball.json';
import maceDef from './items/mace.json';
import foamDef from './items/foam-sword.json';
import katanaDef from './items/katana.json';
import bowDef from './items/bow.json';
import gunDef from './items/gun.json';
import bookDef from './items/book.json';
import cupDef from './items/cup.json';
import dumbbellDef from './items/dumbbell.json';
import yoyoDef from './items/yo-yo.json';
import helmetDef from './items/helmet.json';
import bootsDef from './items/boots.json';
import { drawSprite, parseSprite, type PixelSprite } from './pixel-art';
import type { DepthPart } from './render';
import { satchelAt } from './satchel';
import { bookShape } from './book-art';
import { parseProject, type InkProject } from './crafting-state';

/** What he does with it: draw (a pen), swing (a sword), smash (a mace, overhead), throw (a ball), shoot (a bow), none (just carries it). */
export type ItemUse = 'draw' | 'swing' | 'smash' | 'throw' | 'shoot' | 'gun' | 'wipe' | 'erase' | 'color' | 'game' | 'connect' | 'sip' | 'exercise' | 'play' | 'rest' | 'snack' | 'none';
export type BeltSpot = 'side' | 'back' | 'pocket' | 'none';
/** A line through `pts`, or (with `fill`) a flat filled shape, optionally with an edge line. */
export interface ItemStroke { pts: [number, number][]; color: string; width: number; fill?: string }
export interface ItemDef {
  id: string; name: string; about: string;
  use: ItemUse;
  length: number; grip: number;
  belt: BeltSpot;
  hit: number;
  /** How bouncy it is when it hits the floor or a wall (0 = a thud, 0.9 = a super ball). */
  bounce: number;
  shape: ItemStroke[];
  sprite?: PixelSprite;
  wear?: 'head' | 'feet';
  /** A real blade: in a real fight it can cut a limb off or run someone through. */
  cuts?: boolean;
  /** Made from one of his drawings (not a file). */
  drawn?: boolean;
  blueprint?: string;
  drawable?: boolean;
  refinable?: boolean;
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
    for (const st of o.shape.slice(0, 24)) {
      if (!st || typeof st !== 'object') continue;
      const s = st as Record<string, unknown>;
      const pts = (Array.isArray(s.pts) ? s.pts : []).filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .slice(0, 40).map((p) => [clamp(p[0], -grip - 5, length + 5), clamp(p[1], -20, 20)] as [number, number]);
      if (s.fill !== undefined) {
        // A flat filled shape (the house style). A fill it can't read is left out, not guessed.
        const fill = color(s.fill, '');
        if (fill && pts.length >= 3) shape.push({ pts, fill, color: color(s.color, '#2a2c44'), width: num(s.width, 0, 0, 8) });
        continue;
      }
      if (pts.length >= 2) shape.push({ pts, color: color(s.color, color(o.color, '#2a2c44')), width: num(s.width, 2.5, 0.5, 8) });
    }
  }
  const sprite = parseSprite(o.sprite);
  if (!shape.length && !sprite) shape = [{ pts: [[-grip, 0], [length, 0]], color: color(o.color, '#2a2c44'), width: 2.5 }];
  return {
    id, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 30) : id,
    about: typeof o.about === 'string' ? o.about.slice(0, 140) : '',
    use: o.use === 'draw' || o.use === 'swing' || o.use === 'smash' || o.use === 'throw' || o.use === 'shoot' || o.use === 'gun' || o.use === 'wipe' || o.use === 'erase' || o.use === 'color' || o.use === 'game' || o.use === 'connect' || o.use === 'sip' || o.use === 'exercise' || o.use === 'play' || o.use === 'rest' || o.use === 'snack' ? o.use : 'none',
    length, grip,
    belt: o.belt === 'side' || o.belt === 'back' || o.belt === 'pocket' ? o.belt : o.belt === 'none' ? 'none' : 'side',
    hit: num(o.hit, 0, 0, 3), bounce: num(o.bounce, 0.3, 0, 0.92), shape, sprite,
    wear: o.wear === 'head' || o.wear === 'feet' ? o.wear : undefined,
    blueprint: typeof o.blueprint === 'string' && /^[a-z0-9-]{1,30}$/.test(o.blueprint) ? o.blueprint : undefined,
    drawable: o.drawable !== false, refinable: o.refinable !== false,
    drawn: o.drawn === true || undefined,
    cuts: o.cuts === true ? true : undefined,
  };
}

/**
 * A drawing of his turned into a real thing he can hold: the drawing stands upright, with its
 * bottom part as the handle. Swords, bats and sticks hit; pens and brushes draw.
 */
export function itemFromDrawing(shape: Vec[][], title: string, color: string): ItemDef {
  const size = 46, grip = 0.3; // in the drawing's box (-0.5..0.5, y down): the handle is below y = 0.3
  const t = title.toLowerCase();
  const use: ItemUse = /pen|pencil|brush|crayon|marker/.test(t) ? 'draw' : /hammer|mallet|club|axe/.test(t) ? 'smash' : /ball|rock|stone|egg/.test(t) ? 'throw'
    : /flower|hat|book|cup|key|heart/.test(t) ? 'none' : 'swing';
  const strokes = shape.map((st) => ({ pts: st.map((p) => [(grip - p.y) * size, p.x * size] as [number, number]), color, width: 2.6 }));
  const def = parseItemDef({ id: `drawn-${t.replace(/[^a-z0-9]+/g, '-') || 'thing'}`, name: title || 'drawing', about: 'He drew it, and it came to life.', use, length: (grip + 0.5) * size, grip: (0.5 - grip) * size, belt: 'back', hit: use === 'swing' ? 0.8 : 0, shape: strokes })!;
  def.drawn = true;
  return def;
}

/** What a brand-new him starts with (everything else is in his inventory for you to hand out). */
export const STARTER_ITEMS = ['pen'];

/** The items that come with him. */
export const BUILTIN_ITEMS: ItemDef[] = [blanketDef,snackDef,penDef, swordDef, ballDef, maceDef, helmetDef, bootsDef, foamDef, katanaDef, bowDef, gunDef, bookDef, cupDef, dumbbellDef, yoyoDef, spongeDef, eraserDef, bucketDef, handheldDef, consoleDef].map((d) => parseItemDef(d)!);

/** Belt slots: 0 = his left hip, 1 = his right hip, 2 = his back, 3 = his pocket (small things, out of sight). */
export const SLOT_NAMES = Array.from({ length: 16 }, (_, i) => `satchel ${i + 1}`);
const SLOTS = SLOT_NAMES.length;
/** Which slots each kind of thing likes, best first. */
const PREFER: Record<BeltSpot, number[]> = { side: [1, 0, 2], back: [2, 1, 0], pocket: [3, 0, 1], none: [] };
export const preferredSlots = (d: ItemDef) => [...new Set([...PREFER[d.belt], ...Array.from({ length: SLOTS }, (_, i) => i)])];

let nextUid = 1;
export interface ItemPose { at: V3; dir: V3; scale: number; mirror?: boolean }

export class Item {
  readonly uid = nextUid++;
  where: 'belt' | 'hand' | 'worn' | 'world' | 'cursor' = 'world';
  poses: ItemPose[] = [];
  slot = -1;
  hand: 'L' | 'R' = 'R';
  /** Where his hand (or your cursor) grips it, and which way it points (unit vector), right now. */
  at: V3 = { x: 0, y: 0, z: 0 };
  dir: V3 = { x: 0, y: 1, z: 0 };
  /** While it's in his hand, a skill can point it this way (else it follows his forearm). */
  aim: V3 | null = null;
  /** Aimed in his own frame instead ([forward, up]): turns with him (a sword in a fight, through a spin). */
  aimLocal: [number, number] | null = null;
  /** A bow being drawn: where its string is pulled back to (his hand), or null (the string's straight). */
  pull: V3 | null = null;
  /** Physics for when it's lying around or dangling from your cursor: a = grip, b = tip. */
  readonly a: Point; readonly b: Point;
  private contour: Vec[] = [];
  private contourDef: ItemDef | null = null;
  private readonly sticks: Stick[];
  /** How fast its tip is moving (px/s), and which way (px/s), for hits. */
  /** Pistol magazine stays with the item across bursts and saves. */
  ammo = 6;
  /** Reload belongs to this gun, so interrupted bursts can resume rather than restart it. */
  reloadRemaining = 0;
  beginReload() {
    if (this.def.use !== 'gun' || this.ammo >= 6 || this.reloadRemaining > 0) return false;
    this.reloadRemaining = 1.15;
    return true;
  }
  tickReload(dt: number) {
    if (this.reloadRemaining <= 0) return;
    this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
    if (!this.reloadRemaining) this.ammo = 6;
  }
  ink?: InkProject;
  arcade: Runner | null = null;
  /** A user controller owns its pose while aiming/swinging. */
  cursorControlled = false;
  working = false;
  bookOpen = 0;
  bookTarget = 0;
  bookPage = 0;
  bookmark = 0;
  bookReading = false;
  yoyoDrop = 0;
  blanketSpread=0;snackOpen=0;snackAt:Vec|null=null;
  shelf: { key: string; slot: number } | null = null;
  tickBook(dt: number) {
    this.bookOpen += clamp(this.bookTarget - this.bookOpen, -dt * 1.8, dt * 1.8);
    if (this.animatedBook) this.sticks[0].len = this.physicalLength * this.scale;
  }
  tipSpeed = 0;
  tipVel: Vec = { x: 0, y: 0 };
  private lastTip: V3 | null = null;
  private previousTip: V3 | null = null;
  /** He threw it (it's flying at something): when, so it only counts as a throw for a moment. */
  thrownAt = -10;
  /** Who sent it flying. Something you threw never hits your own cursor (it leaves your hand right there). */
  thrownBy: 'him' | 'you' = 'him';

  constructor(
    public def: ItemDef,
    at: Vec = { x: 0, y: 0 },
    public scale = 1,
  ) {
    this.a = makePoint(at.x, at.y, 2);
    this.b = makePoint(at.x, at.y + def.length * scale, 2);
    this.sticks = [{ a: this.a, b: this.b, len: def.length * scale }];
    this.at = { x: at.x, y: at.y, z: 0 };
  }

  private get physicalLength() { return this.animatedBook ? 12 + 12 * this.bookOpen : this.def.length; }
  get tip(): V3 { return add3(this.at, scale3(this.dir, this.physicalLength * this.scale)); }
  get butt(): V3 { return add3(this.at, scale3(this.dir, -this.def.grip * this.scale)); }

  /** Start physics from where it is now, moving at (vx, vy). */
  loosen(vx = 0, vy = 0, dt = 1 / 120) {
    const tip = this.tip;
    Object.assign(this.a, { x: this.at.x, y: this.at.y, z: this.at.z, px: this.at.x - vx * dt, py: this.at.y - vy * dt, pz: this.at.z });
    Object.assign(this.b, { x: tip.x, y: tip.y, z: tip.z, px: tip.x - vx * dt, py: tip.y - vy * dt, pz: tip.z });
    this.sticks[0].len = this.physicalLength * this.scale;
  }

  step(dt: number, bounds: Bounds, platforms: Platform[], solids: Thing[] = []) {
    integrate([this.a, this.b], dt, 0.995);
    this.a.grounded = this.b.grounded = false;
    const bounce = this.def.bounce, grip = bounce > 0.6 ? 0.05 : 0.5;
    for (let i = 0; i < 4; i++) {
      solveSticks(this.sticks);
      collide([this.a, this.b], bounds, grip, bounce);
      collidePlatforms([this.a, this.b], platforms, grip, bounce * 0.85);
    }
    this.collideArt(bounds, platforms, solids);
    this.at = { x: this.a.x, y: this.a.y, z: this.a.z };
    this.dir = norm3(sub3(this.b, this.a));
  }

  private hull(previous = false) {
    // Custom definitions can be reloaded while their existing item stays in the world.
    if (this.contourDef !== this.def || this.animatedBook && this.contourOpen !== this.bookOpen) {
      const { sprite, shape } = this.def;
      this.contour = convexHull([
        ...(this.animatedBook ? bookShape(this.bookOpen) : shape).flatMap((st) => paddedVertices(st.pts, st.width)),
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
      this.contourDef = this.def;
      this.contourOpen = this.bookOpen;
    }
    const a = previous ? { x: this.a.px, y: this.a.py } : this.a;
    const b = previous ? { x: this.b.px, y: this.b.py } : this.b;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len;
    return this.contour.map((p) => ({
      x: a.x + (ux * p.x - uy * p.y) * this.scale,
      y: a.y + (uy * p.x + ux * p.y) * this.scale,
    }));
  }

  get collisionHull() { return this.hull(); }

  private contourOpen = -1;
  private domesticDef:ItemDef|null=null;private domesticStock=false;
  get animatedDomestic(){if(this.domesticDef!==this.def){this.domesticDef=this.def;const stock=BUILTIN_ITEMS.find(d=>d.id===this.def.id);this.domesticStock=!!stock&&['blanket','snack-box'].includes(stock.id)&&!this.def.sprite&&JSON.stringify(stock.shape)===JSON.stringify(this.def.shape);}return this.domesticStock;}
  private bookDefCache: ItemDef | null = null;
  private bookAnimatedCache = false;
  /** Animate stock art only. Edited/custom covers keep their definition and collision geometry. */
  get animatedBook() {
    if (this.bookDefCache !== this.def) {
      this.bookDefCache = this.def;
      this.bookAnimatedCache = this.def.id === 'book' && !this.def.sprite &&
        JSON.stringify(this.def.shape) === JSON.stringify(BUILTIN_ITEMS.find(d => d.id === 'book')!.shape);
    }
    return this.bookAnimatedCache;
  }

  private moveCollision(dx: number, dy: number, normal: Vec) {
    for (const p of [this.a, this.b]) {
      const vx = p.x - p.px,
        vy = p.y - p.py,
        into = vx * normal.x + vy * normal.y;
      p.x += dx;
      p.y += dy;
      p.px += dx;
      p.py += dy;
      if (into < 0) {
        p.px += normal.x * into * (1 + this.def.bounce * 0.5);
        p.py += normal.y * into * (1 + this.def.bounce * 0.5);
      }
      if (normal.y < -0.5) {
        p.px += (p.x - p.px) * (this.def.bounce > 0.6 ? 0.03 : 0.45);
        p.grounded = true;
      }
    }
  }

  /** The entire visible item participates in floor/wall/furniture contact, not just its grip and tip. */
  private collideArt(bounds: Bounds, platforms: Platform[], solids: Thing[]) {
    const delta={x:this.a.x-this.a.px,y:this.a.y-this.a.py};
    if(Math.hypot(delta.x,delta.y)>3) {
      const was=this.hull(true);let first:ReturnType<typeof sweepConvex>=null;
      for(const solid of solids)if(solid.rigid&&!solid.held)for(const hull of solid.collisionHulls){
        const hit=sweepConvex(was,hull,delta);if(hit&&(!first||hit.time<first.time))first=hit;
      }
      if(first)this.moveCollision(-delta.x*(1-first.time),-delta.y*(1-first.time),first.normal);
    }
    for (const solid of solids) {
      if (!solid.rigid) continue;
      const offset = solid.contactOffset(this.hull());
      if (offset) {
        const len = Math.hypot(offset.x, offset.y);
        this.moveCollision(offset.x, offset.y, {
          x: offset.x / len,
          y: offset.y / len,
        });
      }
    }
    const hull = this.hull(),
      was = this.hull(true);
    let up = Math.max(0, ...hull.map((p) => p.y - bounds.floor));
    for (const pl of platforms)
      for (let i = 0; i < hull.length; i++) {
        const p = hull[i],
          previous = was[i];
        if (
          p.x < pl.x1 ||
          p.x > pl.x2 ||
          previous.y > platY(pl, previous.x) + 2 ||
          p.y <= platY(pl, p.x)
        )
          continue;
        up = Math.max(up, p.y - platY(pl, p.x));
      }
    if (up > 0) this.moveCollision(0, -up, { x: 0, y: -1 });
    const left = Math.min(...hull.map((p) => p.x)),
      right = Math.max(...hull.map((p) => p.x));
    if (left < bounds.left)
      this.moveCollision(bounds.left - left, 0, { x: 1, y: 0 });
    else if (right > bounds.right)
      this.moveCollision(bounds.right - right, 0, { x: -1, y: 0 });
  }

  /** Other owners remain snapshots: each owner resolves only its own loose items. */
  separateHull(hull: Vec[]) {
    const offset = overlapOffset(this.hull(), hull);
    if (!offset) return;
    const length = Math.hypot(offset.x, offset.y);
    if (length < 0.01 || (offset.y / length > 0.5 && [this.a, this.b].some(p=>p.grounded))) return;
    this.moveCollision(offset.x, offset.y, {x:offset.x/length,y:offset.y/length});
  }

  separateItem(other: Item) {
    if (this.shelf || other.shelf) return;
    const offset = overlapOffset(this.hull(), other.hull());
    if (!offset) return;
    const length = Math.hypot(offset.x,offset.y);
    if (length < 0.01) return;
    const normal = {x:offset.x/length,y:offset.y/length};
    const blocked = (it: Item, ny: number) => ny > 0.5 && [it.a,it.b].some(p=>p.grounded);
    const wa = blocked(this,normal.y) ? 0 : 1, wb = blocked(other,-normal.y) ? 0 : 1;
    if (!(wa+wb)) return;
    if (wa) this.moveCollision(offset.x*wa/(wa+wb),offset.y*wa/(wa+wb),normal);
    if (wb) other.moveCollision(-offset.x*wb/(wa+wb),-offset.y*wb/(wa+wb),{x:-normal.x,y:-normal.y});
  }

  /** Forget how it was moving (after it jumps somewhere new, like from his belt to your cursor). */
  resetMotion() { this.lastTip = null; this.previousTip = null; this.tipSpeed = 0; this.tipVel = { x: 0, y: 0 }; }

  /** Keep track of how fast the tip moves (for hits). */
  measure(dt: number) {
    const tip = this.tip;
    this.previousTip = this.lastTip;
    if (this.lastTip && dt > 0) this.tipVel = { x: (tip.x - this.lastTip.x) / dt, y: (tip.y - this.lastTip.y) / dt };
    else this.tipVel = { x: 0, y: 0 };
    this.tipSpeed = Math.hypot(this.tipVel.x, this.tipVel.y);
    this.lastTip = tip;
  }

  /** How fast it's flying (lying around / thrown), px/s. */
  get speed() { return Math.hypot(this.a.x - this.a.px, this.a.y - this.a.py) * 120; }
  /** Give it a shove while it's lying around (a kick, a sword hit). */
  push(vx: number, vy: number) {
    if (this.where !== 'world') return;
    for (const p of [this.a, this.b]) { p.px = p.x - vx / 120; p.py = p.y - vy / 120; }
  }

  /** Distance from (x, y) to the item on screen. */
  distTo(x: number, y: number) {
    const poses = this.where === 'worn' ? this.poses : [this];
    return Math.min(
      ...poses.map((pose) => {
        const dx = x - pose.at.x,
          dy = y - pose.at.y,
          len = Math.hypot(pose.dir.x, pose.dir.y) || 1;
        const ux = pose.dir.x / len,
          uy = pose.dir.y / len;
        const point = {
          x: (dx * ux + dy * uy) / pose.scale,
          y: (-dx * uy + dy * ux) / pose.scale,
        };
        if (this.def.sprite) {
          const s = this.def.sprite,
            localX = point.x * ('mirror' in pose && pose.mirror ? -1 : 1);
          const right = s.x + s.rows[0].length * s.pixel,
            bottom = s.y + s.rows.length * s.pixel;
          return (
            Math.hypot(
              Math.max(s.x - localX, 0, localX - right),
              Math.max(s.y - point.y, 0, point.y - bottom),
            ) * pose.scale
          );
        }
        const reading=this.animatedBook&&this.bookReading&&this.where==='hand';
        if(reading||this.animatedDomestic&&this.working&&this.where==='hand')point.y*=Math.sign(pose.dir.x)||1;
        const shape=this.animatedBook?bookShape(this.bookOpen,this.bookPage,reading):this.animatedDomestic?domesticShape(this):this.def.shape;
        let distance = Infinity;
        for (const stroke of shape) {
          const points = stroke.pts.map(([x, y]) => ({ x, y }));
          if (stroke.fill)
            distance = Math.min(distance, polygonDistance(point, points));
          for (let i = 1; i < points.length; i++)
            distance = Math.min(
              distance,
              Math.max(
                0,
                segmentDistance(point, points[i - 1], points[i]) -
                  stroke.width / 2,
              ),
            );
        }
        return distance * pose.scale;
      }),
    );
  }

  /** Fast swings can cross a cursor between frames. Include the path of the tip. */
  sweptDistTo(x: number, y: number) {
    if (!this.previousTip) return this.distTo(x, y);
    const a = this.previousTip, b = this.tip, dx = b.x - a.x, dy = b.y - a.y;
    const u = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.min(this.distTo(x, y), Math.hypot(x - a.x - dx * u, y - a.y - dy * u));
  }

  get drawPadding() {
    const s = this.def.sprite;
    const spritePad = s ? Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.x + s.rows[0].length * s.pixel), Math.abs(s.y + s.rows.length * s.pixel)) : 0;
    return Math.max(this.blanketSpread?38:0,this.snackOpen?30:0,6 + this.yoyoDrop, spritePad, ...this.def.shape.flatMap((s) => s.pts.map((p) => Math.max(Math.abs(p[1]), -p[0]) + s.width / 2))) * this.scale;
  }
}

/** Everything he owns (and what you took), where it is, and moving it between places. */
export class Items {
  defs = new Map<string, ItemDef>(BUILTIN_ITEMS.map((d) => [d.id, d]));
  list: Item[] = [];
  /** What's in each belt slot. */
  belt: (Item | null)[] = Array(SLOTS).fill(null);
  private rummage: { hand: 'L' | 'R'; left: number } | null = null;
  get satchelOpen() { return this.rummage ? Math.sin(this.rummage.left / 0.45 * Math.PI) : 0; }
  /** The built-in things he's been given (so new ones that come with an update get handed to him once). */
  known = new Set<string>();
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
    if (def.wear) {
      const owned = this.list.find((it) => it.def.id === def.id);
      if (owned) { if (owned.where !== 'worn') this.stow(owned); return owned; }
    }
    const it = new Item(def, { x: ch.x, y: ch.body.j.hip.y }, ch.scale);
    this.list.push(it);
    if (!this.stow(it)) { it.where = 'world'; it.at = { x: ch.x + ch.facing * 20, y: ch.body.j.hip.y, z: 0 }; it.loosen(ch.facing * 60, -150); }
    this.onChange?.();
    return it;
  }

  remove(it: Item) {
    if (!this.list.includes(it)) return;
    this.unslot(it);
    this.list = this.list.filter((x) => x !== it);
    this.onChange?.();
  }

  /** Put it in a belt slot (its favorite free one). False if the belt is full or it doesn't go on a belt. */
  stow(it: Item): boolean {
    if (!this.list.includes(it)) return false;
    if (it.def.wear) {
      const other = this.list.find((x) => x !== it && x.where === 'worn' && x.def.wear === it.def.wear);
      if (other) this.drop(other, 0, -60);
      this.unslot(it); it.where = 'worn'; it.aim = null; it.aimLocal = null;
      this.onChange?.(); return true;
    }
    if (it.where === 'belt') return true;
    it.bookTarget = 0; it.shelf = null;
    const slot = preferredSlots(it.def).find((s) => !this.belt[s]);
    if (slot === undefined) return false;
    if (it.where === 'hand') this.rummage = { hand: it.hand, left: 0.45 };
    this.unslot(it);
    this.belt[slot] = it; it.slot = slot; it.where = 'belt'; it.aim = null; it.aimLocal = null;
    this.onChange?.();
    return true;
  }

  private unslot(it: Item) { if (it.slot >= 0 && this.belt[it.slot] === it) this.belt[it.slot] = null; it.slot = -1; }

  /** One combat tool owns the hands. Stow other held things, dropping only if storage is full. */
  wield(it: Item, hand: 'L' | 'R') {
    if (!this.list.includes(it)) return;
    for (const other of this.list)
      if (other !== it && other.where === 'hand' && !this.stow(other))
        this.drop(other, 0, -40);
    this.toHand(it, hand);
  }

  /** Into his hand. */
  toHand(it: Item, hand: 'L' | 'R') {
    if (!this.list.includes(it)) return;
    const other = this.inHand(hand);
    if (other && other !== it && !this.stow(other)) this.drop(other, 0, 0);
    if (it.where === 'belt') this.rummage = { hand, left: 0.45 };
    this.unslot(it);
    it.where = 'hand'; it.hand = hand; it.aim = null; it.aimLocal = null;
    this.onChange?.();
  }

  /** Let go of it: it falls from where it is with this speed. */
  drop(it: Item, vx: number, vy: number) {
    if (!this.list.includes(it)) return;
    this.unslot(it);
    it.bookTarget = 0; it.shelf = null;
    it.where = 'world'; it.cursorControlled = false; it.pull = null; it.aim = null; it.aimLocal = null;
    it.loosen(vx, vy);
    this.onChange?.();
  }

  /** You take it: it dangles from your cursor. */
  toCursor(it: Item, at: Vec) {
    if (!this.list.includes(it)) return;
    this.unslot(it);
    it.bookTarget = 0; it.shelf = null;
    it.where = 'cursor'; it.cursorControlled = false; it.pull = null; it.aim = null; it.aimLocal = null;
    it.at = { x: at.x, y: at.y, z: 30 };
    it.dir = { x: 0, y: 1, z: 0 };
    this.lastCursor = null; this.cursorV = { x: 0, y: 0 };
    it.resetMotion();
    it.loosen();
    this.onChange?.();
  }

  inHand(hand: 'L' | 'R') { return this.list.find((x) => x.where === 'hand' && x.hand === hand) ?? null; }
  /** The item your cursor is carrying, if any. */
  get carried() { return this.list.find((x) => x.where === 'cursor') ?? null; }
  /** Things on him (belt or hands). */
  get onHim() { return this.list.filter((x) => x.where === 'belt' || x.where === 'hand' || x.where === 'worn'); }
  /** The first item of his that does this (on him first, then lying around, then with you). */
  find(use: ItemUse) {
    const order = { hand: 0, belt: 1, worn: 1, world: 2, cursor: 3 } as const;
    return this.list.filter((x) => x.def.use === use).sort((a, b) => order[a.where] - order[b.where])[0] ?? null;
  }

  /** A brand-new him gets his starter things (just his pen). Older saves keep what they have. */
  giveStarter(ch: Character) {
    for (const id of STARTER_ITEMS) if (!this.known.has(id)) { this.known.add(id); if (!this.list.some((it) => it.def.id === id)) this.give(id, ch); }
  }

  /** A new thing appears in the world at `at` (you dropped it in from your inventory). */
  spawn(defId: string, at: Vec, scale: number): Item | null {
    const def = this.defs.get(defId);
    if (!def) return null;
    const it = new Item(def, at, scale);
    this.list.push(it);
    it.where = 'world';
    it.at = { x: at.x, y: at.y, z: 0 };
    it.dir = norm3({ x: 0.4, y: 1, z: 0 });
    it.loosen((Math.random() - 0.5) * 80, 60);
    this.onChange?.();
    return it;
  }

  /** Legacy slot numbers remain in saves; all stored tools now live at the satchel opening. */
  slotPose(ch: Character, _slot: number): { at: V3; dir: V3 } {
    return { at: satchelAt(ch), dir: { x: 0, y: 1, z: 0 } };
  }

  /** Physics for the things lying around (and flying through the air): one fixed step. */
  stepWorld(dt: number, bounds: Bounds, platforms: Platform[], solids: Thing[] = [], peerHulls: Vec[][] = []) {
    for (const it of [...this.list]) if (it.where === 'world') {
      if (it.ink && it.ink.remaining >= 0) { it.ink.remaining = Math.max(0, it.ink.remaining - dt); if (!it.ink.remaining) { this.remove(it); continue; } }
      const shelf = it.shelf && solids.find(t => t.storageKey === it.shelf!.key && t.def?.id === 'bookshelf');
      if (shelf && !shelf.held && Math.abs(shelf.tilt) < 0.35 && !it.working) {
        const at = shelf.toWorld(10 + it.shelf!.slot * 15, 35);
        it.at = { ...at, z: 6 }; it.dir = { x: 1, y: 0, z: 0 }; it.loosen();
      } else {
        if (it.shelf && (!shelf || shelf.held || Math.abs(shelf.tilt) >= 0.35)) it.shelf = null;
        it.step(dt, bounds, platforms, solids);
      }
    }
    const loose = this.list.filter(it=>it.where === 'world' && !it.shelf);
    for (let pass=0;pass<3;pass++) {
      for(let i=0;i<loose.length;i++) for(let j=i+1;j<loose.length;j++) loose[i].separateItem(loose[j]);
      for(const it of loose) for(const hull of peerHulls) it.separateHull(hull);
    }
  }

  /** Move every item to where it belongs this frame (loose ones move in `stepWorld`). */
  update(ch: Character, dt: number, bounds: Bounds, platforms: Platform[], cursor: Vec | null) {
    if (this.rummage) { this.rummage.left -= dt; if (this.rummage.left <= 0) this.rummage = null; }
    ch.satchelReach = this.rummage ? { hand: this.rummage.hand, at: satchelAt(ch), amount: this.satchelOpen } : null;
    const j = ch.body.j;
    for (const it of this.list) {
      // One clock for every owned gun, including idle hands, full bags and passive transport.
      it.tickReload(dt);
      it.tickBook(dt);
      it.scale = ch.scale;
      if (it.where === 'worn') {
        it.poses = equipmentPoses(it, ch);
        const pose = it.poses[0];
        if (pose) { it.at = pose.at; it.dir = pose.dir; }
      } else if (it.where === 'belt') {
        const p = this.slotPose(ch, it.slot);
        it.at = p.at; it.dir = p.dir;
      } else if (it.where === 'hand') {
        const arm = it.hand === 'L' ? 'armL' : 'armR';
        if (!ch.hasLimb(arm)) { this.drop(it, 0, -100); continue; } // the arm came off: it falls
        const hand = j[it.hand === 'L' ? 'handL' : 'handR'], elbow = j[it.hand === 'L' ? 'elbowL' : 'elbowR'];
        it.at = { x: hand.x, y: hand.y, z: hand.z };
        it.dir = it.aimLocal ? norm3(ch.dirToWorld(it.aimLocal[0], it.aimLocal[1])) : it.aim ? norm3(it.aim) : norm3(sub3(hand, elbow));
      } else if (it.where === 'world') {
        it.at = { x: it.a.x, y: it.a.y, z: it.a.z };
        it.dir = norm3(sub3(it.b, it.a));
      } else if (it.where === 'cursor') {
        if (cursor && !it.cursorControlled) this.followCursor(it, cursor, dt);
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
    it.loosen(this.cursorV.x, this.cursorV.y);
  }

  /** Which loose item (lying around) is under (x, y)? */
  hitWorld(x: number, y: number, pad = 7) { return this.list.find((it) => it.where === 'world' && it.distTo(x, y) < pad) ?? null; }

  // ── saving: what he owns and where (anything lying around or with you goes back on his belt) ──
  save() {
    return this.list.map(it => ({ id: it.def.id, bookmark: it.bookmark, slot: it.where === 'belt' ? it.slot : -1, worn: it.where === 'worn', ...(it.where === 'world' ? { world: { at: it.at, dir: it.dir } } : {}), ...(it.ink ? { ink: it.ink } : {}), ...(it.shelf ? { shelf: it.shelf } : {}), ...(it.def.use === 'gun' ? { ammo: it.ammo, reloadRemaining: it.reloadRemaining } : {}), def: it.def.drawn || !BUILTIN_ITEMS.some(d => d.id === it.def.id) ? it.def : undefined }));
  }
  /**
   * `known`: the built-ins he'd been given when this was saved. Missing (an older save) means
   * just the first two (his pen and sword); anything newer gets handed to him.
   */
  load(data: unknown, ch: Character, known?: unknown) {
    if (!Array.isArray(data)) return;
    this.known = new Set(Array.isArray(known) ? known.filter((k): k is string => typeof k === 'string') : ['pen', 'sword']);
    this.list = []; this.belt = Array(SLOTS).fill(null);
    for (const d of data.slice(0, 40)) {
      if (!d || typeof d !== 'object') continue;
      const o = d as { id?: string; slot?: number; worn?: boolean; bookmark?:number; ammo?:number; reloadRemaining?: number; shelf?: { key?: string; slot?: number }; ink?:unknown; world?:{at?:V3;dir?:V3}; def?: unknown };
      const def = o.def ? parseItemDef(o.def) : this.defs.get(String(o.id));
      if (!def) continue;
      if (o.def && o.ink) def.drawn = true;
      const it = new Item(def, { x: ch.x, y: ch.body.j.hip.y }, ch.scale);
      if(Number.isInteger(o.bookmark))it.bookmark=clamp(o.bookmark!,0,9999);
      if(def.use==='gun' && Number.isInteger(o.ammo))it.ammo=Math.max(0,Math.min(6,o.ammo!));
      if (def.use === 'gun' && Number.isFinite(o.reloadRemaining)) it.reloadRemaining = clamp(o.reloadRemaining!, 0, 1.15);
      this.list.push(it);
      it.ink = parseProject(o.ink);
      if (def.id === 'book' && typeof o.shelf?.key === 'string' && /^[a-z0-9-]{1,60}$/.test(o.shelf.key) && Number.isInteger(o.shelf.slot))
        it.shelf = { key: o.shelf.key, slot: clamp(o.shelf.slot!, 0, 4) };
      if (o.world && Number.isFinite(o.world.at?.x) && Number.isFinite(o.world.at?.y)) {
        it.where = 'world'; it.at = { x: clamp(o.world.at!.x, ch.bounds.left, ch.bounds.right), y: clamp(o.world.at!.y, ch.bounds.top, ch.bounds.floor), z: 0 };
        if (Number.isFinite(o.world.dir?.x) && Number.isFinite(o.world.dir?.y)) it.dir = norm3({x: o.world.dir!.x, y: o.world.dir!.y, z: 0});
        it.loosen();
      } else if (def.wear && o.worn === false) {
        it.where = 'world'; it.at = { x: ch.x + ch.facing * 30 * ch.scale, y: ch.bounds.floor - 22 * ch.scale, z: 0 }; it.loosen();
      } else if (typeof o.slot === 'number' && o.slot >= 0 && o.slot < SLOTS && !this.belt[o.slot] && def.belt !== 'none') { this.belt[o.slot] = it; it.slot = o.slot; it.where = 'belt'; }
      else if (!this.stow(it)) { it.where = 'world'; it.at = { x: ch.x + 20, y: ch.body.j.hip.y, z: 0 }; it.loosen(); }
    }
    this.giveStarter(ch);
  }
}

/** Small stock-art poses, in the same pixelated item frame. */
function domesticShape(it:Item):ItemStroke[]{
  if(it.def.id==='blanket'){
    const u=it.blanketSpread,w=32+16*u,h=15+22*u;
    return [
      {pts:[[-8,-4],[-8+w,-4],[-8+w,-4+h],[-8,-4+h]],color:'#858eb6',fill:'#858eb6',width:0},
      {pts:[[-6,-2],[-10+w,-2],[-10+w,1],[-6,1]],color:'#adb8d6',fill:'#adb8d6',width:0},
      {pts:[[-5,h-10],[w-13,h-10],[w-13,h-8],[-5,h-8]],color:'#626d99',fill:'#626d99',width:0},
    ];
  }
  return it.def.shape.map((st,i)=>i===1?{...st,pts:st.pts.map(([x,y])=>[x,y-it.snackOpen*12] as [number,number])}:st);
}

/** Draw an item along its current direction. Smooth lines (the pixel layer can pixelate it). */
export function drawItem(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, it: Item, alpha = 1, pose: ItemPose = it) {
  if (it.ink && it.ink.remaining >= 0) alpha *= Math.max(0.15, Math.min(1, it.ink.remaining / 15));
  const sc = pose.scale, d = pose.dir;
  // "across" = sideways to the item on screen.
  let ax = -d.y, ay = d.x;
  const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (it.def.sprite) {
    const mirror = pose.mirror ? -1 : 1;
    ctx.save(); ctx.translate(pose.at.x, pose.at.y); ctx.transform(d.x * sc * mirror, d.y * sc * mirror, ax * sc, ay * sc, 0, 0);
    drawSprite(ctx, it.def.sprite); ctx.restore();
  }
  if (it.def.use === 'play' && it.yoyoDrop > 0) {
    ctx.strokeStyle = '#eee6ce'; ctx.lineWidth = sc;
    ctx.beginPath(); ctx.moveTo(pose.at.x, pose.at.y);
    ctx.lineTo(pose.at.x, pose.at.y + it.yoyoDrop * sc); ctx.stroke();
    pose = { ...pose, at: { ...pose.at, y: pose.at.y + it.yoyoDrop * sc } };
  }
  const m = pose.mirror ? -1 : 1;
  const domestic=it.animatedDomestic&&it.working&&it.where==='hand';
  const reading = it.animatedBook && it.bookReading && it.where === 'hand';
  for (const st of it.animatedBook ? bookShape(it.bookOpen, it.bookPage, reading) : it.animatedDomestic ? domesticShape(it) : it.def.shape) {
    ctx.beginPath();
    st.pts.forEach(([along, across], i) => {
      const acrossView = reading || domestic ? across * (Math.sign(d.x) || 1) : across;
      const x = pose.at.x + d.x * along * m * sc + ax * acrossView * sc, y = pose.at.y + d.y * along * m * sc + ay * acrossView * sc;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (st.fill) { ctx.closePath(); ctx.fillStyle = st.fill; ctx.fill(); }
    if (st.width) { ctx.strokeStyle = st.color; ctx.lineWidth = st.width * sc; ctx.stroke(); }
  }
  if(it.snackAt&&it.animatedDomestic){ctx.fillStyle='#e8c18b';ctx.fillRect(it.snackAt.x-2*sc,it.snackAt.y-2*sc,4*sc,4*sc);}
  if(it.arcade){
    ctx.save();ctx.translate(pose.at.x,pose.at.y);ctx.transform(d.x*sc,d.y*sc,ax*sc,ay*sc,0,0);
    ctx.fillStyle='#203b2d';ctx.fillRect(3,-8,16,13);ctx.fillStyle='#b5d47f';
    ctx.fillRect(6,2-it.arcade.y*11,2,3);
    for(const b of it.arcade.blocks)ctx.fillRect(3+b.x*16,3-b.h*13,2,b.h*13);
    ctx.restore();
  }
  ctx.restore();
}

/** Current attachment frames, shared by physics/input and drawing. */
export function equipmentPoses(it: Item, ch: Character): ItemPose[] {
  const j = ch.body.j;
  if (it.def.wear === 'head') {
    const up = norm3(sub3(j.head, j.neck));
    return [{ at: { x: j.head.x, y: j.head.y, z: j.head.z + 0.5 }, dir: { x: -up.y, y: up.x, z: 0 }, scale: ch.d.headR / 11.25 }];
  }
  return (['L', 'R'] as const).filter((side) => ch.hasLimb(side === 'L' ? 'legL' : 'legR')).map((side) => {
    const foot = j[side === 'L' ? 'footL' : 'footR'], knee = j[side === 'L' ? 'kneeL' : 'kneeR'];
    const down = norm3(sub3(foot, knee));
    // Drawn just in front of its own leg (legs are sorted by the middle of the shin and thigh), so the
    // leg never shows through the boot, while the other leg can still pass in front of it.
    const legZ = (knee.z + foot.z) / 2;
    return { at: { x: foot.x, y: foot.y, z: Math.max(foot.z, legZ) + 0.05 }, dir: { x: down.y, y: -down.x, z: 0 }, scale: ch.scale, mirror: ch.facing < 0 };
  });
}

/** Worn gear gets one depth-sorted part per attachment (one helmet, two boots). */
export function itemParts(it: Item, ch?: Character): DepthPart[] {
  const poses = it.where === 'worn' ? ch ? equipmentPoses(it, ch) : it.poses : [it];
  return poses.map((pose) => {
    const pad = it.drawPadding * pose.scale / it.scale;
    return {
      z: it.bookReading && it.where === 'hand' && ch
        ? Math.max(ch.body.j.hip.z, ch.body.j.neck.z, pose.at.z) + 6
        : (it.where === 'worn' ? pose.at.z : (it.butt.z + it.tip.z) / 2) + (it.where === 'hand' ? 0.5 : it.where === 'belt' ? -0.3 : 0),
      pts: [
        { x: pose.at.x - pad, y: pose.at.y - pad },
        { x: pose.at.x + pad, y: pose.at.y + pad },
        { x: pose.at.x + pose.dir.x * it.def.length * pose.scale, y: pose.at.y + pose.dir.y * it.def.length * pose.scale },
      ],
      draw: (g) => drawItem(g, it, 1, pose),
    };
  });
}
