// The overlay page: sets up the canvas, runs the frame loop, feeds mouse input
// to the pet, and tells the desktop shell when clicks should pass through.

import { Pet, type PetConfig } from '../core/pet';
import type { Bounds } from '../core/physics';
import type { WinRect } from '../core/world';
import type { BrainRequest } from '../core/brain';
import { playBlip, playSfx } from './sfx';
import { createGamePanel } from './game-panel';

/** Provided by the Electron preload script. Missing in a plain browser (preview mode). */
interface PetShell {
  setClickThrough(ignore: boolean): void;
  getConfig(): Promise<PetConfig>;
  onConfig(cb: (c: PetConfig) => void): void;
  sendStats(stats: unknown): void;
  sendCollections(data: unknown): void;
  onCommand(cb: (cmd: string) => void): void;
  onWindows(cb: (wins: WinRect[]) => void): void;
  onWindowsLog(cb: (line: string) => void): void;
  onUi(cb: (ui: import('../core/pet').ScreenReport | null) => void): void;
  pressed(): void;
  moveCursor(x: number, y: number): void;
  moveWindow(id: number, x: number, y: number, w: number, h: number): void;
  ask(req: BrainRequest): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  loadMemory(): Promise<string | null>;
  saveMemory(json: string): void;
  openSettings(): void;
  getItemDefs(): Promise<unknown[]>;
  onItemDefs(cb: (defs: unknown[]) => void): void;
  setTyping(on: boolean): void;
}
const shell = (window as unknown as { petShell?: PetShell }).petShell;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

if (!shell) {
  document.body.classList.add('preview');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Preview mode — click to poke, drag to pick up, fling to throw. Press S to toggle smack mode.';
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !((e.target as Element).closest('input, textarea, button, summary, [contenteditable]'))) pet.config.smacking = !pet.config.smacking;
  });
  document.body.appendChild(hint);
}

function bounds(): Bounds {
  return { left: 0, right: window.innerWidth, top: 0, floor: window.innerHeight };
}

const pet = new Pet(bounds());
// Remember his mood between runs (browser storage works in Electron too).
const SAVE_KEY = 'pet-save';
try { pet.load(localStorage.getItem(SAVE_KEY)); } catch { /* storage blocked */ }
// His memories: a file next to his settings on the desktop, browser storage in preview mode.
const MEMORY_KEY = 'pet-memory';
let memoryLoaded = !shell;
try { if (!shell) pet.memory.load(localStorage.getItem(MEMORY_KEY)); } catch { /* storage blocked */ }
shell?.loadMemory().then((json) => { pet.memory.load(json); memoryLoaded = true; pet.onCollections?.(); }, () => { memoryLoaded = true; });
let memTimer: ReturnType<typeof setTimeout> | undefined;
const saveMemory = () => {
  if (!memoryLoaded) return; // don't overwrite the file before we've read it
  const json = pet.memory.save();
  if (shell) shell.saveMemory(json); else try { localStorage.setItem(MEMORY_KEY, json); } catch { /* ignore */ }
};
pet.onMemorySave = () => { clearTimeout(memTimer); memTimer = setTimeout(saveMemory, 1000); };
const save = () => { try { localStorage.setItem(SAVE_KEY, pet.save()); } catch { /* ignore */ } saveMemory(); };
setInterval(save, 15000);
window.addEventListener('beforeunload', save);

