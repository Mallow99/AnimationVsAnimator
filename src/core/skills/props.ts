import { ActivityClock, activitySeconds, restlessness } from '../activity-pacing';
// Furniture activities, separated from combat and climbing.
import { Skill, arrive, type Ctx } from './context';
import type { Thing, PropDef } from '../props';
import type { SeatStyle } from '../character';
import { chance, pick, rand } from '../math';
import { Runner } from '../tv-game';
import { seatedTalk } from './together';

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

/**
 * Sit down on a chair or a couch for a while (lean back on a couch). He falls off if you tip it over.
 * Someone already there: on a couch he sits next to them (they scoot over); a chair that's taken, he doesn't.
 */
export class SitOnProp extends Skill {
  readonly name = 'sitdown';
  private phase: 'go' | 'sit' = 'go';
  private style: SeatStyle = 'up';
  private lastMid: { x: number; y: number } | null = null;
  private talk = { at: 6 + Math.random() * 6 };
  constructor(private seat: Thing, private dur: number | null = null, private face: 1 | -1 | 0 = 0, readonly why = '') { super(); }
  start(c: Ctx) {
    c.look = 'default';
    this.dur ??= activitySeconds(c, 'sitdown');
    this.style = seatStyle(c, this.seat);
    // Lying along the couch needs it to himself.
    if (this.style === 'lie' && this.seat.sitters.size) this.style = 'lounge';
  }
  update(c: Ctx) {
    const ch = c.char, seat = this.seat;
    if (!seat.seatAt || !c.props?.things.includes(seat)) return true;
    if (this.phase === 'go') {
      if (this.t > 12) return true;
      if (!seat.claimSeat(c.who, ch.x, this.style === 'lie')) { if (this.t < 0.1) c.say(pick(['taken.', 'oh, you\'re there']), 1.2); return true; }
      const at = seat.seatFor(c.who)!;
      if (!arrive(c, at.x, 5)) return false;
      if (!ch.sitOn(at, this.face || (chance(0.5) ? 1 : -1), this.style)) return true;
      this.phase = 'sit'; this.t = 0; this.lastMid = seat.seatAt;
      if (chance(0.5)) c.say(pick(seat.def!.id === 'couch' ? ['ahh', 'comfy', '*flop*'] : ['ahh', 'nice chair', 'much better']), 1.4);
      return false;
    }
    if (ch.mode !== 'sit' || !ch.seat) return true;
    // The seat itself moved a lot (shoved, picked up) or tipped over: he falls off. His spot on it changing
    // (someone sat down next to him) just means he scoots over.
    const mid = seat.seatAt!, was = this.lastMid ?? mid;
    this.lastMid = mid;
    if (Math.abs(seat.tilt) > 0.6 || Math.hypot(mid.x - was.x, mid.y - was.y) > 6 * ch.scale || seat.held) {
      ch.standUp(); ch.poke('hip', (mid.x - was.x) * 60, -100);
      c.say(pick(['WHOA', 'hey!', 'my seat!']), 1.2);
      return true;
    }
    const at = seat.seatFor(c.who)!;
    ch.seat = { x: ch.seat.x + (at.x - ch.seat.x) * 0.12, y: at.y };
    // Someone wants to sit too: up he gets from lying along it, and leans back instead.
    if (ch.seatStyle === 'lie' && seat.sitters.get(c.who)?.lying === false) { ch.seatStyle = 'lounge'; c.say(pick(['oh, ok', 'fine, sit', '*scoots*']), 1.2); }
    // Sharing the couch: a bit of small talk now and then.
    if (seat.sitters.size > 1) seatedTalk(c, this.t, this.talk);
    if (this.t > (this.dur ?? 90)) { ch.standUp(); return true; }
    return false;
  }
  stop(c: Ctx) { this.seat.leaveSeat(c.who); if (c.char.mode === 'sit' && c.char.seat) c.char.standUp(); }
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
    const seat = propsOf(c, 'seat').filter((s) => Math.abs(s.center.x - tvx) < 320 && Math.abs(s.center.x - tvx) > 40 && (s.sitters.has(c.who) || s.sitters.size < s.seatRoom))
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
      if (this.sub.update(c)) {
        // (The seat filled up on the way: the floor in front of the TV, then.)
        if (this.sub.t < 0.2 && ch.mode !== 'sit') { this.sub = null; return 'go'; }
        return 'gone';
      }
      if (ch.mode === 'sit') tv.watchers.add(c.who);
      return ch.mode === 'sit' ? 'settled' : 'go';
    }
    if (this.phase === 'go') {
      if (this.t > 12) return 'gone';
      // (Someone else already on the floor there: a bit further along.)
      const others = [...tv.watchers].filter((w) => w !== c.who).length;
      const spot = tv.center.x + (ch.x < tv.center.x ? -1 : 1) * (70 + others * 34) * ch.scale;
      if (!arrive(c, spot, 8)) return 'go';
      ch.facing = Math.sign(tv.center.x - ch.x) as 1 | -1;
      ch.sit();
      this.phase = 'settled';
      tv.watchers.add(c.who);
    }
    return ch.mode === 'sit' ? 'settled' : 'gone';
  }
  stop(c: Ctx) {
    const tv = this.tv;
    // Off only if nobody else is still watching.
    tv.watchers.delete(c.who);
    if (!tv.watchers.size) { tv.on = false; tv.arcade = null; tv.board = null; }
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
  private clock = new ActivityClock('watchtv');
  update(c: Ctx, dt: number) {
    const s = this.settle(c, dt);
    if (s === 'gone') return true;
    if (s === 'go') return false;
    const tv = this.tv;
    if (!tv.on) { tv.on = true; c.sound?.('click', 0.5); }
    this.watched += dt;
    if (this.watched > this.next) {
      this.next = this.watched + rand(45, 100) * (1.5 - restlessness(c));
      c.say(pick(['haha', 'ooh', 'no way', 'lol', 'run, little guy!', 'this show is weird', 'he looks like me', '♪', 'again?', 'classic']), 1.6);
      c.mood.nudge({ boredom: -0.12, happiness: 0.02 });
    }
    c.mood.s.boredom = Math.max(0, c.mood.s.boredom - dt / 500);
    return this.clock.tick(c, dt);
  }
}

