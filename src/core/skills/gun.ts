import { Skill, type Ctx } from './context';
import type { Vec } from '../math';
import type { Item } from '../items';

/** Deliberately aimed bursts, six-round magazine, a readable reload and recoil pose. */
export class ShootGun extends Skill {
  readonly name = 'gun';
  private item: Item | null = null;
  private wait = 0.4;
  private fired = 0;
  private recoilTime = 0;
  private reloading = false;
  constructor(
    private target: () => Vec | null,
    private at: 'friend' | 'cursor',
    private shots = 3,
  ) {
    super();
  }
  start(c: Ctx) {
    const gun = c.items.find('gun'),
      hand = c.char.useHand;
    if (!gun || !hand || !['belt', 'hand'].includes(gun.where)) return;
    for (const it of c.items.list)
      if (it.where === 'hand' && it !== gun && !c.items.stow(it))
        c.items.drop(it, 0, -30);
    c.items.toHand(gun, hand);
    this.item = gun;
    c.look = 'target';
  }
  update(c: Ctx, dt: number) {
    const gun = this.item,
      ch = c.char,
      target = this.target();
    if (!gun || gun.where !== 'hand' || !target || this.t > 12) return true;
    if (ch.mode !== 'ground' || ch.hitstun > 0) return true;
    const n = ch.body.j.neck,
      dx = target.x - n.x,
      dy = target.y - n.y,
      len = Math.hypot(dx, dy) || 1;
    const dir = (Math.sign(dx) || ch.facing) as 1 | -1,
      fx = dx / len,
      fy = dy / len,
      sc = ch.scale;
    ch.stop();
    ch.facing = dir;
    ch.faceLock = dir;
    c.lookTarget = target;
    this.recoilTime = Math.max(0, this.recoilTime - dt);
    const recoil = (this.recoilTime / 0.16) * 5 * sc;
    const hand = {
      x: n.x + fx * (27 * sc - recoil),
      y: n.y + fy * 27 * sc + 7 * sc,
    };
    ch.handsAt = {
      [gun.hand]: hand,
      [gun.hand === 'R' ? 'L' : 'R']: {
        x: hand.x - fx * 6 * sc,
        y: hand.y + (this.reloading ? 18 : 4) * sc,
      },
      lean: (-recoil / sc) * 0.2,
    };
    gun.aimLocal = [Math.abs(fx), -fy];
    ch.actionMove = {
      name: 'gun',
      u: 0.5,
      windup: true,
      hitIn: Math.max(0, this.wait),
    };
    this.wait -= dt;
    if (this.wait > 0) return false;
    if (this.fired >= this.shots) return true;
    if (this.reloading) {
      gun.ammo = 6;
      this.reloading = false;
    }
    if (!gun.ammo) {
      this.reloading = true;
      this.wait = 1.15;
      c.say('reload', 1);
      c.sound?.('pickup', 0.5);
      return false;
    }
    const muzzle = {
      x: hand.x + fx * gun.def.length * sc,
      y: hand.y + fy * gun.def.length * sc,
    };
    c.fire?.(muzzle.x, muzzle.y, fx * 2200, fy * 2200, this.at);
    c.burst?.(muzzle.x, muzzle.y, 5);
    c.sound?.('shot', 0.6);
    this.recoilTime = 0.16;
    gun.ammo--;
    this.fired++;
    this.wait = 0.34;
    return false;
  }
  stop(c: Ctx) {
    c.char.handsAt = null;
    c.char.actionMove = null;
    c.char.faceLock = null;
    if (this.item) {
      this.item.aimLocal = null;
      if (this.item.where === 'hand') c.items.stow(this.item);
    }
  }
}
