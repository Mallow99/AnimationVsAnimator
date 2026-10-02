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
import { drawBubble, drawCharacter, drawPixelBubble, drawPuffs, PixelLayer, shade, type Puff } from './render';
import { DOODLE_LIFE, drawDoodles } from './doodles';
import { Brain, splitSpeech } from './brain';
import type { Vec } from './math';

/** A finished drawing kept in his gallery. Shape is in a box from -0.5 to 0.5. */
export interface Drawing { title: string; shape: Vec[][]; color: string; at: number }

export { DEFAULT_CONFIG, type PetConfig } from './config';

const STEP = 1 / 120; // physics runs at a fixed 120 steps per second
const SMACK_SPEED = 1400; // cursor speed (px/s) that counts as a smack rather than a brush
const TYPE_SPEED = 32;    // letters per second as his speech bubble types out

export class Pet {
  char: Character;
  readonly mood = new Mood();
  readonly mind = new Mind();
  readonly brain = new Brain();
  readonly ctx: Ctx;
  /** Turn his mind off (for debugging poses by hand). */
  paused = false;
  private acc = 0;
  private press: { joint: JointName; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;
  /** His speech bubble. Letters type out one by one (`shown`), with a little blip for each. */
  private bubble: { text: string; t: number; ttl: number; shown: number } | null = null;
  /** Called for each blip of his voice (the app plays it). `pitch` in Hz. */
  onBlip: ((pitch: number) => void) | null = null;
  /** Dust puffs from landings and crashes. */
  private puffs: Puff[] = [];
  /** Hit-stop: the world freezes for a split second on a big impact (a classic game-feel trick). */
  private freeze = 0;
  /** Longer things he says, shown one bubble at a time. */
  private speech: string[] = [];
  private smackCooldown = 0;
  /** Set by the app: moves the real mouse cursor (desktop only). */
  onMoveCursor: ((x: number, y: number) => void) | null = null;
  private cursorCmd: { x: number; y: number; t: number } | null = null;
  private hearts: { x: number; y: number; t: number; drift: number }[] = [];
  private winTarget: WinRect[] | null = null;
  private winShown: WinRect[] = [];
  private pixels = new PixelLayer();
  private rub = { dist: 0, since: 0, lastX: 0, lastY: 0, over: false };
  /** Everything he's drawn (newest last), kept between runs. */
  gallery: Drawing[] = [];
  /** Called when his gallery or his moves change (the app tells the settings window). */
  onCollections: (() => void) | null = null;

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
    this.brain.onSpeak = (text) => this.speak(text);
    this.ctx.savedMoves = this.brain.savedMoves;
    this.brain.onMoves = () => this.onCollections?.();
    this.ctx.onDrawn = (d) => {
      if (!d.shape) return;
      this.gallery.push({ title: d.title ?? 'doodle', shape: d.shape, color: d.color, at: Date.now() });
      if (this.gallery.length > 40) this.gallery.shift();
      this.onCollections?.();
    };
  }

