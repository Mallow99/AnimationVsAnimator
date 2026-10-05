// Sword fighting his friend, with a fighting "CPU" in his head so it's worth watching even offline.
//
// A fight has a rhythm, like the ones in the cartoons: they circle just out of reach (guard up, changing
// height, feinting, drifting a little in depth), then one of them commits to an exchange (a few quick
// moves, answered with parries, blocks, dodges and counters, blades clashing), then they break apart
// (a hop or a backflip out), catch their breath, and circle again. Moves come from swordplay.ts.
//
// What he does depends on what he reads in the other one (a FighterView, see peer.ts): an attack winding
// up (block it at the right height, parry it at the last moment, jump back, jump over a sweep, or trade),
// someone staggered (punish them: the big moves), someone who keeps blocking (a heavy cut breaks a guard,
// a sweep goes under it, a kick shoves them off it), someone in the air (a rising cut, or meet them in the
// air), his own back to the wall (vault over them, or dash past). His mood is his style: angry = fast and
// reckless, scared = defensive, playful = showy, sleepy = slow.
//
// Health decides it (see Pet.takeHit): clean hits take it, blocks and parries only cost poise. He doesn't
// get knocked down every few seconds: most hits make him skid or fly and land on his feet. When someone's
// health runs out it's a knockout (slow motion), and the fight's over. Always with swords: foam ones in a
// play fight, katanas in a real one. Lose it (disarmed) and he goes and gets it back.
import { Skill, type Ctx } from './context';
import type { Item } from '../items';
import type { FighterView } from '../peer';
import { chance, clamp, pick, rand } from '../math';
import { HIT_HEIGHT } from '../fighting';
import { currentKey, guardPose, MOVES, SwordMove, type MoveName } from './swordplay';
import { chooseExchange, type CombatGoal } from '../combat/tactics';
import { ShootGun } from './gun';
import { ShootBow } from './archery';

type Height = 'mid' | 'high' | 'low';
export class Duel extends Skill {
  readonly name = 'duel';
  /** Always with swords now (the constructor still takes the old armed flag, so callers don't change). */
  readonly armed = true;
  private sword: Item | null = null;
  private twoHand = false;
  private phase: 'draw' | 'fight' | 'fetch' | 'fists' = 'draw';
  private move: SwordMove | null = null;
  private plan: MoveName[] = [];
  private tempo: 'circle' | 'press' | 'break' = 'circle';
  private tempoUntil = 0;
  private height: Height = 'mid';
  private blockUntil = 0;
  private blockHeight: Height = 'mid';
  private think = 0.3;
  /** Which of the other one's attacks he's already reacted to. */
  private reacted = false;
  private blocksSeen = 0;
  private reaction = 0.2;
  private aggression = 0.55;
  /** How good his parries are (0..1): timing a parry is hard. */
  private finesse = 0.5;
  private showy = 0.3;
  private dur = rand(70, 100);
  private ending = -1;
  private drawT = 0;
  private zSeed = rand(0, 6);
  private said = 0;
  /** The other one's health last time he looked (to notice his own hits landing). */
  private theirHp = 1;
  private foeGone = 0;
  /** Shooting his bow (at range), and when he last did. */
  private shooting: ShootBow | ShootGun | null = null;
  private shotAt = -10;
  private hasBow = false;
  hits = 0;
  goal: CombatGoal='probe';
  private lastAttack: MoveName|null=null;
  constructor(_armed = true, readonly why = '') { super(); }