// Settings live in the desktop shell (pet.json). Get them now, and whenever they change.
if (shell) {
  shell.getConfig().then((c) => pet.applyConfig(c));
  shell.onConfig((c) => pet.applyConfig(c));
  shell.onCommand((cmd) => pet.command(cmd));
  shell.onWindows((wins) => pet.setWindows(wins)); // other apps' windows become platforms
  shell.onUi((ui) => pet.setScreen(ui)); // what you're doing: he comments on it, and sits on things in your window
  shell.onWindowsLog((line) => { if (line.startsWith('move:')) pet.moveNote = line.slice(5).trim(); }); // how moving windows is going
  pet.onMoveCursor = (x, y) => shell.moveCursor(x, y); // mischief mode, and knocking it flying
  pet.onMoveWindow = (id, x, y, w, h) => shell.moveWindow(id, x, y, w, h); // he pushes your windows around
  // AI brain: the desktop shell makes the actual call (it holds the API key).
  pet.brain.ask = async (req) => {
    const r = await shell.ask(req);
    if (!r.ok) throw new Error(r.error);
    return r.text;
  };
  setInterval(() => shell.sendStats(pet.stats()), 400);
  // Item definition files (yours, from the items folder) on top of the ones he comes with.
  shell.getItemDefs().then((d) => pet.addDefs(d), () => {});
  shell.onItemDefs((d) => pet.addDefs(d));
  pet.onOpenSettings = () => shell.openSettings();
  pet.onCollections = () => { shell.sendCollections(pet.collections()); save(); };
}
(window as unknown as { pet: Pet }).pet = pet; // handy for poking at from DevTools

// ── his voice and sound effects (made in code: see sfx.ts) ──
// Voice: tiny square-wave blips, one per couple of letters (like Undertale or Animal Crossing).
pet.onBlip = (pitch) => playBlip(pitch, pet.config.volume);
pet.onSound = (name, strength) => playSfx(name, strength, pet.config.volume, 0.8 + pet.mood.s.happiness * 0.4);

function resize() {
  const dpr = window.devicePixelRatio || 1; // Retina screens have 2+ real pixels per point
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pet.setBounds(bounds());
}
window.addEventListener('resize', resize);
resize();

// ── talking to him right on the desktop ──
// Double-click him (or pick "Talk" from his right-click menu): a little text box pops up over his head.
const talk = document.getElementById('talk') as HTMLFormElement;
const talkText = document.getElementById('talkText') as HTMLInputElement;
let talkOpen = false, talkIdle = 0, gameTyping = false;
const syncTyping = () => shell?.setTyping(talkOpen || gameTyping);
function openTalk() {
  talkOpen = true;
  talk.classList.add('open');
  talk.style.setProperty('--ink', pet.config.look.color);
  syncTyping(); // the desktop window has to accept typing for a moment
  pet.listening = true;
  talkIdle = performance.now();
  placeTalk();
  setTimeout(() => talkText.focus(), 30);
}
function closeTalk() {
  if (!talkOpen) return;
  talkOpen = false;
  talk.classList.remove('open');
  talkText.blur();
  pet.listening = false;
  syncTyping();
}
function placeTalk() {
  const a = pet.talkAnchor();
  const width = talk.offsetWidth, height = talk.offsetHeight;
  // Leave his speech bubble its own space above his head, even while the input is open.
  const bubbleSpace = pet.speaking ? 80 : 14;
  let x = Math.min(Math.max(a.x, width / 2 + 8), window.innerWidth - width / 2 - 8), bottom = Math.max(a.y - bubbleSpace, height + 8);
  const game = gamePanel.rect();
  if (game && x + width / 2 > game.left - 8 && x - width / 2 < game.right + 8 && bottom > game.top - 8 && bottom - height < game.bottom + 8) {
    if (game.left >= width + 16) x = game.left - width / 2 - 10;
    else if (window.innerWidth - game.right >= width + 16) x = game.right + width / 2 + 10;
    else bottom = game.top > height + 18 ? game.top - 10 : Math.min(window.innerHeight - 8, game.bottom + height + 10);
  }
  talk.style.left = `${x}px`; talk.style.top = `${bottom}px`;
}
pet.onTalk = openTalk;
talk.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = talkText.value.trim();
  if (text) pet.command(`hear:${text}`);
  talkText.value = '';
  talkIdle = performance.now();
});
talkText.addEventListener('input', () => { talkIdle = performance.now(); });
talkText.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTalk(); });
document.getElementById('talkClose')!.addEventListener('click', closeTalk);
const overTalk = (x: number, y: number) => {
  if (!talkOpen) return false;
  const r = talk.getBoundingClientRect();
  return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 12;
};
const gamePanel = createGamePanel(pet, (on) => { gameTyping = on; syncTyping(); }, openTalk);

