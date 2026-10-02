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

import { Body, JOINTS, makeDims, type Dims, type JointName } from './body';
import { collide, collidePlatforms, FLOOR, integrate, NONE, solveSticks, type Bounds, type Platform } from './physics';
import { clamp, dist, distToSegment, lerp, sign, smooth, twoBoneIK, type Vec } from './math';
import type { Wall } from './world';

export type Mode = 'ground' | 'air' | 'ragdoll' | 'getup' | 'held' | 'sit' | 'lie' | 'climb' | 'ceiling';

export type Gesture = 'stomp' | 'wave' | 'shrug' | 'laugh' | 'flail' | 'pokeBack' | 'stretch' | 'lookAround' | 'cower' | 'dance' | 'nuzzle';

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
  | { type: 'letGo' };          // dropped off a wall or the ceiling

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
export type Gait = 'normal' | 'pocket' | 'skip' | 'stomp' | 'sulk';
const GAITS: Record<Gait, { speed: number; lift: number; bob: number; swing: number; lean: number }> = {
  normal: { speed: 1, lift: 1, bob: 1, swing: 1, lean: 0 },
  pocket: { speed: 0.85, lift: 0.8, bob: 0.7, swing: 0, lean: -2 },
  skip: { speed: 1.1, lift: 2.2, bob: 3.5, swing: 1.8, lean: 1 },
  stomp: { speed: 1.15, lift: 2, bob: 1.5, swing: 0.5, lean: 4 },
  sulk: { speed: 0.75, lift: 0.45, bob: 0.5, swing: 0.25, lean: 0 },
};

/** Mood-driven body language, set from outside (0..1 each, speed ~0.5..1.5). */
export interface Posture { hunch: number; bounce: number; tension: number; speed: number }

type Targets = Partial<Record<JointName, Vec>>;
type Strengths = Partial<Record<JointName, number>>;
interface Foot { x: number; swinging: boolean; t: number; fromX: number; toX: number; dur: number; lift: number }

const GESTURE_TIME: Record<Gesture, number> = {
  stomp: 0.75, wave: 1.4, shrug: 0.9, laugh: 1.9, flail: 1.2, pokeBack: 0.5, stretch: 2.4, lookAround: 2.2, cower: 1.6, dance: 4, nuzzle: 1.6,
};

export class Character {
  readonly body: Body;
  readonly d: Dims;
  mode: Mode = 'ground';
  facing = 1;
  posture: Posture = { hunch: 0, bounce: 0, tension: 0, speed: 1 };
  style: BodyStyle = { ...DEFAULT_BODY };
  gait: Gait = 'normal';
  private runPhase = 0;
  look: Vec | null = null;
  walkSpeed = 62;
  /** When true he stays down after falling / lying (sleeping, sulking). */
  stayDown = false;

  private events: CharEvent[] = [];
  /** Window tops he can stand on (set by the pet from the desktop shell). */
  platforms: Platform[] = [];
  /** What he's standing on: a platform id, FLOOR, or NONE while airborne. */
  support = FLOOR;
  /** Set by skills to steer his front hand (drawing, grabbing); null = normal arm swing. */
  handTarget: Vec | null = null;
  /** Climbable walls (window sides, screen edges). */
  walls: Wall[] = [];
  /** Climbing a wall: which hand moves next, and whether it's pulling or reaching. */
  private climb: { wall: Wall; dir: -1 | 1; phase: 'pull' | 'reach'; mover: 'L' | 'R'; reachTo: Vec | null; t: number } | null = null;
  /** Hanging from the ceiling (monkey bars). */
  private hang: { goal: number; phase: 'pull' | 'reach'; mover: 'L' | 'R'; reachTo: Vec | null; t: number } | null = null;
  /** Hands latched onto a point in the world. A gripped hand stays put; his body hangs from it. */
  private grips: Record<'L' | 'R', Vec | null> = { L: null, R: null };
  /** A wall he's leaping at: he grabs it as soon as a hand gets there. */
  private leapWall: Wall | null = null;
  get onCeiling() { return this.mode === 'ceiling'; }
  /** At the end of the ceiling, climb down the screen edge instead of dropping. */
  climbDownAfterCeiling = false;
  private rootX: number;
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
  private hipTarget: Vec | null = null;
  private getup: { from: Record<JointName, Vec>; crouch: Targets; stand: Targets; x: number } | null = null;
  private held: { joint: JointName; x: number; y: number; vx: number; vy: number } | null = null;
  private gesture: { name: Gesture; t: number; x: number; y: number; fired: boolean } | null = null;
  private jumpPrep: { t: number; vx: number; vy: number } | null = null;

  constructor(public bounds: Bounds, x: number, scale = 1) {
    this.d = makeDims(scale);
    this.body = new Body(this.d, x, bounds.floor);
    this.rootX = x;
    const foot = (fx: number): Foot => ({ x: fx, swinging: false, t: 0, fromX: fx, toX: fx, dur: 0.25, lift: 0 });
    this.feet = { L: foot(x - 3), R: foot(x + 3) };
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

  // ───────────── grabbing ─────────────

  /** Latch a hand onto a point. The hand stays exactly there until released. */
  grip(hand: 'L' | 'R', at: Vec) {
    this.grips[hand] = { x: at.x, y: at.y };
    this.body.j[hand === 'L' ? 'handL' : 'handR'].invMass = 0;
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
    const j = this.body.j, armLen = this.d.upperArm + this.d.foreArm;
    this.leapWall = null;
    this.goalX = null; this.gesture = null; this.jumpPrep = null;
    this.facing = wall.face;
    this.setMode('climb');
    // Two handholds on the wall: one up near his reach, one lower.
    const wx = this.wallX(wall);
    const upper = clamp(j.neck.y - armLen * 0.6, wall.y1 + 2, wall.y2 - 4);
    const lower = clamp(upper + armLen * 0.45, wall.y1 + 2, wall.y2 - 2);
    const upperHand = this.facing > 0 ? 'R' : 'L', lowerHand = upperHand === 'R' ? 'L' : 'R';
    this.grip(upperHand, { x: wx, y: upper });
    this.grip(lowerHand, { x: wx, y: lower });
    this.climb = { wall, dir, phase: 'pull', mover: dir < 0 ? lowerHand : upperHand, reachTo: null, t: 0 };
    return true;
  }

  /** Run-and-jump at a wall, catching it with his hands. */
  leapAt(wall: Wall, vy = -430) {
    if (this.mode !== 'ground') return false;
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
      for (const k of ['L', 'R'] as const) { const g = this.grips[k]; if (g) { g.x += dx; g.y += dy; } }
      if (this.climb.reachTo) { this.climb.reachTo.x += dx; this.climb.reachTo.y += dy; }
    }
    this.climb.wall = now;
  }
  get currentGesture() { return this.gesture?.name ?? null; }

