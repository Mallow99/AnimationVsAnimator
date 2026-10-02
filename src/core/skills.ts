// Skills: small, named behaviors built on the character's commands.
// The mind (offline instinct now, an LLM later) only ever picks skills —
// it never moves joints directly.

import type { Character, Gesture } from './character';
import type { Mood } from './mood';
import { GRAVITY, type Bounds, type Platform } from './physics';
import { surfaceBelow, type Wall } from './world';
import { SHAPES, type Doodle } from './doodles';
import { chance, clamp, pick, rand, sign, type Vec } from './math';

export type LookMode = 'default' | 'cursor' | 'away' | 'down' | 'none';

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
  | { sit: number };

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
      if (this.route.kind === 'wall') {
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

// ───────────── mischief ─────────────

/** He draws a little picture next to himself with his own pen. */
export class DoodleSkill extends Skill {
  readonly name = 'doodle';
  private doodle: Doodle | null = null;
  private plan: Vec[][] = [];
  private si = 0; private pi = 0; private along = 0;
  private finished = 0;
  start(c: Ctx) {
    const ch = c.char, sc = ch.scale, j = ch.body.j;
    const keys = Object.keys(SHAPES), shape = SHAPES[keys[Math.floor(Math.random() * keys.length)]];
    const size = 46 * sc, cx = ch.x + ch.facing * 34 * sc, cy = j.neck.y + 6 * sc;
    this.plan = shape.map((st) => st.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size })));
    this.doodle = { strokes: [], color: c.inkColor, born: c.world.time, done: false };
    c.doodles.push(this.doodle);
    if (c.doodles.length > 8) c.doodles.shift();
    c.look = 'none';
  }
  update(c: Ctx, dt: number) {
    const ch = c.char, d = this.doodle!;
    if (this.finished) { ch.handTarget = null; return this.t > this.finished; }
    if (!ch.ready) return this.t > 20;
    const stroke = this.plan[this.si];
    if (!stroke) { // all done: admire it
      d.done = true;
      this.finished = this.t + 1.2;
      ch.handTarget = null;
      c.say(pick(['ta-da', 'art.', 'nice', '✎']), 1.4);
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
    ch.handTarget = tip;
    // What's drawn so far of this stroke: the corners passed, plus wherever the pen is now.
    d.strokes[this.si] = [...stroke.slice(0, this.pi + 1), tip];
    if (this.pi >= stroke.length - 1) { this.si++; this.pi = 0; this.along = 0; }
    return this.t > 25;
  }
  stop(c: Ctx) { c.char.handTarget = null; if (this.doodle) this.doodle.done = true; }
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
      const dx = cur.x - ch.x, near = Math.hypot(cur.x - j.neck.x, cur.y - j.neck.y) < armLen * 1.05;
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
