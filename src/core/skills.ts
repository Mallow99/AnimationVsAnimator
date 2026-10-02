// Skills: small, named behaviors built on the character's commands.
// The mind (offline instinct now, an LLM later) only ever picks skills —
// it never moves joints directly.

import type { Character, Gesture, Keyframe } from './character';
import type { Mood } from './mood';
import { GRAVITY, type Bounds, type Platform } from './physics';
import { surfaceBelow, type Wall } from './world';
import { SHAPES, type Doodle } from './doodles';
import { chance, clamp, pick, rand, sign, type Vec } from './math';
import type { Memory } from './memory';
import type { LimbId } from './body';
import type { Item, Items, ItemUse } from './items';

export type LookMode = 'default' | 'cursor' | 'away' | 'down' | 'none' | 'target';

export interface World {
  bounds: Bounds;
  cursor: Vec | null;
  cursorMovedAt: number; // world.time when the cursor last moved
  time: number;          // seconds since start
  platforms: Platform[]; // window tops he can stand on
  walls: Wall[];         // window sides and screen edges he can climb
}

/** Things he has learned from experience. Saved between runs. */
export interface Lessons {
  /** Biggest drop (px, at size 1) he's willing to jump down. Shrinks when a jump down hurts him. */
  safeDrop: number;
}
export const DEFAULT_LESSONS: Lessons = { safeDrop: 420 };

/** Everything a skill can see and touch. */
export interface Ctx {
  char: Character;
  mood: Mood;
  world: World;
  look: LookMode;
  lessons: Lessons;
  say(text: string, secs?: number): void;
  /** Drawings on screen (shared with the renderer). */
  doodles: Doodle[];
  /** Ink color for his pen. */
  inkColor: string;
  /** Move the real mouse cursor (only in mischief mode on a desktop). Returns false if not allowed. */
  moveCursor(x: number, y: number): boolean;
  /** Set when you yank the cursor back while he's holding it. */
  cursorEscaped: boolean;
  /** Mischief mode is on and this desktop can move the cursor. */
  canGrabCursor: boolean;
  /** He finished a drawing (the pet keeps it in his gallery). */
  onDrawn?: (d: Doodle) => void;
  /** Moves he learned (made up by his AI brain, kept by you). He can show them off on his own. */
  savedMoves?: { name: string; frames: Keyframe[] }[];
  /** His notes about you and his life (milestone 5). */
  memory: Memory;
  /** What he looks at when `look` is 'target'. */
  lookTarget?: Vec | null;
  /** His belt and everything on it (and anything you took). */
  items: Items;
  /** A sound effect (the app plays it). */
  sound?: (name: string, strength?: number) => void;
  /** His sword hit your cursor. */
  hitCursor?: (x: number, y: number, dir: number) => void;
}

export abstract class Skill {
  abstract readonly name: string;
  t = 0;
  start(_c: Ctx) {}
  /** Called every frame. Return true when finished. */
  abstract update(c: Ctx, dt: number): boolean;
  stop(_c: Ctx) {}
}

// ───────────── Sequence: a little script of steps ─────────────
// Most reactions are just sequences, e.g. face the cursor → "!!" → stomp.
// Later, the LLM brain will be able to write these too.

export type Step =
  | { say: string; secs?: number }
  | { gesture: Gesture; atCursor?: boolean }
  | { wait: number }
  | { walkTo: 'cursor' | 'away' | 'edge' | number; run?: boolean }
  | { jump: number; vx?: number | 'cursor' }
  | { face: 'cursor' | 'away' | 'flip' }
  | { look: LookMode }
  | { sit: number }
  | { pop: LimbId }
  | { flip: 1 | -1 }
  | { roll: true };

export class Sequence extends Skill {
  private i = 0;
  private stepT = 0;
  private begun = false;
  constructor(readonly name: string, private steps: Step[]) { super(); }

  update(c: Ctx, dt: number) {
    const st = this.steps[this.i];
    if (!st) return true;
    this.stepT += dt;
    if (!this.begun) {
      if (!this.begin(c, st)) return this.stepT > 6; // waited too long for him to be free: give up
      this.begun = true;
      this.stepT = 0;
    }
    if (this.finished(c, st)) { this.i++; this.begun = false; this.stepT = 0; }
    return this.i >= this.steps.length;
  }

  private begin(c: Ctx, st: Step): boolean {
    const ch = c.char, cur = c.world.cursor;
    if ('say' in st) { c.say(st.say, st.secs); return true; }
    if ('wait' in st) return true;
    if ('look' in st) { c.look = st.look; return true; }
    if ('sit' in st) { if (!ch.ready) return false; ch.sit(); return true; }
    if ('pop' in st) { ch.detach(st.pop, { x: -ch.facing * 120, y: -260, z: 80 }); return true; }
    if ('flip' in st) { if (!ch.ready) return false; return ch.flipJump(st.flip) || true; }
    if ('roll' in st) { if (!ch.ready) return false; return ch.rollForward() || true; }
    if (!ch.ready) return false;
    if ('gesture' in st) { ch.doGesture(st.gesture, st.atCursor && cur ? cur : undefined); return true; }
    if ('walkTo' in st) {
      const b = c.world.bounds;
      let x: number;
      if (st.walkTo === 'cursor') x = cur ? cur.x : ch.x;
      else if (st.walkTo === 'away') x = ch.x - sign((cur?.x ?? ch.x + 1) - ch.x) * rand(200, 400);
      else if (st.walkTo === 'edge') { const r = ch.surfaceRange(); x = ch.x - r.x1 > r.x2 - ch.x ? r.x1 : r.x2; }
      else x = st.walkTo;
      ch.walkTo(x, st.run);
      return true;
    }
    if ('jump' in st) {
      const vx = st.vx === 'cursor' ? (cur ? clamp((cur.x - ch.x) * 1.2, -300, 300) : 0) : (st.vx ?? 0);
      ch.jump(vx, -st.jump);
      return true;
    }
    if ('face' in st) {
      const target = st.face === 'flip' ? ch.x - ch.facing * 100
        : cur ? (st.face === 'cursor' ? cur.x : 2 * ch.x - cur.x) : ch.x + ch.facing * 100;
      c.look = st.face === 'away' ? 'away' : st.face === 'cursor' ? 'cursor' : 'none';
      ch.facing = sign(target - ch.x);
      return true;
    }
    return true;
  }

