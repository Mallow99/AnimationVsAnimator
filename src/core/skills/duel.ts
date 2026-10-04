// Fighting his friend, with a little fighting-game "CPU" in his head so it's worth watching even offline.
//
// Every so often (his reaction time) he reads the fight: how far apart they are, whether the other one
// is winding up an attack, stunned, in the air or on the floor, and how tired he is. Then he picks:
//  - defense: block (fists up) or hop back when he sees an attack coming, jump over a sweep;
//  - footsies: step in and out at the edge of kicking range, waiting for an opening;
//  - offense: the right move for the distance (jab or cross up close, front kick or roundhouse a step
//    out, a dash-in jump punch from further), combos when the other one is stunned (jab, jab, cross,
//    finish with an uppercut or a front kick), a sweep for someone who keeps blocking, juggles when
//    they're in the air, and pressure when they're getting up;
//  - with a sword: slashes from sword range, the sword up to block.
// Hits knock back for real (see Pet.takeHit), so it moves: they skid, get launched, go down, get up.
// A fight ends at three knockdowns (or a time limit, or a limb coming off in a real fight).
import { Skill, type Ctx } from './context';
import type { Gesture } from '../character';
import type { Item } from '../items';
import { SwordSwing } from '../skills';
import { chance, pick, rand } from '../math';

const COMBOS: Gesture[][] = [
  ['jab', 'jab', 'punch'], ['jab', 'punch', 'frontkick'], ['punch', 'uppercut'], ['jab', 'highkick'],
  ['jab', 'punch', 'uppercut'], ['punch', 'frontkick'],
];

export class Duel extends Skill {
  readonly name = 'duel';
  private sub: SwordSwing | null = null;
  private sword: Item | null = null;
  private think = 0.4;
  private combo: Gesture[] = [];
  private guardUntil = 0;
  private stamina = 1;
  private reaction = 0.22;
  private aggression = 0.6;
  private dur = rand(40, 60);
  private ending = -1;
  private taunted = false;
  /** Knockdowns: his own, and the other one's (three and it's over). */
  private downs = { me: 0, them: 0 };
  private wasDown = { me: false, them: false };
  /** How many times he's seen the other one block lately (sweeps break a turtle). */
  private blocksSeen = 0;
  /** Hits he landed (the pet tells him). */
  hits = 0;
  /** `armed`: with a sword (foam/wooden in a play fight, a katana in a real one) or with his fists. */
  constructor(readonly armed = true, readonly why = '') { super(); }

  start(c: Ctx) {
    c.look = 'target';
    const real = c.fightMode === 'real', foe = c.foe?.(), L = c.mood.label;
    if (this.armed) this.sword = this.pickSword(c);
    // His mood is his fighting style: angry = fast and aggressive, sleepy = slow, scared = defensive.
    this.reaction = L === 'angry' ? 0.15 : L === 'sleepy' || L === 'sad' ? 0.32 : L === 'scared' ? 0.2 : 0.22;
    this.aggression = L === 'angry' ? 0.85 : L === 'scared' ? 0.3 : L === 'playful' ? 0.65 : 0.55;
    c.say(real ? pick(['draw.', "this time it's real", '...', `${foe?.name ?? 'you'}. now.`]) : pick(['en garde!', 'spar?', 'square up', 'put em up', `come on ${foe?.name ?? ''}`.trim()]), 1.4);
  }

  /** Real fights are katanas; play fights are his foam sword, or his wooden one if that's what he has. */
  private pickSword(c: Ctx): Item | null {
    const real = c.fightMode === 'real';
    // His own (on his belt, in his hand, or lying around: not one you're holding), else a new one.
    const usable = (id: string) => c.items.list.find((it) => it.def.id === id && it.where !== 'cursor') ?? null;
    const it = real ? usable('katana') ?? c.items.give('katana', c.char)
      : usable('foam-sword') ?? usable('sword') ?? c.items.give('foam-sword', c.char);
    if (!it || it.def.wear) return null;
    // No room on his belt (or it was lying around): straight into his hand.
    if (it.where === 'world' && c.char.useHand) c.items.toHand(it, c.char.useHand);
    return it;
  }

