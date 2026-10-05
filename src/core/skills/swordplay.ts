// Sword moves, as keyframes. Each move is a short list of poses in his own frame (where the sword hand is,
// which way the blade points, how far he leans, lunges, crouches) that he blends through, plus how his feet
// carry him (a lunge, a dash past you, a jump). The fight skill (duel.ts) picks the moves; this plays them.
//
// The references: Alan Becker's fights (big wind-ups, smear-fast cuts, holds after a hit, using the whole
// space), Nidhogg (stances at three heights, thrusts, parries that throw you off balance, disarms), Sekiro
// (posture: blocking and parrying wear the attacker down until they're open), and kendo/iaido basics (the
// stances, the overhead cut, the dash-through draw cut). Moves read in a side view but use depth too: the
// spin turns him all the way round through the front view, and the dash passes in front of the other one.
import type { Ctx } from './context';
import type { FightPose } from '../character';
import type { SwordKind } from '../fighting';
import type { Item } from '../items';
import { clamp, lerp, smooth } from '../math';

/** One pose of a move. Times in seconds; distances in pixels at scale 1. */
interface Key {
  t: number;
  /** Sword hand: [forward, up] from his neck. */
  g: [number, number];
  /** Blade angle in degrees (0 = ahead, 90 = up, 180 = behind, negative = down). Blends in a straight line,
   * so 135 → -35 is a cut down through the front. */
  b: number;
  lean?: number;
  crouch?: number;
  stance?: number;
  off?: 'hilt' | 'back' | 'guard';
  /** His speed along the ground at this pose (px/s, forward = toward where he faces). */
  vx?: number;
  /** His depth (px, toward you): the dash passes in front. */
  z?: number;
  /** How the blend INTO this pose goes: 'in' accelerates (a cut), 'out' slows down (a wind-up). */
  e?: 'in' | 'out' | 'lin';
  /** The blade cuts during the blend into this pose. */
  act?: boolean;
  /** How hard his hands follow (default: 0.6 while cutting, else 0.35). */
  snap?: number;
}

export type MoveName = 'cut' | 'thrust' | 'rising' | 'heavy' | 'smash' | 'spin' | 'flurry' | 'dash' | 'aircut' | 'parry' | 'draw' | 'twirl' | 'feint';

export interface MoveDef {
  kind: SwordKind;
  keys: Key[];
  /** How long it telegraphs before it can hit (the window to react in). */
  windup: number;
  /** How far ahead of him it reaches (px at scale 1, from his hips), for the fighter picking moves. */
  reach: number;
  /** A spin: start time and how long the full turn takes. */
  spin?: [number, number];
  /** A jump: when, and with what speed (forward, up). */
  leap?: [number, number, number];
  /** Each cutting blend is its own hit (a flurry), instead of one hit for the whole move. */
  multi?: boolean;
  /** Once in the air, wait at this key until he lands. */
  landAt?: number;
  /** How hard the hit is (scales the knockback), 0..1.5. */
  power: number;
}

/** His guard, at three heights (and how a block at each height looks). Key times are filled in when used. */
export const STANCES: Record<'mid' | 'high' | 'low', Omit<Key, 't'>> = {
  mid: { g: [16, -7], b: 30, lean: 2, crouch: 2, stance: 0.6 },
  high: { g: [7, 14], b: 118, lean: 0, crouch: 0, stance: 0.55 },
  low: { g: [15, -19], b: -18, lean: 3, crouch: 5, stance: 0.7 },
};
const BLOCKS: Record<'mid' | 'high' | 'low', Omit<Key, 't'>> = {
  mid: { g: [11, -2], b: 86, lean: -1, crouch: 4, stance: 0.65 },
  high: { g: [7, 11], b: 172, lean: -2, crouch: 6, stance: 0.65 },
  low: { g: [11, -20], b: -96, lean: 2, crouch: 8, stance: 0.7 },
};