  private finished(c: Ctx, st: Step): boolean {
    const ch = c.char;
    if ('say' in st || 'look' in st || 'face' in st) return this.stepT > 0.15;
    if ('wait' in st) return this.stepT >= st.wait;
    if ('gesture' in st) return this.stepT > 0.05 && ch.currentGesture === null;
    if ('walkTo' in st) return (this.stepT > 0.1 && !ch.walking) || this.stepT > 15;
    if ('jump' in st) return this.stepT > 0.3 && ch.ready;
    if ('sit' in st) {
      if (this.stepT >= st.sit && ch.mode === 'sit') ch.standUp();
      return this.stepT >= st.sit && ch.mode !== 'sit';
    }
    if ('flip' in st || 'roll' in st) return (this.stepT > 0.4 && ch.ready) || this.stepT > 6;
    return true;
  }
}

// ───────────── continuous skills ─────────────

export class Idle extends Skill {
  readonly name = 'idle';
  private next = rand(2, 4);
  constructor(private dur: number) { super(); }
  update(c: Ctx) {
    if (this.t > this.next && c.char.ready) {
      this.next = this.t + rand(3, 6);
      const s = c.mood.s;
      if (chance(0.25 + s.boredom * 0.3)) c.char.doGesture(s.energy < 0.4 ? 'stretch' : pick(['lookAround', 'lookAround', 'shrug'] as const));
    }
    return this.t > this.dur;
  }
}

export class Wander extends Skill {
  readonly name = 'wander';
  start(c: Ctx) {
    const ch = c.char, r = ch.surfaceRange();
    let x = rand(r.x1 + 10, r.x2 - 10);
    const far = Math.min(150, (r.x2 - r.x1) / 3);
    if (Math.abs(x - ch.x) < far) x = ch.x + sign(x - ch.x) * far;
    ch.walkTo(x, chance(c.mood.s.energy * 0.15));
  }
  update(c: Ctx) { return (this.t > 0.2 && !c.char.walking) || this.t > 25; }
  stop(c: Ctx) { c.char.stop(); }
}

export class SitFor extends Skill {
  readonly name: string;
  constructor(private dur: number, private sulk = false) { super(); this.name = sulk ? 'sulk' : 'sit'; }
  start(c: Ctx) {
    c.char.sit();
    if (this.sulk) { c.look = 'away'; c.say('...'); }
  }
  update(c: Ctx) {
    if (this.t > this.dur && c.char.mode === 'sit') c.char.standUp();
    return this.t > this.dur && c.char.mode !== 'sit';
  }
}

export class Sleep extends Skill {
  readonly name = 'sleep';
  private z = 1;
  start(c: Ctx) { c.char.lieDown(); c.mood.asleep = true; c.look = 'down'; }
  update(c: Ctx) {
    if (this.t > this.z) { this.z = this.t + rand(2.5, 4); c.say('z', 1.4); }
    if (c.mood.s.energy > 0.95) { c.char.standUp(); return true; }
    return false;
  }
  stop(c: Ctx) { c.mood.asleep = false; }
}

export class ChaseCursor extends Skill {
  readonly name: string;
  private retarget = 0;
  constructor(private dur: number, private angry: boolean) { super(); this.name = angry ? 'hunt' : 'chase'; }
  start(c: Ctx) { c.look = 'cursor'; if (this.angry) c.say(pick(['get back here', '!!', 'you.'])); }
  update(c: Ctx) {
    const cur = c.world.cursor, ch = c.char;
    if (!cur) return true;
    if (this.t > this.retarget && ch.ready) {
      this.retarget = this.t + 0.35;
      const dx = cur.x - ch.x, above = ch.body.j.head.y - cur.y;
      if (Math.abs(dx) < 35 && above > -20 && above < 160) {
        if (this.angry) ch.doGesture('pokeBack', cur);
        else ch.jump(clamp(dx * 2, -120, 120), -(420 + above * 3));
      } else {
        ch.walkTo(cur.x, this.angry || c.mood.s.energy > 0.5);
      }
    }
    return this.t > this.dur;
  }
  stop(c: Ctx) { c.char.stop(); }
}

export class AvoidCursor extends Skill {
  readonly name = 'avoid';
  constructor(private dur: number) { super(); }
  start(c: Ctx) { c.look = 'cursor'; }
  update(c: Ctx) {
    const cur = c.world.cursor, ch = c.char;
    if (cur && ch.ready && !ch.walking && Math.abs(cur.x - ch.x) < 220) {
      ch.walkTo(ch.x - sign(cur.x - ch.x) * rand(200, 350), c.mood.s.fear > 0.3);
    }
    return this.t > this.dur;
  }
  stop(c: Ctx) { c.char.stop(); }
}

// ───────────── windows: climbing up and getting down ─────────────

/** How high he can jump, in px (grows with his size). */
export const maxClimb = (ch: Character) => 230 * ch.scale;

/** Highest point (y) his hands reach standing where he is. */
const handReach = (ch: Character) => ch.body.j.footL.y - (ch.d.thigh + ch.d.shin + ch.d.torso + (ch.d.upperArm + ch.d.foreArm) * 0.9);
/** Extra height a jump adds to his reach. */
const jumpReach = (ch: Character) => 110 * ch.scale;
/** Height of his body hanging from the ceiling (hands to feet). */
const hangLength = (ch: Character) => ch.d.upperArm + ch.d.foreArm + ch.d.torso + ch.d.thigh + ch.d.shin;

/** How he'll get onto a window: jump up, climb its side, or go over the ceiling and drop on. */
export type Route =
  | { kind: 'jump' }
  | { kind: 'vault'; edgeX: number; fromX: number }
  | { kind: 'wall'; wall: Wall; jump: boolean }
  | { kind: 'ceiling'; edge: Wall; dropX: number };

/** Can he stand at x on what he's standing on now? */
const canStandAt = (ch: Character, x: number) => { const r = ch.surfaceRange(); return x >= r.x1 && x <= r.x2; };

/** The screen edge he can walk to from here (nearest first), if any. */
function reachableEdges(c: Ctx): Wall[] {
  const ch = c.char;
  return c.world.walls
    .filter((w) => w.top === 'ceiling' && canStandAt(ch, w.x - w.face * 16 * ch.scale) && w.y2 >= handReach(ch))
    .sort((a, b) => Math.abs(a.x - ch.x) - Math.abs(b.x - ch.x));
}

