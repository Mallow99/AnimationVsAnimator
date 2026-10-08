import type { Ctx } from './context';
import type { Vec } from '../math';
import { clamp, smooth } from '../math';

/** Gaze leads a curved reach; the body controller still owns IK and proportions. */
export class Handling {
  private elapsed = 0;
  private from: Vec | null = null;
  reach(c: Ctx, target: Vec, dt: number, heavy = false): boolean {
    const hand = c.char.useHand;
    if (!hand) return false;
    const actual = c.char.body.j[hand === 'L' ? 'handL' : 'handR'];
    this.from ??= { x: actual.x, y: actual.y };
    this.elapsed += dt;
    const notice = c.personality === 'adventurous' ? 0.1 : c.personality === 'gentle' ? 0.24 : 0.16;
    const duration = (heavy ? 0.55 : 0.32) + (c.personality === 'gentle' ? 0.1 : 0);
    c.look = 'target';
    c.lookTarget = target;
    if (this.elapsed < notice) {
      c.char.handTarget = null;
      return false;
    }
    const u = smooth(clamp((this.elapsed - notice) / duration, 0, 1));
    c.char.handTarget = {
      x: this.from.x + (target.x - this.from.x) * u,
      y: this.from.y + (target.y - this.from.y) * u - Math.sin(u * Math.PI) * 4 * c.char.scale,
    };
    return (
      this.elapsed >= notice + duration + 0.06 &&
      (Math.hypot(actual.x - target.x, actual.y - target.y) < 7 * c.char.scale ||
        this.elapsed > 1.25)
    );
  }
}
