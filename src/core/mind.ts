// The offline mind ("Mode 0"): instinct, no AI.
//
// Two jobs:
//   1. When he's free, pick the next skill. Each option gets a score from his
//      mood, then we roll weighted dice — so he's predictable in spirit but
//      never on rails.
//   2. React to what happens to him (pokes, grabs, throws, crashes, petting).
//      The SAME poke gets a different reaction depending on how he feels.
//
// Later an LLM mind can sit on top of this: same skills, same mood, it just
// gets a say in the choices and adds real words.

import type { CharEvent, Gesture, Keyframe } from './character';
import { LIVE_SHAPES, type Becomes } from './doodles';
import type { Vec } from './math';
import type { MoodState } from './mood';
import { chance, pick, rand, sign } from './math';
import {
  Brawl, HangCursor, ThrowItem, PushWindow, KickWindow, WindowSurf, KnockWindow, LedgeSit, windowSidesAtHand,
  AskBack, KickBall, onDrawnBlock, WallJump, wallJumpTarget, type DrawPlace, AvoidCursor, ChaseCursor, FetchItem, PuppetMove, Reattach, SwordSwing, ClimbOnto, climbDownOption, DoodleSkill, dropFrom, GetDown, GrabCursor, MonkeyBars, Idle, presets, reachableAbove, Sequence, SitFor, Skill, Sleep, Wander, type Ctx,
} from './skills';

export type MindEvent = CharEvent | { type: 'poked' } | { type: 'petted' } | { type: 'smacked'; speed: number }
  | { type: 'itemTaken'; name: string } | { type: 'itemGiven'; name: string } | { type: 'itemDropped'; name: string; uid: number }
  | { type: 'bonked'; speed: number } // a ball hit him
  | { type: 'hitCursor'; power: number; by: string } // he hit your cursor (and maybe sent it flying)
  | { type: 'cursorFreed' }   // you took your cursor back mid-flight
  | { type: 'parried' }       // he blocked your smack
  | { type: 'windowStuck' };  // he tried to move a window and it wouldn't budge

interface Option { name: string; score: number; why: string; make: () => Skill }

const cur0 = (w: { cursor: Vec | null }) => w.cursor !== null;

/** One step of a plan (from his AI brain): done in order. */
export type PlanStep =
  | { do: string }
  | { say: string }
  | { wait: number }
  | { walk: 'left' | 'right' | 'cursor' | 'away' }
  | { move: Keyframe[]; name?: string }
  | { draw: Vec[][]; title?: string; becomes?: Becomes; place?: DrawPlace };

/** Runs a plan: each step's skill to the end, then the next. */
class PlanSkill extends Skill {
  private i = -1;
  private sub: Skill | null = null;
  private waitLeft = 0;
  private settle = 0;
  constructor(private mind: Mind, private steps: PlanStep[]) { super(); }
  /** Shows as whatever step he's on ("hop", "move", ...). */
  get name() { return this.sub?.name ?? 'plan'; }

  update(c: Ctx, dt: number): boolean {
    if (this.sub) {
      this.sub.t += dt;
      if (!this.sub.update(c, dt)) return false;
      this.sub.stop(c);
      this.sub = null;
    }
    if (this.waitLeft > 0) { this.waitLeft -= dt; return false; }
    // Body steps need him on his feet; give him a moment to get there.
    const next = this.steps[this.i + 1];
    if (next && !('say' in next) && !('wait' in next) && !(c.char.ready || c.char.mode === 'sit')) {
      this.settle += dt;
      return this.settle > 6;
    }
    this.settle = 0;
    if (++this.i >= this.steps.length) return true;
    const st = this.steps[this.i];
    if ('say' in st) { c.say(st.say); this.waitLeft = Math.min(3, 0.8 + st.say.length * 0.04); return false; }
    if ('wait' in st) { this.waitLeft = Math.min(5, Math.max(0, st.wait)); return false; }
    const sub = 'do' in st ? this.mind.makeSkill(c, st.do)
      : 'move' in st ? new PuppetMove(st.move)
        : 'draw' in st ? new DoodleSkill(st.draw, st.title, { becomes: st.becomes, place: st.place ?? (st.becomes === 'box' ? 'floor' : st.becomes === 'platform' ? 'air' : 'front') })
          : new Sequence('walk', [{ walkTo: this.walkTarget(c, st.walk) }]);
    if (sub) { this.sub = sub; sub.start(c); }
    return false;
  }

  private walkTarget(c: Ctx, w: 'left' | 'right' | 'cursor' | 'away') {
    const x = c.char.x, cur = c.world.cursor;
    if (w === 'cursor') return cur ? cur.x : x;
    if (w === 'away') return x - sign((cur?.x ?? x + 1) - x) * rand(200, 350);
    return x + (w === 'left' ? -1 : 1) * rand(150, 300);
  }

  stop(c: Ctx) { this.sub?.stop(c); this.sub = null; }
}

/** What finishing an activity does to his mood. Gives his feelings real causes. */
const AFTERGLOW: Record<string, Partial<MoodState>> = {
  dance: { boredom: -0.3, happiness: 0.06, energy: -0.04 },
  hop: { boredom: -0.1, happiness: 0.02, energy: -0.02 },
  chase: { boredom: -0.35, happiness: 0.05, energy: -0.05 },
  explore: { boredom: -0.25 },
  monkeybars: { boredom: -0.4, happiness: 0.06, energy: -0.06 },
  doodle: { boredom: -0.3, happiness: 0.05 },
  grabcursor: { boredom: -0.4, happiness: 0.08, annoyance: -0.1 },
  wander: { boredom: -0.1 },
  climb: { boredom: -0.25, happiness: 0.05 },
  getdown: { boredom: -0.05 },
  stretch: { energy: 0.03 },
  sit: { energy: 0.03, boredom: 0.03 },
  sulk: { happiness: 0.06, annoyance: -0.15 },
  tantrum: { annoyance: -0.25 },
  hunt: { annoyance: -0.15, energy: -0.04 },
  sleep: { happiness: 0.06 },
  reattach: { happiness: 0.08, fear: -0.1 },
  swing: { boredom: -0.25, annoyance: -0.2, happiness: 0.03 },
  walljump: { boredom: -0.35, happiness: 0.05, energy: -0.04 },
  kick: { boredom: -0.3, happiness: 0.05, energy: -0.03 },
  drawball: { boredom: -0.3, happiness: 0.05 }, drawbox: { boredom: -0.3, happiness: 0.04 }, drawledge: { boredom: -0.25 }, drawsword: { annoyance: -0.15 },
  backflip: { boredom: -0.25, happiness: 0.04, energy: -0.03 },
  frontflip: { boredom: -0.25, happiness: 0.04, energy: -0.03 },
  roll: { boredom: -0.1 },
  pickup: { boredom: -0.05 },
  spar: { boredom: -0.4, happiness: 0.07, energy: -0.05 },
  brawl: { annoyance: -0.3, energy: -0.05 },
  throw: { boredom: -0.25, happiness: 0.04, annoyance: -0.08 },
  bounce: { boredom: -0.25, happiness: 0.03 },
  smash: { boredom: -0.25, annoyance: -0.25 },
  pushwindow: { boredom: -0.3, happiness: 0.04, energy: -0.05 },
  kickwindow: { boredom: -0.3, annoyance: -0.2, happiness: 0.03 },
  surf: { boredom: -0.45, happiness: 0.08 },
  knock: { boredom: -0.15 },
  ledgesit: { energy: 0.05, boredom: 0.02, happiness: 0.03 },
  hang: { boredom: -0.35, happiness: 0.06 },
};