export function routeTo(c: Ctx, target: Platform): Route | null {
  const ch = c.char, sc = ch.scale, floorY = ch.body.j.footL.y, range = ch.surfaceRange();
  const h = floorY - target.y;
  if (target.id === ch.support || h < 40 * sc || target.x2 - target.x1 < 50) return null;
  // 0. Low enough to vault onto (parkour): run up to one end, hands on the edge, legs over.
  if (h >= 12 * sc && h <= 85 * sc && ch.whole) {
    const fromLeft = ch.x < (target.x1 + target.x2) / 2;
    const edgeX = fromLeft ? target.x1 : target.x2, fromX = edgeX + (fromLeft ? -26 : 26) * sc;
    if (canStandAt(ch, fromX)) return { kind: 'vault', edgeX, fromX };
  }
  // 1. Close enough to jump.
  const gap = Math.max(target.x1 - range.x2, range.x1 - target.x2, 0);
  if (h <= maxClimb(ch) && gap < 90 * sc) return { kind: 'jump' };
  // 2. Climb one of that window's sides.
  for (const w of c.world.walls) {
    if (w.top !== 'platform' || w.win === undefined || w.win !== target.win || Math.abs(w.y1 - target.y) > 3) continue;
    if (!canStandAt(ch, w.x - w.face * 16 * sc)) continue;
    if (w.y2 >= handReach(ch)) return { kind: 'wall', wall: w, jump: false };
    if (w.y2 >= handReach(ch) - jumpReach(ch)) return { kind: 'wall', wall: w, jump: true };
  }
  // 3. Over the ceiling, then drop onto it (if that drop is one he's comfortable with).
  const edge = reachableEdges(c)[0];
  const drop = target.y - (c.world.bounds.top + hangLength(ch));
  if (edge && drop > 0 && drop < c.lessons.safeDrop * sc) {
    return { kind: 'ceiling', edge, dropX: (target.x1 + target.x2) / 2 };
  }
  return null;
}

/** Window tops he could get onto from where he stands (by any route). */
export function reachableAbove(c: Ctx): { target: Platform; route: Route }[] {
  return c.world.platforms
    .map((target) => ({ target, route: routeTo(c, target) }))
    .filter((o): o is { target: Platform; route: Route } => o.route !== null);
}

/** Drop height (px) if he hops off the given side of what he's standing on. */
export function dropFrom(c: Ctx, side: -1 | 1) {
  const ch = c.char, r = ch.surfaceRange(), y = ch.body.j.footL.y;
  const x = side < 0 ? r.x1 - 25 * ch.scale : r.x2 + 25 * ch.scale;
  if (x < c.world.bounds.left || x > c.world.bounds.right) return Infinity;
  return surfaceBelow(x, y + 5, c.world.platforms, c.world.bounds.floor).y - y;
}

/** The side of his current window he could climb down, and the drop at its bottom. */
export function climbDownOption(c: Ctx, side: -1 | 1): { wall: Wall; drop: number } | null {
  const ch = c.char, p = ch.supportPlatform();
  if (!p || p.win === undefined) return null;
  const edgeX = side < 0 ? p.x1 : p.x2;
  const wall = c.world.walls.find((w) => w.win === p.win && w.top === 'platform' && Math.abs(w.x - edgeX) < 3 && w.face === -side);
  if (!wall) return null;
  const legLen = ch.d.thigh + ch.d.shin;
  const below = surfaceBelow(wall.x + side * 20 * ch.scale, wall.y2 - legLen, c.world.platforms, c.world.bounds.floor).y;
  return { wall, drop: Math.max(0, below - wall.y2) };
}

export class ClimbOnto extends Skill {
  readonly name = 'climb';
  private phase: 'walk' | 'go' | 'wait' = 'walk';
  private tries = 0;
  private sub: MonkeyBars | null = null;
  constructor(private target: Platform, private route: Route) { super(); }

  start(c: Ctx) {
    c.look = 'none';
    if (this.route.kind === 'ceiling') { this.sub = new MonkeyBars(this.route.edge, this.route.dropX, false); this.sub.start(c); return; }
    this.walkToLaunch(c);
  }

  private walkToLaunch(c: Ctx) {
    const ch = c.char, t = this.target, r = ch.surfaceRange(), m = 16 * ch.scale;
    if (this.route.kind === 'vault') {
      ch.walkTo(this.route.fromX, Math.abs(this.route.fromX - ch.x) > 120);
      this.phase = 'walk';
      return;
    }
    if (this.route.kind === 'wall') {
      // Run up to the wall and leap onto it (or, after a miss, walk right up and grab it).
      const w = this.route.wall, gap = this.tries > 0 ? m : 55 * ch.scale;
      const x = w.x - w.face * gap;
      ch.walkTo(x, Math.abs(x - ch.x) > 150);
    }
    else {
      // Stand right under the window if we can and jump straight up through it; otherwise from the nearest end.
      const lo = Math.max(r.x1 + m, t.x1 + m), hi = Math.min(r.x2 - m, t.x2 - m);
      ch.walkTo(lo <= hi ? clamp(ch.x, lo, hi) : t.x1 > r.x2 ? r.x2 - m : r.x1 + m);
    }
    this.phase = 'walk';
  }

  update(c: Ctx, dt: number) {
    if (this.sub) {
      this.sub.t += dt;
      const done = this.sub.update(c);
      if (done && c.char.support === this.target.id && chance(0.5)) c.say(pick(['ta-da', 'made it', 'hi up here']));
      return done;
    }
    const ch = c.char;
    const t = c.world.platforms.find((p) => p.id === this.target.id) ?? c.world.platforms.find((p) => p.win === this.target.win);
    if (!t) return true; // the window went away
    this.target = t;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      if (this.route.kind === 'vault') {
        if (!ch.vault(this.route.edgeX, t.y)) { this.route = { kind: 'jump' }; this.walkToLaunch(c); return false; }
      } else if (this.route.kind === 'wall') {
        ch.facing = this.route.wall.face;
        const vy = -Math.sqrt(2 * GRAVITY * jumpReach(ch) * (this.route.jump ? 1.1 : 0.45));
        if (this.tries > 0 && !this.route.jump) ch.grabWall(this.route.wall, -1);
        else ch.leapAt(this.route.wall, vy);
      } else {
        const h = ch.body.j.footL.y - t.y + 28 * ch.scale;
        const vy = Math.sqrt(2 * GRAVITY * Math.max(h, 10));
        const landX = clamp(ch.x, t.x1 + 20 * ch.scale, t.x2 - 20 * ch.scale);
        const vx = clamp(((landX - ch.x) / (vy / GRAVITY)) * 0.9, -320, 320);
        ch.facing = sign(landX - ch.x + 0.01);
        ch.jump(vx, -vy);
      }
      this.phase = 'go';
      this.t = 0;
    } else if (this.phase === 'go') {
      // Jump-and-grab: catch the wall as soon as his hands reach it.
      if (this.route.kind === 'wall' && this.route.jump && ch.mode === 'air') {
        const handsY = ch.body.j.neck.y - (ch.d.upperArm + ch.d.foreArm) * 0.9;
        if (handsY <= this.route.wall.y2 - 6) ch.grabWall(this.route.wall, -1);
      }
      if (this.t > 0.4 && ch.ready) {
        if (ch.support === t.id || (t.win !== undefined && ch.supportPlatform()?.win === t.win)) {
          if (chance(0.4)) c.say(pick(['ha!', 'up!', 'made it']));
          return true;
        }
        if (++this.tries >= 2) { c.say(pick(['hmph.', 'nope', 'too high'])); return true; }
        this.walkToLaunch(c);
      }
    }
    return this.t > 30;
  }
  stop(c: Ctx) { c.char.stop(); this.sub?.stop(c); }
}

