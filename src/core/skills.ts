// Skills: small, named behaviors built on the character's commands.
// The mind (offline instinct now, an LLM later) only ever picks skills —
// it never moves joints directly.

import type { Character, Gesture } from './character';
import type { Mood } from './mood';
import { GRAVITY, type Bounds, type Platform } from './physics';
import { surfaceBelow } from './world';
import { chance, clamp, pick, rand, sign, type Vec } from './math';

export type LookMode = 'default' | 'cursor' | 'away' | 'down' | 'none';

export interface World {
  bounds: Bounds;
  cursor: Vec | null;
  cursorMovedAt: number; // world.time when the cursor last moved
  time: number;          // seconds since start
  platforms: Platform[]; // window tops he can stand on
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

/** Window tops he could jump up onto from where he stands. */
export function reachableAbove(c: Ctx): Platform[] {
  const ch = c.char, floorY = ch.body.j.footL.y, range = ch.surfaceRange();
  return c.world.platforms.filter((p) => {
    const h = floorY - p.y;
    if (p.id === ch.support || h < 40 * ch.scale || h > maxClimb(ch) || p.x2 - p.x1 < 50) return false;
    // Must be able to get close: overlapping our surface, or within a short hop of its ends.
    const gap = Math.max(p.x1 - range.x2, range.x1 - p.x2, 0);
    return gap < 90 * ch.scale;
  });
}

/** Drop height (px) if he hops off the given side of what he's standing on. */
export function dropFrom(c: Ctx, side: -1 | 1) {
  const ch = c.char, r = ch.surfaceRange(), y = ch.body.j.footL.y;
  const x = side < 0 ? r.x1 - 25 * ch.scale : r.x2 + 25 * ch.scale;
  if (x < c.world.bounds.left || x > c.world.bounds.right) return Infinity;
  return surfaceBelow(x, y + 5, c.world.platforms, c.world.bounds.floor).y - y;
}

export class ClimbOnto extends Skill {
  readonly name = 'climb';
  private phase: 'walk' | 'jump' | 'check' = 'walk';
  private tries = 0;
  private launchX = 0;
  constructor(private target: Platform) { super(); }

  start(c: Ctx) { this.planLaunch(c); c.look = 'none'; }

  private planLaunch(c: Ctx) {
    const ch = c.char, t = this.target, r = ch.surfaceRange(), m = 16 * ch.scale;
    // Best: stand right under the window (overlap) and jump straight up through it.
    const lo = Math.max(r.x1 + m, t.x1 + m), hi = Math.min(r.x2 - m, t.x2 - m);
    this.launchX = lo <= hi ? clamp(ch.x, lo, hi) : t.x1 > r.x2 ? r.x2 - m : r.x1 + m;
    ch.walkTo(this.launchX);
    this.phase = 'walk';
  }

  update(c: Ctx) {
    const ch = c.char, t = c.world.platforms.find((p) => p.id === this.target.id);
    if (!t) return true; // the window went away
    this.target = t;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      const h = ch.body.j.footL.y - t.y + 28 * ch.scale;
      const vy = Math.sqrt(2 * GRAVITY * Math.max(h, 10));
      const landX = clamp(ch.x, t.x1 + 20 * ch.scale, t.x2 - 20 * ch.scale);
      const vx = clamp(((landX - ch.x) / (vy / GRAVITY)) * 0.9, -320, 320);
      ch.facing = sign(landX - ch.x + 0.01);
      ch.jump(vx, -vy);
      this.phase = 'jump';
      this.t = 0;
    } else if (this.phase === 'jump' && this.t > 0.3 && ch.ready) {
      if (ch.support === t.id) { if (chance(0.4)) c.say(pick(['ha!', 'up!', 'made it'])); return true; }
      if (++this.tries >= 2) { c.say(pick(['hmph.', 'nope', 'too high'])); return true; }
      this.planLaunch(c);
    }
    return this.t > 20;
  }
  stop(c: Ctx) { c.char.stop(); }
}

export class GetDown extends Skill {
  readonly name = 'getdown';
  private phase: 'walk' | 'hop' = 'walk';
  drop = 0;
  constructor(private side: -1 | 1) { super(); }
  start(c: Ctx) {
    const ch = c.char, r = ch.surfaceRange();
    this.drop = dropFrom(c, this.side);
    ch.walkTo(this.side < 0 ? r.x1 : r.x2);
  }
  update(c: Ctx) {
    const ch = c.char;
    if (this.phase === 'walk' && ch.ready && !ch.walking) {
      ch.facing = this.side;
      ch.jump(this.side * 130, -260);
      this.phase = 'hop';
      this.t = 0;
    }
    return (this.phase === 'hop' && this.t > 0.4 && ch.mode !== 'air') || this.t > 20;
  }
  stop(c: Ctx) { c.char.stop(); }
}

// ───────────── preset sequences ─────────────

export const presets = {
  dance: () => new Sequence('dance', [
    { say: '♪' }, { jump: 280 }, { face: 'flip' }, { jump: 280 }, { gesture: 'wave' }, { face: 'flip' }, { jump: 380 }, { gesture: 'laugh' },
  ]),
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
