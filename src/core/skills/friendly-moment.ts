import { GiveGift } from './gift';
import { Skill, arrive, type Ctx } from './context';
export class FriendlyMoment extends Skill {
  readonly name = 'moment';
  private peer: string | null = null;
  private sent = false;
  private gift: GiveGift | null = null;
  constructor(private kind: 'pass' | 'compare' | 'check' | 'apology') {
    super();
  }
  start(c: Ctx) {
    if (this.kind === 'pass') {
      this.gift = new GiveGift(false);
      this.gift.start(c);
      return;
    }
    const peers = c.peers?.() ?? [];
    const target = peers
      .filter(
        (v) =>
          v.id &&
          !v.asleep &&
          !v.group &&
          (this.kind === 'check'
            ? v.hp < 0.5 ||
              ['ragdoll', 'getup'].includes(v.mode) ||
              ['sad', 'lonely', 'frustrated', 'overwhelmed', 'nervous'].includes(v.mood)
            : this.kind === 'apology'
              ? !v.busy && !!c.relationship?.(v.id!)?.lastDisagreement
              : !v.busy),
      )
      .sort(
        (a, b) =>
          (this.kind === 'compare'
            ? Number(b.talent === 'drawing') - Number(a.talent === 'drawing')
            : this.kind === 'check'
              ? (c.relationship?.(b.id!)?.care ?? 0) - (c.relationship?.(a.id!)?.care ?? 0)
              : 0) || Math.abs(a.x - c.char.x) - Math.abs(b.x - c.char.x),
      )[0];
    this.peer = target?.id ?? null;
  }
  update(c: Ctx, dt = 1 / 120) {
    if (this.gift) {
      this.gift.t = this.t;
      return this.gift.update(c, dt);
    }
    const v = c.peers?.().find((v) => v.id === this.peer);
    if (!v || v.asleep || v.group || this.t > 10) return true;
    if (!arrive(c, v.x + (c.char.x < v.x ? -30 : 30) * c.char.scale, 10)) return false;
    c.look = 'target';
    c.lookTarget = v.joints.neck ?? null;
    if (!this.sent) {
      this.sent = true;
      if (this.kind === 'compare')
        c.say(v.talent === 'drawing' ? 'What would you change?' : 'Want to compare?', 1.4);
      if (this.kind === 'check')
        c.say(
          c.personality === 'competitive'
            ? 'Want a breather? I’ll stay.'
            : 'Want some company? No rush.',
          2,
        );
      if (this.kind === 'apology')
        c.say(
          c.personality === 'mischievous'
            ? 'I took that too far. Sorry.'
            : 'Sorry about earlier. Let’s start over.',
          2,
        );
      c.tellTo?.(this.peer!, {
        type: 'moment',
        kind: this.kind === 'compare' ? 'compare' : this.kind === 'apology' ? 'apology' : 'check',
      });
      if(this.kind==='apology'){const r=c.relationship?.(this.peer!);if(r)r.lastDisagreement='';}
      c.recordActivity?.(this.peer!, this.kind, true);
    }
    const hand = v.joints.handL ?? v.joints.neck;
    if (hand) c.char.handTarget = hand;
    return this.t > 3;
  }
  stop(c: Ctx) {
    this.gift?.stop(c);
    c.char.handTarget = null;
  }
}