  start(c: Ctx) {
    const ch = c.char, real = c.fightMode === 'real', foe = c.foe?.(), L = c.mood.label;
    c.look = 'target';
    ch.hp = 1; ch.poise = 1; ch.stagger = 0;ch.poiseDelay=0;ch.breakCount=0;
    // His mood is his fighting style.
    this.reaction = L === 'angry' ? 0.14 : L === 'sleepy' || L === 'sad' ? 0.3 : L === 'scared' ? 0.17 : 0.2;
    this.aggression = L === 'angry' ? 0.85 : L === 'scared' ? 0.3 : L === 'playful' ? 0.6 : 0.5;
    this.finesse = L === 'angry' ? 0.3 : L === 'scared' ? 0.6 : 0.5;
    this.showy = real ? 0.05 : L === 'playful' || c.mood.emotion === 'excited' ? 0.6 : 0.3;
    if(c.personality==='competitive'){this.aggression+=0.12;this.showy+=0.15;}
    if(c.personality==='gentle'){this.finesse+=0.2;this.aggression-=0.1;}
    this.sword = this.pickSword(c);
    // (No room on his belt for it: straight into his hand.)
    if (this.sword?.where === 'world' && ch.useHand) c.items.toHand(this.sword, ch.useHand);
    this.twoHand = !!this.sword?.def.cuts; // a katana takes both hands; a foam sword is a fencer's one hand
    // And his bow, for when they're far apart (suction-cup arrows in a play fight).
    this.hasBow = !!(c.items.list.find((it) => it.def.use === 'shoot' && it.where !== 'cursor') ?? c.items.give('bow', ch));
    c.say(real ? pick(['draw.', "this time it's real", '...', `${foe?.name ?? 'you'}. now.`]) : pick(['en garde!', 'spar?', 'square up', 'have at you!', `come on ${foe?.name ?? ''}`.trim()]), 1.4);
  }

  /** Real fights are katanas; play fights are his foam sword, or his wooden one if that's what he has. */
  private pickSword(c: Ctx): Item | null {
    const real = c.fightMode === 'real';
    // His own (on his belt, in his hand, or lying around: not one you're holding), else a new one.
    const usable = (id: string) => c.items.list.find((it) => (it.def.id === id || it.def.id === `ink-${id}`) && it.where !== 'cursor') ?? null;
    const it = real ? usable('katana') ?? c.items.give('katana', c.char) : usable('foam-sword') ?? usable('sword') ?? c.items.give('foam-sword', c.char);
    return !it || it.def.wear ? null : it;
  }

  /** Calling it: what he says depends on how it went. */
  private finish(c: Ctx, how: 'won' | 'lost' | 'time' | 'cut') {
    const ch = c.char, real = c.fightMode === 'real';
    this.endPose(c);
    this.ending = this.t + 1.8;
    if (how === 'won') { c.say(real ? pick(['yield.', 'it is done.', 'hmph.']) : pick(['K.O.!', 'I WIN', 'flawless', 'GG ez', 'and STAY down']), 1.8); if (!real && ch.ready) ch.doGesture('laugh'); c.mood.nudge({ happiness: 0.12, boredom: -0.3 }); }
    else if (how === 'lost') { c.say(real ? pick(['...', 'next time.']) : pick(['ow ow ow', 'ok ok you win', 'rematch.', 'lucky']), 1.8); c.mood.nudge({ happiness: -0.05, annoyance: 0.08, boredom: -0.3 }); }
    else if (how === 'cut') c.say(pick(['...enough.', 'you need a hand?', 'stay there.']), 1.6);
    else c.say(real ? pick(['...enough.', 'another time.']) : pick(['draw!', 'good fight', 'GG', 'truce?']), 1.6);
  }

