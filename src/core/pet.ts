// The Pet ties everything together: body + mood + mind + speech, and turns
// raw mouse input into things that happen to him (poke, grab, throw, pet).

import { Character } from './character';
import type { JointName } from './body';
import type { Bounds } from './physics';
import { Mood } from './mood';
import { Mind, type MindEvent } from './mind';
import type { Ctx } from './skills';
import { drawBubble, drawCharacter, type Style } from './render';

export type MindMode = 'offline' | 'chat' | 'full';

export interface PetConfig {
  name: string;
  scale: number;
  style: Style;
  /** offline = instinct only. chat / full = LLM (milestone 4). */
  mind: MindMode;
}

export const DEFAULT_CONFIG: PetConfig = {
  name: 'Orange',
  scale: 1.1,
  style: { color: '#f7931e', lineWidth: 4.5, showJoints: false },
  mind: 'offline',
};

const STEP = 1 / 120; // physics runs at a fixed 120 steps per second
const SMACK_SPEED = 1400; // cursor speed (px/s) that counts as a smack rather than a brush

export class Pet {
  readonly char: Character;
  readonly mood = new Mood();
  readonly mind = new Mind();
  readonly ctx: Ctx;
  /** Turn his mind off (for debugging poses by hand). */
  paused = false;
  private acc = 0;
  private press: { joint: JointName; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;
  private bubble: { text: string; t: number; ttl: number } | null = null;
  private smackCooldown = 0;
  private rub = { dist: 0, since: 0, lastX: 0, lastY: 0, over: false };

  constructor(bounds: Bounds, readonly config: PetConfig = DEFAULT_CONFIG) {
    this.char = new Character(bounds, (bounds.left + bounds.right) / 2, config.scale);
    // Start him up in the air so he drops in.
    this.char.body.translate(0, -Math.min(260, (bounds.floor - bounds.top) * 0.4));
    this.char.mode = 'air';
    this.ctx = {
      char: this.char,
      mood: this.mood,
      world: { bounds, cursor: null, cursorMovedAt: -100, time: 0 },
      look: 'default',
      say: (text, secs) => this.say(text, secs),
    };
  }

  /** Advance by real elapsed seconds (any frame rate). */
  update(dt: number) {
    dt = Math.min(dt, 0.1); // after a stall (laptop asleep), don't try to catch up forever
    this.ctx.world.time += dt;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.char.step(STEP);
      this.acc -= STEP;
    }
    for (const e of this.char.drainEvents()) this.mind.onEvent(this.ctx, e);
    if (!this.paused) this.mind.update(this.ctx, dt);
    if (this.bubble && (this.bubble.t += dt) > this.bubble.ttl) this.bubble = null;
  }

  say(text: string, secs?: number) {
    this.bubble = { text, t: 0, ttl: secs ?? Math.min(1.8 + text.length * 0.06, 5) };
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawCharacter(ctx, this.char, this.config.style);
    if (this.bubble) {
      const b = this.bubble;
      const alpha = Math.min(1, b.t * 8, (b.ttl - b.t) * 4);
      drawBubble(ctx, this.char, b.text, alpha, this.ctx.world.bounds);
    }
  }

  setBounds(b: Bounds) { this.char.setBounds(b); this.ctx.world.bounds = b; }

  /** Is the cursor over him? (decides whether clicks reach us or the desktop) */
  hit(x: number, y: number) { return this.char.hitTest(x, y) !== null; }

  private emit(e: MindEvent) { this.mind.onEvent(this.ctx, e); }

  // ── input ──

  /**
   * The cursor moved (anywhere on screen), with its velocity in px/s.
   * Slow rubbing back and forth over him = petting. Swiping through him fast = a smack.
   */
  cursor(x: number, y: number, vx = 0, vy = 0) {
    const w = this.ctx.world, r = this.rub;
    const speed = Math.hypot(vx, vy);
    if (!this.press && speed > SMACK_SPEED && w.time > this.smackCooldown) {
      // Check along the path the cursor just travelled, so a fast swipe can't skip over him.
      const steps = Math.ceil(Math.hypot(x - r.lastX, y - r.lastY) / 6);
      for (let i = 0; i <= steps; i++) {
        const px = r.lastX + ((x - r.lastX) * i) / (steps || 1), py = r.lastY + ((y - r.lastY) * i) / (steps || 1);
        const joint = this.char.hitTest(px, py, 4);
        if (!joint) continue;
        const k = Math.min(speed, 5000) / speed * 0.55; // a share of the swipe's speed goes into him
        this.char.poke(joint, vx * k, vy * k - 150);
        this.smackCooldown = w.time + 0.35;
        this.emit({ type: 'smacked', speed });
        break;
      }
    }
    w.cursor = { x, y };
    w.cursorMovedAt = w.time;
    const over = !this.press && speed < 1200 && this.char.hitTest(x, y, 14) !== null;
    if (over) {
      if (!r.over || w.time - r.since > 2.5) { r.dist = 0; r.since = w.time; }
      r.dist += Math.hypot(x - r.lastX, y - r.lastY);
      if (r.dist > 350) { r.dist = 0; r.since = w.time; this.emit({ type: 'petted' }); }
    }
    r.over = over; r.lastX = x; r.lastY = y;
  }

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
    this.emit({ type: 'poked' });
  }

  get dragging() { return this.press !== null; }

  // ── saving between runs ──
  save() { return JSON.stringify({ v: 1, mood: this.mood.save() }); }
  load(json: string | null) {
    if (!json) return;
    try { this.mood.load(JSON.parse(json).mood); } catch { /* corrupt save: start fresh */ }
  }
}
