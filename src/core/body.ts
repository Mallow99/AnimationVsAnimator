// The stick figure's skeleton: 11 joints joined by 10 bones.
//
//        (head)
//          |
//  hand-elbow-neck-elbow-hand      (shoulders sit at the neck, Animator-vs-Animation style)
//          |
//         hip
//        /   \
//     knee   knee
//      |       |
//    foot     foot

import { makePoint, type Point, type Stick } from './physics';

export const JOINTS = ['head', 'neck', 'hip', 'elbowL', 'handL', 'elbowR', 'handR', 'kneeL', 'footL', 'kneeR', 'footR'] as const;
export type JointName = (typeof JOINTS)[number];

/** His four limbs. Each can come off at the shoulder or hip (milestone: destructible). */
export const LIMBS = ['armL', 'armR', 'legL', 'legR'] as const;
export type LimbId = (typeof LIMBS)[number];
/** The joints of a limb: where it attaches (stays with the body), its middle, and its end. */
export const LIMB_JOINTS: Record<LimbId, { root: JointName; mid: JointName; end: JointName }> = {
  armL: { root: 'neck', mid: 'elbowL', end: 'handL' }, armR: { root: 'neck', mid: 'elbowR', end: 'handR' },
  legL: { root: 'hip', mid: 'kneeL', end: 'footL' }, legR: { root: 'hip', mid: 'kneeR', end: 'footR' },
};
/** Which limb a joint belongs to (null for head, neck, hip). */
export function limbOf(j: JointName): LimbId | null {
  for (const l of LIMBS) if (LIMB_JOINTS[l].mid === j || LIMB_JOINTS[l].end === j) return l;
  return null;
}

export interface Dims {
  headR: number; neck: number; torso: number;
  upperArm: number; foreArm: number; thigh: number; shin: number;
}

export function makeDims(scale: number): Dims {
  return {
    headR: 9 * scale, neck: 13 * scale, torso: 30 * scale,
    upperArm: 15 * scale, foreArm: 15 * scale, thigh: 20 * scale, shin: 20 * scale,
  };
}

export class Body {
  readonly j: Record<JointName, Point>;
  readonly points: Point[];
  readonly sticks: Stick[];
  /** Each limb's bones (to break them when it comes off, and mend them when it goes back on). */
  readonly limbSticks: Record<LimbId, Stick[]>;
  /** Joints of limbs that are missing: they ride along at the stump, invisible, until the limb is back. */
  readonly ghost = new Set<JointName>();

  constructor(readonly dims: Dims, x: number, floor: number) {
    const d = dims;
    const hipY = floor - (d.thigh + d.shin);
    const neckY = hipY - d.torso;
    const P = makePoint;
    // Left limbs start a little behind (z < 0), right ones a little in front: he starts out facing right.
    this.j = {
      head: P(x, neckY - d.neck, d.headR),
      neck: P(x, neckY),
      hip: P(x, hipY),
      elbowL: P(x, neckY + d.upperArm, 2, -3), handL: P(x, neckY + d.upperArm + d.foreArm, 2, -4),
      elbowR: P(x, neckY + d.upperArm, 2, 3), handR: P(x, neckY + d.upperArm + d.foreArm, 2, 4),
      kneeL: P(x - 2, hipY + d.thigh, 2, -2), footL: P(x - 2, floor - 2, 2, -3),
      kneeR: P(x + 2, hipY + d.thigh, 2, 2), footR: P(x + 2, floor - 2, 2, 3),
    };
    this.points = JOINTS.map((n) => this.j[n]);
    const j = this.j;
    const S = (a: Point, b: Point, len: number, minOnly = false): Stick => ({ a, b, len, minOnly });
    this.sticks = [
      S(j.head, j.neck, d.neck), S(j.neck, j.hip, d.torso),
      S(j.neck, j.elbowL, d.upperArm), S(j.elbowL, j.handL, d.foreArm),
      S(j.neck, j.elbowR, d.upperArm), S(j.elbowR, j.handR, d.foreArm),
      S(j.hip, j.kneeL, d.thigh), S(j.kneeL, j.footL, d.shin),
      S(j.hip, j.kneeR, d.thigh), S(j.kneeR, j.footR, d.shin),
      // Soft limits so the ragdoll can't fold flat onto itself.
      S(j.head, j.hip, (d.neck + d.torso) * 0.8, true),
      S(j.hip, j.footL, (d.thigh + d.shin) * 0.35, true),
      S(j.hip, j.footR, (d.thigh + d.shin) * 0.35, true),
      S(j.neck, j.handL, (d.upperArm + d.foreArm) * 0.3, true),
      S(j.neck, j.handR, (d.upperArm + d.foreArm) * 0.3, true),
    ];
    const st = this.sticks;
    this.limbSticks = { armL: [st[2], st[3], st[13]], armR: [st[4], st[5], st[14]], legL: [st[6], st[7], st[11]], legR: [st[8], st[9], st[12]] };
  }