  /** Advance by real elapsed seconds (any frame rate). */
  update(dt: number) {
    dt = Math.min(dt, 0.1); // after a stall (laptop asleep), don't try to catch up forever
    this.ctx.world.time += dt;
    this.ctx.canGrabCursor = this.config.mischief && !!this.onMoveCursor;
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; }
    this.acc += dt;
    this.smoothWindows(dt);
    while (this.acc >= STEP) {
      this.char.step(STEP);
      this.acc -= STEP;
    }
    for (const e of this.char.drainEvents()) { this.effects(e); this.emit(e); }
    if (!this.paused) { this.mind.update(this.ctx, dt); this.brain.update(this.ctx, this.mind); }
    if (this.bubble) this.typeOut(this.bubble, dt);
    if (this.bubble && this.bubble.t > this.bubble.ttl) this.bubble = null;
    for (const f of this.puffs) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    this.puffs = this.puffs.filter((f) => f.t < f.life);
    if (!this.bubble && this.speech.length) this.say(this.speech.shift()!);
    for (const h of this.hearts) { h.t += dt; h.y -= 40 * dt; h.x += h.drift * dt; }
    this.hearts = this.hearts.filter((h) => h.t < 1.4);
    this.ctx.doodles = this.ctx.doodles.filter((d) => this.ctx.world.time - d.born < DOODLE_LIFE);
  }

  say(text: string, secs?: number) {
    if (text.length > 70 && secs === undefined) { this.speak(text); return; }
    // Time to type it out, then time to read it.
    this.bubble = { text, t: 0, shown: 0, ttl: text.length / TYPE_SPEED + (secs ?? Math.min(1.5 + text.length * 0.05, 4.5)) };
  }

  /** Type the bubble out letter by letter, blipping like an indie game character. */
  private typeOut(b: { text: string; t: number; shown: number }, dt: number) {
    b.t += dt;
    const before = Math.floor(b.shown);
    b.shown = Math.min(b.text.length, b.t * TYPE_SPEED);
    const now = Math.floor(b.shown);
    if (!this.onBlip || !this.config.sound || now === before) return;
    for (let i = before; i < now; i++) {
      if (i % 2 || !/[\p{L}\p{N}]/u.test(b.text[i])) continue;
      // His voice follows his mood: higher when happy, lower and flatter when sad or cross.
      const s = this.mood.s;
      const base = 420 + s.happiness * 260 + s.energy * 80 - s.annoyance * 120 - (this.mood.asleep ? 120 : 0);
      this.onBlip(base * (0.92 + Math.random() * 0.16));
    }
  }

  /** Game-feel touches for things that happen to his body. */
  private effects(e: { type: string; speed?: number }) {
    const j = this.char.body.j, sc = this.char.scale;
    const burst = (x: number, y: number, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / Math.max(1, n - 1)) * Math.PI;
        this.puffs.push({ x, y, vx: Math.cos(a) * power * (0.5 + Math.random()), vy: Math.sin(a) * power * 0.35 * Math.random(), t: 0, life: 0.35 + Math.random() * 0.3, size: (3 + Math.random() * 3) * sc });
      }
    };
    const feetX = (j.footL.x + j.footR.x) / 2, feetY = Math.max(j.footL.y, j.footR.y) + 2;
    if (e.type === 'landed' && (e.speed ?? 0) > 350) burst(feetX, feetY, 6, 60 + (e.speed ?? 0) * 0.05);
    if (e.type === 'crashed') { burst(j.hip.x, Math.max(j.hip.y, j.head.y) + 4, 12, 110); this.freeze = 0.07; }
    if (e.type === 'stomped') burst(feetX, feetY, 5, 70);
  }

  /** Say something longer: split into bubble-sized pieces, shown one after another. */
  speak(text: string) {
    this.speech = splitSpeech(text);
    this.bubble = null;
    if (this.speech.length) this.say(this.speech.shift()!);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const look = this.config.look;
    if (look.pixel > 1) this.pixels.draw(ctx, this.char, look);
    else drawCharacter(ctx, this.char, look);
    if (this.puffs.length) drawPuffs(ctx, this.puffs, Math.max(1, Math.round(look.pixel)), 'rgba(200,204,214,1)');
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
      const alpha = Math.min(1, (b.ttl - b.t) * 4);
      if (look.pixel > 1) drawPixelBubble(ctx, this.char, b.text, b.shown, alpha, this.ctx.world.bounds, Math.round(look.pixel), shade(look.color, -0.45));
      else drawBubble(ctx, this.char, b.text.slice(0, Math.floor(b.shown)), alpha, this.ctx.world.bounds);
    }
  }

  /** Apply a (possibly changed) config live. A new size rebuilds his body where he stands. */
  applyConfig(cfg: PetConfig) {
    const resized = this.config.scale !== cfg.scale;
    (this as { config: PetConfig }).config = structuredClone(cfg);
    Object.assign(this.brain, { mode: cfg.mind, name: cfg.name, persona: cfg.persona, puppet: cfg.puppet });
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

  private emit(e: MindEvent) { this.mind.onEvent(this.ctx, e); this.brain.noteEvent(this.ctx, e); }

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
        this.freeze = 0.06;
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
      brain: { active: this.brain.active, status: this.brain.status, log: this.brain.log.slice(-20) },
      // For the neurons view: everything he's weighing, how much, and what won.
      mind: { weigh: this.mind.weigh(this.ctx), thinking: this.brain.status === 'thinking…' },
    };
  }

  /** His drawings and moves, for the Mind tab (sent only when they change: they can be big-ish). */
  collections() {
    return {
      gallery: this.gallery,
      recentMoves: this.brain.recentMoves.map((m) => ({ name: m.name, poses: m.frames.length })),
      savedMoves: this.brain.savedMoves.map((m) => ({ name: m.name, poses: m.frames.length })),
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
    if (verb === 'hear') { this.brain.hear(this.ctx, arg); return; }
    if (this.collectionCommand(verb, arg)) { this.onCollections?.(); return; }
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

  /**
   * Gallery and moves, from the Mind tab:
   *   saveMove:<recent index>:<name>  playMove:<i>  forgetMove:<i>  redraw:<i>  forgetDrawing:<i>  sync
   */
  private collectionCommand(verb: string, arg: string): boolean {
    const [a, ...rest] = arg.split(':'), i = Number(a);
    const b = this.brain, saved = b.savedMoves;
    switch (verb) {
      case 'sync': return true;
      case 'saveMove': {
        const m = b.recentMoves[i];
        if (!m) return false;
        saved.push({ name: (rest.join(':').trim() || m.name).slice(0, 40), frames: m.frames });
        b.recentMoves.splice(i, 1);
        if (saved.length > 30) saved.shift();
        return true;
      }
      case 'playMove': if (saved[i]) this.mind.perform(this.ctx, [{ move: saved[i].frames, name: saved[i].name }], 'you told him to'); return false;
      case 'forgetMove': if (!saved[i]) return false; saved.splice(i, 1); return true;
      case 'redraw': { const d = this.gallery[i]; if (d) this.mind.perform(this.ctx, [{ draw: d.shape, title: d.title }], 'you told him to'); return false; }
      case 'forgetDrawing': if (!this.gallery[i]) return false; this.gallery.splice(i, 1); return true;
    }
    return false;
  }

  // ── saving between runs ──
  save() {
    return JSON.stringify({ v: 1, mood: this.mood.save(), lessons: this.ctx.lessons, gallery: this.gallery, moves: this.brain.savedMoves });
  }
  load(json: string | null) {
    if (!json) return;
    try {
      const d = JSON.parse(json);
      this.mood.load(d.mood);
      if (typeof d.lessons?.safeDrop === 'number') this.ctx.lessons.safeDrop = d.lessons.safeDrop;
      if (Array.isArray(d.gallery)) this.gallery = d.gallery.slice(-40);
      // Same array object the brain and mind already hold: fill it in place.
      if (Array.isArray(d.moves)) this.brain.savedMoves.splice(0, Infinity, ...d.moves.slice(-30));
    } catch { /* corrupt save: start fresh */ }
  }
}
