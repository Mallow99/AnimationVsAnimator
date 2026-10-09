// Things the two of them do together: a handshake, a high five, a fist bump, patty cake, a hug; napping
// side by side like puppies; and, when one's in a mood, a shoulder bump on purpose.
//
// How it works between them (all through peer.ts messages, so it'll work between separate apps too):
// one asks (`invite`), the other decides (his mood, how he feels about him, whether he's busy) and answers
// (`reply`). If it's a yes, both run `Together`: they walk to meet in the middle, each faces the other,
// and when both are in place (each can see the other's `social.phase` in his snapshot) the one who asked
// says `go`. From then on both count the beats from that moment, so their hands meet at the same time.
// Their hands go where the other one's actually are (from his snapshot), so it lines up even if one of
// them is a bit off.
import { Skill, arrive, type Ctx } from './context';
import { disagreement } from '../relationships';
import type { FighterView } from '../peer';
import { chance, clamp, lerp, pick, smooth } from '../math';
import type { Vec } from '../math';

export type Act = 'handshake' | 'highfive' | 'fistbump' | 'pattycake' | 'hug' | 'chat';
export const ACTS: readonly Act[] = ['handshake', 'highfive', 'fistbump', 'pattycake', 'hug', 'chat'];
export const isAct = (s: string): s is Act => (ACTS as readonly string[]).includes(s);

/** How long each takes once they start (s), and how far apart they stand for it (px at scale 1, hip to hip). */
const DUR: Record<Act, number> = { handshake: 2.6, highfive: 1.4, fistbump: 1.7, pattycake: 6.3, hug: 2.9, chat: 4.2 };
const GAP: Record<Act, number> = { handshake: 30, highfive: 27, fistbump: 32, pattycake: 25, hug: 13, chat: 38 };
/** What the one asking says. */
const ASK: Record<Act, string[]> = {
  handshake: ['shake on it?', 'truce?', 'friends?'], highfive: ['high five!', 'up top!', 'gimme five'],
  fistbump: ['fist bump!', 'bump it', 'pound it'], pattycake: ['patty cake?', 'pat-a-cake!'], hug: ['c\'mere', 'hug?', 'bring it in'],
  chat: ['hey', 'yo', 'psst', 'hey you'],
};
/** Small talk: what the one who came over says, and what the other answers. */
export const TALK: [string, string[]][] = [
  ['nice day', ['is it?', 'sure', 'every day is a day']], ['I\'m bored', ['same', 'wanna fight?', 'go draw something']],
  ['seen my pen?', ['nope', 'it\'s in your satchel', 'what pen']], ['what\'s the cursor doing', ['moving', 'plotting', 'no idea']],
  ['you hungry?', ['we don\'t eat', 'always', '...for what']], ['nice sword', ['thanks', 'it\'s foam', 'want it?']],
  ['I can do a backflip', ['prove it', 'me too', 'sure you can']], ['tag, you\'re it', ['no', 'not now', 'ugh fine']],
];
/** How much each does for how they feel about each other. */
const WARMTH: Record<Act, number> = { handshake: 0.06, highfive: 0.05, fistbump: 0.05, pattycake: 0.08, hug: 0.1, chat: 0.02 };

/** Patty cake: what each beat is (clap your own hands, both hands to his, right to right, left to left). */
const PATTY: ('own' | 'both' | 'right' | 'left')[] = ['own', 'both', 'own', 'right', 'own', 'left', 'own', 'both', 'own', 'both', 'own', 'right', 'own', 'left', 'both'];
const BEAT = 0.42;

/** Asking: say it (a hand already up for a high five), and wait for the answer (the mind hands it over). */
export class AskTogether extends Skill {
  readonly name = 'ask';
  constructor(readonly act: Act, readonly why = '') { super(); }
  start(c: Ctx) {
    c.look = 'target';
    c.say(pick(ASK[this.act]), 1.6);
    c.tell?.({ type: 'invite', act: this.act });
  }
  update(c: Ctx) {
    const f = c.foe?.(), ch = c.char;
    if (!f) return true;
    if (f.joints.neck) c.lookTarget = f.joints.neck;
    ch.facing = (Math.sign(f.x - ch.x) || ch.facing) as 1 | -1;
    // A high five: the hand's already up while he waits.
    if (this.act === 'highfive' && ch.mode === 'ground') {
      const n = ch.body.j.neck, k = ch.facing > 0 ? 'R' : 'L';
      ch.handsAt = { [k]: { x: n.x + ch.facing * 6 * ch.scale, y: n.y - 24 * ch.scale } };
    }
    if (this.t > 4) { c.say(pick(['...ok then', 'nevermind', 'fine.']), 1.4); c.mood.nudge({ happiness: -0.03 }); return true; }
    return false;
  }
  stop(c: Ctx) { c.char.handsAt = null; }
}

