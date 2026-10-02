// The overlay page: sets up the canvas, runs the frame loop, feeds mouse input
// to the pet, and tells the desktop shell when clicks should pass through.

import { Pet, type PetConfig } from '../core/pet';
import type { Bounds } from '../core/physics';
import type { WinRect } from '../core/world';

/** Provided by the Electron preload script. Missing in a plain browser (preview mode). */
interface PetShell {
  setClickThrough(ignore: boolean): void;
  getConfig(): Promise<PetConfig>;
  onConfig(cb: (c: PetConfig) => void): void;
  sendStats(stats: unknown): void;
  onCommand(cb: (cmd: string) => void): void;
  onWindows(cb: (wins: WinRect[]) => void): void;
  pressed(): void;
  moveCursor(x: number, y: number): void;
}
const shell = (window as unknown as { petShell?: PetShell }).petShell;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

if (!shell) {
  document.body.classList.add('preview');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Preview mode — click to poke, drag to pick up, fling to throw. Press S to toggle smack mode.';
  window.addEventListener('keydown', (e) => { if (e.key === 's') pet.config.smacking = !pet.config.smacking; });
  document.body.appendChild(hint);
}

function bounds(): Bounds {
  return { left: 0, right: window.innerWidth, top: 0, floor: window.innerHeight };
}

const pet = new Pet(bounds());
// Remember his mood between runs (browser storage works in Electron too).
const SAVE_KEY = 'pet-save';
try { pet.load(localStorage.getItem(SAVE_KEY)); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(SAVE_KEY, pet.save()); } catch { /* ignore */ } };
setInterval(save, 15000);
window.addEventListener('beforeunload', save);

// Settings live in the desktop shell (pet.json). Get them now, and whenever they change.
if (shell) {
  shell.getConfig().then((c) => pet.applyConfig(c));
  shell.onConfig((c) => pet.applyConfig(c));
  shell.onCommand((cmd) => pet.command(cmd));
  shell.onWindows((wins) => pet.setWindows(wins)); // other apps' windows become platforms
  pet.onMoveCursor = (x, y) => shell.moveCursor(x, y); // mischief mode
  setInterval(() => shell.sendStats(pet.stats()), 400);
}
(window as unknown as { pet: Pet }).pet = pet; // handy for poking at from DevTools

function resize() {
  const dpr = window.devicePixelRatio || 1; // Retina screens have 2+ real pixels per point
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pet.setBounds(bounds());
}
window.addEventListener('resize', resize);
resize();

// ── click-through ──
// The window ignores the mouse (clicks fall through to your desktop) except
// while the cursor is over him or you're dragging him.
let ignoring = true;
function updateClickThrough(x: number, y: number) {
  const want = !(pet.dragging || pet.hit(x, y));
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
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
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
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (fakeWins.length) drawFakeWindows();
  pet.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
