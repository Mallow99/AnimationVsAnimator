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

export type Mode = 'ground' | 'air' | 'ragdoll' | 'getup' | 'held' | 'sit' | 'lie';

export type Gesture = 'stomp' | 'wave' | 'shrug' | 'laugh' | 'flail' | 'pokeBack' | 'stretch' | 'lookAround' | 'cower';

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
  | { type: 'carried'; speed: number }; // the window under him moved

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

/** Mood-driven body language, set from outside (0..1 each, speed ~0.5..1.5). */
export interface Posture { hunch: number; bounce: number; tension: number; speed: number }

type Targets = Partial<Record<JointName, Vec>>;
type Strengths = Partial<Record<JointName, number>>;
interface Foot { x: number; swinging: boolean; t: number; fromX: number; toX: number; dur: number; lift: number }

const GESTURE_TIME: Record<Gesture, number> = {
  stomp: 0.75, wave: 1.4, shrug: 0.9, laugh: 1.4, flail: 1.2, pokeBack: 0.5, stretch: 1.8, lookAround: 2.2, cower: 1.6,
};

export class Character {
  readonly body: Body;
  readonly d: Dims;
  mode: Mode = 'ground';
  facing = 1;
  posture: Posture = { hunch: 0, bounce: 0, tension: 0, speed: 1 };
  style: BodyStyle = { ...DEFAULT_BODY };
  look: Vec | null = null;
  walkSpeed = 62;
  /** When true he stays down after falling / lying (sleeping, sulking). */
  stayDown = false;

  private events: CharEvent[] = [];
  /** Window tops he can stand on (set by the pet from the desktop shell). */
  platforms: Platform[] = [];
  /** What he's standing on: a platform id, FLOOR, or NONE while airborne. */
  support = FLOOR;
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
    if (speed > 1500 && (this.mode === 'ground' || this.mode === 'sit')) {
      this.setMode('ragdoll');
      this.events.push({ type: 'tripped' });
    }
  }

  grab(joint: JointName, x: number, y: number) {
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
    }

    const b = this.body;
    const hipVY = (b.j.hip.y - b.j.hip.py) / dt;
    integrate(b.points, dt);
    this.applyMuscles(t, s, internal);
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
    const speedMul = P.speed * (this.running ? 2.3 : 1);
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
        ft.lift = (3 + 3 * P.bounce + (this.running ? 4 : 0) + Math.min(Math.abs(ft.toX - ft.fromX), 40) * 0.08) * sc * B.lift;
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
      footY[k] = floor - Math.sin(Math.PI * u) * ft.lift;
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
    const bob = moving
      ? Math.sin(Math.PI * swingT) * (0.4 + 2.5 * P.bounce) * sc * B.bob
      : Math.sin(this.time * 2.1) * 0.6 * sc;
    const hip = { x: this.rootX, y: floor - 2 - hipH + this.crouch + P.hunch * 2 * sc - bob };
    this.hipTarget = hip;

    // Torso leans into motion; sadness hunches it, anger pitches it forward.
    const lean = clamp(this.rootVX * 0.05 * B.lean, -10 * sc, 10 * sc) + f * (P.hunch * 5 + P.tension * 3) * sc + f * this.crouch * 0.5;
    const neck = { x: hip.x + lean, y: hip.y - Math.sqrt(Math.max(d.torso ** 2 - lean ** 2, 1)) };
    // Head up by default; only a real mood drops it.
    let tilt = f * P.hunch * 0.6;
    if (this.look) tilt += f * clamp((this.look.y - neck.y) / 400, -0.5, 0.5);

    // Arms swing opposite the legs.
    const armLen = d.upperArm + d.foreArm;
    const ready = P.tension > 0.5;
    const handY = neck.y + armLen * (ready ? 0.6 : 0.8 + 0.17 * B.armHang);
    // Even "hanging" arms sit a touch apart (front one forward, back one behind),
    // otherwise in side view they lie on top of the torso and blur into it.
    const frontFwd = f * (ready ? 9 : 5 - 2.5 * B.armHang) * sc;
    const backFwd = f * (ready ? 6 : -(1.5 + 1.5 * B.armHang)) * sc;
    // Each hand swings with the opposite foot, along an arc (it rises a little at either end).
    const swingAmt = 0.65 * B.armSwing;
    const armAt = (footX: number, fwd: number) => {
      const o = (footX - this.rootX) * swingAmt;
      return { x: neck.x + fwd + o, y: handY - Math.abs(o) * 0.3 };
    };
    const frontIsR = f > 0;
    let handL = armAt(this.feet.R.x, frontIsR ? backFwd : frontFwd);
    let handR = armAt(this.feet.L.x, frontIsR ? frontFwd : backFwd);
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
          const shake = Math.abs(Math.sin(g.t * 22)) * 3 * sc;
          hipT = { x: hip.x, y: hip.y + shake };
          neckT = { x: neck.x + f * 5 * sc, y: neck.y + 3 * sc + shake };
          handL = { x: hip.x + f * 5 * sc, y: hip.y - 6 * sc };
          handR = { x: hip.x + f * 8 * sc, y: hip.y - 10 * sc };
          tilt += f * 0.4 * Math.sin(g.t * 22);
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
          const k = Math.sin(Math.PI * clamp(u, 0, 1));
          handL = { x: lerp(handL.x, neck.x - 5 * sc, k), y: lerp(handL.y, neck.y - 27 * sc, k) };
          handR = { x: lerp(handR.x, neck.x + 5 * sc, k), y: lerp(handR.y, neck.y - 27 * sc, k) };
          neckT = { x: neck.x - f * 4 * sc * k, y: neck.y };
          tilt += -f * 0.4 * k;
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

    this.fillLimbs(t, hipT, neckT, tilt, handL, handR, footL, footR, f, 1);
    const plant = (k: 'L' | 'R') => (this.feet[k].swinging ? 0.35 : 0.6);
    Object.assign(s, {
      hip: 0.25, neck: 0.25, head: 0.3, kneeL: 0.2, kneeR: 0.2, footL: plant('L'), footR: plant('R'),
      elbowL: 0.1, elbowR: 0.1, handL: 0.09, handR: 0.09,
    });
    if (g && g.name !== 'lookAround') Object.assign(s, { handL: 0.2, handR: 0.2, elbowL: 0.15, elbowR: 0.15 });
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

  private startGetup() {
    const j = this.body.j;
    // What is he lying on? Prefer what his hips touch, else anything touching.
    const touching = [j.hip, j.footL, j.footR, j.neck, j.head, ...this.body.points].find((p) => p.on !== NONE);
    this.support = touching ? touching.on : FLOOR;
    const r = this.surfaceRange();
    const x = clamp(j.hip.x, r.x1 + 6, r.x2 - 6);
    // Get up facing whichever way his head ended up.
    if (Math.abs(j.head.x - j.hip.x) > 3) this.facing = sign(j.head.x - j.hip.x);
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
