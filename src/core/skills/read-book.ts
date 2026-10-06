import { Skill, type Ctx } from './context';
import { ActivityClock } from '../activity-pacing';
import type { Item } from '../items';
import { propsOf, SitOnProp } from './props';

/** A quiet, long activity. Pages move; ordinary conversation need not get him out of his seat. */
export class ReadBook extends Skill {
  readonly name = 'read';
  private book: Item | null = null;
  private seat: SitOnProp | null = null;
  private clock = new ActivityClock('read');
  private nextPage = 12;
  private pageUntil = 0;
  start(c: Ctx) {
    if (!c.char.useHand) return;
    this.book =
      c.items.list.find(
        (it) => it.def.id === 'book' && ['belt', 'hand'].includes(it.where),
      ) ?? c.items.give('book', c.char);
    const seat = propsOf(c, 'seat').find(
      (t) => t.sitters.has(c.who) || t.sitters.size < t.seatRoom,
    );
    if (seat) {
      this.seat = new SitOnProp(seat, 3600, c.char.facing as 1 | -1);
      this.seat.start(c);
    }
    c.say('a few chapters.', 1.4);
  }
  update(c: Ctx, dt: number) {
    const ch = c.char,
      book = this.book;
    if (!book || book.where === 'cursor' || !ch.useHand || this.t > 2300)
      return true;
    if (this.seat) {
      this.seat.t += dt;
      if (this.seat.update(c)) { this.seat.stop(c); this.seat = null; }
    } else if (ch.ready) ch.sit();
    if (ch.mode !== 'sit') return this.t > 25;
    if (book.where !== 'hand') c.items.wield(book, ch.useHand);
    const n = ch.body.j.neck,
      sc = ch.scale,
      f = ch.facing;
    const at = { x: n.x + f * 12 * sc, y: n.y + 22 * sc };
    const turning = this.clock.elapsed < this.pageUntil;
    ch.handsAt = {
      [book.hand]: at,
      [book.hand === 'L' ? 'R' : 'L']: {
        x: at.x + f * (turning ? -4 : 9) * sc,
        y: at.y - (turning ? 8 : 1) * sc,
      },
    };
    book.aim = { x: f * 0.8, y: -0.6, z: 0 };
    book.aimLocal = null;
    c.look = 'target';
    c.lookTarget = at;
    c.mood.s.boredom = Math.max(0, c.mood.s.boredom - dt / 300);
    if (this.clock.elapsed >= this.nextPage) {
      this.pageUntil = this.clock.elapsed + 0.6;
      this.nextPage += 18;
    }
    return this.clock.tick(c, dt);
  }
  stop(c: Ctx) {
    c.char.handsAt = null;
    c.char.handTarget = null;
    this.seat?.stop(c);
    if (!this.seat && c.char.mode === 'sit') c.char.standUp();
    if (this.book?.where === 'hand' && !c.items.stow(this.book))
      c.items.drop(this.book, 0, 0);
  }
}
