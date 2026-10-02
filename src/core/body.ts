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

  constructor(readonly dims: Dims, x: number, floor: number) {
    const d = dims;
    const hipY = floor - (d.thigh + d.shin);
    const neckY = hipY - d.torso;
    const P = makePoint;
    this.j = {
      head: P(x, neckY - d.neck, d.headR),
      neck: P(x, neckY),
      hip: P(x, hipY),
      elbowL: P(x, neckY + d.upperArm), handL: P(x, neckY + d.upperArm + d.foreArm),
      elbowR: P(x, neckY + d.upperArm), handR: P(x, neckY + d.upperArm + d.foreArm),
      kneeL: P(x - 2, hipY + d.thigh), footL: P(x - 2, floor - 2),
      kneeR: P(x + 2, hipY + d.thigh), footR: P(x + 2, floor - 2),
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
  push(name: JointName, vx: number, vy: number, dt: number) {
    const p = this.j[name];
    p.px -= vx * dt; p.py -= vy * dt;
  }

  /** Give the whole body a velocity (used for jumps). */
  launch(vx: number, vy: number, dt: number) {
    for (const p of this.points) { p.px = p.x - vx * dt; p.py = p.y - vy * dt; }
  }

  velocity(name: JointName, dt: number) {
    const p = this.j[name];
    return { x: (p.x - p.px) / dt, y: (p.y - p.py) / dt };
  }

  maxSpeed(dt: number) {
    let m = 0;
    for (const p of this.points) m = Math.max(m, Math.hypot(p.x - p.px, p.y - p.py) / dt);
    return m;
  }

  /** Move the whole body by an offset without changing its velocity. */
  translate(dx: number, dy: number) {
    for (const p of this.points) { p.x += dx; p.px += dx; p.y += dy; p.py += dy; }
  }
}
