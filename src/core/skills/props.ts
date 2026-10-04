// Furniture activities, separated from combat and climbing.
import { Skill, arrive, type Ctx } from './context';
import type { Thing, PropDef } from '../props';
import type { SeatStyle } from '../character';
import { chance, pick, rand } from '../math';
import { Runner } from '../tv-game';

/** The props of a kind (seat, tv, ride, canvas) that are standing up on the floor, nearest first. */
export function propsOf(c: Ctx, use: PropDef['use']): Thing[] {
  const ch = c.char;
  return (c.props?.placed ?? []).filter((t) => t.def!.use === use && Math.abs(t.tilt) < 0.35 && !t.held)
    .sort((a, b) => Math.abs(a.center.x - ch.x) - Math.abs(b.center.x - ch.x));
}

/**
 * How he sits, his choice: up straight, leaning back, square to you (looking out of the screen), or,
 * on a couch, lying along it. Tired or low, he's more likely to sprawl.
 */
function seatStyle(c: Ctx, seat: Thing): SeatStyle {
  const L = c.mood.label, slump = L === 'sleepy' || L === 'sad' ? 2 : 1;
  const ways: [SeatStyle, number][] = seat.def!.id === 'couch'
    ? [['up', 1], ['lounge', 1.2 * slump], ['front', 1], ['lie', 0.8 * slump]]
    : [['up', 1.5], ['front', 1]];
  let r = Math.random() * ways.reduce((sum, [, w]) => sum + w, 0);
  for (const [style, w] of ways) if ((r -= w) <= 0) return style;
  return 'up';
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
      if (!ch.sitOn(at, this.face || (chance(0.5) ? 1 : -1), seatStyle(c, this.seat))) return true;
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

/**
 * Anything at the TV: he finds the couch (or a chair) near it, else sits on the floor in front of it,
 * and turns to face it. Subclasses decide what happens once he's settled.
 */
abstract class AtTheTV extends Skill {
  private sub: SitOnProp | null = null;
  private phase: 'go' | 'settled' = 'go';
  constructor(protected tv: Thing) { super(); }
  start(c: Ctx) {
    const tvx = this.tv.center.x;
    const seat = propsOf(c, 'seat').filter((s) => Math.abs(s.center.x - tvx) < 320 && Math.abs(s.center.x - tvx) > 40)
      .sort((a, b) => (b.def!.id === 'couch' ? 1 : 0) - (a.def!.id === 'couch' ? 1 : 0))[0];
    if (seat) { this.sub = new SitOnProp(seat, 3600, Math.sign(tvx - seat.center.x) as 1 | -1); this.sub.start(c); }
    c.look = 'target';
  }
  /** Getting there and staying put: 'go' on the way, 'settled' sitting and facing it, 'gone' if it fell apart. */
  protected settle(c: Ctx, dt: number): 'go' | 'settled' | 'gone' {
    const ch = c.char, tv = this.tv;
    if (!c.props?.things.includes(tv) || tv.held || Math.abs(tv.tilt) > 0.6) return 'gone';
    c.look = 'target'; c.lookTarget = tv.center;
    if (this.sub) {
      this.sub.t += dt;
      if (this.sub.update(c)) return 'gone';
      return ch.mode === 'sit' ? 'settled' : 'go';
    }
    if (this.phase === 'go') {
      if (this.t > 12) return 'gone';
      const spot = tv.center.x + (ch.x < tv.center.x ? -1 : 1) * 70 * ch.scale;
      if (!arrive(c, spot, 8)) return 'go';
      ch.facing = Math.sign(tv.center.x - ch.x) as 1 | -1;
      ch.sit();
      this.phase = 'settled';
    }
    return ch.mode === 'sit' ? 'settled' : 'gone';
  }
  stop(c: Ctx) {
    const tv = this.tv;
    tv.on = false; tv.arcade = null;
    c.char.gamepad = false; c.char.padMash = 0;
    this.sub?.stop(c);
    if (!this.sub && c.char.mode === 'sit') c.char.standUp();
  }
}

/** TV time: switches it on, watches his shows, reacts now and then. */
export class WatchTV extends AtTheTV {
  readonly name = 'watchtv';
  private next = 2;
  private watched = 0;
  private dur = rand(20, 40);
  update(c: Ctx, dt: number) {
    const s = this.settle(c, dt);
    if (s === 'gone') return true;
    if (s === 'go') return false;
    const tv = this.tv;
    if (!tv.on) { tv.on = true; c.sound?.('click', 0.5); }
    this.watched += dt;
    if (this.watched > this.next) {
      this.next = this.watched + rand(5, 10);
      c.say(pick(['haha', 'ooh', 'no way', 'lol', 'run, little guy!', 'this show is weird', 'he looks like me', '♪', 'again?', 'classic']), 1.6);
      c.mood.nudge({ boredom: -0.12, happiness: 0.02 });
    }
    return this.watched > this.dur;
  }
}

/** Video games on his own: controller in hand, his little runner game on the TV, and he takes it personally. */
export class PlayVideoGame extends AtTheTV {
  readonly name = 'videogame';
  private played = 0;
  private dur = rand(25, 45);
  private chatter = 6;
  update(c: Ctx, dt: number) {
    const s = this.settle(c, dt);
    if (s === 'gone') return true;
    if (s === 'go') return false;
    const ch = c.char, tv = this.tv;
    if (!tv.on || !tv.arcade) {
      tv.on = true;
      // Better at it when he's on form; worse when he's sleepy or upset.
      const L = c.mood.label;
      tv.arcade = new Runner(L === 'sleepy' || L === 'sad' ? 0.45 : L === 'angry' ? 0.55 : 0.8);
      c.sound?.('click', 0.5);
      if (chance(0.6)) c.say(pick(['game time', "let's go", 'ok. focus.']), 1.4);
    }
    ch.gamepad = true;
    const g = tv.arcade;
    for (const e of g.step(dt)) {
      if (e === 'crash') {
        c.say(pick(['NO', 'noooo', 'that was lag', 'come ON', 'ugh', 'it jumped late!']), 1.4);
        c.mood.nudge({ annoyance: 0.05, boredom: -0.05 });
      } else if (e === 'record') {
        c.say(pick(['new record!', 'YES', "let's GO"]), 1.6);
        c.mood.nudge({ happiness: 0.08 });
      } else {
        c.sound?.('click', 0.15);
        if (g.score === 8) c.say(pick(['ooh, a good run', "don't choke", 'easy']), 1.4);
      }
    }
    // Thumbs: busy as a block comes up, easy otherwise.
    const near = g.blocks.some((b) => b.x > g.x && b.x - g.x < 0.25);
    ch.padMash += ((near ? 1 : 0.25) - ch.padMash) * Math.min(1, dt * 8);
    this.played += dt;
    if (this.played > this.chatter) { this.chatter = this.played + rand(8, 14); c.mood.nudge({ boredom: -0.1, happiness: 0.02 }); }
    if (this.played > this.dur && g.crashedAt >= 0 && g.time - g.crashedAt < 1) {
      if (chance(0.5)) c.say(pick(['ok, one more— no. done.', 'enough for now', 'I was winning']), 1.6);
      return true;
    }
    return this.played > this.dur + 20;
  }
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
        ch.walkTo(this.dir > 0 ? deck.x2 + 25 * ch.scale : deck.x1 - 25 * ch.scale, false, true);
        if (chance(0.5)) c.say(pick(['again!', 'nice', 'that was fun']), 1.2);
      }
      return this.t > 6;
    }
    return this.t > 1.5 || (ch.ready && ch.support !== deck.id);
  }
  stop(c: Ctx) { c.char.handTarget = null; }
}
