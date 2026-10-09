import { Skill, arrive, type Ctx } from './context';
import { Tool } from '../skills';
import { Handling } from './handling';
import type { Item } from '../items';
import type { PeerMsg, FighterView } from '../peer';
import type { Doodle } from '../doodles';
import { giftPreference } from '../character-template';

export const giftReady = (v: FighterView) =>
  !!v.id &&
  !v.asleep &&
  !v.busy &&
  !v.group &&
  v.hp > 0.25 &&
  v.whole &&
  (v.freeBagSlots ?? 1) > 0 &&
  ['ground', 'sit'].includes(v.mode);
export function giftCandidates(c: Ctx, thoughtful = true) {
  const pens = c.items.onHim.filter((i) => i.def.use === 'draw').length;
  return c.items.onHim.filter(
    (i) =>
      i.where === 'belt' &&
      !i.def.wear &&
      i.def.belt !== 'none' &&
      !i.working &&
      (i.def.use !== 'draw' || pens > 1) &&
      (!thoughtful || !['gun', 'shoot', 'connect'].includes(i.def.use)),
  );
}
/** Presents an owned original. Receipt keeps full/refusing bags from losing the giver's item. */
export class GiveGift extends Skill {
  readonly name: string;
  private peer: string | null = null;
  private item: Item | null = null;
  private tool = new Tool('none');
  private pen = new Tool('draw');
  private drawing: Doodle | null = null;
  private drawn = 0;
  private prepared = false;
  private reach = new Handling();
  private token = '';
  private sent = false;
  private accepted: boolean | undefined;
  private releaseReply: (() => void) | null = null;
  constructor(private wrapped = true) {
    super();
    this.name = wrapped ? 'gift' : 'moment';
  }
  start(c: Ctx) {
    const candidates = giftCandidates(c, this.wrapped);
    const peers = (c.peers?.() ?? [])
      .filter(giftReady)
      .sort(
        (a, b) =>
          (c.relationship?.(b.id!)?.trust ?? 0.5) - (c.relationship?.(a.id!)?.trust ?? 0.5) ||
          Math.abs(a.x - c.char.x) - Math.abs(b.x - c.char.x),
      );
    const selected = c.foe?.()?.id;
    const target = peers.find((p) => p.id === selected) ?? peers[0];
    this.peer = target?.id ?? null;
    this.item = target
      ? ((this.wrapped
          ? candidates.sort(
              (a, b) =>
                giftPreference(target.personality, b.def.id) -
                giftPreference(target.personality, a.def.id),
            )
          : candidates)[0] ?? null)
      : null;
    if (!this.peer || !this.item) {
      c.say('I need a spare gift and a friend with room.', 2);
      return;
    }
    this.tool.item = this.item;
    this.token = `${c.who}:${this.item.uid}:${c.world.time}`;
    this.prepared = !this.wrapped || this.item.def.id === 'flowers' || !c.items.find('draw');
  }
  receive(c: Ctx, m: PeerMsg, from: string) {
    if (
      m.type !== 'giftReceipt' ||
      m.token !== this.token ||
      from !== this.peer ||
      !this.sent ||
      this.accepted !== undefined
    )
      return;
    this.accepted = m.accepted;
    if (m.accepted && this.item && c.items.list.includes(this.item)) {
      c.items.remove(this.item);
      c.recordGift?.(from, this.item.def.id, m.appreciation ?? 0.45, false);
    }
  }
  update(c: Ctx, dt: number) {
    const it = this.item,
      ch = c.char,
      peer = (c.peers?.() ?? []).find((p) => p.id === this.peer);
    if (this.sent) {
      if (this.accepted === undefined) return this.t > 30;
      if (!this.accepted) c.say('Maybe another time. I’ll keep this safe.', 2);
      return true;
    }
    if (
      !it ||
      !peer ||
      !c.items.list.includes(it) ||
      it.where === 'cursor' ||
      !giftReady(peer) ||
      !ch.useHand ||
      this.t > 25
    )
      return true;
    if (!this.prepared) {
      const fetched = this.pen.fetch(c, dt);
      if (fetched === 'none') {
        this.prepared = true;
        return false;
      }
      if (fetched !== 'ready') return false;
      ch.stop();
      const n = ch.body.j.neck,
        sc = ch.scale,
        f = ch.facing;
      this.drawing ??= {
        strokes: [[]],
        color: c.inkColor,
        born: c.world.time,
        done: false,
        anchored: true,
      };
      if (!c.doodles.includes(this.drawing)) c.doodles.push(this.drawing);
      this.drawn += dt;
      const shape = [
          [0, 0],
          [24, 0],
          [24, 18],
          [0, 18],
          [0, 0],
          [12, 0],
          [12, 18],
        ],
        u = Math.min(5.999, (this.drawn / 2.5) * 6),
        i = Math.floor(u),
        k = u - i;
      const at = {
        x: n.x + f * (9 + shape[i][0] * (1 - k) + shape[i + 1][0] * k) * sc,
        y: n.y + (14 + shape[i][1] * (1 - k) + shape[i + 1][1] * k) * sc,
      };
      ch.handTarget = at;
      c.look = 'target';
      c.lookTarget = at;
      this.drawing.strokes[0].push(at);
      if (this.drawing.strokes[0].length > 360) this.drawing.strokes[0].splice(0, 1);
      if (this.drawn >= 2.5) {
        this.drawing.done = true;
        this.drawing.alive = true;
        this.pen.stow(c, dt);
        this.prepared = true;
        it.giftWrap = 1 + ((c.relationship?.(this.peer!)?.giftsGiven ?? 0) % 3);
      }
      return false;
    }
    if (it.where !== 'hand') {
      const result = this.tool.fetch(c, dt);
      if (result !== 'ready') return result === 'none';
    }
    if (!arrive(c, peer.x + (ch.x < peer.x ? -35 : 35) * ch.scale, 9)) return false;
    ch.facing = ch.x < peer.x ? 1 : -1;
    c.look = 'target';
    c.lookTarget = peer.joints.head ?? null;
    const hand = peer.joints.handL ?? { x: peer.x, y: ch.body.j.neck.y + 25 };
    if (!this.reach.reach(c, hand, dt)) return false;
    it.working = true;
    c.say(
      this.wrapped
        ? `I thought you might like ${it.def.name.toLowerCase()}.`
        : 'Here, you can keep this.',
      2,
    );
    this.sent = true;
    const message: Extract<PeerMsg, { type: 'toolGift' }> = {
      type: 'toolGift',
      token: this.token,
      uid: it.uid,
      def: structuredClone(it.def),
      ammo: it.ammo,
      reloadRemaining: it.reloadRemaining,
      bookmark: it.bookmark,
      gameBest: it.gameBest,
      ink: it.ink,
      wrap: it.giftWrap,
    };
    this.releaseReply =
      c.deliverGift?.(this.peer!, message, (accepted, appreciation) =>
        this.receive(
          c,
          { type: 'giftReceipt', token: this.token, accepted, appreciation },
          this.peer!,
        ),
      ) ?? null;
    if (!c.deliverGift) {
      this.accepted = false;
    }
    return this.accepted !== undefined;
  }
  stop(c: Ctx) {
    this.releaseReply?.();
    c.char.handTarget = null;
    c.char.handsAt = null;
    this.pen.item && c.items.list.includes(this.pen.item) && this.pen.stow(c, 1);
    if (this.drawing) this.drawing.alive = true;
    if (this.item && c.items.list.includes(this.item)) {
      this.item.giftWrap = 0;
      this.item.giftUnwrap = 0;
      this.item.working = false;
      if (this.item.where === 'hand' && !c.items.stow(this.item)) c.items.drop(this.item, 0, 0);
    }
  }
}

