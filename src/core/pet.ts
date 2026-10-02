// The Pet ties everything together: body + mood + mind + speech, and turns
// raw mouse input into things that happen to him (poke, grab, throw, pet).

import { Character } from './character';
import { DEFAULT_CONFIG, type PetConfig } from './config';
import type { JointName } from './body';
import type { Bounds } from './physics';
import { Mood } from './mood';
import { Mind, type MindEvent } from './mind';
import { DEFAULT_LESSONS, type Ctx } from './skills';
import { windowPlatforms, type WinRect } from './world';
import { drawBubble, drawCharacter, PixelLayer } from './render';

export { DEFAULT_CONFIG, type PetConfig } from './config';

const STEP = 1 / 120; // physics runs at a fixed 120 steps per second
const SMACK_SPEED = 1400; // cursor speed (px/s) that counts as a smack rather than a brush

export class Pet {
  char: Character;
  readonly mood = new Mood();
  readonly mind = new Mind();
  readonly ctx: Ctx;
  /** Turn his mind off (for debugging poses by hand). */
  paused = false;
  private acc = 0;
  private press: { joint: JointName; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;
  private bubble: { text: string; t: number; ttl: number } | null = null;
  private smackCooldown = 0;
  private pixels = new PixelLayer();
  private rub = { dist: 0, since: 0, lastX: 0, lastY: 0, over: false };

  constructor(bounds: Bounds, readonly config: PetConfig = structuredClone(DEFAULT_CONFIG)) {
    this.char = new Character(bounds, (bounds.left + bounds.right) / 2, config.scale);
    this.applyConfig(config);
    // Start him up in the air so he drops in.
    this.char.body.translate(0, -Math.min(260, (bounds.floor - bounds.top) * 0.4));
    this.char.mode = 'air';
    this.ctx = {
      char: this.char,
      mood: this.mood,
      world: { bounds, cursor: null, cursorMovedAt: -100, time: 0, platforms: [] },
      lessons: { ...DEFAULT_LESSONS },
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
    const look = this.config.look;
    if (look.pixel > 1) this.pixels.draw(ctx, this.char, look);
    else drawCharacter(ctx, this.char, look);
    if (this.bubble) {
      const b = this.bubble;
      const alpha = Math.min(1, b.t * 8, (b.ttl - b.t) * 4);
      drawBubble(ctx, this.char, b.text, alpha, this.ctx.world.bounds);
    }
  }

  /** Apply a (possibly changed) config live. A new size rebuilds his body where he stands. */
  applyConfig(cfg: PetConfig) {
    const resized = this.config.scale !== cfg.scale;
    (this as { config: PetConfig }).config = structuredClone(cfg);
    if (resized && this.ctx) {
      const old = this.char;
      this.char = new Character(old.bounds, old.x, cfg.scale);
      this.char.facing = old.facing;
      this.char.setPlatforms(this.ctx.world.platforms);
      this.ctx.char = this.char;
      this.press = null;
      this.mind.reset(this.ctx);
    }
    this.char.style = { ...cfg.body };
    this.char.setHeadSize(cfg.look.headSize);
  }

  /** Latest window rectangles from the desktop shell (front-most first). */
  setWindows(wins: WinRect[]) {
    const plats = windowPlatforms(wins, this.ctx.world.bounds);
    this.ctx.world.platforms = plats;
    this.char.setPlatforms(plats);
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
    if (this.config.smacking && !this.press && speed > SMACK_SPEED && w.time > this.smackCooldown) {
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

  // ── for the settings window ──

  /** A snapshot of his inner state (shown as live bars in settings). */
  stats() {
    return {
      name: this.config.name,
      mood: { ...this.mood.s },
      label: this.mood.label,
      asleep: this.mood.asleep,
      doing: this.mind.skill?.name ?? this.char.mode,
      recent: this.mind.recent.slice(-8),
    };
  }

  command(cmd: string) {
    if (cmd === 'resetMood') {
      this.mood.s = new Mood().s;
      this.mood.asleep = false;
      this.mind.reset(this.ctx);
      if (this.char.mode === 'lie') this.char.standUp();
      this.say('!');
    } else if (cmd === 'respawn') {
      const b = this.ctx.world.bounds, j = this.char.body.j;
      this.mind.reset(this.ctx);
      if (this.char.isHeld()) this.char.release();
      this.char.body.translate((b.left + b.right) / 2 - j.hip.x, b.top + 120 - j.hip.y);
      this.char.body.launch(0, 0, 1 / 120);
      this.char.mode = 'air';
    }
  }

  // ── saving between runs ──
  save() { return JSON.stringify({ v: 1, mood: this.mood.save(), lessons: this.ctx.lessons }); }
  load(json: string | null) {
    if (!json) return;
    try {
      const d = JSON.parse(json);
      this.mood.load(d.mood);
      if (typeof d.lessons?.safeDrop === 'number') this.ctx.lessons.safeDrop = d.lessons.safeDrop;
    } catch { /* corrupt save: start fresh */ }
  }
}
