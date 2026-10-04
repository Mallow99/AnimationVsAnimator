// Skills: small, named behaviors built on the character's commands.
// The mind (offline instinct now, an LLM later) only ever picks skills —
// it never moves joints directly.

import type { Character, Gesture, Keyframe } from './character';
import { GRAVITY, type Platform } from './physics';
import { surfaceBelow, type Wall } from './world';
import { SHAPES, type Becomes, type Doodle } from './doodles';
import { makeBridge, makeRamp, rampSlopeId, reserveThing, type Ball, type Thing } from './props';
import { platY } from './physics';
import { chance, clamp, pick, rand, sign, type Vec } from './math';
import type { LimbId } from './body';
import { preferredSlots, type Item, type ItemUse } from './items';

import { Skill, arrive, type Ctx, type LookMode } from './skills/context';
export { Skill, DEFAULT_LESSONS, type Ctx, type World, type Lessons, type LookMode } from './skills/context';
export { propsOf, SitOnProp, WatchTV, PlayVideoGame, RideScooter } from './skills/props';
export { Duel } from './skills/duel';

/** Do some skills one after the other (each one is made when its turn comes). */
export class Chain extends Skill {
  private i = -1;
  private sub: Skill | null = null;
  constructor(readonly name: string, private steps: ((c: Ctx) => Skill | null)[]) { super(); }
  update(c: Ctx, dt: number) {
    if (this.sub) {
      this.sub.t += dt;
      if (!this.sub.update(c, dt)) return false;
      this.sub.stop(c); this.sub = null;
    }
    while (++this.i < this.steps.length) {
      this.sub = this.steps[this.i](c);
      if (this.sub) { this.sub.start(c); return false; }
    }
    return true;
  }
  stop(c: Ctx) { this.sub?.stop(c); }
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
      const arm = ch.d.upperArm + ch.d.foreArm;
      if (Math.hypot(cur.x - ch.body.j.neck.x, cur.y - ch.body.j.neck.y) < arm) {
        // In reach: angry, a real punch. Playful, a "tag!" poke.
        ch.doGesture(this.angry ? 'punch' : 'pokeBack', cur);
        if (!this.angry && chance(0.4)) c.say(pick(['tag!', 'boop', 'gotcha']), 0.9);
      } else if (Math.abs(dx) < 40 && above > 0 && above < 200 * ch.scale) {
        ch.jumpPunch(cur);
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
  | { kind: 'ceiling'; edge: Wall; dropX: number }
  | { kind: 'ramp' }    // draw himself a ramp up to it
  | { kind: 'bridge' }; // draw a bridge across the gap to it

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
  if (target.id === ch.support || h < 40 * sc || target.x2 - target.x1 < 36) return null;
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

/** A route he'd have to draw: a ramp up to it, or a bridge across to it. */
export function drawnRoute(c: Ctx, target: Platform): Route | null {
  if (target.id === c.char.support || target.win === undefined) return null;
  if (bridgePlan(c, target)) return { kind: 'bridge' };
  if (rampPlan(c, target)) return { kind: 'ramp' };
  return null;
}

/** Window tops he could get onto from where he stands (by any route, drawing one if he has to). */
export function reachableAbove(c: Ctx): { target: Platform; route: Route; drawn: Route | null }[] {
  return c.world.platforms
    .map((target) => { const drawn = drawnRoute(c, target); return { target, route: routeTo(c, target) ?? drawn, drawn }; })
    .filter((o): o is { target: Platform; route: Route; drawn: Route | null } => o.route !== null);
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
  private sub: Skill | null = null;
  constructor(private target: Platform, private route: Route) { super(); }

  start(c: Ctx) {
    c.look = 'none';
    if (this.route.kind === 'ceiling') { this.sub = new MonkeyBars(this.route.edge, this.route.dropX, false); this.sub.start(c); return; }
    if (this.route.kind === 'ramp') { this.sub = new DrawRamp(this.target); this.sub.start(c); return; }
    if (this.route.kind === 'bridge') { this.sub = new BridgeTo(this.target); this.sub.start(c); return; }
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
      const done = this.sub.update(c, dt);
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

// ───────────── his drawings, alive ─────────────

/** Kick a ball around: get behind it, wind up, boot it toward the middle of the screen. A few times. */
export class KickBall extends Skill {
  readonly name = 'kick';
  private kicks = 0;
  private phase: 'go' | 'kick' = 'go';
  private next = 0;
  constructor(private ball: Ball | null = null, private times = 3) { super(); }
  start(c: Ctx) { c.look = 'target'; }
  update(c: Ctx) {
    const ch = c.char, b = this.ball ?? c.props?.nearestBall(ch.x, ch.body.j.hip.y) ?? null;
    if (!b || !c.props?.balls.includes(b) || ch.legCount < 2) return true;
    this.ball = b;
    c.lookTarget = { x: b.x, y: b.y };
    const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
    if (b.y < feet - 90 * ch.scale || b.heldBy) return this.t > 12; // up somewhere, or you've got it
    const b0 = c.world.bounds;
    let dir = b.x < (b0.left + b0.right) / 2 ? 1 : -1; // toward the middle of the screen
    // Up against a wall, there's no room to get behind it: kick it into the wall, it bounces back out.
    const room = ch.surfaceRange(), behind = b.x - dir * (b.r + 13 * ch.scale);
    if (behind < room.x1 + 8 || behind > room.x2 - 8) dir = -dir;
    if (this.phase === 'kick') {
      if (ch.currentGesture === 'kick') return false;
      this.kicks++;
      if (this.kicks >= this.times) { if (chance(0.5)) c.say(pick(['GOAL', 'nice', 'heh']), 1.2); return true; }
      this.phase = 'go'; this.next = this.t + 0.5;
      return false;
    }
    if (this.t < this.next || !ch.ready) return this.t > 30;
    this.next = this.t + 0.25;
    const spot = b.x - dir * (b.r + 13 * ch.scale);
    if (Math.abs(spot - ch.x) > 5 * ch.scale || Math.abs(b.vx) > 80) { ch.walkTo(spot, Math.abs(spot - ch.x) > 150); return false; }
    ch.stop();
    ch.facing = dir;
    ch.doGesture('kick');
    this.phase = 'kick';
    return false;
  }
  stop(c: Ctx) { c.char.stop(); }
}

/** Get up onto the nearest box or ledge he drew (vaulting onto a box, jumping onto a ledge). */
export function onDrawnBlock(c: Ctx): Skill | null {
  const blocks = c.props?.blocks ?? [];
  const ch = c.char;
  const options = blocks.map((b) => ({ b, route: routeTo(c, b.platform) })).filter((o) => o.route);
  options.sort((a, b) => Math.abs((a.b.platform.x1 + a.b.platform.x2) / 2 - ch.x) - Math.abs((b.b.platform.x1 + b.b.platform.x2) / 2 - ch.x));
  const o = options[0];
  return o ? new ClimbOnto(o.b.platform, o.route!) : null;
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
    if (it.def.wear) {
      const at = ch.body.j[it.def.wear === 'head' ? 'head' : 'hip'];
      ch.handTarget = { x: at.x, y: at.y };
      if (this.stowT < 0.4) return false;
      c.items.stow(it); ch.handTarget = null; c.sound?.('pickup'); return true;
    }
    const slot = preferredSlots(it.def).find((s) => !c.items.belt[s]);
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
/** Where a drawing goes: in front of him (chest height), on the floor in front, or up in the air. */
export type DrawPlace = 'front' | 'floor' | 'air';

export class DoodleSkill extends Skill {
  readonly name = 'doodle';
  /**
   * `shape`: strokes in a box from -0.5 to 0.5 (y down). Left out = one of his usual pictures.
   * `becomes`: it comes to life when it's done (a ball, a box, a ledge, an item).
   */
  constructor(private shape?: Vec[][], private title = '', private opts: { becomes?: Becomes; place?: DrawPlace; surface?: Thing } = {}) { super(); }
  private doodle: Doodle | null = null;
  private plan: Vec[][] = [];
  private si = 0; private pi = 0; private along = 0;
  private finished = 0;
  private phase: 'tool' | 'fetch' | 'draw' | 'stow' | 'admire' = 'tool';
  private popped = false;
  private tool = new Tool('draw');
  private sub: Skill | null = null;
  start(c: Ctx) { c.look = 'none'; }

  /** Where the drawing goes: in front of him, about chest height. */
  private begin(c: Ctx) {
    const ch = c.char, sc = ch.scale, j = ch.body.j;
    const keys = Object.keys(SHAPES), name = keys[Math.floor(Math.random() * keys.length)];
    // (A ramp goes up the way he's facing: drawn facing left, it's the other way round.)
    const shape0 = this.shape ?? SHAPES[name];
    const shape = this.opts.becomes === 'ramp' && ch.facing < 0 ? shape0.map((st) => st.map((p) => ({ x: -p.x, y: p.y }))) : shape0;
    const place = this.opts.place ?? 'front', floor = Math.max(j.footL.y, j.footR.y) + 2;
    let size = (place === 'air' ? 64 : place === 'floor' ? 50 : 46) * sc;
    let cx = ch.x + ch.facing * (place === 'front' ? 40 : place === 'floor' ? 36 : 50) * sc;
    let cy = place === 'floor' ? floor - size * 0.47 : place === 'air' ? floor - 100 * sc : j.neck.y + 8 * sc;
    const surface = this.opts.surface, screen = surface?.def?.screen;
    if (surface && screen) {
      const center = surface.toWorld(screen[0] + screen[2] / 2, screen[1] + screen[3] / 2);
      cx = center.x; cy = center.y; size = Math.min(screen[2], screen[3]) * surface.scale * 0.8;
    }
    this.plan = shape.map((st) => st.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size })));
    this.doodle = { strokes: [], color: c.inkColor, born: c.world.time, done: false, shape, title: this.title || (this.shape ? 'made up' : name), becomes: this.opts.becomes, cx, cy, size, dir: ch.facing > 0 ? 1 : -1 };
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
      if (this.tool.stow(c, dt)) {
        this.phase = 'admire'; this.finished = this.t + 0.8;
        // Something solid needs room: step back from it first (he was leaning right over it).
        const d = this.doodle;
        if (d?.becomes === 'box' || d?.becomes === 'platform') {
          const away = ch.x - Math.sign((d.cx ?? ch.x) - ch.x || ch.facing) * 22 * ch.scale;
          ch.walkTo(away);
          this.finished = this.t + 1.6;
        }
      }
      return false;
    }
    if (this.phase === 'admire') {
      const d = this.doodle;
      // Pen away, straightened up: now it comes to life.
      if (d?.becomes && !this.popped && (this.t > this.finished - 0.4 || (!ch.walking && this.t > this.finished - 1.2))) {
        this.popped = true;
        if (d.cx !== undefined && !ch.walking) ch.facing = Math.sign(d.cx - ch.x) || ch.facing;
        c.onBecome?.(d);
      }
      return this.t > this.finished;
    }
    if (this.phase !== 'draw') return false;
    const d = this.doodle!, pen = this.tool.item!;
    if (pen.where !== 'hand') { c.say(pick(['hey!', 'my pen!']), 1.2); ch.handTarget = null; d.done = true; return true; } // it got taken mid-drawing
    const stroke = this.plan[this.si];
    if (!stroke) { // all done: admire it, put the pen away
      d.done = true;
      if (this.opts.surface && d.shape) {
        this.opts.surface.art = { shape: d.shape, color: d.color, title: d.title ?? 'drawing' };
        d.alive = true; // the canvas now owns the picture, so it moves with the prop
      }
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
    // He holds the pen pointing forward and down (up, for things above his head); his hand goes
    // where that puts the tip on the drawing.
    const aim = tip.y < ch.body.j.neck.y - 10 * ch.scale ? ch.dirToWorld(0.55, 0.83) : ch.dirToWorld(0.45, -0.89);
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

/** Approach his easel, then draw with the same pen controller used for doodles. */
export class PaintCanvas extends Skill {
  readonly name = 'paint';
  private sub: DoodleSkill | null = null;
  private center: Vec | null = null;
  constructor(private canvas: Thing) { super(); }
  update(c: Ctx, dt: number) {
    if (!c.props?.things.includes(this.canvas) || this.canvas.held || Math.abs(this.canvas.tilt) > 0.35) return true;
    const at = this.canvas.center;
    if (!this.sub) {
      if (this.t > 15) return true;
      if (!arrive(c, at.x - 40 * c.char.scale, 5)) return false;
      c.char.facing = 1;
      this.center = { ...at };
      this.sub = new DoodleSkill(undefined, '', { surface: this.canvas }); this.sub.start(c);
    }
    if (this.center && Math.hypot(at.x - this.center.x, at.y - this.center.y) > 10 * c.char.scale) return true;
    this.sub.t += dt; return this.sub.update(c, dt);
  }
  stop(c: Ctx) { this.sub?.stop(c); }
}

/** How each kind of swing goes (angles in degrees: 0 = straight ahead, 90 = straight up, negative = down). */
const SWINGS = {
  // A sword: wound up high behind him, a diagonal cut down through the front.
  swing: { top: 128, bottom: -48, windup: 0.38, cut: 0.13, follow: 0.3, lead: 0.45, bounce: -14, what: 'sword' },
  // A mace: right over his head and behind, then straight down into the floor in front. It bounces.
  smash: { top: 165, bottom: -84, windup: 0.46, cut: 0.15, follow: 0.34, lead: 0.3, bounce: 20, what: 'mace' },
} as const;

/**
 * Swinging his wooden sword (or smashing with his mace): draw it from his belt, wind up
 * (big and slow — that's the anticipation), cut (fast), follow through, then put it away.
 * At your cursor if it's close (when he's mad, or sparring), or just practicing.
 */
export class SwordSwing extends Skill {
  readonly name: string;
  private phase: 'tool' | 'approach' | 'windup' | 'slash' | 'follow' | 'stow' = 'tool';
  private tool: Tool;
  private pt = 0;
  private swings = 0;
  private hit = false;
  private from = -70;
  private k: { top: number; bottom: number; windup: number; cut: number; follow: number; lead: number; bounce: number; what: string };
  /**
   * `opts.target`: swing at this instead of your cursor (his friend, in a duel). `opts.item`: with this
   * one (a foam sword, a katana). `opts.keepOut`: leave it in his hand afterwards (more swings coming).
   */
  constructor(private times = 2, private atCursor = true, use: 'swing' | 'smash' = 'swing',
    private opts: { target?: () => Vec | null; item?: Item; keepOut?: boolean } = {}) {
    super();
    this.name = use === 'smash' ? 'smash' : 'swing';
    this.tool = new Tool(use);
    if (opts.item) this.tool.item = opts.item;
    this.k = SWINGS[use];
  }
  /** What he's swinging at: your cursor, his friend, or nothing (practice). */
  private aim(c: Ctx) { return this.opts.target ? this.opts.target() : this.atCursor ? c.world.cursor : null; }
  start(c: Ctx) { c.look = this.opts.target ? 'none' : this.atCursor ? 'cursor' : 'none'; }

  /** Arm and sword at angle phi (degrees: 0 = straight ahead, 90 = straight up, negative = down). */
  private pose(c: Ctx, phi: number) {
    const ch = c.char, it = this.tool.item!, j = ch.body.j, armLen = (ch.d.upperArm + ch.d.foreArm) * 0.85;
    const r = (phi * Math.PI) / 180, lead = r + this.k.lead;
    const arm = ch.dirToWorld(Math.cos(r), Math.sin(r));
    ch.handTarget = { x: j.neck.x + arm.x * armLen, y: j.neck.y + arm.y * armLen };
    it.aim = ch.dirToWorld(Math.cos(lead), Math.sin(lead));
  }

  /** Did the swing go through your cursor? (Once per swing.) */
  private checkHit(c: Ctx) {
    const it = this.tool.item!, cur = c.world.cursor, ch = c.char;
    if (this.hit || this.opts.target || !cur || it.tipSpeed < 200 || it.sweptDistTo(cur.x, cur.y) > (this.name === 'smash' ? 12 : 9) * ch.scale) return;
    this.hit = true;
    c.hitCursor?.(cur.x, cur.y, it.tipVel.x * 0.8, it.tipVel.y * 0.8 - (this.name === 'smash' ? 0 : 260), Math.max(0.6, it.def.hit));
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, cur = this.aim(c);
    this.pt += dt;
    if (this.phase !== 'tool' && this.phase !== 'stow' && this.tool.item?.where !== 'hand') return true;
    switch (this.phase) {
      case 'tool': {
        if (!ch.ready) return this.t > 20;
        const r = this.tool.fetch(c, dt);
        if (r === 'none') { missingTool(c, this.tool, this.k.what); return true; }
        if (r === 'ready') {
          if (this.tool.item?.def.id === 'mace') this.k = { ...SWINGS.smash, windup: 0.65, cut: 0.18, follow: 0.45, bounce: 10, what: 'mace' };
          this.phase = 'approach'; this.pt = 0;
        }
        return false;
      }
      case 'approach': {
        // The far end of what he swings sweeps a circle around his shoulder: stand where your cursor is on it.
        const j = ch.body.j, arm = (ch.d.upperArm + ch.d.foreArm) * 0.85, L = this.tool.item!.def.length * ch.scale;
        const R = Math.hypot(arm + L * Math.cos(this.k.lead), L * Math.sin(this.k.lead));
        if (cur && this.pt < 3) {
          const dy = cur.y - j.neck.y, dx = cur.x - j.neck.x;
          const want = Math.sqrt(Math.max((0.8 * R) ** 2 - dy * dy, (0.3 * R) ** 2));
          if (Math.abs(Math.abs(dx) - want) > 8 * ch.scale) {
            if (ch.ready && !ch.walking) ch.walkTo(ch.x + dx - (Math.sign(dx) || ch.facing) * want, Math.abs(dx) > 150);
            return false;
          }
        }
        ch.stop();
        if (cur) ch.facing = Math.sign(cur.x - ch.x) || ch.facing;
        this.phase = 'windup'; this.pt = 0; this.from = -70;
        return false;
      }
      case 'windup': {
        // Anticipation: pull way back and up, slowing into the top.
        const u = Math.min(1, this.pt / this.k.windup);
        this.pose(c, lerpN(this.from, this.k.top, 1 - (1 - u) ** 3));
        if (u >= 1) { this.phase = 'slash'; this.pt = 0; this.hit = false; c.sound?.('whoosh'); }
        return false;
      }
      case 'slash': {
        // Fast, accelerating into the cut.
        const u = Math.min(1, this.pt / this.k.cut);
        this.pose(c, lerpN(this.k.top, this.k.bottom, u * u));
        this.checkHit(c);
        if (u >= 1) { this.phase = 'follow'; this.pt = 0; if (this.name === 'smash') c.sound?.('thud', 0.8); }
        return false;
      }
      case 'follow': {
        // Follow-through: carries on a little past the cut (a mace bounces back up), then settles.
        const u = Math.min(1, this.pt / this.k.follow);
        this.pose(c, this.k.bottom + Math.sin(Math.PI * u) * this.k.bounce);
        if (u < 0.4) this.checkHit(c); // (his hand catches up with the swing a moment after the cut)
        if (u >= 1) {
          this.swings++;
          this.from = this.k.bottom;
          if (this.swings < this.times) { this.phase = 'windup'; this.pt = 0; }
          else if (this.opts.keepOut) { this.tool.item!.aim = null; ch.handTarget = null; return true; }
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
    if (it?.where === 'hand') { it.aim = null; if (!this.opts.keepOut) c.items.stow(it); }
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
    if (it.where === 'belt' || it.where === 'worn') return true;
    if (it.where === 'cursor' || !hand) return true;
    if (this.phase === 'stow') return this.tool.stow(c, dt) || this.t > 15;
    if (it.where === 'hand') { this.phase = 'stow'; return false; }
    const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
    // (Give a falling or bouncing thing a moment to land before deciding it's out of reach.)
    const settled = it.speed < 60;
    if ((it.at.y < feet - 70 * ch.scale && this.t > 1.5 && settled) || this.t > 15) { if (this.comment) c.say(pick(['can\'t reach it', 'ugh. too high']), 1.4); return true; }
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

// ───────────── drawing his way there ─────────────

/** How steep the ramps he draws are (rise over run: 0.6 is about 31°). */
const RAMP_SLOPE = 0.6;

/** Hold his pen so its tip touches `tip` (pointing forward and down, like writing on the floor). */
function penTo(c: Ctx, pen: Item, tip: Vec) {
  const ch = c.char, aim = ch.dirToWorld(0.45, -0.89), len = pen.def.length * ch.scale;
  pen.aim = aim;
  ch.handTarget = { x: tip.x - aim.x * len, y: tip.y - aim.y * len };
}

/** Is there a ramp he could draw from where he stands up onto `target`? (Floor space for it, his pen, not too high.) */
export function rampPlan(c: Ctx, target: Platform | null): { x0: number; xe: number; dir: 1 | -1; floor: number; top: number } | null {
  const ch = c.char, sc = ch.scale, pen = c.items.find('draw');
  if (!pen || pen.where === 'cursor' || !ch.useHand || ch.legCount < 2) return null;
  const sp = ch.supportPlatform();
  if (sp?.y2 !== undefined) return null; // not from a slope
  const floor = sp ? sp.y : c.world.bounds.floor;
  if (!target) {
    // Just a ramp, in front of him: something to walk up and jump off.
    const h = 70 * sc, dir = (ch.facing > 0 ? 1 : -1) as 1 | -1, x0 = ch.x + dir * 30 * sc, xe = x0 + dir * (h / RAMP_SLOPE);
    return canStandAt(ch, xe + dir * 5) && canStandAt(ch, x0 - dir * 30 * sc) ? { x0, xe, dir, floor, top: floor - h } : null;
  }
  const h = floor - target.y;
  if (h < 40 * sc || h > 330 * sc || target.x2 - target.x1 < 40 || target.y2 !== undefined) return null;
  // Lean it on whichever end of the window is nearer, coming from outside the window.
  for (const dir of (ch.x < (target.x1 + target.x2) / 2 ? [1, -1] : [-1, 1]) as (1 | -1)[]) {
    const xe = dir > 0 ? target.x1 : target.x2, x0 = xe - dir * (h / RAMP_SLOPE);
    if (canStandAt(ch, x0 - dir * 36 * sc) && canStandAt(ch, xe - dir * 4)) return { x0, xe, dir, floor, top: target.y };
  }
  return null;
}

/**
 * He draws himself a ramp, Animator vs. Animation style: walks to where it'll go, draws its base
 * along the floor, turns round, and walks up the slope while his pen draws it just ahead of his
 * feet (the wet ink holds him). At the top he steps off onto the window and the drawing turns into
 * a real ramp (a wedge with weight; you can knock it over).
 */
export class DrawRamp extends Skill {
  readonly name = 'drawramp';
  private phase: 'go' | 'pen' | 'base' | 'turn' | 'slope' | 'off' | 'stow' | 'done' = 'go';
  private tool = new Tool('draw');
  private plan: NonNullable<ReturnType<typeof rampPlan>> | null = null;
  private doodle: Doodle | null = null;
  private baseEnd = 0;
  private ink = 0;
  private n = reserveThing();
  private wetId = 0;
  private pt = 0;
  constructor(private target: Platform | null) { super(); }
  start(c: Ctx) {
    this.plan = rampPlan(c, this.target);
    c.look = 'none';
    if (!this.plan) return;
    this.wetId = rampSlopeId(this.n, this.plan.dir);
    if (chance(0.6)) c.say(pick(["climb? nah. I'll draw", 'one sec', 'ramp time', 'watch this']), 1.6);
  }
  private slopeY(x: number) { const p = this.plan!; return Math.max(p.top, p.floor - (x - p.x0) * p.dir * RAMP_SLOPE); }

  update(c: Ctx, dt: number) {
    const ch = c.char, p = this.plan, sc = ch.scale;
    if (!p) { c.say(pick(['no room for a ramp', 'nope']), 1.4); return true; }
    this.pt += dt;
    const pen = this.tool.item;
    if (this.t > 60) return true;
    switch (this.phase) {
      case 'go':
        // Start by the high end, so the base gets drawn walking away from the window.
        if (!arrive(c, p.xe - p.dir * 16 * sc, 10)) return false;
        this.phase = 'pen'; this.pt = 0;
        return false;
      case 'pen': {
        const r = this.tool.fetch(c, dt);
        if (r === 'none') { missingTool(c, this.tool, 'pen'); return true; }
        if (r !== 'ready') return false;
        ch.facing = -p.dir;
        this.doodle = { strokes: [[{ x: p.xe, y: p.floor - 1 }]], color: c.inkColor, born: c.world.time, done: false, title: 'ramp', cx: (p.x0 + p.xe) / 2, cy: (p.floor + p.top) / 2, size: Math.abs(p.xe - p.x0) };
        c.doodles.push(this.doodle);
        this.baseEnd = p.xe;
        this.phase = 'base'; this.pt = 0;
        return false;
      }
      case 'base': {
        // Walking away from the window, pen on the floor in front of him: the base line.
        if (!pen || pen.where !== 'hand') return this.lost(c);
        const tipX = ch.x - p.dir * 22 * sc;
        if ((this.baseEnd - tipX) * p.dir > 0) this.baseEnd = p.dir > 0 ? Math.max(p.x0, tipX) : Math.min(p.x0, tipX);
        penTo(c, pen, { x: this.baseEnd, y: p.floor - 1 });
        this.doodle!.strokes[0] = [{ x: p.xe, y: p.floor - 1 }, { x: this.baseEnd, y: p.floor - 1 }];
        if (Math.random() < dt * 6) c.sound?.('scribble');
        if (Math.abs(this.baseEnd - p.x0) < 1) { this.phase = 'turn'; this.pt = 0; ch.handTarget = null; pen.aim = null; return false; }
        if (ch.ready && !ch.walking) ch.walkTo(p.x0 + p.dir * 18 * sc);
        return this.pt > 20 ? this.lost(c) : false;
      }
      case 'turn':
        // Round to the low end, and face up the slope.
        if (!arrive(c, p.x0 - p.dir * 22 * sc, 6)) return this.pt > 10 ? this.lost(c) : false;
        ch.facing = p.dir;
        this.ink = p.x0;
        this.doodle!.strokes[1] = [{ x: p.x0, y: p.floor - 1 }];
        this.phase = 'slope'; this.pt = 0;
        return false;
      case 'slope': {
        // Up the slope, drawing it a step ahead of his feet. The wet line is solid already.
        if (!pen || pen.where !== 'hand') return this.lost(c);
        const end = p.xe + p.dir * 10 * sc;
        const tipX = ch.x + p.dir * 24 * sc;
        if ((tipX - this.ink) * p.dir > 0) this.ink = p.dir > 0 ? Math.min(end, tipX) : Math.max(end, tipX);
        const a = { x: p.x0 - p.dir * 3, y: p.floor }, b = { x: this.ink, y: this.slopeY(this.ink) };
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        c.props?.setWet(this.wetId, { id: this.wetId, x1: l.x, x2: r.x, y: l.y, y2: r.y });
        this.doodle!.strokes[1] = [{ x: p.x0, y: p.floor - 1 }, { x: this.ink, y: this.slopeY(this.ink) - 1 }];
        penTo(c, pen, { x: this.ink, y: this.slopeY(this.ink) - 1 });
        if (Math.random() < dt * 6) c.sound?.('scribble');
        if (Math.abs(this.ink - end) < 1) {
          ch.handTarget = null; pen.aim = null;
          // Back edge, down from the top (it draws itself: the magic of ink).
          this.doodle!.strokes[2] = [{ x: p.xe, y: p.top - 1 }, { x: p.xe, y: p.floor - 1 }];
          if (this.target) { this.phase = 'off'; this.pt = 0; ch.walkTo(p.xe + p.dir * 28 * sc, false, true); }
          else { this.phase = 'stow'; this.pt = 0; this.makeReal(c); }
          return false;
        }
        if (ch.mode === 'ground' && (this.ink - ch.x) * p.dir > 20 * sc) ch.walkTo(this.ink - p.dir * 18 * sc);
        if (ch.mode !== 'ground' && ch.mode !== 'air') return this.lost(c);
        return this.pt > 30 ? this.lost(c) : false;
      }
      case 'off':
        // Onto the window, then the drawing becomes a real ramp behind him.
        if (this.pt > 0.8 && ch.ready && (ch.supportPlatform()?.win === this.target?.win || this.pt > 4)) { this.makeReal(c); this.phase = 'stow'; this.pt = 0; }
        return false;
      case 'stow':
        if (this.tool.stow(c, dt) || this.pt > 2) {
          if (chance(0.6)) c.say(pick(['ta-da', 'who needs stairs', 'art AND engineering', 'easy']), 1.4);
          c.mood.feel('proud', 4);
          return true;
        }
        return false;
    }
    return this.t > 60;
  }

  private makeReal(c: Ctx) {
    const p = this.plan!, d = this.doodle!;
    c.props?.setWet(this.wetId, null);
    const t = makeRamp(d, p.x0, p.xe, p.floor, p.top, this.n);
    t.setDrawing(d.strokes);
    d.alive = true; d.done = true;
    c.props?.add(t);
    c.sound?.('poof', 0.5);
  }

  private lost(c: Ctx) {
    // Interrupted (you grabbed him, or his pen): the wet line dries up and vanishes.
    c.props?.setWet(this.wetId, null);
    if (this.doodle) this.doodle.done = true;
    c.char.handTarget = null;
    return true;
  }
  stop(c: Ctx) {
    if (this.phase !== 'stow' && this.phase !== 'done') this.lost(c);
    c.char.handTarget = null;
    const pen = this.tool.item;
    if (pen?.where === 'hand') { pen.aim = null; c.items.stow(pen); }
  }
}

/** Is there a gap from the edge of what he's on to `target` (about the same height) that he could draw a bridge over? */
export function bridgePlan(c: Ctx, target: Platform) {
  const ch = c.char, sc = ch.scale, sp = ch.supportPlatform(), pen = c.items.find('draw');
  if (!sp || sp.y2 !== undefined || target.y2 !== undefined || !pen || pen.where === 'cursor' || !ch.useHand) return null;
  if (Math.abs(target.y - sp.y) > 45 * sc) return null;
  const dir = (target.x1 >= sp.x2 ? 1 : target.x2 <= sp.x1 ? -1 : 0) as 1 | -1 | 0;
  if (!dir) return null;
  const from = dir > 0 ? sp.x2 : sp.x1, to = dir > 0 ? target.x1 : target.x2, gap = Math.abs(to - from);
  if (gap < 30 * sc || gap > 380 * sc) return null;
  return { dir, from, to, y1: sp.y, y2: target.y, fromWin: sp.win, toWin: target.win };
}

/**
 * A gap between two windows: he draws a bridge across it, walking out over the gap behind his pen
 * (the wet ink holds him). Once he's across, it turns into a real plank bridge stuck into both windows:
 * it sags a bit, more when someone's on it, and you can knock it loose.
 */
export class BridgeTo extends Skill {
  readonly name = 'drawbridge';
  private phase: 'go' | 'pen' | 'draw' | 'off' | 'stow' = 'go';
  private tool = new Tool('draw');
  private plan: ReturnType<typeof bridgePlan> = null;
  private doodle: Doodle | null = null;
  private ink = 0;
  private wetId = rampSlopeId(reserveThing(), 1);
  private pt = 0;
  constructor(private target: Platform) { super(); }
  start(c: Ctx) { this.plan = bridgePlan(c, this.target); c.look = 'none'; }
  private lineY(x: number) { const p = this.plan!; return p.y1 + (p.y2 - p.y1) * Math.min(1, Math.max(0, (x - p.from) / (p.to - p.from))); }
  update(c: Ctx, dt: number) {
    const ch = c.char, p = this.plan, sc = ch.scale, pen = this.tool.item;
    if (!p) { c.say(pick(["can't bridge that", 'too far']), 1.4); return true; }
    this.pt += dt;
    if (this.t > 60) return this.lost(c);
    switch (this.phase) {
      case 'go':
        if (!arrive(c, p.from - p.dir * 14 * sc, 8)) return false;
        ch.facing = p.dir; this.phase = 'pen'; this.pt = 0;
        if (chance(0.6)) c.say(pick(['bridge time', 'hold on', 'I got this']), 1.4);
        return false;
      case 'pen': {
        const r = this.tool.fetch(c, dt);
        if (r === 'none') { missingTool(c, this.tool, 'pen'); return true; }
        if (r !== 'ready') return false;
        this.ink = p.from;
        this.doodle = { strokes: [[{ x: p.from, y: p.y1 - 1 }]], color: c.inkColor, born: c.world.time, done: false, title: 'bridge' };
        c.doodles.push(this.doodle);
        this.phase = 'draw'; this.pt = 0;
        return false;
      }
      case 'draw': {
        if (!pen || pen.where !== 'hand' || (ch.mode !== 'ground' && ch.mode !== 'air')) return this.lost(c);
        const end = p.to + p.dir * 8 * sc, tipX = ch.x + p.dir * 24 * sc;
        if ((tipX - this.ink) * p.dir > 0) this.ink = p.dir > 0 ? Math.min(end, tipX) : Math.max(end, tipX);
        const a = { x: p.from - p.dir * 4, y: p.y1 }, b = { x: this.ink, y: this.lineY(this.ink) };
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        c.props?.setWet(this.wetId, { id: this.wetId, x1: l.x, x2: r.x, y: l.y, y2: Math.abs(r.y - l.y) > 0.5 ? r.y : undefined });
        this.doodle!.strokes[0] = [{ x: p.from, y: p.y1 - 1 }, { x: this.ink, y: this.lineY(this.ink) - 1 }];
        penTo(c, pen, { x: this.ink, y: this.lineY(this.ink) - 1 });
        if (Math.random() < dt * 6) c.sound?.('scribble');
        if (Math.abs(this.ink - end) < 1) { ch.handTarget = null; pen.aim = null; this.phase = 'off'; this.pt = 0; ch.walkTo(p.to + p.dir * 30 * sc, false, true); return false; }
        if (ch.mode === 'ground' && (this.ink - ch.x) * p.dir > 20 * sc) ch.walkTo(this.ink - p.dir * 18 * sc, false, true);
        return this.pt > 30 ? this.lost(c) : false;
      }
      case 'off':
        if (this.pt > 0.8 && ch.ready && (ch.support === this.target.id || ch.supportPlatform()?.win === this.target.win || this.pt > 4)) {
          // Across: now it's a real bridge (with planks), stuck into the windows on both ends.
          c.props?.setWet(this.wetId, null);
          const d = this.doodle!;
          d.alive = true; d.done = true;
          const bridge = makeBridge(d, p.from - p.dir * 2, p.y1, p.to + p.dir * 2, p.y2, 1.03);
          const from = c.world.windows.find((w) => w.id === p.fromWin), to = c.world.windows.find((w) => w.id === p.toWin);
          if (from) bridge.attachWindow(0, from);
          if (to) bridge.attachWindow(bridge.points.length - 1, to);
          c.props?.add(bridge);
          c.sound?.('poof', 0.5);
          this.phase = 'stow'; this.pt = 0;
        }
        return false;
      case 'stow':
        if (this.tool.stow(c, dt) || this.pt > 2) { if (chance(0.5)) c.say(pick(['bridged it', 'nailed it', 'engineering!']), 1.4); c.mood.feel('proud', 4); return true; }
        return false;
    }
    return false;
  }
  private lost(c: Ctx) { c.props?.setWet(this.wetId, null); if (this.doodle) this.doodle.done = true; c.char.handTarget = null; return true; }
  stop(c: Ctx) {
    if (this.phase !== 'stow') this.lost(c);
    c.char.handTarget = null;
    const pen = this.tool.item;
    if (pen?.where === 'hand') { pen.aim = null; c.items.stow(pen); }
  }
}

// ───────────── props: furniture and toys ─────────────

// ───────────── fighting your cursor ─────────────

/**
 * Sparring with your cursor (playful), or a real brawl (angry): fists up, close in, and
 * throw whatever fits where the cursor is — punches and backhand swats in arm's reach,
 * high kicks lower down, a jumping punch when it's above his head. His hits send it flying.
 */
export class Brawl extends Skill {
  readonly name: string;
  private next = 0;
  private hits = 0;
  private combo = 0;
  private done = 0;
  constructor(private dur: number, private angry: boolean) { super(); this.name = angry ? 'brawl' : 'spar'; }
  start(c: Ctx) {
    c.look = 'cursor';
    c.char.guard = true;
    c.say(this.angry ? pick(['come here.', 'you want some?', '>:(', 'oh it is ON']) : pick(['fight me!', 'put em up', 'en garde!', 'square up']), 1.4);
  }
  /** One of his hits landed (the mind tells him). */
  landed() { this.hits++; }
  update(c: Ctx) {
    const ch = c.char, cur = c.world.cursor;
    if (!cur) return true;
    if (this.done) return this.t > this.done;
    if (this.t > this.dur || this.hits >= (this.angry ? 4 : 3)) {
      ch.guard = false;
      if (ch.ready) {
        if (this.hits) { c.say(this.angry ? pick(['and STAY down', 'hmph.', 'learned your lesson?']) : pick(['K.O.!', 'I win!', 'flawless', 'ding ding ding']), 1.6); if (!this.angry) ch.doGesture('laugh'); }
        else c.say(pick(['too slow', 'hold still!', 'coward']), 1.4);
      }
      this.done = this.t + 1.2;
      return false;
    }
    if (ch.airPunch && ch.mode === 'air') ch.airPunch = { x: cur.x, y: cur.y };
    if (!ch.ready || this.t < this.next) return false;
    const j = ch.body.j, sc = ch.scale, arm = ch.d.upperArm + ch.d.foreArm, leg = ch.d.thigh + ch.d.shin;
    const dx = cur.x - ch.x, feet = Math.max(j.footL.y, j.footR.y);
    ch.facing = sign(dx || ch.facing);
    if (Math.hypot(cur.x - j.neck.x, cur.y - j.neck.y) < arm * 1.02 && cur.y < j.hip.y + 4 * sc) {
      // Close: little combos of punches, with the odd backhand.
      ch.stop();
      ch.doGesture(chance(0.22) ? 'swat' : 'punch', cur);
      this.next = this.t + (this.combo++ % 3 === 2 ? rand(0.45, 0.9) : 0.04);
      return false;
    }
    if (cur.y >= j.hip.y - 6 * sc && cur.y < feet && Math.hypot(cur.x - j.hip.x, cur.y - j.hip.y) < leg * 0.98) {
      ch.stop();
      ch.doGesture('highkick', cur);
      this.next = this.t + rand(0.3, 0.6);
      return false;
    }
    const above = j.neck.y - cur.y;
    if (Math.abs(dx) < arm * 1.3 && above > arm * 0.8 && above < arm + 230 * sc && ch.legCount === 2) {
      ch.jumpPunch(cur);
      this.next = this.t + 0.35;
      return false;
    }
    ch.walkTo(cur.x - sign(dx) * arm * 0.75, Math.abs(dx) > 160 || this.angry);
    this.next = this.t + 0.22;
    return false;
  }
  stop(c: Ctx) { c.char.guard = false; c.char.stop(); c.char.airPunch = null; }
}

/**
 * Monkey bars, but it's your cursor: he jumps up, grabs it and hangs off it for a few
 * seconds, swinging his legs, while you carry him around. Shake him off, or he lets go.
 */
export class HangCursor extends Skill {
  readonly name = 'hang';
  private phase: 'go' | 'jump' | 'hang' = 'go';
  private tries = 0;
  private until = 0;
  private next = 0;
  start(c: Ctx) { c.look = 'cursor'; }
  update(c: Ctx) {
    const ch = c.char, cur = c.world.cursor;
    if (this.phase === 'hang') {
      if (!ch.hangingOn) { if (ch.mode !== 'held') return this.t > 0.2; return false; }
      if (this.t > this.until) { ch.release(); c.say(pick(['bye!', 'wheee', 'ok down']), 1); return true; }
      return false;
    }
    if (!cur || this.t > 10) return true;
    const j = ch.body.j, arm = ch.d.upperArm + ch.d.foreArm, above = j.neck.y - cur.y;
    if (this.phase === 'jump') {
      if (ch.mode === 'air') {
        ch.airReach = { x: cur.x, y: cur.y };
        const h = ch.frontHand;
        if (Math.hypot(h.x - cur.x, h.y - cur.y) < 14 * ch.scale && c.hangOnCursor?.()) {
          this.phase = 'hang'; this.t = 0; this.until = rand(3, 6);
          c.say(pick(['gotcha!', 'hi!', 'wheee', 'take me places']), 1.4);
        }
        return false;
      }
      if (!ch.ready) return false;
      if (++this.tries >= 3) { c.say(pick(['aw', 'too high']), 1); return true; }
      this.phase = 'go';
    }
    // Get under it, then jump for it.
    if (!ch.ready || this.t < this.next) return false;
    this.next = this.t + 0.25;
    if (above < arm * 0.5 || above > arm + 240 * ch.scale) return this.t > 3; // not up where he can jump for it
    if (Math.abs(cur.x - ch.x) > 14 * ch.scale) { ch.walkTo(cur.x, Math.abs(cur.x - ch.x) > 150); return false; }
    ch.jumpPunch(cur, true);
    this.phase = 'jump';
    return false;
  }
  stop(c: Ctx) { if (c.char.hangingOn) c.char.release(); c.char.airReach = null; }
}

// ───────────── throwing things ─────────────

/**
 * Throwing his bouncy ball: out of his pocket, wind up overarm, and let fly at your cursor
 * (aimed so it arcs onto it). Or, just playing, bounce it off the floor and catch it.
 * Then he goes and gets it back.
 */
export class ThrowItem extends Skill {
  readonly name: string;
  private phase: 'tool' | 'approach' | 'wind' | 'fling' | 'watch' | 'catch' | 'fetch' | 'stow' = 'tool';
  private tool = new Tool('throw');
  private pt = 0;
  private sub: Skill | null = null;
  private throws = 0;
  constructor(private atCursor = true, private times = 1) { super(); this.name = atCursor ? 'throw' : 'bounce'; }
  start(c: Ctx) { c.look = this.atCursor ? 'cursor' : 'target'; }

  private hand(c: Ctx, fwd: number, up: number) {
    const ch = c.char, j = ch.body.j, arm = (ch.d.upperArm + ch.d.foreArm) * 0.9, d = ch.dirToWorld(fwd, up);
    ch.handTarget = { x: j.neck.x + d.x * arm, y: j.neck.y + d.y * arm };
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, cur = c.world.cursor, it = this.tool.item;
    this.pt += dt;
    if (this.sub) {
      this.sub.t += dt;
      if (!this.sub.update(c, dt)) return this.t > 30;
      this.sub.stop(c); this.sub = null;
      if (++this.throws < this.times && it && it.where !== 'world') { this.phase = 'tool'; this.tool = new Tool('throw'); this.tool.item = it; this.pt = 0; return false; }
      return true;
    }
    switch (this.phase) {
      case 'tool': {
        if (!ch.ready) return this.t > 15;
        const r = this.tool.fetch(c, dt);
        if (r === 'none') {
          const ball = c.items.find('throw');
          if (this.tool.why === 'lying' && ball && this.t < 15) { this.sub = new FetchItem(ball, false); this.sub.start(c); this.times = this.throws + 2; return false; }
          missingTool(c, this.tool, 'ball');
          return true;
        }
        if (r === 'ready') { this.phase = this.atCursor ? 'approach' : 'wind'; this.pt = 0; }
        return false;
      }
      case 'approach': {
        // Not too close, not across the whole screen.
        if (!cur) return true;
        const dx = cur.x - ch.x;
        if (Math.abs(dx) > 520 && this.pt < 3) { if (ch.ready && !ch.walking) ch.walkTo(cur.x - sign(dx) * 380, true); return false; }
        ch.stop();
        ch.facing = sign(dx || ch.facing);
        this.phase = 'wind'; this.pt = 0;
        return false;
      }
      case 'wind':
        // Anticipation: arm way back and up behind his head.
        this.hand(c, -0.55, 0.8);
        if (cur && this.atCursor) ch.facing = sign(cur.x - ch.x || ch.facing);
        if (this.pt > 0.32) { this.phase = 'fling'; this.pt = 0; c.sound?.('whoosh', 0.6); }
        return false;
      case 'fling': {
        this.hand(c, 0.95, 0.15);
        if (this.pt < 0.06 || !it || it.where !== 'hand') return this.pt > 1;
        const from = it.at;
        let vx: number, vy: number;
        if (this.atCursor && cur) {
          // Pick a flight time from the distance, then solve for the throw that lands on the cursor.
          const dx = cur.x - from.x, dy = cur.y - from.y, T = clamp(Math.hypot(dx, dy) / 950, 0.22, 0.75);
          vx = dx / T; vy = dy / T - 0.5 * GRAVITY * T;
        } else { vx = ch.facing * 140; vy = 520; } // down at the floor in front: it bounces back up
        c.items.drop(it, clamp(vx, -1700, 1700), clamp(vy, -1700, 1700));
        it.thrownAt = c.world.time; it.thrownBy = 'him';
        ch.handTarget = null;
        this.phase = this.atCursor ? 'watch' : 'catch'; this.pt = 0;
        return false;
      }
      case 'watch':
        // See where it went, then go get it.
        if (it) c.lookTarget = { x: it.at.x, y: it.at.y };
        c.look = 'target';
        if (this.pt > 1.4 || (it && it.speed < 30 && this.pt > 0.5)) {
          if (!it || it.where === 'cursor') return true;
          this.sub = new FetchItem(it, false); this.sub.start(c);
        }
        return false;
      case 'catch': {
        // Hand out to where the ball's coming back up; grab it when it gets there.
        if (!it || it.where !== 'world') return true;
        c.lookTarget = { x: it.at.x, y: it.at.y }; c.look = 'target';
        const hand = ch.useHand;
        if (!hand) return true;
        ch.handTarget = { x: it.at.x, y: Math.max(it.at.y, ch.body.j.neck.y - 10 * ch.scale) };
        const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
        if (this.pt > 0.15 && Math.hypot(h.x - it.at.x, h.y - it.at.y) < 11 * ch.scale) {
          c.items.toHand(it, hand);
          c.sound?.('pickup', 0.5);
          if (++this.throws < this.times) { this.phase = 'wind'; this.pt = 0; return false; }
          ch.handTarget = null;
          this.phase = 'stow'; this.pt = 0;
          return false;
        }
        if (this.pt > 2) { ch.handTarget = null; c.say(pick(['oops', 'butterfingers']), 1); this.sub = new FetchItem(it, false); this.sub.start(c); }
        return false;
      }
      case 'stow': return this.tool.stow(c, dt) || this.pt > 2;
    }
    return this.t > 30;
  }
  stop(c: Ctx) { c.char.handTarget = null; this.sub?.stop(c); const it = this.tool.item; if (it?.where === 'hand') { it.aim = null; c.items.stow(it); } }
}

// ───────────── your windows ─────────────

/**
 * Window sides he could walk up to and hit or push from where he stands (nearest first): any part of
 * the side that's level with his body, from his head down to his feet.
 */
export function windowSidesAtHand(c: Ctx): Wall[] {
  const ch = c.char, j = ch.body.j, arm = ch.d.upperArm + ch.d.foreArm;
  const top = j.head.y - ch.d.headR, feet = Math.max(j.footL.y, j.footR.y);
  return c.world.sides
    .filter((w) => w.win !== ch.supportPlatform()?.win && Math.min(w.y2, feet) - Math.max(w.y1, top) > 16 * ch.scale
      && canStandAt(ch, w.x - w.face * arm * 0.75))
    .sort((a, b) => Math.abs(a.x - ch.x) - Math.abs(b.x - ch.x));
}

/** Where on a window's side to aim (his body height, clamped to the part of the side that's there). */
const onSide = (w: Wall, y: number) => clamp(y, w.y1 + 5, w.y2 - 5);
const sideNow = (c: Ctx, w: Wall) => c.world.sides.find((x) => x.id === w.id) ?? c.world.sides.find((x) => x.win === w.win && x.face === w.face);

/**
 * Walking up to a spot for a window trick: true once he's there. If something stopped him
 * on the way (he tripped, got up somewhere else), he sets off again.
 */

/** Walk up to a window's side, put both hands on it, and push it along (it really moves). */
export class PushWindow extends Skill {
  readonly name = 'pushwindow';
  private phase: 'walk' | 'push' | 'done' = 'walk';
  private moved = 0;
  private lastX = 0;
  constructor(private wall: Wall, private dist = rand(120, 300)) { super(); }
  start(c: Ctx) { c.look = 'none'; this.walkUp(c); }
  private walkUp(c: Ctx) {
    const ch = c.char, arm = ch.d.upperArm + ch.d.foreArm;
    ch.walkTo(this.wall.x - this.wall.face * arm * 0.72);
  }
  update(c: Ctx) {
    const ch = c.char;
    const w = sideNow(c, this.wall);
    if (!w) return true; // the window's gone (or covered)
    this.wall = w;
    const arm = ch.d.upperArm + ch.d.foreArm;
    if (this.phase === 'walk') {
      if (this.t > 10) return true;
      if (!arrive(c, w.x - w.face * arm * 0.72)) return false;
      ch.facing = w.face;
      ch.pushAt = w.x; ch.pushY = onSide(w, ch.body.j.neck.y + 4 * ch.scale);
      this.phase = 'push'; this.t = 0; this.lastX = w.x;
      c.say(pick(['hnngh', 'heave', 'hup...', 'move it']), 1.4);
      return false;
    }
    if (this.phase === 'push') {
      if (ch.mode !== 'ground') return true;
      ch.pushAt = w.x; ch.pushY = onSide(w, ch.body.j.neck.y + 4 * ch.scale);
      this.moved += Math.abs(w.x - this.lastX);
      this.lastX = w.x;
      // Lean in and walk it along, a step at a time.
      if (this.t > 0.35 && !c.pushWindow?.(w.win!, w.face * 48 * ch.scale)) { c.say(pick(["won't budge", 'heavy...']), 1.4); this.phase = 'done'; this.t = 0; ch.pushAt = null; return false; }
      ch.walkTo(w.x - w.face * arm * 0.6);
      if (this.moved > this.dist || this.t > 6 || !canStandAt(ch, ch.x + w.face * 30 * ch.scale)) {
        ch.pushAt = null; ch.stop();
        this.phase = 'done'; this.t = 0;
        c.memory.count('windowsMoved');
        c.say(pick(['there.', 'much better', 'feng shui', 'phew']), 1.4);
      }
      return false;
    }
    return this.t > 0.8;
  }
  stop(c: Ctx) { c.char.pushAt = null; c.char.stop(); }
}

/** Walk up to a window's side and kick it (or punch it) across the screen. */
export class KickWindow extends Skill {
  readonly name = 'kickwindow';
  private phase: 'walk' | 'kick' | 'watch' = 'walk';
  constructor(private wall: Wall) { super(); }
  start(c: Ctx) {
    const ch = c.char;
    c.look = 'none';
    ch.walkTo(this.wall.x - this.wall.face * (ch.d.thigh + ch.d.shin) * 0.8, Math.abs(this.wall.x - ch.x) > 200);
  }
  update(c: Ctx) {
    const ch = c.char, w = sideNow(c, this.wall) ?? this.wall;
    if (this.phase === 'walk') {
      if (this.t > 10) return true;
      const j = ch.body.j, legLen = ch.d.thigh + ch.d.shin;
      // A kick if the side comes down to his hips, else a punch at whatever part of it he can reach.
      const kick = w.y2 > j.hip.y - 8 * ch.scale && w.y1 < j.hip.y + legLen * 0.5;
      if (!arrive(c, w.x - w.face * (kick ? legLen * 0.8 : (ch.d.upperArm + ch.d.foreArm) * 0.8))) return false;
      ch.facing = w.face;
      if (kick) ch.doGesture('highkick', { x: w.x + w.face * 6, y: onSide(w, j.hip.y - 2 * ch.scale) });
      else ch.doGesture('punch', { x: w.x + w.face * 6, y: onSide(w, j.neck.y + 4 * ch.scale) });
      c.say(pick(['HI-YAH', 'hyah!', 'kiai!']), 1);
      this.phase = 'kick'; this.t = 0;
      return false;
    }
    if (this.phase === 'kick') {
      if (ch.currentGesture) return this.t > 3;
      this.phase = 'watch'; this.t = 0;
      c.memory.count('windowsMoved');
      return false;
    }
    c.look = 'target';
    const r = c.world.windows.find((x) => x.id === w.win);
    if (r) c.lookTarget = { x: r.x + r.w / 2, y: r.y + 20 };
    if (this.t > 0.6 && chance(0.02)) c.say(pick(['heh', 'nailed it', 'bye window']), 1.2);
    return this.t > 1.6;
  }
  stop(c: Ctx) { c.char.stop(); }
}

/** Standing on a window, he crouches and shoves off: the window slides across the screen with him riding it. */
export class WindowSurf extends Skill {
  readonly name = 'surf';
  private phase: 'ready' | 'ride' | 'done' = 'ready';
  private win = -1;
  start(c: Ctx) {
    const ch = c.char, p = ch.supportPlatform();
    this.win = p?.win ?? -1;
    c.look = 'none';
    ch.surf = true;
  }
  update(c: Ctx) {
    const ch = c.char, p = ch.supportPlatform();
    if (this.win < 0 || !p || p.win !== this.win) return this.t > 0.5; // fell off, or never on one
    if (this.phase === 'ready') {
      if (this.t < 0.5) return false;
      const r = c.world.windows.find((x) => x.id === this.win), b = c.world.bounds;
      const room = r ? { left: r.x - b.left, right: b.right - (r.x + r.w) } : { left: 0, right: 0 };
      const dir = room.right > room.left ? 1 : -1, space = Math.max(room.left, room.right);
      if (space < 60 || !c.shoveWindow?.(this.win, dir * clamp(space * 2.2, 260, 720), 0)) { ch.surf = false; c.say(pick(['no room', 'nope']), 1); return true; }
      ch.facing = dir;
      c.say(pick(['WHEEE', 'surf\'s up!', 'cowabunga', 'wooo']), 1.6);
      this.phase = 'ride'; this.t = 0;
      c.memory.count('windowsMoved');
      return false;
    }
    if (this.phase === 'ride') {
      if (this.t > 0.3 && !c.windowMoving?.(this.win)) { ch.surf = false; this.phase = 'done'; this.t = 0; if (chance(0.5)) c.say(pick(['again!', 'gnarly', 'whoa']), 1.2); }
      return this.t > 6;
    }
    return this.t > 0.6;
  }
  stop(c: Ctx) { c.char.surf = false; }
}

/** Knock knock: walk up to a window and rap on it. It wobbles a little with each knock. */
export class KnockWindow extends Skill {
  readonly name = 'knock';
  private phase: 'walk' | 'knock' | 'wait' = 'walk';
  constructor(private wall: Wall) { super(); }
  start(c: Ctx) { c.look = 'none'; c.char.walkTo(this.wall.x - this.wall.face * (c.char.d.upperArm + c.char.d.foreArm) * 0.7); }
  update(c: Ctx) {
    const ch = c.char, w = sideNow(c, this.wall) ?? this.wall;
    if (this.phase === 'walk') {
      if (this.t > 10) return true;
      if (!arrive(c, w.x - w.face * (ch.d.upperArm + ch.d.foreArm) * 0.7)) return false;
      ch.facing = w.face;
      ch.doGesture('knock', { x: w.x, y: onSide(w, ch.body.j.neck.y + 2 * ch.scale) });
      this.phase = 'knock'; this.t = 0;
      return false;
    }
    if (this.phase === 'knock') {
      if (ch.currentGesture) return this.t > 3;
      c.say(pick(['anyone home?', 'hello?', 'knock knock', 'open up!']), 1.6);
      this.phase = 'wait'; this.t = 0;
      return false;
    }
    if (this.t > 1.8 && ch.ready) { if (chance(0.5)) ch.doGesture('shrug'); return true; }
    return this.t > 4;
  }
  stop(c: Ctx) { c.char.stop(); }
}

/** Sit on the edge of what he's standing on (a window top, a box), legs dangling, and watch the world. */
export class LedgeSit extends Skill {
  readonly name = 'ledgesit';
  private phase: 'walk' | 'sit' = 'walk';
  private side: 1 | -1 = 1;
  constructor(private dur: number) { super(); }
  start(c: Ctx) {
    const ch = c.char, r = ch.surfaceRange();
    this.side = ch.x - r.x1 < r.x2 - ch.x ? -1 : 1;
    ch.walkTo(this.side > 0 ? r.x2 : r.x1);
  }
  update(c: Ctx) {
    const ch = c.char;
    if (this.phase === 'walk') {
      if (this.t > 10) return true;
      if (!ch.ready || ch.walking) return false;
      if (!ch.sitEdge(this.side)) return true;
      this.phase = 'sit'; this.t = 0;
      if (chance(0.3)) c.say(pick(['nice view', 'ahh', '♪']), 1.4);
      return false;
    }
    if (ch.mode !== 'sit') return true;
    // Now and then, look down over the edge.
    c.look = Math.sin(this.t * 0.7) > 0.6 ? 'down' : 'default';
    if (this.t > this.dur) { ch.standUp(); return false; }
    return false;
  }
  stop(c: Ctx) { if (c.char.mode === 'sit' && c.char.onLedge) c.char.standUp(); }
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