/** Climb a screen edge, cross the top of the screen hand over hand, then drop (or climb down the far side). */
export class MonkeyBars extends Skill {
  readonly name = 'monkeybars';
  private phase: 'walk' | 'climb' = 'walk';
  constructor(private edge: Wall, private goalX: number, private climbDown: boolean) { super(); }
  private missed = false;
  start(c: Ctx) {
    const ch = c.char, x = this.edge.x - this.edge.face * 55 * ch.scale;
    ch.walkTo(x, Math.abs(x - ch.x) > 150); // run at the wall...
    c.look = 'none';
  }
  update(c: Ctx) {
    const ch = c.char;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      // ...and leap onto it. If that misses, walk up and grab it.
      if (this.missed) { if (!ch.grabWall(this.edge, -1)) return true; }
      else ch.leapAt(this.edge);
      this.phase = 'climb';
      this.t = 0;
    } else if (this.phase === 'climb' && !this.missed && this.t > 0.6 && ch.ready && !ch.climbingWall && !ch.onCeiling && ch.support < 0 && this.t < 1.5) {
      this.missed = true; this.phase = 'walk';
      ch.walkTo(this.edge.x - this.edge.face * 16 * ch.scale);
    } else if (this.phase === 'climb') {
      if (ch.onCeiling) { ch.ceilingGoal = this.goalX; ch.climbDownAfterCeiling = this.climbDown; }
      if (this.t > 1 && ch.ready) return true;
    }
    return this.t > 60;
  }
  stop(c: Ctx) { c.char.stop(); }
}

export class GetDown extends Skill {
  readonly name = 'getdown';
  private phase: 'walk' | 'hop' | 'climb' = 'walk';
  private from = -1;
  private tries = 0;
  drop = 0;
  /** `wall`: climb down this window side instead of hopping off. */
  constructor(private side: -1 | 1, private wall: Wall | null = null) { super(); }
  start(c: Ctx) {
    const ch = c.char, r = ch.surfaceRange();
    this.drop = this.wall ? (climbDownOption(c, this.side)?.drop ?? 0) : dropFrom(c, this.side);
    this.from = ch.support;
    ch.walkTo(this.side < 0 ? r.x1 : r.x2);
  }
  update(c: Ctx) {
    const ch = c.char;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      if (this.wall) {
        ch.grabWall(this.wall, 1);
        this.phase = 'climb';
      } else {
        ch.facing = this.side;
        ch.jump(this.side * (200 + this.tries * 80), -240);
        this.phase = 'hop';
      }
      this.t = 0;
    } else if (this.phase === 'climb') {
      return this.t > 0.5 && ch.ready;
    } else if (this.phase === 'hop' && this.t > 0.4 && ch.mode !== 'air') {
      // Landed back on the same window? Hop again, a bit harder.
      if (ch.ready && ch.support === this.from && this.from >= 0 && ++this.tries < 3) { this.phase = 'walk'; return false; }
      return true;
    }
    return this.t > 30;
  }
  stop(c: Ctx) { c.char.stop(); }
}

// ───────────── parkour ─────────────

/** Run at a wall (a screen edge or a window side), leap onto it, and kick off it with a backflip. */
export class WallJump extends Skill {
  readonly name = 'walljump';
  private phase: 'walk' | 'leap' | 'kick' | 'land' = 'walk';
  constructor(private wall: Wall) { super(); }
  start(c: Ctx) {
    const ch = c.char, x = this.wall.x - this.wall.face * 60 * ch.scale;
    ch.walkTo(x, Math.abs(x - ch.x) > 120);
    c.look = 'none';
  }
  update(c: Ctx) {
    const ch = c.char;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      if (!ch.leapAt(this.wall, -470)) return true;
      this.phase = 'leap'; this.t = 0;
    } else if (this.phase === 'leap') {
      if (ch.climbingWall) { this.phase = 'kick'; this.t = 0; }
      else if (this.t > 1.2 && ch.ready) return true; // missed it
    } else if (this.phase === 'kick' && this.t > 0.18) {
      ch.wallJump(true);
      this.phase = 'land'; this.t = 0;
    } else if (this.phase === 'land') return this.t > 0.4 && (ch.ready || ch.mode === 'ragdoll');
    return this.t > 12;
  }
  stop(c: Ctx) { c.char.stop(); if (c.char.climbingWall) c.char.letGo(); }
}

/** The nearest wall he could wall-jump off (one he can reach running from where he stands). */
export function wallJumpTarget(c: Ctx): Wall | null {
  const ch = c.char, foot = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
  const ok = c.world.walls.filter((w) => w.y1 < foot - 120 * ch.scale && w.y2 >= foot - 10 && canStandAt(ch, w.x - w.face * 60 * ch.scale));
  ok.sort((a, b) => Math.abs(a.x - ch.x) - Math.abs(b.x - ch.x));
  return ok[0] ?? null;
}

// ───────────── made-up moves (his AI brain moving his body directly) ─────────────

export class PuppetMove extends Skill {
  readonly name = 'move';
  private ok = false;
  constructor(private frames: Keyframe[]) { super(); }
  start(c: Ctx) { c.look = 'none'; this.ok = c.char.puppet(this.frames); }
  update(c: Ctx) {
    if (!this.ok) return true;
    // Done once the move has played and he's back on his feet (or has given up after a long while).
    return (this.t > 0.3 && !c.char.puppeting && c.char.ready) || this.t > 20;
  }
  stop(c: Ctx) { c.char.endPuppet(); }
}

// ───────────── mischief ─────────────

/**
 * Getting a tool (his pen, his sword) out of his belt and putting it back, shared by the
 * skills that use one. Call `fetch` every frame until it says 'ready' or 'none'.
 */