  /** Calling it: what he says depends on how it went. */
  private finish(c: Ctx, how: 'won' | 'lost' | 'time' | 'cut') {
    const ch = c.char, real = c.fightMode === 'real';
    ch.guard = false; ch.faceLock = null; this.combo = [];
    this.ending = this.t + 1.6;
    if (how === 'won') { c.say(real ? pick(['yield.', 'it is done.', 'hmph.']) : pick(['K.O.!', 'I WIN', 'flawless', 'GG ez']), 1.8); if (!real && ch.ready) ch.doGesture('laugh'); c.mood.nudge({ happiness: 0.12, boredom: -0.3 }); }
    else if (how === 'lost') { c.say(real ? pick(['...', 'next time.']) : pick(['ow ow ow', 'ok ok you win', 'rematch.', 'lucky']), 1.8); c.mood.nudge({ happiness: -0.05, annoyance: 0.08, boredom: -0.3 }); }
    else if (how === 'cut') c.say(pick(['...enough.', 'you need a hand?', 'stay there.']), 1.6);
    else c.say(real ? pick(['...enough.', 'another time.']) : pick(['draw!', 'good fight', 'GG', 'truce?']), 1.6);
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, foe = c.foe?.();
    if (!foe || !ch.useHand) return true;
    const f = foe.char, fj = f.body.j;
    c.lookTarget = { x: fj.neck.x, y: fj.neck.y };
    if (this.ending >= 0) {
      if (this.sword?.where === 'hand' && ch.mode === 'ground') { ch.handTarget = null; this.sword.aim = null; c.items.stow(this.sword); }
      return this.t > this.ending;
    }
    // Keep score: knockdowns, both ways.
    const down = (m: string) => m === 'ragdoll' || m === 'lie';
    if (down(ch.mode) && !this.wasDown.me) this.downs.me++;
    if (down(f.mode) && !this.wasDown.them) this.downs.them++;
    this.wasDown = { me: down(ch.mode), them: down(f.mode) };
    if (this.downs.them >= 3) { this.finish(c, 'won'); return false; }
    if (this.downs.me >= 3) { if (ch.mode === 'ground') this.finish(c, 'lost'); return false; }
    if (!f.whole) { if (ch.mode === 'ground') this.finish(c, 'cut'); return false; }
    if (this.t > this.dur) { if (ch.mode === 'ground') this.finish(c, 'time'); return false; }
    this.stamina = Math.min(1, this.stamina + dt * 0.22);
    // A swing in progress.
    if (this.sub) {
      this.sub.t += dt;
      if (this.sub.update(c, dt)) {
        this.sub = null; this.think = this.t + this.reaction;
        // Sword footwork: after a swing, often step back out of range (and come in again).
        const fx = c.foe?.()?.char.x;
        if (fx !== undefined && chance(0.55)) c.char.walkTo(c.char.x - Math.sign(fx - c.char.x) * rand(30, 60) * c.char.scale, true);
      }
      return false;
    }
    if (ch.mode !== 'ground') { ch.guard = false; return false; } // flying, down, or getting up
    const dx = f.x - ch.x, dist = Math.abs(dx), dir = (Math.sign(dx) || ch.facing) as 1 | -1;
    ch.faceLock = dir;
    ch.guard = this.t < this.guardUntil;
    if (ch.hitstun > 0 || ch.attack) return false; // reeling, or mid-move
    // The next hit of a combo comes out right away, as long as it can still reach.
    const sc = ch.scale, arm = ch.d.upperArm + ch.d.foreArm, leg = ch.d.thigh + ch.d.shin;
    const punchR = arm * 1.15, kickR = leg * 1.15;
    if (this.combo.length) {
      const next = this.combo.shift()!;
      if (dist < (next === 'frontkick' || next === 'highkick' ? kickR : punchR) * 1.1 && f.mode !== 'ragdoll') { this.attack(c, next, f); return false; }
      this.combo = [];
    }
    if (this.t < this.think) return false;
    this.think = this.t + this.reaction * rand(0.7, 1.4);

    const theirs = f.attack, fAir = f.mode === 'air', fDown = down(f.mode), fUp = f.mode === 'getup';
    if (f.guard) this.blocksSeen = Math.min(6, this.blocksSeen + 1); else this.blocksSeen = Math.max(0, this.blocksSeen - 0.25);
    // Defense: he sees it coming (and isn't too slow to react).
    if (theirs?.windup && dist < kickR * 1.3 && chance(0.35 + (1 - this.aggression) * 0.4)) {
      if (theirs.name === 'sweep' && ch.legCount === 2) ch.jump(-dir * 90, -560);
      else if (chance(0.6) || this.sword) { this.guardUntil = this.t + 0.45; ch.guard = true; }
      else ch.walkTo(ch.x - dir * 36 * sc, true);
      return false;
    }
    // He's down: give him room, say something, and get ready to pounce when he's up.
    if (fDown) {
      if (dist < kickR * 1.4) ch.walkTo(f.x - dir * kickR * 1.6);
      if (!this.taunted && chance(0.5)) { this.taunted = true; c.say(c.fightMode === 'real' ? pick(['stay down.', 'get up.']) : pick(['get up!', 'haha', 'you ok?', 'timber!', 'down goes ' + foe.name]), 1.3); }
      return false;
    }
    this.taunted = false;
    // Tired: back off and cover up for a moment.
    if (this.stamina < 0.25) { ch.walkTo(ch.x - dir * 40 * sc); this.guardUntil = this.t + 0.6; return false; }
    // With a sword: slash from sword range, otherwise close the distance.
    if (this.sword && this.sword.where !== 'cursor') {
      const swordR = arm * 0.85 + this.sword.def.length * sc * 0.85;
      // Mix in kicks and jump attacks, so it's not just slash, block, slash.
      if (dist < kickR * 1.25 && dist > punchR * 0.6 && chance(0.35)) { ch.walkTo(f.x - dir * kickR * 0.85, true); this.combo = [chance(0.6) ? 'frontkick' : 'highkick']; return false; }
      if (dist > swordR * 1.3 && dist < swordR * 3 && chance(this.aggression * 0.3) && ch.legCount === 2) { ch.jumpPunch({ x: fj.neck.x, y: fj.neck.y }); return false; }
      if (f.hitstun > 0 && dist < swordR * 1.2) {
        const target = () => ({ x: fj.neck.x * 0.5 + fj.hip.x * 0.5, y: fj.neck.y * 0.55 + fj.hip.y * 0.45 });
        this.sub = new SwordSwing(1, false, 'swing', { target, item: this.sword, keepOut: true }); this.sub.start(c);
        return false;
      }
      if (dist < swordR * 1.05 && dist > swordR * 0.45 && chance(this.aggression + 0.2)) {
        const target = () => ({ x: fj.neck.x * 0.5 + fj.hip.x * 0.5, y: fj.neck.y * 0.55 + fj.hip.y * 0.45 });
        this.sub = new SwordSwing(1, false, 'swing', { target, item: this.sword, keepOut: true });
        this.sub.start(c);
        this.stamina -= 0.15;
        return false;
      }
      if (dist <= swordR * 0.45) { ch.walkTo(ch.x - dir * swordR * 0.4, true); return false; }
      ch.walkTo(f.x - dir * swordR * 0.9, dist > 200 * sc);
      return false;
    }
    // In the air: juggle them.
    if (fAir && dist < kickR) { this.attack(c, chance(0.6) ? 'uppercut' : 'highkick', f); return false; }
    // Getting up: be right there.
    if (fUp) { ch.walkTo(f.x - dir * punchR * 0.85, true); return false; }
    // Stunned and close: combo time.
    if (f.hitstun > 0 && dist < punchR) {
      this.combo = [...pick(COMBOS)];
      this.attack(c, this.combo.shift()!, f);
      return false;
    }
    if (dist < punchR * 0.55) { ch.walkTo(ch.x - dir * punchR * 0.5, true); return false; } // too close to swing
    if (dist < punchR) {
      if (!chance(this.aggression + 0.15)) { this.guardUntil = this.t + 0.35; return false; }
      const turtle = this.blocksSeen > 2.5;
      const move: Gesture = turtle && chance(0.55) ? 'sweep' : pick(['jab', 'jab', 'punch', 'punch', 'uppercut', 'frontkick', chance(0.4) ? 'sweep' : 'jab']);
      if (chance(0.35)) this.combo = [...pick(COMBOS)].slice(1);
      this.attack(c, move, f);
      return false;
    }
    if (dist < kickR) {
      if (chance(this.aggression)) this.attack(c, chance(0.55) ? 'frontkick' : 'highkick', f);
      else ch.walkTo(ch.x + dir * rand(-1, 1) * 18 * sc); // footsies: in and out at the edge of range
      return false;
    }
    if (dist < kickR * 2.4) {
      // Mid range: dash in with a jump punch, step in, or bait them.
      if (chance(this.aggression * 0.35) && ch.legCount === 2) { ch.jumpPunch({ x: fj.neck.x, y: fj.neck.y }); this.stamina -= 0.15; return false; }
      ch.walkTo(f.x - dir * (chance(this.aggression) ? punchR * 0.9 : kickR * 1.3), chance(0.4));
      return false;
    }
    ch.walkTo(f.x - dir * kickR * 0.95, dist > 220 * sc);
    return false;
  }

  /** Throw a move at him (aimed at the right height for it). */
  private attack(c: Ctx, move: Gesture, f: { body: { j: Record<'neck' | 'head' | 'hip' | 'footL' | 'footR', { x: number; y: number }> } }) {
    const ch = c.char, j = f.body.j;
    const at = move === 'sweep' ? { x: (j.footL.x + j.footR.x) / 2, y: Math.max(j.footL.y, j.footR.y) }
      : move === 'frontkick' ? { x: j.hip.x, y: j.hip.y - 6 * ch.scale }
      : move === 'highkick' || move === 'jab' || move === 'punch' ? { x: j.neck.x, y: (j.neck.y + j.head.y) / 2 }
      : { x: j.neck.x, y: j.neck.y };
    ch.guard = false; this.guardUntil = 0;
    ch.doGesture(move, at);
    this.stamina -= move === 'jab' ? 0.05 : move === 'punch' ? 0.08 : 0.13;
  }

  stop(c: Ctx) {
    const ch = c.char;
    this.sub?.stop(c);
    ch.guard = false; ch.handTarget = null; ch.airPunch = null; ch.faceLock = null;
    if (this.sword?.where === 'hand') { this.sword.aim = null; c.items.stow(this.sword); }
  }
}
