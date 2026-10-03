// Furniture activities, separated from combat and climbing.
import { Skill, arrive, type Ctx } from './context';
import type { Thing } from '../props';
import { chance, pick, rand } from '../math';

/** The props of a kind (seat, tv, ride) that are standing up on the floor, nearest first. */
export function propsOf(c: Ctx, use: 'seat' | 'tv' | 'ride'): Thing[] {
  const ch = c.char;
  return (c.props?.placed ?? []).filter((t) => t.def!.use === use && Math.abs(t.tilt) < 0.35 && !t.held)
    .sort((a, b) => Math.abs(a.center.x - ch.x) - Math.abs(b.center.x - ch.x));
}

/** Sit down on a chair or a couch for a while (lean back on a couch). He falls off if you tip it over. */
export class SitOnProp extends Skill {
  readonly name = 'sitdown';
  private phase: 'go' | 'sit' = 'go';
  constructor(private seat: Thing, private dur = rand(10, 25), private face: 1 | -1 | 0 = 0, readonly why = '') { super(); }
  start(c: Ctx) { c.look = 'default'; }
  update(c: Ctx) {
    const ch = c.char, at = this.seat.seatAt;
    if (!at || !c.props?.things.includes(this.seat)) return true;
    if (this.phase === 'go') {
      if (this.t > 12) return true;
      if (!arrive(c, at.x, 5)) return false;
      const lounge = this.seat.def!.id === 'couch' && chance(0.5);
      if (!ch.sitOn(at, this.face || (chance(0.5) ? 1 : -1), lounge)) return true;
      this.phase = 'sit'; this.t = 0;
      if (chance(0.5)) c.say(pick(this.seat.def!.id === 'couch' ? ['ahh', 'comfy', '*flop*'] : ['ahh', 'nice chair', 'much better']), 1.4);
      return false;
    }
    if (ch.mode !== 'sit' || !ch.seat) return true;
    // The seat moved: so does he. Tipped over or yanked away: he falls off.
    const prev = ch.seat;
    if (Math.abs(this.seat.tilt) > 0.6 || Math.hypot(at.x - prev.x, at.y - prev.y) > 18 * ch.scale) {
      ch.standUp(); ch.poke('hip', (at.x - prev.x) * 20, -100);
      c.say(pick(['WHOA', 'hey!', 'my seat!']), 1.2);
      return true;
    }
    ch.seat = at;
    if (this.t > this.dur) { ch.standUp(); return true; }
    return false;
  }
  stop(c: Ctx) { if (c.char.mode === 'sit' && c.char.seat) c.char.standUp(); }
}

/** TV time: on the couch (or a chair) if there's one near the TV, else on the floor in front of it. Switches it on, watches, reacts. */
export class WatchTV extends Skill {
  readonly name = 'watchtv';
  private sub: SitOnProp | null = null;
  private phase: 'go' | 'watch' = 'go';
  private next = 2;
  private dur = rand(20, 40);
  constructor(private tv: Thing) { super(); }
  start(c: Ctx) {
    const tvx = this.tv.center.x;
    const seat = propsOf(c, 'seat').filter((s) => Math.abs(s.center.x - tvx) < 320 && Math.abs(s.center.x - tvx) > 40)
      .sort((a, b) => (b.def!.id === 'couch' ? 1 : 0) - (a.def!.id === 'couch' ? 1 : 0))[0];
    if (seat) { this.sub = new SitOnProp(seat, this.dur, Math.sign(tvx - seat.center.x) as 1 | -1); this.sub.start(c); }
    c.look = 'target';
  }
  update(c: Ctx, dt: number) {
    const ch = c.char, tv = this.tv;
    if (!c.props?.things.includes(tv) || Math.abs(tv.tilt) > 0.6) { tv.on = false; return true; }
    c.lookTarget = tv.center;
    if (this.sub) {
      this.sub.t += dt;
      if (this.sub.update(c)) { tv.on = false; return true; }
      if (ch.mode === 'sit') this.watch(c);
      return false;
    }
    const spot = tv.center.x + (ch.x < tv.center.x ? -1 : 1) * 70 * ch.scale;
    if (this.phase === 'go') {
      if (this.t > 12) return true;
      if (!arrive(c, spot, 8)) return false;
      ch.facing = Math.sign(tv.center.x - ch.x) as 1 | -1;
      ch.sit();
      this.phase = 'watch'; this.t = 0;
      return false;
    }
    if (ch.mode !== 'sit') { tv.on = false; return true; }
    this.watch(c);
    if (this.t > this.dur) { tv.on = false; ch.standUp(); return true; }
    return false;
  }
  /** On, and reacting to what's on now and then. */
  private watch(c: Ctx) {
    const tv = this.tv;
    if (!tv.on) { tv.on = true; c.sound?.('click', 0.5); }
    if (this.t > this.next) {
      this.next = this.t + rand(5, 10);
      c.say(pick(['haha', 'ooh', 'no way', 'lol', 'run, little guy!', 'this show is weird', 'he looks like me', '♪', 'again?', 'classic']), 1.6);
      c.mood.nudge({ boredom: -0.12, happiness: 0.02 });
    }
  }
  stop(c: Ctx) { this.tv.on = false; this.sub?.stop(c); if (!this.sub && c.char.mode === 'sit') c.char.standUp(); }
}

