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

import type { CharEvent } from './character';
import { chance, pick, rand, sign } from './math';
import {
  AvoidCursor, ChaseCursor, Idle, presets, Sequence, SitFor, Skill, Sleep, Wander, type Ctx,
} from './skills';

export type MindEvent = CharEvent | { type: 'poked' } | { type: 'petted' } | { type: 'smacked'; speed: number };

interface Option { name: string; score: number; make: () => Skill }

export class Mind {
  skill: Skill | null = null;
  private last = '';
  private queued: Skill | null = null;
  private pokes: number[] = [];
  private lookAt: { x: number; y: number } | null = null;
  private lookUntil = 0;
  private history: string[] = [];

  /** Recent skill names, newest last (for debugging and, later, the LLM). */
  get recent() { return this.history; }

  update(c: Ctx, dt: number) {
    c.mood.tick(dt);
    c.char.posture = c.mood.posture();

    if (this.skill) {
      this.skill.t += dt;
      if (this.skill.update(c, dt)) this.end(c);
    } else if (c.char.ready || (c.char.mode === 'sit' && this.queued)) {
      this.begin(c, this.queued ?? this.choose(c));
      this.queued = null;
    }
    this.updateLook(c);
  }

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

  private choose(c: Ctx): Skill {
    const s = c.mood.s, L = c.mood.label, w = c.world, ch = c.char;
    const cur = w.cursor;
    const cursorActive = !!cur && w.time - w.cursorMovedAt < 6;
    const near = cursorActive && Math.abs(cur!.x - ch.x) < 250;
    const opts: Option[] = [
      { name: 'idle', score: 1, make: () => new Idle(rand(3, 8)) },
      { name: 'wander', score: 0.6 + s.boredom + s.energy * 0.3, make: () => new Wander() },
      { name: 'sit', score: 0.2 + (1 - s.energy) * 0.8, make: () => new SitFor(rand(6, 18)) },
      { name: 'sleep', score: s.energy < 0.25 && s.annoyance < 0.5 && s.fear < 0.3 ? 2 + (0.25 - s.energy) * 8 : 0, make: () => new Sleep() },
      { name: 'chase', score: cursorActive && L === 'playful' ? 1.2 * s.trust + s.boredom : 0, make: () => new ChaseCursor(rand(4, 8), false) },
      { name: 'hunt', score: cursorActive && L === 'angry' ? 1.5 : 0, make: () => new ChaseCursor(4, true) },
      { name: 'avoid', score: near && (L === 'scared' || s.trust < 0.3) ? 2 : 0, make: () => new AvoidCursor(4) },
      { name: 'dance', score: L === 'playful' ? 0.8 : 0, make: presets.dance },
      { name: 'hop', score: 0.15 + s.energy * 0.3 + (L === 'playful' ? 0.4 : 0), make: () => presets.hop(s.energy) },
      { name: 'sulk', score: L === 'sad' ? 1.5 : 0, make: () => new SitFor(rand(8, 20), true) },
      { name: 'tantrum', score: L === 'angry' ? 1 : 0, make: presets.tantrum },
      { name: 'explore', score: L === 'bored' ? 1.2 : 0.15, make: presets.explore },
      { name: 'stretch', score: 0.1 + (1 - s.energy) * 0.4, make: presets.stretch },
      { name: 'sigh', score: L === 'bored' ? 0.6 : 0, make: presets.sigh },
    ];
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
      if (r <= 0) return opts[i].make();
    }
    return opts[0].make();
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
    // Default: watch the cursor while it's moving nearby (unless he's down in the dumps),
    // otherwise glance around now and then.
    const watching = cur && w.time - w.cursorMovedAt < 2.5 && Math.abs(cur.x - ch.x) < 600 && c.mood.label !== 'sad';
    if (watching) { ch.look = cur; return; }
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
        c.say(m.s.annoyance > 0.5 ? 'hmph' : pick(['♥', '♥', ':)', '♪']), 1.5);
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
        m.nudge({ happiness: -0.08, fear: 0.12, annoyance: 0.08, trust: -0.01 });
        c.say(e.speed > 1600 ? 'OW' : pick(['ow.', 'oof', 'ouch']), 1.4);
        this.interrupt(c, this.afterFall(c));
        return;

      case 'tripped':
        m.nudge({ happiness: -0.03, annoyance: 0.05 });
        c.say('!', 0.8);
        this.interrupt(c, this.afterFall(c));
        return;

      case 'landed':
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