  private endPose(c: Ctx) {
    const ch = c.char;
    this.move = null;
    ch.guard = false; ch.faceLock = null; ch.fightPose = null; ch.fightVX = null; ch.fightZ = null; ch.handTarget = null;
    if (this.sword) this.sword.aimLocal = null;
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, foe = c.foe?.();
    if (!foe) return true;
    const fj = foe.joints, sc = ch.scale;
    if (fj.neck) c.lookTarget = { x: fj.neck.x, y: fj.neck.y };
    if (this.ending >= 0) {
      // Sword away (over his shoulder, or on his hip), and done.
      const it = this.sword;
      if (it?.where === 'hand' && ch.mode === 'ground') {
        const slot = c.items.slotPose(ch, 2).at;
        ch.handTarget = { x: slot.x, y: slot.y };
        if (this.t > this.ending - 0.9) { ch.handTarget = null; c.items.stow(it); c.sound?.('pickup', 0.6); }
      }
      return this.t > this.ending;
    }
    // How it ends: a knockout, a limb off (a real fight), or taking too long.
    if (foe.hp <= 0) { if (ch.mode === 'ground' || ch.mode === 'air') { this.finish(c, 'won'); } return false; }
    if (ch.hp <= 0) { this.endPose(c); if (ch.mode === 'ground') { this.finish(c, 'lost'); } return false; }
    if (!foe.whole && c.fightMode === 'real') { if (ch.mode === 'ground') this.finish(c, 'cut'); return false; }
    if (this.t > this.dur) { if (ch.mode === 'ground') this.finish(c, 'time'); return false; }
    // He stopped fighting (called it, or wandered off): so does this one.
    this.foeGone = foe.doing === 'duel' ? 0 : this.foeGone + dt;
    if (this.foeGone > 1.2 && this.t > 3) { if (ch.mode === 'ground') this.finish(c, 'time'); return this.foeGone > 12; }
    // Sitting (or lying) when it started: up he gets.
    if ((ch.mode === 'sit' || ch.mode === 'lie') && !ch.stayDown) ch.standUp();
    if (foe.hp < this.theirHp - 0.01) this.hits++;
    this.theirHp = foe.hp;

    const dx = foe.x - ch.x, dist = Math.abs(dx), dir = (Math.sign(dx) || ch.facing) as 1 | -1;
    const it = this.sword;
    // Shooting: that plays out (his sword's on his belt meanwhile; he draws it again after).
    if (this.shooting) {
      this.shooting.t += dt;
      if (!this.shooting.update(c, dt)) return false;
      this.shooting.stop(c); this.shooting = null; this.shotAt = this.t;
      this.setTempo('circle', rand(0.3, 0.8));
    }
    // A move in progress plays out (it ends itself if he gets hit out of it).
    if (this.move) {
      if (!this.move.update(c, dt)) return false;
      const done = this.move.name;
      this.move = null;
      ch.fightVX = null;
      if (!this.plan.length && this.tempo === 'press') this.setTempo('break', rand(0.5, 1.1));
      if (done === 'dash') ch.faceLock = dir; // he's on the other side now: turn round
    }
    // Where's my sword?
    if (!it || it.where === 'cursor') this.phase = 'fists';
    else if (it.where === 'world') { if (this.phase !== 'fetch') { this.phase = 'fetch'; c.say(pick(['my sword!', 'oops', 'hold on', 'WAIT']), 1.2); } }
    else if (it.where === 'belt' && this.phase !== 'draw') { this.phase = 'draw'; this.drawT = 0; }
    else if (it.where === 'hand' && (this.phase === 'fetch' || this.phase === 'fists')) { this.phase = 'fight'; this.startMove(c, 'twirl'); return false; }

    if (ch.mode !== 'ground') {
      // In the air (knocked up, jumping): keep the guard up so the sword doesn't flop.
      ch.fightVX = null;
      if (it?.where === 'hand' && this.phase === 'fight') guardPose(c, it, 'mid', false, this.twoHand);
      return false;
    }
    if (this.phase !== 'draw' && this.phase !== 'fetch') ch.faceLock = dir;
    switch (this.phase) {
      case 'draw': return this.drawSword(c, dt);
      case 'fetch': return this.fetchSword(c, foe);
      case 'fists': return this.fists(c, foe, dist, dir);
    }
    if (!it || it.where !== 'hand') return false;
    if (ch.stagger > 0 || ch.hitstun > 0) { ch.fightVX = null; guardPose(c, it, 'low', false, this.twoHand); return false; }

    // ── Reading him ──
    const R = this.reach('cut', ch.scale);
    const fm = foe.move, theirR = ['shoot','gun'].includes(fm?.name??'') ? Infinity : (fm && fm.name in MOVES ? MOVES[fm.name as MoveName].reach * sc : R) * 1.15;
    if (!fm) this.reacted = false;
    if (foe.block) this.blocksSeen = Math.min(6, this.blocksSeen + dt * 2); else this.blocksSeen = Math.max(0, this.blocksSeen - dt * 0.5);
    // Defense: an attack coming that can reach him.
    if (fm && fm.windup && !this.reacted && dist < theirR && fm.hitIn < this.reaction + 0.25) {
      this.reacted = true;
      if (this.defend(c, foe, fm, dir)) return false;
    }
    if (this.t < this.blockUntil) {
      guardPose(c, it, this.blockHeight, true, this.twoHand);
      ch.fightVX = dist < R * 0.8 ? -dir * 60 * sc : 0;
      return false;
    }

    // ── Choosing ──
    if (this.t >= this.think) {
      this.think = this.t + this.reaction * rand(0.7, 1.3);
      this.decide(c, foe, dist, dir, R);
      if (this.move) return false;
    }
    // ── Footwork: hold a distance (depends on the tempo), bouncing in and out a little ──
    // (Circling, the blade tips just about touch; breaking off, well clear; pressing, just inside the next move's reach.)
    let want = this.tempo === 'circle' ? R * 1.3 : this.tempo === 'break' ? R * 1.9 : this.plan.length ? this.reach(this.plan[0], sc) * 0.68 : R;
    want += Math.sin(this.t * 2.4 + this.zSeed) * 7 * sc;
    if (foe.mode === 'ragdoll' || foe.mode === 'getup' || foe.mode === 'lie') want = Math.max(want, R * 2); // he's down: give him room
    const err = dist - want;
    // Pressing, he closes in decisively; circling, he gives ground only slowly (so the attacker gets there).
    const pressing = this.tempo === 'press' && this.plan.length > 0;
    ch.fightVX = Math.abs(err) < 4 * sc ? 0 : pressing && err > 0 ? dir * clamp(err * 7, 140, 320) * sc
      : dir * clamp(err * 5, (this.tempo === 'circle' ? -80 : -150) * sc, 130 * sc);
    // Drifting a little in depth while they circle (so it isn't all on one line).
    ch.fightZ = this.tempo === 'circle' ? Math.sin(this.t * 0.8 + this.zSeed) * 9 * sc : 0;
    // Pressing: in range of the next move? Go.
    if (this.tempo === 'press' && this.plan.length) {
      const next = this.plan[0];
      if (dist <= this.reach(next, sc) * 0.82 && dist > this.reach(next, sc) * 0.35) { this.plan.shift(); this.startMove(c, next); return false; }
      // Taking too long to get there (he keeps backing off): go for the long ones instead.
      if (this.t > this.tempoUntil - 0.4 && next !== 'thrust' && next !== 'dash') this.plan[0] = dist < this.reach('thrust', sc) * 1.05 ? 'thrust' : 'dash';
    }
    guardPose(c, it, this.height, false, this.twoHand);
    return false;
  }

