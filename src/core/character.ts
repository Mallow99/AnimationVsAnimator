// The character controller: turns a floppy physics skeleton into someone who
// stands, steps, falls over and gets back up.
//
// How it works, every physics step:
//   1. Work out a TARGET position for each joint (where a person would put it),
//      based on what he's doing: standing, walking, sitting, getting up...
//   2. Let physics move every joint (gravity, momentum).
//   3. "Muscles" nudge each joint part of the way toward its target.
//      Strong muscles = he holds a pose. Zero = ragdoll.
//   4. Bones and the floor fix up anything that got stretched or sank.
// Nothing is a pre-made animation; it's all computed live, so pushes, drops and
// throws always look slightly different.
//
// He's 3D: every joint has a depth (z, toward you). Poses are built in his own
// directions (forward, up, his left) and turned to wherever his body faces, so
// turning around, spinning and flipping are real rotations, and his arms and legs
// pass in front of and behind each other. He lives in a thin band of depth just in
// front of your screen; the drawing stays flat, z only decides what's in front.

import { Body, JOINTS, LIMB_JOINTS, LIMBS, limbOf, makeDims, type Dims, type JointName, type LimbId } from './body';
import { LooseLimb } from './limbs';
import { collide, collidePlatforms, FLOOR, integrate, NONE, platY, solveSticks, type Bounds, type Platform } from './physics';
import {
  basis, clamp, dist, dist3, distToSegment, inFrame, lerp, lerp3, sign, smooth, twoBoneIK, twoBoneIK3, type Basis, type V3, type Vec,
} from './math';
import type { Wall } from './world';

export type Mode = 'ground' | 'air' | 'ragdoll' | 'getup' | 'held' | 'sit' | 'lie' | 'climb' | 'ceiling' | 'puppet' | 'roll';

/** Body parts a puppet keyframe can place. "front" = the side facing the way he faces. */
export const PUPPET_JOINTS = ['head', 'neck', 'hip', 'frontHand', 'backHand', 'frontElbow', 'backElbow', 'frontFoot', 'backFoot', 'frontKnee', 'backKnee'] as const;
export type PuppetJoint = (typeof PUPPET_JOINTS)[number];
/**
 * One pose in a made-up move. `t` = seconds to get here from the previous pose.
 * Positions are [x, y] or [x, y, z] in pixels at normal size: x forward (the way he faces),
 * y UP, z sideways (positive = toward his front-hand side), measured from the ground right
 * under where he stood when the move began.
 * Parts left out keep their previous place (elbows, knees and head bend naturally if never given).
 */
export interface Keyframe {
  t: number;
  pose: Partial<Record<PuppetJoint, [number, number] | [number, number, number]>>;
  /** Degrees to spin around (like a figure skater) while getting to this pose (360 = a full turn; positive turns toward you first). */
  turn?: number;
  /** Degrees to flip head over heels (positive = a front flip, negative = a backflip). */
  flip?: number;
  /** Degrees to cartwheel (tipping sideways; positive = toward his front-hand side). */
  roll?: number;
}

/** How far a body part sits to his side (px at size 1), when a pose doesn't say. +1 = his left. */
const SIDE: Partial<Record<JointName, number>> = { handL: 8, handR: -8, elbowL: 6, elbowR: -6, footL: 5, footR: -5, kneeL: 5, kneeR: -5 };
/** A damped spring: pulls s.x toward `target`. Stiffness k, damping c (lower = bouncier, more overshoot). */
function spring(s: { x: number; v: number }, target: number, dt: number, k: number, c: number) {
  s.v += (-(s.x - target) * k - s.v * c) * dt;
  s.x += s.v * dt;
}

/** +1 for his left side, -1 for his right. */
const sideOf = (k: 'L' | 'R') => (k === 'L' ? 1 : -1);

export type Gesture = 'stomp' | 'wave' | 'shrug' | 'laugh' | 'flail' | 'pokeBack' | 'stretch' | 'lookAround' | 'cower' | 'dance' | 'nuzzle' | 'kick'
  | 'punch' | 'swat' | 'highkick' | 'knock' | 'scratch';

/** How he holds his arms when he's just standing there (body language for his emotion). */
export type IdleStyle = 'none' | 'crossed' | 'hips' | 'behind' | 'hug';
export type SeatStyle = 'up' | 'lounge' | 'front' | 'lie';

export type CharEvent =
  | { type: 'landed'; speed: number }
  | { type: 'crashed'; speed: number }
  | { type: 'tripped' }
  | { type: 'gotUp' }
  | { type: 'grabbed' }
  | { type: 'released'; speed: number }
  | { type: 'jumped' }
  | { type: 'arrived' }
  | { type: 'stomped' }
  | { type: 'hitWall' }
  | { type: 'fellOff' }          // walked/was pushed off an edge, or the window vanished
  | { type: 'carried'; speed: number } // the window under him moved
  | { type: 'reachedTop' }      // climbed to the top of a wall
  | { type: 'letGo' }           // dropped off a wall or the ceiling
  | { type: 'step' }            // a foot touched down (footstep sounds)
  | { type: 'limbOff'; limb: LimbId; x: number; y: number; yanked: boolean } // a limb came off
  | { type: 'limbOn'; limb: LimbId; x: number; y: number }                  // and went back on
  | { type: 'rolled'; speed: number }  // rolled out of a big landing (parkour)
  | { type: 'wallJump' }               // kicked off a wall
  | { type: 'flipped' }                // landed a flip
  | { type: 'vaulted' }                // vaulted onto a ledge
  | { type: 'knock'; x: number; y: number } // a knuckle tap on something (a window)
  | { type: 'hangOn' };                       // he grabbed onto your cursor and is hanging from it

/** How he carries himself. Part of his "look"; set from the settings / presets. */
export interface BodyStyle {
  stand: number;    // 0 = knees bent … 1 = legs locked straight when standing
  spread: number;   // how far apart his feet stand (0 = together, 1 = wide upside-down V)
  armHang: number;  // 0 = arms held out in front … 1 = hanging loose at his sides
  armSwing: number; // how much the arms swing while walking
  stride: number;   // step length (1 = normal). Longer strides = calmer, less "scuttly" walk
  lift: number;     // how high feet lift each step
  bob: number;      // hip bounce per step
  lean: number;     // how much he leans into his motion
}

export const DEFAULT_BODY: BodyStyle = { spread: 0.6, stand: 1, armHang: 1, armSwing: 1, stride: 0.8, lift: 1.1, bob: 1, lean: 0.4 };

/**
 * Walking style, picked from his mood:
 * normal; pocket (nonchalant, hands in pockets); skip (happy); stomp (angry); sulk (sad, head down).
 */
export type Gait = 'normal' | 'pocket' | 'skip' | 'stomp' | 'sulk' | 'creep';
const GAITS: Record<Gait, { speed: number; lift: number; bob: number; swing: number; lean: number }> = {
  normal: { speed: 1, lift: 1, bob: 1, swing: 1, lean: 0 },
  pocket: { speed: 0.85, lift: 0.8, bob: 0.7, swing: 0, lean: -2 },
  skip: { speed: 1.1, lift: 2.2, bob: 3.5, swing: 1.8, lean: 1 },
  stomp: { speed: 1.15, lift: 2, bob: 1.5, swing: 0.5, lean: 4 },
  sulk: { speed: 0.75, lift: 0.45, bob: 0.5, swing: 0.25, lean: 0 },
  creep: { speed: 0.7, lift: 0.55, bob: 0.3, swing: 0.2, lean: 1.5 }, // nervous: small careful steps
};

/** Mood-driven body language, set from outside (0..1 each, speed ~0.5..1.5). */
export interface Posture { hunch: number; bounce: number; tension: number; speed: number }

type Targets = Partial<Record<JointName, V3>>;
type Strengths = Partial<Record<JointName, number>>;
/** A foot's place on the ground (x across the screen, z in depth), and the step it's taking. */
interface Foot { x: number; z: number; swinging: boolean; t: number; fromX: number; fromZ: number; toX: number; toZ: number; dur: number; lift: number }
type Grip = { x: number; y: number; z: number; cx: number; cy: number; cz: number };

const GESTURE_TIME: Record<Gesture, number> = {
  stomp: 0.75, wave: 1.4, shrug: 0.9, laugh: 1.9, flail: 1.2, pokeBack: 0.5, stretch: 2.4, lookAround: 2.2, cower: 1.6, dance: 4, nuzzle: 1.6, kick: 0.65,
  punch: 0.42, swat: 0.5, highkick: 0.72, knock: 1.2, scratch: 1.5,
};
/**
 * How much he turns toward you during a gesture (0 = stays side-on, 1 = faces you).
 * Animators call it "cheating to camera": a wave or a shrug reads better from the front.
 */
const GESTURE_PRESENT: Partial<Record<Gesture, number>> = { wave: 0.25, shrug: 0.65, laugh: 0.35, dance: 1, cower: 0.3, nuzzle: 0.45, stretch: 0.4, scratch: 0.5 };

export class Character {
  readonly body: Body;
  readonly d: Dims;
  mode: Mode = 'ground';
  /** Which way he faces: 1 = right, -1 = left. */
  facing = 1;
  /**
   * How his body is turned, as an angle around the up axis: 0 = facing right,
   * π = facing left, π/2 = facing you. Turning around is a real spin through the
   * front view. It follows `facing`, or a made-up move drives it.
   */
  yaw = 0;
  /** How much his forward direction points right on screen (1 right … -1 left). */
  get turnF() { return Math.cos(this.yaw); }
  /** How much he faces you (0 = side view, 1 = facing you, -1 = back to you). */
  get turnS() { return Math.sin(this.yaw); }
  /** Staring down at something (his stump, after losing a limb): 0 … 1. */
  stare = 0;
  /** Something outside (a skill) can ask him to turn toward you a bit: 0 … 1. */
  presentWant = 0;
  private present = 0;
  posture: Posture = { hunch: 0, bounce: 0, tension: 0, speed: 1 };
  style: BodyStyle = { ...DEFAULT_BODY };
  gait: Gait = 'normal';
  private runPhase = 0;
  look: Vec | null = null;
  walkSpeed = 62;
  /** When true he stays down after falling / lying (sleeping, sulking). */
  stayDown = false;
  /** Can limbs come off (big crashes, hard smacks, yanking a hand or foot)? */
  destructible = true;
  /** Limbs that came off, lying around (or being held), by which limb they are. */
  readonly missing = new Map<LimbId, LooseLimb>();
  /** How long a limb has been yanked hard enough to come off. */
  private yank = 0;
  private hopPhase = 0;
  private crawlPhase = 0;

  private events: CharEvent[] = [];
  /** Window tops he can stand on (set by the pet from the desktop shell). */
  platforms: Platform[] = [];
  /** What he's standing on: a platform id, FLOOR, or NONE while airborne. */
  support = FLOOR;
  /** Set by skills to steer his front hand (drawing, grabbing); null = normal arm swing. */
  handTarget: Vec | null = null;
  /** Fists up, ready to fight (sparring with your cursor). */
  guard = false;
  /**
   * What he's hitting with right now (the fist of a punch, the foot of a kick...), how hard
   * (0..1), and which swing it is (one hit per swing). Set during the fast part of an attack only.
   */
  strike: { joint: JointName; power: number; id: number } | null = null;
  private gestureId = 0;
  private knocks = 0;
  /** Jumping at something to punch it: where (a skill keeps it pointed at the target). */
  airPunch: Vec | null = null;
  /** Jumping up to grab something (your cursor): his front hand reaches for it, no punch. */
  airReach: Vec | null = null;
  /** Pushing something at this x (a window's side): both hands on it, leaning in. */
  pushAt: number | null = null;
  /** How high his hands go on what he's pushing (null = chest height). */
  pushY: number | null = null;
  /** Riding a window across the screen: knees bent, arms out. */
  surf = false;
  /** Standing still: how he holds his arms (crossed when annoyed, hands on hips when proud...). */
  idleStyle: IdleStyle = 'none';
  /** Standing still: tapping his front foot (impatient). */
  tapFoot = false;
  /** Sitting on the edge of something with his legs hanging over: where the edge is, and which way it drops. */
  private ledge: { x: number; dir: number } | null = null;
  /** Sitting on a seat (a chair, a couch): where his bottom goes. A skill keeps it up to date if the seat moves. */
  seat: Vec | null = null;
  /**
   * How he's sitting on a seat: sitting up (a chair), leaning back, sitting square to you (turned out
   * of the screen, still glancing the way he faces), or lying along it (a couch: head on the armrest
   * behind him, feet the way he faces).
   */
  seatStyle: SeatStyle = 'up';
  get lounge() { return this.seatStyle === 'lounge'; }
  /** Sitting with a game controller in both hands; `padMash` (0..1) is how hard his thumbs are going. */
  gamepad = false;
  padMash = 0;
  /** Climbable walls (window sides, screen edges). */
  walls: Wall[] = [];
  /**
   * Climbing a wall: which hand moves next, and whether it's pulling or reaching.
   * `from` is where the move started (neck height for a pull, the hand for a reach),
   * so every move is a smooth, timed motion instead of a jump to the end.
   * `feet` are footholds on the wall; `step` is a foot moving to a new one.
   */
  private climb: {
    wall: Wall; dir: -1 | 1; phase: 'pull' | 'reach'; mover: 'L' | 'R'; reachTo: V3 | null; t: number;
    from: V3; feet: Record<'L' | 'R', number>; step: { foot: 'L' | 'R'; from: number; to: number; t: number } | null;
    out: number;   // how far his hips are from the wall
    bodyY: number; // neck height where the current pull started
    pullT: number; // time into the current pull (it keeps going while the next reach begins)
  } | null = null;
  /** Hanging from the ceiling (monkey bars). */
  private hang: { goal: number; phase: 'pull' | 'reach'; mover: 'L' | 'R'; reachTo: V3 | null; t: number; from: V3; bodyX: number; pullT: number } | null = null;
  /**
   * Hands latched onto a point in the world. A gripped hand is pinned; his body hangs from it.
   * (x, y, z) is the hold; (cx, cy, cz) is where the hand actually is. The hand slides onto
   * the hold over a few frames instead of teleporting there.
   */
  private grips: Record<'L' | 'R', Grip | null> = { L: null, R: null };
  /** A wall he's leaping at: he grabs it as soon as a hand gets there. */
  private leapWall: Wall | null = null;
  get onCeiling() { return this.mode === 'ceiling'; }
  /** At the end of the ceiling, climb down the screen edge instead of dropping. */
  climbDownAfterCeiling = false;
  private rootX: number;
  /** Where the middle of his body is in depth (0 = the middle of his depth band). */
  private rootZ = 0;
  private rootVX = 0;
  private goalX: number | null = null;
  private running = false;
  private feet: { L: Foot; R: Foot };
  private crouch = 0;
  private modeTime = 0;
  private time = 0;
  private calm = 0;
  private dt = 1 / 120;
  private stun = 0;
  private offBalance = 0;
  private walkH = 0;
  private hipTarget: V3 | null = null;
  private getup: { from: Record<JointName, V3>; crouch: Targets; stand: Targets; x: number } | null = null;
  /** What your cursor is holding: one of his joints, or one of his loose limbs (`limb`, point `idx`). */
  /** `self`: he's the one holding on (hanging from your cursor), not you holding him. */
  private held: { joint: JointName; limb?: LooseLimb; idx?: number; x: number; y: number; vx: number; vy: number; self?: boolean } | null = null;
  private gesture: { name: Gesture; t: number; x: number; y: number; fired: boolean } | null = null;
  private jumpPrep: { t: number; vx: number; vy: number } | null = null;
  // ── animation principles (Becker's toolbox) ──
  /** Follow-through: a springy offset (px) his arms swing with when he speeds up or stops. */
  private sway = { x: 0, v: 0 };
  /** Overlap: his head dips and bobs back after a landing. */
  private nodSpring = { x: 0, v: 0 };
  /** Squash and stretch: + = stretched tall (rising fast), - = squashed (just landed). For drawing only. */
  private squashSpring = { x: 0, v: 0 };
  private prevRootVX = 0;
  /** Anticipation: a beat of wind-up before he breaks into a run. */
  private windup = 0;
  /** How squashed (-) or stretched (+) to draw him right now (physics never changes). */
  get squash() { return this.squashSpring.x; }

  /** Parkour: a forward roll out of a big landing. */
  private rolling: { t: number; dur: number; dir: number; x0: number; speed: number } | null = null;
  /** A flip in the air (off a jump or a wall): +1 = front flip, -1 = backflip. */
  private airFlip: { t: number; dur: number; turns: number } | null = null;
  /** A vault in progress (a scripted move): reports 'vaulted' when he lands. */
  private vaulting = false;
  /** A made-up move being played (his AI brain moving his body directly). */
  private puppetMove: {
    times: number[];                  // seconds to reach each pose
    poses: Record<JointName, V3>[];   // [start, keyframe 1, ...] in his own frame (x forward, y up, z = his left), every part filled in
    yaws: number[];                   // body angle at each of those
    pitches: number[];                // flip angle at each
    rolls: number[];                  // cartwheel angle at each
    auto: Set<JointName>;             // parts never given: bent naturally instead
    ox: number; oy: number; oz: number; // the spot on the ground where the move started
    time: number; total: number;
  } | null = null;

  constructor(public bounds: Bounds, x: number, scale = 1) {
    this.d = makeDims(scale);
    this.body = new Body(this.d, x, bounds.floor);
    this.rootX = x;
    const foot = (fx: number, fz: number): Foot => ({ x: fx, z: fz, swinging: false, t: 0, fromX: fx, fromZ: fz, toX: fx, toZ: fz, dur: 0.25, lift: 0 });
    this.feet = { L: foot(x - 3, -3), R: foot(x + 3, 3) };
  }

  // ───────────────────────── 3D helpers ─────────────────────────