/**
 * Video games: controller in hand, his little runner game on the TV, and he takes it personally. If his
 * friend's already playing, he grabs the other controller: split screen, player two, and trash talk.
 */
export class PlayVideoGame extends AtTheTV {
  readonly name = 'videogame';
  private played = 0;
  private clock = new ActivityClock('videogame');
  private readyToFinish = false;
  private chatter = 6;
  private mine: Runner | null = null;
  update(c: Ctx, dt: number) {
    const s = this.settle(c, dt);
    if (s === 'gone') return true;
    if (s === 'go') return false;
    const ch = c.char, tv = this.tv, me = c.who;
    // Better at it when he's on form; worse when he's sleepy or upset.
    const L = c.mood.label, skill = L === 'sleepy' || L === 'sad' ? 0.45 : L === 'angry' ? 0.55 : 0.8;
    if (!this.mine || (tv.arcade !== this.mine && tv.arcade2 !== this.mine)) {
      tv.on = true; tv.board = null;
      if (tv.arcade && tv.players.length === 1 && tv.players[0] !== me) {
        // His friend's playing: player two.
        this.mine = tv.arcade2 = new Runner(skill);
        tv.players.push(me);
        c.say(pick(['player two!', 'move over', 'I got next', 'you\'re going down']), 1.4);
      } else if (!tv.arcade || !tv.players.length) {
        this.mine = tv.arcade = new Runner(skill);
        tv.arcade2 = null; tv.players = [me];
        if (chance(0.6)) c.say(pick(['game time', "let's go", 'ok. focus.']), 1.4);
      } else return this.t > 3; // two already playing: he just watches (and gives up after a moment)
      c.sound?.('click', 0.5);
    }
    ch.gamepad = true;
    const g = this.mine, other = g === tv.arcade ? tv.arcade2 : tv.arcade;
    for (const e of g.step(dt)) {
      if (e === 'crash') {
        c.say(other && other.score > 2 ? pick(['NO', 'you got lucky', 'stop looking at my screen']) : pick(['NO', 'noooo', 'that was lag', 'come ON', 'ugh', 'it jumped late!']), 1.4);
        c.mood.nudge({ annoyance: 0.05, boredom: -0.05 });
      } else if (e === 'record') {
        c.say(pick(['new record!', 'YES', "let's GO"]), 1.6);
        c.mood.nudge({ happiness: 0.08 });
      } else {
        c.sound?.('click', 0.15);
        if (g.score === 8) c.say(pick(['ooh, a good run', "don't choke", 'easy']), 1.4);
        // Ahead of him by a few after his crash: rub it in.
        if (other && other.crashedAt >= 0 && other.time - other.crashedAt < 0.3 && g.score > 3) c.say(pick(['HA', 'too slow', 'git gud']), 1.2);
      }
    }
    // Thumbs: busy as a block comes up, easy otherwise.
    const near = g.blocks.some((b) => b.x > g.x && b.x - g.x < 0.25);
    ch.padMash += ((near ? 1 : 0.25) - ch.padMash) * Math.min(1, dt * 8);
    this.played += dt;
    if (this.played > this.chatter) { this.chatter = this.played + rand(45, 100) * (1.5 - restlessness(c)); c.mood.nudge({ boredom: -0.1, happiness: 0.02 }); if (other) c.feel.bond = Math.min(1, c.feel.bond + 0.01); }
    this.readyToFinish = this.clock.tick(c, dt);
    if (this.readyToFinish && g.crashedAt >= 0 && g.time - g.crashedAt < 1) {
      if (chance(0.5)) c.say(pick(['ok, one more— no. done.', 'enough for now', 'I was winning']), 1.6);
      return true;
    }
    return this.readyToFinish && this.played > activitySeconds(c, 'videogame', 1.1) + 30;
  }
  stop(c: Ctx) {
    const tv = this.tv, me = c.who;
    if (tv.players.includes(me)) {
      // Player one leaves: player two's game becomes the whole screen.
      if (tv.players[0] === me && tv.arcade2) { tv.arcade = tv.arcade2; tv.arcade2 = null; tv.players = tv.players.slice(1); }
      else if (tv.players[0] === me) { tv.players = []; }
      else { tv.arcade2 = null; tv.players = tv.players.filter((p) => p !== me); }
    }
    super.stop(c);
    if (!tv.watchers.size) { tv.players = []; tv.arcade2 = null; }
  }
}