/** Things you can tell him to do from the settings window. */
export const COMMANDS: { name: string; label: string }[] = [
  { name: 'wander', label: 'Wander' }, { name: 'explore', label: 'Explore' }, { name: 'sit', label: 'Sit' },
  { name: 'sleep', label: 'Nap' }, { name: 'wake', label: 'Wake up' }, { name: 'dance', label: 'Dance' },
  { name: 'hop', label: 'Hop' }, { name: 'chase', label: 'Chase cursor' }, { name: 'climb', label: 'Climb a window' },
  { name: 'getdown', label: 'Get down' }, { name: 'monkeybars', label: 'Monkey bars' },
  { name: 'doodle', label: 'Doodle' }, { name: 'grabcursor', label: 'Grab cursor (mischief)' }, { name: 'tantrum', label: 'Tantrum' }, { name: 'sulk', label: 'Sulk' },
  { name: 'wave', label: 'Wave' }, { name: 'laugh', label: 'Laugh' }, { name: 'shrug', label: 'Shrug' },
  { name: 'stomp', label: 'Stomp' }, { name: 'stretch', label: 'Stretch' }, { name: 'cower', label: 'Cower' },
  { name: 'backflip', label: 'Backflip' }, { name: 'frontflip', label: 'Front flip' }, { name: 'roll', label: 'Roll' }, { name: 'walljump', label: 'Wall jump' },
  { name: 'drawball', label: 'Draw a ball (and kick it)' }, { name: 'drawbox', label: 'Draw a box (and vault it)' }, { name: 'drawledge', label: 'Draw a ledge (and get on it)' },
  { name: 'drawsword', label: 'Draw a sword' }, { name: 'kick', label: 'Kick the ball' }, { name: 'getonit', label: 'Get on what he drew' },
  { name: 'swing', label: 'Swing his sword' }, { name: 'slash', label: 'Attack the cursor' },
  { name: 'spar', label: 'Spar with the cursor' }, { name: 'brawl', label: 'Fight the cursor (for real)' },
  { name: 'throw', label: 'Throw his ball at the cursor' }, { name: 'bounce', label: 'Bounce his ball' }, { name: 'smash', label: 'Smash with his mallet' },
  { name: 'pushwindow', label: 'Push a window' }, { name: 'kickwindow', label: 'Kick a window' }, { name: 'surf', label: 'Surf on a window' },
  { name: 'knock', label: 'Knock on a window' }, { name: 'ledgesit', label: 'Sit on the edge' }, { name: 'hang', label: 'Hang off the cursor' },
  { name: 'loseArm', label: 'Lose an arm' }, { name: 'loseLeg', label: 'Lose a leg' },
];

export class Mind {
  skill: Skill | null = null;
  private last = '';
  private queued: Skill | null = null;
  private pokes: number[] = [];
  private lookAt: { x: number; y: number } | null = null;
  private lookUntil = 0;
  private history: string[] = [];
  private onWindowSince = -1;   // world.time he got onto the window he's on (-1 = on the floor)
  private lastSupport = -1;
  private quipAt = 0;           // rate-limits little remarks
  private stuckAsked = 0;
  private restUntil = 0;
  private lastDoodle = -60;
  private lastGrab = -60;
  private watchStart = -1;
  private chill = false;
  private chillUntil = 0;
  private boredOfCursor = 0;        // short breather between activities
  private lastCursorSeen = 0;
  /** When you last took one of his things. */
  private takenAt = -100;
  /** When he last swatted your cursor off him, and last messed with a window. */
  private swatAt = -100;
  private hungAt = -100;
  private windowPrankAt = -100;
  /** Why he's doing what he's doing (shown in settings). */
  why = '';
  /** While the AI brain is deciding what he does next, instinct waits until this time. */
  holdUntil = 0;
  /** Your tweaks to how much he wants each thing (from the neurons in his head). 1 = normal. */
  biases: Record<string, number> = {};

  /** Recent skill names, newest last (for debugging and, later, the LLM). */
  get recent() { return this.history; }

  update(c: Ctx, dt: number) {
    c.mood.tick(dt);
    if (c.char.support !== this.lastSupport && c.char.mode === 'ground') {
      this.lastSupport = c.char.support;
      this.onWindowSince = c.char.support >= 0 ? c.world.time : -1;
    }
    c.char.posture = c.mood.posture();
    this.feelings(c, dt);

    if (this.skill) {
      this.skill.t += dt;
      if (this.skill.update(c, dt)) {
        const glow = AFTERGLOW[this.skill.name];
        if (glow) c.mood.nudge(glow);
        this.end(c);
        // Catch his breath before the next thing (longer when tired) — keeps him from twitching between activities.
        this.restUntil = c.world.time + rand(1.5, 4) * (1.5 - c.mood.s.energy * 0.5);
      }
    } else if (this.queued && (c.char.ready || c.char.mode === 'sit')) {
      this.begin(c, this.queued);
      this.queued = null;
    } else if (c.char.ready && c.world.time >= this.restUntil && c.world.time >= this.holdUntil) {
      const o = this.choose(c);
      this.why = o.why;
      this.begin(c, o.make());
    }
    this.updateLook(c);
  }