export class Together extends Skill {
  readonly name = 'together';
  phase: 'meet' | 'ready' | 'do' = 'meet';
  private t0 = 0;
  private beats = new Set<number>();
  private done = false;
  private said = false;
  /** Small talk: the line and the possible answers (both work it out the same way: the asker's pick is sent along). */
  private talk: [string, string[]] | null = null;
  constructor(readonly act: Act, readonly lead: boolean, readonly why = '') { super(); }

  /** Both in place: start counting the beats now (small talk: on this topic). */
  go(topic?: number) {
    if (this.phase === 'do') return;
    this.phase = 'do'; this.t0 = this.t;
    if (topic !== undefined && TALK[topic]) this.talk = TALK[topic];
  }

  start(c: Ctx) { c.look = 'target'; }

  update(c: Ctx, dt: number) {
    const f = c.foe?.(), ch = c.char, sc = ch.scale;
    // He wandered off, got knocked over, started something else: never mind. (Unless it's all but done:
    // whoever finishes a moment later still counts it.)
    if (!f || (f.social?.act !== this.act && this.t > 2.5) || ch.mode !== 'ground' && ch.mode !== 'air') {
      if (this.phase === 'do' && this.t - this.t0 > DUR[this.act] - 0.4) this.finish(c);
      return true;
    }
    if (f.joints.neck) c.lookTarget = f.joints.neck;
    const dir = (Math.sign(f.x - ch.x) || ch.facing) as 1 | -1, gap = GAP[this.act] * sc;
    if (this.phase !== 'do') {
      if (this.t > 12) { c.say(pick(['...', 'nevermind']), 1.2); return true; }
      if (ch.mode !== 'ground') return false;
      // Meet in the middle (each works it out from where they both are), facing each other.
      const spot = (ch.x + f.x) / 2 - dir * gap / 2;
      const off = Math.abs(f.x - ch.x) - gap;
      // (Each one stops within a few px of his spot, so "in place" allows for both being a little off.)
      if (this.phase === 'meet') {
        if (Math.abs(off) > 12 * sc && !(this.t > 4 && Math.abs(off) < 40 * sc)) { // (after a while, near enough will do)
          if (ch.ready && !ch.walking && Math.abs(ch.x - spot) > 3 * sc) ch.walkTo(clamp(spot, c.world.bounds.left + 30, c.world.bounds.right - 30));
          return false;
        }
        ch.stop(); this.phase = 'ready';
      }
      ch.faceLock = dir; ch.facing = dir;
      if (Math.abs(off) > (this.t > 4 ? 46 : 22) * sc) { this.phase = 'meet'; return false; }
      // The one who asked says when.
      if (this.lead && f.social?.phase !== 'meet' && f.social?.act === this.act) {
        const topic = Math.floor(Math.random() * TALK.length);
        c.tell?.({ type: 'go', act: this.act, topic }); this.go(topic);
      }
      if (this.act === 'hug') ch.stepAside(0, 0.2);
      return false;
    }
    ch.stop(); ch.faceLock = dir;
    const u = this.t - this.t0;
    this.pose(c, u, f, dir);
    if (u > DUR[this.act]) { this.finish(c); return true; }
    void dt;
    return false;
  }

  private finish(c: Ctx) {
    if (this.done) return;
    this.done = true;
    c.feel.bond = clamp(c.feel.bond + WARMTH[this.act], -1, 1);
    c.mood.nudge({ happiness: 0.06, boredom: -0.15, annoyance: -0.08 });
  }

