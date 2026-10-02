// The Pet ties everything together: the character's body plus input
// (pokes, grabs, throws). Later milestones add mood, mind and speech here.

import { Character } from './character';
import type { JointName } from './body';
import type { Bounds } from './physics';
import { drawCharacter, type Style } from './render';

export interface PetConfig { scale: number; style: Style }

export const DEFAULT_CONFIG: PetConfig = {
  scale: 1.1,
  style: { color: '#f7931e', lineWidth: 4.5, showJoints: false },
};

const STEP = 1 / 120; // physics runs at a fixed 120 steps per second

export class Pet {
  readonly char: Character;
  private acc = 0;
  private press: { joint: JointName; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;

  constructor(bounds: Bounds, readonly config: PetConfig = DEFAULT_CONFIG) {
    this.char = new Character(bounds, (bounds.left + bounds.right) / 2, config.scale);
    // Start him up in the air so he drops in.
    this.char.body.translate(0, -(bounds.floor - bounds.top) * 0.6);
    this.char.mode = 'air';
  }

  /** Advance by real elapsed seconds (any frame rate). */
  update(dt: number) {
    this.acc += Math.min(dt, 0.1); // after a stall, don't try to catch up forever
    while (this.acc >= STEP) {
      this.char.step(STEP);
      this.acc -= STEP;
    }
    this.char.drainEvents();
  }

  draw(ctx: CanvasRenderingContext2D) { drawCharacter(ctx, this.char, this.config.style); }

  setBounds(b: Bounds) { this.char.setBounds(b); }

  /** Is the cursor over him? (decides whether clicks reach us or the desktop) */
  hit(x: number, y: number) { return this.char.hitTest(x, y) !== null; }

  // ── input ──
  // Press on him: nothing yet. Drag (or hold a moment) = pick up. Quick click = poke.
  pointerDown(x: number, y: number, now: number) {
    const joint = this.char.hitTest(x, y);
    if (!joint) return false;
    this.press = { joint, x, y, t: now, moved: false, grabbed: false };
    return true;
  }

  pointerMove(x: number, y: number, vx: number, vy: number, now: number) {
    const p = this.press;
    if (!p) return;
    if (Math.hypot(x - p.x, y - p.y) > 5) p.moved = true;
    if (!p.grabbed && (p.moved || now - p.t > 180)) {
      p.grabbed = true;
      this.char.grab(p.joint, x, y);
    }
    if (p.grabbed) this.char.moveHold(x, y, vx, vy);
  }

  pointerUp(x: number, _y: number) {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.grabbed) { this.char.release(); return; }
    // A poke: push away from where you clicked.
    const hip = this.char.body.j.hip;
    const dir = Math.abs(x - hip.x) > 2 ? Math.sign(hip.x - x) : -this.char.facing;
    this.char.poke(p.joint, dir * 500, -80);
  }

  get dragging() { return this.press !== null; }
}