  /** Slow, sensible mood changes from what's going on around him. */
  private feelings(c: Ctx, dt: number) {
    const m = c.mood, w = c.world, ch = c.char;
    // How he walks says how he feels.
    if (w.time > this.chillUntil) { this.chill = chance(0.5); this.chillUntil = w.time + rand(90, 240); }
    const L = m.label;
    ch.gait = L === 'angry' ? 'stomp' : L === 'playful' ? 'skip' : L === 'sad' || L === 'sleepy' ? 'sulk'
      : L === 'bored' || (L === 'content' && this.chill) ? 'pocket' : 'normal';
    // Moving around tires him out (running more), on top of the slow drain over time.
    if (ch.walking) m.s.energy -= dt / (ch.posture.speed > 1.2 ? 900 : 1800);
    // You coming back after a while: he's glad to see you.
    if (w.cursorMovedAt - this.lastCursorSeen > 120 && this.lastCursorSeen > 0 && !m.asleep) {
      m.nudge({ happiness: 0.08 * m.s.trust * 2, boredom: -0.25 });
      if (m.s.trust > 0.35 && ch.ready) {
        const line = c.memory.recall('greet') ?? pick(['oh hi!', 'hey!', "you're back"]);
        this.interrupt(c, new Sequence('greet', [{ face: 'cursor' }, { say: line }, { gesture: 'wave' }]));
        this.why = 'you came back';
      }
    }
    this.lastCursorSeen = w.cursorMovedAt;
    // You've had one of his things for a while: he stops lazing around and asks for it back.
    const taken = c.items.carried;
    const lazing = !this.skill || ['idle', 'wander', 'sit', 'explore', 'sigh', 'stretch'].includes(this.skill.name);
    if (taken && w.time - this.takenAt > 20 && lazing && !this.queued && ch.ready && ch.useHand && m.label !== 'sad' && m.label !== 'scared' && !m.asleep) {
      this.takenAt = w.time;
      this.interrupt(c, new AskBack(taken));
      this.why = `wants his ${taken.def.name.toLowerCase()} back`;
    }
    // Your cursor parked right on him: he swats it away (or boops it, or just glares at it).
    if (cur0(w) && w.time - w.cursorMovedAt > 2.2 && w.time > this.swatAt && lazing && !this.queued && !taken && (ch.ready || ch.mode === 'sit') && ch.useHand && !m.asleep) {
      const cur = w.cursor!, j = ch.body.j;
      const onHim = ch.hitTest(cur.x, cur.y, 12) !== null || Math.hypot(cur.x - j.head.x, cur.y - (j.head.y - ch.d.headR - 8 * ch.scale)) < 26 * ch.scale;
      if (onHim) {
        this.swatAt = w.time + rand(12, 25);
        const L2 = m.label;
        if (L2 !== 'sad' && L2 !== 'sleepy' && L2 !== 'scared') {
          const above = cur.y < j.head.y - ch.d.headR;
          this.interrupt(c, L2 === 'angry' ? new Sequence('swat', [{ face: 'cursor' }, { say: pick(['MOVE.', 'get off', 'ugh']) }, { gesture: 'punch', atCursor: true }])
            : L2 === 'playful' ? new Sequence('boop', [{ face: 'cursor' }, { gesture: above ? 'swat' : 'pokeBack', atCursor: true }, { say: pick(['boop', 'hehe', 'tag!']) }])
              : new Sequence('swat', [{ face: 'cursor' }, { wait: 0.4 }, { say: pick(['shoo', 'do you mind?', 'personal space']) }, { gesture: 'swat', atCursor: true }]));
          this.why = 'your cursor was sitting on him';
          if (ch.mode === 'sit') ch.standUp();
        }
      }
    }
    const away = w.time - w.cursorMovedAt;
    if (away > 300) { m.s.boredom += dt / 300; m.s.happiness -= dt / 1200; } // ignored for 5+ min: lonely
    else if (away < 3 && m.s.annoyance < 0.3 && w.cursor && Math.abs(w.cursor.x - ch.x) < 300) m.s.happiness += dt / 600; // company
  }

  /** Is he free to start something new (not busy, not mid-air)? */
  get idle() { return !this.skill && !this.queued; }

  /**
   * Do something because you said so (from the settings window), or because his AI brain decided to.
   * Returns false if he can't do that right now (e.g. "get down" while on the floor).
   * `quiet`: don't say "?" when he can't.
   */
  command(c: Ctx, name: string, why = 'you told him to', quiet = false): boolean {
    const ch = c.char, m = c.mood;
    if (name === 'wake') { m.asleep = false; this.end(c); ch.standUp(); return true; }
    const s = this.makeSkill(c, name);
    if (!s) {
      if (!quiet) c.say(name === 'grabcursor' ? '(mischief mode is off)' : '?', name === 'grabcursor' ? 2 : 1);
      return false;
    }
    this.interrupt(c, s);
    m.asleep = false;
    this.why = why;
    if (ch.mode === 'lie' || ch.mode === 'sit') ch.standUp();
    return true;
  }

  /** Carry out a plan from his AI brain. */
  perform(c: Ctx, steps: PlanStep[], why: string) {
    const ch = c.char;
    if (!steps.length || !['ground', 'sit', 'lie', 'air', 'ragdoll', 'getup'].includes(ch.mode)) return false;
    c.mood.asleep = false;
    this.interrupt(c, new PlanSkill(this, steps));
    this.why = why;
    if (ch.mode === 'lie' || ch.mode === 'sit') ch.standUp();
    return true;
  }

  /** Build the skill for a command name (null if he can't do it right now). */
  makeSkill(c: Ctx, name: string): Skill | null {
    if (name === 'wake') { c.mood.asleep = false; return new Sequence('wake', [{ wait: 0.1 }]); }
    if (name === 'grabcursor' && !c.canGrabCursor) return null;
    if (name === 'loseArm' || name === 'loseLeg') {
      // On purpose, for a gag (or because you told him to): pops one off with a little jump.
      const ch = c.char, l = name === 'loseArm' ? (ch.facing > 0 ? 'armL' : 'armR') : (ch.facing > 0 ? 'legL' : 'legR');
      if (!ch.destructible || !ch.hasLimb(l)) return null;
      return new Sequence(name, [{ say: pick(['watch this', 'hold on', 'heh']) }, { wait: 0.4 }, { pop: l }]);
    }
    const gestures: Gesture[] = ['wave', 'laugh', 'shrug', 'stomp', 'stretch', 'cower'];
    if ((gestures as string[]).includes(name)) return new Sequence(name, [{ gesture: name as Gesture, atCursor: true }]);
    return this.options(c).find((x) => x.name === name)?.make() ?? null;
  }

  /** What he's weighing right now and how much he wants each (for the neurons view in settings). */
  weigh(c: Ctx) {
    return this.options(c).map((o) => {
      const bias = this.biases[o.name] ?? 1;
      return { name: o.name, score: Math.round(o.score * bias * 100) / 100, bias, why: o.why };
    });
  }

  /** Forget the current plan (e.g. his body was rebuilt). */
  reset(c: Ctx) { this.end(c); this.queued = null; }

  private begin(c: Ctx, s: Skill) {
    c.look = 'default';
    this.skill = s;
    s.start(c);
    this.history.push(s.name);
    if (this.history.length > 20) this.history.shift();
  }

  private end(c: Ctx) {
    if (!this.skill) return;
    this.skill.stop(c);
    this.last = this.skill.name;
    this.skill = null;
    c.look = 'default';
  }

  /** Drop whatever he's doing (gestures too) and (optionally) do this next. */
  private interrupt(c: Ctx, next?: Skill) {
    this.end(c);
    c.char.cancelGesture();
    this.queued = next ?? null;
  }