  /** How far a move reaches from his hips (px), with this sword. */
  private reach(m: MoveName | 'cut', sc: number) {
    const len = this.sword?.def.length ?? 34;
    return (MOVES[m].reach + (len - 34) * 0.9) * sc;
  }

  private startMove(c: Ctx, m: MoveName) {
    if (!this.sword || this.sword.where !== 'hand') return;
    this.move = new SwordMove(m, this.sword, currentKey(c), this.twoHand);
    if(MOVES[m].power>0)this.lastAttack=m;
    if (m !== 'parry' && m !== 'twirl' && m !== 'draw') c.sound?.('whoosh', 0.6);
  }

  private setTempo(t: 'circle' | 'press' | 'break', time: number) { this.tempo = t; this.tempoUntil = this.t + time; }

  /**
   * His answer to an attack he sees coming: parry it (if he's good and lucky with the timing), block it at
   * the right height, get out of the way (hop back, backflip, jump over a sweep), or swing back and trade.
   */
  private defend(c: Ctx, foe: FighterView, fm: NonNullable<FighterView['move']>, dir: 1 | -1): boolean {
    const ch = c.char, h = HIT_HEIGHT[fm.name] ?? 'mid';
    // He doesn't always see it coming (less often when he's quick), and sometimes reads the height wrong.
    if (chance(0.22 + this.reaction * 0.6)) return false;
    const guess: Height = chance(0.75) ? h : pick(['mid', 'high', 'low'] as Height[]);
    if (this.move && this.move.t > this.move.def.windup) return false; // already swinging (or showing off): let it ride
    const r = Math.random(), p = 0.25 + this.finesse * 0.25, cautious = 1 - this.aggression;
    if (fm.name === 'shoot' || fm.name==='gun') {
      // An arrow's coming: sword up across it (it glances off), or out of the way, or charge him while he's drawing.
      const dist = Math.abs(foe.x - ch.x), flight = dist / 900;
      if (r < 0.5) { this.move = null; this.blockHeight = 'mid'; this.blockUntil = this.t + fm.hitIn + flight + 0.25; }
      else if (r < 0.75 && ch.whole) { this.move = null; if (chance(0.5)) ch.flipJump(-1, -dir * 160, -560); else ch.leap(dir * 120, -520); }
      else if (dist > this.reach('dash', ch.scale) * 0.6 && dist < this.reach('dash', ch.scale) * 1.4) this.startMove(c, 'dash');
      return true;
    }
    if (fm.name === 'sweep' || (guess === 'low' && fm.name === 'rising' && chance(0.3))) {
      // Over it.
      this.move = null;
      ch.leap(-dir * 60, -560);
      return true;
    }
    if (r < p && fm.name !== 'spin') {
      // Parry: timed to meet it.
      this.move = null;
      this.startMove(c, 'parry');
      return true;
    }
    if (r < p + 0.35 + cautious * 0.25) {
      this.move = null;
      this.blockHeight = guess;
      this.blockUntil = this.t + Math.max(0.25, fm.hitIn + 0.3);
      return true;
    }
    if (r < p + 0.55 + cautious * 0.25) {
      // Out of the way: a hop back, or (showing off) a backflip.
      this.move = null;
      if (chance(this.showy * 0.6) && ch.whole) ch.flipJump(-1, -dir * 230, -600);
      else ch.leap(-dir * 300, -260);
      return true;
    }
    // Trade: swing right back (the blades may clash).
    if (!this.move) this.startMove(c, chance(0.5) ? 'thrust' : 'cut');
    return true;
  }