export class Tool {
  item: Item | null = null;
  /** Why he couldn't get it: you have it, it's lying around, he has no hands, he doesn't own one. */
  why: 'gone' | 'lying' | 'nohands' | 'none' | '' = '';
  private t = 0;
  constructor(private use: ItemUse) {}

  fetch(c: Ctx, dt: number): 'working' | 'ready' | 'none' {
    const ch = c.char, hand = ch.useHand;
    this.t += dt;
    if (!hand) { this.why = 'nohands'; return 'none'; }
    const it = this.item ??= c.items.find(this.use);
    if (!it) { this.why = 'none'; return 'none'; }
    if (it.where === 'cursor') { this.why = 'gone'; return 'none'; }
    if (it.where === 'world') { this.why = 'lying'; return 'none'; }
    if (it.where === 'hand') { ch.handTarget = null; return 'ready'; }
    // On his belt: reach down to it and pull it out.
    const slot = c.items.slotPose(ch, it.slot).at;
    ch.handTarget = { x: slot.x, y: slot.y };
    const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - slot.x, h.y - slot.y) < 6 * ch.scale || this.t > 0.7) {
      c.items.toHand(it, hand);
      ch.handTarget = null;
      c.sound?.('pickup');
      return 'ready';
    }
    return 'working';
  }

  private stowT = 0;
  /** Put it back on his belt. Returns true when done. */
  stow(c: Ctx, dt: number): boolean {
    const it = this.item, ch = c.char;
    if (!it || it.where !== 'hand') { ch.handTarget = null; return true; }
    this.stowT += dt;
    it.aim = null;
    const prefer = it.def.belt === 'back' ? [2, 1, 0] : [1, 0, 2];
    const slot = prefer.find((s) => !c.items.belt[s]);
    if (slot === undefined) { ch.handTarget = null; return true; } // belt's full: he just keeps holding it
    const at = c.items.slotPose(ch, slot).at;
    ch.handTarget = { x: at.x, y: at.y };
    const h = ch.body.j[it.hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - at.x, h.y - at.y) < 6 * ch.scale || this.stowT > 0.7) {
      c.items.stow(it);
      ch.handTarget = null;
      c.sound?.('pickup');
      return true;
    }
    return false;
  }
}

/** What he says when his tool isn't on him. */
function missingTool(c: Ctx, tool: Tool, what: string) {
  if (tool.why === 'gone') c.say(pick([`hey. you have my ${what}`, `my ${what}! give it back`, `can't. YOU have my ${what}`]), 2);
  else if (tool.why === 'nohands') c.say(pick(['with what hands?', 'no hands. can\'t.']), 1.6);
  else if (tool.why === 'none') c.say(pick([`I don't have a ${what}`, `no ${what}...`]), 1.6);
}

/**
 * He draws a little picture next to himself with his own pen: takes it out of his belt,
 * draws (the pen's tip is what touches the screen), and puts it back.
 */
export class DoodleSkill extends Skill {
  readonly name = 'doodle';
  /** `shape`: strokes in a box from -0.5 to 0.5 (y down). Left out = one of his usual pictures. */
  constructor(private shape?: Vec[][], private title = '') { super(); }
  private doodle: Doodle | null = null;
  private plan: Vec[][] = [];
  private si = 0; private pi = 0; private along = 0;
  private finished = 0;
  private phase: 'tool' | 'fetch' | 'draw' | 'stow' | 'admire' = 'tool';
  private tool = new Tool('draw');
  private sub: Skill | null = null;
  start(c: Ctx) { c.look = 'none'; }

  /** Where the drawing goes: in front of him, about chest height. */
  private begin(c: Ctx) {
    const ch = c.char, sc = ch.scale, j = ch.body.j;
    const keys = Object.keys(SHAPES), name = keys[Math.floor(Math.random() * keys.length)];
    const shape = this.shape ?? SHAPES[name];
    const size = 46 * sc, cx = ch.x + ch.facing * 40 * sc, cy = j.neck.y + 8 * sc;
    this.plan = shape.map((st) => st.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size })));
    this.doodle = { strokes: [], color: c.inkColor, born: c.world.time, done: false, shape, title: this.title || (this.shape ? 'made up' : name) };
    c.doodles.push(this.doodle);
    if (c.doodles.length > 8) c.doodles.shift();
  }

  update(c: Ctx, dt: number) {
    const ch = c.char;
    if (this.sub) {
      this.sub.t += dt;
      if (!this.sub.update(c, dt)) return this.t > 40;
      this.sub.stop(c); this.sub = null;
      this.tool = new Tool('draw');
      this.phase = 'tool';
    }
    if (this.phase === 'tool') {
      if (!ch.ready && ch.mode !== 'ground') return this.t > 20;
      const r = this.tool.fetch(c, dt);
      if (r === 'none') {
        // It's lying around somewhere: go get it first. Otherwise, no drawing today.
        const pen = c.items.find('draw');
        if (this.tool.why === 'lying' && pen && this.t < 20) { this.sub = new FetchItem(pen, false); this.sub.start(c); this.phase = 'fetch'; return false; }
        missingTool(c, this.tool, 'pen');
        return true;
      }
      if (r === 'ready') { this.begin(c); this.phase = 'draw'; }
      return false;
    }
    if (this.phase === 'stow') {
      if (this.tool.stow(c, dt)) { this.phase = 'admire'; this.finished = this.t + 0.8; }
      return false;
    }
    if (this.phase === 'admire') return this.t > this.finished;
    if (this.phase !== 'draw') return false;
    const d = this.doodle!, pen = this.tool.item!;
    if (pen.where !== 'hand') { c.say(pick(['hey!', 'my pen!']), 1.2); ch.handTarget = null; d.done = true; return true; } // it got taken mid-drawing
    const stroke = this.plan[this.si];
    if (!stroke) { // all done: admire it, put the pen away
      d.done = true;
      ch.handTarget = null;
      pen.aim = null;
      c.onDrawn?.(d);
      if (!this.shape) c.say(pick(['ta-da', 'art.', 'nice', '✎']), 1.4);
      this.phase = 'stow';
      return false;
    }
    // Move the pen along the stroke at a steady speed.
    this.along += 120 * ch.scale * dt;
    while (this.pi < stroke.length - 1) {
      const a = stroke[this.pi], b = stroke[this.pi + 1], seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (this.along < seg) break;
      this.along -= seg; this.pi++;
    }
    const a = stroke[this.pi], b = stroke[Math.min(this.pi + 1, stroke.length - 1)];
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = Math.min(1, this.along / seg);
    const tip = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    // He holds the pen pointing forward and down; his hand goes where that puts the tip on the drawing.
    const aim = ch.dirToWorld(0.45, -0.89);
    pen.aim = aim;
    const len = pen.def.length * ch.scale;
    ch.handTarget = { x: tip.x - aim.x * len, y: tip.y - aim.y * len };
    if (Math.random() < dt * 6) c.sound?.('scribble');
    // What's drawn so far of this stroke: the corners passed, plus wherever the pen is now.
    d.strokes[this.si] = [...stroke.slice(0, this.pi + 1), tip];
    if (this.pi >= stroke.length - 1) { this.si++; this.pi = 0; this.along = 0; }
    return this.t > 40;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
    if (this.doodle) this.doodle.done = true;
    this.sub?.stop(c);
    // Interrupted: the pen goes back on the belt (no animation).
    const pen = this.tool.item;
    if (pen?.where === 'hand') { pen.aim = null; c.items.stow(pen); }
  }
}