/** Scooter time: hop on, hold the handlebar, kick off a few times, roll across the screen, brake, hop off. */
export class RideScooter extends Skill {
  readonly name = 'ride';
  private phase: 'go' | 'ride' | 'brake' | 'off' = 'go';
  private next = 0;
  private kicks = 0;
  private dir: 1 | -1 = 1;
  constructor(private sc: Thing) { super(); }
  private deck() { return this.sc.platforms.reduce<import('../physics').Platform | null>((a, p) => (!a || p.x2 - p.x1 > a.x2 - a.x1 ? p : a), null); }
  update(c: Ctx) {
    const ch = c.char, s = this.sc, deck = this.deck();
    if (!deck || !c.props?.things.includes(s)) return true;
    const speed = (s.points[0].x - s.points[0].px) * 120;
    if (this.phase === 'go') {
      if (this.t > 12) return true;
      if (ch.support === deck.id) {
        const b = c.world.bounds;
        this.dir = b.right - deck.x2 > deck.x1 - b.left ? 1 : -1;
        ch.facing = this.dir;
        this.phase = 'ride'; this.t = 0; this.next = 0.3;
        c.say(pick(['wheee', 'zoom', 'beep beep', "let's ride"]), 1.2);
        return false;
      }
      if (!arrive(c, (deck.x1 + deck.x2) / 2, 4)) return false;
      return false;
    }
    if (ch.support !== deck.id) return this.t > 0.5 ? (ch.handTarget = null, true) : false; // fell off
    const bar = s.def?.bar ? s.toWorld(s.def.bar[0], s.def.bar[1]) : null;
    ch.handTarget = bar;
    const b = c.world.bounds, room = this.dir > 0 ? b.right - deck.x2 : deck.x1 - b.left;
    if (this.phase === 'ride') {
      if (this.t > this.next && this.kicks < 5 && room > 220) {
        // A kick off the floor: the scooter speeds up (and he goes with it).
        this.next = this.t + 1.1; this.kicks++;
        const v = Math.min(Math.abs(speed) + 150, 380) * this.dir;
        for (const p of s.points) p.px = p.x - v / 120;
        c.sound?.('step', 1);
      }
      if (room < 220 || (this.kicks >= 5 && Math.abs(speed) < 40)) { this.phase = 'brake'; this.t = 0; }
      return this.t > 20;
    }
    if (this.phase === 'brake') {
      for (const p of s.points) p.px += (p.x - p.px) * 0.08;
      if (Math.abs(speed) < 8) {
        ch.handTarget = null;
        this.phase = 'off'; this.t = 0;
        ch.walkTo(deck.x1 - this.dir * 25 * ch.scale, false, true);
        if (chance(0.5)) c.say(pick(['again!', 'nice', 'that was fun']), 1.2);
      }
      return this.t > 6;
    }
    return this.t > 1.5 || (ch.ready && ch.support !== deck.id);
  }
  stop(c: Ctx) { c.char.handTarget = null; }
}