  /** Walk to x. He stops at the edge of whatever he's standing on, unless `offEdge` (then he walks off and drops). */
  walkTo(x: number, run = false, offEdge = false) {
    if (this.mode === 'sit') this.standUp();
    const r = this.surfaceRange();
    const pad = 6 * this.scale;
    this.goalX = offEdge ? clamp(x, this.bounds.left + 20, this.bounds.right - 20) : clamp(x, r.x1 + pad, r.x2 - pad);
    this.running = run;
  }

  /** Left/right ends of what he's standing on. */
  surfaceRange() {
    const p = this.supportPlatform();
    return p ? { x1: p.x1, x2: p.x2 } : { x1: this.bounds.left + 20, x2: this.bounds.right - 20 };
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
    const dy = now.y - before.y;
    // Use the window's own position when we know it (covering part of the edge
    // changes the edge's ends but doesn't move the window).
    const dx = now.wx !== undefined && before.wx !== undefined ? now.wx - before.wx
      : Math.abs((now.x1 - before.x1) - (now.x2 - before.x2)) < 1 ? now.x1 - before.x1 : 0;
    if (!dx && !dy) return;
    this.body.translate(dx, dy);
    this.rootX += dx;
    if (this.goalX !== null) this.goalX += dx;
    for (const f of [this.feet.L, this.feet.R]) { f.x += dx; f.fromX += dx; f.toX += dx; }
    if (this.getup) {
      for (const set of [this.getup.from, this.getup.crouch, this.getup.stand] as Record<string, Vec>[]) {
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
    if (this.mode !== 'ground' || this.jumpPrep) return;
    this.goalX = null;
    this.gesture = null;
    this.jumpPrep = { t: 0, vx, vy };
  }

  sit() {
    if (this.mode !== 'ground') return;
    this.goalX = null; this.gesture = null;
    this.setMode('sit');
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
      for (const [k, side] of [['L', -1], ['R', 1]] as const) {
        const f = this.feet[k];
        f.x = f.fromX = f.toX = this.rootX + side * this.facing * st;
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
    if (at && this.mode === 'ground') this.facing = sign(at.x - this.rootX);
  }

  /** A shove at a joint, in pixels/second. */
  poke(joint: JointName, vx: number, vy: number) {
    this.body.push(joint, vx, vy, this.dt);
    // A hit knocks the wind out of him: muscles go weak for a moment.
    const speed = Math.hypot(vx, vy);
    this.stun = Math.max(this.stun, clamp(speed / 1500, 0, 1) * 0.5);
    if (speed > 1200 && (this.mode === 'climb' || this.mode === 'ceiling')) { this.letGo(); return; } // knocked off
    if (speed > 1500 && (this.mode === 'ground' || this.mode === 'sit')) {
      this.setMode('ragdoll');
      this.events.push({ type: 'tripped' });
    }
  }

  grab(joint: JointName, x: number, y: number) {
    this.releaseGrips();
    this.held = { joint, x, y, vx: 0, vy: 0 };
    this.body.j[joint].invMass = 0;
    this.goalX = null; this.gesture = null; this.jumpPrep = null;
    this.stayDown = false;
    this.setMode('held');
    this.events.push({ type: 'grabbed' });
  }

  moveHold(x: number, y: number, vx: number, vy: number) {
    if (this.held) Object.assign(this.held, { x, y, vx, vy });
  }

  release() {
    if (!this.held) return;
    const p = this.body.j[this.held.joint];
    const max = 2500;
    const vx = clamp(this.held.vx, -max, max), vy = clamp(this.held.vy, -max, max);
    p.invMass = 1;
    p.px = p.x - vx * this.dt; p.py = p.y - vy * this.dt;
    const speed = Math.hypot(vx, vy);
    this.held = null;
    this.setMode(speed > 1300 ? 'ragdoll' : 'air');
    this.events.push({ type: 'released', speed });
  }

  isHeld() { return this.held !== null; }

  /** Which joint (if any) is under the given point. */
  hitTest(x: number, y: number, pad = 7): JointName | null {
    const j = this.body.j;
    const bones: [JointName, JointName][] = [
      ['neck', 'hip'], ['neck', 'elbowL'], ['elbowL', 'handL'], ['neck', 'elbowR'], ['elbowR', 'handR'],
      ['hip', 'kneeL'], ['kneeL', 'footL'], ['hip', 'kneeR'], ['kneeR', 'footR'], ['head', 'neck'],
    ];
    let hit = dist(x, y, j.head.x, j.head.y) < this.d.headR + pad;
    for (const [a, b] of bones) {
      if (hit) break;
      if (distToSegment(x, y, j[a].x, j[a].y, j[b].x, j[b].y) < pad) hit = true;
    }
    if (!hit) return null;
    let best: JointName = 'hip', bestD = Infinity;
    for (const n of JOINTS) {
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
    const t: Targets = {};
    const s: Strengths = {};
    let internal = false;
    this.hipTarget = null;

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
    }

    const b = this.body;
    const hipVY = (b.j.hip.y - b.j.hip.py) / dt;
    integrate(b.points, dt);
    this.applyMuscles(t, s, internal);
    for (const k of ['L', 'R'] as const) {
      const g = this.grips[k];
      if (!g) continue;
      const p = b.j[k === 'L' ? 'handL' : 'handR'];
      p.x = p.px = g.x; p.y = p.py = g.y;
    }
    if (this.held) {
      const p = b.j[this.held.joint];
      p.x = this.held.x; p.y = this.held.y;
      p.px = p.x - this.held.vx * dt; p.py = p.y - this.held.vy * dt;
    }
    for (const p of b.points) { p.grounded = false; p.on = NONE; }
    const friction = this.mode === 'ragdoll' || this.mode === 'lie' ? 0.4 : 0.25;
    for (let i = 0; i < 8; i++) {
      solveSticks(b.sticks);
      collide(b.points, this.bounds, friction);
      collidePlatforms(b.points, this.platforms, friction);
    }
    this.afterStep(dt, hipVY);
  }

  private setMode(m: Mode) {
    if (m !== 'climb') this.climb = null;
    if (m !== 'ceiling') this.hang = null;
    if (m !== 'climb' && m !== 'ceiling') this.releaseGrips();
    if (m !== 'air') this.leapWall = null;
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
    let sx = 0, sy = 0;
    for (const name of JOINTS) {
      const tg = t[name], k = s[name] ?? 0;
      const p = this.body.j[name];
      if (!tg || k <= 0 || p.invMass === 0) continue;
      const dx = (tg.x - p.x) * k * weak, dy = (tg.y - p.y) * k * weak;
      p.x += dx; p.y += dy;
      p.px += dx * DAMP; p.py += dy * DAMP;
      sx += dx; sy += dy;
    }
    if (internal) {
      // In the air muscles can only bend the body, not push it around:
      // cancel the net push so he can't "swim" through the air.
      const n = this.body.points.length;
      const mx = sx / n, my = sy / n;
      for (const p of this.body.points) {
        if (p.invMass === 0) continue;
        p.x -= mx; p.y -= my;
        p.px -= mx * DAMP; p.py -= my * DAMP;
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
          if (hipVYBefore > 1150) { this.crash(hipVYBefore); break; }
          this.setMode('ground');
          this.support = j.footL.grounded ? j.footL.on : j.footR.on;
          this.rootX = j.hip.x;
          this.rootVX = clamp((j.hip.x - j.hip.px) / dt, -150, 150) * 0.5;
          this.plantFeet();
          this.crouch = clamp(hipVYBefore / 1150, 0.15, 1) * 16 * this.scale;
          this.events.push({ type: 'landed', speed: hipVYBefore });
        } else if (otherDown || (anyFoot && upsideDown) || j.handL.grounded || j.handR.grounded) {
          this.crash(Math.max(hipVYBefore, 0));
        }
        break;
      }
      case 'ground': {
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
        const off = tg ? dist(j.hip.x, j.hip.y, tg.x, tg.y) : 0;
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

  private crash(speed: number) {
    this.setMode('ragdoll');
    this.events.push({ type: 'crashed', speed });
  }

  private plantFeet() {
    const j = this.body.j;
    for (const k of ['L', 'R'] as const) {
      const f = this.feet[k];
      f.x = f.fromX = f.toX = j[k === 'L' ? 'footL' : 'footR'].x;
      f.swinging = false; f.t = 0;
    }
  }

  // ───────────────────────── poses ─────────────────────────

  private groundY() { return this.supportPlatform()?.y ?? this.bounds.floor; }

  /** Half the distance between his feet when standing. */
  private stanceHalf() { return (this.d.thigh + this.d.shin) * (0.04 + 0.2 * this.style.spread); }

  /**
   * Hip height above the feet when standing still. At stand = 1 the hip target is
   * a hair higher than the legs can reach, so the bones lock fully straight.
   */
  private standHeight() {
    const L = this.d.thigh + this.d.shin, half = this.stanceHalf();
    const straight = Math.sqrt(L * L - half * half);
    return straight * (0.9 + 0.1 * this.style.stand) + (this.style.stand > 0.97 ? 1.5 * this.scale : 0);
  }

  private groundPose(dt: number, t: Targets, s: Strengths) {
    const d = this.d, P = this.posture, sc = this.scale, j = this.body.j;
    const floor = this.groundY();

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
        this.events.push({ type: 'jumped' });
        this.airPose(t, s, 0.07);
        return;
      }
    }

    // Locomotion: slide an invisible "root" toward the goal; the feet chase it.
    const G = GAITS[this.gait];
    const speedMul = P.speed * (this.running ? 2.3 : G.speed);
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
    const accel = 450 * speedMul;
    this.rootVX += clamp(want - this.rootVX, -accel * dt, accel * dt);
    this.rootX += this.rootVX * dt;
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
    const f = this.facing;

    // Running has its own cycle (see runPose).
    if (this.running && moving && this.crouch < 6 * sc) { this.runPose(dt, t, s, floor); return; }

    // Feet. Walking: the foot that's furthest behind swings forward and lands half
    // a stride ahead of the hips, then the other foot goes — a steady left-right rhythm.
    // Standing: small shuffles keep both feet under him.
    const B = this.style, legLen = d.thigh + d.shin;
    const speed = Math.abs(this.rootVX), dir = sign(this.rootVX);
    const stepLen = B.stride * 26 * sc * (this.running ? 1.3 : 1);
    const stance = this.stanceHalf();
    const ideal = moving
      ? { L: this.rootX, R: this.rootX }
      : { L: this.rootX - f * stance, R: this.rootX + f * stance };
    const stepT = moving ? clamp(stepLen / speed, 0.16, 0.5) : 0.22;
    const landAt = (k: 'L' | 'R', remaining: number) =>
      moving ? this.rootX + this.rootVX * remaining + dir * stepLen * 0.5 : ideal[k];
    const swinging = this.feet.L.swinging ? 'L' : this.feet.R.swinging ? 'R' : null;
    if (!swinging && this.crouch < 6 * sc) {
      let k: 'L' | 'R', need: number, err: number;
      if (moving) {
        const behindL = (this.rootX - this.feet.L.x) * dir, behindR = (this.rootX - this.feet.R.x) * dir;
        k = behindL > behindR ? 'L' : 'R';
        err = Math.max(behindL, behindR);
        need = stepLen * 0.5;
      } else {
        const eL = Math.abs(ideal.L - this.feet.L.x), eR = Math.abs(ideal.R - this.feet.R.x);
        k = eL > eR ? 'L' : 'R';
        err = Math.max(eL, eR);
        need = 2.5 * sc;
      }
      if (err > need) {
        const ft = this.feet[k];
        ft.swinging = true; ft.t = 0; ft.fromX = ft.x;
        ft.dur = stepT;
        ft.toX = landAt(k, stepT);
        ft.lift = (3 + 3 * P.bounce + Math.min(Math.abs(ft.toX - ft.fromX), 40) * 0.08) * sc * B.lift * (moving ? G.lift : 1);
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
    const footY: Record<'L' | 'R', number> = { L: floor, R: floor };
    for (const k of ['L', 'R'] as const) {
      const ft = this.feet[k];
      if (!ft.swinging) continue;
      if (moving) ft.dur = Math.min(ft.dur, stepT); // speeding up? hurry the step
      ft.t += dt / ft.dur;
      const u = Math.min(ft.t, 1);
      ft.toX = lerp(ft.toX, landAt(k, (1 - u) * ft.dur), 0.1);
      ft.x = lerp(ft.fromX, ft.toX, smooth(u));
      // Stomping: slow lift, fast slam.
      footY[k] = floor - Math.sin(Math.PI * (this.gait === 'stomp' && moving ? u ** 1.6 : u)) * ft.lift;
      swingT = u;
      if (ft.t >= 1) ft.swinging = false;
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
      const dx = this.rootX - this.feet[k].x;
      reachH = Math.min(reachH, Math.sqrt(Math.max((legLen * 0.995) ** 2 - dx * dx, (legLen * 0.6) ** 2)));
    }
    this.walkH = lerp(this.walkH || standH, reachH, 0.35);
    const hipH = lerp(standH, Math.min(standH, this.walkH), clamp(speed / 40, 0, 1));
    const hunch = this.gait === 'sulk' && moving ? Math.max(P.hunch, 0.7) : P.hunch;
    const bob = moving
      ? Math.sin(Math.PI * swingT) * (0.4 + 2.5 * P.bounce) * sc * B.bob * G.bob
      : Math.sin(this.time * 2.1) * 0.6 * sc;
    const hip = { x: this.rootX, y: floor - 2 - hipH + this.crouch + hunch * 2 * sc - bob };
    this.hipTarget = hip;

    // Torso leans into motion; sadness hunches it, anger pitches it forward.
    const gaitLean = moving ? f * G.lean * sc : 0;
    const lean = gaitLean + clamp(this.rootVX * 0.05 * B.lean, -10 * sc, 10 * sc) + f * (hunch * 5 + P.tension * 3) * sc + f * this.crouch * 0.5;
    const neck = { x: hip.x + lean, y: hip.y - Math.sqrt(Math.max(d.torso ** 2 - lean ** 2, 1)) };
    // Head up by default; only a real mood drops it.
    let tilt = f * (hunch * 0.6 + (this.gait === 'sulk' && moving ? 0.3 : 0)); // sulking: eyes on the floor
    // Only a slight nod toward what he's looking at; turning to face it does most of the work.
    if (this.look) tilt += f * clamp((this.look.y - neck.y) / 600, -0.15, 0.15);

    // Arms swing opposite the legs.
    const armLen = d.upperArm + d.foreArm;
    const ready = P.tension > 0.5 || (this.gait === 'stomp' && moving); // fists up
    const skipping = this.gait === 'skip' && moving;
    const handY = neck.y + armLen * (ready ? 0.6 : this.gait === 'sulk' && moving ? 0.98 : 0.8 + 0.17 * B.armHang);
    // Even "hanging" arms sit a touch apart (front one forward, back one behind),
    // otherwise in side view they lie on top of the torso and blur into it.
    const frontFwd = f * (ready ? 9 : 5 - 2.5 * B.armHang) * sc;
    const backFwd = f * (ready ? 6 : -(1.5 + 1.5 * B.armHang)) * sc;
    // Each hand swings with the opposite foot, along an arc (it rises a little at either end).
    const swingAmt = 0.65 * B.armSwing * (moving ? G.swing : 1);
    const armAt = (footX: number, fwd: number) => {
      const o = (footX - this.rootX) * swingAmt;
      return { x: neck.x + fwd + o, y: handY - Math.abs(o) * (skipping ? 0.8 : 0.3) };
    };
    const frontIsR = f > 0;
    let handL = armAt(this.feet.R.x, frontIsR ? backFwd : frontFwd);
    let handR = armAt(this.feet.L.x, frontIsR ? frontFwd : backFwd);
    if (this.gait === 'pocket' && !ready) {
      // Hands tucked in his pockets, elbows out.
      const back = { x: hip.x - f * 4 * sc, y: hip.y - 1 * sc }, front = { x: hip.x + f * 2 * sc, y: hip.y - 1 * sc };
      if (frontIsR) { handR = front; handL = back; } else { handL = front; handR = back; }
    }
    let footL = { x: this.feet.L.x, y: footY.L - 2 }, footR = { x: this.feet.R.x, y: footY.R - 2 };
    let hipT = hip, neckT = neck;

    // Gestures layer on top of the base pose.
    const g = this.gesture;
    if (g) {
      g.t += dt;
      const dur = GESTURE_TIME[g.name], u = g.t / dur;
      const front = f > 0 ? 'R' : 'L';
      switch (g.name) {
        case 'stomp': {
          const lift = u < 0.65 ? smooth(u / 0.65) * 18 * sc : Math.max(0, 1 - (u - 0.65) / 0.08) * 18 * sc;
          const fx = this.rootX + f * 7 * sc;
          if (front === 'R') footR = { x: fx, y: floor - 2 - lift }; else footL = { x: fx, y: floor - 2 - lift };
          if (u > 0.73 && !g.fired) { g.fired = true; this.events.push({ type: 'stomped' }); }
          handL = { x: neck.x - f * 6 * sc, y: neck.y + armLen * 0.7 };
          handR = { x: neck.x - f * 3 * sc, y: neck.y + armLen * 0.7 };
          break;
        }
        case 'wave': {
          const w = Math.sin(g.t * 15) * 6 * sc;
          const up = { x: neck.x + f * (9 * sc) + w, y: neck.y - 22 * sc };
          if (front === 'R') handR = up; else handL = up;
          tilt += f * -0.15;
          break;
        }
        case 'shrug': {
          const k = Math.sin(Math.PI * clamp(u, 0, 1));
          handL = { x: neck.x - 15 * sc * k, y: neck.y + (armLen * 0.88) * (1 - k) + 2 * sc * k };
          handR = { x: neck.x + 15 * sc * k, y: handL.y };
          neckT = { x: neck.x, y: neck.y + 3 * sc * k };
          tilt += f * -0.2 * k + 0.25 * k;
          break;
        }
        case 'laugh': {
          const beat = Math.abs(Math.sin(g.t * 18)); // the chuckle bounce
          const front = f > 0 ? 'R' : 'L';
          if (u < 0.45) {
            // Head thrown back, hands on his belly.
            const k = smooth(u / 0.15);
            neckT = { x: neck.x - f * 4 * sc * k, y: neck.y + beat * 1.5 * sc };
            tilt += -f * 0.7 * k;
            handL = { x: hip.x + f * 4 * sc, y: hip.y - 8 * sc };
            handR = { x: hip.x + f * 7 * sc, y: hip.y - 13 * sc };
          } else {
            // Doubled over, slapping his knee.
            const k = smooth((u - 0.45) / 0.15) * (1 - smooth((u - 0.85) / 0.15));
            neckT = { x: neck.x + f * 12 * sc * k, y: neck.y + 8 * sc * k + beat * 1.5 * sc };
            hipT = { x: hip.x - f * 2 * sc * k, y: hip.y + 2 * sc * k };
            tilt += f * 0.5 * k;
            const slap = { x: hip.x + f * 7 * sc, y: hip.y + (d.thigh + d.shin) * 0.4 - Math.abs(Math.sin(g.t * 13)) * 9 * sc * k };
            const rest = { x: neckT.x + f * 4 * sc, y: neckT.y + 18 * sc };
            if (front === 'R') { handR = slap; handL = rest; } else { handL = slap; handR = rest; }
          }
          break;
        }
        case 'dance': {
          // Two beats a second: bob down on the beat, sway side to side, tap alternate feet,
          // and switch between a disco point and hands-on-hips every two beats.
          const b = g.t * 2, ph = b % 1, n = Math.floor(b);
          const sway = Math.sin(b * Math.PI) * 4 * sc;
          const down = (1 - Math.sin(Math.PI * ph)) * 4 * sc;
          hipT = { x: hip.x + sway, y: hip.y + down };
          neckT = { x: hipT.x + sway * 0.6, y: hipT.y - d.torso };
          const lift = Math.sin(Math.PI * ph) * 7 * sc, half = this.stanceHalf() + 2 * sc;
          footL = { x: this.rootX - half, y: floor - 2 - (n % 2 === 0 ? lift : 0) };
          footR = { x: this.rootX + half, y: floor - 2 - (n % 2 === 1 ? lift : 0) };
          const point = Math.floor(b / 2) % 2 === 0;
          const up = { x: neckT.x + 13 * sc, y: neckT.y - 22 * sc }, low = { x: neckT.x - 12 * sc, y: neckT.y + 22 * sc };
          const hipHand = (side: number) => ({ x: hipT.x + side * 7 * sc, y: hipT.y - 5 * sc });
          handR = point ? up : hipHand(1);
          handL = point ? low : hipHand(-1);
          tilt += Math.sin(b * Math.PI) * 0.25;
          break;
        }
        case 'nuzzle': {
          // Being petted: lean into it and sway a little, hands together.
          const k = Math.min(1, u * 4) * Math.min(1, (1 - u) * 4);
          const dir = sign(g.x - neck.x);
          neckT = { x: neck.x + dir * 5 * sc * k, y: neck.y + 2 * sc * k };
          tilt += dir * 0.55 * k + Math.sin(g.t * 6) * 0.15 * k;
          handL = { x: neck.x + f * 5 * sc, y: neck.y + 15 * sc };
          handR = { x: neck.x + f * 8 * sc, y: neck.y + 15 * sc };
          break;
        }
        case 'flail': {
          const a = g.t * 18;
          handL = { x: neck.x + Math.cos(a) * 20 * sc, y: neck.y + Math.sin(a) * 20 * sc };
          handR = { x: neck.x + Math.cos(a + Math.PI) * 20 * sc, y: neck.y + Math.sin(a + Math.PI) * 20 * sc };
          break;
        }
        case 'pokeBack': {
          const k = Math.sin(Math.PI * clamp(u, 0, 1));
          const dx = g.x - neck.x, dy = g.y - neck.y, dd = Math.hypot(dx, dy) || 1;
          const reach = Math.min(dd, armLen * 0.97) * k;
          const tip = { x: neck.x + (dx / dd) * reach, y: neck.y + (dy / dd) * reach };
          const rest = front === 'R' ? handR : handL;
          const h = { x: lerp(rest.x, tip.x, k), y: lerp(rest.y, tip.y, k) };
          if (front === 'R') handR = h; else handL = h;
          break;
        }
        case 'stretch': {
          // Up on his toes with arms overhead, lean back, then let it all go.
          const up = smooth(clamp(u / 0.3, 0, 1)) * (1 - smooth(clamp((u - 0.78) / 0.22, 0, 1)));
          const back = Math.sin(Math.PI * clamp((u - 0.25) / 0.5, 0, 1));
          hipT = { x: hip.x - f * 2 * sc * back, y: hip.y - 3 * sc * up };
          neckT = { x: neck.x - f * 7 * sc * back, y: neck.y - 3 * sc * up };
          handL = { x: lerp(handL.x, neckT.x - 6 * sc - f * 5 * sc * back, up), y: lerp(handL.y, neckT.y - 30 * sc, up) };
          handR = { x: lerp(handR.x, neckT.x + 6 * sc - f * 5 * sc * back, up), y: lerp(handR.y, neckT.y - 30 * sc, up) };
          tilt += -f * 0.6 * back;
          break;
        }
        case 'lookAround': {
          if (!g.fired && u > 0.35) { g.fired = true; this.facing = -this.facing; }
          if (g.fired && u > 0.7 && u < 0.72) this.facing = -this.facing;
          tilt += f * Math.sin(g.t * 3) * 0.3;
          break;
        }
        case 'cower': {
          const k = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5);
          hipT = { x: hip.x, y: hip.y + 10 * sc * k };
          neckT = { x: neck.x - f * 6 * sc * k, y: neck.y + 14 * sc * k };
          handL = { x: neckT.x + f * 6 * sc, y: neckT.y - 8 * sc * k };
          handR = { x: neckT.x + f * 9 * sc, y: neckT.y - 4 * sc * k };
          tilt += -f * 0.5 * k;
          break;
        }
      }
      if (g.t >= dur) this.gesture = null;
    }

    // A skill is steering his front hand (drawing, grabbing the cursor).
    const reachFor = this.handTarget && !g ? this.handTarget : null;
    if (reachFor) {
      const armLen2 = (d.upperArm + d.foreArm) * 0.97;
      const dx = reachFor.x - neckT.x, dy = reachFor.y - neckT.y, dd = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, armLen2 / dd);
      const hand = { x: neckT.x + dx * k, y: neckT.y + dy * k };
      if (f > 0) handR = hand; else handL = hand;
    }
    this.fillLimbs(t, hipT, neckT, tilt, handL, handR, footL, footR, f, 1);
    const plant = (k: 'L' | 'R') => (this.feet[k].swinging ? 0.35 : 0.6);
    Object.assign(s, {
      hip: 0.25, neck: 0.25, head: 0.3, kneeL: 0.2, kneeR: 0.2, footL: plant('L'), footR: plant('R'),
      elbowL: 0.1, elbowR: 0.1, handL: 0.09, handR: 0.09,
    });
    if (g && g.name !== 'lookAround') Object.assign(s, { handL: 0.2, handR: 0.2, elbowL: 0.15, elbowR: 0.15 });
    if (reachFor) Object.assign(s, f > 0 ? { handR: 0.45, elbowR: 0.2 } : { handL: 0.45, elbowL: 0.2 });
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
    const d = this.d, sc = this.scale, f = this.facing, L = d.thigh + d.shin;
    const angry = this.gait === 'stomp';
    const speed = Math.abs(this.rootVX), stride = L * (angry ? 1.7 : 2.3);
    this.runPhase = (this.runPhase + (speed * dt) / stride) % 1;
    const ph = this.runPhase, stanceEnd = angry ? 0.42 : 0.32;
    const footAt = (off: number) => {
      const u = (ph + off) % 1;
      if (u < stanceEnd) return { x: this.rootX + f * lerp(0.4 * L, -0.45 * L, u / stanceEnd), y: floor - 2 };
      const k = (u - stanceEnd) / (1 - stanceEnd);
      // Heel kicks up behind first, then the leg swings through and reaches far forward.
      const lift = Math.sin(Math.PI * Math.min(1, k * 1.25)) * L * (angry ? 0.3 : 0.38);
      return { x: this.rootX + f * lerp(-0.45 * L, 0.4 * L, smooth(k)), y: floor - 2 - lift };
    };
    const footL = footAt(0), footR = footAt(0.5);
    // Lowest at mid-stance (foot under him), highest in the float; legs reach long at landing.
    const mid = stanceEnd / 2;
    const hip = { x: this.rootX, y: floor - 2 - L * 0.95 + Math.cos((ph - mid) * 4 * Math.PI) * 1.8 * sc };
    this.hipTarget = hip;
    const a = angry ? 0.42 : 0.34; // forward pitch
    const neck = { x: hip.x + f * Math.sin(a) * d.torso, y: hip.y - Math.cos(a) * d.torso };
    // Arms: upper arm swings from the shoulder, forearm bent ~90° forward.
    const amp = angry ? 0.6 : 0.9;
    const armAt = (theta: number) => {
      const th = theta + a * 0.4;
      const elbow = { x: neck.x + f * Math.sin(th) * d.upperArm, y: neck.y + Math.cos(th) * d.upperArm };
      return { x: elbow.x + f * Math.cos(th) * d.foreArm * (angry ? 0.8 : 1), y: elbow.y - Math.sin(th) * d.foreArm * (angry ? 0.8 : 1) };
    };
    const swing = Math.sin(ph * 2 * Math.PI) * amp;
    const handL = armAt(swing), handR = armAt(-swing); // each arm opposite its leg
    this.fillLimbs(t, hip, neck, -f * 0.15, handL, handR, footL, footR, f, 1);
    Object.assign(s, { hip: 0.3, neck: 0.3, head: 0.3, kneeL: 0.25, kneeR: 0.25, footL: 0.4, footR: 0.4, elbowL: 0.22, elbowR: 0.22, handL: 0.22, handR: 0.22 });
    // Keep the walking feet in sync so stopping or slowing to a walk is seamless.
    this.feet.L.x = footL.x; this.feet.R.x = footR.x;
    this.feet.L.swinging = this.feet.R.swinging = false;
  }

  /** Given hip, neck, hands and feet, place head, elbows and knees (IK). */
  private fillLimbs(t: Targets, hip: Vec, neck: Vec, tilt: number, handL: Vec, handR: Vec, footL: Vec, footR: Vec, f: number, kneeBend: number) {
    const d = this.d;
    t.hip = hip; t.neck = neck;
    t.head = { x: neck.x + Math.sin(tilt) * d.neck, y: neck.y - Math.cos(tilt) * d.neck };
    t.handL = handL; t.handR = handR; t.footL = footL; t.footR = footR;
    t.elbowL = twoBoneIK(neck.x, neck.y, handL.x, handL.y, d.upperArm, d.foreArm, f);
    t.elbowR = twoBoneIK(neck.x, neck.y, handR.x, handR.y, d.upperArm, d.foreArm, f);
    t.kneeL = twoBoneIK(hip.x, hip.y, footL.x, footL.y, d.thigh, d.shin, -f * kneeBend);
    t.kneeR = twoBoneIK(hip.x, hip.y, footR.x, footR.y, d.thigh, d.shin, -f * kneeBend);
  }

  /** A calm standing pose at x (used as the end of getting up). */
  private standPose(x: number): Targets {
    const d = this.d, sc = this.scale, f = this.facing, floor = this.groundY();
    const hip = { x, y: floor - 2 - this.standHeight() };
    const neck = { x: x + f * 0.5 * sc, y: hip.y - d.torso };
    const hy = neck.y + (d.upperArm + d.foreArm) * (0.8 + 0.17 * this.style.armHang);
    const t: Targets = {};
    this.fillLimbs(t, hip, neck, f * 0.05, { x: neck.x + f * 2 * sc, y: hy }, { x: neck.x + f * 3 * sc, y: hy },
      { x: x - f * this.stanceHalf(), y: floor - 2 }, { x: x + f * this.stanceHalf(), y: floor - 2 }, f, 1);
    return t;
  }

  private crouchPose(x: number): Targets {
    const d = this.d, sc = this.scale, f = this.facing, floor = this.groundY();
    const hip = { x, y: floor - 17 * sc };
    const ang = 0.9; // torso pitched forward ~50°
    const neck = { x: x + f * Math.sin(ang) * d.torso, y: hip.y - Math.cos(ang) * d.torso };
    const t: Targets = {};
    this.fillLimbs(t, hip, neck, f * 1.1,
      { x: neck.x + f * 6 * sc, y: floor - 2 }, { x: neck.x + f * 10 * sc, y: floor - 2 },
      { x: x - f * 2 * sc, y: floor - 2 }, { x: x + f * 5 * sc, y: floor - 2 }, f, 1);
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
    const from = {} as Record<JointName, Vec>;
    for (const n of JOINTS) from[n] = { x: j[n].x, y: j[n].y };
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
      const pa = a[n]!, pb = b[n]!;
      t[n] = { x: lerp(pa.x, pb.x, u), y: lerp(pa.y, pb.y, u) };
      s[n] = tm < T1 ? 0.04 + 0.22 * u : 0.26;
    }
    if (tm >= T1 + T2) {
      this.setMode('ground');
      this.rootX = g.x; this.rootVX = 0;
      this.plantFeet();
      this.getup = null;
      this.events.push({ type: 'gotUp' });
    }
  }

  private sitPose(t: Targets, s: Strengths) {
    const d = this.d, sc = this.scale, f = this.facing, P = this.posture, floor = this.groundY();
    const x = this.rootX;
    const hip = { x, y: floor - 7 * sc };
    const lean = f * (1 + P.hunch * 8) * sc;
    const neck = { x: x + lean, y: hip.y - Math.sqrt(d.torso ** 2 - lean ** 2) };
    const footL = { x: x + f * 22 * sc, y: floor - 2 }, footR = { x: x + f * 26 * sc, y: floor - 2 };
    const kneeL = twoBoneIK(hip.x, hip.y, footL.x, footL.y, d.thigh, d.shin, -f);
    const kneeR = twoBoneIK(hip.x, hip.y, footR.x, footR.y, d.thigh, d.shin, -f);
    this.fillLimbs(t, hip, neck, f * (0.1 + P.hunch * 0.9),
      { x: kneeL.x + f * 2 * sc, y: kneeL.y + 3 * sc }, { x: kneeR.x + f * 4 * sc, y: kneeR.y + 3 * sc }, footL, footR, f, 1);
    Object.assign(s, { hip: 0.2, neck: 0.2, head: 0.25, kneeL: 0.15, kneeR: 0.15, footL: 0.2, footR: 0.2, elbowL: 0.08, elbowR: 0.08, handL: 0.08, handR: 0.08 });
  }

  private liePose(t: Targets, s: Strengths) {
    // Ease down to sitting, then let go and flop over.
    const k = 1 - smooth(this.modeTime / 0.9);
    if (k <= 0) return;
    this.sitPose(t, s);
    for (const n of JOINTS) s[n] = (s[n] ?? 0) * k;
    if (t.neck) t.neck = { x: t.neck.x - this.facing * 20 * this.scale * (1 - k), y: t.neck.y + 10 * (1 - k) };
  }

  private airPose(t: Targets, s: Strengths, k: number) {
    const d = this.d, sc = this.scale, f = this.facing, j = this.body.j;
    const hip = { x: j.hip.x, y: j.hip.y };
    const vy = (j.hip.y - j.hip.py) / this.dt;
    const neck = { x: hip.x + f * 2 * sc, y: hip.y - d.torso };
    const legLen = d.thigh + d.shin;
    const tuck = vy < 0 ? 0.35 : 0.1; // knees up while rising, reach down while falling
    const falling = vy > 700;
    const handOut = falling ? -16 : 4;
    this.fillLimbs(t, hip, neck, f * 0.1,
      { x: neck.x - 14 * sc, y: neck.y + handOut * sc }, { x: neck.x + 14 * sc, y: neck.y + handOut * sc },
      { x: hip.x - f * 4 * sc, y: hip.y + legLen * (1 - tuck) }, { x: hip.x + f * 7 * sc, y: hip.y + legLen * (1 - tuck) },
      f, 1);
    for (const n of JOINTS) s[n] = n === 'hip' ? 0 : k;
    // Leaping at a wall: both hands reach out for it.
    if (this.leapWall) {
      const wx = this.wallX(this.leapWall);
      t.handL = { x: wx, y: neck.y - 6 * sc }; t.handR = { x: wx, y: neck.y - 12 * sc };
      s.handL = s.handR = 0.12;
    }
  }

  // ───────────── climbing ─────────────

  /**
   * Climbing, hand over hand, for real: both hands are latched onto the wall.
   * 1. Pull: muscles haul his body up until the higher hand is just above his head.
   * 2. Reach: the other hand lets go, reaches past it, and latches on higher up.
   * Repeat. (Going down is the same with the roles swapped.) His speed comes from
   * how fast he can pull and reach, not from a number.
   */
  private climbPose(dt: number, t: Targets, s: Strengths) {
    const c = this.climb!, w = c.wall, d = this.d, sc = this.scale, f = w.face, j = this.body.j;
    const armLen = d.upperArm + d.foreArm, legLen = d.thigh + d.shin;
    c.t += dt;
    const gL = this.grips.L, gR = this.grips.R;
    const held = [gL, gR].filter((g): g is Vec => !!g);
    const top = held.length ? Math.min(...held.map((g) => g.y)) : j.neck.y - armLen * 0.5;
    const bottom = held.length ? Math.max(...held.map((g) => g.y)) : top;
    const wx = this.wallX(w);
    // Body hangs just off the wall. Going up he pulls until the top hand is at his
    // chin; going down he hangs from the bottom hand.
    const neck = { x: w.x - f * 9 * sc, y: (c.dir < 0 ? top : bottom) + armLen * 0.1 };
    const hip = { x: neck.x - f * 2 * sc, y: neck.y + d.torso };
    // Feet on the wall, knees up toward it like a ladder; the foot under the reaching hand steps up.
    const moverUp = c.phase === 'reach' && c.mover === 'L' ? 1 : c.phase === 'reach' && c.mover === 'R' ? -1 : 0;
    const footL = { x: wx, y: hip.y + legLen * (0.62 - 0.14 * moverUp) };
    const footR = { x: wx, y: hip.y + legLen * (0.62 + 0.14 * moverUp) };
    let handL = gL ?? c.reachTo ?? { x: wx, y: top }, handR = gR ?? c.reachTo ?? { x: wx, y: top };
    this.fillLimbs(t, hip, neck, -f * 0.1, handL, handR, footL, footR, f, -1);
    Object.assign(s, { hip: 0.22, neck: 0.3, head: 0.3, kneeL: 0.18, kneeR: 0.18, footL: 0.28, footR: 0.28, elbowL: 0.15, elbowR: 0.15 });

    if (c.phase === 'pull') {
      const settled = Math.abs(j.neck.y - neck.y) < 4 * sc || c.t > 0.5;
      if (settled && c.t > 0.12) {
        const upperHand = gL && gR ? (gL.y < gR.y ? 'L' : 'R') : gL ? 'L' : 'R';
        const lowerHand = upperHand === 'L' ? 'R' : 'L';
        if (c.dir < 0 && top <= w.y1 + 3) { this.climbOver(w); return; }
        if (c.dir > 0 && hip.y + legLen * 0.9 >= w.y2) { this.letGo(); return; } // at the bottom: drop off
        c.mover = c.dir < 0 ? lowerHand : upperHand;
        const other = this.grips[c.mover === 'L' ? 'R' : 'L'];
        const base = other ? other.y : top;
        c.reachTo = { x: wx, y: clamp(base + c.dir * armLen * 0.75, w.y1 + 2, w.y2 - 2) };
        this.releaseGrip(c.mover);
        c.phase = 'reach'; c.t = 0;
      }
    } else {
      const handName = c.mover === 'L' ? 'handL' : 'handR';
      t[handName] = c.reachTo!;
      s[handName] = 0.55;
      const h = j[handName];
      if ((Math.hypot(h.x - c.reachTo!.x, h.y - c.reachTo!.y) < 3 * sc && c.t > 0.1) || c.t > 0.6) {
        this.grip(c.mover, c.reachTo!);
        c.reachTo = null; c.phase = 'pull'; c.t = 0;
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
    const lead = f > 0 ? 'L' : 'R';
    this.grip(lead === 'L' ? 'R' : 'L', { x: wx, y: top });
    this.grip(lead, { x: wx - f * armLen * 0.5, y: top });
    this.hang = { goal: wx - f * 300, phase: 'pull', mover: lead, reachTo: null, t: 0 };
  }

  /**
   * Monkey bars. Both hands hold the top of the screen; his body swings under the
   * front hand, then the back hand lets go, reaches past it and grabs on. Legs dangle.
   */
  private ceilingPose(dt: number, t: Targets, s: Strengths) {
    const h = this.hang!, d = this.d, sc = this.scale, j = this.body.j, top = this.bounds.top + 2;
    const armLen = d.upperArm + d.foreArm, legLen = d.thigh + d.shin;
    h.t += dt;
    const gL = this.grips.L, gR = this.grips.R;
    const xs = [gL, gR].filter((g): g is Vec => !!g).map((g) => g.x);
    const dir = sign(h.goal - (xs.length ? xs.reduce((a, b) => a + b) / xs.length : j.neck.x));
    this.facing = dir;
    const lead = xs.length ? (dir > 0 ? Math.max(...xs) : Math.min(...xs)) : j.neck.x;
    // Swing the body under the front hand.
    const neck = { x: lead - dir * 3 * sc, y: top + armLen * 0.6 };
    const hip = { x: neck.x - dir * 2 * sc, y: neck.y + d.torso };
    const footL = { x: hip.x + 2 * sc, y: hip.y + legLen }, footR = { x: hip.x - 2 * sc, y: hip.y + legLen };
    const handL = gL ?? h.reachTo ?? { x: lead, y: top }, handR = gR ?? h.reachTo ?? { x: lead, y: top };
    this.fillLimbs(t, hip, neck, 0, handL, handR, footL, footR, dir, 1);
    Object.assign(s, { neck: 0.18, head: 0.25, elbowL: 0.12, elbowR: 0.12, hip: 0.04, kneeL: 0.02, kneeR: 0.02, footL: 0.02, footR: 0.02 });

    if (h.phase === 'pull') {
      const under = Math.abs(j.neck.x - neck.x) < 4 * sc || h.t > 0.6;
      if (under && h.t > 0.15) {
        if (Math.abs(h.goal - lead) < armLen * 0.4) { this.endCeiling(); return; }
        const back = gL && gR ? ((gL.x - gR.x) * dir < 0 ? 'L' : 'R') : gL ? 'R' : 'L';
        h.mover = back;
        h.reachTo = { x: clamp(lead + dir * armLen * 0.7, this.bounds.left + 4, this.bounds.right - 4), y: top };
        this.releaseGrip(back);
        h.phase = 'reach'; h.t = 0;
      }
    } else {
      const handName = h.mover === 'L' ? 'handL' : 'handR';
      t[handName] = h.reachTo!;
      s[handName] = 0.5;
      const hp = j[handName];
      if ((Math.hypot(hp.x - h.reachTo!.x, hp.y - h.reachTo!.y) < 3 * sc && h.t > 0.1) || h.t > 0.6) {
        this.grip(h.mover, h.reachTo!);
        h.reachTo = null; h.phase = 'pull'; h.t = 0;
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
      const wx = this.wallX(edge);
      this.grip('L', { x: wx, y: top + armLen * 0.2 });
      this.grip('R', { x: wx, y: top + armLen * 0.6 });
      this.climb = { wall: edge, dir: 1, phase: 'pull', mover: 'L', reachTo: null, t: 0 };
    } else this.letGo();
  }

  private flailOverlay(t: Targets, s: Strengths) {
    const g = this.gesture;
    if (!g || g.name !== 'flail') return;
    g.t += this.dt;
    const j = this.body.j, sc = this.scale, a = g.t * 20;
    t.handL = { x: j.neck.x + Math.cos(a) * 20 * sc, y: j.neck.y + Math.sin(a) * 20 * sc };
    t.handR = { x: j.neck.x - Math.cos(a) * 20 * sc, y: j.neck.y - Math.sin(a) * 20 * sc };
    t.footL = { x: j.hip.x + Math.sin(a) * 12 * sc, y: j.hip.y + 34 * sc };
    t.footR = { x: j.hip.x - Math.sin(a) * 12 * sc, y: j.hip.y + 34 * sc };
    for (const n of ['handL', 'handR', 'footL', 'footR'] as const) s[n] = 0.12;
    if (g.t > GESTURE_TIME.flail) this.gesture = null;
  }
}
