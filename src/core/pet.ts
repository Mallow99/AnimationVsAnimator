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
import { beltParts, drawBubble, drawCharacter, drawLooseLimb, drawMenu, drawPixelBubble, drawPuffs, drawSparks, menuLayout, PixelLayer, shade, type DepthPart, type Puff, type Spark } from './render';
import { drawItem, itemFromDrawing, Items, type Item } from './items';
import { Props, type Ball } from './props';
import type { Doodle } from './doodles';
import type { Platform } from './physics';
import type { LooseLimb } from './limbs';
import { limbOf } from './body';
import { DOODLE_LIFE, drawDoodles } from './doodles';
import { Brain, splitSpeech } from './brain';
import type { Vec } from './math';
import { Memory } from './memory';

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
  /** His notes and summary (milestone 5). */
  readonly memory = new Memory();
  /** Called with his memory file's contents when it changes (the app writes it to disk). */
  onMemorySave: ((json: string) => void) | null = null;
  readonly ctx: Ctx;
  /** Turn his mind off (for debugging poses by hand). */
  paused = false;
  private acc = 0;
  private press: { joint: JointName; limb?: { piece: LooseLimb; idx: number }; ball?: Ball; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;
  /** His drawings that came to life: balls, boxes, ledges. */
  readonly props = new Props();
  private windowPlats: Platform[] = [];
  private bonkCooldown = 0;
  /** Sparks from limbs snapping off and clicking back on. */
  private sparks: Spark[] = [];
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
  /** His belt and what's on it (milestone: items). */
  readonly items = new Items();
  /** Called when you want to talk to him (double-click, or "Talk" in his menu): the app opens a text box. */
  onTalk: (() => void) | null = null;
  /** "Settings" in his menu. */
  onOpenSettings: (() => void) | null = null;
  /** Sound effects (the app plays them): footsteps, thuds, snaps, whooshes... */
  onSound: ((name: string, strength: number) => void) | null = null;
  /** The menu you get by right-clicking him. */
  private menu: { at: Vec; rows: { label: string; act: () => void }[]; hover: number } | null = null;
  /** A click on him becomes a poke only once it's clear it wasn't the first half of a double-click. */
  private pendingPoke: { joint: JointName; x: number; at: number } | null = null;
  private lastClickAt = -10;
  private cursorVel = { x: 0, y: 0 };
  private itemHitCooldown = 0;
  /** You're typing to him (the desktop text box is open): he turns to you and listens. */
  listening = false;

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
      memory: this.memory,
      items: this.items,
      sound: (name, strength) => this.sound(name, strength ?? 1),
      hitCursor: (x, y, dir) => this.swordHitsCursor(x, y, dir),
      props: this.props,
      onBecome: (d) => this.becomeReal(d),
    };
    this.props.onPlatforms = () => this.refreshPlatforms();
    this.items.give('pen', this.char);
    this.items.give('sword', this.char);
    this.items.onChange = () => this.onCollections?.();
    this.memory.onChange = () => { this.onCollections?.(); this.onMemorySave?.(this.memory.save()); };
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
      this.props.update(STEP, this.ctx.world.time, this.ctx.world.bounds, this.ctx.world.platforms);
      this.ballContact();
      this.acc -= STEP;
    }
    this.items.update(this.char, dt, this.ctx.world.bounds, this.ctx.world.platforms, this.ctx.world.cursor);
    this.itemHits();
    for (const e of this.char.drainEvents()) { this.effects(e); this.emit(e); }
    // A single click on him turns into a poke once it's clearly not a double-click.
    const pp = this.pendingPoke;
    if (pp && this.ctx.world.time - pp.at > 0.25) { this.pendingPoke = null; this.poke(pp.joint, pp.x); }
    if (this.listening) { this.char.presentWant = 0.6; this.mind.holdUntil = this.ctx.world.time + 1; if (this.char.walking) this.char.stop(); }
    else this.char.presentWant = 0;
    if (!this.paused) { this.mind.update(this.ctx, dt); this.brain.update(this.ctx, this.mind); }
    if (this.bubble) this.typeOut(this.bubble, dt);
    if (this.bubble && this.bubble.t > this.bubble.ttl) this.bubble = null;
    for (const f of this.puffs) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    for (const s of this.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; s.vx *= 0.97; }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
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
    if (e.type === 'limbOff' || e.type === 'limbOn') {
      // No gore: a burst of pixel sparks, and a hit-stop when it snaps.
      const off = e.type === 'limbOff', at = e as unknown as { x: number; y: number };
      const colors = off ? ['#ffffff', '#ffe66d', '#ffd23f', shade(this.config.look.color, 0.5)] : ['#ffffff', shade(this.config.look.color, 0.6)];
      for (let i = 0; i < (off ? 18 : 9); i++) {
        const a = Math.random() * Math.PI * 2, v = (off ? 160 : 90) + Math.random() * (off ? 260 : 120);
        this.sparks.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (off ? 120 : 60), t: 0, life: 0.35 + Math.random() * 0.4, color: colors[i % colors.length] });
      }
      if (off) this.freeze = 0.09;
    }
  }

  /** Say something longer: split into bubble-sized pieces, shown one after another. */
  speak(text: string) {
    this.speech = splitSpeech(text);
    this.bubble = null;
    if (this.speech.length) this.say(this.speech.shift()!);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const look = this.config.look;
    // His belt and what's on him are drawn as part of him, in depth order with his limbs.
    const extras: DepthPart[] = [...beltParts(this.char, '#3a2a22'), ...this.items.onHim.map((it) => this.itemPart(it))];
    if (look.pixel > 1) {
      this.pixels.draw(ctx, this.char, look, extras);
      for (const it of this.items.list) if (it.where === 'world' || it.where === 'cursor') this.pixels.paint(ctx, [it.butt, it.tip], 6 * this.char.scale, { ...look, outline: false }, (g) => drawItem(g, it));
    } else {
      drawCharacter(ctx, this.char, look, extras);
      for (const piece of this.char.loosePieces) drawLooseLimb(ctx, piece, look, this.char.scale);
      for (const it of this.items.list) if (it.where === 'world' || it.where === 'cursor') drawItem(ctx, it);
    }
    if (this.sparks.length) drawSparks(ctx, this.sparks, Math.max(1, Math.round(look.pixel)));
    if (this.puffs.length) drawPuffs(ctx, this.puffs, Math.max(1, Math.round(look.pixel)), 'rgba(200,204,214,1)');
    drawDoodles(ctx, this.ctx.doodles, this.ctx.world.time);
    this.props.draw(ctx, this.ctx.world.time);
    for (const h of this.hearts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - h.t / 1.4);
      ctx.fillStyle = '#ff5c8a';
      ctx.font = `${Math.round(14 + h.t * 6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', h.x, h.y);
      ctx.restore();
    }
    if (this.menu) {
      const m = this.menuLayout();
      drawMenu(ctx, m, this.menu.hover, shade(look.color, -0.45));
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
    this.char.destructible = cfg.destructible;
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
    this.windowPlats = windowPlatforms(shown, this.ctx.world.bounds, 40, this.headroom());
    this.refreshPlatforms();
    this.ctx.world.walls = windowWalls(shown, this.ctx.world.bounds, this.headroom());
    this.char.setWalls(this.ctx.world.walls);
  }

  /** Everything he can stand on: window tops plus boxes and ledges he drew. */
  private refreshPlatforms() {
    const all = [...this.windowPlats, ...this.props.platforms];
    this.ctx.world.platforms = all;
    this.char.setPlatforms(all);
  }

  /** One of his drawings comes to life (a pop, some sparkles): a ball, a box, a ledge, or a thing to hold. */
  private becomeReal(d: Doodle) {
    const x = d.cx ?? this.char.x, y = d.cy ?? this.char.body.j.neck.y;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      this.sparks.push({ x: x + Math.cos(a) * (d.size ?? 40) * 0.4, y: y + Math.sin(a) * (d.size ?? 40) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.4 + Math.random() * 0.3, color: i % 2 ? '#ffffff' : shade(d.color, 0.5) });
    }
    this.sound('poof', 1);
    if (d.becomes === 'item') {
      // He grabs it out of the air.
      const def = itemFromDrawing(d.shape ?? [], d.title ?? 'drawing', d.color);
      this.items.defs.set(def.id, def);
      const it = this.items.give(def, this.char);
      const hand = this.char.useHand;
      if (it && hand) this.items.toHand(it, hand);
      d.alive = true;
      return;
    }
    if (d.becomes) this.props.bringToLife(d, d.becomes, this.ctx.world.bounds);
  }

  /** Balls meet his feet (kicks, dribbling) and his body (a ball flying into him: bonk). */
  private ballContact() {
    const j = this.char.body.j, sc = this.char.scale, t = this.ctx.world.time;
    for (const b of this.props.balls) {
      if (b.heldBy) continue;
      for (const n of ['footL', 'footR'] as const) {
        if (this.char.body.ghost.has(n)) continue;
        const f = j[n], dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy);
        if (d > b.r + 3 * sc || d < 1e-3) continue;
        const fvx = (f.x - f.px) * 120, fvy = (f.y - f.py) * 120;
        const into = (fvx * dx + fvy * dy) / d - (b.vx * dx + b.vy * dy) / d;
        // Push it out of his foot; a fast foot gives it a real kick.
        b.p.x = f.x + (dx / d) * (b.r + 3 * sc); b.p.y = Math.min(b.p.y, f.y + (dy / d) * (b.r + 3 * sc));
        if (into > 60) {
          const k = into > 250 ? 1.5 : 1;
          b.kick(b.vx * 0.2 + fvx * k + (dx / d) * 60, Math.min(b.vy, fvy * k) - Math.abs(fvx) * (into > 250 ? 0.55 : 0.1));
          if (into > 250) this.sound('kick', Math.min(1, into / 600));
        }
      }
      // Flying into him (not his feet: those kick).
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 450 && t > this.bonkCooldown) {
        const joint = this.char.hitTest(b.x, b.y, b.r * 0.7);
        if (joint && !joint.startsWith('foot') && !joint.startsWith('knee')) {
          this.char.poke(joint, b.vx * 0.35, b.vy * 0.35 - 80);
          b.kick(-b.vx * 0.4, -Math.abs(b.vy) * 0.3 - 150);
          this.bonkCooldown = t + 0.6;
          this.sound('bonk', Math.min(1, speed / 1200));
          this.emit({ type: 'bonked', speed });
        }
      }
    }
  }

  setBounds(b: Bounds) {
    this.char.setBounds(b);
    this.ctx.world.bounds = b;
    this.ctx.world.walls = windowWalls(this.winShown, b, this.headroom());
    this.char.setWalls(this.ctx.world.walls);
  }

  /** Is the cursor over him, one of his loose limbs, or one of his things? (decides whether clicks reach us or the desktop) */
  hit(x: number, y: number) { return this.char.hitTest(x, y) !== null || this.char.hitLimb(x, y) !== null || this.items.hitWorld(x, y) !== null || this.props.ballAt(x, y) !== null; }

  private emit(e: MindEvent) {
    this.remember(e);
    this.mind.onEvent(this.ctx, e);
    this.brain.noteEvent(this.ctx, e);
  }

  /** He counts what happens to him (his memory turns firsts and repeats into notes). */
  private remember(e: MindEvent) {
    const m = this.memory;
    switch (e.type) {
      case 'poked': m.count('poked'); break;
      case 'petted': m.count('petted'); break;
      case 'smacked': m.count('smacked'); break;
      case 'grabbed': m.count('grabbed'); break;
      case 'released': if (e.speed > 900) m.count('thrown'); break;
      case 'crashed': m.count('crashed'); break;
      case 'fellOff': m.count('fellOff'); break;
      case 'limbOff': m.count('ripped'); if (e.yanked) m.add('you ripped my ' + (e.limb.startsWith('arm') ? 'arm' : 'leg') + ' off. RUDE.', 'you', 'him', 3); break;
    }
  }

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
        // A really hard swipe through an arm or a leg knocks it clean off.
        const limb = limbOf(joint);
        if (limb && speed > 3400 && this.char.destructible) this.char.detach(limb, { x: vx * k, y: vy * k - 150, z: (Math.random() - 0.5) * 500 });
        this.char.poke(joint, vx * k, vy * k - 150);
        this.smackCooldown = w.time + 0.35;
        this.emit({ type: 'smacked', speed });
        this.freeze = 0.06;
        break;
      }
    }
    w.cursor = { x, y };
    w.cursorMovedAt = w.time;
    this.cursorVel = { x: vx, y: vy };
    if (this.menu) this.menu.hover = this.menuRow(x, y);
    if (Date.now() - this.memory.lastSeen > 60_000) this.memory.sawYou();
    const over = !this.press && speed < 1200 && this.char.hitTest(x, y, 20) !== null;
    if (over) {
      // Count how far the cursor rubs back and forth over him (not the jump onto him).
      if (!r.over || w.time - r.since > 2.5) { r.dist = 0; r.since = w.time; }
      else r.dist += Math.hypot(x - r.lastX, y - r.lastY);
      if (r.dist > 180) {
        r.dist = 0; r.since = w.time;
        this.emit({ type: 'petted' });
        if (!this.mood.asleep || Math.random() < 0.3) for (let i = 0; i < 2; i++) this.hearts.push({ x: x + (Math.random() - 0.5) * 20, y: y - 10, t: 0, drift: (Math.random() - 0.5) * 30 });
      }
    }
    r.over = over; r.lastX = x; r.lastY = y;
  }

  /**
   * Press on him: nothing yet. Drag (or hold a moment) = pick up. Quick click = poke.
   * Double-click = talk to him. While his menu is open, a click picks from it (or closes it).
   * While you're carrying one of his things: click him to give it back, click anywhere else to drop it.
   */
  pointerDown(x: number, y: number, now: number) {
    const w = this.ctx.world;
    if (this.menu) {
      const i = this.menuRow(x, y), rows = this.menu.rows;
      this.menu = null;
      if (i >= 0) rows[i].act();
      return true;
    }
    const joint = this.char.hitTest(x, y);
    const carried = this.items.carried;
    if (carried) {
      if (joint) this.giveBack(carried);
      else {
        this.items.drop(carried, this.cursorVel.x * 0.6, this.cursorVel.y * 0.6);
        this.sound('drop', 0.6);
        this.emit({ type: 'itemDropped', name: carried.def.name.toLowerCase(), uid: carried.uid });
      }
      return true;
    }
    if (joint && w.time - this.lastClickAt < 0.3) {
      // Second click of a double-click: no poke, he listens instead.
      this.pendingPoke = null;
      this.lastClickAt = -10;
      this.onTalk?.();
      return true;
    }
    if (!joint) {
      // Not him: maybe one of his limbs lying around, or one of his things.
      const limb = this.char.hitLimb(x, y);
      if (limb) { this.press = { joint: 'hip', limb, x, y, t: now, moved: false, grabbed: false }; return true; }
      const ball = this.props.ballAt(x, y);
      if (ball) { ball.grab(x, y); this.press = { joint: 'hip', ball, x, y, t: now, moved: true, grabbed: true }; return true; }
      const it = this.items.hitWorld(x, y);
      if (it) { this.items.toCursor(it, { x, y }); this.sound('pickup', 0.6); return true; }
      return false;
    }
    this.press = { joint, x, y, t: now, moved: false, grabbed: false };
    return true;
  }

  pointerMove(x: number, y: number, vx: number, vy: number, now: number) {
    const p = this.press;
    if (!p) return;
    if (Math.hypot(x - p.x, y - p.y) > 5) p.moved = true;
    if (!p.grabbed && (p.moved || now - p.t > 180)) {
      p.grabbed = true;
      this.pendingPoke = null;
      if (p.limb) this.char.grabLimb(p.limb.piece, p.limb.idx, x, y);
      else this.char.grab(p.joint, x, y);
    }
    if (p.ball) p.ball.moveHold(x, y, vx, vy);
    else if (p.grabbed) this.char.moveHold(x, y, vx, vy);
  }

  pointerUp(x: number, _y: number) {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.ball) { p.ball.release(); return; }
    if (p.grabbed) { this.char.release(); return; }
    if (p.limb) { const q = p.limb.piece.points[p.limb.idx]; q.px = q.x + Math.sign(q.x - x || 1) * -3; q.py = q.y + 4; return; } // flick it
    // A quick click: a poke, as soon as it's clear this wasn't a double-click.
    this.lastClickAt = this.ctx.world.time;
    this.pendingPoke = { joint: p.joint, x, at: this.ctx.world.time };
  }

  /** A poke: push away from where you clicked. */
  private poke(joint: JointName, x: number) {
    const hip = this.char.body.j.hip;
    const dir = Math.abs(x - hip.x) > 2 ? Math.sign(hip.x - x) : -this.char.facing;
    this.char.poke(joint, dir * 500, -80);
    this.sound('poke', 0.6);
    this.emit({ type: 'poked' });
  }

  /** Right-click on him: his menu. Returns true if it opened. */
  contextMenu(x: number, y: number) {
    if (!this.char.hitTest(x, y, 10)) { this.menu = null; return false; }
    this.pendingPoke = null;
    const rows: { label: string; act: () => void }[] = [];
    rows.push({ label: `Talk to ${this.config.name}`, act: () => this.onTalk?.() });
    const carried = this.items.carried;
    if (carried) rows.push({ label: `Give back ${carried.def.name.toLowerCase()}`, act: () => this.giveBack(carried) });
    for (const it of this.items.onHim) rows.push({ label: `Take ${it.def.name.toLowerCase()}`, act: () => this.takeItem(it) });
    if (!this.char.whole) rows.push({ label: 'Fix him up', act: () => { for (const l of [...this.char.missing.keys()]) this.char.regrow(l); } });
    if (this.onOpenSettings) rows.push({ label: 'Settings', act: () => this.onOpenSettings?.() });
    this.menu = { at: { x, y }, rows, hover: -1 };
    this.sound('pickup', 0.3);
    return true;
  }

  get menuOpen() { return !!this.menu; }
  /** Just above his head (where the talk box goes). */
  talkAnchor() { const h = this.char.body.j.head; return { x: h.x, y: h.y - this.char.d.headR }; }
  closeMenu() { this.menu = null; }

  private menuLayout() {
    const p = Math.max(2, Math.round(this.config.look.pixel));
    return menuLayout(this.menu!.rows.map((r) => r.label), this.menu!.at, this.ctx.world.bounds, p);
  }

  /** Which menu row is under (x, y) (-1 = none). */
  private menuRow(x: number, y: number) {
    if (!this.menu) return -1;
    const m = this.menuLayout();
    if (x < m.x || x > m.x + m.w || y < m.y + 2 * m.p) return -1;
    const i = Math.floor((y - m.y - 2 * m.p) / m.rowH);
    return i < m.rows.length ? i : -1;
  }

  /** Is the cursor over his menu (so clicks should come to us, not the desktop)? */
  uiHit(x: number, y: number) {
    if (!this.menu) return false;
    const m = this.menuLayout(), h = m.rows.length * m.rowH + 4 * m.p;
    return x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + h;
  }

  /** Is your cursor carrying one of his things? (Then clicks anywhere come to us: one drops it.) */
  get carrying() { return !!this.items.carried; }

  /** You take one of his things: it dangles from your cursor. */
  takeItem(it: Item) {
    const cur = this.ctx.world.cursor ?? { x: it.at.x, y: it.at.y };
    this.items.toCursor(it, cur);
    this.sound('pickup', 0.8);
    this.emit({ type: 'itemTaken', name: it.def.name.toLowerCase() });
  }

  /** You give it back: onto his belt (or into his hand if the belt's full). */
  giveBack(it: Item) {
    if (!this.items.stow(it)) {
      const hand = this.char.useHand;
      if (hand) this.items.toHand(it, hand); else { this.items.drop(it, 0, 0); return; }
    }
    this.sound('pickup', 0.8);
    this.emit({ type: 'itemGiven', name: it.def.name.toLowerCase() });
  }

  /** Swinging one of his things at him (you took his sword): hits him like a smack, only harder. */
  private itemHits() {
    const it = this.items.carried, w = this.ctx.world;
    if (!it || it.def.hit <= 0 || it.tipSpeed < 450 || Math.hypot(this.cursorVel.x, this.cursorVel.y) < 300 || w.time < this.itemHitCooldown) return;
    const a = it.butt, b = it.tip;
    for (let i = 0; i <= 6; i++) {
      const px = a.x + ((b.x - a.x) * i) / 6, py = a.y + ((b.y - a.y) * i) / 6;
      const joint = this.char.hitTest(px, py, 3);
      if (!joint) continue;
      const speed = Math.min(it.tipSpeed, 3500) * it.def.hit;
      const v = this.cursorVel, vl = Math.hypot(v.x, v.y) || 1;
      const k = speed * 0.5 / vl;
      const limb = limbOf(joint);
      if (limb && speed > 2600 && this.char.destructible) this.char.detach(limb, { x: v.x * k, y: v.y * k - 150, z: (Math.random() - 0.5) * 400 });
      this.char.poke(joint, v.x * k, v.y * k - 120);
      this.itemHitCooldown = w.time + 0.4;
      this.freeze = 0.07;
      this.sound('thwack', Math.min(1, speed / 2000));
      this.emit({ type: 'smacked', speed });
      return;
    }
  }

  /** His sword hit your cursor: a clang and sparks, and in mischief mode it knocks your cursor away. */
  private swordHitsCursor(x: number, y: number, dir: number) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 200;
      this.sparks.push({ x, y, vx: Math.cos(a) * v + dir * 120, vy: Math.sin(a) * v - 80, t: 0, life: 0.3 + Math.random() * 0.3, color: i % 2 ? '#ffffff' : '#ffe66d' });
    }
    this.freeze = 0.05;
    this.sound('clang', 1);
    if (this.config.mischief && this.onMoveCursor) this.moveCursor(x + dir * 70, y - 25);
  }

  /** Play a sound effect (if sounds are on). */
  sound(name: string, strength = 1) { if (this.config.sfx) this.onSound?.(name, strength); }

  /** How one of the things on him is drawn, in depth order with his limbs. */
  private itemPart(it: Item): DepthPart {
    const a = it.butt, b = it.tip;
    return { z: (a.z + b.z) / 2 + (it.where === 'hand' ? 0.5 : -0.3), pts: [a, b], draw: (g) => drawItem(g, it) };
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
      missing: [...this.char.missing.keys()],
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
      items: {
        kinds: [...this.items.defs.values()].map((d) => ({ id: d.id, name: d.name, about: d.about, use: d.use, drawn: !!d.drawn })),
        list: this.items.list.map((it) => ({ uid: it.uid, id: it.def.id, name: it.def.name, where: it.where, slot: it.slot, drawn: !!it.def.drawn })),
      },
      memory: { summary: this.memory.summary, notes: this.memory.notes, tally: this.memory.tally, firstMet: this.memory.firstMet, summarizedAt: this.memory.summarizedAt },
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
    if (verb === 'hear') { if (arg.trim()) this.memory.count('talks'); this.brain.hear(this.ctx, arg); return; }
    if (this.memoryCommand(verb, arg)) return;
    if (verb === 'item') { this.itemCommand(arg); this.onCollections?.(); return; }
    if (verb === 'menuAt') { const [x, y] = arg.split(',').map(Number); this.contextMenu(x, y); return; }
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
      for (const l of [...this.char.missing.keys()]) this.char.regrow(l);
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

  /**
   * His things, from the Items tab:
   *   item:give:<kind>  item:take:<uid>  item:return:<uid>  item:drop:<uid>  item:remove:<uid>
   */
  private itemCommand(arg: string) {
    const [verb, id] = arg.split(':');
    const it = this.items.list.find((x) => x.uid === Number(id));
    switch (verb) {
      case 'give': this.items.give(id, this.char); this.sound('pickup', 0.6); break;
      case 'take': if (it && (it.where === 'belt' || it.where === 'hand')) this.takeItem(it); break;
      case 'return': if (it) this.giveBack(it); break;
      case 'drop': if (it) this.items.drop(it, 0, 0); break;
      case 'remove': if (it) this.items.remove(it); break;
    }
  }

  /**
   * His memories, from the Mind tab:
   *   memAdd:<text>  memEdit:<id>:<text>  memDel:<id>  memSummary:<text>  memTidy  memClear
   */
  private memoryCommand(verb: string, arg: string): boolean {
    const m = this.memory;
    const [a, ...rest] = arg.split(':');
    switch (verb) {
      case 'memAdd': m.add(arg, 'you', 'you', 3); return true;
      case 'memEdit': m.edit(Number(a), rest.join(':')); return true;
      case 'memDel': m.remove(Number(a)); return true;
      case 'memSummary': m.setSummary(arg); return true;
      case 'memTidy': this.brain.tidy(this.ctx); return true;
      case 'memClear': m.clear(); return true;
    }
    return false;
  }

  // ── saving between runs ──
  save() {
    return JSON.stringify({ v: 1, mood: this.mood.save(), lessons: this.ctx.lessons, gallery: this.gallery, moves: this.brain.savedMoves, items: this.items.save() });
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
      if (Array.isArray(d.items)) this.items.load(d.items, this.char);
    } catch { /* corrupt save: start fresh */ }
  }
}
