// The Pet ties everything together: body + mood + mind + speech, and turns
// raw mouse input into things that happen to him (poke, grab, throw, pet).

import { Character } from './character';
import { DEFAULT_CONFIG, type PetConfig } from './config';
import type { JointName } from './body';
import type { Bounds } from './physics';
import { Mood, MOOD_PRESETS, type MoodState } from './mood';
import { Mind, type MindEvent } from './mind';
import { DEFAULT_LESSONS, type Ctx } from './skills';
import { windowPlatforms, windowSides, windowWalls, type WinRect } from './world';
import { beltParts, drawBubble, drawCharacter, drawLooseLimb, drawMenu, drawPixelBubble, drawPuffs, drawSparks, menuLayout, PixelLayer, shade, type DepthPart, type Puff, type Spark } from './render';
import { drawItem, itemParts, itemFromDrawing, Items, type Item } from './items';
import { Props, parseCanvasArt, type Ball, type Thing } from './props';
import type { Doodle } from './doodles';
import type { Platform } from './physics';
import type { LooseLimb } from './limbs';
import { limbOf } from './body';
import { DOODLE_LIFE, drawDoodles } from './doodles';
import { Brain, parseMove, splitSpeech } from './brain';
import { WindowAccess } from './window-access';
import { BoardGame } from './board-game';
import { distToSegment, type Vec } from './math';
import { Memory } from './memory';
import { CursorBody, drawCursorFlight } from './cursor';

/** A window he's moving (shoved, kicked, pushed, surfing on it): where it is and how it's moving. */
interface WinMotion {
  x: number; y: number; vx: number; vy: number;
  /** Wobbles and settles back here (a knock or a stomp) instead of sliding away. */
  home?: { x: number; y: number };
  /** Where it was when he started moving it, and when (to notice if it doesn't really move). */
  from: { x: number; y: number }; t0: number;
  /** Being pushed this frame: keep this speed instead of slowing down. */
  push?: number;
}

/** What you're doing, from the desktop helper: the app in front, its window's title, and rects of things in that window. */
export interface ScreenReport { app: string; title: string; win: number; trusted: boolean; els: [number, number, number, number][] }