/**
 * Othello with you, on the TV's console. He asks; you choose whether to join in the game window.
 * The board shows on the TV too. Interruptions close it cleanly.
 */
export class PlayBoardGame extends AtTheTV {
  readonly name = 'playgame';
  private offered = false;
  private reacted = false;
  private revision = -1;
  private activeAt = 0;
  private mashUntil = 0;
  update(c: Ctx, dt: number) {
    if (!c.game) return true;
    const s = this.settle(c, dt);
    if (s === 'gone') return true;
    if (s === 'go') return !this.offered && this.t > 15;
    const ch = c.char, tv = this.tv, game = c.game;
    if (!this.offered) {
      if (!game.invite()) return true;
      this.offered = true; this.activeAt = c.world.time;
      tv.on = true; tv.arcade = null; tv.board = game.board;
      c.sound?.('click', 0.5);
      c.say('wanna play a round?', 2);
    }
    ch.gamepad = true;
    tv.on = true; tv.board = game.board;
    game.anchor = tv.toWorld(tv.def!.screen ? tv.def!.screen[0] + tv.def!.screen[2] / 2 : 0, 0);
    if (this.revision !== game.revision) {
      this.revision = game.revision; this.activeAt = c.world.time;
      // His move (or yours) lands: thumbs on the buttons for a moment.
      if (game.lastMove >= 0) { this.mashUntil = c.world.time + 0.5; c.sound?.('click', 0.35); }
    }
    ch.padMash = c.world.time < this.mashUntil || (game.state === 'playing' && game.turn === 'him') ? 1 : 0.1;
    if (game.state === 'finished' && !this.reacted) {
      this.reacted = true;
      c.say(game.result === 'you' ? 'rematch?' : game.result === 'him' ? 'ha! got you' : 'draw. again?', 2);
      c.mood.nudge({ boredom: -0.15, happiness: 0.03 });
    }
    if (game.state === 'playing') this.reacted = false;
    return game.state === 'closed' || c.world.time - this.activeAt > (game.state === 'invite' ? 45 : 900);
  }
  stop(c: Ctx) {
    if (this.offered) c.game?.close();
    super.stop(c);
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
      // The complete wheel art now supports the scooter, so its deck is too high to walk through.
      // Make the advertised hop explicit instead of waiting forever underneath the deck.
      if (ch.ready) ch.jump(((deck.x1 + deck.x2) / 2 - ch.x) * 5, -300 * ch.scale);
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
