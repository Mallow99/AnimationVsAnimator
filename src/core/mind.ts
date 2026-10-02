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

import type { CharEvent, Gesture } from './character';
import type { MoodState } from './mood';
import { chance, pick, rand, sign } from './math';
import {
  AvoidCursor, ChaseCursor, ClimbOnto, climbDownOption, DoodleSkill, dropFrom, GetDown, GrabCursor, MonkeyBars, Idle, presets, reachableAbove, Sequence, SitFor, Skill, Sleep, Wander, type Ctx,
} from './skills';

export type MindEvent = CharEvent | { type: 'poked' } | { type: 'petted' } | { type: 'smacked'; speed: number };

interface Option { name: string; score: number; why: string; make: () => Skill }

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
  /** Why he's doing what he's doing (shown in settings). */
  why = '';
  /** While the AI brain is deciding what he does next, instinct waits until this time. */
  holdUntil = 0;

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
      if (m.s.trust > 0.35 && ch.ready) { this.interrupt(c, new Sequence('greet', [{ face: 'cursor' }, { say: pick(['oh hi!', 'hey!', "you're back"]) }, { gesture: 'wave' }])); this.why = 'you came back'; }
    }
    this.lastCursorSeen = w.cursorMovedAt;
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
    if (name === 'grabcursor' && !c.canGrabCursor) { if (!quiet) c.say('(mischief mode is off)', 2); return false; }
    const gestures: Gesture[] = ['wave', 'laugh', 'shrug', 'stomp', 'stretch', 'cower'];
    if ((gestures as string[]).includes(name)) {
      this.interrupt(c, new Sequence(name, [{ gesture: name as Gesture, atCursor: true }]));
    } else {
      const o = this.options(c).find((x) => x.name === name);
      if (!o) { if (!quiet) c.say('?', 1); return false; }
      this.interrupt(c, o.make());
    }
    m.asleep = false;
    this.why = why;
    if (ch.mode === 'lie' || ch.mode === 'sit') ch.standUp();
    return true;
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

  /** Drop whatever he's doing and (optionally) do this next. */
  private interrupt(c: Ctx, next?: Skill) {
    this.end(c);
    this.queued = next ?? null;
  }

  // ───────────── choosing what to do ─────────────

  private choose(c: Ctx): Option {
    const opts = this.options(c);
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
    const cur = w.cursor;
    const cursorActive = !!cur && w.time - w.cursorMovedAt < 6;
    const near = cursorActive && Math.abs(cur!.x - ch.x) < 250;
    const opts: Option[] = [
      { name: 'idle', score: 1.3, why: 'taking it easy', make: () => new Idle(rand(4, 10)) },
      { name: 'wander', score: 0.5 + s.boredom + s.energy * 0.3, why: s.boredom > 0.5 ? 'bored' : 'stretching his legs', make: () => new Wander() },
      { name: 'sit', score: 0.3 + (1 - s.energy) * 0.9, why: s.energy < 0.4 ? 'tired' : 'resting', make: () => new SitFor(rand(8, 20)) },
      { name: 'sleep', score: s.energy < 0.25 && s.annoyance < 0.5 && s.fear < 0.3 ? 2 + (0.25 - s.energy) * 8 : 0, why: 'worn out', make: () => new Sleep() },
      { name: 'chase', score: cursorActive && L === 'playful' ? 1.2 * s.trust + s.boredom : 0, why: 'wants to play with you', make: () => new ChaseCursor(rand(4, 8), false) },
      { name: 'hunt', score: cursorActive && L === 'angry' ? 1.5 : 0, why: "mad at you", make: () => new ChaseCursor(4, true) },
      { name: 'avoid', score: near && (L === 'scared' || s.trust < 0.3) ? 2 : 0, why: s.fear > 0.3 ? 'scared of you' : "doesn't trust you", make: () => new AvoidCursor(4) },
      { name: 'dance', score: L === 'playful' ? 0.7 : 0, why: 'in a great mood', make: presets.dance },
      { name: 'hop', score: 0.05 + s.energy * 0.15 + (L === 'playful' ? 0.35 : 0), why: 'full of energy', make: () => presets.hop(s.energy) },
      { name: 'sulk', score: L === 'sad' ? 1.5 : 0, why: 'feeling down', make: () => new SitFor(rand(10, 22), true) },
      { name: 'tantrum', score: L === 'angry' ? 1 : 0, why: 'angry', make: presets.tantrum },
      { name: 'explore', score: L === 'bored' ? 1.2 : 0.15, why: 'curious', make: presets.explore },
      { name: 'stretch', score: 0.08 + (1 - s.energy) * 0.3, why: 'stiff', make: presets.stretch },
      { name: 'sigh', score: L === 'bored' ? 0.6 : 0, why: 'bored', make: presets.sigh },
      ...this.windowOptions(c),
      { name: 'doodle', score: c.world.time - this.lastDoodle > 90 && L !== 'sad' && L !== 'sleepy' ? 0.08 + s.boredom * 0.35 + (L === 'playful' ? 0.15 : 0) : 0,
        why: 'feeling creative', make: () => { this.lastDoodle = c.world.time; return new DoodleSkill(); } },
      { name: 'grabcursor', score: c.canGrabCursor && cursorActive && near && c.world.time - this.lastGrab > 60 && (L === 'playful' || L === 'bored' || L === 'angry') ? 0.7 : 0,
        why: L === 'angry' ? 'getting back at you' : 'feeling mischievous', make: () => { this.lastGrab = c.world.time; return new GrabCursor(); } },
    ];
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
      case 'poked': return this.onPoke(c);

      case 'smacked': {
        // Much worse than a poke: it hurts, and it was on purpose.
        m.nudge({ annoyance: 0.28, fear: 0.08, trust: -0.03, happiness: -0.06, boredom: -0.4 });
        this.why = 'you smacked him';
        const wasAsleep = m.asleep;
        m.asleep = false;
        c.say(wasAsleep ? pick(['WHA-', '!?!']) : e.speed > 3000 ? pick(['OW!', 'HEY!!', 'OWW']) : pick(['ow!', 'hey!', '!!']), 1.3);
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
        if (chance(0.4)) c.say(pick([':)', '♪', 'hehe', 'mmm']), 1.2);
        return;

      case 'grabbed': {
        this.interrupt(c);
        m.asleep = false;
        m.nudge({ boredom: -0.3, fear: 0.08 * (1 - m.s.trust) });
        const L = m.label;
        if (L === 'angry') { c.say(pick(['put me down!', 'HEY', 'let go!'])); ch.doGesture('flail'); }
        else if (L === 'scared') { c.say(pick(['AAA', 'no no no', '!!'])); ch.doGesture('flail'); }
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