/** Receiving is an inspection, not automatic use of the gift's activity. */
export class ReceiveGift extends Skill {
  readonly name = 'receivegift';
  private tool = new Tool('none');
  private elapsed = 0;
  constructor(
    private item: Item,
    private appreciation: number,
  ) {
    super();
    this.tool.item = item;
  }
  update(c: Ctx, dt: number) {
    const it = this.item,
      ch = c.char;
    if (!c.items.list.includes(it) || it.where === 'cursor' || !ch.useHand || this.t > 12)
      return true;
    if (it.where !== 'hand') {
      const result = this.tool.fetch(c, dt);
      if (result !== 'ready') return result === 'none';
    }
    this.elapsed += dt;
    ch.stop();
    const n = ch.body.j.neck,
      sc = ch.scale,
      f = ch.facing;
    ch.handsAt = {
      [it.hand]: { x: n.x + f * 9 * sc, y: n.y + 23 * sc },
      [it.hand === 'L' ? 'R' : 'L']: {
        x: n.x + f * 25 * sc,
        y: n.y + (23 - Math.sin(Math.min(1, this.elapsed / 3) * Math.PI) * 7) * sc,
      },
    };
    it.aim = { x: f, y: 0, z: 0 };
    it.working = true;
    it.giftUnwrap = Math.min(1, this.elapsed / 2.5);
    c.look = 'target';
    c.lookTarget = it.at;
    if (this.elapsed > 2.5 && this.elapsed - dt <= 2.5)
      c.say(
        this.appreciation > 0.7
          ? 'You remembered what I like! Thank you.'
          : 'That’s kind of you. Thank you.',
        2,
      );
    if (this.elapsed > 5) {
      ch.handsAt = null;
      it.giftWrap = 0;
      it.working = false;
      return this.tool.stow(c, dt);
    }
    return false;
  }
  stop(c: Ctx) {
    c.char.handsAt = null;
    c.char.handTarget = null;
    if (c.items.list.includes(this.item)) {
      this.item.giftWrap = 0;
      this.item.giftUnwrap = 0;
      this.item.aim = null;
      this.item.working = false;
      if (this.item.where === 'hand' && !c.items.stow(this.item)) c.items.drop(this.item, 0, 0);
    }
  }
}