  /** Is this limb attached? */
  has(l: LimbId) { return !this.ghost.has(LIMB_JOINTS[l].end); }

  /** Take a limb off the body: its bones break and its joints become invisible passengers at the stump. */
  removeLimb(l: LimbId) {
    const { mid, end } = LIMB_JOINTS[l];
    for (const s of this.limbSticks[l]) s.off = true;
    for (const n of [mid, end]) { this.ghost.add(n); this.j[n].invMass = 0; }
    this.parkGhosts();
  }

  /** Put a limb back on, with its middle and end where the loose limb's were. */
  restoreLimb(l: LimbId, mid: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) {
    const J = LIMB_JOINTS[l];
    for (const [n, at] of [[J.mid, mid], [J.end, end]] as const) {
      const p = this.j[n];
      this.ghost.delete(n);
      p.x = p.px = at.x; p.y = p.py = at.y; p.z = p.pz = at.z;
      p.invMass = 1;
    }
    for (const s of this.limbSticks[l]) s.off = false;
  }

  /** Missing limbs' joints sit at their stump, so nothing that reads them gets a crazy position. */
  parkGhosts() {
    for (const l of LIMBS) {
      if (this.has(l)) continue;
      const J = LIMB_JOINTS[l], r = this.j[J.root];
      for (const n of [J.mid, J.end]) { const p = this.j[n]; p.x = p.px = r.x; p.y = p.py = r.y; p.z = p.pz = r.z; }
    }
  }

  /** Resize the head (and the neck that holds it) on the fly. */
  setHead(headR: number, neck: number) {
    this.dims.headR = headR;
    this.dims.neck = neck;
    this.j.head.r = headR;
    this.sticks[0].len = neck;
    this.sticks[10].len = (neck + this.dims.torso) * 0.8;
  }

  /** Shove one joint with a velocity (pixels/second). */
  push(name: JointName, vx: number, vy: number, dt: number, vz = 0) {
    const p = this.j[name];
    p.px -= vx * dt; p.py -= vy * dt; p.pz -= vz * dt;
  }

  /** Give the whole body a velocity (used for jumps). */
  launch(vx: number, vy: number, dt: number, vz = 0) {
    for (const p of this.points) { p.px = p.x - vx * dt; p.py = p.y - vy * dt; p.pz = p.z - vz * dt; }
  }

  velocity(name: JointName, dt: number) {
    const p = this.j[name];
    return { x: (p.x - p.px) / dt, y: (p.y - p.py) / dt, z: (p.z - p.pz) / dt };
  }

  maxSpeed(dt: number) {
    let m = 0;
    for (const p of this.points) m = Math.max(m, Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz) / dt);
    return m;
  }

  /** Move the whole body by an offset without changing its velocity. */
  translate(dx: number, dy: number, dz = 0) {
    for (const p of this.points) { p.x += dx; p.px += dx; p.y += dy; p.py += dy; p.z += dz; p.pz += dz; }
  }
}