  /** p moved `fwd` the way he faces, `dy` down the screen, and `left` toward his left side. */
  private off(p: V3, fwd: number, dy: number, left = 0, yaw = this.yaw): V3 {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: p.x + fwd * c + left * s, y: p.y + dy, z: p.z + fwd * s - left * c };
  }

  /** A world point at depth z (default: the middle of his body). */
  private pt(x: number, y: number, z = this.rootZ): V3 { return { x, y, z }; }

  /** How far forward (the way he faces) a world point is from his root. */
  private fwdOf(p: { x: number; z: number }) { return (p.x - this.rootX) * Math.cos(this.yaw) + (p.z - this.rootZ) * Math.sin(this.yaw); }

  /** The world depth (z) of a spot `amt` px toward side k of his body (for holds on a wall, etc.). */
  private latZ(k: 'L' | 'R', amt: number, yaw = this.yaw) { return -Math.cos(yaw) * sideOf(k) * amt; }

  /** A direction given in his own terms (forward, up, toward his left), in the world. */
  dirToWorld(fwd: number, up: number, left = 0): V3 {
    const B = basis(this.yaw);
    return { x: B.fwd.x * fwd + B.up.x * up + B.left.x * left, y: B.fwd.y * fwd + B.up.y * up + B.left.y * left, z: B.fwd.z * fwd + B.up.z * up + B.left.z * left };
  }

  /** Which hand is nearer to you right now. */
  private get nearSide(): 'L' | 'R' {
    const c = Math.cos(this.yaw);
    return (Math.abs(c) > 0.05 ? c : this.facing) > 0 ? 'R' : 'L';
  }

  // ───────────────────────── commands (what skills call) ─────────────────────────

  get x() { return this.body.j.hip.x; }

  /** 1 = normal head. The neck grows with it so a big head doesn't sit on his shoulders. */
  setHeadSize(k: number) {
    const sc = this.scale, headR = 9 * sc * k;
    this.body.setHead(headR, headR + 4 * sc);
  }
  get scale() { return this.d.thigh / 20; }
  /** Standing on the ground and free to take a new order. */
  get ready() { return this.mode === 'ground' && !this.gesture && !this.jumpPrep; }
  get walking() { return this.mode === 'ground' && this.goalX !== null; }
  get climbingWall() { return this.mode === 'climb' ? this.climb!.wall : null; }

  // ───────────── limbs coming off and going back on ─────────────

  hasLimb(l: LimbId) { return this.body.has(l); }
  get legCount() { return (this.hasLimb('legL') ? 1 : 0) + (this.hasLimb('legR') ? 1 : 0); }
  get whole() { return this.missing.size === 0; }
  /** The hand he uses for things: his front one if he has it, else the other, else none. */
  get useHand(): 'L' | 'R' | null {
    const front = this.facing > 0 ? 'R' : 'L', back = front === 'R' ? 'L' : 'R';
    return this.hasLimb(front === 'R' ? 'armR' : 'armL') ? front : this.hasLimb(back === 'R' ? 'armR' : 'armL') ? back : null;
  }

  /**
   * A limb comes off: its bones snap, and the limb becomes a loose piece with the speed it had.
   * Returns the piece (null if it can't: not breakable, or already off).
   */
  detach(l: LimbId, kick?: V3, yanked = false): LooseLimb | null {
    if (!this.destructible || !this.hasLimb(l)) return null;
    const J = LIMB_JOINTS[l], j = this.body.j, d = this.d;
    const arm = l === 'armL' || l === 'armR';
    const piece = new LooseLimb(l, [j[J.root], j[J.mid], j[J.end]], arm ? [d.upperArm, d.foreArm] : [d.thigh, d.shin]);
    if (kick) for (const p of piece.points) { p.px -= kick.x * this.dt; p.py -= kick.y * this.dt; p.pz -= kick.z * this.dt; }
    // The torn end starts just off the stump.
    const root = piece.root, dx = piece.points[1].x - root.x, dy = piece.points[1].y - root.y, dl = Math.hypot(dx, dy) || 1;
    root.x += (dx / dl) * 2 * this.scale; root.y += (dy / dl) * 2 * this.scale;
    if (arm) { const h = l === 'armL' ? 'L' : 'R'; this.releaseGrip(h); }
    this.body.removeLimb(l);
    this.missing.set(l, piece);
    this.events.push({ type: 'limbOff', limb: l, x: j[J.root].x, y: j[J.root].y, yanked });
    // Losing a leg (or an arm while hanging on with it) means he goes down.
    if (!arm && ['ground', 'sit', 'getup', 'puppet'].includes(this.mode)) this.setMode('ragdoll');
    else if (arm && (this.mode === 'climb' || this.mode === 'ceiling')) this.letGo();
    this.stun = Math.max(this.stun, 0.35);
    return piece;
  }

  /** Put a loose limb back on (it snaps into place at the stump). */
  attach(l: LimbId) {
    const piece = this.missing.get(l);
    if (!piece) return;
    if (this.held?.limb === piece) this.held = null;
    const [, mid, end] = piece.points;
    this.body.restoreLimb(l, mid, end);
    this.missing.delete(l);
    const r = this.body.j[LIMB_JOINTS[l].root];
    this.events.push({ type: 'limbOn', limb: l, x: r.x, y: r.y });
    if (!(l === 'armL' || l === 'armR') && this.mode === 'ground') this.plantFeet();
  }

  /** Grow (or draw) a new limb in place of a lost one; the old piece fades away. */
  regrow(l: LimbId) {
    const piece = this.missing.get(l);
    if (!piece) return;
    const J = LIMB_JOINTS[l], r = this.body.j[J.root];
    const arm = l === 'armL' || l === 'armR', d = this.d;
    const len1 = arm ? d.upperArm : d.thigh, len2 = arm ? d.foreArm : d.shin;
    this.body.restoreLimb(l, { x: r.x, y: r.y + len1, z: r.z }, { x: r.x, y: r.y + len1 + len2, z: r.z });
    this.missing.delete(l);
    piece.fading = true;
    this.fadingPieces.push(piece);
    if (this.held?.limb === piece) this.held = null;
    this.events.push({ type: 'limbOn', limb: l, x: r.x, y: r.y });
    if (!arm && this.mode === 'ground') this.plantFeet();
  }
  /** Old limbs fading out after he grew new ones. */
  readonly fadingPieces: LooseLimb[] = [];
  /** Everything loose: missing limbs plus ones fading away. */
  get loosePieces() { return [...this.missing.values(), ...this.fadingPieces]; }

  /** He takes hold of a loose limb by its torn end, with one hand. */
  holdLimb(piece: LooseLimb, hand: 'L' | 'R') {
    if (piece.heldBy === 'user') return false;
    this.heldLimb = { piece, hand };
    piece.heldBy = 'him';
    return true;
  }
  dropLimb() { if (this.heldLimb) { this.heldLimb.piece.heldBy = null; this.heldLimb = null; } }
  private heldLimb: { piece: LooseLimb; hand: 'L' | 'R' } | null = null;
  get holdingLimb() { return this.heldLimb?.piece ?? null; }

  /** Where a limb attaches on his body (shoulder = neck, hip). */
  stumpOf(l: LimbId) { return this.body.j[LIMB_JOINTS[l].root]; }

  /** Which loose limb (and which of its points) is under (x, y)? */
  hitLimb(x: number, y: number, pad = 8): { piece: LooseLimb; idx: number } | null {
    for (const piece of this.missing.values()) if (piece.distTo(x, y) < pad) return { piece, idx: piece.nearest(x, y) };
    return null;
  }

  /** Loose limbs' physics, his hand carrying one, and limbs snapping back on when held to the stump. */
  private stepLimbs(dt: number) {
    const bounds = { ...this.bounds, depth: this.bounds.depth ?? 40 * this.scale };
    for (const piece of this.loosePieces) {
      if (this.held?.limb === piece) {
        const p = piece.points[this.held.idx ?? 0];
        p.invMass = 0;
        p.x = this.held.x; p.y = this.held.y; p.z *= 0.97;
        p.px = p.x - this.held.vx * dt; p.py = p.y - this.held.vy * dt; p.pz = p.z;
      }
      const hl = this.heldLimb;
      if (hl?.piece === piece) {
        const h = this.body.j[hl.hand === 'L' ? 'handL' : 'handR'];
        const p = piece.root;
        p.invMass = 0;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x = h.x; p.y = h.y; p.z = h.z;
      }
      piece.step(dt, bounds, this.platforms);
      for (const p of piece.points) p.invMass = 1;
    }
    if (this.heldLimb && !this.hasLimb(this.heldLimb.hand === 'L' ? 'armL' : 'armR')) this.dropLimb();
    for (let i = this.fadingPieces.length - 1; i >= 0; i--) if (this.fadingPieces[i].fade <= 0) this.fadingPieces.splice(i, 1);
    // Held up to the stump (by him, by you, or it just landed there): it goes back on.
    for (const [l, piece] of this.missing) {
      const st = this.stumpOf(l);
      if (piece.age > 0.8 && dist3(piece.root, st) < 9 * this.scale) {
        if (this.heldLimb?.piece === piece) this.heldLimb = null;
        this.attach(l);
      }
    }
    this.body.parkGhosts();
  }

  // ───────────── grabbing ─────────────

  /** Latch a hand onto a point. The hand stays exactly there until released. */
  grip(hand: 'L' | 'R', at: Vec & { z?: number }) {
    const p = this.body.j[hand === 'L' ? 'handL' : 'handR'];
    this.grips[hand] = { x: at.x, y: at.y, z: at.z ?? this.latZ(hand, 5 * this.scale), cx: p.x, cy: p.y, cz: p.z };
    p.invMass = 0;
  }

  releaseGrip(hand: 'L' | 'R') {
    if (!this.grips[hand]) return;
    this.grips[hand] = null;
    this.body.j[hand === 'L' ? 'handL' : 'handR'].invMass = 1;
  }

  releaseGrips() { this.releaseGrip('L'); this.releaseGrip('R'); }

  /**
   * Grab a wall and climb it: up (dir -1) or down (dir 1). Works from standing,
   * or mid-jump. At the top of a window side he pulls himself onto the window;
   * at the top of a screen edge he swings onto the ceiling (monkey bars).
   */
  grabWall(wall: Wall, dir: -1 | 1) {
    if (this.mode !== 'ground' && this.mode !== 'air' && this.mode !== 'sit') return false;
    if (!this.whole) return false; // climbing takes all four limbs
    const j = this.body.j, armLen = this.d.upperArm + this.d.foreArm;
    this.leapWall = null;
    this.goalX = null; this.gesture = null; this.jumpPrep = null;
    this.facing = wall.face;
    this.setMode('climb');
    // Two handholds on the wall, a hand's width apart in depth: one up near his reach, one lower.
    const wx = this.wallX(wall), yaw = wall.face > 0 ? 0 : Math.PI;
    const upper = clamp(j.neck.y - armLen * 0.6, wall.y1 + 2, wall.y2 - 4);
    const lower = clamp(upper + armLen * 0.45, wall.y1 + 2, wall.y2 - 2);
    const upperHand = this.facing > 0 ? 'R' : 'L', lowerHand = upperHand === 'R' ? 'L' : 'R';
    this.grip(upperHand, { x: wx, y: upper, z: this.latZ(upperHand, 5 * this.scale, yaw) });
    this.grip(lowerHand, { x: wx, y: lower, z: this.latZ(lowerHand, 5 * this.scale, yaw) });
    this.startClimb(wall, dir, dir < 0 ? lowerHand : upperHand);
    return true;
  }

  /** Run-and-jump at a wall, catching it with his hands. */
  leapAt(wall: Wall, vy = -430) {
    if (this.mode !== 'ground' || !this.whole) return false;
    const dx = this.wallX(wall) - this.x;
    this.facing = sign(dx);
    this.leapWall = wall;
    this.goalX = null;
    this.gesture = null;
    this.jumpPrep = { t: 0.08, vx: clamp(dx * 4, -320, 320), vy }; // a quick spring, no long wind-up
    return true;
  }

  private wallX(w: Wall) { return w.x - w.face * 1.5 * this.scale; }

  /** While hanging from the ceiling: where to go before letting go. */
  set ceilingGoal(x: number) { if (this.hang) this.hang.goal = clamp(x, this.bounds.left + 20, this.bounds.right - 20); }

  /** Let go of a wall or the ceiling. */
  letGo() {
    if (this.mode !== 'climb' && this.mode !== 'ceiling') return;
    this.setMode('air');
    this.events.push({ type: 'letGo' });
  }

  /** New walls. If he's on one that moved, he moves with it (hands and all); if it's gone, he falls. */
  setWalls(list: Wall[]) {
    this.walls = list;
    if (this.mode !== 'climb' || !this.climb) return;
    const was = this.climb.wall, now = list.find((w) => w.id === was.id);
    if (!now) { this.letGo(); return; }
    const dx = now.x - was.x, dy = now.y1 - was.y1;
    if (dx || dy) {
      for (const k of ['L', 'R'] as const) { const g = this.grips[k]; if (g) { g.x += dx; g.y += dy; g.cx += dx; g.cy += dy; } }
      const c = this.climb;
      if (c.reachTo) { c.reachTo.x += dx; c.reachTo.y += dy; }
      c.from.x += dx; c.from.y += dy; c.bodyY += dy;
      c.feet.L += dy; c.feet.R += dy;
      if (c.step) { c.step.from += dy; c.step.to += dy; }
    }
    this.climb.wall = now;
  }
  get currentGesture() { return this.gesture?.name ?? null; }
  /** Stop whatever gesture he's in the middle of (something more important came up). */
  cancelGesture() { if (this.mode === 'ground') this.gesture = null; }

  /** Walk to x. He stops at the edge of whatever he's standing on, unless `offEdge` (then he walks off and drops). */
  walkTo(x: number, run = false, offEdge = false) {
    if (this.mode === 'sit') this.standUp();
    const r = this.surfaceRange();
    const pad = 6 * this.scale;
    this.goalX = offEdge ? clamp(x, this.bounds.left + 20, this.bounds.right - 20) : clamp(x, r.x1 + pad, r.x2 - pad);
    // Anticipation: breaking into a run from standing, he loads up for a split second first.
    if (run && !this.running && Math.abs(this.rootVX) < 20 && Math.abs(this.goalX - this.rootX) > 60) this.windup = 0.14;
    this.running = run;
  }

  /** The surface at x that's within a small step (up `up` or down `down` px) of height y: a platform, the floor, or null. */
  private stepAt(x: number, y: number, up: number, down: number, not = NONE): { id: number; x1: number; x2: number } | null {
    let best: { id: number; x1: number; x2: number; y: number } | null = null;
    for (const p of this.platforms) {
      if (p.id === not || x < p.x1 || x > p.x2) continue;
      const py = platY(p, x);
      if (py >= y - up && py <= y + down && (!best || Math.abs(py - y) < Math.abs(best.y - y))) best = { id: p.id, x1: p.x1, x2: p.x2, y: py };
    }
    if (best) return best;
    const f = this.bounds.floor;
    return f >= y - up && f <= y + down && not !== FLOOR ? { id: FLOOR, x1: this.bounds.left + 20, x2: this.bounds.right - 20 } : null;
  }

  /**
   * Walking onto a low surface (the foot of a ramp, a low step) or off one onto something just
   * below: he just steps, no jump and no fall.
   */
  private stepUpOrDown() {
    const sc = this.scale, x = this.rootX, g = this.groundY();
    for (const p of this.platforms) {
      if (p.id === this.support || x < p.x1 + 2 || x > p.x2 - 2) continue;
      const y = platY(p, x);
      if (y < g - 0.5 && y >= g - 12 * sc) { this.support = p.id; return; }
    }
    const p = this.supportPlatform();
    if (p && (x < p.x1 - 2 * sc || x > p.x2 + 2 * sc)) {
      const end = platY(p, x < p.x1 ? p.x1 : p.x2);
      const next = this.stepAt(x, end, 12 * sc, 14 * sc, p.id);
      if (next) this.support = next.id;
    }
  }

  /** Left/right ends of where he can walk from here without jumping (low steps onto ramps, floors and windows count). */
  surfaceRange() {
    const p = this.supportPlatform();
    const r = p ? { x1: p.x1, x2: p.x2 } : { x1: this.bounds.left + 20, x2: this.bounds.right - 20 };
    if (!p) return r;
    const sc = this.scale;
    // Follow low steps off either end (at most a few hops: ramp → floor, ramp → window top...).
    let left: Platform | null = p, right: Platform | null = p;
    for (let hop = 0; hop < 3 && (left || right); hop++) {
      if (left) {
        const n = this.stepAt(left.x1 - 4 * sc, platY(left, left.x1), 12 * sc, 14 * sc, left.id);
        if (n && n.x1 < r.x1) { r.x1 = n.x1; left = n.id === FLOOR ? null : this.platforms.find((q) => q.id === n.id) ?? null; } else left = null;
      }
      if (right) {
        const n = this.stepAt(right.x2 + 4 * sc, platY(right, right.x2), 12 * sc, 14 * sc, right.id);
        if (n && n.x2 > r.x2) { r.x2 = n.x2; right = n.id === FLOOR ? null : this.platforms.find((q) => q.id === n.id) ?? null; } else right = null;
      }
    }
    return r;
  }

  /** The window top he's standing on, if any. */
  supportPlatform() { return this.support >= 0 ? this.platforms.find((p) => p.id === this.support) ?? null : null; }

  /**
   * New window positions. If the one he's standing on moved, he moves with it.
   * If it disappeared (closed, minimized, covered), he falls.
   */
  setPlatforms(list: Platform[]) {
    const before = this.supportPlatform();
    this.platforms = list;
    if (this.support < 0 || !before) return;
    let now = this.supportPlatform();
    // The visible piece he's on can change id when other windows cover/uncover it.
    // Find the piece of the same window that's under him instead.
    if (!now && before.win !== undefined) {
      const dxw = (list.find((p) => p.win === before.win)?.wx ?? before.wx ?? 0) - (before.wx ?? 0);
      now = list.find((p) => p.win === before.win && this.x + dxw >= p.x1 - 4 && this.x + dxw <= p.x2 + 4) ?? null;
      if (now) this.support = now.id;
    }
    const onIt = this.mode !== 'air' && this.mode !== 'held';
    if (!now) {
      this.support = NONE;
      if (onIt) { this.setMode('air'); this.events.push({ type: 'fellOff' }); }
      return;
    }
    if (!onIt) return;
    const dy = platY(now, this.x) - platY(before, this.x);
    // Use the window's own position when we know it (covering part of the edge
    // changes the edge's ends but doesn't move the window).
    const dx = now.wx !== undefined && before.wx !== undefined ? now.wx - before.wx
      : Math.abs((now.x1 - before.x1) - (now.x2 - before.x2)) < 1 ? now.x1 - before.x1
        : now.win === undefined && Math.abs((now.x2 - now.x1) - (before.x2 - before.x1)) < 3 ? ((now.x1 + now.x2) - (before.x1 + before.x2)) / 2 : 0;
    if (!dx && !dy) return;
    this.body.translate(dx, dy);
    this.rootX += dx;
    if (this.goalX !== null) this.goalX += dx;
    for (const f of [this.feet.L, this.feet.R]) { f.x += dx; f.fromX += dx; f.toX += dx; }
    if (this.getup) {
      for (const set of [this.getup.from, this.getup.crouch, this.getup.stand] as Record<string, V3>[]) {
        for (const v of Object.values(set)) { v.x += dx; v.y += dy; }
      }
      this.getup.x += dx;
    }
    const jolt = Math.hypot(dx, dy);
    this.events.push({ type: 'carried', speed: jolt });
    // A hard yank throws him off balance.
    if (jolt > 40 * this.scale) this.poke('hip', -dx * 5, -Math.abs(dy) * 3);
  }

  stop() { this.goalX = null; }

  jump(vx: number, vy: number) {
    if (this.mode !== 'ground' || this.jumpPrep || this.legCount === 0) return;
    this.goalX = null;
    this.gesture = null;
    this.jumpPrep = { t: 0, vx, vy };
  }

  /** Jump up at a point (your cursor, above his head) and punch it at the top of the jump. */
  jumpPunch(at: Vec, grab = false) {
    if (this.mode !== 'ground' || this.jumpPrep || this.legCount < 2) return false;
    const g = 2000, armLen = this.d.upperArm + this.d.foreArm;
    const rise = clamp(this.body.j.neck.y - (at.y + armLen * 0.55), 30 * this.scale, 260 * this.scale);
    const vy = Math.sqrt(2 * g * rise), tUp = vy / g;
    const vx = clamp((at.x - this.x) / tUp * 0.85, -380, 380);
    this.jump(vx, -vy);
    this.facing = sign(at.x - this.x) || this.facing;
    if (grab) this.airReach = { x: at.x, y: at.y }; else this.airPunch = { x: at.x, y: at.y };
    this.gestureId++;
    return true;
  }

  sit() {
    if (this.mode !== 'ground') return;
    this.goalX = null; this.gesture = null;
    this.setMode('sit');
  }

  /**
   * Sit on the edge of what he's standing on (a window top, a box he drew), legs dangling over.
   * `dir` = which way the drop is (+1 = the right-hand end). He should be standing near that end.
   */
  sitEdge(dir: 1 | -1) {
    if (this.mode !== 'ground' || this.support < 0) return false;
    const r = this.surfaceRange(), x = dir > 0 ? r.x2 : r.x1;
    if (Math.abs(this.x - x) > 30 * this.scale) return false;
    this.goalX = null; this.gesture = null;
    this.facing = dir;
    this.setMode('sit');
    this.ledge = { x, dir };
    return true;
  }
  get onLedge() { return this.ledge !== null; }

  /** Sit down on a seat at `at` (he should be standing right by it), facing `dir`. */
  sitOn(at: Vec, dir: 1 | -1, style: SeatStyle = 'up') {
    if (this.mode !== 'ground') return false;
    this.goalX = null; this.gesture = null;
    this.facing = dir;
    this.setMode('sit');
    this.seat = { x: at.x, y: at.y };
    this.seatStyle = style;
    return true;
  }

  lieDown() {
    if (this.mode !== 'ground' && this.mode !== 'sit') return;
    this.goalX = null; this.gesture = null;
    this.stayDown = true;
    this.setMode('lie');
  }

  /** Get up from sitting, lying or a ragdoll heap. */
  standUp() {
    this.stayDown = false;
    if (this.mode === 'sit') {
      this.setMode('ground');
      this.rootX = this.body.j.hip.x;
      // Tuck the feet back under the hips first, like a person does.
      const st = 4 * this.scale;
      for (const k of ['L', 'R'] as const) {
        const f = this.feet[k], at = this.off(this.pt(this.rootX, 0), -sideOf(k) * st, 0, sideOf(k) * st * 0.5);
        f.x = f.fromX = f.toX = at.x;
        f.z = f.fromZ = f.toZ = at.z;
        f.swinging = false;
      }
      // Start from a deep crouch so he rises instead of "losing balance".
      this.crouch = Math.max(0, this.body.j.hip.y - (this.groundY() - 2 - this.standHeight()));
    } else if (this.mode === 'lie' || this.mode === 'ragdoll') {
      this.startGetup();
    }
  }

  doGesture(name: Gesture, at?: Vec) {
    if (this.mode !== 'ground' && !(this.mode === 'held' && name === 'flail')) return;
    this.goalX = null;
    this.gesture = { name, t: 0, x: at?.x ?? 0, y: at?.y ?? 0, fired: false };
    this.gestureId++;
    if (at && this.mode === 'ground') this.facing = sign(at.x - this.rootX);
  }

  /** A shove at a joint, in pixels/second. */
  poke(joint: JointName, vx: number, vy: number, vz = 0) {
    this.body.push(joint, vx, vy, this.dt, vz);
    // A hit knocks the wind out of him: muscles go weak for a moment.
    const speed = Math.hypot(vx, vy, vz);
    this.stun = Math.max(this.stun, clamp(speed / 1500, 0, 1) * 0.5);
    if (speed > 1200 && (this.mode === 'climb' || this.mode === 'ceiling')) { this.letGo(); return; } // knocked off
    if (speed > 1500 && (this.mode === 'ground' || this.mode === 'sit' || this.mode === 'puppet')) {
      this.setMode('ragdoll');
      this.events.push({ type: 'tripped' });
    }
  }

  /** You grab him by a joint. `self`: no, HE grabbed onto your cursor with that hand (and hangs from it). */
  grab(joint: JointName, x: number, y: number, self = false) {
    this.releaseGrips();
    this.held = { joint, x, y, vx: 0, vy: 0, self };
    this.body.j[joint].invMass = 0;
    this.goalX = null; this.gesture = null; this.jumpPrep = null;
    this.stayDown = false;
    this.setMode('held');
    this.events.push({ type: self ? 'hangOn' : 'grabbed' });
  }
  /** Hanging off your cursor by one hand. */
  get hangingOn() { return !!this.held?.self; }

  moveHold(x: number, y: number, vx: number, vy: number) {
    if (this.held) Object.assign(this.held, { x, y, vx, vy });
  }

  /** You pick up one of his loose limbs (by point idx). */
  grabLimb(piece: LooseLimb, idx: number, x: number, y: number) {
    if (this.heldLimb?.piece === piece) this.dropLimb();
    piece.heldBy = 'user';
    this.held = { joint: 'hip', limb: piece, idx, x, y, vx: 0, vy: 0 };
  }

  release() {
    if (!this.held) return;
    const lp = this.held.limb;
    if (lp) {
      const p = lp.points[this.held.idx ?? 0];
      p.px = p.x - clamp(this.held.vx, -2500, 2500) * this.dt; p.py = p.y - clamp(this.held.vy, -2500, 2500) * this.dt;
      lp.heldBy = null;
      this.held = null;
      return;
    }
    const p = this.body.j[this.held.joint];
    const max = 2500;
    const vx = clamp(this.held.vx, -max, max), vy = clamp(this.held.vy, -max, max);
    p.invMass = 1;
    p.px = p.x - vx * this.dt; p.py = p.y - vy * this.dt; p.pz = p.z;
    const speed = Math.hypot(vx, vy);
    this.held = null;
    this.setMode(speed > 1300 ? 'ragdoll' : 'air');
    this.events.push({ type: 'released', speed });
  }

  /** You're holding him (not just one of his loose limbs). */
  isHeld() { return this.held !== null && !this.held.limb; }

  /** Which joint (if any) is under the given point. */
  hitTest(x: number, y: number, pad = 7): JointName | null {
    const j = this.body.j;
    const bones: [JointName, JointName][] = [
      ['neck', 'hip'], ['neck', 'elbowL'], ['elbowL', 'handL'], ['neck', 'elbowR'], ['elbowR', 'handR'],
      ['hip', 'kneeL'], ['kneeL', 'footL'], ['hip', 'kneeR'], ['kneeR', 'footR'], ['head', 'neck'],
    ];
    const ghost = this.body.ghost;
    let hit = dist(x, y, j.head.x, j.head.y) < this.d.headR + pad;
    for (const [a, b] of bones) {
      if (hit) break;
      if (ghost.has(a) || ghost.has(b)) continue;
      if (distToSegment(x, y, j[a].x, j[a].y, j[b].x, j[b].y) < pad) hit = true;
    }
    if (!hit) return null;
    let best: JointName = 'hip', bestD = Infinity;
    for (const n of JOINTS) {
      if (ghost.has(n)) continue;
      const dd = dist(x, y, j[n].x, j[n].y);
      if (dd < bestD) { bestD = dd; best = n; }
    }
    return best;
  }

  drainEvents(): CharEvent[] { const e = this.events; this.events = []; return e; }

  setBounds(b: Bounds) {
    this.bounds = b;
    const j = this.body.j;
    // If the screen shrank, bring him back on screen.
    const dx = clamp(j.hip.x, b.left + 20, b.right - 20) - j.hip.x;
    const dy = Math.min(0, b.floor - 2 - Math.max(j.footL.y, j.footR.y, j.head.y));
    if (dx || dy) { this.body.translate(dx, dy); this.rootX += dx; this.feet.L.x += dx; this.feet.R.x += dx; }
  }

  // ───────────────────────── simulation ─────────────────────────

  step(dt: number) {
    this.dt = dt;
    this.time += dt;
    this.modeTime += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.strike = null;
    const t: Targets = {};
    const s: Strengths = {};
    let internal = false;
    this.hipTarget = null;
    if (this.mode !== 'puppet') this.turnToward(dt);
    // Squash and stretch: stretched along a fast rise or fall, springing back after a squash on landing.
    const vy = (this.body.j.hip.y - this.body.j.hip.py) / dt;
    spring(this.squashSpring, this.mode === 'air' ? clamp(Math.abs(vy) / 9000, 0, 0.09) : 0, dt, 260, 13);

    switch (this.mode) {
      case 'ground': this.groundPose(dt, t, s); break;
      case 'sit': this.sitPose(t, s); break;
      case 'lie': this.liePose(t, s); break;
      case 'getup': this.getupPose(t, s); break;
      case 'air': this.airPose(t, s, 0.07); internal = true; break;
      case 'held': this.airPose(t, s, 0.025); this.flailOverlay(t, s); internal = true; break;
      case 'ragdoll': break;
      case 'climb': this.climbPose(dt, t, s); break;
      case 'ceiling': this.ceilingPose(dt, t, s); break;
      case 'puppet': this.puppetPose(dt, t, s); break;
      case 'roll': this.rollPose(dt, t, s); break;
    }

    const b = this.body;
    const hipVY = (b.j.hip.y - b.j.hip.py) / dt;
    integrate(b.points, dt);
    this.applyMuscles(t, s, internal);
    const settle = 1 - Math.exp(-dt * 30); // how fast a gripping hand slides onto its hold
    for (const k of ['L', 'R'] as const) {
      const g = this.grips[k];
      if (!g) continue;
      g.cx += (g.x - g.cx) * settle; g.cy += (g.y - g.cy) * settle; g.cz += (g.z - g.cz) * settle;
      const p = b.j[k === 'L' ? 'handL' : 'handR'];
      p.px = p.x; p.py = p.y; p.pz = p.z; // keep its motion so the body swings naturally when it lets go
      p.x = g.cx; p.y = g.cy; p.z = g.cz;
    }
    if (this.held && !this.held.limb) {
      const p = b.j[this.held.joint];
      p.x = this.held.x; p.y = this.held.y;
      p.z *= 0.97; // the mouse can't hold depth: drift back to the middle
      p.px = p.x - this.held.vx * dt; p.py = p.y - this.held.vy * dt; p.pz = p.z;
      // Yanked hard by a hand or a foot: that limb comes off, and you're left holding it.
      const limb = limbOf(this.held.joint);
      const speed = Math.hypot(this.held.vx, this.held.vy);
      this.yank = limb && this.destructible && !this.held.self && speed > 2700 && this.modeTime > 0.1 ? this.yank + dt : 0;
      if (limb && this.yank > 0.03) {
        const { x, y, vx, vy } = this.held, idx = this.held.joint === LIMB_JOINTS[limb].mid ? 1 : 2;
        this.held = null;
        b.j[LIMB_JOINTS[limb].mid].invMass = b.j[LIMB_JOINTS[limb].end].invMass = 1;
        this.setMode('ragdoll');
        const piece = this.detach(limb, undefined, true);
        if (piece) { piece.heldBy = 'user'; this.held = { joint: 'hip', limb: piece, idx, x, y, vx, vy }; }
        this.yank = 0;
      }
    }
    for (const p of b.points) { p.grounded = false; p.on = NONE; }
    // Remember how fast each joint was falling, to tell how hard it hits the ground.
    const fall = this.destructible && (this.mode === 'ragdoll' || this.mode === 'air') ? b.points.map((p) => (p.y - p.py) / dt) : null;
    const friction = this.mode === 'ragdoll' || this.mode === 'lie' ? 0.4 : 0.25;
    const bounds = { ...this.bounds, depth: this.bounds.depth ?? 40 * this.scale };
    for (let i = 0; i < 8; i++) {
      solveSticks(b.sticks);
      collide(b.points, bounds, friction);
      collidePlatforms(b.points, this.platforms, friction);
    }
    if (fall) this.checkImpacts(fall);
    if (this.missing.size || this.fadingPieces.length) this.stepLimbs(dt);
    this.afterStep(dt, hipVY);
  }

  private lastBreak = -10;
  /** Slammed into the ground hard enough, a hand or foot takes its limb off with it. */
  private checkImpacts(fall: number[]) {
    if (this.time - this.lastBreak < 0.5) return;
    const b = this.body;
    for (const l of LIMBS) {
      if (!this.hasLimb(l)) continue;
      for (const n of [LIMB_JOINTS[l].end, LIMB_JOINTS[l].mid]) {
        const p = b.j[n], v = fall[b.points.indexOf(p)];
        if (!p.grounded || v < 1700) continue;
        if (Math.random() < clamp((v - 1700) / 1500, 0, 0.5) * this.breakChance) {
          this.lastBreak = this.time;
          this.detach(l, { x: (p.x - p.px) / this.dt * 0.4, y: -v * 0.25, z: (Math.random() - 0.5) * 500 });
          return;
        }
      }
    }
  }

  /** A turn in progress: from one body angle to another over a set time, eased in and out. */
  private turning: { from: number; to: number; t: number; dur: number; base: number } | null = null;

  /**
   * Swing his body angle toward the way he faces: a quick spin through the front view
   * when he turns around, and a gentle ease when a gesture turns him a little toward you.
   */
  private turnToward(dt: number) {
    const base = this.facing > 0 ? 0 : Math.PI;
    const g = this.gesture;
    let want = this.presentWant;
    // Standing still with his arms crossed (or on his hips...): turned three-quarters to you, so it reads.
    if (this.idleStyle !== 'none' && this.mode === 'ground' && !this.walking && !this.gesture && Math.abs(this.rootVX) < 10 && !this.handTarget) {
      want = Math.max(want, { none: 0, crossed: 0.85, hips: 0.95, hug: 0.75, behind: 0.35 }[this.idleStyle]);
    }
    // Sitting square to you on the couch: turned out of the screen, a little toward the way he faces.
    if (this.mode === 'sit' && this.seat && this.seatStyle === 'front') want = Math.max(want, 0.8);
    if (g && this.mode === 'ground') {
      const u = g.t / GESTURE_TIME[g.name];
      want = Math.max(want, (GESTURE_PRESENT[g.name] ?? 0) * clamp(u * 5, 0, 1) * clamp((1 - u) * 5, 0, 1));
    }
    this.present += (want - this.present) * (1 - Math.exp(-dt * 8));
    const target = base + (this.facing > 0 ? 1 : -1) * this.present * (Math.PI / 2);
    const tw = this.turning;
    if (tw && tw.base !== base) this.turning = null; // changed his mind mid-turn: start over from here
    if (!this.turning) {
      let diff = target - this.yaw;
      diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI; // shortest way round
      if (Math.abs(diff) < 0.6) { this.yaw += diff * (1 - Math.exp(-dt * 10)); return; }
      if (Math.abs(diff) > Math.PI - 0.01) diff = (this.turnF > 0 ? 1 : -1) * Math.PI; // a half turn: go via facing you
      // About a third of a second for a full about-face; quicker when running.
      const dur = Math.max(0.1, (Math.abs(diff) / Math.PI) * (this.running ? 0.2 : 0.32));
      this.turning = { from: this.yaw, to: this.yaw + diff, t: 0, dur, base };
    }
    const w = this.turning!;
    w.t += dt;
    this.yaw = lerp(w.from, w.to, smooth(w.t / w.dur));
    if (w.t >= w.dur) { this.yaw = w.to; this.turning = null; }
  }

  private setMode(m: Mode) {
    if (m !== 'climb') this.climb = null;
    if (m !== 'ceiling') this.hang = null;
    if (m !== 'climb' && m !== 'ceiling') this.releaseGrips();
    if (m !== 'air') { this.leapWall = null; this.airPunch = null; this.airReach = null; }
    if (m !== 'ground') { this.pushAt = null; this.pushY = null; }
    if (m !== 'sit') { this.ledge = null; this.seat = null; this.seatStyle = 'up'; this.gamepad = false; }
    if (m !== 'puppet') this.puppetMove = null;
    if (m !== 'roll') this.rolling = null;
    if (m !== 'air') { this.airFlip = null; this.flipDone = false; }
    if (m !== 'ground' && m !== 'air') this.pendingFlip = 0;
    if (m !== 'puppet' && m !== 'air') this.vaulting = false;
    if (m === 'air' || m === 'held') this.support = NONE;
    this.mode = m;
    this.modeTime = 0;
    this.calm = 0;
    this.offBalance = 0;
    if (m !== 'ground') { this.jumpPrep = null; if (m !== 'held') this.gesture = null; }
  }

  private applyMuscles(t: Targets, s: Strengths, internal: boolean) {
    // DAMP: how much of each nudge is "free" (no added speed). Higher = calmer, less springy.
    const DAMP = 0.7;
    const weak = this.stun > 0 ? 0.3 : 1;
    let sx = 0, sy = 0, sz = 0;
    for (const name of JOINTS) {
      const tg = t[name], k = s[name] ?? 0;
      const p = this.body.j[name];
      if (!tg || k <= 0 || p.invMass === 0) continue;
      const dx = (tg.x - p.x) * k * weak, dy = (tg.y - p.y) * k * weak, dz = (tg.z - p.z) * k * weak;
      p.x += dx; p.y += dy; p.z += dz;
      p.px += dx * DAMP; p.py += dy * DAMP; p.pz += dz * DAMP;
      sx += dx; sy += dy; sz += dz;
    }
    if (internal) {
      // In the air muscles can only bend the body, not push it around:
      // cancel the net push so he can't "swim" through the air.
      const n = this.body.points.length;
      const mx = sx / n, my = sy / n, mz = sz / n;
      for (const p of this.body.points) {
        if (p.invMass === 0) continue;
        p.x -= mx; p.y -= my; p.z -= mz;
        p.px -= mx * DAMP; p.py -= my * DAMP; p.pz -= mz * DAMP;
      }
    }
  }

  private afterStep(dt: number, hipVYBefore: number) {
    const j = this.body.j;
    const anyFoot = j.footL.grounded || j.footR.grounded;
    const otherDown = j.head.grounded || j.neck.grounded || j.hip.grounded;

    switch (this.mode) {
      case 'air': {
        // Leaping at a wall: catch it as soon as a hand gets there.
        const lw = this.leapWall;
        if (lw) {
          const h = this.frontHand, wx = this.wallX(lw);
          if (Math.abs(h.x - wx) < 12 * this.scale && h.y > lw.y1 && h.y < lw.y2 - 4) { this.grabWall(lw, -1); break; }
        }
        if (this.modeTime < 0.05) break;
        const upsideDown = j.head.y > j.hip.y;
        if (anyFoot && !otherDown && !upsideDown) {
          // Parkour: a big landing he's in control of turns into a forward roll instead of a crash.
          const vx = (j.hip.x - j.hip.px) / dt;
          if (hipVYBefore > 850 && hipVYBefore <= 1400 && this.whole) {
            this.events.push({ type: 'landed', speed: hipVYBefore });
            this.squashSpring.v -= 3.5;
            this.startRoll(Math.abs(vx) > 40 ? sign(vx) : this.facing, Math.abs(vx), hipVYBefore);
            break;
          }
          if (hipVYBefore > 1150) { this.crash(hipVYBefore); break; }
          const flipped = this.modeTime > 0.3 && this.flipDone;
          this.flipDone = false;
          if (flipped) this.events.push({ type: 'flipped' });
          if (this.vaulting) { this.vaulting = false; this.events.push({ type: 'vaulted' }); }
          this.setMode('ground');
          this.support = j.footL.grounded ? j.footL.on : j.footR.on;
          this.rootX = j.hip.x;
          this.rootZ = clamp(j.hip.z, -20 * this.scale, 20 * this.scale);
          this.rootVX = clamp((j.hip.x - j.hip.px) / dt, -150, 150) * 0.5;
          this.plantFeet();
          this.crouch = clamp(hipVYBefore / 1150, 0.15, 1) * 16 * this.scale;
          this.squashSpring.v -= clamp(hipVYBefore / 1150, 0.15, 1) * 4.2;
          this.nodSpring.v += clamp(hipVYBefore / 1150, 0.15, 1) * 7;
          this.events.push({ type: 'landed', speed: hipVYBefore });
        } else if (otherDown || (anyFoot && upsideDown) || j.handL.grounded || j.handR.grounded) {
          this.crash(Math.max(hipVYBefore, 0));
        }
        break;
      }
      case 'ground': {
        this.stepUpOrDown();
        if (this.support >= 0) {
          const p = this.supportPlatform();
          const edge = 3 * this.scale;
          if (!p || this.rootX < p.x1 - edge || this.rootX > p.x2 + edge) {
            this.support = NONE;
            this.goalX = null;
            this.setMode('air');
            this.events.push({ type: 'fellOff' });
            break;
          }
        }
        const tg = this.hipTarget;
        const headDown = j.head.grounded || j.neck.grounded; // hips on the floor is fine (rising from a sit)
        // Off balance = hips far from where they should be, for more than a moment.
        const off = tg ? dist3(j.hip, tg) : 0;
        this.offBalance = off > 22 * this.scale + this.crouch ? this.offBalance + dt : 0;
        if (headDown || this.offBalance > 0.12 || off > 45 * this.scale) {
          this.setMode('ragdoll');
          this.events.push({ type: 'tripped' });
        }
        break;
      }
      case 'sit': {
        if (j.head.grounded || j.neck.grounded) { this.setMode('ragdoll'); this.events.push({ type: 'tripped' }); }
        break;
      }
      case 'ragdoll': {
        const grounded = this.body.points.some((p) => p.grounded);
        // Keep track of what he's lying on, so a window being dragged carries him.
        const touching = [j.hip, j.neck, ...this.body.points].find((p) => p.on !== NONE);
        if (touching) this.support = touching.on;
        if (grounded && this.body.maxSpeed(dt) < 45) this.calm += dt; else this.calm = 0;
        const settled = this.calm > 0.6 || (grounded && this.modeTime > 4);
        if (settled && !this.stayDown) this.startGetup();
        break;
      }
    }
  }

  /** 0..1: how likely a really big crash is to snap a limb off (tests set it to 1). */
  breakChance = 1;

  private crash(speed: number) {
    this.setMode('ragdoll');
    this.events.push({ type: 'crashed', speed });
    // A really hard landing can snap a limb off: whichever was moving fastest.
    if (this.destructible && speed > 1700 && Math.random() < clamp((speed - 1700) / 1300, 0, 0.6) * this.breakChance) {
      const j = this.body.j;
      const fastest = LIMBS.filter((l) => this.hasLimb(l)).map((l) => {
        const e = j[LIMB_JOINTS[l].end];
        return { l, v: Math.hypot(e.x - e.px, e.y - e.py) };
      }).sort((a, b) => b.v - a.v)[0];
      if (fastest) {
        const e = j[LIMB_JOINTS[fastest.l].end];
        this.detach(fastest.l, { x: (e.x - e.px) / this.dt * 0.3, y: -300, z: (Math.random() - 0.5) * 600 });
      }
    }
  }

  private plantFeet() {
    const j = this.body.j;
    for (const k of ['L', 'R'] as const) {
      const f = this.feet[k], p = j[k === 'L' ? 'footL' : 'footR'];
      f.x = f.fromX = f.toX = p.x;
      f.z = f.fromZ = f.toZ = p.z;
      f.swinging = false; f.t = 0;
    }
  }

  // ───────────────────────── poses ─────────────────────────

  /** The ground under him at x (what he's standing on; slopes go up and down). */
  private groundY(x = this.rootX) {
    const p = this.supportPlatform();
    return p ? platY(p, x) : this.bounds.floor;
  }

  /** Half the distance between his feet when standing. */
  private stanceHalf() { return (this.d.thigh + this.d.shin) * (0.04 + 0.2 * this.style.spread); }

  /**
   * Hip height above the feet when standing still. At stand = 1 the hip target is
   * a hair higher than the legs can reach, so the bones lock fully straight.
   */
  private standHeight() {
    const L = this.d.thigh + this.d.shin, half = this.stanceHalf();
    if (this.legCount === 1) return L * 0.97; // on one leg: straight under him
    const straight = Math.sqrt(L * L - 2 * half * half);
    return straight * (0.9 + 0.1 * this.style.stand) + (this.style.stand > 0.97 ? 1.5 * this.scale : 0);
  }

  /**
   * Where a standing foot goes. Feet stand a little apart both ways (one a touch forward,
   * one back, and out to his sides), so he reads as an upside-down V from any angle.
   */
  private standFoot(k: 'L' | 'R', yaw = this.yaw, x = this.rootX): V3 {
    if (this.legCount === 1) return this.off(this.pt(x, this.groundY(x) - 2), 1 * this.scale, 0, sideOf(k) * 1.5 * this.scale, yaw);
    const st = this.stanceHalf();
    return this.off(this.pt(x, this.groundY(x) - 2), -sideOf(k) * st, 0, sideOf(k) * st, yaw);
  }

  private groundPose(dt: number, t: Targets, s: Strengths) {
    const d = this.d, P = this.posture, sc = this.scale, j = this.body.j;
    // On a slope, his hips go by the lower foot (the uphill knee bends).
    const floor = this.supportPlatform()?.y2 !== undefined ? Math.max(this.groundY(this.feet.L.x), this.groundY(this.feet.R.x)) : this.groundY();

    if (this.surf) this.crouch = Math.max(this.crouch, 12 * sc);
    // Jump wind-up: crouch, then spring.
    if (this.jumpPrep) {
      this.jumpPrep.t += dt;
      this.crouch = 14 * sc * smooth(this.jumpPrep.t / 0.16);
      if (this.jumpPrep.t >= 0.16) {
        const { vx, vy } = this.jumpPrep;
        this.jumpPrep = null;
        this.body.launch(vx, vy, dt);
        if (vx) this.facing = sign(vx);
        this.setMode('air');
        if (this.pendingFlip) { this.airFlip = { t: 0, dur: 0.5, turns: this.pendingFlip }; this.pendingFlip = 0; }
        this.events.push({ type: 'jumped' });
        this.airPose(t, s, 0.07);
        return;
      }
    }

    // Locomotion: slide an invisible "root" toward the goal; the feet chase it.
    // (Missing a leg: he hops, slower. Missing both: he drags himself along on his arms.)
    const G = GAITS[this.gait], legs = this.legCount;
    const speedMul = (legs === 2 ? P.speed * (this.running ? 2.3 : G.speed) : legs === 1 ? P.speed * (this.running ? 1 : 0.6) : 0.3) * (this.pushAt !== null ? 0.6 : 1);
    let want = 0;
    if (this.goalX !== null && !this.gesture && !this.jumpPrep && this.crouch < 6 * sc) {
      const dx = this.goalX - this.rootX;
      if (Math.abs(dx) < 4 && Math.abs(this.rootVX) < 40) {
        this.goalX = null;
        this.events.push({ type: 'arrived' });
      } else {
        want = sign(dx) * Math.min(this.walkSpeed * speedMul, Math.abs(dx) * 4);
      }
    }
    if (this.windup > 0) { this.windup -= dt; want = 0; this.crouch = Math.max(this.crouch, 7 * sc); }
    const accel = 450 * speedMul;
    this.rootVX += clamp(want - this.rootVX, -accel * dt, accel * dt);
    // Follow-through: arms swing on past when he stops short, and trail when he takes off.
    const acc = (this.rootVX - this.prevRootVX) / dt;
    this.prevRootVX = this.rootVX;
    spring(this.sway, clamp(-acc * 0.02, -9, 9) * sc, dt, 120, 9);
    spring(this.nodSpring, 0, dt, 90, 8);
    this.rootX += this.rootVX * dt;
    // He drifts back to the middle of his depth band as he goes about his business.
    this.rootZ += (0 - this.rootZ) * Math.min(1, dt * (Math.abs(this.rootVX) > 10 ? 1.5 : 0.4));
    // Compliance: if something shoves his hips, his balance point follows a
    // little, so his feet stumble to catch up instead of him being glued in place.
    const off = j.hip.x - this.rootX, dead = 3 * sc;
    if (Math.abs(off) > dead) this.rootX += (off - sign(off) * dead) * 0.03;
    const margin = d.headR + 6;
    if (this.rootX < this.bounds.left + margin || this.rootX > this.bounds.right - margin) {
      this.rootX = clamp(this.rootX, this.bounds.left + margin, this.bounds.right - margin);
      if (this.goalX !== null) { this.goalX = null; this.events.push({ type: 'hitWall' }); }
      this.rootVX = 0;
    }

    const moving = Math.abs(this.rootVX) > 10;
    if (moving) this.facing = sign(this.rootVX);
    else if (this.look && Math.abs(this.look.x - this.rootX) > 25 && !this.gesture) this.facing = sign(this.look.x - this.rootX);
    const f = this.turnF;
    const root = this.pt(this.rootX, floor - 2);
    if (legs === 0) { this.crawlPose(dt, t, s, floor); return; }
    if (legs === 1) { this.hopPose(dt, t, s, floor); return; }

    // Running has its own cycle (see runPose).
    if (this.running && moving && this.crouch < 6 * sc) { this.runPose(dt, t, s, floor); return; }

    // Feet. Walking: the foot that's furthest behind swings forward and lands half
    // a stride ahead of the hips, then the other foot goes — a steady left-right rhythm.
    // Standing: small shuffles keep both feet under him.
    const B = this.style, legLen = d.thigh + d.shin;
    const speed = Math.abs(this.rootVX), dir = sign(this.rootVX);
    const stepLen = B.stride * 26 * sc * (this.running ? 1.3 : 1);
    const track = 2.5 * sc; // walking, each foot lands a little to its own side
    const ideal = (k: 'L' | 'R') => (moving ? this.off(root, 0, 0, sideOf(k) * track) : this.standFoot(k));
    const stepT = moving ? clamp(stepLen / speed, 0.16, 0.5) : 0.22;
    const landAt = (k: 'L' | 'R', remaining: number) => {
      const i = ideal(k);
      return moving ? { x: this.rootX + this.rootVX * remaining + dir * stepLen * 0.5, z: i.z } : { x: i.x, z: i.z };
    };
    const swinging = this.feet.L.swinging ? 'L' : this.feet.R.swinging ? 'R' : null;
    if (!swinging && this.crouch < 6 * sc) {
      let k: 'L' | 'R', need: number, err: number;
      if (moving) {
        const behindL = (this.rootX - this.feet.L.x) * dir, behindR = (this.rootX - this.feet.R.x) * dir;
        k = behindL > behindR ? 'L' : 'R';
        err = Math.max(behindL, behindR);
        need = stepLen * 0.5;
      } else {
        const iL = ideal('L'), iR = ideal('R');
        const eL = Math.hypot(iL.x - this.feet.L.x, iL.z - this.feet.L.z), eR = Math.hypot(iR.x - this.feet.R.x, iR.z - this.feet.R.z);
        k = eL > eR ? 'L' : 'R';
        err = Math.max(eL, eR);
        need = 2.5 * sc;
      }
      if (err > need) {
        const ft = this.feet[k];
        ft.swinging = true; ft.t = 0; ft.fromX = ft.x; ft.fromZ = ft.z;
        ft.dur = stepT;
        const to = landAt(k, stepT);
        ft.toX = to.x; ft.toZ = to.z;
        ft.lift = (3 + 3 * P.bounce + Math.min(Math.hypot(ft.toX - ft.fromX, ft.toZ - ft.fromZ), 40) * 0.08) * sc * B.lift * (moving ? G.lift : 1);
      }
    }
    // Don't let the body outrun the feet: if the planted foot is trailing too far, ease off.
    if (moving) {
      for (const k of ['L', 'R'] as const) {
        const ft = this.feet[k];
        if (!ft.swinging && (this.rootX - ft.x) * dir > stepLen * 0.85) this.rootVX *= 0.92;
      }
    }
    let swingT = 0;
    // (On a slope each foot stands on its own bit of ground.)
    const footY: Record<'L' | 'R', number> = { L: this.groundY(this.feet.L.x), R: this.groundY(this.feet.R.x) };
    for (const k of ['L', 'R'] as const) {
      const ft = this.feet[k];
      if (!ft.swinging) continue;
      if (moving) ft.dur = Math.min(ft.dur, stepT); // speeding up? hurry the step
      ft.t += dt / ft.dur;
      const u = Math.min(ft.t, 1);
      const to = landAt(k, (1 - u) * ft.dur);
      ft.toX = lerp(ft.toX, to.x, 0.1); ft.toZ = lerp(ft.toZ, to.z, 0.1);
      ft.x = lerp(ft.fromX, ft.toX, smooth(u));
      ft.z = lerp(ft.fromZ, ft.toZ, smooth(u));
      // Stomping: slow lift, fast slam.
      footY[k] = this.groundY(ft.x) - Math.sin(Math.PI * (this.gait === 'stomp' && moving ? u ** 1.6 : u)) * ft.lift;
      swingT = u;
      if (ft.t >= 1) { ft.swinging = false; if (moving || ft.lift > 4 * sc) this.events.push({ type: 'step' }); }
    }

    // Hips: lower a little while walking (long steps need bent knees to reach),
    // bob with each step, and breathe when still.
    this.crouch = Math.max(0, this.crouch - dt * 45 * sc);
    const standH = this.standHeight();
    // Walking works like an upside-down pendulum: the planted leg stays nearly
    // straight and the hips rise over it, then dip as the next foot lands.
    let reachH = standH;
    for (const k of ['L', 'R'] as const) {
      if (this.feet[k].swinging) continue;
      const dx = Math.hypot(this.rootX - this.feet[k].x, this.rootZ - this.feet[k].z);
      reachH = Math.min(reachH, Math.sqrt(Math.max((legLen * 0.995) ** 2 - dx * dx, (legLen * 0.6) ** 2)));
    }
    this.walkH = lerp(this.walkH || standH, reachH, 0.35);
    const hipH = lerp(standH, Math.min(standH, this.walkH), clamp(speed / 40, 0, 1));
    const hunch = this.gait === 'sulk' && moving ? Math.max(P.hunch, 0.7) : P.hunch;
    const stoop = this.stoop(dt, floor - 2 - standH - d.torso);
    const bob = moving
      ? Math.sin(Math.PI * swingT) * (0.4 + 2.5 * P.bounce) * sc * B.bob * G.bob
      : Math.sin(this.time * 2.1) * 0.6 * sc;
    const hip = this.pt(this.rootX, floor - 2 - hipH + this.crouch + hunch * 2 * sc - bob + stoop * legLen * 0.62);
    this.hipTarget = hip;

    // Torso leans into motion; sadness hunches it, anger pitches it forward; reaching low, he bends over.
    const lean = (moving ? G.lean * sc : 0) + clamp(this.rootVX * this.facing * 0.05 * B.lean, -10 * sc, 10 * sc)
      + (hunch * 5 + P.tension * 3) * sc + this.crouch * 0.5 + stoop * d.torso * 0.78 - (this.windup > 0 ? 5 * sc : 0);
    const neck = this.off(hip, lean, -Math.sqrt(Math.max(d.torso ** 2 - lean ** 2, 1)));
    // Head up by default; only a real mood drops it. nod = tipped forward, cock = tipped toward his left.
    let nod = hunch * 0.6 + (this.gait === 'sulk' && moving ? 0.3 : 0); // sulking: eyes on the floor
    let cock = 0;
    // Only a slight nod toward what he's looking at; turning to face it does most of the work.
    if (this.look) nod += clamp((this.look.y - neck.y) / 600, -0.15, 0.15);
    nod += this.stare * 0.75 + this.nodSpring.x * 0.06 + this.sway.x * this.facing * 0.015;
    /** Tip his head toward screen-right (or left, negative) whichever way he's turned. */
    const tiltX = (a: number) => { nod += a * Math.cos(this.yaw); cock += a * Math.sin(this.yaw); };

    // Arms swing opposite the legs.
    const armLen = d.upperArm + d.foreArm;
    const ready = this.guard || P.tension > 0.5 || (this.gait === 'stomp' && moving); // fists up
    const skipping = this.gait === 'skip' && moving;
    const handDrop = armLen * (ready ? 0.6 : this.gait === 'sulk' && moving ? 0.98 : 0.8 + 0.17 * B.armHang);
    // Even "hanging" arms sit a touch apart (front one forward, back one behind),
    // otherwise in side view they lie on top of the torso and blur into it.
    const frontFwd = (ready ? 9 : 5 - 2.5 * B.armHang) * sc;
    const backFwd = (ready ? 6 : -(1.5 + 1.5 * B.armHang)) * sc;
    const hang = 5 * sc; // hands hang a little out to his sides
    // Each hand swings with the opposite foot, along an arc (it rises a little at either end).
    const swingAmt = 0.65 * B.armSwing * (moving ? G.swing : 1);
    const armAt = (foot: Foot, fwd: number, k: 'L' | 'R') => {
      const o = this.fwdOf(foot) * swingAmt;
      return this.off(neck, fwd + o, handDrop - Math.abs(o) * (skipping ? 0.8 : 0.3), sideOf(k) * hang);
    };
    const near = this.nearSide, frontIsR = near === 'R';
    let handL = armAt(this.feet.R, frontIsR ? backFwd : frontFwd, 'L');
    let handR = armAt(this.feet.L, frontIsR ? frontFwd : backFwd, 'R');
    // Follow-through on the arms, and the jump's wind-up: arms swing back while he crouches.
    const prep = this.jumpPrep ? smooth(this.jumpPrep.t / 0.16) : 0;
    const swayed = (h: V3) => ({ x: h.x + this.sway.x, y: h.y - Math.abs(this.sway.x) * 0.3, z: h.z });
    handL = swayed(prep ? lerp3(handL, this.off(neck, -13 * sc, 12 * sc, 5 * sc), prep) : handL);
    handR = swayed(prep ? lerp3(handR, this.off(neck, -13 * sc, 12 * sc, -5 * sc), prep) : handR);
    if (this.gait === 'pocket' && !ready) {
      // Hands tucked in his pockets, elbows out.
      const back = this.off(hip, -4 * sc, -1 * sc, 0), front = this.off(hip, 2 * sc, -1 * sc, 0);
      const pocket = (p: V3, k: 'L' | 'R') => this.off(p, 0, 0, sideOf(k) * 3 * sc);
      if (frontIsR) { handR = pocket(front, 'R'); handL = pocket(back, 'L'); } else { handL = pocket(front, 'L'); handR = pocket(back, 'R'); }
    }
    let footL = { x: this.feet.L.x, y: footY.L - 2, z: this.feet.L.z }, footR = { x: this.feet.R.x, y: footY.R - 2, z: this.feet.R.z };
    let hipT = hip, neckT = neck;

    // Gestures layer on top of the base pose.
    const g = this.gesture;
    if (g) {
      g.t += dt;
      const dur = GESTURE_TIME[g.name], u = g.t / dur;
      const front: 'L' | 'R' = this.facing > 0 ? 'R' : 'L';
      switch (g.name) {
        case 'stomp': {
          const lift = u < 0.65 ? smooth(u / 0.65) * 18 * sc : Math.max(0, 1 - (u - 0.65) / 0.08) * 18 * sc;
          const foot = this.off(root, 7 * sc, -lift, sideOf(front) * track);
          if (front === 'R') footR = foot; else footL = foot;
          if (u > 0.73 && !g.fired) { g.fired = true; this.events.push({ type: 'stomped' }); }
          handL = this.off(neck, -6 * sc, armLen * 0.7, hang);
          handR = this.off(neck, -3 * sc, armLen * 0.7, -hang);
          break;
        }
        case 'wave': {
          // Hand up beside his head, out in front so it doesn't hide behind it, waving side to side.
          const w = Math.sin(g.t * 15) * 5 * sc;
          const up = this.off(neck, 14 * sc + w, -24 * sc, sideOf(front) * 3 * sc - w * 0.6);
          if (front === 'R') handR = up; else handL = up;
          nod -= 0.15;
          break;
        }
        case 'shrug': {
          const k = Math.sin(Math.PI * clamp(u, 0, 1));
          handL = this.off(neck, 6 * sc * k, armLen * 0.88 * (1 - k) + 2 * sc * k, hang + 13 * sc * k);
          handR = this.off(neck, 6 * sc * k, armLen * 0.88 * (1 - k) + 2 * sc * k, -hang - 13 * sc * k);
          neckT = this.off(neck, 0, 3 * sc * k);
          nod -= 0.2 * k; cock += 0.25 * k;
          break;
        }
        case 'laugh': {
          const beat = Math.abs(Math.sin(g.t * 18)); // the chuckle bounce
          if (u < 0.45) {
            // Head thrown back, hands on his belly.
            const k = smooth(u / 0.15);
            neckT = this.off(neck, -4 * sc * k, beat * 1.5 * sc);
            nod -= 0.7 * k;
            handL = this.off(hip, 4 * sc, -8 * sc, 3 * sc);
            handR = this.off(hip, 7 * sc, -13 * sc, -3 * sc);
          } else {
            // Doubled over, slapping his knee.
            const k = smooth((u - 0.45) / 0.15) * (1 - smooth((u - 0.85) / 0.15));
            neckT = this.off(neck, 12 * sc * k, 8 * sc * k + beat * 1.5 * sc);
            hipT = this.off(hip, -2 * sc * k, 2 * sc * k);
            nod += 0.5 * k;
            const slap = this.off(hip, 7 * sc, (d.thigh + d.shin) * 0.4 - Math.abs(Math.sin(g.t * 13)) * 9 * sc * k, sideOf(front) * 4 * sc);
            const rest = this.off(neckT, 4 * sc, 18 * sc, -sideOf(front) * 4 * sc);
            if (front === 'R') { handR = slap; handL = rest; } else { handL = slap; handR = rest; }
          }
          break;
        }
        case 'dance': {
          // Facing you, two beats a second: bob down on the beat, sway side to side, tap alternate feet,
          // and switch between a disco point and hands-on-hips every two beats.
          const b = g.t * 2, ph = b % 1, n = Math.floor(b);
          const sway = Math.sin(b * Math.PI) * 4 * sc;
          const down = (1 - Math.sin(Math.PI * ph)) * 4 * sc;
          hipT = this.off(hip, 0, down, sway);
          neckT = this.off(hipT, 0, -d.torso, sway * 0.6);
          const lift = Math.sin(Math.PI * ph) * 7 * sc, half = this.stanceHalf() + 2 * sc;
          footL = this.off(root, 0, -(n % 2 === 0 ? lift : 0), half);
          footR = this.off(root, 0, -(n % 2 === 1 ? lift : 0), -half);
          const point = Math.floor(b / 2) % 2 === 0;
          const up = this.off(neckT, 3 * sc, -22 * sc, -13 * sc), low = this.off(neckT, 3 * sc, 22 * sc, 12 * sc);
          const hipHand = (k: 'L' | 'R') => this.off(hipT, 1 * sc, -5 * sc, sideOf(k) * 7 * sc);
          handR = point ? up : hipHand('R');
          handL = point ? low : hipHand('L');
          cock += Math.sin(b * Math.PI) * 0.25;
          break;
        }
        case 'nuzzle': {
          // Being petted: lean into it and sway a little, hands together.
          const k = Math.min(1, u * 4) * Math.min(1, (1 - u) * 4);
          const dx = sign(g.x - neck.x);
          neckT = { x: neck.x + dx * 5 * sc * k, y: neck.y + 2 * sc * k, z: neck.z };
          tiltX(dx * 0.55 * k + Math.sin(g.t * 6) * 0.15 * k);
          handL = this.off(neck, 5 * sc, 15 * sc, 2 * sc);
          handR = this.off(neck, 8 * sc, 15 * sc, -2 * sc);
          break;
        }
        case 'flail': {
          const a = g.t * 18;
          handL = this.off(neck, Math.cos(a) * 20 * sc, Math.sin(a) * 20 * sc, hang);
          handR = this.off(neck, Math.cos(a + Math.PI) * 20 * sc, Math.sin(a + Math.PI) * 20 * sc, -hang);
          break;
        }
        case 'pokeBack': {
          const k = Math.sin(Math.PI * clamp(u, 0, 1));
          const dx = g.x - neck.x, dy = g.y - neck.y, dd = Math.hypot(dx, dy) || 1;
          const reach = Math.min(dd, armLen * 0.95) * k;
          const tip = { x: neck.x + (dx / dd) * reach, y: neck.y + (dy / dd) * reach, z: neck.z + this.latZ(front, 3 * sc) };
          const rest = front === 'R' ? handR : handL;
          const h = lerp3(rest, tip, k);
          if (front === 'R') handR = h; else handL = h;
          if (u > 0.3 && u < 0.6) this.strike = { joint: front === 'R' ? 'handR' : 'handL', power: 0.3, id: this.gestureId };
          break;
        }
        case 'stretch': {
          // Up on his toes with arms overhead, lean back, then let it all go.
          const up = smooth(clamp(u / 0.3, 0, 1)) * (1 - smooth(clamp((u - 0.78) / 0.22, 0, 1)));
          const back = Math.sin(Math.PI * clamp((u - 0.25) / 0.5, 0, 1));
          hipT = this.off(hip, -2 * sc * back, -3 * sc * up);
          neckT = this.off(neck, -7 * sc * back, -3 * sc * up);
          handL = lerp3(handL, this.off(neckT, -5 * sc * back, -30 * sc, 6 * sc), up);
          handR = lerp3(handR, this.off(neckT, -5 * sc * back, -30 * sc, -6 * sc), up);
          nod -= 0.6 * back;
          break;
        }
        case 'lookAround': {
          if (!g.fired && u > 0.35) { g.fired = true; this.facing = -this.facing; }
          if (g.fired && u > 0.7 && u < 0.72) this.facing = -this.facing;
          nod += Math.sin(g.t * 3) * 0.3;
          break;
        }
        case 'kick': {
          // Wind up (foot back), swing through fast, then put it down. Arms swing the other way.
          const back = smooth(clamp(u / 0.35, 0, 1)), through = smooth(clamp((u - 0.35) / 0.17, 0, 1)), down = smooth(clamp((u - 0.62) / 0.38, 0, 1));
          const fwd = lerp(lerp(0, -12, back), 24, through) * (1 - down) * sc;
          const lift = (back * 7 + through * 9) * (1 - down) * sc;
          const foot = this.off(root, fwd, -lift, sideOf(front) * track);
          if (front === 'R') footR = foot; else footL = foot;
          neckT = this.off(neck, -4 * sc * through * (1 - down), 0);
          handL = this.off(neck, (front === 'R' ? 10 : -8) * through * sc, armLen * 0.7, hang);
          handR = this.off(neck, (front === 'R' ? -8 : 10) * through * sc, armLen * 0.7, -hang);
          if (u > 0.4 && !g.fired) { g.fired = true; this.events.push({ type: 'step' }); }
          break;
        }
        case 'punch': {
          // Wind up (fist pulled back by his chin), snap it out at the target, pull it back.
          // The other hand stays up guarding his face. He leans into it.
          const back = smooth(clamp(u / 0.3, 0, 1)), out = clamp((u - 0.3) / 0.14, 0, 1), ret = smooth(clamp((u - 0.62) / 0.38, 0, 1));
          const ext = out * out * (1 - ret);
          const tip = this.aimFrom(neck, g, armLen * 0.98, front);
          const chamber = this.off(neck, -3 * sc, 7 * sc, sideOf(front) * 3 * sc);
          const rest = front === 'R' ? handR : handL;
          const fist = lerp3(lerp3(rest, chamber, back * (1 - ret)), tip, ext);
          const guardHand = this.off(neck, 7 * sc, 5 * sc, -sideOf(front) * 3 * sc);
          if (front === 'R') { handR = fist; handL = guardHand; } else { handL = fist; handR = guardHand; }
          neckT = this.off(neck, (5 * ext - 3 * back * (1 - out)) * sc, 0);
          if (u > 0.32 && u < 0.64) this.strike = { joint: front === 'R' ? 'handR' : 'handL', power: 0.7, id: this.gestureId };
          break;
        }
        case 'swat': {
          // A backhand flick: hand comes up across his face, then sweeps out through the target and past it.
          const up = smooth(clamp(u / 0.3, 0, 1)), sw = clamp((u - 0.3) / 0.22, 0, 1), ret = smooth(clamp((u - 0.58) / 0.42, 0, 1));
          const tip = this.aimFrom(neck, g, armLen * 0.98, front);
          const start = this.off(neck, -3 * sc, -12 * sc, -sideOf(front) * 5 * sc);
          const past = { x: tip.x + this.facing * 16 * sc, y: tip.y + 12 * sc, z: tip.z };
          const a = sw * sw, arc = a < 0.6 ? lerp3(start, tip, a / 0.6) : lerp3(tip, past, (a - 0.6) / 0.4);
          const rest = front === 'R' ? handR : handL;
          const hand = sw > 0 ? lerp3(arc, rest, ret) : lerp3(rest, start, up);
          if (front === 'R') handR = hand; else handL = hand;
          nod -= 0.15 * up;
          if (sw > 0.15 && ret < 0.25) this.strike = { joint: front === 'R' ? 'handR' : 'handL', power: 0.5, id: this.gestureId };
          break;
        }
        case 'highkick': {
          // Knee up (chamber), snap the foot out at the target, hold a beat, put it down. He leans back to balance.
          const legLen = d.thigh + d.shin;
          const ch = smooth(clamp(u / 0.32, 0, 1)), out = clamp((u - 0.32) / 0.14, 0, 1), down = smooth(clamp((u - 0.62) / 0.38, 0, 1));
          const ext = out * out * (1 - down);
          const tip = this.aimFrom(hip, g, legLen * 0.96, front);
          const chamber = this.off(hip, 9 * sc, legLen * 0.5, sideOf(front) * track);
          const rest = front === 'R' ? footR : footL;
          const foot = lerp3(lerp3(rest, chamber, ch * (1 - down)), tip, ext);
          if (front === 'R') footR = foot; else footL = foot;
          const lean = (ch * (1 - down)) * 7 * sc;
          neckT = this.off(neck, -lean, 0);
          handL = this.off(neckT, (front === 'R' ? -12 : 10) * sc, armLen * 0.35, hang + 3 * sc);
          handR = this.off(neckT, (front === 'R' ? 10 : -12) * sc, armLen * 0.35, -hang - 3 * sc);
          if (u > 0.33 && u < 0.62) this.strike = { joint: front === 'R' ? 'footR' : 'footL', power: 0.9, id: this.gestureId };
          break;
        }
        case 'knock': {
          // Knuckles on a door: three taps on the target.
          const k = smooth(clamp(u / 0.2, 0, 1)) * (1 - smooth(clamp((u - 0.85) / 0.15, 0, 1)));
          const tapU = clamp((u - 0.25) / 0.55, 0, 1), taps = tapU * 3, ph = taps % 1;
          const tap = tapU > 0 && tapU < 1 ? Math.sin(Math.PI * ph) : 0;
          const at = this.aimFrom(neck, g, armLen * 0.95, front);
          const knuckle = { x: at.x - this.facing * (1 + tap * 6) * sc, y: at.y, z: at.z };
          const rest = front === 'R' ? handR : handL;
          const hand = lerp3(rest, knuckle, k);
          if (front === 'R') handR = hand; else handL = hand;
          // One 'knock' as each tap lands.
          const n = Math.floor(taps);
          if (u < 0.1) this.knocks = 0;
          if (tapU > 0 && n < 3 && ph > 0.5 && this.knocks !== n + 1) { this.knocks = n + 1; this.events.push({ type: 'knock', x: at.x, y: at.y }); }
          cock += 0.2 * k;
          break;
        }
        case 'scratch': {
          // Embarrassed: scratching the back of his head, looking down a bit.
          const k = smooth(clamp(u / 0.2, 0, 1)) * (1 - smooth(clamp((u - 0.8) / 0.2, 0, 1)));
          const head = this.off(neck, -3 * sc, -d.neck - d.headR * 0.6, sideOf(front) * 2 * sc);
          const sc2 = Math.sin(g.t * 24) * 2 * sc;
          const at = { x: head.x + sc2 * this.facing, y: head.y + Math.abs(sc2) * 0.5, z: head.z };
          if (front === 'R') handR = lerp3(handR, at, k); else handL = lerp3(handL, at, k);
          nod += 0.3 * k; cock -= 0.15 * k;
          break;
        }
        case 'cower': {
          const k = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5);
          hipT = this.off(hip, 0, 10 * sc * k);
          neckT = this.off(neck, -6 * sc * k, 14 * sc * k);
          handL = this.off(neckT, 6 * sc, -8 * sc * k, 3 * sc);
          handR = this.off(neckT, 9 * sc, -4 * sc * k, -3 * sc);
          nod -= 0.5 * k;
          break;
        }
      }
      if (g.t >= dur) this.gesture = null;
    }

    // Body language when he's just standing there.
    if (!moving && !g && !this.handTarget && this.pushAt === null && !this.surf && !this.guard && this.idleStyle !== 'none') {
      const front = frontIsR ? 'R' : 'L', back = frontIsR ? 'L' : 'R';
      const set = (k: 'L' | 'R', p: V3) => { if (k === 'L') handL = p; else handR = p; };
      switch (this.idleStyle) {
        case 'crossed': // arms folded across his chest, each hand tucked by the other elbow
          set(front, this.off(neck, 6 * sc, 10 * sc, -sideOf(front) * 9 * sc));
          set(back, this.off(neck, 7 * sc, 8 * sc, -sideOf(back) * 9 * sc));
          break;
        case 'hips': // fists on his hips, elbows out: proud
          set('L', this.off(hip, 1 * sc, -12 * sc, 10 * sc));
          set('R', this.off(hip, 1 * sc, -12 * sc, -10 * sc));
          neckT = this.off(neck, -1.5 * sc, -1 * sc);
          nod -= 0.12;
          break;
        case 'behind': // hands clasped behind his back, rocking a little: happy, humming
          set('L', this.off(hip, -6 * sc, -4 * sc, 2 * sc));
          set('R', this.off(hip, -6 * sc, -4 * sc, -2 * sc));
          cock += Math.sin(this.time * 2.2) * 0.12;
          break;
        case 'hug': // arms wrapped around himself: nervous, lonely
          set(front, this.off(neck, 5 * sc, 11 * sc, -sideOf(front) * 5 * sc));
          set(back, this.off(neck, 4 * sc, 13 * sc, -sideOf(back) * 5 * sc));
          nod += 0.15;
          break;
      }
    }
    if (this.tapFoot && !moving && !g && this.legCount === 2) {
      const tap = Math.max(0, Math.sin(this.time * 9)) * 2.5 * sc * (Math.sin(this.time * 0.9) > -0.3 ? 1 : 0);
      if (frontIsR) footR = { ...footR, y: footR.y - tap }; else footL = { ...footL, y: footL.y - tap };
    }
    // Surfing a window: arms out wide for balance, swaying a little.
    if (this.surf && !g) {
      const wob = Math.sin(this.time * 7) * 3 * sc;
      handL = this.off(neck, (frontIsR ? -17 : 19) * sc, -2 * sc + wob, 5 * sc);
      handR = this.off(neck, (frontIsR ? 19 : -17) * sc, -2 * sc - wob, -5 * sc);
      neckT = this.off(neck, 4 * sc, 2 * sc, wob * 0.3);
    }
    // Pushing something (a window's side): both palms flat on it at chest height, leaning in.
    if (this.pushAt !== null && !g) {
      const wx = this.pushAt - this.facing * 1.5 * sc;
      const py = this.pushY ?? neck.y;
      const palm = (k: 'L' | 'R', dy: number) => ({ x: wx, y: py + dy, z: this.rootZ + this.latZ(k, 5 * sc) });
      handL = this.reachToward(neck, palm('L', (frontIsR ? 6 : 2) * sc), 'L');
      handR = this.reachToward(neck, palm('R', (frontIsR ? 2 : 6) * sc), 'R');
      neckT = this.off(neck, 9 * sc, 4 * sc);
      hipT = this.off(hip, -3 * sc, 2 * sc);
      nod += 0.3;
    }

    // A skill is steering his front hand (drawing, grabbing the cursor, picking something up).
    const useHand = this.useHand;
    const reachFor = this.handTarget && !g && useHand ? this.handTarget : null;
    if (reachFor) {
      const hand = this.reachToward(neckT, reachFor, useHand!);
      if (useHand === 'R') handR = hand; else handL = hand;
    }
    this.fillLimbs(t, hipT, neckT, nod + stoop * 0.6, cock, handL, handR, footL, footR);
    const plant = (k: 'L' | 'R') => (this.feet[k].swinging ? 0.35 : 0.6);
    Object.assign(s, {
      hip: 0.25, neck: 0.25, head: 0.3, kneeL: 0.2, kneeR: 0.2, footL: plant('L'), footR: plant('R'),
      elbowL: 0.1, elbowR: 0.1, handL: 0.09, handR: 0.09,
    });
    if (g && g.name !== 'lookAround') Object.assign(s, { handL: 0.2, handR: 0.2, elbowL: 0.15, elbowR: 0.15 });
    // Attacks are fast: the striking hand or foot follows its target hard.
    if (this.strike || (g && (g.name === 'punch' || g.name === 'swat' || g.name === 'highkick'))) {
      const front = this.facing > 0 ? 'R' : 'L';
      if (g?.name === 'highkick') Object.assign(s, front === 'R' ? { footR: 0.55, kneeR: 0.3 } : { footL: 0.55, kneeL: 0.3 });
      else Object.assign(s, front === 'R' ? { handR: 0.5, elbowR: 0.25 } : { handL: 0.5, elbowL: 0.25 });
    }
    if (this.pushAt !== null && !g) Object.assign(s, { handL: 0.35, handR: 0.35, elbowL: 0.2, elbowR: 0.2 });
    if (reachFor) Object.assign(s, useHand === 'R' ? { handR: 0.45, elbowR: 0.2 } : { handL: 0.45, elbowL: 0.2 });
  }

  private stoopNow = 0;
  /**
   * Reaching for something low (picking a thing up off the floor): how far to bend over, 0..1.
   * `neckY` = where his neck is when standing straight. Eased, so he bends and straightens smoothly.
   */
  private stoop(dt: number, neckY: number) {
    const armLen = this.d.upperArm + this.d.foreArm, legLen = this.d.thigh + this.d.shin;
    const at = this.handTarget && !this.gesture && this.useHand ? this.handTarget : null;
    const want = at ? clamp((at.y - (neckY + armLen * 0.8)) / (legLen * 0.8), 0, 1) : 0;
    this.stoopNow += (want - this.stoopNow) * (1 - Math.exp(-dt * 8));
    return this.stoopNow;
  }

  /**
   * One leg missing: he stands on the one he's got, arms out for balance,
   * and gets around in little hops.
   */
  private hopPose(dt: number, t: Targets, s: Strengths, floor: number) {
    const d = this.d, sc = this.scale, P = this.posture, L = d.thigh + d.shin;
    const leg: 'L' | 'R' = this.hasLimb('legL') ? 'L' : 'R';
    const moving = Math.abs(this.rootVX) > 10;
    let lift = 0;
    if (moving) {
      const before = this.hopPhase;
      this.hopPhase = (this.hopPhase + dt * 2.8) % 1;
      if (this.hopPhase < before) this.events.push({ type: 'step' });
      lift = Math.sin(Math.PI * this.hopPhase) * 9 * sc;
    } else this.hopPhase = 0;
    this.crouch = Math.max(0, this.crouch - dt * 45 * sc);
    const stoop = this.stoop(dt, floor - 2 - L * 0.97 - d.torso);
    const ground = this.pt(this.rootX, floor - 2 - lift);
    const foot = this.off(ground, 1 * sc, 0, sideOf(leg) * 1.5 * sc);
    this.feet[leg].x = foot.x; this.feet[leg].z = foot.z;
    const hip = this.pt(this.rootX, floor - 2 - L * 0.97 - lift + this.crouch + (moving ? 2 * sc * Math.cos(Math.PI * this.hopPhase) ** 2 : 0) + stoop * L * 0.62);
    this.hipTarget = hip;
    const lean = (2 + P.hunch * 5) * sc + stoop * d.torso * 0.78;
    const neck = this.off(hip, lean, -Math.sqrt(Math.max(d.torso ** 2 - lean ** 2, 1)));
    // Arms out to the sides for balance, flapping a little with each hop.
    const flap = moving ? Math.sin(Math.PI * this.hopPhase) * 6 * sc : 0;
    let handL = this.off(neck, 3 * sc, 14 * sc - flap, 16 * sc), handR = this.off(neck, 3 * sc, 14 * sc - flap, -16 * sc);
    const useHand = this.useHand, at = this.handTarget && useHand ? this.handTarget : null;
    if (at) { const h = this.reachToward(neck, at, useHand!); if (useHand === 'R') handR = h; else handL = h; }
    const other = this.body.j[leg === 'L' ? 'footR' : 'footL'];
    this.fillLimbs(t, hip, neck, 0.1 + stoop * 0.6, 0, handL, handR, leg === 'L' ? foot : other, leg === 'R' ? foot : other);
    Object.assign(s, { hip: 0.3, neck: 0.25, head: 0.3, kneeL: 0.2, kneeR: 0.2, footL: 0.6, footR: 0.6, elbowL: 0.12, elbowR: 0.12, handL: 0.12, handR: 0.12 });
    if (at) Object.assign(s, useHand === 'R' ? { handR: 0.45, elbowR: 0.2 } : { handL: 0.45, elbowL: 0.2 });
  }

  /**
   * No legs: he drags himself along on his elbows and hands, hips on the ground,
   * looking up. With no arms either he can only lie there propped up, waiting for help.
   */
  private crawlPose(dt: number, t: Targets, s: Strengths, floor: number) {
    const d = this.d, sc = this.scale;
    const arms = (['L', 'R'] as const).filter((k) => this.hasLimb(k === 'L' ? 'armL' : 'armR'));
    if (!arms.length) { this.rootVX = 0; this.goalX = null; }
    const moving = Math.abs(this.rootVX) > 4;
    if (moving) {
      const before = this.crawlPhase;
      this.crawlPhase = (this.crawlPhase + dt * 1.8) % 1;
      if ((before < 0.5) !== (this.crawlPhase < 0.5)) this.events.push({ type: 'step' });
    }
    const pitch = arms.length ? 1.05 : 1.3;
    const hip = this.pt(this.rootX, floor - 3 * sc);
    this.hipTarget = hip;
    const neck = this.off(hip, Math.sin(pitch) * d.torso, -Math.cos(pitch) * d.torso);
    const ground = { x: neck.x, y: floor - 2, z: neck.z };
    const handAt = (k: 'L' | 'R') => {
      if (!moving) return this.off(ground, 8 * sc, 0, sideOf(k) * 5 * sc);
      const u = (this.crawlPhase + (k === 'L' ? 0 : 0.5)) % 1;
      // Planted: the hand stays put while he pulls past it. Then it lifts and reaches forward again.
      if (u < 0.5) return this.off(ground, lerp(14, -2, u / 0.5) * sc, 0, sideOf(k) * 5 * sc);
      const k2 = (u - 0.5) / 0.5;
      return this.off(ground, lerp(-2, 14, smooth(k2)) * sc, -Math.sin(Math.PI * k2) * 6 * sc, sideOf(k) * 5 * sc);
    };
    const j = this.body.j;
    this.fillLimbs(t, hip, neck, -0.5, 0, handAt('L'), handAt('R'), j.footL, j.footR);
    Object.assign(s, { hip: 0.25, neck: 0.25, head: 0.3, elbowL: 0.15, elbowR: 0.15, handL: 0.3, handR: 0.3 });
  }

  /** Where hand k gets to reaching for a spot on screen (as far as his arm goes). */
  private reachToward(from: V3, at: Vec, k: 'L' | 'R'): V3 {
    const armLen = (this.d.upperArm + this.d.foreArm) * 0.97;
    const z = from.z + this.latZ(k, 4 * this.scale);
    const dx = at.x - from.x, dy = at.y - from.y, dz = z - from.z, dd = Math.hypot(dx, dy, dz) || 1;
    const k2 = Math.min(1, armLen / dd);
    return { x: from.x + dx * k2, y: from.y + dy * k2, z: from.z + dz * k2 };
  }

  /** A point toward `at` from `from`, at most `reach` away (where a punch or kick lands), on his `k` side in depth. */
  private aimFrom(from: V3, at: Vec, reach: number, k: 'L' | 'R'): V3 {
    const dx = at.x - from.x, dy = at.y - from.y, dd = Math.hypot(dx, dy) || 1, r = Math.min(dd, reach);
    return { x: from.x + (dx / dd) * r, y: from.y + (dy / dd) * r, z: from.z + this.latZ(k, 3 * this.scale) };
  }

  /** The hand that's in front (the one he draws and grabs with). */
  get frontHand() { return this.facing > 0 ? this.body.j.handR : this.body.j.handL; }

  /**
   * The run: a proper cycle instead of planted steps. Each foot spends about a third
   * of the time on the ground and the rest swinging — heel kicks up behind, then the
   * knee drives forward — so there's a moment with both feet off the ground.
   * Arms are bent and pump opposite the legs; the body pitches forward.
   */
  private runPose(dt: number, t: Targets, s: Strengths, floor: number) {
    const d = this.d, sc = this.scale, L = d.thigh + d.shin;
    const angry = this.gait === 'stomp';
    const speed = Math.abs(this.rootVX), stride = L * (angry ? 1.7 : 2.3);
    const before = this.runPhase;
    this.runPhase = (this.runPhase + (speed * dt) / stride) % 1;
    const ph = this.runPhase, stanceEnd = angry ? 0.42 : 0.32;
    if ((before < 0.5 && ph >= 0.5) || ph < before) this.events.push({ type: 'step' });
    const root = this.pt(this.rootX, floor - 2);
    const footAt = (off: number, k: 'L' | 'R') => {
      const u = (ph + off) % 1;
      if (u < stanceEnd) return this.off(root, lerp(0.4 * L, -0.45 * L, u / stanceEnd), 0, sideOf(k) * 2.5 * sc);
      const kk = (u - stanceEnd) / (1 - stanceEnd);
      // Heel kicks up behind first, then the leg swings through and reaches far forward.
      const lift = Math.sin(Math.PI * Math.min(1, kk * 1.25)) * L * (angry ? 0.3 : 0.38);
      return this.off(root, lerp(-0.45 * L, 0.4 * L, smooth(kk)), -lift, sideOf(k) * 2.5 * sc);
    };
    const footL = footAt(0, 'L'), footR = footAt(0.5, 'R');
    // Lowest at mid-stance (foot under him), highest in the float; legs reach long at landing.
    const mid = stanceEnd / 2;
    const hip = this.pt(this.rootX, floor - 2 - L * 0.95 + Math.cos((ph - mid) * 4 * Math.PI) * 1.8 * sc);
    this.hipTarget = hip;
    const a = angry ? 0.42 : 0.34; // forward pitch
    const neck = this.off(hip, Math.sin(a) * d.torso, -Math.cos(a) * d.torso);
    // Arms: upper arm swings from the shoulder, forearm bent ~90° forward.
    const amp = angry ? 0.6 : 0.9;
    const armAt = (theta: number, k: 'L' | 'R') => {
      const th = theta + a * 0.4;
      const elbow = this.off(neck, Math.sin(th) * d.upperArm, Math.cos(th) * d.upperArm, sideOf(k) * 4 * sc);
      return this.off(elbow, Math.cos(th) * d.foreArm * (angry ? 0.8 : 1), -Math.sin(th) * d.foreArm * (angry ? 0.8 : 1), -sideOf(k) * 1.5 * sc);
    };
    const swing = Math.sin(ph * 2 * Math.PI) * amp;
    const handL = armAt(swing, 'L'), handR = armAt(-swing, 'R'); // each arm opposite its leg
    this.fillLimbs(t, hip, neck, -0.15, 0, handL, handR, footL, footR);
    Object.assign(s, { hip: 0.3, neck: 0.3, head: 0.3, kneeL: 0.25, kneeR: 0.25, footL: 0.4, footR: 0.4, elbowL: 0.22, elbowR: 0.22, handL: 0.22, handR: 0.22 });
    // Keep the walking feet in sync so stopping or slowing to a walk is seamless.
    this.feet.L.x = footL.x; this.feet.L.z = footL.z; this.feet.R.x = footR.x; this.feet.R.z = footR.z;
    this.feet.L.swinging = this.feet.R.swinging = false;
  }

  /**
   * Given hip, neck, hands and feet, place head, elbows and knees (IK).
   * `nod` tips the head forward, `cock` tips it toward his left (radians).
   * Knees bend the way he faces (and a touch out); elbows bend backward and out.
   */
  private fillLimbs(t: Targets, hip: V3, neck: V3, nod: number, cock: number, handL: V3, handR: V3, footL: V3, footR: V3, yaw = this.yaw, kneeBend = 1) {
    const d = this.d, B = basis(yaw);
    t.hip = hip; t.neck = neck;
    // The head sits on the neck, tipped by nod and cock in his own directions.
    const sn = Math.sin(nod), cn = Math.cos(nod), sk = Math.sin(cock);
    t.head = inFrame(neck, B, sn * d.neck, cn * Math.cos(cock) * d.neck, sk * d.neck);
    t.handL = handL; t.handR = handR; t.footL = footL; t.footR = footR;
    t.elbowL = twoBoneIK3(neck, handL, d.upperArm, d.foreArm, this.elbowPole(B, 'L'));
    t.elbowR = twoBoneIK3(neck, handR, d.upperArm, d.foreArm, this.elbowPole(B, 'R'));
    t.kneeL = twoBoneIK3(hip, footL, d.thigh, d.shin, this.kneePole(B, 'L', kneeBend));
    t.kneeR = twoBoneIK3(hip, footR, d.thigh, d.shin, this.kneePole(B, 'R', kneeBend));
  }

  /** Which way an elbow points: backward, a bit down, and out to its side. */
  private elbowPole(B: Basis, k: 'L' | 'R') {
    const s = sideOf(k);
    return { x: -B.fwd.x - B.up.x * 0.3 + B.left.x * s * 0.6, y: -B.fwd.y - B.up.y * 0.3 + B.left.y * s * 0.6, z: -B.fwd.z - B.up.z * 0.3 + B.left.z * s * 0.6 };
  }

  /** Which way a knee points: forward (flip it with bend -1), a touch out to its side. */
  private kneePole(B: Basis, k: 'L' | 'R', bend = 1) {
    const s = sideOf(k) * 0.25;
    return { x: B.fwd.x * bend + B.left.x * s, y: B.fwd.y * bend + B.left.y * s, z: B.fwd.z * bend + B.left.z * s };
  }

  /** A calm standing pose at x (used as the end of getting up). */
  private standPose(x: number): Targets {
    const d = this.d, sc = this.scale, yaw = this.facing > 0 ? 0 : Math.PI, floor = this.groundY();
    if (this.legCount === 0) {
      // No legs: "standing" is propped up on his arms.
      const hip = this.pt(x, floor - 3 * sc, 0), neck = this.off(hip, Math.sin(1.05) * d.torso, -Math.cos(1.05) * d.torso, 0, yaw);
      const t: Targets = {}, ground = { x: neck.x, y: floor - 2, z: 0 };
      this.fillLimbs(t, hip, neck, -0.5, 0, this.off(ground, 8 * sc, 0, 5 * sc, yaw), this.off(ground, 8 * sc, 0, -5 * sc, yaw), hip, hip, yaw);
      return t;
    }
    const hip = this.pt(x, floor - 2 - this.standHeight(), 0);
    const neck = this.off(hip, 0.5 * sc, -d.torso, 0, yaw);
    const hy = (d.upperArm + d.foreArm) * (0.8 + 0.17 * this.style.armHang);
    const t: Targets = {};
    const footAt = (k: 'L' | 'R') => this.standFoot(k, yaw, x);
    this.fillLimbs(t, hip, neck, 0.05, 0, this.off(neck, 2 * sc, hy, 5 * sc, yaw), this.off(neck, 3 * sc, hy, -5 * sc, yaw), footAt('L'), footAt('R'), yaw);
    return t;
  }

  private crouchPose(x: number): Targets {
    if (this.legCount === 0) return this.standPose(x);
    const d = this.d, sc = this.scale, yaw = this.facing > 0 ? 0 : Math.PI, floor = this.groundY();
    const hip = this.pt(x, floor - 17 * sc, 0);
    const ang = 0.9; // torso pitched forward ~50°
    const neck = this.off(hip, Math.sin(ang) * d.torso, -Math.cos(ang) * d.torso, 0, yaw);
    const ground = this.pt(x, floor - 2, 0);
    const t: Targets = {};
    this.fillLimbs(t, hip, neck, 1.1, 0,
      this.off({ ...neck, y: floor - 2 }, 6 * sc, 0, 4 * sc, yaw), this.off({ ...neck, y: floor - 2 }, 10 * sc, 0, -4 * sc, yaw),
      this.off(ground, -2 * sc, 0, 4 * sc, yaw), this.off(ground, 5 * sc, 0, -4 * sc, yaw), yaw);
    return t;
  }

  private startGetup(onto?: number, atX?: number) {
    const j = this.body.j;
    if (onto !== undefined) this.support = onto;
    else {
      // What is he lying on? Prefer what his hips touch, else anything touching.
      const touching = [j.hip, j.footL, j.footR, j.neck, j.head, ...this.body.points].find((p) => p.on !== NONE);
      this.support = touching ? touching.on : FLOOR;
    }
    const r = this.surfaceRange();
    const x = clamp(atX ?? j.hip.x, r.x1 + 6, r.x2 - 6);
    // Get up facing whichever way his head ended up.
    if (onto === undefined && Math.abs(j.head.x - j.hip.x) > 3) this.facing = sign(j.head.x - j.hip.x);
    const from = {} as Record<JointName, V3>;
    for (const n of JOINTS) from[n] = { x: j[n].x, y: j[n].y, z: j[n].z };
    this.rootZ = 0;
    this.getup = { from, crouch: this.crouchPose(x), stand: this.standPose(x), x };
    this.stayDown = false;
    this.setMode('getup');
  }

  private getupPose(t: Targets, s: Strengths) {
    const g = this.getup!;
    const T1 = 0.6, T2 = 0.55;
    const tm = this.modeTime;
    const a = tm < T1 ? g.from : g.crouch;
    const b = tm < T1 ? g.crouch : g.stand;
    const u = tm < T1 ? smooth(tm / T1) : smooth((tm - T1) / T2);
    for (const n of JOINTS) {
      t[n] = lerp3(a[n]!, b[n]!, u);
      s[n] = tm < T1 ? 0.04 + 0.22 * u : 0.26;
    }
    if (tm >= T1 + T2) {
      this.setMode('ground');
      this.rootX = g.x; this.rootVX = 0; this.rootZ = 0;
      this.plantFeet();
      this.getup = null;
      this.events.push({ type: 'gotUp' });
    }
  }

  private sitPose(t: Targets, s: Strengths) {
    if (this.ledge) { this.ledgePose(t, s); return; }
    if (this.seat) { this.seatPose(t, s); return; }
    const d = this.d, sc = this.scale, P = this.posture, floor = this.groundY();
    const hip = this.pt(this.rootX, floor - 7 * sc);
    const lean = (1 + P.hunch * 8) * sc;
    const neck = this.off(hip, lean, -Math.sqrt(d.torso ** 2 - lean ** 2));
    const ground = this.pt(this.rootX, floor - 2);
    const footL = this.off(ground, 22 * sc, 0, 3 * sc), footR = this.off(ground, 26 * sc, 0, -3 * sc);
    // Knees up, hands resting on them.
    const B = basis(this.yaw);
    const kneeL = twoBoneIK3(hip, footL, d.thigh, d.shin, this.kneePole(B, 'L'));
    const kneeR = twoBoneIK3(hip, footR, d.thigh, d.shin, this.kneePole(B, 'R'));
    const handL = this.gamepad ? this.padHand(hip, 'L') : this.off(kneeL, 2 * sc, 3 * sc, 1 * sc);
    const handR = this.gamepad ? this.padHand(hip, 'R') : this.off(kneeR, 4 * sc, 3 * sc, -1 * sc);
    this.fillLimbs(t, hip, neck, 0.1 + P.hunch * 0.9, 0, handL, handR, footL, footR);
    Object.assign(s, { hip: 0.2, neck: 0.2, head: 0.25, kneeL: 0.15, kneeR: 0.15, footL: 0.2, footR: 0.2, elbowL: 0.08, elbowR: 0.08, handL: 0.08, handR: 0.08 });
  }

  /**
   * Sitting on an edge (Shimeji style): bottom right at the edge, thighs out over it, shins hanging
   * down, feet swinging lazily out of step with each other. Hands on the edge beside him.
   */
  private ledgePose(t: Targets, s: Strengths) {
    const d = this.d, sc = this.scale, P = this.posture, L = this.ledge!, top = this.groundY();
    const p = this.supportPlatform();
    if (p) L.x = L.dir > 0 ? p.x2 : p.x1; // the window may have moved
    const hipX = L.x - L.dir * 5 * sc;
    this.rootX = hipX;
    const hip = this.pt(hipX, top - 4 * sc);
    const lean = (2 + P.hunch * 7) * sc;
    const neck = this.off(hip, lean, -Math.sqrt(d.torso ** 2 - lean ** 2));
    const swing = (k: 'L' | 'R') => Math.sin(this.time * 2.4 + (k === 'L' ? 0 : 2.2)) * (0.5 + 0.5 * Math.sin(this.time * 0.37)) ;
    const knee = (k: 'L' | 'R') => this.off(hip, d.thigh * 0.93, 3 * sc, sideOf(k) * 3.5 * sc);
    const foot = (k: 'L' | 'R') => { const kn = knee(k), a = swing(k) * 0.55; return this.off(kn, Math.sin(a) * d.shin, Math.cos(a) * d.shin, 0); };
    const hand = (k: 'L' | 'R') => this.off(this.pt(hipX, top - 1.5 * sc), -3 * sc, 0, sideOf(k) * 8 * sc);
    const B = basis(this.yaw);
    const fL = foot('L'), fR = foot('R');
    this.fillLimbs(t, hip, neck, 0.25 + P.hunch * 0.7, 0, hand('L'), hand('R'), fL, fR);
    t.kneeL = twoBoneIK3(hip, fL, d.thigh, d.shin, this.kneePole(B, 'L'));
    t.kneeR = twoBoneIK3(hip, fR, d.thigh, d.shin, this.kneePole(B, 'R'));
    Object.assign(s, { hip: 0.3, neck: 0.22, head: 0.25, kneeL: 0.2, kneeR: 0.2, footL: 0.12, footR: 0.12, elbowL: 0.08, elbowR: 0.08, handL: 0.1, handR: 0.1 });
  }

  /**
   * Lying along a couch: hips a bit back from the middle, back propped up on the armrest behind him,
   * head up so he can see past his feet. One leg out straight, the other knee up. A controller rests
   * on his belly, or one hand goes behind his head.
   */
  private seatLiePose(t: Targets, s: Strengths) {
    const d = this.d, sc = this.scale, st = this.seat!, f = this.facing;
    const hipX = st.x - f * 14 * sc;
    this.rootX = hipX;
    const hip = this.pt(hipX, st.y - 3 * sc);
    const neck = this.pt(hipX - f * 25 * sc, st.y - 19 * sc);
    const straight = this.pt(hipX + f * (d.thigh + d.shin) * 0.97, st.y - 3 * sc);
    const kneeUp = this.pt(hipX + f * d.thigh * 0.62, st.y - 3 * sc - d.thigh * 0.78);
    const tucked = this.pt(kneeUp.x + f * d.shin * 0.72, st.y - 3 * sc);
    const front = 'L'; // one leg out straight, the other knee up
    const fL = front === 'L' ? straight : tucked, fR = front === 'L' ? tucked : straight;
    const belly = this.pt((hipX + neck.x) / 2, (hip.y + neck.y) / 2 - 7 * sc);
    const jig = (k: 'L' | 'R') => Math.sin(this.time * 19 + (k === 'L' ? 0 : 1.7)) * this.padMash * 1.2 * sc;
    const hand = (k: 'L' | 'R') => this.gamepad ? this.pt(belly.x + f * 3 * sc, belly.y - 4 * sc + jig(k), sideOf(k) * 2.5 * sc)
      : k === front ? this.pt(belly.x, belly.y + 3 * sc) : this.pt(neck.x - f * 6 * sc, neck.y - d.neck - 2 * sc);
    this.fillLimbs(t, hip, neck, -0.15 * f, 0, hand('L'), hand('R'), fL, fR);
    const B = basis(this.yaw);
    t.kneeL = fL === tucked ? kneeUp : twoBoneIK3(hip, fL, d.thigh, d.shin, this.kneePole(B, 'L'));
    t.kneeR = fR === tucked ? kneeUp : twoBoneIK3(hip, fR, d.thigh, d.shin, this.kneePole(B, 'R'));
    Object.assign(s, { hip: 0.45, neck: 0.35, head: 0.3, kneeL: 0.25, kneeR: 0.25, footL: 0.2, footR: 0.2, elbowL: 0.1, elbowR: 0.1, handL: 0.12, handR: 0.12 });
  }

  /** Holding a controller: both hands together in front of his belly, thumbs going (a little jiggle). */
  private padHand(hip: V3, k: 'L' | 'R'): V3 {
    const sc = this.scale, jig = Math.sin(this.time * 19 + (k === 'L' ? 0 : 1.7)) * this.padMash * 1.2 * sc;
    return this.off(hip, 12 * sc, -12 * sc + jig, sideOf(k) * 2.5 * sc);
  }

  /** On a chair or a couch: bottom on the seat, knees bent over its front edge, feet down toward the floor. */
  private seatPose(t: Targets, s: Strengths) {
    if (this.seatStyle === 'lie') { this.seatLiePose(t, s); return; }
    const d = this.d, sc = this.scale, P = this.posture, st = this.seat!, legLen = d.thigh + d.shin;
    this.rootX = st.x;
    const hip = this.pt(st.x, st.y - 3 * sc);
    const lean = (this.lounge ? -9 : 1.5 + P.hunch * 6) * sc;
    const neck = this.off(hip, lean, -Math.sqrt(Math.max(d.torso ** 2 - lean ** 2, 1)));
    const ground = Math.min(this.bounds.floor, st.y + legLen);
    const foot = (k: 'L' | 'R') => {
      const kn = this.off(hip, d.thigh * 0.95, 1 * sc, sideOf(k) * 3.5 * sc);
      const swing = this.lounge ? 0 : Math.sin(this.time * 1.7 + (k === 'L' ? 0 : 2)) * 0.12;
      return { x: kn.x + this.facing * Math.sin(swing) * d.shin, y: Math.min(ground - 2, kn.y + d.shin * Math.cos(swing)), z: kn.z };
    };
    const fL = foot('L'), fR = foot('R');
    const B = basis(this.yaw);
    const knee = (k: 'L' | 'R', f: V3) => twoBoneIK3(hip, f, d.thigh, d.shin, this.kneePole(B, k));
    const hand = (k: 'L' | 'R') => this.gamepad ? this.padHand(hip, k)
      : this.handTarget && k === this.useHand
      ? this.pt(this.handTarget.x, this.handTarget.y, neck.z)
      : this.lounge ? this.off(neck, -4 * sc, 4 * sc, sideOf(k) * 9 * sc) : this.off(knee(k, k === 'L' ? fL : fR), 1 * sc, -2 * sc, sideOf(k) * 1 * sc);
    this.fillLimbs(t, hip, neck, (this.lounge ? -0.1 : 0.1) + P.hunch * 0.6, 0, hand('L'), hand('R'), fL, fR);
    t.kneeL = knee('L', fL); t.kneeR = knee('R', fR);
    Object.assign(s, { hip: 0.4, neck: 0.25, head: 0.25, kneeL: 0.2, kneeR: 0.2, footL: 0.12, footR: 0.12, elbowL: 0.08, elbowR: 0.08, handL: 0.1, handR: 0.1 });
  }

  private liePose(t: Targets, s: Strengths) {
    // Ease down to sitting, then let go and flop over.
    const k = 1 - smooth(this.modeTime / 0.9);
    if (k <= 0) return;
    this.sitPose(t, s);
    for (const n of JOINTS) s[n] = (s[n] ?? 0) * k;
    if (t.neck) t.neck = this.off(t.neck, -20 * this.scale * (1 - k), 10 * (1 - k));
  }

  private airPose(t: Targets, s: Strengths, k: number) {
    const d = this.d, sc = this.scale, j = this.body.j;
    // A flip in progress: tucked into a ball, spinning head over heels around his middle.
    const fl = this.airFlip;
    if (fl && this.mode === 'air') {
      fl.t += this.dt;
      const u = fl.t / fl.dur;
      if (u < 1) {
        const c = { x: (j.hip.x + j.neck.x) / 2, y: (j.hip.y + j.neck.y) / 2, z: (j.hip.z + j.neck.z) / 2 };
        this.tuck(t, c, fl.turns * 2 * Math.PI * smooth(u));
        for (const n of JOINTS) s[n] = 0.22;
        return;
      }
      this.airFlip = null;
      this.flipDone = true;
    }
    const hip = { x: j.hip.x, y: j.hip.y, z: j.hip.z };
    const vy = (j.hip.y - j.hip.py) / this.dt;
    const neck = this.off(hip, 2 * sc, -d.torso);
    const legLen = d.thigh + d.shin;
    const tuck = vy < 0 ? 0.35 : 0.1; // knees up while rising, reach down while falling
    const falling = vy > 700;
    // Arms: thrown up on the way up (follow-through from the jump), out for balance coming down.
    const handOut = falling ? -16 : vy < -250 ? -18 : 4;
    // One arm out forward and one back (out to his sides a little), legs reaching for the ground.
    const near = this.nearSide, far = near === 'R' ? 'L' : 'R';
    const hands = { [near]: this.off(neck, 14 * sc, handOut * sc, sideOf(near) * 4 * sc), [far]: this.off(neck, -14 * sc, handOut * sc, sideOf(far) * 4 * sc) } as Record<'L' | 'R', V3>;
    this.fillLimbs(t, hip, neck, 0.1, 0, hands.L, hands.R,
      this.off(hip, -4 * sc, legLen * (1 - tuck), 3 * sc), this.off(hip, 7 * sc, legLen * (1 - tuck), -3 * sc));
    for (const n of JOINTS) s[n] = n === 'hip' ? 0 : k;
    // Jump-punching something above him (or reaching up to grab it): front hand up at it.
    const reachUp = this.airPunch ?? this.airReach;
    if (reachUp && this.mode === 'air') {
      const front = this.facing > 0 ? 'R' : 'L';
      const fist = this.aimFrom(neck, reachUp, (d.upperArm + d.foreArm) * 0.98, front);
      t[front === 'R' ? 'handR' : 'handL'] = fist;
      s[front === 'R' ? 'handR' : 'handL'] = 0.35;
      if (this.airPunch && this.modeTime > 0.05 && this.modeTime < 0.7) this.strike = { joint: front === 'R' ? 'handR' : 'handL', power: 0.85, id: this.gestureId };
    }
    // Hanging off your cursor: swinging his legs like a kid on the monkey bars.
    if (this.mode === 'held' && this.held?.self) {
      const a = Math.sin(this.time * 4.5) * 10 * sc;
      t.footL = this.off(hip, a, legLen * 0.9, 3 * sc);
      t.footR = this.off(hip, -a * 0.7, legLen * 0.85, -3 * sc);
      s.footL = s.footR = 0.05;
    }
    // Leaping at a wall: both hands reach out for it.
    if (this.leapWall) {
      const wx = this.wallX(this.leapWall);
      t.handL = { x: wx, y: neck.y - 6 * sc, z: this.latZ('L', 4 * sc) }; t.handR = { x: wx, y: neck.y - 12 * sc, z: this.latZ('R', 4 * sc) };
      s.handL = s.handR = 0.12;
    }
  }

  // ───────────── parkour ─────────────

  /** Set when a flip finished in the air, so landing it can be celebrated. */
  private flipDone = false;

  /**
   * Tucked into a ball (knees to his chest, hands on his shins), around center c,
   * tipped head over heels by `pitch` radians. Used for rolls and flips.
   */
  private tuck(t: Targets, c: V3, pitch: number) {
    const sc = this.scale, B = basis(this.yaw, pitch);
    const at = (f: number, u: number, l = 0) => inFrame(c, B, f * sc, u * sc, l * sc);
    t.hip = at(-3, -7); t.neck = at(7, 12); t.head = at(16, 15);
    t.kneeL = at(11, 4, 3); t.kneeR = at(11, 4, -3);
    t.footL = at(1, -12, 3); t.footR = at(1, -12, -3);
    t.handL = at(10, -6, 5); t.handR = at(10, -6, -5);
    t.elbowL = at(5, 2, 6); t.elbowR = at(5, 2, -6);
  }

  /** Roll forward out of a big landing: tuck, tumble once along the ground, come up on his feet. */
  private startRoll(dir: number, vx: number, vy: number) {
    this.facing = dir;
    this.yaw = dir > 0 ? 0 : Math.PI;
    this.turning = null;
    this.setMode('roll');
    this.rolling = { t: 0, dur: 0.5, dir, x0: this.body.j.hip.x, speed: clamp(vx * 0.6 + 120, 140, 320) };
    this.events.push({ type: 'rolled', speed: vy });
    this.support = this.body.j.footL.grounded ? this.body.j.footL.on : this.body.j.footR.grounded ? this.body.j.footR.on : this.support;
  }

  /** A forward roll on the spot (for show, or because you told him to). */
  rollForward() {
    if (this.mode !== 'ground' || !this.whole) return false;
    this.goalX = null; this.gesture = null;
    this.startRoll(this.facing, 60, 0);
    return true;
  }

  private rollPose(dt: number, t: Targets, s: Strengths) {
    const r = this.rolling!, sc = this.scale, floor = this.groundY();
    r.t += dt;
    const u = clamp(r.t / r.dur, 0, 1);
    const x = r.x0 + r.dir * r.speed * r.t * (1 - u * 0.4);
    this.tuck(t, { x, y: floor - 2 - 14 * sc, z: this.rootZ }, 2 * Math.PI * smooth(u));
    for (const n of JOINTS) s[n] = 0.35;
    if (u >= 1) {
      this.setMode('ground');
      this.rootX = x; this.rootVX = r.dir * r.speed * 0.3;
      this.plantFeet();
      this.crouch = 14 * sc;
      this.events.push({ type: 'step' });
    }
  }

  /** Jump with a flip: +1 = front flip, -1 = backflip. */
  flipJump(turns: 1 | -1, vx = 0, vy = -680) {
    if (this.mode !== 'ground' || !this.whole) return false;
    this.jump(vx, vy);
    this.pendingFlip = turns;
    return true;
  }
  private pendingFlip = 0;

  /** On a wall: kick off it, away from the wall, with a backflip. */
  wallJump(flip = true) {
    if (this.mode !== 'climb' || !this.climb) return false;
    const w = this.climb.wall;
    this.setMode('air');
    this.facing = -w.face;
    this.yaw = this.facing > 0 ? 0 : Math.PI;
    this.body.launch(-w.face * 330, -620, this.dt);
    if (flip) this.airFlip = { t: 0, dur: 0.52, turns: -1 };
    this.events.push({ type: 'wallJump' });
    return true;
  }

  /**
   * Vault onto a ledge just ahead (a low window top, a box he drew): plant his hands on
   * the edge, swing his legs over to the side, and land standing on top. Built as a
   * scripted move from where he is, played by his muscles like a made-up move.
   */
  vault(edgeX: number, topY: number) {
    if (this.mode !== 'ground' || !this.whole) return false;
    const sc = this.scale, f = sign(edgeX - this.rootX) || this.facing;
    this.facing = f;
    const dx = Math.abs(edgeX - this.rootX) / sc, h = (this.groundY() - topY) / sc;
    if (h < 8 || h > 95 || dx > 70) return false;
    const frames: Keyframe[] = [
      { t: 0.13, pose: { hip: [dx * 0.4, 34], neck: [dx * 0.4 + 12, 60], frontHand: [dx, h + 1], backHand: [dx + 4, h + 1], frontFoot: [dx * 0.3 + 4, 6], backFoot: [dx * 0.2, 2] } },
      { t: 0.2, pose: { hip: [dx + 2, h + 24], neck: [dx + 14, h + 46], frontFoot: [dx + 6, h + 14, 18], backFoot: [dx, h + 12, 14] } },
      { t: 0.17, pose: { hip: [dx + 18, h + 40], neck: [dx + 20, h + 70], head: [dx + 21, h + 86], frontFoot: [dx + 23, h + 2], backFoot: [dx + 14, h + 2], frontHand: [dx + 24, h + 42], backHand: [dx + 12, h + 40] } },
    ];
    if (!this.puppet(frames)) return false;
    this.puppetMove!.total -= 0.15; // hand over to landing a little sooner
    this.vaulting = true;
    return true;
  }

  // ───────────── puppet (moves made up by his AI brain) ─────────────

  /**
   * Play a made-up move: his muscles pull each body part toward the keyframe poses
   * in turn. Physics still applies, so impossible poses wobble, topple or float,
   * and when the move ends he drops and lands (or crashes) like any other time.
   * Poses can spin (turn), flip and cartwheel (roll) his whole body in 3D.
   */
  puppet(frames: Keyframe[]) {
    if (!['ground', 'sit', 'lie'].includes(this.mode) || !frames.length) return false;
    const sc = this.scale, f = this.facing, ox = this.rootX, oy = this.groundY(), oz = this.rootZ;
    const map: Record<PuppetJoint, JointName> = {
      head: 'head', neck: 'neck', hip: 'hip',
      frontHand: f > 0 ? 'handR' : 'handL', backHand: f > 0 ? 'handL' : 'handR',
      frontElbow: f > 0 ? 'elbowR' : 'elbowL', backElbow: f > 0 ? 'elbowL' : 'elbowR',
      frontFoot: f > 0 ? 'footR' : 'footL', backFoot: f > 0 ? 'footL' : 'footR',
      frontKnee: f > 0 ? 'kneeR' : 'kneeL', backKnee: f > 0 ? 'kneeL' : 'kneeR',
    };
    // Poses are kept in his own frame (x forward, y up, z = toward his left) and turned
    // onto the screen every step, so he can spin and flip in the middle of a move.
    // "Sideways" in a keyframe means toward his front-hand side: his right when facing right.
    const toLeft = f > 0 ? -1 : 1;
    const yaw0 = f > 0 ? 0 : Math.PI, B0 = basis(yaw0);
    const start = {} as Record<JointName, V3>;
    for (const n of JOINTS) {
      const p = this.body.j[n], dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
      start[n] = { x: dx * B0.fwd.x + dz * B0.fwd.z, y: -dy, z: dx * B0.left.x + dz * B0.left.z };
    }
    const poses = [start];
    const given = new Set<JointName>();
    for (const k of frames) {
      const next = { ...poses[poses.length - 1] };
      for (const [name, xy] of Object.entries(k.pose) as [PuppetJoint, number[]][]) {
        const n = map[name];
        const side = xy.length > 2 && Number.isFinite(xy[2]) ? clamp(xy[2], -60, 60) * toLeft : (SIDE[n] ?? 0);
        next[n] = { x: clamp(xy[0], -300, 300) * sc, y: clamp(xy[1], -20, 400) * sc, z: side * sc };
        given.add(n);
      }
      poses.push(next);
    }
    const auto = new Set<JointName>((['head', 'elbowL', 'elbowR', 'kneeL', 'kneeR'] as JointName[]).filter((n) => !given.has(n)));
    // Body angles at each keyframe (spins, flips and cartwheels add up).
    const deg = (v: number | undefined) => (clamp(v ?? 0, -1440, 1440) * Math.PI) / 180;
    const yaws = [yaw0], pitches = [0], rolls = [0];
    for (const k of frames) {
      yaws.push(yaws[yaws.length - 1] + deg(k.turn) * (f > 0 ? 1 : -1));
      pitches.push(pitches[pitches.length - 1] + deg(k.flip));
      rolls.push(rolls[rolls.length - 1] + deg(k.roll) * toLeft);
    }
    this.goalX = null; this.gesture = null; this.stayDown = false;
    this.setMode('puppet');
    this.yaw = yaws[0];
    const times = frames.map((k) => k.t);
    this.puppetMove = { times, poses, yaws, pitches, rolls, auto, ox, oy, oz, time: 0, total: times.reduce((x, y) => x + y, 0) };
    return true;
  }

  get puppeting() { return this.mode === 'puppet'; }

  /** Stop a made-up move early. */
  endPuppet() { if (this.mode === 'puppet') this.setMode('air'); }

  private puppetPose(dt: number, t: Targets, s: Strengths) {
    const pm = this.puppetMove!, d = this.d;
    pm.time += dt;
    if (pm.time > pm.total + 0.25) {
      // Done: whichever way he ended up facing is his facing now.
      this.yaw = ((this.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      this.facing = this.turnF >= 0 ? 1 : -1;
      this.setMode('air'); this.airPose(t, s, 0.07); return;
    }
    // Which keyframe are we heading to, and how far along?
    let acc = 0, k = 0;
    while (k < pm.times.length - 1 && acc + pm.times[k] < pm.time) { acc += pm.times[k]; k++; }
    const a = pm.poses[k], b = pm.poses[k + 1];
    const u = smooth(pm.times[k] > 0 ? (pm.time - acc) / pm.times[k] : 1);
    this.yaw = lerp(pm.yaws[k], pm.yaws[k + 1], u);
    const pitch = lerp(pm.pitches[k], pm.pitches[k + 1], u), roll = lerp(pm.rolls[k], pm.rolls[k + 1], u);
    // The pose in his own frame, then flipped/cartwheeled around its middle, then turned onto the screen.
    const local = {} as Record<JointName, V3>;
    let cx = 0, cy = 0, cz = 0;
    for (const n of JOINTS) {
      local[n] = lerp3(a[n], b[n], u);
      cx += local[n].x; cy += local[n].y; cz += local[n].z;
    }
    const N = JOINTS.length;
    const B0 = basis(this.yaw), BR = basis(this.yaw, pitch, roll);
    const origin = { x: pm.ox, y: pm.oy, z: pm.oz };
    const pivot = inFrame(origin, B0, cx / N, cy / N, cz / N);
    for (const n of JOINTS) {
      const p = local[n];
      t[n] = inFrame(pivot, BR, p.x - cx / N, p.y - cy / N, p.z - cz / N);
    }
    const hip = t.hip!, neck = t.neck!;
    if (pm.auto.has('head')) {
      const dx = neck.x - hip.x, dy = neck.y - hip.y, dz = neck.z - hip.z, len = Math.hypot(dx, dy, dz) || 1;
      t.head = { x: neck.x + (dx / len) * d.neck, y: neck.y + (dy / len) * d.neck, z: neck.z + (dz / len) * d.neck };
    }
    if (pm.auto.has('elbowL')) t.elbowL = twoBoneIK3(neck, t.handL!, d.upperArm, d.foreArm, this.elbowPole(BR, 'L'));
    if (pm.auto.has('elbowR')) t.elbowR = twoBoneIK3(neck, t.handR!, d.upperArm, d.foreArm, this.elbowPole(BR, 'R'));
    if (pm.auto.has('kneeL')) t.kneeL = twoBoneIK3(hip, t.footL!, d.thigh, d.shin, this.kneePole(BR, 'L'));
    if (pm.auto.has('kneeR')) t.kneeR = twoBoneIK3(hip, t.footR!, d.thigh, d.shin, this.kneePole(BR, 'R'));
    for (const n of JOINTS) s[n] = 0.3;
  }

  // ───────────── climbing ─────────────

  /** Start a climb from wherever his body is now: footholds where his feet are. */
  private startClimb(wall: Wall, dir: -1 | 1, mover: 'L' | 'R') {
    const j = this.body.j, legLen = this.d.thigh + this.d.shin;
    // One foot a little higher than the other, so they step in turn.
    const front = this.facing > 0 ? 'R' : 'L';
    const feet = { L: j.hip.y + legLen * 0.9, R: j.hip.y + legLen * 0.9 };
    feet[front] = j.hip.y + legLen * 0.72;
    this.rootZ = 0;
    this.climb = {
      wall, dir, phase: 'pull', mover, reachTo: null, t: 0, from: { x: j.neck.x, y: j.neck.y, z: j.neck.z },
      feet, step: null, out: Math.abs(j.hip.x - wall.x), bodyY: j.neck.y, pullT: 0,
    };
  }

  /**
   * How far from the wall his hips must be so that a foot on the wall at `footDy`
   * below them can bend its knee toward the wall without the knee going through it.
   * (Climbers push their hips out to get a foot up high.)
   */
  private hipsOutFor(footDy: number) {
    const d = this.d, sc = this.scale;
    for (let out = 13 * sc; out < 26 * sc; out += sc) {
      const knee = twoBoneIK(0, 0, out - 1.5 * sc, footDy, d.thigh, d.shin, -1);
      if (knee.x <= out - 2 * sc) return out;
    }
    return 26 * sc;
  }

  /** Seconds per pull / reach / foot step. Faster when he's lively. */
  private climbTimes() {
    const k = clamp(this.posture.speed, 0.6, 1.5);
    // The next reach starts before the pull is quite done (overlap), so it flows.
    return { pull: 0.34 / k, reach: 0.24 / k, step: 0.2 / k, overlap: 0.65 };
  }

  /**
   * Climbing, hand over hand, for real: both hands are latched onto the wall.
   * 1. Pull: he hauls his body up (an eased motion, not a jump) until the higher
   *    hand is about level with his head.
   * 2. Reach: near the end of the pull, the other hand lets go and travels up past
   *    it in an arc, then latches on, and the next pull begins.
   * Feet stand on footholds on the wall and stay planted while he pulls (his knees
   * straighten), then step up one at a time, knees toward the wall like on a ladder.
   * Hands and feet are a little apart in depth, so the near ones pass in front.
   * Going down is the same with the roles swapped.
   */
  private climbPose(dt: number, t: Targets, s: Strengths) {
    const c = this.climb!, w = c.wall, d = this.d, sc = this.scale, f = w.face, j = this.body.j;
    const armLen = d.upperArm + d.foreArm, legLen = d.thigh + d.shin;
    const T = this.climbTimes();
    c.t += dt; c.pullT += dt;
    const gL = this.grips.L, gR = this.grips.R;
    const held = [gL, gR].filter((g): g is Grip => !!g);
    const top = held.length ? Math.min(...held.map((g) => g.y)) : j.neck.y - armLen * 0.5;
    const bottom = held.length ? Math.max(...held.map((g) => g.y)) : top;
    const wx = this.wallX(w);
    // Where the pull ends: going up, the top hand is just above his head;
    // going down, he hangs from the bottom hand with that arm bent a little.
    // (The hand that stays put during a reach is the one that sets this, so it doesn't change mid-reach.)
    const pullEnd = c.dir < 0 ? top + armLen * 0.05 : bottom + armLen * 0.55;
    const neckY = lerp(c.bodyY, pullEnd, smooth(c.pullT / T.pull));
    // Body leans back on his arms, hips a bit further out than his chest. The hips
    // move out when a foot is up high (room for the knee) and back in as the legs straighten.
    const hipY = neckY + Math.sqrt(d.torso ** 2 - (5 * sc) ** 2);
    const stepY = c.step ? lerp(c.step.from, c.step.to, smooth(c.step.t / T.step)) : Infinity;
    const highest = Math.min(c.feet.L, c.feet.R, stepY) - hipY;
    c.out = lerp(c.out, this.hipsOutFor(highest), 1 - Math.exp(-dt * 10));
    const hip = { x: w.x - f * c.out, y: hipY, z: 0 };
    const neck = { x: hip.x + f * 5 * sc, y: neckY, z: 0 };

    // Feet: planted on their footholds. When one gets too far from his hips, it steps.
    const rel = (k: 'L' | 'R') => c.feet[k] - hip.y;
    if (!c.step) {
      const tooLow = (k: 'L' | 'R') => (c.dir < 0 ? rel(k) > legLen * 0.88 : rel(k) < legLen * 0.5);
      const order: ('L' | 'R')[] = (c.dir < 0 ? rel('L') > rel('R') : rel('L') < rel('R')) ? ['L', 'R'] : ['R', 'L'];
      const k = order.find(tooLow);
      if (k) {
        // Step to a hold that will still be comfortable once this pull is done.
        const ahead = c.phase === 'pull' ? (pullEnd - neckY) * 0.4 : 0;
        const to = clamp(hip.y + legLen * (c.dir < 0 ? 0.5 : 0.9) + ahead, w.y1 + 2, w.y2 - 2);
        c.step = { foot: k, from: c.feet[k], to, t: 0 };
      }
    }
    const footZ = (k: 'L' | 'R') => this.latZ(k, 4 * sc);
    const footPos = (k: 'L' | 'R'): V3 => {
      const st = c.step;
      if (st && st.foot === k) {
        // The stepping foot comes off the wall a little and back on, along an arc.
        const u = smooth(st.t / T.step);
        return { x: wx - f * Math.sin(Math.PI * u) * 6 * sc, y: lerp(st.from, st.to, u), z: footZ(k) };
      }
      // A planted foot can't stay further than the leg reaches; it scrapes along the wall.
      const y = c.feet[k];
      const maxDy = Math.sqrt(Math.max(0, (legLen * 0.98) ** 2 - (wx - hip.x) ** 2));
      c.feet[k] = clamp(y, hip.y - maxDy * 0.3, hip.y + maxDy);
      return { x: wx, y: c.feet[k], z: footZ(k) };
    };
    const footL = footPos('L'), footR = footPos('R');
    if (c.step) {
      c.step.t += dt;
      if (c.step.t >= T.step) { c.feet[c.step.foot] = c.step.to; c.step = null; this.events.push({ type: 'step' }); }
    }

    const hold = (g: Grip | null, k: 'L' | 'R'): V3 => g ? { x: g.x, y: g.y, z: g.z } : c.reachTo ?? { x: wx, y: top, z: this.latZ(k, 5 * sc) };
    this.fillLimbs(t, hip, neck, -0.1, 0, hold(gL, 'L'), hold(gR, 'R'), footL, footR);
    Object.assign(s, { hip: 0.22, neck: 0.3, head: 0.3, kneeL: 0.2, kneeR: 0.2, footL: 0.3, footR: 0.3, elbowL: 0.15, elbowR: 0.15 });

    if (c.phase === 'pull') {
      if (c.pullT >= T.pull * T.overlap) {
        const upperHand = gL && gR ? (gL.y < gR.y ? 'L' : 'R') : gL ? 'L' : 'R';
        const lowerHand = upperHand === 'L' ? 'R' : 'L';
        if (c.dir < 0 && top <= w.y1 + 3) { this.climbOver(w); return; }
        if (c.dir > 0 && hip.y + legLen * 0.9 >= w.y2) { this.letGo(); return; } // at the bottom: drop off
        c.mover = c.dir < 0 ? lowerHand : upperHand;
        const other = this.grips[c.mover === 'L' ? 'R' : 'L'];
        const base = other ? other.y : top;
        c.reachTo = { x: wx, y: clamp(base + c.dir * armLen * 0.8, w.y1 + 2, w.y2 - 2), z: this.latZ(c.mover, 5 * sc) };
        const h = j[c.mover === 'L' ? 'handL' : 'handR'];
        c.from = { x: h.x, y: h.y, z: h.z };
        this.releaseGrip(c.mover);
        c.phase = 'reach'; c.t = 0;
      }
    } else {
      // Reach: the free hand travels to the next hold along an arc away from the wall.
      const handName = c.mover === 'L' ? 'handL' : 'handR';
      const u = smooth(c.t / T.reach), to = c.reachTo!;
      t[handName] = { x: lerp(c.from.x, to.x, u) - f * Math.sin(Math.PI * u) * 7 * sc, y: lerp(c.from.y, to.y, u), z: lerp(c.from.z, to.z, u) };
      s[handName] = 0.35;
      const h = j[handName];
      if (c.t >= T.reach && (Math.hypot(h.x - to.x, h.y - to.y) < 4 * sc || c.t > T.reach * 1.5)) {
        this.grip(c.mover, to);
        c.reachTo = null; c.phase = 'pull'; c.t = 0;
        c.bodyY = neckY; c.pullT = 0;
      }
    }
  }

  /** Reached the top of a wall: onto the window, or onto the ceiling. */
  private climbOver(w: Wall) {
    const f = w.face, sc = this.scale, armLen = this.d.upperArm + this.d.foreArm;
    this.events.push({ type: 'reachedTop' });
    if (w.top === 'platform') {
      const x = w.x + f * 20 * sc;
      const plat = this.platforms.find((p) => Math.abs(p.y - w.y1) < 3 && x >= p.x1 && x <= p.x2);
      if (!plat) { this.letGo(); return; } // the top is covered by another window
      this.releaseGrips();
      this.startGetup(plat.id, w.x + f * 22 * sc); // pull up and over
      return;
    }
    // Top of the screen: swap onto the ceiling and head away from the wall, hand over hand.
    const top = this.bounds.top + 2, wx = this.wallX(w);
    this.setMode('ceiling');
    const lead = f > 0 ? 'L' : 'R', trail = lead === 'L' ? 'R' : 'L';
    this.grip(trail, { x: wx, y: top, z: this.latZ(trail, 4 * sc) });
    this.grip(lead, { x: wx - f * armLen * 0.5, y: top, z: this.latZ(lead, 4 * sc) });
    const j = this.body.j;
    this.hang = { goal: wx - f * 300, phase: 'pull', mover: lead, reachTo: null, t: 0, from: { x: j.neck.x, y: j.neck.y, z: j.neck.z }, bodyX: j.neck.x, pullT: 0 };
  }

  /**
   * Monkey bars. Both hands hold the top of the screen; his body swings forward
   * under the front hand, then the back hand lets go, swings past it in an arc and
   * grabs on. Legs dangle and trail behind the swing.
   */
  private ceilingPose(dt: number, t: Targets, s: Strengths) {
    const h = this.hang!, d = this.d, sc = this.scale, j = this.body.j, top = this.bounds.top + 2;
    const armLen = d.upperArm + d.foreArm, legLen = d.thigh + d.shin;
    const T = this.climbTimes();
    h.t += dt; h.pullT += dt;
    const gL = this.grips.L, gR = this.grips.R;
    const xs = [gL, gR].filter((g): g is Grip => !!g).map((g) => g.x);
    const dir = sign(h.goal - (xs.length ? xs.reduce((a, b) => a + b) / xs.length : j.neck.x));
    this.facing = dir;
    const lead = xs.length ? (dir > 0 ? Math.max(...xs) : Math.min(...xs)) : j.neck.x;
    // Swing the body under the front hand (eased, so it's a swing and not a slide).
    const swingTo = lead - dir * 3 * sc;
    const neckX = lerp(h.bodyX, swingTo, smooth(h.pullT / T.pull));
    const neck = { x: neckX, y: top + armLen * 0.6, z: 0 };
    const swingV = (j.neck.x - j.neck.px) / dt;
    const trail = clamp(-swingV * 0.04, -8, 8) * sc; // legs lag behind the swing
    const hip = { x: neck.x - dir * 2 * sc + trail * 0.4, y: neck.y + d.torso, z: 0 };
    const footL = { x: hip.x + 2 * sc + trail, y: hip.y + legLen, z: this.latZ('L', 3 * sc) };
    const footR = { x: hip.x - 2 * sc + trail, y: hip.y + legLen, z: this.latZ('R', 3 * sc) };
    const hold = (g: Grip | null, k: 'L' | 'R'): V3 => g ? { x: g.x, y: g.y, z: g.z } : h.reachTo ?? { x: lead, y: top, z: this.latZ(k, 4 * sc) };
    this.fillLimbs(t, hip, neck, 0, 0, hold(gL, 'L'), hold(gR, 'R'), footL, footR);
    Object.assign(s, { neck: 0.18, head: 0.25, elbowL: 0.12, elbowR: 0.12, hip: 0.04, kneeL: 0.02, kneeR: 0.02, footL: 0.02, footR: 0.02 });

    if (h.phase === 'pull') {
      if (h.pullT >= T.pull * T.overlap) {
        if (Math.abs(h.goal - lead) < armLen * 0.4) { this.endCeiling(); return; }
        const back = gL && gR ? ((gL.x - gR.x) * dir < 0 ? 'L' : 'R') : gL ? 'R' : 'L';
        h.mover = back;
        h.reachTo = { x: clamp(lead + dir * armLen * 0.7, this.bounds.left + 4, this.bounds.right - 4), y: top, z: this.latZ(back, 4 * sc) };
        const hp = j[back === 'L' ? 'handL' : 'handR'];
        h.from = { x: hp.x, y: hp.y, z: hp.z };
        this.releaseGrip(back);
        h.phase = 'reach'; h.t = 0;
      }
    } else {
      // The free hand swings forward, dipping down and coming back up to the bar.
      const handName = h.mover === 'L' ? 'handL' : 'handR';
      const u = smooth(h.t / T.reach), to = h.reachTo!;
      t[handName] = { x: lerp(h.from.x, to.x, u), y: lerp(h.from.y, to.y, u) + Math.sin(Math.PI * u) * 9 * sc, z: lerp(h.from.z, to.z, u) };
      s[handName] = 0.35;
      const hp = j[handName];
      if (h.t >= T.reach && (Math.hypot(hp.x - to.x, hp.y - to.y) < 4 * sc || h.t > T.reach * 1.5)) {
        this.grip(h.mover, to);
        h.reachTo = null; h.phase = 'pull'; h.t = 0;
        h.bodyX = neckX; h.pullT = 0;
      }
    }
  }

  /** Done with the ceiling: drop, or climb down the screen edge if that's the plan. */
  private endCeiling() {
    const sc = this.scale, armLen = this.d.upperArm + this.d.foreArm, top = this.bounds.top + 2;
    const edge = this.walls.find((w) => w.top === 'ceiling' && Math.abs(w.x - this.body.j.neck.x) < 60 * sc);
    if (this.climbDownAfterCeiling && edge) {
      this.climbDownAfterCeiling = false;
      this.releaseGrips();
      this.facing = edge.face;
      this.setMode('climb');
      const wx = this.wallX(edge), yaw = edge.face > 0 ? 0 : Math.PI;
      this.grip('L', { x: wx, y: top + armLen * 0.2, z: this.latZ('L', 5 * sc, yaw) });
      this.grip('R', { x: wx, y: top + armLen * 0.6, z: this.latZ('R', 5 * sc, yaw) });
      this.startClimb(edge, 1, 'L');
    } else this.letGo();
  }

  private flailOverlay(t: Targets, s: Strengths) {
    const g = this.gesture;
    if (!g || g.name !== 'flail') return;
    g.t += this.dt;
    const j = this.body.j, sc = this.scale, a = g.t * 20;
    t.handL = this.off(j.neck, Math.cos(a) * 20 * sc, Math.sin(a) * 20 * sc, 5 * sc);
    t.handR = this.off(j.neck, -Math.cos(a) * 20 * sc, -Math.sin(a) * 20 * sc, -5 * sc);
    t.footL = this.off(j.hip, Math.sin(a) * 12 * sc, 34 * sc, 3 * sc);
    t.footR = this.off(j.hip, -Math.sin(a) * 12 * sc, 34 * sc, -3 * sc);
    for (const n of ['handL', 'handR', 'footL', 'footR'] as const) s[n] = 0.12;
    if (g.t > GESTURE_TIME.flail) this.gesture = null;
  }
}