/**
 * Swinging his wooden sword: draw it from his back, wind up (big and slow — that's the
 * anticipation), slash (fast), follow through, then put it away. At your cursor if it's
 * close (when he's mad), or just practicing.
 */
export class SwordSwing extends Skill {
  readonly name = 'swing';
  private phase: 'tool' | 'approach' | 'windup' | 'slash' | 'follow' | 'stow' = 'tool';
  private tool = new Tool('swing');
  private pt = 0;
  private swings = 0;
  private hit = false;
  private from = -70;
  constructor(private times = 2, private atCursor = true) { super(); }
  start(c: Ctx) { c.look = this.atCursor ? 'cursor' : 'none'; }

  /** Arm and sword at angle phi (degrees: 0 = straight ahead, 90 = straight up, negative = down). */
  private pose(c: Ctx, phi: number) {
    const ch = c.char, it = this.tool.item!, j = ch.body.j, armLen = (ch.d.upperArm + ch.d.foreArm) * 0.85;
    const r = (phi * Math.PI) / 180, lead = r + 0.45;
    const arm = ch.dirToWorld(Math.cos(r), Math.sin(r));
    ch.handTarget = { x: j.neck.x + arm.x * armLen, y: j.neck.y + arm.y * armLen };
    it.aim = ch.dirToWorld(Math.cos(lead), Math.sin(lead));
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, cur = c.world.cursor;
    this.pt += dt;
    switch (this.phase) {
      case 'tool': {
        if (!ch.ready) return this.t > 20;
        const r = this.tool.fetch(c, dt);
        if (r === 'none') { missingTool(c, this.tool, 'sword'); return true; }
        if (r === 'ready') { this.phase = 'approach'; this.pt = 0; }
        return false;
      }
      case 'approach': {
        const reach = (ch.d.upperArm + ch.d.foreArm + this.tool.item!.def.length) * ch.scale * 0.85;
        if (this.atCursor && cur && Math.abs(cur.x - ch.x) > reach && this.pt < 3) {
          if (ch.ready && !ch.walking) ch.walkTo(cur.x - Math.sign(cur.x - ch.x) * reach * 0.7, true);
          return false;
        }
        ch.stop();
        if (this.atCursor && cur) ch.facing = Math.sign(cur.x - ch.x) || ch.facing;
        this.phase = 'windup'; this.pt = 0; this.from = -70;
        return false;
      }
      case 'windup': {
        // Anticipation: pull way back and up, slowing into the top.
        const u = Math.min(1, this.pt / 0.38);
        this.pose(c, lerpN(this.from, 128, 1 - (1 - u) ** 3));
        if (u >= 1) { this.phase = 'slash'; this.pt = 0; this.hit = false; c.sound?.('whoosh'); }
        return false;
      }
      case 'slash': {
        // Fast, accelerating into the cut.
        const u = Math.min(1, this.pt / 0.13);
        this.pose(c, lerpN(128, -48, u * u));
        const it = this.tool.item!;
        if (!this.hit && cur && it.distTo(cur.x, cur.y) < 9 * ch.scale) {
          this.hit = true;
          c.hitCursor?.(cur.x, cur.y, ch.facing);
        }
        if (u >= 1) { this.phase = 'follow'; this.pt = 0; }
        return false;
      }
      case 'follow': {
        // Follow-through: carries on a little past the cut, then settles.
        const u = Math.min(1, this.pt / 0.3);
        this.pose(c, -48 - Math.sin(Math.PI * u) * 14);
        if (u >= 1) {
          this.swings++;
          this.from = -48;
          if (this.swings < this.times) { this.phase = 'windup'; this.pt = 0; }
          else { this.phase = 'stow'; this.pt = 0; if (!this.atCursor) c.say(pick(['hyah!', 'ha!', 'en garde']), 1.2); }
        }
        return false;
      }
      case 'stow': return this.tool.stow(c, dt) || this.pt > 2;
    }
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
    const it = this.tool.item;
    if (it?.where === 'hand') { it.aim = null; c.items.stow(it); }
  }
}

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Something of his is lying around: walk over, bend down, pick it up, and put it on his belt. */
export class FetchItem extends Skill {
  readonly name = 'pickup';
  private phase: 'go' | 'grab' | 'stow' = 'go';
  private tool: Tool;
  private next = 0;
  constructor(private item: Item, private comment = true) { super(); this.tool = new Tool(item.def.use); this.tool.item = item; }
  start(c: Ctx) { c.look = 'target'; }
  update(c: Ctx, dt: number) {
    const ch = c.char, it = this.item, hand = ch.useHand;
    c.lookTarget = { x: it.at.x, y: it.at.y };
    if (it.where === 'belt') return true;
    if (it.where === 'cursor' || !hand) return true;
    if (this.phase === 'stow') return this.tool.stow(c, dt) || this.t > 15;
    if (it.where === 'hand') { this.phase = 'stow'; return false; }
    const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
    // (Give a falling thing a moment to land before deciding it's out of reach.)
    if ((it.at.y < feet - 70 * ch.scale && this.t > 1.5) || this.t > 15) { if (this.comment) c.say(pick(['can\'t reach it', 'ugh. too high']), 1.4); return true; }
    if (it.at.y < feet - 70 * ch.scale) return false;
    if (this.phase === 'go') {
      if (this.t < this.next || !ch.ready) return false;
      this.next = this.t + 0.3;
      const dx = it.at.x - ch.x;
      if (Math.abs(dx) > 14 * ch.scale) ch.walkTo(it.at.x - Math.sign(dx) * 9 * ch.scale);
      else { ch.stop(); ch.facing = Math.sign(dx) || ch.facing; this.phase = 'grab'; this.next = this.t; }
      return false;
    }
    // Bend down and grab it by the handle.
    ch.handTarget = { x: it.at.x, y: it.at.y };
    const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - it.at.x, h.y - it.at.y) < 7 * ch.scale) {
      c.items.toHand(it, hand);
      ch.handTarget = null;
      c.sound?.('pickup');
      if (this.comment && chance(0.5)) c.say(pick(['mine.', 'got it', 'there you are']), 1.2);
      this.phase = 'stow';
    } else if (this.t - this.next > 3) { ch.handTarget = null; this.phase = 'go'; }
    return false;
  }
  stop(c: Ctx) { c.char.handTarget = null; }
}

