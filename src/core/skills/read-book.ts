import { Skill, arrive, type Ctx } from './context';
import { ActivityClock } from '../activity-pacing';
import { isBookItem, type Item } from '../items';
import type { Thing } from '../props';
import { propsOf, SitOnProp } from './props';
import { FetchItem, Tool } from '../skills';
import { clamp, smooth, rand } from '../math';
import { ReadingLight } from './domestic';
import { Handling } from './handling';
import { readerBookAxes } from '../book-model';
import { modelGrip, poseAtGrip, type ModelPose } from '../prop-model';

/** Fetch, open, read at natural page breaks, close, and return the same book. */
export class ReadBook extends Skill {
  readonly name = 'read';
  private book: Item | null = null;
  private seat: SitOnProp | null = null;
  private fetch: FetchItem | null = null;
  private tool = new Tool('none');
  private shelf: Thing | null = null;
  private phase: 'fetch' | 'sit' | 'read' | 'close' | 'return' = 'fetch';
  private phaseTime = 0;
  private clock: ActivityClock;
  private nextPage = 12;
  private pageTime = -1;
  private reachTime = 0;
  private returning = new Handling();
  private light = new ReadingLight();
  constructor(
    private original: Item | null = null,
    elapsed = 0,
    private autonomous = false,
  ) {
    super();
    this.clock = new ActivityClock('read', autonomous);
    this.clock.elapsed = elapsed;
    this.nextPage = elapsed + 12;
  }

  continuation(c: Ctx) {
    const book = this.book,
      elapsed = this.clock.elapsed;
    if (!book || this.phase === 'close' || this.phase === 'return') return null;
    return () =>
      c.items.list.includes(book) && book.where !== 'cursor'
        ? new ReadBook(book, elapsed, this.autonomous)
        : null;
  }