  /** Where his hands go, `u` seconds in. */
  private pose(c: Ctx, u: number, f: FighterView, dir: 1 | -1) {
    const ch = c.char, sc = ch.scale, n = ch.body.j.neck, fn = f.joints.neck ?? n, fh = f.joints.hip ?? ch.body.j.hip;
    const front: 'L' | 'R' = dir > 0 ? 'R' : 'L', back: 'L' | 'R' = front === 'R' ? 'L' : 'R';
    const mid = { x: (n.x + fn.x) / 2, y: (n.y + fn.y) / 2 };
    const at = (k: 'L' | 'R', p: Vec) => { ch.handsAt = { ...(ch.handsAt ?? {}), [k]: p }; };
    const toward = (from: Vec, to: Vec, k: number) => ({ x: lerp(from.x, to.x, smooth(k)), y: lerp(from.y, to.y, smooth(k)) });
    const rest = { x: n.x + dir * 4 * sc, y: n.y + 22 * sc };
    const once = (id: number, fn2: () => void) => { if (!this.beats.has(id)) { this.beats.add(id); fn2(); } };
    ch.handsAt = null;
    switch (this.act) {
      case 'handshake': {
        const grip = { x: mid.x, y: mid.y + 13 * sc + (u > 0.5 && u < 2 ? Math.sin((u - 0.5) * Math.PI * 4.4) * 3 * sc : 0) };
        if (u < 2.2) at(front, toward(rest, grip, u / 0.5));
        if (u > 0.5) once(1, () => { c.sound?.('pickup', 0.3); if (this.lead) c.say(pick(['deal.', 'nice.', 'good game', 'friends']), 1.4); });
        break;
      }
      case 'highfive': {
        const up = { x: n.x + dir * 5 * sc, y: n.y - 25 * sc }, slap = { x: mid.x, y: mid.y - 22 * sc };
        if (u < 0.32) at(front, toward(rest, up, u / 0.32));
        else if (u < 0.42) at(front, toward(up, slap, (u - 0.32) / 0.1));
        else if (u < 0.75) at(front, toward(slap, { x: n.x + dir * 8 * sc, y: n.y - 14 * sc }, (u - 0.42) / 0.33));
        if (u > 0.42) once(1, () => { if (this.lead) { c.sound?.('clap', 1); c.burst?.(slap.x, slap.y, 10); c.say(pick(['YEAH', 'nice!', 'ayy']), 1.2); } });
        break;
      }
      case 'fistbump': {
        const bump = { x: mid.x, y: mid.y + 6 * sc };
        if (u < 0.38) at(front, toward(rest, bump, u / 0.38));
        else if (u < 1.2) {
          // ...and blow it up: the hand flies back and up, open.
          const k = (u - 0.38) / 0.5;
          at(front, toward(bump, { x: n.x - dir * 2 * sc, y: n.y - 16 * sc + Math.sin(k * 7) * 2 * sc }, k));
        }
        if (u > 0.38) once(1, () => { if (this.lead) { c.sound?.('clap', 0.5); c.say(pick(['pshhh', 'boom', 'ka-pow']), 1.2); } });
        break;
      }
      case 'pattycake': {
        const i = Math.floor(u / BEAT), k = clamp((u - i * BEAT) / (BEAT * 0.5), 0, 1);
        const what = PATTY[i];
        if (!what) break;
        const own = { x: n.x + dir * 9 * sc, y: n.y + 9 * sc };
        const theirs = (dy: number, dz: number) => ({ x: mid.x, y: mid.y + (8 + dy) * sc + dz });
        if (what === 'own') { at('L', toward(rest, own, k)); at('R', toward(rest, own, k)); }
        else if (what === 'both') { at('L', toward(own, theirs(-2, 0), k)); at('R', toward(own, theirs(2, 0), k)); }
        else if (what === 'right') { at('R', toward(own, theirs(0, 0), k)); at('L', own); }
        else { at('L', toward(own, theirs(0, 0), k)); at('R', own); }
        if (k >= 1) once(i, () => { if (this.lead || what === 'own') c.sound?.('clap', what === 'own' ? 0.4 : 0.8); });
        if (i === 0) once(100, () => { if (this.lead) c.say('pat-a-cake, pat-a-cake', 2.2); });
        if (i === 8) once(101, () => { if (!this.lead) c.say('baker\'s man!', 1.6); });
        break;
      }
      case 'chat': {
        // A line each (a little gesture with it).
        const [line, answers] = this.talk ??= TALK[0];
        if (u > 0.2) once(1, () => { if (this.lead) { c.say(line, 1.8); ch.doGesture('shrug'); } });
        if (u > 2) once(2, () => { if (!this.lead) { c.say(pick(answers), 1.8); if (chance(0.4)) ch.doGesture('laugh'); } });
        break;
      }
      case 'hug': {
        // Arms round his back: one high, one low, leaning in.
        const k = Math.min(1, u / 0.5), out = u > DUR.hug - 0.5 ? (DUR.hug - u) / 0.5 : 1;
        const high = { x: fn.x + dir * 6 * sc, y: fn.y + 8 * sc }, low = { x: fh.x + dir * 6 * sc, y: fh.y - 9 * sc };
        at(front, toward(rest, high, k * out)); at(back, toward(rest, low, k * out));
        ch.handsAt = { ...(ch.handsAt ?? {}), lean: 3 * k * out };
        if (u > 0.6) once(1, () => { c.hearts?.(mid.x, mid.y - 10 * sc); if (!this.lead && !this.said) { this.said = true; c.say(pick(['aww', '♥', 'ok ok']), 1.4); } });
        break;
      }
    }
  }

  stop(c: Ctx) {
    const id=c.foe?.()?.id;if(id)c.recordActivity?.(id,this.act,this.done);
    c.char.handsAt = null; c.char.faceLock = null;
    if (!this.done) { this.done = true; c.tell?.({ type: 'cancel' }); }
  }
}

/**
 * In a mood: walk right through him, shoulder first. Not a fight, just rude (it might start one).
 */