export const MOVES: Record<MoveName, MoveDef> = {
  feint:{kind:'cut',windup:0.16,reach:70,power:0,keys:[
    {t:0.16,g:[-8,23],b:155,lean:-5,stance:0.8,e:'out'},
    {t:0.28,g:[24,3],b:35,lean:7,stance:1,e:'in'},
    {t:0.42,...STANCES.mid},
  ]},
  // A diagonal cut (kesa-giri): raise it over the shoulder, then down across the front.
  cut: { kind: 'cut', windup: 0.2, reach: 80, power: 0.9, keys: [
    { t: 0.2, g: [-15, 21], b: 165, lean: -3, stance: 0.55, e: 'out' },
    { t: 0.3, g: [29, -6], b: -55, lean: 9, crouch: 6, stance: 0.95, vx: 240, e: 'in', act: true },
    { t: 0.4, g: [19, -22], b: -95, lean: 6, crouch: 6, stance: 0.95, vx: 0, act: true },
    { t: 0.62, ...STANCES.mid },
  ] },
  // A lunging thrust: pull it back to the hip, then everything goes forward at once.
  thrust: { kind: 'thrust', windup: 0.16, reach: 98, power: 1, keys: [
    { t: 0.16, g: [-2, -7], b: 4, lean: -3, stance: 0.5, vx: -70, e: 'out' },
    { t: 0.25, g: [34, -3], b: 0, lean: 12, crouch: 6, stance: 1.2, vx: 560, e: 'in', act: true },
    { t: 0.4, g: [32, -3], b: 0, lean: 10, crouch: 6, stance: 1.15, vx: 0 },
    { t: 0.62, ...STANCES.mid, vx: -90 },
  ] },
  // A rising cut (kiri-age): from low behind him, up through the front. It throws them into the air.
  rising: { kind: 'rising', windup: 0.2, reach: 78, power: 1, keys: [
    { t: 0.2, g: [-13, -22], b: -165, lean: 5, crouch: 9, stance: 0.8, e: 'out' },
    { t: 0.32, g: [23, 20], b: 105, lean: -2, crouch: 0, stance: 0.7, vx: 220, e: 'in', act: true },
    { t: 0.44, g: [6, 20], b: 100, vx: 0 },
    { t: 0.68, ...STANCES.mid },
  ] },
  // The big one: both hands, all the way up and back, and down through the middle. Slow to start, but it
  // breaks a guard (it takes a lot of poise even blocked).
  heavy: { kind: 'heavy', windup: 0.36, reach: 88, power: 1.3, keys: [
    { t: 0.36, g: [-12, 25], b: 170, lean: -6, crouch: 0, stance: 0.6, off: 'hilt', e: 'out' },
    { t: 0.46, g: [30, -7], b: -65, lean: 14, crouch: 13, stance: 1.15, vx: 400, off: 'hilt', e: 'in', act: true, snap: 0.75 },
    { t: 0.64, g: [15, -22], b: -62, lean: 11, crouch: 13, stance: 1.15, vx: 0, off: 'hilt' },
    { t: 0.92, ...STANCES.mid },
  ] },
  // A mace (or anything heavy): over his head and behind, then straight down into the floor in front. It bounces.
  smash: { kind: 'heavy', windup: 0.42, reach: 50, power: 1.2, keys: [
    { t: 0.42, g: [-2, 18], b: 165, lean: -6, crouch: 0, stance: 0.6, off: 'hilt', e: 'out' },
    { t: 0.56, g: [17, -22], b: -82, lean: 14, crouch: 14, stance: 1, vx: 200, off: 'hilt', e: 'in', act: true, snap: 0.75 },
    { t: 0.68, g: [16, -16], b: -60, lean: 11, crouch: 12, stance: 1, vx: 0, off: 'hilt' },
    { t: 0.76, g: [17, -22], b: -80, lean: 12, crouch: 13, stance: 1, off: 'hilt' },
    { t: 1.0, ...STANCES.mid },
  ] },
  // A spinning slash: he turns all the way round (through the front view and his back), blade out flat.
  spin: { kind: 'spin', windup: 0.3, reach: 80, power: 1.1, spin: [0.12, 0.38], keys: [
    { t: 0.12, g: [6, -6], b: 20, crouch: 7, stance: 0.6, e: 'out' },
    { t: 0.36, g: [31, -4], b: 4, crouch: 7, stance: 0.75, vx: 120 },
    { t: 0.5, g: [31, -4], b: 2, crouch: 6, stance: 0.8, vx: 160, act: true, e: 'lin', snap: 0.7 },
    { t: 0.74, ...STANCES.mid, vx: 0 },
  ] },
  // A flurry: five quick little cuts, up and down, stepping in.
  flurry: { kind: 'flurry', windup: 0.1, reach: 75, power: 0.5, multi: true, keys: [
    { t: 0.1, g: [6, 10], b: 100, e: 'out' },
    { t: 0.18, g: [27, -8], b: -70, vx: 180, act: true, e: 'in', stance: 0.8 },
    { t: 0.26, g: [24, 15], b: 125, act: true },
    { t: 0.34, g: [29, -3], b: -65, vx: 180, act: true, e: 'in' },
    { t: 0.42, g: [20, 23], b: 140, act: true },
    { t: 0.5, g: [26, -14], b: -100, vx: 120, act: true, e: 'in' },
    { t: 0.74, ...STANCES.mid, vx: 0 },
  ] },
  // The draw-cut dash (iai): sinks low with the blade back, then he's suddenly past you, frozen mid-follow-
  // through, and the hit lands. He passes in front of you (toward the viewer) to get by.
  dash: { kind: 'dash', windup: 0.3, reach: 150, power: 1.1, keys: [
    { t: 0.28, g: [-6, -14], b: -160, lean: 8, crouch: 12, stance: 1, e: 'out' },
    { t: 0.3, g: [-6, -14], b: -160, lean: 10, crouch: 12, stance: 1, vx: 1200, z: 26 },
    { t: 0.46, g: [32, -4], b: 8, lean: 10, crouch: 11, stance: 1.1, vx: 1200, z: 26, act: true, e: 'in', snap: 0.7 },
    { t: 0.66, g: [32, -4], b: 6, lean: 10, crouch: 11, stance: 1.1, vx: 0, z: 26 },
    { t: 0.95, ...STANCES.mid, z: 0 },
  ] },
  // A jumping cut: up with the blade overhead, down on top of them.
  aircut: { kind: 'aircut', windup: 0.38, reach: 110, power: 1.1, leap: [0.14, 300, -640], landAt: 4, keys: [
    { t: 0.14, g: [2, 14], b: 120, crouch: 10, stance: 0.6, e: 'out' },
    { t: 0.38, g: [0, 18], b: 150 },
    { t: 0.48, g: [29, -7], b: -85, act: true, e: 'in', snap: 0.7 },
    { t: 0.6, g: [14, -18], b: -70 },
    { t: 0.62, g: [14, -18], b: -70, crouch: 10, stance: 1 },
    { t: 0.85, ...STANCES.mid },
  ] },
  // A parry: snap the blade across to meet theirs. A hit arriving in the window bounces off and leaves
  // them off balance (see Pet.takeHit).
  parry: { kind: 'cut', windup: 0, reach: 0, power: 0, keys: [
    { t: 0.06, ...BLOCKS.mid, b: 78, lean: 2, e: 'in', snap: 0.75 },
    { t: 0.24, ...BLOCKS.mid, b: 82, lean: 1 },
    { t: 0.4, ...STANCES.mid },
  ] },
  // Drawing his sword: a flourish (one full twirl) into his guard.
  draw: { kind: 'cut', windup: 0, reach: 0, power: 0, keys: [
    { t: 0, g: [5, 6], b: -90 },
    { t: 0.38, g: [9, 2], b: 270, e: 'lin', snap: 0.5 },
    { t: 0.55, ...STANCES.mid },
  ] },
  // Showing off between exchanges: a twirl and back on guard.
  twirl: { kind: 'cut', windup: 0, reach: 0, power: 0, keys: [
    { t: 0.12, g: [12, -2], b: 30 },
    { t: 0.46, g: [12, -2], b: 390, e: 'lin', snap: 0.5 },
    { t: 0.62, ...STANCES.mid },
  ] },
};

