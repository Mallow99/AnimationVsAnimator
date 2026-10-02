// The Pet ties everything together: body + mood + mind + speech, and turns
// raw mouse input into things that happen to him (poke, grab, throw, pet).

import { Character } from './character';
import { DEFAULT_CONFIG, type PetConfig } from './config';
import type { JointName } from './body';
import type { Bounds } from './physics';
import { Mood, MOOD_PRESETS, type MoodState } from './mood';
import { Mind, type MindEvent } from './mind';
import { DEFAULT_LESSONS, type Ctx } from './skills';
import { windowPlatforms, windowWalls, type WinRect } from './world';
import { drawBubble, drawCharacter, PixelLayer, shade } from './render';
import { DOODLE_LIFE, drawDoodles } from './doodles';

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
  /** Set by the app: moves the real mouse cursor (desktop only). */
  onMoveCursor: ((x: number, y: number) => void) | null = null;
  private cursorCmd: { x: number; y: number; t: number } | null = null;
  private hearts: { x: number; y: number; t: number; drift: number }[] = [];
  private winTarget: WinRect[] | null = null;
  private winShown: WinRect[] = [];
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
      world: { bounds, cursor: null, cursorMovedAt: -100, time: 0, platforms: [], walls: windowWalls([], bounds) },
      lessons: { ...DEFAULT_LESSONS },
      look: 'default',
      say: (text, secs) => this.say(text, secs),
      doodles: [],
      inkColor: shade(this.config.look.color, -0.35),
      moveCursor: (x, y) => this.moveCursor(x, y),
      cursorEscaped: false,
      canGrabCursor: false,
    };
  }

  /** Advance by real elapsed seconds (any frame rate). */
  update(dt: number) {
    dt = Math.min(dt, 0.1); // after a stall (laptop asleep), don't try to catch up forever
    this.ctx.world.time += dt;
    this.ctx.canGrabCursor = this.config.mischief && !!this.onMoveCursor;
    this.acc += dt;
    this.smoothWindows(dt);
    while (this.acc >= STEP) {
      this.char.step(STEP);
      this.acc -= STEP;
    }
    for (const e of this.char.drainEvents()) this.mind.onEvent(this.ctx, e);
    if (!this.paused) this.mind.update(this.ctx, dt);
    if (this.bubble && (this.bubble.t += dt) > this.bubble.ttl) this.bubble = null;
    for (const h of this.hearts) { h.t += dt; h.y -= 40 * dt; h.x += h.drift * dt; }
    this.hearts = this.hearts.filter((h) => h.t < 1.4);
    this.ctx.doodles = this.ctx.doodles.filter((d) => this.ctx.world.time - d.born < DOODLE_LIFE);
  }

  say(text: string, secs?: number) {
    this.bubble = { text, t: 0, ttl: secs ?? Math.min(1.8 + text.length * 0.06, 5) };
  }

  draw(ctx: CanvasRenderingContext2D) {
    const look = this.config.look;
    if (look.pixel > 1) this.pixels.draw(ctx, this.char, look);
    else drawCharacter(ctx, this.char, look);
    drawDoodles(ctx, this.ctx.doodles, this.ctx.world.time);
    // His pen, while he's drawing.
    if (this.mind.skill?.name === 'doodle' && this.char.handTarget) {
      const h = this.char.frontHand, tip = this.char.handTarget;
      ctx.save(); ctx.strokeStyle = this.ctx.inkColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(tip.x, tip.y); ctx.stroke(); ctx.restore();
    }
    for (const h of this.hearts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - h.t / 1.4);
      ctx.fillStyle = '#ff5c8a';
      ctx.font = `${Math.round(14 + h.t * 6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', h.x, h.y);
      ctx.restore();
    }
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
      this.char.setWalls(this.ctx.world.walls);
      this.ctx.char = this.char;
      this.press = null;
      this.mind.reset(this.ctx);
    }
    this.char.style = { ...cfg.body };
    if (this.ctx) this.ctx.inkColor = shade(cfg.look.color, -0.35);
    this.char.setHeadSize(cfg.look.headSize);
  }

  /** Mischief: move the real cursor to (x, y). Only when mischief mode is on and the desktop supports it. */
  private moveCursor(x: number, y: number) {
    if (!this.config.mischief || !this.onMoveCursor) return false;
    this.onMoveCursor(x, y);
    this.cursorCmd = { x, y, t: this.ctx.world.time };
    this.ctx.world.cursor = { x, y };
    return true;
  }

  /** His standing height plus a little: window tops closer than this to the top of the screen are no use. */
  private headroom() { const d = this.char.d; return d.thigh + d.shin + d.torso + d.neck + d.headR + 10; }

  /**
   * Latest window rectangles from the desktop shell (front-most first).
   * They arrive a few dozen times a second at most, so instead of jumping to each
   * new position we glide toward it every frame — that keeps rides smooth.
   */
  setWindows(wins: WinRect[]) { this.winTarget = wins.map((w) => ({ ...w })); }

  private smoothWindows(dt: number) {
    const target = this.winTarget;
    if (!target) return;
    const k = Math.min(1, dt * 30);
    let changed = target.length !== this.winShown.length;
    const shown = target.map((t) => {
      const cur = this.winShown.find((w) => w.id === t.id);
      if (!cur) { changed = true; return { ...t }; }
      const next = { ...t };
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        const d = t[key] - cur[key];
        next[key] = Math.abs(d) < 0.5 ? t[key] : cur[key] + d * k;
        if (next[key] !== cur[key]) changed = true;
      }
      return next;
    });
    this.winShown = shown;
    if (!changed) return;
    const plats = windowPlatforms(shown, this.ctx.world.bounds, 40, this.headroom());
    this.ctx.world.platforms = plats;
    this.char.setPlatforms(plats);
    this.ctx.world.walls = windowWalls(shown, this.ctx.world.bounds, this.headroom());
    this.char.setWalls(this.ctx.world.walls);
  }

  setBounds(b: Bounds) {
    this.char.setBounds(b);
    this.ctx.world.bounds = b;
    this.ctx.world.walls = windowWalls(this.winShown, b, this.headroom());
    this.char.setWalls(this.ctx.world.walls);
  }

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
    // He's holding the cursor and you pulled it away: you win.
    const held = this.cursorCmd;
    if (held && w.time - held.t < 0.5 && Math.hypot(x - held.x, y - held.y) > 30) { this.ctx.cursorEscaped = true; this.cursorCmd = null; }
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
    const over = !this.press && speed < 1200 && this.char.hitTest(x, y, 20) !== null;
    if (over) {
      if (!r.over || w.time - r.since > 2.5) { r.dist = 0; r.since = w.time; }
      r.dist += Math.hypot(x - r.lastX, y - r.lastY);
      if (r.dist > 180) {
        r.dist = 0; r.since = w.time;
        this.emit({ type: 'petted' });
        if (!this.mood.asleep || Math.random() < 0.3) for (let i = 0; i < 2; i++) this.hearts.push({ x: x + (Math.random() - 0.5) * 20, y: y - 10, t: 0, drift: (Math.random() - 0.5) * 30 });
      }
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
      why: this.mind.why,
      recent: this.mind.recent.slice(-8),
      windows: this.winShown.length,
      platforms: this.ctx.world.platforms.length,
    };
  }

  /**
   * Commands from the settings window:
   *   do:<skill>  mood:<preset>  setMood:{"energy":0.3}  say:<text>  resetMood  respawn
   */
  command(cmd: string) {
    const [verb, ...rest] = cmd.split(':');
    const arg = rest.join(':');
    if (verb === 'do') { this.mind.command(this.ctx, arg); return; }
    if (verb === 'say') { if (arg.trim()) this.say(arg.trim().slice(0, 80)); return; }
    if (verb === 'mood') { const p = MOOD_PRESETS[arg]; if (p) { this.mood.asleep = false; Object.assign(this.mood.s, p); } return; }
    if (verb === 'setMood') {
      try {
        const d = JSON.parse(arg) as Partial<MoodState>;
        for (const k of Object.keys(this.mood.s) as (keyof MoodState)[]) if (typeof d[k] === 'number') this.mood.s[k] = Math.min(1, Math.max(0, d[k]!));
      } catch { /* ignore bad input */ }
      return;
    }
    if (cmd === 'clearDoodles') { this.ctx.doodles = []; return; }
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