// ── click-through ──
// The window ignores the mouse (clicks fall through to your desktop) except
// while the cursor is over him, his menu or his talk box, you're dragging him,
// or you're carrying one of his things (then a click anywhere drops it).
let ignoring = true;
function updateClickThrough(x: number, y: number) {
  const want = !(pet.dragging || gamePanel.dragging || pet.hit(x, y) || pet.uiHit(x, y) || pet.carrying || overTalk(x, y) || gamePanel.over(x, y));
  if (want !== ignoring) {
    ignoring = want;
    shell?.setClickThrough(want);
    canvas.style.cursor = want ? 'default' : 'grab';
  }
}

// ── mouse ──
let last = { x: 0, y: 0, t: performance.now() };
let vel = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
  const now = performance.now();
  const dt = Math.max((now - last.t) / 1000, 1 / 240);
  // Smoothed mouse velocity, used when you throw him.
  vel.x += ((e.clientX - last.x) / dt - vel.x) * 0.5;
  vel.y += ((e.clientY - last.y) / dt - vel.y) * 0.5;
  last = { x: e.clientX, y: e.clientY, t: now };
  pet.cursor(e.clientX, e.clientY, vel.x, vel.y);
  pet.pointerMove(e.clientX, e.clientY, vel.x, vel.y, now);
  updateClickThrough(e.clientX, e.clientY);
});
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (gamePanel.over(e.clientX, e.clientY)) return;
  if (pet.contextMenu(e.clientX, e.clientY)) shell?.pressed();
  updateClickThrough(e.clientX, e.clientY);
});
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (overTalk(e.clientX, e.clientY) || gamePanel.over(e.clientX, e.clientY)) return;
  if (talkOpen && !pet.hit(e.clientX, e.clientY)) closeTalk(); // clicked away: done talking
  if (pet.pointerDown(e.clientX, e.clientY, performance.now())) {
    canvas.style.cursor = 'grabbing';
    shell?.pressed();
  }
});
window.addEventListener('mouseup', (e) => {
  if (pet.dragging) shell?.pressed(); // hand focus back once more after letting go
  pet.pointerUp(e.clientX, e.clientY);
  updateClickThrough(e.clientX, e.clientY);
});
// If the mouse leaves the window mid-drag, let go.
window.addEventListener('blur', () => pet.pointerUp(last.x, last.y));

// ── preview mode: a couple of fake windows to climb on ──
const fakeWins: WinRect[] = [];
if (!shell) {
  const W = window.innerWidth, H = window.innerHeight;
  fakeWins.push({ id: 1, x: W * 0.08, y: H - 210, w: Math.min(360, W * 0.3), h: 260 });
  fakeWins.push({ id: 2, x: W * 0.55, y: H - 330, w: Math.min(420, W * 0.35), h: 380 });
  pet.setWindows(fakeWins);
  // He can push the fake windows around too.
  pet.onMoveWindow = (id, x, y) => {
    const w = fakeWins.find((f) => f.id === id);
    if (w) { w.x = x; w.y = y; pet.setWindows(fakeWins); }
  };
}
function drawFakeWindows() {
  for (const w of fakeWins) {
    ctx.fillStyle = '#f4f5fa'; ctx.strokeStyle = '#0003';
    ctx.beginPath(); ctx.roundRect(w.x, w.y, w.w, w.h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dfe2ec'; ctx.beginPath(); ctx.roundRect(w.x, w.y, w.w, 26, [8, 8, 0, 0]); ctx.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w.x + 14 + i * 16, w.y + 13, 5, 0, 7); ctx.fill(); });
  }
}

// ── frame loop ──
let prev = performance.now();
function frame(now: number) {
  const dt = (now - prev) / 1000;
  prev = now;
  // The mouse may sit still while held; decay its velocity so he isn't "thrown" on release.
  if (now - last.t > 50) { vel.x *= 0.8; vel.y *= 0.8; pet.pointerMove(last.x, last.y, vel.x, vel.y, now); }
  pet.update(dt);
  gamePanel.update();
  updateClickThrough(last.x, last.y);
  if (talkOpen) { placeTalk(); if (now - talkIdle > 45000 && document.activeElement !== talkText) closeTalk(); }
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (fakeWins.length) drawFakeWindows();
  pet.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