export class ShoulderBump extends Skill {
  readonly name = 'bump';
  private bumped = false;
  private target = 0;
  constructor(readonly why = '') { super(); }
  start(c: Ctx) {
    c.look = 'target';
    const f = c.foe?.();
    if (f) this.target = f.x + Math.sign(f.x - c.char.x) * 45 * c.char.scale;
  }
  update(c: Ctx) {
    const f = c.foe?.(), ch = c.char, sc = ch.scale;
    if (!f || this.t > 9) return true;
    if (f.joints.neck) c.lookTarget = f.joints.neck;
    if (!this.bumped) {
      // Right at him (no stepping aside).
      if (ch.ready && (!ch.walking || this.t < 0.1)) ch.walkTo(clamp(this.target, c.world.bounds.left + 30, c.world.bounds.right - 30));
      const fh = f.joints.hip, hip = ch.body.j.hip;
      if (fh && Math.abs(fh.x - hip.x) < 11 * sc && Math.abs(fh.y - hip.y) < 30 * sc) {
        this.bumped = true;
        const dir = Math.sign(f.x - ch.x) || ch.facing;
        c.tell?.({ type: 'bump', vx: dir * 300 });
        const r=f.id?c.relationship?.(f.id):null;if(r)disagreement(r,'bump');
        c.sound?.('thud', 0.6);
        c.say(pick(['move.', '*bump*', 'outta my way', 'oops. not sorry']), 1.4);
        c.feel.bond = clamp(c.feel.bond - 0.04, -1, 1);
      }
      return false;
    }
    return !ch.walking || this.t > 6;
  }
  stop(c: Ctx) { c.char.stop(); }
}

/** He's asleep, and he's sleepy too: curl up right next to him, like puppies. */
export class NapTogether extends Skill {
  readonly name = 'nap';
  private phase: 'go' | 'sleep' = 'go';
  private z = 2;
  constructor(readonly why = '') { super(); }
  update(c: Ctx) {
    const f = c.foe?.(), ch = c.char, sc = ch.scale, b = c.world.bounds;
    if (this.phase === 'go') {
      if (!f || !f.asleep || this.t > 14) return true;
      // Beside him on whichever side has room.
      const side = f.x - b.left > 80 * sc && (ch.x < f.x || b.right - f.x < 80 * sc) ? -1 : 1;
      if (!arrive(c, f.x + side * 20 * sc, 4)) return false;
      ch.facing = (Math.sign(f.x - ch.x) || 1) as 1 | -1;
      ch.lieDown(); c.mood.asleep = true; c.look = 'down';
      this.phase = 'sleep';
      if (chance(0.5)) c.say('*yawn*', 1.4);
      return false;
    }
    if (this.t > this.z) { this.z = this.t + 3 + Math.random() * 2; c.say('z', 1.4); }
    c.mood.nudge({ happiness: 0.0005 });
    // Up when he's slept enough, or a little while after the other one gets up.
    if (c.mood.s.energy > 0.95 || (f && !f.asleep && chance(0.004))) { ch.standUp(); c.feel.bond = clamp(c.feel.bond + 0.05, -1, 1); return true; }
    return false;
  }
  stop(c: Ctx) { c.mood.asleep = false; }
}

/**
 * Calling out to him from wherever he is (up on a window, across the screen, on the couch): a wave and a
 * "hey!", maybe a bit of small talk; he waves back and answers (Pet handles the `talk` message).
 */
export class WaveAt extends Skill {
  readonly name = 'waveat';
  private said = false;
  constructor(readonly why = '') { super(); }
  start(c: Ctx) { c.look = 'target'; }
  update(c: Ctx) {
    const f = c.foe?.(), ch = c.char;
    if (!f) return true;
    if (f.joints.neck) c.lookTarget = f.joints.neck;
    if (ch.ready && !this.said) {
      ch.facing = (Math.sign(f.x - ch.x) || ch.facing) as 1 | -1;
      ch.doGesture('wave');
      this.said = true;
      const topic = chance(0.6) ? Math.floor(Math.random() * TALK.length) : -1;
      c.say(topic >= 0 ? `hey ${f.name}! ${TALK[topic][0]}` : pick([`hey ${f.name}!`, `${f.name}!`, 'yoo-hoo']), 2);
      c.tell?.({ type: 'talk', topic });
    }
    return this.said && ch.ready && this.t > 1;
  }
}

/** Sitting next to him: a line of small talk every so often (he answers). Returns true when he spoke. */
export function seatedTalk(c: Ctx, t: number, next: { at: number }) {
  if (t < next.at) return false;
  next.at = t + 12 + Math.random() * 14;
  if (!chance(0.6)) return false;
  const topic = Math.floor(Math.random() * TALK.length);
  c.say(TALK[topic][0], 1.8);
  c.tell?.({ type: 'talk', topic });
  return true;
}