/** You've had one of his things for a while: he comes over and asks for it back (and snatches it if he can). */
export class AskBack extends Skill {
  readonly name = 'askback';
  private next = 0;
  constructor(private item: Item) { super(); }
  start(c: Ctx) { c.look = 'cursor'; c.say(pick([`can I have my ${this.item.def.name.toLowerCase()} back?`, `hey. my ${this.item.def.name.toLowerCase()}.`, 'give it.']), 2); }
  update(c: Ctx) {
    const ch = c.char, cur = c.world.cursor, it = this.item;
    if (it.where !== 'cursor' || !cur) return true;
    if (this.t > 10) { c.say(pick(['fine. keep it.', 'hmph.', 'whatever']), 1.4); return true; }
    if (ch.ready && this.t > this.next) {
      this.next = this.t + 0.4;
      if (Math.abs(cur.x - ch.x) > 30 * ch.scale) ch.walkTo(cur.x - Math.sign(cur.x - ch.x) * 20 * ch.scale);
    }
    // Hand held out toward it. Bring it close and he grabs it.
    const hand = ch.useHand;
    if (!hand) return this.t > 3;
    ch.handTarget = { x: cur.x, y: cur.y };
    const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - it.at.x, h.y - it.at.y) < 10 * ch.scale) {
      c.items.toHand(it, hand);
      c.sound?.('pickup');
      c.say(pick(['ha! mine.', 'thank you.', 'gotcha']), 1.4);
      c.mood.nudge({ happiness: 0.05 });
      ch.handTarget = null;
      return true;
    }
    return false;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
    if (this.item.where === 'hand') c.items.stow(this.item);
  }
}

/** Desktop Goose move: run at your cursor, grab it, and drag it around for a moment. */
export class GrabCursor extends Skill {
  readonly name = 'grabcursor';
  private phase: 'chase' | 'drag' | 'done' = 'chase';
  private next = 0;
  private until = 0;
  private dragTo = 0;
  start(c: Ctx) { c.cursorEscaped = false; c.look = 'cursor'; c.say(pick(['!', 'ooh', 'mine']), 1); }
  update(c: Ctx) {
    const ch = c.char, cur = c.world.cursor, j = ch.body.j;
    if (!cur) return true;
    const armLen = ch.d.upperArm + ch.d.foreArm;
    if (this.phase === 'chase') {
      if (this.t > 10) { c.say(pick(['aw', 'too fast']), 1.2); return true; }
      // In reach: anywhere his arm can get to, from above his shoulder down to his hips.
      const dx = cur.x - ch.x;
      const near = Math.hypot(cur.x - j.neck.x, cur.y - j.neck.y) < armLen * 1.05
        || (Math.abs(cur.x - j.neck.x) < armLen * 0.9 && cur.y > j.neck.y && cur.y < j.hip.y + 10 * ch.scale);
      if (near && ch.ready) {
        this.phase = 'drag';
        this.until = this.t + rand(1.5, 3);
        const r = ch.surfaceRange();
        this.dragTo = clamp(ch.x + (Math.random() < 0.5 ? -1 : 1) * rand(150, 350), r.x1 + 20, r.x2 - 20);
        c.say(pick(['gotcha!', 'hehe', 'mine now']), 1.2);
        c.cursorEscaped = false;
        return false;
      }
      if (this.t > this.next && ch.ready) {
        this.next = this.t + 0.25;
        const above = j.head.y - cur.y;
        if (Math.abs(dx) < 40 && above > 0 && above < 170 * ch.scale) ch.jump(clamp(dx * 2, -120, 120), -(450 + above * 3));
        else ch.walkTo(cur.x - sign(dx) * 18 * ch.scale, true);
      }
      return false;
    }
    if (this.phase === 'drag') {
      if (c.cursorEscaped) { ch.handTarget = null; c.say(pick(['hey!', 'aw', 'no fair']), 1.2); return true; }
      if (ch.ready && !ch.walking) ch.walkTo(this.dragTo, true);
      // Hold the cursor up in front of him and drag it along.
      const hand = { x: j.neck.x + ch.facing * armLen * 0.8, y: j.neck.y - armLen * 0.45 };
      ch.handTarget = hand;
      const h = ch.frontHand;
      if (!c.moveCursor(h.x, h.y - 4)) { ch.handTarget = null; return true; }
      if (this.t > this.until) {
        ch.handTarget = null;
        ch.stop();
        this.phase = 'done';
        c.say(pick(['hehe', 'heh. here.', 'you can have it back']), 1.4);
        this.until = this.t + 0.8;
      }
      return false;
    }
    return this.t > this.until;
  }
  stop(c: Ctx) { c.char.handTarget = null; c.char.stop(); }
}

// ───────────── losing a limb, and getting it back ─────────────

