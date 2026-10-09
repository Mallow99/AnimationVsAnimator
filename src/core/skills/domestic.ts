import { Skill, arrive, type Ctx } from './context';
import { Handling } from './handling';
import { Tool, FetchItem } from '../skills';
import { SitOnProp, propsOf } from './props';
import type { Item } from '../items';
import type { Thing } from '../props';
import { clamp, smooth } from '../math';

/** Each reader owns a claim; the last one switches an automatic lamp off. Manual choice wins. */
export class ReadingLight {
  private lamp: Thing | null = null;
  private picked = false;
  private reach = new Handling();
  prepare(c: Ctx, dt: number) {
    if (!this.picked) {
      this.picked = true;
      this.lamp =
        c.props?.placed
          .filter(
            (t) =>
              t.def?.use === 'light' &&
              !t.held &&
              !t.movingBy &&
              Math.abs(t.tilt) < 0.3 &&
              Math.abs(t.center.x - c.char.x) < 280 * c.char.scale,
          )
          .sort((a, b) => Math.abs(a.center.x - c.char.x) - Math.abs(b.center.x - c.char.x))[0] ??
        null;
    }
    const t = this.lamp;
    if (!t || !c.props?.things.includes(t) || t.held || Math.abs(t.tilt) > 0.3) return true;
    if (t.manualLight === false) {
      t.lightUsers.add(c.who);
      t.syncLight();
      return true;
    }
    if (!t.on) {
      if (!arrive(c, t.center.x + (c.char.x < t.center.x ? -25 : 25) * c.char.scale, 8))
        return false;
      if (!this.reach.reach(c, t.toWorld(18, 35), dt)) return false;
    }
    t.lightUsers.add(c.who);
    t.syncLight();
    c.char.handTarget = null;
    return true;
  }
  stop(c: Ctx) {
    this.lamp?.lightUsers.delete(c.who);
    this.lamp?.syncLight();
    c.char.handTarget = null;
  }
}
export class SwitchLamp extends Skill {
  readonly name = 'lamp';
  private reach = new Handling();
  private done = false;
  constructor(private lamp: Thing | null = null, private desiredOn: boolean | undefined = lamp ? !lamp.on : undefined) {
    super();
  }
  static nearest(c: Ctx) {
    return c.props?.placed.filter(t=>t.def?.use==='light'&&!t.held&&!t.movingBy&&Math.abs(t.tilt)<.35)
      .sort((a,b)=>Math.abs(a.center.x-c.char.x)-Math.abs(b.center.x-c.char.x))[0] ?? null;
  }
  start(c: Ctx) {
    this.lamp ??= SwitchLamp.nearest(c);
    if(this.lamp)this.desiredOn ??= !this.lamp.on;
    if (!this.lamp) c.say('We need a lamp.', 1.5);
  }
  update(c: Ctx, dt: number) {
    const t = this.lamp;
    if (!t || !c.props?.things.includes(t) || t.held || t.movingBy || Math.abs(t.tilt) > 0.35 || this.t > 20)
      return true;
    if (!arrive(c, t.center.x + (c.char.x < t.center.x ? -25 : 25) * c.char.scale, 8)) return false;
    if (!this.done) {
      if (!this.reach.reach(c, t.toWorld(18, 35), dt)) return false;
      t.manualLight = this.desiredOn!;
      t.syncLight();
      this.done = true;
      c.char.handTarget = null;
      c.sound?.('pickup');
    }
    return true;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
  }
}
export class DomesticItem extends Skill {
  readonly name: 'blanket' | 'snack';
  private item: Item | null = null;
  private tool: Tool;
  private fetch: FetchItem | null = null;
  private seat: SitOnProp | null = null;
  private elapsed = 0;
  private storing = false;
  private settled = false;
  constructor(
    private use: 'rest' | 'snack',
    private original: Item | null = null,
    elapsed = 0,
  ) {
    super();
    this.name = use === 'rest' ? 'blanket' : 'snack';
    this.tool = new Tool(use);
    this.elapsed = elapsed;
  }
  start(c: Ctx) {
    this.item = this.original ?? c.items.find(this.use);
    if (!this.item || this.item.where === 'cursor') {
      c.say(`I need my ${this.name === 'snack' ? 'snack box' : 'blanket'}.`, 1.5);
      this.item = null;
      return;
    }
    this.tool.item = this.item;
    if (this.item.where === 'world') {
      this.fetch = new FetchItem(this.item, false);
      this.fetch.start(c);
    }
  }
  continuation(c: Ctx) {
    const item = this.item,
      elapsed = this.elapsed;
    return item && !this.storing
      ? () =>
          c.items.list.includes(item) && item.where !== 'cursor'
            ? new DomesticItem(this.use, item, elapsed)
            : null
      : null;
  }
  update(c: Ctx, dt: number) {
    const it = this.item,
      ch = c.char;
    if (!it || !c.items.list.includes(it) || it.where === 'cursor' || !ch.useHand || this.t > 150)
      return true;
    if (this.fetch) {
      this.fetch.t += dt;
      if (!this.fetch.update(c, dt)) return false;
      this.fetch.stop(c);
      this.fetch = null;
      if (it.where === 'world') return true;
    }
    if (this.storing) {
      it.blanketSpread = Math.max(0, it.blanketSpread - dt * 2);
      it.snackOpen = Math.max(0, it.snackOpen - dt * 2);
      it.snackAt = null;
      if (it.blanketSpread || it.snackOpen) return false;
      ch.handsAt = null;
      this.seat?.stop(c);
      this.seat = null;
      if (ch.mode === 'sit') ch.standUp();
      return this.tool.stow(c, dt);
    }
    if (it.where !== 'hand') {
      const result = this.tool.fetch(c, dt);
      if (result !== 'ready') return result === 'none';
    }
    if (!this.settled) {
      this.settled = true;
      if (this.use === 'rest') {
        const seat = propsOf(c, 'seat').find((t) => t.sitters.size < t.seatRoom);
        if (seat) {
          this.seat = new SitOnProp(seat, 180, ch.facing as 1 | -1);
          this.seat.start(c);
        }
      }
    }
    if (this.seat) {
      this.seat.t += dt;
      if (this.seat.update(c)) {
        this.seat.stop(c);
        this.seat = null;
        return true;
      }
      if (ch.mode !== 'sit') return false;
    }
    if (!['ground', 'sit'].includes(ch.mode)) return true;
    if (this.use === 'rest' && ch.mode === 'ground') ch.sit();
    ch.stop();
    this.elapsed += dt;
    const n = ch.body.j.neck,
      sc = ch.scale,
      f = ch.facing;
    it.working = true;
    it.aim = { x: f, y: 0, z: 0 };
    it.aimLocal = null;
    const at = { x: n.x + f * 8 * sc, y: n.y + (this.use === 'rest' ? 30 : 24) * sc };
    if (this.use === 'rest') {
      it.blanketSpread = Math.min(1, it.blanketSpread + dt * 1.4);
      ch.handsAt = { [it.hand]: at };
      c.look = 'default';
      c.mood.nudge({ frustration: -dt / 100, contentment: dt / 300, energy: dt / 1600 });
    } else {
      it.snackOpen = Math.min(1, it.snackOpen + dt * 1.8);
      const u = (this.elapsed % 8) / 8,
        lift = smooth(clamp((u - 0.15) / 0.2, 0, 1)) * (1 - smooth(clamp((u - 0.55) / 0.2, 0, 1)));
      const free = { x: n.x + f * (13 - 5 * lift) * sc, y: n.y + (27 - 28 * lift) * sc };
      ch.handsAt = { [it.hand]: at, [it.hand === 'L' ? 'R' : 'L']: free };
      it.snackAt = lift > 0.15 ? free : null;
      c.look = 'target';
      c.lookTarget = lift > 0.6 ? { x: n.x + f * 15 * sc, y: n.y } : at;
      c.mood.nudge({ contentment: dt / 300, frustration: -dt / 140 });
    }
    if (
      this.elapsed > (this.use === 'rest' ? 60 : 24) &&
      (this.use === 'rest' || this.elapsed % 8 > 7.4)
    ) {
      // Fold/close in the settled pose before standing to put the original away.
      this.storing = true;
    }
    return false;
  }
  stop(c: Ctx) {
    this.fetch?.stop(c);
    this.seat?.stop(c);
    c.char.handsAt = null;
    c.char.handTarget = null;
    if (c.char.mode === 'sit') c.char.standUp();
    if (this.item && c.items.list.includes(this.item)) {
      this.item.working = false;
      this.item.blanketSpread = 0;
      this.item.snackOpen = 0;
      this.item.snackAt = null;
      this.item.aim = null;
      if (this.item.where === 'hand' && !c.items.stow(this.item)) c.items.drop(this.item, 0, 0);
    }
  }
}