  /** What to do next: change the tempo, pick an exchange, show off, get away from a wall. */
  private decide(c: Ctx, foe: FighterView, dist: number, dir: 1 | -1, R: number) {
    const ch = c.char, sc = ch.scale, b = c.world.bounds;
    const fDown = foe.mode === 'ragdoll' || foe.mode === 'lie' || foe.mode === 'getup';
    if (fDown) { this.setTempo('break', 0.8); this.plan = []; this.taunt(c, foe); return; }
    // Punish: he's staggered (wide open) or reeling: a big move right now.
    if ((foe.stagger > 0 || foe.hitstun > 0.25) && dist < R * 1.5) {
      this.goal='punish';this.plan=[foe.stagger>0?'heavy':'thrust'];
      this.setTempo('press', 1.2);
      return;
    }
    // In the air: a rising cut to keep him up there, or jump up and meet him.
    if (foe.mode === 'air' && dist < R * 1.2) { this.startMove(c, chance(0.6) ? 'rising' : 'aircut'); return; }
    // Back to the wall: vault over him, or dash past.
    const behind = dir > 0 ? ch.x - b.left : b.right - ch.x;
    if (behind < 60 * sc && dist < R * 2.2 && chance(0.6)) {
      if (chance(0.5) && ch.whole) { ch.flipJump(1, dir * Math.min(520, (dist + 60 * sc) * 1.9), -720); }
      else this.startMove(c, 'dash');
      return;
    }
    // Far apart: out with the bow for an arrow or two (not too often: it's slow, and he's open while he draws).
    if ((this.hasBow || c.items.find('gun')) && dist > R * 2.4 && this.t - this.shotAt > 5 && this.tempo !== 'press' && chance(0.35)) {
      const target = () => { const v = c.foe?.(); const n = v?.joints.neck, h = v?.joints.hip; return n && h ? { x: (n.x + h.x) / 2, y: (n.y + h.y) / 2 } : null; };
      this.shooting = c.items.find('gun') ? new ShootGun(target,'friend',2) : new ShootBow(chance(0.5) ? 1 : 2, target, 'friend', false);
      this.shooting.start(c);
      ch.fightPose = null; ch.fightVX = null; ch.fightZ = null;
      if (chance(0.3)) c.say(pick(['pew pew', 'eat this', 'from range!']), 1.2);
      return;
    }
    if (this.tempo === 'press') {
      if (this.t > this.tempoUntil || !this.plan.length) this.setTempo('break', rand(0.5, 1.1));
      return;
    }
    if (this.t < this.tempoUntil) {
      // Circling: change the guard's height now and then; once in a while, show off.
      if (chance(0.15)) this.height = pick(['mid', 'mid', 'high', 'low'] as Height[]);
      if (this.tempo === 'circle' && chance(this.showy * 0.04) && dist > R * 1.6) this.startMove(c, 'twirl');
      return;
    }
    if (this.tempo === 'break') { this.setTempo('circle', rand(0.5, 1.6) * (1.3 - this.aggression)); return; }
    // Time to commit (or circle a bit longer).
    if (!chance(0.35 + this.aggression * 0.55)) { this.setTempo('circle', rand(0.4, 1)); return; }
    const tactical=chooseExchange(foe,ch.poise,dist,R,c.personality,this.lastAttack);
    this.goal=tactical.goal;
    if(tactical.goal==='recover'){this.plan=[];this.setTempo('break',1.8);return;}
    const far = dist > R * 1.7;
    const plan=tactical.moves;
    // Mix in a kick to shove him off a guard (it's a gesture, not a sword move).
    if (this.blocksSeen > 1.5 && chance(0.3) && dist < R) { ch.doGesture('frontkick', { x: foe.x, y: (foe.joints.hip?.y ?? 0) - 6 * sc }); this.blocksSeen = 0; return; }
    if (foe.block === 'high' && chance(0.4) && dist < R * 1.1) { ch.doGesture('sweep', { x: foe.x, y: (foe.joints.footL?.y ?? 0) }); return; }
    this.plan = plan;
    this.setTempo('press', 1.5 + plan.length * 0.6);
  }