const LIMB_NAME: Record<LimbId, string> = { armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg' };

/**
 * A limb came off. The Animator vs. Animation way: he stares at the stump, looks around,
 * goes and gets it (hopping or crawling if it's a leg), picks it up and sticks it back on,
 * then tries it out. If he can't get it back (you're holding it, it landed somewhere he
 * can't reach), he gives up after a while and draws himself a new one.
 */
export class Reattach extends Skill {
  readonly name = 'reattach';
  private phase: 'stare' | 'go' | 'pick' | 'bring' | 'test' | 'redraw' = 'stare';
  private limb: LimbId | null = null;
  private next = 0;
  private stuck = 0;
  private nagged = -10;
  private testUntil = 0;
  private redrawAt = 0;

  start(c: Ctx) {
    this.choose(c);
    if (this.limb) {
      // Stare down at where it used to be.
      const st = c.char.stumpOf(this.limb);
      c.look = 'target';
      c.lookTarget = { x: st.x + c.char.facing * 25, y: st.y + 60 };
      c.char.stare = 1;
    }
    c.say(pick(['...', '...huh.', '.', 'uh']), 1.3);
  }

  /** Which limb to fetch first: arms first (he needs a hand to pick things up), the nearest one. */
  private choose(c: Ctx) {
    const ch = c.char, left = [...ch.missing.keys()];
    left.sort((a, b) => (a.startsWith('arm') ? 0 : 1) - (b.startsWith('arm') ? 0 : 1) || Math.abs(ch.missing.get(a)!.root.x - ch.x) - Math.abs(ch.missing.get(b)!.root.x - ch.x));
    this.limb = left[0] ?? null;
  }

  update(c: Ctx, dt: number) {
    const ch = c.char;
    if (!this.limb || !ch.missing.has(this.limb)) {
      // Back on. Anything else missing? Go get that too; else try it out.
      if (this.phase !== 'test' && this.limb) { this.phase = 'test'; this.testUntil = this.t + 1.6; this.tryOut(c, this.limb); }
      if (this.phase === 'test') {
        if (this.t < this.testUntil) return false;
        if (ch.missing.size) { this.limb = null; this.choose(c); this.phase = 'go'; return false; }
        return true;
      }
      this.choose(c);
      if (!this.limb) return true;
    }
    const piece = ch.missing.get(this.limb)!;
    const hand = ch.useHand;
    switch (this.phase) {
      case 'stare':
        if (this.t > 1.5) {
          c.say(pick([`MY ${LIMB_NAME[this.limb].toUpperCase()}`, '!!', `hey. that's my ${LIMB_NAME[this.limb]}`, 'oh come ON']), 1.6);
          this.phase = 'go'; this.next = this.t + 0.6;
          ch.stare = 0;
          c.look = 'target';
        }
        return false;
      case 'go': {
        if (this.t < this.next || !(ch.ready || ch.mode === 'ground')) return this.t > 60;
        this.next = this.t + 0.3;
        c.lookTarget = { x: piece.root.x, y: piece.root.y };
        if (piece.heldBy === 'user') {
          // You've got it. He wants it back.
          if (c.world.time - this.nagged > 5) { this.nagged = c.world.time; c.say(pick(['give it back!', 'hey! mine!', 'I need that']), 1.6); }
          if (c.world.cursor) ch.walkTo(c.world.cursor.x);
          this.stuck += 0.3;
        } else {
          const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y, ch.body.j.hip.y);
          const tooHigh = piece.root.y < feet - 70 * ch.scale && Math.max(...piece.points.map((p) => p.y)) < feet - 40 * ch.scale;
          if (tooHigh) this.stuck += 0.3;
          const dx = piece.root.x - ch.x;
          if (Math.abs(dx) > 14 * ch.scale) ch.walkTo(piece.root.x - Math.sign(dx) * 8 * ch.scale, Math.abs(dx) > 200);
          else if (!tooHigh) { ch.stop(); ch.facing = Math.sign(dx) || ch.facing; this.phase = 'pick'; this.next = this.t; }
        }
        if (this.stuck > 25) {
          this.phase = 'redraw'; this.redrawAt = this.t;
          ch.stop();
          c.say(pick(["fine. I'll draw a new one", 'whatever. new one.', 'good thing I have a pen']), 1.8);
        }
        return false;
      }
      case 'pick': {
        if (!hand) {
          // No hands to pick it up with: nudge it into place with his shoulder (it snaps on when close).
          ch.handTarget = null;
          if (this.t - this.next > 1.2) { ch.attach(this.limb); }
          return false;
        }
        // Reach down for its torn end.
        ch.handTarget = { x: piece.root.x, y: piece.root.y };
        const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
        if (Math.hypot(h.x - piece.root.x, h.y - piece.root.y) < 7 * ch.scale && ch.holdLimb(piece, hand)) { this.phase = 'bring'; this.next = this.t; }
        else if (this.t - this.next > 3 || Math.abs(piece.root.x - ch.x) > 40 * ch.scale) { ch.handTarget = null; this.phase = 'go'; }
        return false;
      }
      case 'bring': {
        // Hold it up to the stump; it clicks back on when it gets there.
        if (ch.holdingLimb !== piece) { ch.handTarget = null; this.phase = 'go'; return false; }
        const st = ch.stumpOf(this.limb);
        ch.handTarget = { x: st.x + ch.facing * 2 * ch.scale, y: st.y };
        if (this.t - this.next > 4) { ch.dropLimb(); ch.attach(this.limb); } // close enough: shove it on
        return false;
      }
      case 'redraw': {
        // Can't get it back. Draw a new one: scribble at the stump with his hand, and it grows back.
        const st = ch.stumpOf(this.limb);
        c.lookTarget = { x: st.x + ch.facing * 10, y: st.y + 30 };
        const u = this.t - this.redrawAt;
        ch.handTarget = hand ? { x: st.x + ch.facing * (6 + Math.sin(u * 30) * 4) * ch.scale, y: st.y + (this.limb.startsWith('leg') ? 12 : 6) * ch.scale + Math.cos(u * 23) * 4 * ch.scale } : null;
        if (u > 2) { ch.handTarget = null; ch.regrow(this.limb); }
        return false;
      }
      default: return true;
    }
  }

  /** Back on: give it a try. */
  private tryOut(c: Ctx, limb: LimbId) {
    const ch = c.char;
    ch.handTarget = null;
    c.say(pick(['good as new', 'there.', 'ok. better.', 'click.']), 1.4);
    if (limb.startsWith('leg') && ch.legCount === 2) ch.doGesture('stomp');
    else if (ch.useHand) ch.doGesture('wave');
  }

  stop(c: Ctx) { c.char.handTarget = null; c.char.dropLimb(); c.char.stop(); c.char.stare = 0; }
}

// ───────────── preset sequences ─────────────

export const presets = {
  dance: () => new Sequence('dance', [{ say: '♪' }, { gesture: 'dance' }, { say: '♫', secs: 1.2 }, { gesture: 'dance' }]),
  hop: (energy: number) => new Sequence('hop', [{ jump: 330 + energy * 280, vx: rand(-120, 120) }]),
  tantrum: () => new Sequence('tantrum', [
    { face: 'cursor' }, { say: pick(['!!', 'ugh.', 'hmph']) }, { gesture: 'stomp' }, { gesture: 'stomp' }, { gesture: 'pokeBack', atCursor: true },
  ]),
  explore: () => new Sequence('explore', [
    { walkTo: 'edge' }, { gesture: 'lookAround' }, { say: '?' }, { wait: 1 },
  ]),
  stretch: () => new Sequence('stretch', [{ gesture: 'stretch' }, { wait: 0.5 }]),
  sigh: () => new Sequence('sigh', [{ look: 'down' }, { say: pick(['so bored', 'hm.', '...']) }, { sit: rand(4, 8) }]),
};