  start(c: Ctx) {
    if (!c.char.useHand) return;
    // Include loose/shelved books. Never conjure another when the owner is carrying the only one.
    this.book =
      this.original ??
      c.items.list.find(
        (it) => isBookItem(it) && it.where !== 'cursor' && it.bookmark < it.bookPages,
      ) ??
      (this.autonomous
        ? null
        : (c.items.list.find((it) => isBookItem(it) && it.where !== 'cursor') ??
          (c.items.list.some(isBookItem) ? null : c.items.give('book', c.char))));
    if (!this.book) {
      c.say('My book is with you.', 1.5);
      return;
    }
    if (!this.autonomous && this.book.bookmark >= this.book.bookPages) this.book.bookmark = 0;
    this.shelf =
      c.props?.placed
        .filter((t) => t.def?.id === 'bookshelf' && !t.held && Math.abs(t.tilt) < 0.35)
        .sort(
          (a, b) =>
            Number(b.storageKey === this.book!.shelf?.key) -
              Number(a.storageKey === this.book!.shelf?.key) ||
            Math.abs(a.center.x - c.char.x) - Math.abs(b.center.x - c.char.x),
        )[0] ?? null;
    this.tool.item = this.book;
    if (this.book.where === 'world') {
      this.fetch = new FetchItem(this.book, false);
      this.fetch.start(c);
    }
  }
  update(c: Ctx, dt: number) {
    const ch = c.char,
      book = this.book;
    this.phaseTime += dt;
    if (
      !book ||
      !c.items.list.includes(book) ||
      book.where === 'cursor' ||
      !ch.useHand ||
      this.t > 2350
    )
      return true;
    if (this.phase === 'fetch') {
      if (this.fetch) {
        this.fetch.t += dt;
        if (!this.fetch.update(c, dt)) return this.t > 25;
        this.fetch.stop(c);
        this.fetch = null;
        if (book.where === 'world') return true;
      }
      const result = this.tool.fetch(c, dt);
      if (result !== 'ready') return result === 'none' || this.t > 25;
      if (!this.light.prepare(c, dt)) return this.t > 25;
      const seat = propsOf(c, 'seat').find(
        (t) => t.sitters.has(c.who) || t.sitters.size < t.seatRoom,
      );
      if (seat) {
        this.seat = new SitOnProp(seat, 3600, ch.facing as 1 | -1, 'reading', true);
        this.seat.start(c);
      }
      this.phase = 'sit';
      this.phaseTime = 0;
    }
    if (this.seat) {
      this.seat.t += dt;
      if (this.seat.update(c)) {
        this.seat.stop(c);
        this.seat = null;
        if (this.phase !== 'return') return true;
      }
    } else if (this.phase !== 'return' && ch.ready) ch.sit();
    if (this.phase === 'sit') {
      if (ch.mode !== 'sit') return this.phaseTime > 20;
      this.phase = 'read';
      this.phaseTime = 0;
      c.say(
        c.personality === 'inventive'
          ? 'Let’s see how this works.'
          : c.personality === 'competitive'
            ? 'One more chapter.'
            : 'a few chapters.',
        1.4,
      );
    }
    if (this.phase === 'return') {
      ch.handsAt = null;
      ch.handTarget = null;
      c.look = 'target';
      c.lookTarget = this.shelf?.center ?? null;
      if (
        !this.shelf ||
        !c.props?.things.includes(this.shelf) ||
        this.shelf.held ||
        Math.abs(this.shelf.tilt) > 0.35
      )
        return true;
      if (!arrive(c, this.shelf.center.x, 10)) return this.phaseTime > 18;
      this.reachTime += dt;
      if (!this.returning.reach(c, this.shelf.toWorld(22, 35), dt)) return false;
      this.returnBook(c);
      return true;
    }
    if (book.where !== 'hand') return true;
    const n = ch.body.j.neck,
      sc = ch.scale;
    const ready = this.phase === 'close' ? 1 : smooth(clamp(this.phaseTime / 0.8, 0, 1));
    book.bookTarget = this.phase === 'close' ? 0 : ready;
    let turned = false;
    if (this.pageTime >= 0) {
      this.pageTime += dt;
      if (this.pageTime >= 0.85) {
        book.bookmark = Math.min(book.bookPages, book.bookmark + 1);
        if (book.bookmark === book.bookPages)
          book.bookReadThroughs = Math.min(1000, book.bookReadThroughs + 1);
        this.pageTime = -1;
        turned = true;
      }
    }
    const page = this.pageTime >= 0 ? clamp(this.pageTime / 0.85, 0, 1) : 0;
    book.bookPage = page < 1 ? page : 0;
    book.bookReading = true;
    const f = ch.facing,
      at = { x: n.x + f * 5 * sc, y: n.y + (24 - 17 * ready) * sc };
    const turn = Math.sin(page * Math.PI);
    const angle = ready * 0.9;
    const aim = { x: f * Math.cos(angle), y: -Math.sin(angle), z: 0 };
    const length = book.animatedBook ? 12 + 12 * book.bookOpen : book.def.length;
    ch.handsAt = {
      [book.hand]: at,
      [book.hand === 'L' ? 'R' : 'L']: {
        x: at.x + aim.x * (length - turn * 8) * sc,
        y: at.y + aim.y * length * sc - turn * 4 * sc,
      },
    };
    book.aim = aim;
    book.aimLocal = null;
    c.look = 'target';
    c.lookTarget = { x: at.x + aim.x * length * 0.5 * sc, y: at.y + aim.y * length * 0.5 * sc };
    if(book.model3D){
      const forward=ch.dirToWorld(1,0),axes=readerBookAxes(forward);
      const pose:ModelPose={...axes,scale:sc,at:{x:n.x+forward.x*18*sc,y:n.y+(24-12*ready)*sc,z:n.z+forward.z*18*sc}};
      const main=book.hand==='R'?'right':'left',other=book.hand==='R'?'L':'R';
      const anchored=poseAtGrip(book.model3D,main,ch.body.j[book.hand==='R'?'handR':'handL'],axes,sc);
      ch.handsAt={
        [book.hand]:modelGrip(book.model3D,main,pose),
        [other]:modelGrip(book.model3D,book.model3D.grips.turn?'turn':other==='R'?'right':'left',anchored),
      };
      book.bookAxes=axes;book.aim=axes.front;
      const gaze=modelGrip(book.model3D,'spine',pose);
      c.lookTarget={x:gaze.x+axes.down.x*-10*sc,y:gaze.y+axes.down.y*-10*sc};
    }
    c.mood.s.boredom = Math.max(0, c.mood.s.boredom - dt / 300);
    if (this.phase === 'close') {
      if (book.bookOpen > 0.02) return false;
      ch.handsAt = null;
      ch.handTarget = null;
      book.bookReading = false;
      book.bookAxes = null;
      book.aim = null;
      this.seat?.stop(c);
      this.seat = null;
      if (ch.mode === 'sit') ch.standUp();
      if (this.shelf) {
        this.phase = 'return';
        this.phaseTime = 0;
        return false;
      }
      return true;
    }
    const elapsed = this.clock.elapsed;
    const due = this.clock.tick(c, dt);
    if (turned && (due || book.bookmark >= book.bookPages)) {
      this.phase = 'close';
      this.phaseTime = 0;
    } else if (this.pageTime < 0 && elapsed >= this.nextPage) {
      this.pageTime = 0;
      this.nextPage = elapsed + rand(14, 25);
    }
    return false;
  }
  private returnBook(c: Ctx) {
    if (!this.shelf || !this.book || this.shelf.held || Math.abs(this.shelf.tilt) > 0.35)
      return false;
    const used = [
      ...c.items.list
        .filter((i) => i !== this.book && i.shelf?.key === this.shelf!.storageKey)
        .map((i) => i.shelf!.slot),
      ...(c.peers?.() ?? [])
        .flatMap((v) => v.shelvedBooks ?? [])
        .filter((s) => s.key === this.shelf!.storageKey)
        .map((s) => s.slot),
    ];
    const slot = [0, 1, 2, 3, 4].find((i) => !used.includes(i));
    if (slot === undefined) return false;
    const at = this.shelf.toWorld(10 + slot * 15, 35);
    this.book.at = { ...at, z: 6 };
    this.book.dir = { x: 1, y: 0, z: 0 };
    c.items.drop(this.book, 0, 0);
    this.book.shelf = { key: this.shelf.storageKey, slot };
    return true;
  }
  stop(c: Ctx) {
    c.char.handsAt = null;
    c.char.handTarget = null;
    this.fetch?.stop(c);
    this.seat?.stop(c);
    this.seat = null;
    this.light.stop(c);
    if (c.char.mode === 'sit') c.char.standUp();
    if (this.book && !c.items.list.includes(this.book)) return;
    if (this.book) {
      this.book.bookTarget = 0;
      this.book.bookPage = 0;
      this.book.bookReading = false;
      this.book.bookAxes = null;
    }
    // Interruptions stow locally; completing the activity walks back to the shelf first.
    if (this.book?.where === 'hand' && !c.items.stow(this.book)) c.items.drop(this.book, 0, 0);
  }
}