  private taunt(c: Ctx, foe: FighterView) {
    if (this.t - this.said < 4 || !chance(0.4)) return;
    this.said = this.t;
    c.say(c.fightMode === 'real' ? pick(['get up.', 'is that all?']) : pick(['get up!', 'haha', 'you ok?', 'timber!', `come on ${foe.name}`]), 1.3);
  }

  /** Pull it off his belt (over his shoulder for one on his back) and twirl it into his guard. */
  private drawSword(c: Ctx, dt: number): boolean {
    const ch = c.char, it = this.sword, hand = ch.facing > 0 ? 'R' : 'L';
    if (!it) { this.phase = 'fists'; return false; }
    ch.fightVX = null;
    if (it.where === 'hand') { this.phase = 'fight'; this.startMove(c, 'draw'); c.sound?.('whoosh', 0.5); return false; }
    this.drawT += dt;
    // Something else in that hand (his pen): it goes back on his belt first.
    const other = c.items.inHand(hand);
    if (other && other !== it && !c.items.stow(other)) c.items.drop(other, 0, -60);
    const slot = c.items.slotPose(ch, it.where === 'belt' ? it.slot : 2).at;
    ch.handTarget = { x: slot.x, y: slot.y };
    const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - slot.x, h.y - slot.y) < 7 * ch.scale || this.drawT > 0.6) {
      ch.handTarget = null;
      c.items.toHand(it, hand);
      c.sound?.('pickup');
    }
    return false;
  }

  /** His sword's on the floor: go get it (he dives for it if the other one's close). */
  private fetchSword(c: Ctx, foe: FighterView): boolean {
    const ch = c.char, it = this.sword!, sc = ch.scale, hand = ch.useHand;
    ch.fightPose = null; ch.fightVX = null; ch.fightZ = null; ch.faceLock = null;
    if (!hand) { this.phase = 'fists'; return false; }
    if (it.speed > 80) return false; // still flying
    const dx = it.at.x - ch.x;
    if (Math.abs(dx) > 14 * sc) {
      if (!ch.walking || this.t > this.think) { this.think = this.t + 0.3; ch.walkTo(it.at.x - Math.sign(dx) * 8 * sc, Math.abs(dx) > 60 * sc || Math.abs(foe.x - ch.x) < 80 * sc); }
      return false;
    }
    ch.stop();
    ch.handTarget = { x: it.at.x, y: it.at.y };
    const h = ch.body.j[hand === 'L' ? 'handL' : 'handR'];
    if (Math.hypot(h.x - it.at.x, h.y - it.at.y) < 8 * sc || this.think < this.t - 1.2) {
      ch.handTarget = null;
      c.items.toHand(it, hand);
      c.sound?.('pickup');
    }
    return false;
  }

  /** No sword (you have it): fists and feet until it comes back. */
  private fists(c: Ctx, foe: FighterView, dist: number, dir: 1 | -1): boolean {
    const ch = c.char, sc = ch.scale, arm = ch.d.upperArm + ch.d.foreArm, leg = ch.d.thigh + ch.d.shin;
    ch.fightPose = null; ch.fightZ = null;
    ch.guard = this.t < this.blockUntil;
    if (ch.attack || ch.hitstun > 0) { ch.fightVX = null; return false; }
    const fm = foe.move;
    if (fm?.windup && !this.reacted && dist < leg * 2.5) {
      this.reacted = true;
      if (chance(0.5)) ch.leap(-dir * 260, -280); else this.blockUntil = this.t + 0.45;
      return false;
    }
    if (!fm) this.reacted = false;
    const want = leg * 1.05;
    ch.fightVX = dir * clamp((dist - want) * 5, -140, 160);
    if (this.t < this.think) return false;
    this.think = this.t + this.reaction * rand(0.8, 1.4);
    const j = foe.joints;
    if (dist < arm * 1.15 && j.neck) { ch.fightVX = null; ch.doGesture(pick(['jab', 'jab', 'punch', 'uppercut'] as const), { x: j.neck.x, y: j.neck.y }); }
    else if (dist < leg * 1.2 && j.hip && chance(this.aggression)) { ch.fightVX = null; ch.doGesture(chance(0.6) ? 'frontkick' : 'highkick', { x: j.hip.x, y: j.hip.y - 6 * sc }); }
    return false;
  }

  stop(c: Ctx) {
    const ch = c.char;
    this.shooting?.stop(c); this.shooting = null;
    this.endPose(c);
    ch.airPunch = null; ch.hp = 1; ch.poise = 1;
    if (this.sword?.where === 'hand') c.items.stow(this.sword);
  }
}
