// Fighting his friend. A play fight is fists, foam and wooden swords: nobody gets hurt, they laugh it
// off. A real fight is katanas: a cut can take a limb off (he puts it back on, the way he always does)
// and a thrust to the body runs him through (he goes down for a bit). Who gets hit, and how, is
// worked out by the pets (Pet.takeHit); this skill is just how he fights: close in, swing or punch,
// back off, circle, and call it after a while.
import { Skill, type Ctx } from './context';
import type { Item } from '../items';
import { SwordSwing } from '../skills';
import { chance, pick, rand } from '../math';

export class Duel extends Skill {
  readonly name = 'duel';
  private sub: SwordSwing | null = null;
  private sword: Item | null = null;
  private next = 0.6;
  private dur = rand(14, 24);
  private ending = -1;
  private taunted = false;
  /** Hits he landed (the pet tells him). */
  hits = 0;
  /** `armed`: with a sword (foam/wooden in a play fight, a katana in a real one) or with his fists. */
  constructor(private armed = true, readonly why = '') { super(); }

  start(c: Ctx) {
    c.look = 'target';
    const real = c.fightMode === 'real', foe = c.foe?.();
    if (this.armed) this.sword = this.pickSword(c);
    c.char.guard = !this.sword;
    c.say(real ? pick(['draw.', "this time it's real", '...', `${foe?.name ?? 'you'}. now.`]) : pick(['en garde!', 'spar?', 'foam fight!', 'put em up', `come on ${foe?.name ?? ''}`.trim()]), 1.4);
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

  update(c: Ctx, dt: number) {
    const ch = c.char, foe = c.foe?.();
    if (!foe || !ch.useHand) return true;
    const f = foe.char, fj = f.body.j;
    c.lookTarget = { x: fj.neck.x, y: fj.neck.y };
    // Calling it: say so, and put the sword away.
    if (this.ending >= 0) {
      if (this.sword?.where === 'hand') { ch.handTarget = null; this.sword.aim = null; c.items.stow(this.sword); }
      return this.t > this.ending;
    }
    if (this.t > this.dur) {
      ch.guard = false;
      const real = c.fightMode === 'real';
      if (ch.ready) {
        c.say(this.hits >= 3 ? (real ? pick(['yield.', 'it is done.', 'hmph.']) : pick(['I win!', 'K.O.!', 'too easy', 'GG']))
          : real ? pick(['...enough.', 'another time.']) : pick(['good fight', 'GG', 'rematch later', 'ok ok truce']), 1.6);
        if (!real) ch.doGesture('laugh');
      }
      this.ending = this.t + 1.2;
      return false;
    }
    // A swing in progress.
    if (this.sub) {
      this.sub.t += dt;
      if (this.sub.update(c, dt)) { this.sub = null; this.next = this.t + rand(0.45, 1.1); }
      return false;
    }
    // He's down: wait for him to get up (and maybe say something about it).
    if (f.mode === 'ragdoll' || f.mode === 'lie' || f.mode === 'getup' || f.mode === 'held') {
      ch.guard = !this.sword;
      if (!this.taunted && ch.ready) { this.taunted = true; c.say(c.fightMode === 'real' ? pick(['stay down.', 'get up.']) : pick(['get up!', 'haha', 'you ok?', 'timber!']), 1.4); }
      return false;
    }
    this.taunted = false;
    if (!ch.ready || this.t < this.next) return false;
    const j = ch.body.j, sc = ch.scale, arm = ch.d.upperArm + ch.d.foreArm;
    const dx = f.x - ch.x, dist = Math.abs(dx), dir = Math.sign(dx) || ch.facing;
    const reach = this.sword ? arm * 0.85 + this.sword.def.length * sc * 0.8 : arm;
    ch.facing = dir as 1 | -1;
    if (dist > reach * 1.25) {
      ch.walkTo(f.x - dir * reach * 0.85, dist > 220 * sc);
      this.next = this.t + 0.2;
      return false;
    }
    if (dist < reach * 0.6 || (f.strike && chance(0.35))) {
      // Too close, or he's swinging: hop back out of range.
      ch.walkTo(ch.x - dir * reach * 0.6, true);
      this.next = this.t + rand(0.25, 0.5);
      return false;
    }
    if (this.sword) {
      const target = () => ({ x: fj.neck.x * 0.5 + fj.hip.x * 0.5, y: fj.neck.y * 0.55 + fj.hip.y * 0.45 });
      this.sub = new SwordSwing(1, false, 'swing', { target, item: this.sword, keepOut: true });
      this.sub.start(c);
      return false;
    }
    // Fists: a punch at his head or chest, a kick at his middle, now and then a jump punch.
    const head = { x: fj.neck.x, y: (fj.neck.y + fj.head.y) / 2 }, mid = { x: fj.hip.x, y: fj.hip.y - 4 * sc };
    if (f.body.j.head.y < j.head.y - 30 * sc && ch.legCount === 2) ch.jumpPunch(head);
    else ch.doGesture(chance(0.3) ? 'highkick' : 'punch', chance(0.5) ? head : mid);
    this.next = this.t + rand(0.35, 0.8);
    return false;
  }

  stop(c: Ctx) {
    const ch = c.char;
    this.sub?.stop(c);
    ch.guard = false; ch.handTarget = null; ch.airPunch = null;
    if (this.sword?.where === 'hand') { this.sword.aim = null; c.items.stow(this.sword); }
  }
}