const ease = (u: number, e: Key['e']) => (e === 'in' ? u * u : e === 'out' ? 1 - (1 - u) * (1 - u) : e === 'lin' ? u : smooth(u));

let nextHitId = 1;

/** Plays one sword move (or holds a guard). */
export class SwordMove {
  t = 0;
  private keys: Key[];
  private leapt = false;
  private spun = false;
  /** Hit ids, one per cutting blend (or one for the whole move). */
  private ids = new Map<number, number>();
  constructor(readonly name: MoveName, private item: Item, from: Omit<Key, 't'>, private twoHand: boolean) {
    const def = MOVES[name];
    this.keys = [{ ...from, t: 0, vx: 0 }, ...def.keys];
  }
  get def() { return MOVES[this.name]; }

  /** Pose him for this moment. Returns true when the move is over (or he got knocked out of it). */
  update(c: Ctx, dt: number): boolean {
    const ch = c.char, def = this.def;
    if (this.item.where !== 'hand' || ch.hitstun > 0 || ch.stagger > 0 || (ch.mode !== 'ground' && ch.mode !== 'air')) return true;
    // In the air, a jumping cut waits at its landing pose until his feet touch down.
    const holding = def.landAt !== undefined && this.leapt && ch.mode === 'air' && this.t >= this.keys[def.landAt].t;
    if (!holding) this.t += dt;
    if (def.leap && !this.leapt && this.t >= def.leap[0]) {
      this.leapt = true;
      ch.leap(ch.facing * def.leap[1], def.leap[2]);
    }
    if (def.spin && !this.spun && this.t >= def.spin[0]) { this.spun = true; ch.spin(def.spin[1]); }
    const ks = this.keys, last = ks[ks.length - 1];
    if (this.t >= last.t) { this.pose(c, last, last, 1, null); return true; }
    let i = 1;
    while (ks[i].t < this.t) i++;
    const a = ks[i - 1], b = ks[i];
    const u = ease(clamp((this.t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1), b.e);
    const slot = def.multi ? i : 0;
    if (b.act && !this.ids.has(slot)) this.ids.set(slot, nextHitId++);
    this.pose(c, a, b, u, b.act ? this.ids.get(slot)! : null);
    return false;
  }

  private pose(c: Ctx, a: Key, b: Key, u: number, act: number | null) {
    const ch = c.char, def = this.def, sc = ch.scale;
    const num = (k: keyof Key, d: number) => lerp((a[k] as number | undefined) ?? d, (b[k] as number | undefined) ?? d, u);
    const blade = lerp(a.b, b.b, u);
    const off = this.twoHand ? 'hilt' : (u < 0.5 ? a.off : b.off) ?? 'back';
    const total = this.keys[this.keys.length - 1].t;
    const fp: FightPose = {
      hand: this.item.hand, grip: [lerp(a.g[0], b.g[0], u), lerp(a.g[1], b.g[1], u)], blade, off,
      lean: num('lean', 0), crouch: num('crouch', 0), stance: num('stance', 0.6),
      snap: b.snap ?? (act ? 0.6 : 0.35),
      move: def.power > 0 || this.name === 'feint' ? { name: this.name, u: this.t / total, windup: this.t < def.windup, hitIn: Math.max(0, def.windup - this.t) } : null,
      act: act !== null ? { id: act, kind: def.kind, power: def.power } : null,
      parry: this.name === 'parry' && this.t > 0.03 && this.t < 0.24,
      block: null,
    };
    ch.fightPose = fp;
    const vx = num('vx', 0);
    ch.fightVX = ch.mode === 'ground' ? vx * sc * ch.facing : null;
    ch.fightZ = num('z', 0) * sc;
    const r = (blade * Math.PI) / 180;
    this.item.aimLocal = [Math.cos(r), Math.sin(r)];
  }
}

/** Hold a guard (or a block) at a height, breathing a little. */
export function guardPose(c: Ctx, item: Item, height: 'mid' | 'high' | 'low', block: boolean, twoHand: boolean) {
  const ch = c.char, k = block ? BLOCKS[height] : STANCES[height];
  const breathe = Math.sin(c.world.time * 3.1) * 1.2;
  ch.fightPose = {
    hand: item.hand, grip: [k.g[0], k.g[1] + breathe], blade: k.b + breathe * 2, off: twoHand ? 'hilt' : block ? 'hilt' : 'back',
    lean: k.lean ?? 0, crouch: k.crouch ?? 0, stance: k.stance ?? 0.6, snap: block ? 0.6 : 0.3,
    move: null, act: null, parry: false, block: block ? height : null,
  };
  const r = (ch.fightPose.blade * Math.PI) / 180;
  item.aimLocal = [Math.cos(r), Math.sin(r)];
}

/** The pose he's in right now, as a key to blend out of (so a move starts from wherever his sword is). */
export function currentKey(c: Ctx): Omit<Key, 't'> {
  const fp = c.char.fightPose;
  if (!fp) return STANCES.mid;
  return { g: [...fp.grip], b: fp.blade, lean: fp.lean, crouch: fp.crouch, stance: fp.stance };
}