  // ───────────── choosing what to do ─────────────

  private choose(c: Ctx): Option {
    const opts = this.options(c).map((o) => ({ ...o, score: o.score * (this.biases[o.name] ?? 1) }));
    // Square the scores so strong urges win more often; avoid repeating himself.
    let total = 0;
    const weights = opts.map((o) => {
      const wt = o.score > 0 ? o.score * o.score * (o.name === this.last ? 0.3 : 1) * rand(0.7, 1.3) : 0;
      total += wt;
      return wt;
    });
    let r = Math.random() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= weights[i];
      if (r <= 0) return opts[i];
    }
    return opts[0];
  }

  /** Everything he could do right now, how much he wants to, and why. */
  private options(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, w = c.world, ch = c.char;
    // Missing a limb: getting it back comes first.
    if (!ch.whole) return [
      { name: 'reattach', score: 5, why: 'wants his limb back', make: () => new Reattach() },
      { name: 'idle', score: 0.2, why: 'catching his breath', make: () => new Idle(rand(1, 2)) },
    ];
    const cur = w.cursor;
    const cursorActive = !!cur && w.time - w.cursorMovedAt < 6;
    const near = cursorActive && Math.abs(cur!.x - ch.x) < 250;
    const opts: Option[] = [
      { name: 'idle', score: 1.3, why: 'taking it easy', make: () => new Idle(rand(4, 10)) },
      { name: 'wander', score: 0.5 + s.boredom + s.energy * 0.3, why: s.boredom > 0.5 ? 'bored' : 'stretching his legs', make: () => new Wander() },
      { name: 'sit', score: 0.3 + (1 - s.energy) * 0.9, why: s.energy < 0.4 ? 'tired' : 'resting', make: () => new SitFor(rand(8, 20)) },
      { name: 'sleep', score: s.energy < 0.25 && s.annoyance < 0.5 && s.fear < 0.3 ? 2 + (0.25 - s.energy) * 8 : 0, why: 'worn out', make: () => new Sleep() },
      { name: 'chase', score: cursorActive && L === 'playful' ? 1.2 * s.trust + s.boredom : 0, why: 'wants to play with you', make: () => new ChaseCursor(rand(4, 8), false) },
      { name: 'brawl', score: cursorActive && L === 'angry' && ch.legCount === 2 && ch.useHand ? 1.5 : 0, why: 'mad at you: fists up', make: () => new Brawl(rand(5, 9), true) },
      { name: 'hang', score: cursorActive && c.cursorPlay && ch.legCount === 2 && ch.useHand && w.time - this.hungAt > 60 && cur!.y < ch.body.j.head.y - 20 && Math.abs(cur!.x - ch.x) < 300
          ? (L === 'playful' ? 0.45 : L === 'bored' ? 0.15 : 0) : 0,
        why: 'wants to hang off your cursor', make: () => { this.hungAt = w.time; return new HangCursor(); } },
      { name: 'spar', score: cursorActive && near && ch.legCount === 2 && ch.useHand ? (L === 'playful' ? 0.6 + s.trust * 0.4 : L === 'bored' ? 0.3 : 0.05) : 0,
        why: 'wants to spar with your cursor', make: () => new Brawl(rand(6, 10), false) },
      { name: 'avoid', score: near && (L === 'scared' || s.trust < 0.3) ? 2 : 0, why: s.fear > 0.3 ? 'scared of you' : "doesn't trust you", make: () => new AvoidCursor(4) },
      { name: 'dance', score: L === 'playful' ? 0.7 : 0, why: 'in a great mood', make: presets.dance },
      { name: 'hop', score: 0.05 + s.energy * 0.15 + (L === 'playful' ? 0.35 : 0), why: 'full of energy', make: () => presets.hop(s.energy) },
      { name: 'sulk', score: L === 'sad' ? 1.5 : 0, why: 'feeling down', make: () => new SitFor(rand(10, 22), true) },
      { name: 'tantrum', score: L === 'angry' ? 1 : 0, why: 'angry', make: presets.tantrum },
      { name: 'explore', score: L === 'bored' ? 1.2 : 0.15, why: 'curious', make: presets.explore },
      { name: 'stretch', score: 0.08 + (1 - s.energy) * 0.3, why: 'stiff', make: presets.stretch },
      { name: 'sigh', score: L === 'bored' ? 0.6 : 0, why: 'bored', make: presets.sigh },
      ...this.windowOptions(c),
      ...this.windowPranks(c),
      ...this.itemOptions(c),
      ...this.parkourOptions(c),
      ...this.liveDrawingOptions(c),
      { name: 'showoff', score: c.savedMoves?.length && (L === 'playful' || L === 'bored') && s.energy > 0.4 ? 0.3 : 0,
        why: 'showing off a move he learned', make: () => { const m = pick(c.savedMoves!); return new PlanSkill(this, [{ say: `${m.name}!` }, { move: m.frames, name: m.name }]); } },
      { name: 'doodle', score: c.world.time - this.lastDoodle > 90 && L !== 'sad' && L !== 'sleepy' ? 0.08 + s.boredom * 0.35 + (L === 'playful' ? 0.15 : 0) : 0,
        why: 'feeling creative', make: () => { this.lastDoodle = c.world.time; return new DoodleSkill(); } },
      { name: 'grabcursor', score: c.canGrabCursor && cursorActive && near && c.world.time - this.lastGrab > 60 && (L === 'playful' || L === 'bored' || L === 'angry') ? 0.7 : 0,
        why: L === 'angry' ? 'getting back at you' : 'feeling mischievous', make: () => { this.lastGrab = c.world.time; return new GrabCursor(); } },
    ];
    return opts;
  }

  /** Drawing things that come to life (and then using them). */
  private liveDrawingOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world;
    const pen = c.items.find('draw');
    const canDraw = !!pen && pen.where !== 'cursor' && !!ch.useHand && L !== 'sleepy' && L !== 'sad';
    const fresh = w.time - this.lastDoodle > 60;
    const fun = L === 'playful' ? 0.25 : L === 'bored' ? 0.2 : 0.04;
    const sword = c.items.list.find((it) => it.def.use === 'swing' && it.where !== 'cursor');
    const opts: Option[] = [];
    const draw = (name: string, shape: keyof typeof LIVE_SHAPES, becomes: Becomes, then: PlanStep[], why: string, score: number) =>
      opts.push({ name, why, score: canDraw && fresh ? score : 0, make: () => { this.lastDoodle = w.time; return new PlanSkill(this, [{ draw: LIVE_SHAPES[shape], title: shape, becomes }, ...then]); } });
    draw('drawball', 'ball', 'ball', [{ do: 'kick' }], 'wants something to kick around', fun * 0.8 + s.boredom * 0.1);
    draw('drawbox', 'box', 'box', [{ do: 'getonit' }, { wait: 1.5 }, { do: 'getdown' }], 'drawing himself something to climb', fun * 0.6 + s.boredom * 0.08);
    draw('drawledge', 'platform', 'platform', [{ do: 'getonit' }, { wait: 2 }, { do: 'getdown' }], 'drawing himself a ledge', fun * 0.3);
    // You took his sword? He draws a new one.
    draw('drawsword', 'sword', 'item', [{ do: 'swing' }], 'you took his sword, so he drew one', !sword && (L === 'angry' || L === 'playful') ? 0.9 : 0);
    const ball = c.props?.nearestBall(ch.x, ch.body.j.hip.y);
    if (ball && ch.legCount === 2) opts.push({ name: 'kick', why: 'kicking his ball around', score: L === 'playful' ? 0.9 : L === 'bored' ? 0.7 : 0.25, make: () => new KickBall(ball) });
    const block = c.props?.blocks.length ? onDrawnBlock(c) : null;
    if (block) opts.push({ name: 'getonit', why: 'climbing on what he drew', score: 0.15, make: () => onDrawnBlock(c)! });
    return opts;
  }

  /** Showing off: flips, rolls, wall jumps. */
  private parkourOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char;
    if (!ch.whole) return [];
    const lively = (L === 'playful' ? 0.3 : L === 'bored' ? 0.15 : 0.02) * (s.energy > 0.45 ? 1 : 0);
    const wall = wallJumpTarget(c);
    return [
      { name: 'backflip', why: 'showing off', score: lively * 0.8, make: () => new Sequence('backflip', [{ flip: -1 }]) },
      { name: 'frontflip', why: 'showing off', score: lively * 0.6, make: () => new Sequence('frontflip', [{ flip: 1 }]) },
      { name: 'roll', why: 'tumbling around', score: lively * 0.3, make: () => new Sequence('roll', [{ roll: true }]) },
      ...(wall ? [{ name: 'walljump', why: 'doing parkour', score: lively * 0.9, make: () => new WallJump(wall) }] : []),
    ];
  }

  /** Using his things: swinging his sword, tidying up what's lying around, asking for what you took. */
  private itemOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world, opts: Option[] = [];
    const sword = c.items.find('swing'), cur = w.cursor;
    const near = !!cur && w.time - w.cursorMovedAt < 6 && Math.abs(cur.x - ch.x) < 220;
    if (sword && (sword.where === 'belt' || sword.where === 'hand') && ch.useHand) {
      opts.push({ name: 'swing', why: 'practicing his sword moves', score: L === 'playful' ? 0.35 : L === 'bored' ? 0.25 + s.boredom * 0.2 : 0.05, make: () => new SwordSwing(2, false) });
      opts.push({ name: 'slash', why: 'going after your cursor with his sword', score: L === 'angry' && near ? 1.3 : 0, make: () => new SwordSwing(2, true) });
    }
    const mallet = c.items.find('smash');
    if (mallet && (mallet.where === 'belt' || mallet.where === 'hand') && ch.useHand) {
      const onWin = ch.supportPlatform()?.win !== undefined && c.canMoveWindows;
      opts.push({ name: 'smash', why: near ? 'going after your cursor with his mallet' : onWin ? 'bonking the window he\'s on' : 'practicing with his mallet',
        score: L === 'angry' ? (near ? 1.1 : 0.3) : L === 'playful' ? (onWin ? 0.3 : 0.12) : L === 'bored' ? 0.2 : 0.03, make: () => new SwordSwing(near ? 2 : 3, near, 'smash') });
    }
    const ball = c.items.find('throw');
    if (ball && ball.where !== 'cursor' && ch.useHand && ch.legCount === 2) {
      const active = !!cur && w.time - w.cursorMovedAt < 8;
      opts.push({ name: 'throw', why: L === 'angry' ? 'throwing things at you' : 'playing catch with your cursor',
        score: !active ? 0 : L === 'angry' ? 0.8 : L === 'playful' ? 0.45 : L === 'bored' ? 0.25 : 0.04, make: () => new ThrowItem(true, L === 'angry' ? 2 : 1) });
      opts.push({ name: 'bounce', why: 'bouncing his ball', score: L === 'bored' ? 0.35 : L === 'playful' ? 0.25 : L === 'content' ? 0.08 : 0, make: () => new ThrowItem(false, Math.floor(rand(2, 5))) });
    }
    // His things lying around (you dropped them, or he did): pick them up and put them back on his belt.
    const feet = Math.max(ch.body.j.footL.y, ch.body.j.footR.y);
    const lying = c.items.list.find((it) => it.where === 'world' && it.def.belt !== 'none' && it.at.y > feet - 60 * ch.scale && Math.abs(it.at.y - feet) < 120 * ch.scale);
    if (lying && ch.useHand) opts.push({ name: 'pickup', why: `his ${lying.def.name.toLowerCase()} is on the floor`, score: L === 'sleepy' ? 0.3 : 1.6, make: () => new FetchItem(lying) });
    // You've had one of his things for a while.
    const taken = c.items.carried;
    if (taken && w.time - this.takenAt > 15 && ch.useHand) {
      opts.push({ name: 'askback', why: `wants his ${taken.def.name.toLowerCase()} back`, score: L === 'sad' || L === 'scared' ? 0.3 : 2.2 + s.boredom * 0.5, make: () => { this.takenAt = w.time; return new AskBack(taken); } });
    }
    return opts;
  }

  /**
   * Messing with your windows: pushing, kicking, surfing on them, knocking on them, and sitting
   * on their edges. Not too often, and not the window you're busy in (unless he's mad).
   */
  private windowPranks(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, w = c.world, opts: Option[] = [];
    if (ch.support >= 0 && ch.whole) {
      opts.push({ name: 'ledgesit', why: L === 'sad' ? 'sitting on the edge, feeling down' : 'sitting on the edge, legs dangling',
        score: 0.2 + (1 - s.energy) * 0.45 + s.boredom * 0.2 + (L === 'sad' ? 0.4 : 0), make: () => new LedgeSit(rand(8, 20)) });
    }
    if (!ch.whole || L === 'sleepy' || L === 'sad' || L === 'scared' || s.energy < 0.3) return opts;
    const fresh = w.time - this.windowPrankAt > (L === 'angry' ? 25 : 50);
    const cur = w.cursor;
    // The window you're working in right now (cursor inside it, moving): leave it alone.
    const busy = (id?: number) => {
      const r = w.windows.find((x) => x.id === id);
      return !!r && !!cur && w.time - w.cursorMovedAt < 4 && cur.x >= r.x && cur.x <= r.x + r.w && cur.y >= r.y && cur.y <= r.y + r.h && L !== 'angry';
    };
    const sides = windowSidesAtHand(c).filter((x) => Math.abs(x.x - ch.x) < 600);
    const side = sides.find((x) => !busy(x.win));
    const prank = (name: string, why: string, score: number, make: () => Skill) =>
      opts.push({ name, why, score: fresh ? score : 0, make: () => { this.windowPrankAt = w.time; return make(); } });
    if (side) {
      prank('knock', 'curious what\'s inside that window', L === 'bored' ? 0.3 : L === 'playful' ? 0.15 : 0.08, () => new KnockWindow(side));
      if (c.canMoveWindows) {
        prank('pushwindow', 'rearranging your windows', L === 'bored' ? 0.35 : L === 'playful' ? 0.25 : L === 'angry' ? 0.2 : 0.05, () => new PushWindow(side));
        prank('kickwindow', L === 'angry' ? 'taking it out on a window' : 'practicing kicks on a window', L === 'angry' ? 0.7 : L === 'playful' ? 0.2 : L === 'bored' ? 0.12 : 0.02, () => new KickWindow(side));
      }
    }
    const on = ch.supportPlatform();
    if (on?.win !== undefined && c.canMoveWindows && !busy(on.win)) {
      prank('surf', 'surfing on your window', L === 'playful' ? 0.55 : L === 'bored' ? 0.4 : 0.06, () => new WindowSurf());
    }
    return opts;
  }

  /** Climbing onto windows and getting back down. */
  private windowOptions(c: Ctx): Option[] {
    const s = c.mood.s, L = c.mood.label, ch = c.char, opts: Option[] = [];
    const lazy = L === 'sleepy' || L === 'sad';
    const up = reachableAbove(c);
    if (up.length) {
      const pickOne = up[Math.floor(Math.random() * up.length)];
      opts.push({ name: 'climb', why: s.boredom > 0.4 ? 'bored, looking for something to do' : 'wants a better view',
        score: lazy ? 0 : 0.3 + s.boredom * 0.9 + s.energy * 0.4 + (L === 'playful' ? 0.4 : 0), make: () => new ClimbOnto(pickOne.target, pickOne.route) });
    }
    // Monkey bars across the top of the screen.
    const edge = c.world.walls.filter((w) => w.top === 'ceiling').sort((a, b) => Math.abs(a.x - ch.x) - Math.abs(b.x - ch.x))[0];
    if (edge && ch.support < 0) {
      const far = c.world.walls.find((w) => w.top === 'ceiling' && w !== edge)!;
      const hangLen = ch.d.upperArm + ch.d.foreArm + ch.d.torso + ch.d.thigh + ch.d.shin;
      const landing = c.world.platforms.filter((p) => p.y - (c.world.bounds.top + hangLen) < c.lessons.safeDrop * ch.scale && p.x2 - p.x1 > 60);
      const dropOn = landing.length && chance(0.6) ? landing[Math.floor(Math.random() * landing.length)] : null;
      opts.push({ name: 'monkeybars', why: L === 'playful' ? 'feeling acrobatic' : 'bored',
        score: lazy || s.energy < 0.4 ? 0 : 0.12 + s.boredom * 0.5 + (L === 'playful' ? 0.35 : 0),
        make: () => dropOn ? new MonkeyBars(edge, (dropOn.x1 + dropOn.x2) / 2, false) : new MonkeyBars(edge, far.x - far.face * 30 * ch.scale, true) });
    }
    if (ch.support >= 0) {
      const onFor = c.world.time - this.onWindowSince;
      const want = 0.15 + Math.min(onFor / 60, 1) * 0.6 + (L === 'sleepy' ? 0.3 : 0);
      const safe = c.lessons.safeDrop * ch.scale;
      const hops = ([-1, 1] as const).map((side) => ({ side, drop: dropFrom(c, side) })).filter((o) => o.drop < safe);
      const climbs = ([-1, 1] as const).map((side) => ({ side, o: climbDownOption(c, side) })).filter((x) => x.o && x.o.drop < safe);
      if (hops.length) {
        const best = hops.reduce((a, b) => (a.drop < b.drop ? a : b));
        opts.push({ name: 'getdown', why: 'done up here', score: want, make: () => new GetDown(best.side) });
      } else if (climbs.length) {
        const best = climbs[0];
        opts.push({ name: 'getdown', why: 'done up here (too high to jump, climbing down)', score: want, make: () => new GetDown(best.side, best.o!.wall) });
      } else if (onFor > 45 && c.world.time - this.stuckAsked > 60) {
        // Too high both ways: he's stuck up here.
        opts.push({ name: 'stuck', why: 'too high to jump down', score: want, make: () => { this.stuckAsked = c.world.time; return new Sequence('stuck', [
          { gesture: 'lookAround' }, { face: 'cursor' }, { say: pick(['uh... help?', 'how do I get down', 'too high...']) }, { sit: rand(6, 12) },
        ]); } });
      }
    }
    return opts;
  }

  // ───────────── where he looks ─────────────

  private updateLook(c: Ctx) {
    const ch = c.char, w = c.world, cur = w.cursor;
    const head = ch.body.j.head;
    switch (c.look) {
      case 'none': ch.look = null; return;
      case 'down': ch.look = { x: ch.x + ch.facing * 40, y: head.y + 200 }; return;
      case 'cursor': ch.look = cur; return;
      case 'target': ch.look = c.lookTarget ?? null; return;
      case 'away':
        ch.look = cur ? { x: ch.x - sign(cur.x - ch.x) * 300, y: head.y } : null;
        return;
    }
    // Default: glance at the cursor when it moves close by, then lose interest for a while
    // (staring at it all the time looked creepy). Otherwise look around now and then.
    const near = cur && Math.hypot(cur.x - ch.x, cur.y - head.y) < 260 && w.time - w.cursorMovedAt < 1.5;
    if (near && w.time > this.boredOfCursor && c.mood.label !== 'sad') {
      if (this.watchStart < 0) this.watchStart = w.time;
      if (w.time - this.watchStart < 2.5) { ch.look = cur; return; }
      this.boredOfCursor = w.time + rand(5, 10); // seen it
    }
    this.watchStart = -1;
    if (w.time > this.lookUntil) {
      this.lookUntil = w.time + rand(2, 5);
      this.lookAt = chance(0.5) ? null : { x: ch.x + rand(-400, 400), y: head.y + rand(-150, 80) };
    }
    ch.look = this.lookAt;
  }

  // ───────────── reactions ─────────────

  onEvent(c: Ctx, e: MindEvent) {
    const m = c.mood, ch = c.char;
    switch (e.type) {
      case 'limbOff': {
        m.asleep = false;
        m.nudge({ fear: 0.15, happiness: -0.1, annoyance: e.yanked ? 0.25 : 0.08, trust: e.yanked ? -0.04 : 0, boredom: -0.4 });
        this.why = e.yanked ? 'you pulled his limb off' : 'a limb came off';
        if (!(this.skill instanceof Reattach)) this.interrupt(c, new Reattach());
        return;
      }
      case 'limbOn':
        if (!(this.skill instanceof Reattach)) c.say(pick(['oh. thanks.', 'click.', 'better']), 1.2);
        return;
      case 'itemTaken': {
        m.nudge({ annoyance: 0.1, boredom: -0.2, trust: -0.01 });
        this.why = `you took his ${e.name}`;
        c.memory.count('itemsTaken');
        c.say(pick([`hey! my ${e.name}`, 'HEY', `that's my ${e.name}!`, 'rude.']), 1.6);
        this.takenAt = c.world.time;
        if (ch.mode === 'ground' && !(this.skill instanceof Reattach)) this.interrupt(c, new Sequence('hey', [{ face: 'cursor' }, { gesture: 'shrug' }]));
        return;
      }
      case 'itemDropped': {
        // You dropped his thing: he goes and gets it (unless he's in the middle of something that matters more).
        const it = c.items.list.find((x) => x.uid === e.uid);
        const busy = this.skill && !['idle', 'wander', 'sit', 'sulk', 'explore', 'sigh', 'askback', 'hey'].includes(this.skill.name);
        if (it && ch.useHand && !busy && ch.whole) {
          if (chance(0.5)) c.say(pick(['hey, careful', 'my ' + e.name + '!', 'I got it']), 1.2);
          this.interrupt(c, new FetchItem(it));
          this.why = `you dropped his ${e.name}`;
        }
        return;
      }
      case 'itemGiven':
        m.nudge({ happiness: 0.08, trust: 0.02, annoyance: -0.1 });
        c.say(pick(['thanks!', 'oh, thanks', 'mine again', ':)']), 1.3);
        return;
      case 'poked': return this.onPoke(c);

      case 'smacked': {
        // Much worse than a poke: it hurts, and it was on purpose.
        m.nudge({ annoyance: 0.28, fear: 0.08, trust: -0.03, happiness: -0.06, boredom: -0.4 });
        this.why = 'you smacked him';
        const wasAsleep = m.asleep;
        m.asleep = false;
        const remembers = !wasAsleep && chance(0.4) ? c.memory.recall('smacked') : null;
        c.say(remembers ?? (wasAsleep ? pick(['WHA-', '!?!']) : e.speed > 3000 ? pick(['OW!', 'HEY!!', 'OWW']) : pick(['ow!', 'hey!', '!!'])), 1.3);
        if (wasAsleep) ch.standUp();
        const L = m.label;
        this.interrupt(c, L === 'scared' || L === 'sad'
          ? new Sequence('flinch', [{ gesture: 'cower' }, { walkTo: 'away', run: L === 'scared' }])
          : L === 'angry'
            ? new Sequence('retaliate', [{ face: 'cursor' }, { say: pick(['YOU.', 'oh it is ON', 'stop that!']) }, { gesture: 'pokeBack', atCursor: true }, { gesture: 'stomp' }])
            : new Sequence('glare', [{ face: 'cursor' }, { wait: 0.6 }, { say: pick(['rude.', 'why', '>:(']) }]));
        return;
      }

      case 'petted':
        m.nudge({ happiness: 0.08, trust: 0.015, annoyance: -0.15, boredom: -0.2 });
        if (m.asleep) return;
        if (m.s.annoyance > 0.5) { c.say('hmph', 1.2); return; }
        // Lean into it, unless he's in the middle of something important.
        if ((ch.mode === 'ground' || ch.mode === 'sit') && !(this.skill instanceof Sequence && this.skill.name === 'enjoy')) {
          if (ch.mode === 'sit') ch.standUp();
          this.interrupt(c, new Sequence('enjoy', [{ gesture: 'nuzzle', atCursor: true }]));
          this.why = 'you\'re petting him';
        }
        if (chance(0.4)) c.say((chance(0.3) ? c.memory.recall('petted') : null) ?? pick([':)', '♪', 'hehe', 'mmm']), 1.2);
        return;

      case 'hangOn': return;
      case 'grabbed': {
        this.interrupt(c);
        m.asleep = false;
        m.nudge({ boredom: -0.3, fear: 0.08 * (1 - m.s.trust) });
        const L = m.label;
        if (L === 'angry') { c.say(pick(['put me down!', 'HEY', 'let go!'])); ch.doGesture('flail'); }
        else if (L === 'scared') { c.say(pick(['AAA', 'no no no', '!!'])); ch.doGesture('flail'); }
        else if (chance(0.5) && c.memory.recall('grabbed')) c.say(c.memory.recall('grabbed')!, 1.6);
        else if (L === 'playful') c.say(pick(['wheee', 'hi!', 'up!']));
        else if (L === 'sad' || L === 'sleepy') c.say('...');
        else c.say(pick(['?', '!', 'oh']), 1.2);
        return;
      }

      case 'released':
        if (e.speed > 900) {
          const fun = m.label === 'playful' && m.s.trust > 0.6;
          m.nudge(fun ? { happiness: 0.05, fear: 0.1 } : { fear: 0.25, annoyance: 0.12, trust: -0.02 });
          c.say(fun ? 'WHEEE' : pick(['AAAA', 'WAAA', 'aaah!']), 1.4);
        }
        return;

      case 'crashed':
        if (this.skill instanceof GetDown) {
          // Lesson learned: that jump was too big. Be warier of drops this high.
          const was = c.lessons.safeDrop;
          c.lessons.safeDrop = Math.max(120, Math.min(was, (this.skill.drop / ch.scale) * 0.8));
          m.nudge({ happiness: -0.05, fear: 0.1 });
          c.say(pick(['ow... too high', 'never again', 'OW. noted.']), 2);
          this.interrupt(c, this.afterFall(c));
          return;
        }
        m.nudge({ happiness: -0.08, fear: 0.12, annoyance: 0.08, trust: -0.01 });
        c.say(e.speed > 1600 ? 'OW' : pick(['ow.', 'oof', 'ouch']), 1.4);
        this.interrupt(c, this.afterFall(c));
        this.why = 'recovering from a fall';
        return;

      case 'tripped':
        m.nudge({ happiness: -0.03, annoyance: 0.05 });
        c.say('!', 0.8);
        this.interrupt(c, this.afterFall(c));
        return;

      case 'fellOff':
        if (!(this.skill instanceof GetDown) && c.world.time > this.quipAt) {
          this.quipAt = c.world.time + 3;
          c.say(pick(['whoa!', 'woah', '!!']), 1);
        }
        return;

      case 'carried':
        if (e.speed > 12 * ch.scale && c.world.time > this.quipAt && chance(0.3)) {
          this.quipAt = c.world.time + 6;
          c.say(pick(['whoa', 'wheee', 'hey, steady!']), 1.2);
        }
        return;

      case 'bonked':
        if (m.label === 'playful') { c.say(pick(['hey!', 'haha', 'ow, nice shot']), 1.2); m.nudge({ boredom: -0.2 }); }
        else { c.say(pick(['OW', 'who threw that', 'ow!']), 1.2); m.nudge({ annoyance: 0.08, boredom: -0.2 }); }
        return;
      case 'rolled':
        if (chance(0.3)) c.say(pick(['parkour!', 'nailed it', 'tuck and roll']), 1.2);
        return;
      case 'flipped':
        if (chance(0.5)) c.say(pick(['ta-da!', 'stuck it', '10/10']), 1.2);
        return;
      case 'vaulted':
        if (chance(0.3)) c.say(pick(['hup!', 'parkour', 'easy']), 1);
        return;
      case 'landed':
        if (this.skill instanceof GetDown && e.speed > 600) {
          // Landed a big drop fine: a little braver next time.
          c.lessons.safeDrop = Math.min(600, Math.max(c.lessons.safeDrop, (this.skill.drop / ch.scale) * 1.05));
        }
        if (e.speed > 500 && m.label === 'playful') c.say(pick(['!', 'ta-da', 'again!']), 1.2);
        return;

      case 'hitWall':
        if (chance(0.3)) c.say(pick(['oof', 'wall.']), 1);
        return;

      case 'hitCursor': {
        m.nudge({ annoyance: -0.06, happiness: 0.03, boredom: -0.1 });
        if (this.skill instanceof Brawl) this.skill.landed();
        if (c.world.time > this.quipAt && chance(e.power > 0.6 ? 0.6 : 0.3)) {
          this.quipAt = c.world.time + 2.5;
          c.say(e.power > 0.8 ? pick(['HOME RUN', 'BOOM', 'POW!', 'and STAY out']) : pick(['ha!', 'pow', 'bap', 'hyah']), 1);
        }
        return;
      }
      case 'cursorFreed':
        if (c.world.time > this.quipAt && chance(0.35)) { this.quipAt = c.world.time + 3; c.say(pick(['aw', 'hey, I was playing with that', 'fine']), 1.2); }
        return;
      case 'parried':
        m.nudge({ annoyance: -0.04, happiness: 0.05, boredom: -0.2 });
        this.why = 'blocked your smack';
        c.say(pick(['BLOCKED', 'nice try', 'parry!', 'too slow']), 1.2);
        return;
      case 'windowStuck':
        this.why = "your windows won't move for him (needs permission?)";
        c.say(pick(["huh. it won't move", 'stuck?', '...heavy']), 1.6);
        return;
    }
  }

  private onPoke(c: Ctx) {
    const m = c.mood, ch = c.char, now = c.world.time;
    this.pokes = this.pokes.filter((t) => now - t < 6);
    const recent = this.pokes.length;
    this.pokes.push(now);
    m.nudge({ annoyance: 0.1 + 0.07 * recent, boredom: -0.3, trust: -0.004 });
    this.why = recent > 1 ? 'you keep poking him' : `you poked him (he was ${m.label})`;

    if (m.asleep) {
      if (chance(0.35 + 0.2 * recent)) {
        this.interrupt(c, new Sequence('woken', [
          { wait: 1.3 }, { face: 'cursor' }, { say: pick(['!?', 'hey...', 'what.', "I was sleeping"]) }, { gesture: 'shrug' },
        ]));
        m.asleep = false;
        m.nudge({ annoyance: 0.15 });
        ch.standUp();
      } else c.say('z', 1);
      return;
    }

    const free = ch.mode === 'ground' || ch.mode === 'sit';
    const L = m.label;
    if (!free) { c.say(L === 'angry' ? '!!' : '!', 0.8); return; }

    let react: Sequence | Skill | null = null;
    const remembers = chance(0.15) ? c.memory.recall('poked') : null;
    if (remembers) { c.say(remembers, 1.6); return; }
    switch (L) {
      case 'sad':
        // He just doesn't have it in him.
        if (chance(0.75)) c.say('...', 1.5);
        else c.say(pick(['leave me alone', 'not now']), 2);
        return;
      case 'sleepy':
        c.say(pick(['mm', '...', 'tired']), 1.2);
        return;
      case 'angry':
        react = chance(0.6)
          ? new Sequence('retaliate', [{ face: 'cursor' }, { say: pick(['HEY!', 'stop it!', 'quit it', '!!']) }, { gesture: chance(0.5) ? 'stomp' : 'pokeBack', atCursor: true }])
          : new ChaseCursor(3.5, true);
        break;
      case 'scared':
        react = new Sequence('flinch', [{ gesture: 'cower' }, { say: '!' }, { walkTo: 'away', run: true }]);
        break;
      case 'playful':
        m.nudge({ happiness: 0.04, annoyance: -0.05 });
        react = pick([
          () => new Sequence('giggle', [{ say: pick(['hehe', 'haha', 'hey!']) }, { gesture: 'laugh' }]),
          () => new Sequence('tag', [{ face: 'cursor' }, { gesture: 'pokeBack', atCursor: true }, { say: 'tag!' }]),
          () => new Sequence('boing', [{ say: '!' }, { jump: 450 }]),
          () => new ChaseCursor(4, false),
        ])();
        break;
      default: { // content / bored
        const annoyed = m.s.annoyance > 0.35;
        react = pick([
          () => new Sequence('huh', [{ face: 'cursor' }, { say: annoyed ? 'hey.' : '?' }]),
          () => new Sequence('poke-back', [{ face: 'cursor' }, { gesture: 'pokeBack', atCursor: true }, { say: annoyed ? 'stop.' : 'hi' }]),
          () => new Sequence('shrug', [{ face: 'cursor' }, { gesture: 'shrug' }]),
          ...(m.label === 'bored' ? [() => new ChaseCursor(4, false)] : []),
        ])();
      }
    }
    if (ch.mode === 'sit' && L !== 'angry' && chance(0.6)) { c.say('?', 1); return; } // can't be bothered to get up
    if (ch.mode === 'sit') ch.standUp();
    this.interrupt(c, react ?? undefined);
  }

  /** What he does once he's back on his feet after falling. */
  private afterFall(c: Ctx): Skill | undefined {
    switch (c.mood.label) {
      case 'angry': return new Sequence('glare', [{ face: 'cursor' }, { say: pick(['>:(', 'really?', 'rude.']) }, { gesture: 'stomp' }]);
      case 'scared': return new AvoidCursor(3);
      case 'playful': return new Sequence('again', [{ say: 'again!' }, { jump: 420 }]);
      case 'sad': return new Sequence('mope', [{ say: '...' }, { sit: rand(4, 8) }]);
      default: return chance(0.5) ? new Sequence('shake-off', [{ gesture: 'shrug' }, { say: pick(['...okay', 'fine', 'whoa']) }]) : undefined;
    }
  }
}