/** Platform ids for things in your windows (text, buttons) start here. */
const UI_ID = 2_000_000_000;

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
  readonly game = new BoardGame();
  /** His notes and summary (milestone 5). */
  readonly memory = new Memory();
  /** Called with his memory file's contents when it changes (the app writes it to disk). */
  onMemorySave: ((json: string) => void) | null = null;
  readonly ctx: Ctx;
  /** Turn his mind off (for debugging poses by hand). */
  paused = false;
  private acc = 0;
  private press: { joint: JointName; limb?: { piece: LooseLimb; idx: number }; ball?: Ball; thing?: Thing; x: number; y: number; t: number; moved: boolean; grabbed: boolean } | null = null;
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
  /** You're holding the mouse button down on one of his things (let go = drop or throw it). */
  private carryHeld = false;
  /** Your cursor as a thing he can hit (and send flying). */
  readonly cursorBody = new CursorBody();
  /** The last punch/kick that connected (one hit per swing), and where the fist was last frame. */
  private lastStrike = -1;
  private strikeFrom: Vec | null = null;
  private bladeCooldown = new Map<object, number>();
  /** Set by the app: moves another app's window to (x, y) (overlay coordinates of its top-left). */
  onMoveWindow: ((id: number, x: number, y: number, w: number, h: number) => void) | null = null;
  private winMotion = new Map<number, WinMotion>();
  /** Windows that just stopped moving: ignore the (late) reports of where they were, for a moment. */
  private winQuiet = new Map<number, { x: number; y: number; until: number }>();
  /** Where the desktop last said each window was (not smoothed, not overridden). */
  private winReported = new Map<number, WinRect>();
  /** What you're doing (app, title, since when), from the desktop. */
  screen: { app: string; title: string; win: number; since: number; trusted: boolean } | null = null;
  /** Tops of the things in your front window he can stand on (text, buttons, messages), and the rects they came from. */
  private uiPlats: Platform[] = [];
  private uiSeen: { id: number; x: number; y: number; w: number; h: number }[] = [];
  private uiNext = 0;
  /** Saved props whose definition (one of your files) hasn't arrived yet. */
  private pendingProps: { id: string; x: number; art?: unknown }[] = [];
  /** Moving windows didn't work (no permission?): don't try again until this time. */
  private windowAccess = new WindowAccess();
  /** The desktop helper's latest word on moving windows ("moved a window", "no permission yet"...). */
  moveNote = '';

  constructor(bounds: Bounds, readonly config: PetConfig = structuredClone(DEFAULT_CONFIG)) {
    this.char = new Character(bounds, (bounds.left + bounds.right) / 2, config.scale);
    this.applyConfig(config);
    // Start him up in the air so he drops in.
    this.char.body.translate(0, -Math.min(260, (bounds.floor - bounds.top) * 0.4));
    this.char.mode = 'air';
    const pet = this;
    this.ctx = {
      game: this.game,
      get cursorPlay() { return pet.config.knockCursor; },
      get windowMoves() {
        return !pet.config.moveWindows || !pet.config.windows ? 'off' as const : !pet.onMoveWindow ? 'unsupported' as const
          : !pet.windowAccess.anyAvailable(pet.winShown.map((w) => w.id), pet.ctx.world.time) ? 'stuck' as const : 'ok' as const;
      },
      get canMoveWindows() { return pet.config.moveWindows && pet.config.windows && !!pet.onMoveWindow && pet.windowAccess.anyAvailable(pet.winShown.map((w) => w.id), pet.ctx.world.time); },
      canMoveWindow: (id: number) => pet.windowAccess.canMove(id, pet.ctx.world.time),
      char: this.char,
      mood: this.mood,
      world: { bounds, cursor: null, cursorMovedAt: -100, time: 0, platforms: [], walls: windowWalls([], bounds), windows: [], sides: [] },
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
      hitCursor: (x, y, vx, vy, power) => this.knockCursor({ x, y }, vx, vy, power, 'item'),
      shoveWindow: (id, vx, vy, spring) => this.shoveWindow(id, vx, vy, spring),
      pushWindow: (id, vx) => this.pushWindow(id, vx),
      windowMoving: (id) => this.winMotion.has(id),
      hangOnCursor: () => this.hangOnCursor(),
      props: this.props,
      onBecome: (d) => this.becomeReal(d),
    };
    this.props.onPlatforms = () => this.refreshPlatforms();
    this.items.giveStarter(this.char); // just his pen; the rest is in his inventory (Settings → Items)
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
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1); // after a stall (laptop asleep), don't try to catch up forever
    this.ctx.world.time += dt;
    this.game.update(this.ctx.world.time);
    this.ctx.canGrabCursor = this.config.mischief && !!this.onMoveCursor;
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; }
    this.acc += dt;
    this.stepWindows(dt);
    this.smoothWindows(dt);
    while (this.acc >= STEP) {
      this.char.step(STEP);
      // Standing on something he drew: his weight pushes on it (a bridge sags under him).
      const under = this.props.thingOf(this.char.support);
      if (under && (this.char.mode === 'ground' || this.char.mode === 'sit')) under.carry(this.char.support, this.char.x);
      this.props.update(STEP, this.ctx.world.time, this.ctx.world.bounds, this.uiPlats.length ? [...this.windowPlats, ...this.uiPlats] : this.windowPlats, this.ctx.world.windows);
      this.items.stepWorld(STEP, this.ctx.world.bounds, this.ctx.world.platforms);
      this.ballContact();
      this.acc -= STEP;
    }
    this.items.update(this.char, dt, this.ctx.world.bounds, this.ctx.world.platforms, this.ctx.world.cursor);
    if (!this.cursorBody.busy(this.ctx.world.time)) this.itemHits();
    this.strikes();
    this.bladeHits();
    this.flyingItems();
    this.flyCursor(dt);
    this.anchorDoodles();
    for (const e of this.char.drainEvents()) { this.effects(e); this.emit(e); }
    // A single click on him turns into a poke once it's clearly not a double-click.
    const pp = this.pendingPoke;
    if (pp && this.ctx.world.time - pp.at > 0.25) { this.pendingPoke = null; this.poke(pp.joint, pp.x); }
    if (this.char.hangingOn && this.ctx.world.time - this.ctx.world.cursorMovedAt > 0.06 && this.ctx.world.cursor) {
      this.char.moveHold(this.ctx.world.cursor.x, this.ctx.world.cursor.y, 0, 0); // the mouse is still: so is the hand
    }
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
    // Sound effects for what his body does.
    switch (e.type) {
      case 'step': this.sound('step', 0.5); break;
      case 'landed': if ((e.speed ?? 0) > 350) this.sound('thud', Math.min(1, (e.speed ?? 0) / 1200)); break;
      case 'crashed': this.sound('crash', Math.min(1, (e.speed ?? 600) / 1400)); if (!this.mood.asleep) this.sound('oof'); break;
      case 'tripped': this.sound('thud', 0.5); break;
      case 'stomped': this.sound('thud', 0.6); break;
      case 'jumped': case 'wallJump': this.sound('jump', 0.6); break;
      case 'rolled': this.sound('roll'); break;
      case 'released': if ((e.speed ?? 0) > 900) this.sound('whoosh', 0.6); break;
      case 'limbOff': this.sound('snap'); break;
      case 'limbOn': this.sound('click'); break;
      case 'knock': this.sound('knock'); this.knockOnWindow(e as unknown as { x: number; y: number }); break;
    }
    // Stomping (or landing hard) on a window: it dips under him and springs back.
    const pl = this.char.supportPlatform();
    if (pl?.win !== undefined && (e.type === 'stomped' || (e.type === 'landed' && (e.speed ?? 0) > 500))) {
      this.shoveWindow(pl.win, 0, e.type === 'stomped' ? 160 : Math.min(320, (e.speed ?? 0) * 0.25), true);
    }
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

  /** A knock on a window's side: it wobbles a little. */
  private knockOnWindow(at: { x: number; y: number }) {
    const sc = this.char.scale;
    const wl = this.ctx.world.sides.find((w) => Math.abs(w.x - at.x) < 10 * sc && at.y >= w.y1 - 4 && at.y <= w.y2 + 4);
    if (wl) this.shoveWindow(wl.win!, wl.face * 60, 0, true);
  }

  /** Say something longer: split into bubble-sized pieces, shown one after another. */
  speak(text: string) {
    this.speech = splitSpeech(text);
    this.bubble = null;
    if (this.speech.length) this.say(this.speech.shift()!);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const look = this.config.look;
    // His drawings that came to life, and his furniture: behind him (he sits on them, stands on them).
    this.props.draw(ctx, this.ctx.world.time);
    // Squash and stretch (drawing only): scale him about his feet for a moment.
    const restore = this.squashFor(this.char.squash);
    // His belt and what's on him are drawn as part of him, in depth order with his limbs.
    const extras: DepthPart[] = [
      ...beltParts(this.char, '#3a2a22'),
      ...this.items.onHim.filter((it) => !(it.where === 'belt' && it.slot === 3)).flatMap((it) => itemParts(it, this.char)),
    ];
    if (look.pixel > 1) {
      this.pixels.draw(ctx, this.char, look, extras);
      for (const it of this.items.list) if (it.where === 'world' || it.where === 'cursor') this.pixels.paint(ctx, [it.butt, it.tip], it.drawPadding + 3 * this.char.scale, { ...look, outline: false }, (g) => drawItem(g, it));
    } else {
      drawCharacter(ctx, this.char, look, extras);
      for (const piece of this.char.loosePieces) drawLooseLimb(ctx, piece, look, this.char.scale);
      for (const it of this.items.list) if (it.where === 'world' || it.where === 'cursor') drawItem(ctx, it);
    }
    restore();
    if (this.sparks.length) drawSparks(ctx, this.sparks, Math.max(1, Math.round(look.pixel)));
    if (this.puffs.length) drawPuffs(ctx, this.puffs, Math.max(1, Math.round(look.pixel)), 'rgba(200,204,214,1)');
    drawDoodles(ctx, this.ctx.doodles, this.ctx.world.time);
    drawCursorFlight(ctx, this.cursorBody, this.ctx.world.time, !this.onMoveCursor);
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
    this.brain.configure({ mode: cfg.mind, name: cfg.name, persona: cfg.persona, puppet: cfg.puppet, autoEvery: cfg.aiInterval }, `${cfg.provider}:${cfg.model}`);
    this.mind.biases = { ...cfg.biases };
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
    this.ctx.world.cursorMovedAt = this.ctx.world.time; // it's moving (he's dragging it)
    return true;
  }

  /** His standing height plus a little: window tops closer than this to the top of the screen are no use. */
  private headroom() { const d = this.char.d; return d.thigh + d.shin + d.torso + d.neck + d.headR + 10; }

  /**
   * Latest window rectangles from the desktop shell (front-most first).
   * They arrive a few dozen times a second at most, so instead of jumping to each
   * new position we glide toward it every frame — that keeps rides smooth.
   */
  setWindows(wins: WinRect[]) {
    const now = this.ctx.world.time;
    this.windowAccess.retain(wins.map((w) => w.id));
    for (const id of this.winReported.keys()) if (!wins.some((w) => w.id === id)) { this.winReported.delete(id); this.winQuiet.delete(id); }
    for (const w of wins) this.winReported.set(w.id, { ...w });
    // A window he's moving: we know better where it is than the (slightly late) report.
    this.winTarget = wins.map((w) => {
      const m = this.winMotion.get(w.id), q = this.winQuiet.get(w.id);
      if (m) return { ...w, x: m.x, y: m.y };
      if (q && now < q.until && (Math.abs(w.x - q.x) > 1 || Math.abs(w.y - q.y) > 1)) return { ...w, x: q.x, y: q.y };
      return { ...w };
    });
  }

  // ── moving your windows (he pushes, kicks, surfs on them) ──

  /** Give a window a shove (px/s). `spring`: it wobbles back to where it was. False if he can't. */
  shoveWindow(id: number, vx: number, vy: number, spring = false) {
    if (!this.ctx.canMoveWindows || !this.ctx.canMoveWindow?.(id)) return false;
    const m = this.motionFor(id);
    if (!m) return false;
    if (spring && !m.home) m.home = { x: m.x, y: m.y };
    m.vx += vx; m.vy += vy;
    return true;
  }

  /** He's pushing a window along: keep it moving at vx (px/s) this frame. */
  pushWindow(id: number, vx: number) {
    if (!this.ctx.canMoveWindows || !this.ctx.canMoveWindow?.(id)) return false;
    const m = this.motionFor(id);
    if (!m) return false;
    m.home = undefined;
    m.push = vx;
    return true;
  }

  private motionFor(id: number): WinMotion | null {
    const have = this.winMotion.get(id);
    if (have) return have;
    const r = this.winShown.find((w) => w.id === id);
    if (!r) return null;
    const m: WinMotion = { x: r.x, y: r.y, vx: 0, vy: 0, from: { x: r.x, y: r.y }, t0: this.ctx.world.time };
    this.winMotion.set(id, m);
    return m;
  }

  /** Move the windows he set in motion: they slide and slow down (or wobble home), and stay on screen. */
  private stepWindows(dt: number) {
    if (!this.winMotion.size) return;
    const b = this.ctx.world.bounds, now = this.ctx.world.time;
    for (const [id, m] of this.winMotion) {
      const r = this.winShown.find((w) => w.id === id) ?? this.winReported.get(id);
      if (!r || !this.ctx.canMoveWindows) { this.winMotion.delete(id); continue; }
      if (m.push !== undefined) { m.vx += (m.push - m.vx) * Math.min(1, dt * 12); m.push = undefined; }
      else if (m.home) {
        // A springy wobble back to where it was.
        m.vx += (-(m.x - m.home.x) * 260 - m.vx * 14) * dt;
        m.vy += (-(m.y - m.home.y) * 260 - m.vy * 14) * dt;
      } else { const f = Math.exp(-dt * 3.2); m.vx *= f; m.vy *= f; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      // Keep it on screen: bounce off the edges (a window wider than the screen just stays put sideways).
      const minX = Math.min(b.left, b.right - r.w), maxX = Math.max(b.left, b.right - r.w);
      if (m.x < minX) { m.x = minX; m.vx = Math.abs(m.vx) * 0.4; this.sound('thud', 0.4); }
      if (m.x > maxX) { m.x = maxX; m.vx = -Math.abs(m.vx) * 0.4; this.sound('thud', 0.4); }
      if (m.y < b.top) { m.y = b.top; m.vy = Math.abs(m.vy) * 0.4; }
      if (m.y > b.floor - 40) { m.y = b.floor - 40; m.vy = -Math.abs(m.vy) * 0.4; }
      this.onMoveWindow?.(id, Math.round(m.x), Math.round(m.y), r.w, r.h);
      const t = this.winTarget?.find((w) => w.id === id);
      if (t) { t.x = m.x; t.y = m.y; }
      // Did the window really move? If the desktop still reports it where it started, moving windows isn't working.
      const rep = this.winReported.get(id);
      if (rep && now - m.t0 > 0.8 && Math.hypot(m.x - m.from.x, m.y - m.from.y) > 25 && Math.hypot(rep.x - m.from.x, rep.y - m.from.y) < 2) {
        this.windowAccess.refuse(id, now);
        this.winMotion.delete(id); this.winQuiet.delete(id);
        if (t) { t.x = rep.x; t.y = rep.y; }
        this.emit({ type: 'windowStuck' });
        continue;
      }
      const still = Math.hypot(m.vx, m.vy) < 8 && (!m.home || Math.hypot(m.x - m.home.x, m.y - m.home.y) < 0.6);
      if (still) {
        if (m.home) { m.x = m.home.x; m.y = m.home.y; this.onMoveWindow?.(id, Math.round(m.x), Math.round(m.y), r.w, r.h); }
        this.winMotion.delete(id);
        this.winQuiet.set(id, { x: m.x, y: m.y, until: now + 0.6 });
      }
    }
  }

  /** Is a window being moved by him right now? */
  windowMoving(id: number) { return this.winMotion.has(id); }

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
    this.ctx.world.windows = shown;
    if (!changed) return;
    this.windowPlats = windowPlatforms(shown, this.ctx.world.bounds, 40, this.headroom());
    this.refreshPlatforms();
    this.ctx.world.walls = windowWalls(shown, this.ctx.world.bounds, this.headroom());
    this.ctx.world.sides = windowSides(shown, this.ctx.world.bounds);
    this.char.setWalls(this.ctx.world.walls);
  }

  /**
   * What you're doing, from the desktop: which app, its window's title, and where the text and buttons
   * in your front window are. Their top edges become things he can stand (and sit) on. When the page
   * scrolls they move, and he rides along. Null = he can't tell (the setting's off).
   */
  setScreen(ui: ScreenReport | null) {
    const now = this.ctx.world.time;
    if (!ui) { this.screen = null; this.ctx.world.screen = null; this.uiPlats = []; this.ctx.world.uiTops = []; this.refreshPlatforms(); return; }
    if (!this.screen || this.screen.app !== ui.app) {
      const was = this.screen?.app;
      this.screen = { app: ui.app, title: ui.title, win: ui.win, since: now, trusted: ui.trusted };
      if (was !== undefined) this.emit({ type: 'appChanged', app: ui.app, title: ui.title });
    } else Object.assign(this.screen, { title: ui.title, win: ui.win, trusted: ui.trusted });
    this.ctx.world.screen = this.screen;
    // Only things in the window in front (the one you're using), and only where they're on screen.
    const front = this.winShown[0], b = this.ctx.world.bounds, head = this.headroom();
    const seen: typeof this.uiSeen = [], plats: Platform[] = [];
    if (front && front.id === ui.win) {
      for (const [x, y, w, h] of ui.els.slice(0, 40)) {
        if (y < b.top + head || y > b.floor - 10 || x < front.x - 2 || x + w > front.x + front.w + 2 || y < front.y + 20) continue;
        if (plats.some((p) => Math.abs(p.y - y) < 3 && p.x1 < x + w && p.x2 > x)) continue; // the same top twice (nested things)
        // The same thing as last time (moved by scrolling, maybe): it keeps its id, so he rides along.
        const prev = this.uiSeen.find((q) => Math.abs(q.x - x) < 3 && Math.abs(q.w - w) < 3 && Math.abs(q.h - h) < 3 && Math.abs(q.y - y) < 200 && !seen.includes(q));
        const id = prev?.id ?? UI_ID + (this.uiNext++ % 1_000_000);
        seen.push({ id, x, y, w, h });
        plats.push({ id, x1: x, x2: x + w, y });
      }
    }
    this.uiSeen = seen;
    this.uiPlats = plats;
    this.ctx.world.uiTops = plats;
    this.refreshPlatforms();
  }

  /** Everything he can stand on: window tops, things in your front window, and things he drew. */
  private refreshPlatforms() {
    const all = [...this.windowPlats, ...this.uiPlats, ...this.props.platforms];
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

  /** Balls meet his feet (kicks, dribbling) and his body (a ball flying into him: bonk). Things on the floor get scuffed along. */
  private ballContact() {
    const j = this.char.body.j, sc = this.char.scale, t = this.ctx.world.time;
    // (Running past, not when he's walking up to pick it up.)
    const fetching = this.mind.skill?.name === 'pickup' || this.char.handTarget !== null;
    for (const it of this.items.list) {
      if (it.where !== 'world' || fetching) continue;
      for (const n of ['footL', 'footR'] as const) {
        if (this.char.body.ghost.has(n)) continue;
        const f = j[n], fvx = (f.x - f.px) * 120;
        if (Math.abs(fvx) < 150 || it.distTo(f.x, f.y) > 4 * sc) continue;
        it.push(fvx * 0.9, -Math.abs(fvx) * 0.15);
      }
    }
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
    this.ctx.world.sides = windowSides(this.winShown, b);
    this.char.setWalls(this.ctx.world.walls);
  }

  /** Is the cursor over him, one of his loose limbs, or one of his things? (decides whether clicks reach us or the desktop) */
  hit(x: number, y: number) {
    return this.char.hitTest(x, y) !== null || this.char.hitLimb(x, y) !== null || this.items.hitWorld(x, y) !== null || this.props.ballAt(x, y) !== null || this.props.thingAt(x, y) !== null;
  }

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
    // He knocked your cursor flying: the desktop reports the moves we make. Those aren't you.
    // A position off our path means you grabbed the mouse: it's yours again.
    const cb = this.cursorBody;
    if (cb.busy(w.time)) {
      if (cb.ours(x, y, w.time)) return;
      if (cb.flying) { cb.cancel(); this.emit({ type: 'cursorFreed' }); }
    }
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
        if (this.parry(px, py, vx, vy, r.lastX)) { this.smackCooldown = w.time + 0.35; break; }
        const k = Math.min(speed, 5000) / speed * 0.55; // a share of the swipe's speed goes into him
        // A really hard swipe through an arm or a leg knocks it clean off.
        const limb = limbOf(joint);
        if (limb && speed > 3400 && this.char.destructible) this.char.detach(limb, { x: vx * k, y: vy * k - 150, z: (Math.random() - 0.5) * 500 });
        this.char.poke(joint, vx * k, vy * k - 150);
        this.smackCooldown = w.time + 0.35;
        this.sound('smack', Math.min(1, speed / 3000));
        this.emit({ type: 'smacked', speed });
        this.freeze = 0.06;
        break;
      }
    }
    w.cursor = { x, y };
    w.cursorMovedAt = w.time;
    this.cursorVel = { x: vx, y: vy };
    // He's hanging off your cursor: he comes along. Shake it hard and he lets go (and goes flying).
    if (this.char.hangingOn) {
      if (speed > 1900) this.char.release();
      else this.char.moveHold(x, y, vx, vy);
    }
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
    // Click while he's hanging off your cursor: he drops off.
    if (this.char.hangingOn) { this.char.release(); return true; }
    const joint = this.char.hitTest(x, y);
    // Carrying one of his things (you took it from his menu): press to hold on to it; let go to drop or throw it.
    if (this.items.carried) { this.carryHeld = true; return true; }
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
      const thing = this.props.thingAt(x, y);
      if (thing && !this.items.hitWorld(x, y) && !this.props.ballAt(x, y)) {
        // One of his drawings: grab it and drag it around (a stuck ledge pops loose if you pull hard).
        thing.grab(x, y);
        this.press = { joint: 'hip', thing, x, y, t: now, moved: true, grabbed: true };
        this.sound('pickup', 0.4);
        return true;
      }
      const ball = this.props.ballAt(x, y);
      if (ball) { ball.grab(x, y); this.press = { joint: 'hip', ball, x, y, t: now, moved: true, grabbed: true }; return true; }
      const it = this.items.hitWorld(x, y);
      if (it) { this.items.toCursor(it, { x, y }); this.carryHeld = true; this.sound('pickup', 0.6); return true; }
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
    if (p.thing?.held) Object.assign(p.thing.held, { x, y, vx, vy });
    if (p.ball) p.ball.moveHold(x, y, vx, vy);
    else if (p.grabbed) this.char.moveHold(x, y, vx, vy);
  }

  pointerUp(x: number, y: number) {
    if (this.carryHeld) { this.carryHeld = false; this.letGoOfItem(x, y); return; }
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.ball) { p.ball.release(); return; }
    if (p.thing) { p.thing.release(); return; }
    if (p.grabbed) { this.char.release(); return; }
    if (p.limb) { const q = p.limb.piece.points[p.limb.idx]; q.px = q.x + Math.sign(q.x - x || 1) * -3; q.py = q.y + 4; return; } // flick it
    // A quick click: a poke, as soon as it's clear this wasn't a double-click.
    this.lastClickAt = this.ctx.world.time;
    this.pendingPoke = { joint: p.joint, x, at: this.ctx.world.time };
  }

  /**
   * You let go of the thing you were holding: over him (gently), you hand it back; anywhere else it
   * drops, or flies off the way you were swinging it (a throw).
   */
  private letGoOfItem(x: number, y: number) {
    const it = this.items.carried, w = this.ctx.world;
    if (!it) return;
    const v = this.cursorVel, sp = Math.hypot(v.x, v.y);
    if (this.char.hitTest(x, y, 4) && sp < 700) { this.giveBack(it); return; }
    const k = sp > 2400 ? 2400 / sp : 1;
    this.items.drop(it, v.x * k, v.y * k);
    it.thrownAt = w.time; // thrown hard enough, it can bonk him
    this.sound(sp > 900 ? 'whoosh' : 'drop', 0.6);
    this.emit({ type: 'itemDropped', name: it.def.name.toLowerCase(), uid: it.uid });
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
  get speaking() { return !!this.bubble; }
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

  /** You take one of his things: it dangles from your cursor (press and hold to swing or throw it). */
  takeItem(it: Item) {
    const cur = this.ctx.world.cursor ?? { x: it.at.x, y: it.at.y };
    this.items.toCursor(it, cur);
    this.carryHeld = false;
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

  /**
   * He hit your cursor (a punch, a kick, his sword, a thrown ball...), at `at`, moving it at (vx, vy):
   * sparks, a smack sound, a split-second freeze, and (if that's on) the real cursor goes flying.
   */
  knockCursor(at: Vec, vx: number, vy: number, power: number, by: string) {
    const sp = Math.hypot(vx, vy) || 1, cap = 2600 / sp;
    if (cap < 1) { vx *= cap; vy *= cap; }
    const dir = Math.sign(vx || this.char.facing);
    for (let i = 0; i < 8 + power * 8; i++) {
      const a = Math.random() * Math.PI * 2, v = 100 + Math.random() * 220 * (0.5 + power);
      this.sparks.push({ x: at.x, y: at.y, vx: Math.cos(a) * v + dir * 140, vy: Math.sin(a) * v - 90, t: 0, life: 0.25 + Math.random() * 0.3, color: i % 3 ? '#ffffff' : '#ffe66d' });
    }
    this.freeze = Math.max(this.freeze, 0.03 + 0.05 * Math.min(1, power));
    this.sound(by === 'item' ? 'clang' : 'punch', Math.min(1, 0.4 + power * 0.6));
    if (this.config.knockCursor) this.cursorBody.hit(at, vx, vy, this.ctx.world.time);
    this.memory.count('cursorHits');
    this.emit({ type: 'hitCursor', power, by });
  }

  /** He jumped up and grabbed your cursor: he hangs from it by his front hand, and goes where it goes. */
  private hangOnCursor() {
    const cur = this.ctx.world.cursor, hand = this.char.useHand;
    if (!cur || !hand || !this.config.knockCursor || this.press || this.items.carried) return false;
    this.char.grab(hand === 'L' ? 'handL' : 'handR', cur.x, cur.y, true);
    this.sound('pickup', 0.5);
    return true;
  }

  /** The knocked cursor flies along; the real one follows (on the desktop). */
  private flyCursor(dt: number) {
    const w = this.ctx.world;
    const at = this.cursorBody.step(dt, w.bounds, w.platforms, w.time);
    if (!at) return;
    this.onMoveCursor?.(at.x, at.y);
    w.cursor = at;
    w.cursorMovedAt = w.time;
  }

  /** His punches and kicks: does the fist (or foot) meet your cursor, his ball, or something lying around? */
  private strikes() {
    const st = this.char.strike, w = this.ctx.world, sc = this.char.scale;
    if (!st) { this.strikeFrom = null; return; }
    const p = this.char.body.j[st.joint];
    const from = this.strikeFrom ?? { x: p.x, y: p.y };
    this.strikeFrom = { x: p.x, y: p.y };
    if (st.id === this.lastStrike) return;
    const jv = { x: (p.x - p.px) / STEP, y: (p.y - p.py) / STEP };
    const cur = w.cursor;
    if (cur && distToSegment(cur.x, cur.y, from.x, from.y, p.x, p.y) < 10 * sc) {
      // Knocked along the way the punch was going, plus a pop upward so it arcs.
      const base = st.joint.startsWith('foot') ? this.char.body.j.hip : this.char.body.j.neck;
      const dx = cur.x - base.x, dy = cur.y - base.y, d = Math.hypot(dx, dy) || 1;
      const speed = 500 + 900 * st.power;
      this.lastStrike = st.id;
      this.knockCursor({ x: cur.x, y: cur.y }, (dx / d) * speed + jv.x * 0.3, (dy / d) * speed + jv.y * 0.3 - 320 * st.power, st.power, st.joint.startsWith('foot') ? 'foot' : 'fist');
      return;
    }
    // A window's side: punched or kicked, it shoots off the way he hit it.
    if (this.ctx.canMoveWindows) {
      for (const wl of w.sides) {
        if (wl.win === undefined || this.winMotion.has(wl.win) || p.y < wl.y1 || p.y > wl.y2) continue;
        if (Math.min(from.x, p.x) - 5 * sc > wl.x || Math.max(from.x, p.x) + 5 * sc < wl.x) continue;
        if (Math.sign(jv.x) === -wl.face && Math.abs(jv.x) > 80) continue; // pulling back, not hitting it
        this.lastStrike = st.id;
        if (this.shoveWindow(wl.win, wl.face * (350 + 750 * st.power), 0)) {
          this.sound('punch', 0.9); this.sound('thud', 0.7);
          this.burstAt(wl.x, p.y, 12);
          this.freeze = Math.max(this.freeze, 0.06);
        }
        return;
      }
    }
    // Something he drew: a punch or kick shoves it (and knocks a stuck ledge loose).
    const th = this.props.thingAt(p.x, p.y);
    if (th && (Math.abs(jv.x) + Math.abs(jv.y) > 250)) {
      this.lastStrike = st.id;
      const loose = st.power > 0.5 && th.unstick();
      th.hit(p.x, p.y, jv.x * 0.5 + this.char.facing * 250 * st.power, jv.y * 0.4 - 120 * st.power);
      this.sound(loose ? 'snap' : 'kick', 0.7);
      this.burstAt(p.x, p.y, loose ? 12 : 5);
      return;
    }
    for (const b of this.props.balls) {
      if (b.heldBy || Math.hypot(b.x - p.x, b.y - p.y) > b.r + 6 * sc) continue;
      this.lastStrike = st.id;
      b.kick(jv.x * 0.8 + this.char.facing * 300 * st.power, Math.min(b.vy, jv.y * 0.6) - 280 * st.power);
      this.sound('kick', 0.7);
      return;
    }
    for (const it of this.items.list) {
      if (it.where !== 'world' || it.distTo(p.x, p.y) > 7 * sc) continue;
      this.lastStrike = st.id;
      it.push(jv.x * 0.6 + this.char.facing * 200 * st.power, -220 * st.power);
      this.sound('kick', 0.4);
      return;
    }
  }

  /**
   * Something swung in his hand (his sword, his mallet) whacks what it passes through:
   * his ball (batting practice), things lying around, loose limbs, and the sides of windows.
   */
  private bladeHits() {
    const w = this.ctx.world, sc = this.char.scale;
    for (const it of this.items.list) {
      if (it.where !== 'hand' || it.def.hit <= 0 || it.tipSpeed < 420) continue;
      const a = it.butt, b = it.tip, v = it.tipVel, power = Math.min(1.5, it.tipSpeed / 1200) * it.def.hit;
      const ready = (o: object) => (this.bladeCooldown.get(o) ?? -1) < w.time;
      const seg = (x: number, y: number) => distToSegment(x, y, a.x, a.y, b.x, b.y);
      for (const ball of this.props.balls) {
        if (ball.heldBy || !ready(ball) || seg(ball.x, ball.y) > ball.r + 3 * sc) continue;
        this.bladeCooldown.set(ball, w.time + 0.3);
        ball.kick(v.x * 0.9, Math.min(v.y * 0.9, -150) - 200);
        this.sound(it.def.use === 'smash' ? 'bonk' : 'kick', 0.9);
      }
      for (const other of this.items.list) {
        if (other === it || other.where !== 'world' || !ready(other) || seg(other.at.x, other.at.y) > 7 * sc) continue;
        this.bladeCooldown.set(other, w.time + 0.3);
        other.push(v.x * 0.7, Math.min(v.y * 0.7, -120) - 150);
        other.thrownAt = w.time;
        this.sound('clang', 0.5);
      }
      for (const th of this.props.things) {
        if (!ready(th)) continue;
        const tip = it.tip, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const at = th.contains(tip.x, tip.y) ? tip : th.contains(mid.x, mid.y) ? mid : null;
        if (!at) continue;
        this.bladeCooldown.set(th, w.time + 0.35);
        const loose = it.tipSpeed > 700 && th.unstick();
        th.hit(at.x, at.y, v.x * 0.6, v.y * 0.6 - 100);
        this.sound(loose ? 'snap' : it.def.use === 'smash' ? 'bonk' : 'clang', 0.7);
        this.burstAt(at.x, at.y, loose ? 12 : 6);
      }
      for (const piece of this.char.missing.values()) {
        if (piece.heldBy || !ready(piece) || seg(piece.root.x, piece.root.y) > 8 * sc) continue;
        this.bladeCooldown.set(piece, w.time + 0.4);
        for (const q of piece.points) { q.px = q.x - v.x * 0.5 / 120; q.py = q.y - (v.y * 0.5 - 200) / 120; }
        this.sound('thwack', 0.5);
      }
      // Windows: the blade crossing one of their sides knocks them.
      if (this.ctx.canMoveWindows) {
        for (const wl of w.sides) {
          if (wl.win === undefined || !ready(wl) || this.winMotion.has(wl.win)) continue;
          if (Math.min(a.x, b.x) > wl.x || Math.max(a.x, b.x) < wl.x) continue;
          const yAt = a.x === b.x ? a.y : a.y + (b.y - a.y) * ((wl.x - a.x) / (b.x - a.x));
          if (yAt < wl.y1 || yAt > wl.y2) continue;
          if (Math.sign(v.x) === -wl.face && Math.abs(v.x) > 100) continue; // swinging away from it
          this.bladeCooldown.set(wl, w.time + 0.5);
          this.shoveWindow(wl.win, -wl.face * (250 + 450 * power), it.def.use === 'smash' ? 120 : 0);
          this.sound(it.def.use === 'smash' ? 'bonk' : 'clang', 0.8);
          this.burstAt(wl.x, yAt, 8);
        }
        // A smash on top of the window he's standing on: it jolts down and springs back.
        const pl = this.char.supportPlatform();
        if (it.def.use === 'smash' && pl?.win !== undefined && v.y > 300 && ready(pl) && Math.abs(b.y - pl.y) < 8 * sc) {
          this.bladeCooldown.set(pl, w.time + 0.5);
          this.shoveWindow(pl.win, 0, 500 * power, true);
          this.sound('bonk', 1);
          this.burstAt(b.x, pl.y, 10);
        }
      }
    }
  }

  private burstAt(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 180;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.25 + Math.random() * 0.3, color: i % 2 ? '#ffffff' : '#ffe66d' });
    }
  }

  /** Things flying through the air (his ball, or something you threw): they can hit your cursor, or him. */
  private flyingItems() {
    const w = this.ctx.world, cur = w.cursor, t = w.time, sc = this.char.scale;
    for (const it of this.items.list) {
      if (it.where !== 'world' || t - it.thrownAt > 2.5) continue;
      const v = { x: (it.a.x - it.a.px) * 120, y: (it.a.y - it.a.py) * 120 }, speed = Math.hypot(v.x, v.y);
      if (speed < 260) continue;
      if (cur && it.distTo(cur.x, cur.y) < 9 * sc && (this.bladeCooldown.get(it) ?? -1) < t) {
        this.bladeCooldown.set(it, t + 0.4);
        this.knockCursor({ x: cur.x, y: cur.y }, v.x * 0.9, v.y * 0.9 - 200, Math.min(1, speed / 1200) * Math.max(0.4, it.def.hit), 'item');
        it.push(-v.x * 0.35, -Math.abs(v.y) * 0.3 - 120); // and it bounces off
        continue;
      }
      // Flying into him (not right after he threw it).
      if (t - it.thrownAt > 0.35 && speed > 420 && t > this.bonkCooldown) {
        const joint = this.char.hitTest(it.at.x, it.at.y, 3);
        if (joint && !joint.startsWith('foot')) {
          this.char.poke(joint, v.x * 0.3, v.y * 0.3 - 80);
          it.push(-v.x * 0.3, -Math.abs(v.y) * 0.3 - 150);
          this.bonkCooldown = t + 0.6;
          this.sound('bonk', Math.min(1, speed / 1200));
          this.emit({ type: 'bonked', speed });
        }
      }
    }
  }

  /**
   * You swiped at him while he's ready for it (sword out, or fists up): he blocks it and
   * knocks your cursor back. Returns true if he did.
   */
  private parry(x: number, y: number, vx: number, vy: number, fromX: number) {
    const ch = this.char, w = this.ctx.world;
    if (this.mood.asleep || ch.mode !== 'ground') return false;
    const blade = this.items.list.find((it) => it.where === 'hand' && (it.def.use === 'swing' || it.def.use === 'smash'));
    // He can only block what comes at him from the front.
    const facing = Math.sign(fromX - ch.x) === ch.facing || Math.sign(vx) === -ch.facing;
    const odds = blade ? 0.7 : ch.guard ? 0.35 : 0;
    if (!facing || Math.random() >= odds) return false;
    this.knockCursor({ x, y }, -vx * 0.6 + ch.facing * 500, -vy * 0.4 - 250, blade ? 0.9 : 0.6, blade ? 'item' : 'fist');
    this.sound('clang', 1);
    this.emit({ type: 'parried' });
    w.cursorMovedAt = w.time;
    return true;
  }

  /** Finished drawings on top of a window stick to it: they move with it, and go when it does. */
  private anchorDoodles() {
    const wins = this.ctx.world.windows, now = this.ctx.world.time;
    for (const d of this.ctx.doodles) {
      if (d.alive || d.becomes) continue;
      if (d.win === undefined) {
        if (!d.done || d.anchored || d.cx === undefined || d.cy === undefined) continue;
        d.anchored = true;
        const host = wins.find((r) => d.cx! >= r.x && d.cx! <= r.x + r.w && d.cy! >= r.y && d.cy! <= r.y + r.h);
        if (host) { d.win = host.id; d.wx = host.x; d.wy = host.y; }
        continue;
      }
      const r = wins.find((x) => x.id === d.win);
      if (!r) { d.born = Math.min(d.born, now - DOODLE_LIFE + 0.6); continue; } // the window's gone: so is the drawing
      const dx = r.x - d.wx!, dy = r.y - d.wy!;
      if (!dx && !dy) continue;
      for (const st of d.strokes) for (const q of st) { q.x += dx; q.y += dy; }
      d.cx! += dx; d.cy! += dy; d.wx = r.x; d.wy = r.y;
    }
  }

  /** Play a sound effect (if sounds are on). */
  sound(name: string, strength = 1) { if (this.config.sfx) this.onSound?.(name, strength); }

  /**
   * Squash and stretch: move his joints (just for drawing) as if he were squashed (s < 0)
   * or stretched (s > 0) about his feet. Returns a function that puts them back.
   */
  private squashFor(s: number): () => void {
    if (Math.abs(s) < 0.004) return () => {};
    const j = this.char.body.j, pts = this.char.body.points;
    const px = (j.footL.x + j.footR.x) / 2, py = Math.max(j.footL.y, j.footR.y);
    const saved = pts.map((p) => [p.x, p.y] as const);
    const sy = 1 + s, sx = 1 - s * 0.6;
    for (const p of pts) { p.x = px + (p.x - px) * sx; p.y = py + (p.y - py) * sy; }
    const items = this.items.onHim.map((it) => [it, it.at] as const);
    for (const [it] of items) it.at = { x: px + (it.at.x - px) * sx, y: py + (it.at.y - py) * sy, z: it.at.z };
    return () => {
      pts.forEach((p, i) => { p.x = saved[i][0]; p.y = saved[i][1]; });
      for (const [it, at] of items) it.at = at;
    };
  }

  get dragging() { return this.press !== null; }

  // ── for the settings window ──

  /** A snapshot of his inner state (shown as live bars in settings). */
  stats() {
    return {
      name: this.config.name,
      mood: { ...this.mood.s },
      label: this.mood.emotion,
      asleep: this.mood.asleep,
      doing: this.mind.skill?.name ?? this.char.mode,
      missing: [...this.char.missing.keys()],
      why: this.mind.why,
      recent: this.mind.recent.slice(-8),
      windows: this.winShown.length,
      windowsStuck: this.windowAccess.anyBlocked(this.ctx.world.time),
      moveNote: this.moveNote,
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
        kinds: [...this.items.defs.values()].map((d) => ({ id: d.id, name: d.name, about: d.about, use: d.use, wear: d.wear, sprite: d.sprite, shape: d.shape, drawn: !!d.drawn })),
        list: this.items.list.map((it) => ({ uid: it.uid, id: it.def.id, name: it.def.name, where: it.where, slot: it.slot, drawn: !!it.def.drawn })),
      },
      props: {
        kinds: [...this.props.defs.values()].map((d) => ({ id: d.id, name: d.name, about: d.about, sprite: d.sprite, shape: d.shape })),
        placed: this.props.placed.map((t, i) => ({ i, id: t.def!.id, name: t.def!.name })),
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
    if (verb === 'prop') { this.propCommand(arg); this.onCollections?.(); return; }
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
   *   item:give:<kind>  item:spawn:<kind>  item:take:<uid>  item:return:<uid>  item:drop:<uid>  item:remove:<uid>
   */
  private itemCommand(arg: string) {
    const [verb, id] = arg.split(':');
    const it = this.items.list.find((x) => x.uid === Number(id));
    switch (verb) {
      case 'give': this.items.give(id, this.char); this.sound('pickup', 0.6); break;
      case 'spawn': {
        // Dropped in from the top of the screen, a little way from him: he notices and goes to get it.
        const b = this.ctx.world.bounds, side = Math.random() < 0.5 ? -1 : 1;
        const x = Math.min(b.right - 40, Math.max(b.left + 40, this.char.x + side * (90 + Math.random() * 160)));
        const made = this.items.spawn(id, { x, y: b.top + 10 }, this.char.scale);
        if (made) { this.sound('poof', 0.6); this.emit({ type: 'itemSpawned', name: made.def.name.toLowerCase(), uid: made.uid }); }
        break;
      }
      case 'take': if (it && (it.where === 'belt' || it.where === 'hand' || it.where === 'worn')) this.takeItem(it); break;
      case 'return': if (it) this.giveBack(it); break;
      case 'drop': if (it) this.items.drop(it, 0, 0); break;
      case 'remove': if (it) this.items.remove(it); break;
    }
  }

  /**
   * Props, from the Items tab:  prop:spawn:<kind>  prop:remove:<index>  prop:clear
   */
  private propCommand(arg: string) {
    const [verb, id] = arg.split(':');
    const b = this.ctx.world.bounds;
    if (verb === 'spawn') {
      // Dropped in from the top of the screen, a little way from him.
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = Math.min(b.right - 80, Math.max(b.left + 80, this.char.x + side * (130 + Math.random() * 200)));
      const t = this.props.spawn(id, x, b.top + 10, this.char.scale);
      if (t) { this.sound('poof', 0.7); this.emit({ type: 'propSpawned', id: t.def!.id, name: t.def!.name }); }
    } else if (verb === 'channel') { const t = this.props.placed[Number(id)]; if (t?.def?.use === 'tv') { t.channel = (t.channel + 1) % 4; this.sound('click', 0.5); } }
    else if (verb === 'remove') { const t = this.props.placed[Number(id)]; if (t) { this.props.remove(t); this.sound('poof', 0.4); } }
    else if (verb === 'clear') for (const t of this.props.placed) this.props.remove(t);
  }

  /** Definition files from your items folder: items and props (a prop file says "type": "prop"). */
  addDefs(list: unknown[]) {
    const isProp = (d: unknown) => !!d && typeof d === 'object' && (d as { type?: unknown }).type === 'prop';
    this.items.addDefs(list.filter((d) => !isProp(d)));
    this.props.addDefs(list.filter(isProp));
    // Props of yours he had out last time, now that their files are here.
    const waiting = this.pendingProps.splice(0);
    for (const p of waiting) {
      const def = this.props.defs.get(p.id);
      if (!def) continue;
      this.props.spawn(p.id, p.x, this.ctx.world.bounds.floor - Math.max(...def.outline.map((q) => q[1])) * this.char.scale - 2, this.char.scale, p.art);
    }
    this.onCollections?.();
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
    return JSON.stringify({ v: 1, mood: this.mood.save(), lessons: this.ctx.lessons, gallery: this.gallery, moves: this.brain.savedMoves, items: this.items.save(), itemsKnown: [...this.items.known], props: this.props.savePlaced() });
  }
  load(json: string | null) {
    if (!json) return;
    try {
      const d = JSON.parse(json);
      this.mood.load(d.mood);
      if (Number.isFinite(d.lessons?.safeDrop)) this.ctx.lessons.safeDrop = Math.max(40, Math.min(600, d.lessons.safeDrop));
      if (Array.isArray(d.gallery)) this.gallery = d.gallery.slice(-40).flatMap((g: unknown) => {
        const art = parseCanvasArt(g);
        return art ? [{ ...art, at: Number.isFinite((g as { at?: number }).at) ? (g as { at: number }).at : Date.now() }] : [];
      });
      // Same array object the brain and mind already hold: fill it in place.
      if (Array.isArray(d.moves)) this.brain.savedMoves.splice(0, Infinity, ...d.moves.slice(-30).flatMap((m: unknown) => {
        if (!m || typeof m !== 'object') return [];
        const move = m as { name?: unknown; frames?: unknown };
        const frames = parseMove(move.frames);
        return frames && typeof move.name === 'string' && move.name.trim() ? [{ name: move.name.trim().slice(0, 40), frames }] : [];
      }));
      if (Array.isArray(d.items)) this.items.load(d.items, this.char, d.itemsKnown);
      // His furniture, back where it was (standing on the floor).
      if (Array.isArray(d.props)) for (const p of d.props.slice(0, 12)) {
        if (!p || typeof p.id !== 'string' || !Number.isFinite(p.x)) continue;
        const def = this.props.defs.get(p.id);
        if (!def) { this.pendingProps.push(p); continue; } // one of yours: its file loads a moment later
        const h = Math.max(...def.outline.map((q) => q[1])) * this.char.scale;
        this.props.spawn(p.id, p.x, this.ctx.world.bounds.floor - h - 2, this.char.scale, p.art);
      }
    } catch { /* corrupt save: start fresh */ }
  }
}
