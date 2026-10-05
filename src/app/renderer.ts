// The overlay page: sets up the canvas, runs the frame loop, feeds mouse input to the stick figures,
// and tells the desktop shell when clicks should pass through.
//
// There can be two stick figures (Blurp, and the second one: Leonard by default). They're equals:
// each has its own settings (its own settings window, in its own color), its own save, memory and AI
// brain, its own talk box. They share the furniture, the windows and your cursor. `pets[0]` runs and
// saves the furniture; the second one is on whenever the first one's settings say so.

import { Pet, friendConfig, DEFAULT_CONFIG, type PetConfig } from '../core/pet';
import type { Bounds } from '../core/physics';
import type { WinRect } from '../core/world';
import type { BrainRequest } from '../core/brain';
import { playBlip, playSfx } from './sfx';
import { createGamePanel } from './game-panel';
import { SwordMove, MOVES, STANCES, guardPose } from '../core/skills/swordplay';

/** Provided by the Electron preload script. Missing in a plain browser (preview mode). */
interface PetShell {
  setClickThrough(ignore: boolean): void;
  getConfigs(): Promise<PetConfig[]>;
  onConfig(cb: (c: { id: number; config: PetConfig }) => void): void;
  sendStats(id: number, stats: unknown): void;
  sendCollections(id: number, data: unknown): void;
  onCommand(cb: (c: { id: number; cmd: string }) => void): void;
  onWindows(cb: (wins: WinRect[]) => void): void;
  onWindowsLog(cb: (line: string) => void): void;
  onUi(cb: (ui: import('../core/pet').ScreenReport | null) => void): void;
  pressed(): void;
  moveCursor(x: number, y: number): void;
  moveWindow(id: number, x: number, y: number, w: number, h: number): void;
  ask(id: number, req: BrainRequest): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  loadMemory(id: number): Promise<string | null>;
  saveMemory(id: number, json: string): void;
  openSettings(id?: number, tab?: string): void;
  getItemDefs(): Promise<unknown[]>;
  onItemDefs(cb: (defs: unknown[]) => void): void;
  setTyping(on: boolean): void;
}
const shell = (window as unknown as { petShell?: PetShell }).petShell;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function bounds(): Bounds {
  return { left: 0, right: window.innerWidth, top: 0, floor: window.innerHeight };
}

/** The stick figures: index = their id (0 = Blurp, 1 = the second one). */
const pets: Pet[] = [];
let lastWins: WinRect[] = [], lastDefs: unknown[] = [];
// Browser storage for their mood and things (works in Electron too); memories go in files on the desktop.
const saveKey = (id: number) => (id ? `pet-save-${id + 1}` : 'pet-save');
const memoryKey = (id: number) => (id ? `pet-memory-${id + 1}` : 'pet-memory');
const memoryLoaded: boolean[] = [];

/** Save one of them (mood, things, gallery) and their memories. */
function saveOne(id: number) {
  const p = pets[id];
  if (!p) return;
  try { localStorage.setItem(saveKey(id), p.save()); } catch { /* ignore */ }
  if (!memoryLoaded[id]) return; // don't overwrite the file before we've read it
  const json = p.memory.save();
  if (shell) shell.saveMemory(id, json); else try { localStorage.setItem(memoryKey(id), json); } catch { /* ignore */ }
}
const save = () => pets.forEach((_, id) => saveOne(id));
setInterval(save, 15000);
window.addEventListener('beforeunload', save);

/** Bring one of them to life: load their save and memories, and wire them to the desktop. */
function makePet(id: number, config: PetConfig): Pet {
  const p = id === 0 ? new Pet(bounds(), config) : new Pet(bounds(), config, { props: pets[0].props });
  try {
    // (The second one used to be saved as "friend-save"/"friend-memory": pick those up once.)
    p.load(localStorage.getItem(saveKey(id)) ?? (id === 1 ? localStorage.getItem('friend-save') : null));
    if (!shell) p.memory.load(localStorage.getItem(memoryKey(id)) ?? (id === 1 ? localStorage.getItem('friend-memory') : null));
  } catch { /* storage blocked */ }
  memoryLoaded[id] = !shell;
  shell?.loadMemory(id).then((json) => {
    if (json === null && id === 1) { try { json = localStorage.getItem('friend-memory'); } catch { /* ignore */ } }
    p.memory.load(json); memoryLoaded[id] = true; p.onCollections?.();
  }, () => { memoryLoaded[id] = true; });
  let memTimer: ReturnType<typeof setTimeout> | undefined;
  p.onMemorySave = () => { clearTimeout(memTimer); memTimer = setTimeout(() => saveOne(id), 1000); };
  p.setWindows(lastWins);
  if (lastDefs.length) p.addDefs(lastDefs);
  // Voices: the second one a little lower, so you can tell who's talking.
  p.onBlip = (pitch) => playBlip(pitch * (id ? 0.85 : 1), p.config.volume);
  p.onSound = (name, strength) => playSfx(name, strength, p.config.volume, (id ? 0.75 : 0.8) + p.mood.s.happiness * 0.4);
  p.onTalk = () => openTalk(p);
  if (shell) {
    p.onMoveCursor = (x, y) => shell.moveCursor(x, y); // mischief mode, and knocking it flying
    p.onMoveWindow = (wid, x, y, w, h) => shell.moveWindow(wid, x, y, w, h); // pushing your windows around
    // AI brain: the desktop shell makes the actual call (it holds the API key).
    p.brain.ask = async (req) => {
      const r = await shell.ask(id, req);
      if (!r.ok) throw new Error(r.error);
      return r.text;
    };
    p.onOpenSettings = () => shell.openSettings(id);
    p.onCollections = () => { shell.sendCollections(id, p.collections()); saveOne(id); };
  } else {
    p.onMoveWindow = (wid, x, y) => { const w = fakeWins.find((q) => q.id === wid); if (w) { w.x = x; w.y = y; setWindowsAll(fakeWins); } };
  }
  return p;
}

/** Their settings arrived (or changed): apply them, and add or remove the second one. */
function applyConfigs(configs: PetConfig[]) {
  pets[0].applyConfig(configs[0]);
  const want = configs[0].friend.on && !!configs[1];
  if (want && !pets[1]) {
    const p = makePet(1, configs[1]);
    // Drops in on the other side of the screen from the first one.
    const b = bounds(), x = pets[0].char.x < (b.left + b.right) / 2 ? b.right * 0.75 : b.right * 0.25;
    p.char.body.translate(x - p.char.x, 0);
    pets[1] = p;
  } else if (!want && pets[1]) {
    saveOne(1);
    if (talkPet === pets[1]) closeTalk();
    pets.length = 1;
  } else if (want) pets[1].applyConfig(configs[1]);
  for (const p of pets) p.others = pets.filter((o) => o !== p);
}
const configs: PetConfig[] = [structuredClone(DEFAULT_CONFIG)];
configs[1] = friendConfig(configs[0]);
pets[0] = makePet(0, configs[0]);

const setWindowsAll = (wins: WinRect[]) => { lastWins = wins; for (const p of pets) p.setWindows(wins); };

// Settings live in the desktop shell (pet.json, pet-2.json). Get them now, and whenever they change.
if (shell) {
  shell.getConfigs().then((cs) => { cs.forEach((c, i) => (configs[i] = c)); applyConfigs(configs); });
  shell.onConfig(({ id, config }) => { configs[id] = config; applyConfigs(configs); });
  shell.onCommand(({ id, cmd }) => pets[id]?.command(cmd));
  shell.onWindows((wins) => setWindowsAll(wins)); // other apps' windows become platforms
  shell.onUi((ui) => { for (const p of pets) p.setScreen(ui); }); // what you're doing: they comment on it, and sit on things in your window
  shell.onWindowsLog((line) => { if (line.startsWith('move:')) for (const p of pets) p.moveNote = line.slice(5).trim(); }); // how moving windows is going
  setInterval(() => pets.forEach((p, id) => shell.sendStats(id, p.stats())), 400);
  // Item definition files (yours, from the items folder) on top of the ones they come with.
  shell.getItemDefs().then((d) => { lastDefs = d; for (const p of pets) p.addDefs(d); }, () => {});
  shell.onItemDefs((d) => { lastDefs = d; for (const p of pets) p.addDefs(d); });
}
(window as unknown as { pet: Pet }).pet = pets[0]; // handy for poking at from DevTools
Object.defineProperty(window, 'friend', { get: () => pets[1] ?? null }); // the second one, the same way
Object.defineProperty(window, 'pets', { get: () => pets });
(window as unknown as { swordplay: unknown }).swordplay = { SwordMove, MOVES, STANCES, guardPose }; // for trying sword moves from DevTools

if (!shell) {
  document.body.classList.add('preview');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Preview mode — click to poke, drag to pick up, fling to throw. Press S to toggle smack mode.';
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !((e.target as Element).closest('input, textarea, button, summary, [contenteditable]'))) for (const p of pets) p.config.smacking = !p.config.smacking;
  });
  document.body.appendChild(hint);
}

function resize() {
  const dpr = window.devicePixelRatio || 1; // Retina screens have 2+ real pixels per point
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const p of pets) p.setBounds(bounds());
}
window.addEventListener('resize', resize);
resize();

// ── talking to them right on the desktop ──
// Double-click one (or pick "Talk" from their right-click menu): a little text box pops up over their head,
// in their color. Whatever you type goes to that one.
const talk = document.getElementById('talk') as HTMLFormElement;
const talkText = document.getElementById('talkText') as HTMLInputElement;
let talkOpen = false, talkIdle = 0, gameTyping = false;
let talkPet: Pet = pets[0];
const syncTyping = () => shell?.setTyping(talkOpen || gameTyping);
function openTalk(p: Pet = talkPet) {
  if (talkOpen && talkPet !== p) talkPet.listening = false;
  talkPet = p;
  talkOpen = true;
  talk.classList.add('open');
  talk.style.setProperty('--ink', p.config.look.color);
  talkText.placeholder = `say something to ${p.config.name}…`;
  syncTyping(); // the desktop window has to accept typing for a moment
  p.listening = true;
  talkIdle = performance.now();
  placeTalk();
  setTimeout(() => talkText.focus(), 30);
}
function closeTalk() {
  if (!talkOpen) return;
  talkOpen = false;
  talk.classList.remove('open');
  talkText.blur();
  talkPet.listening = false;
  syncTyping();
}
function placeTalk() {
  const p = talkPet, a = p.talkAnchor();
  const width = talk.offsetWidth, height = talk.offsetHeight;
  // Leave their speech bubble its own space above their head, even while the input is open.
  const bubbleSpace = p.speaking ? 80 : 14;
  let x = Math.min(Math.max(a.x, width / 2 + 8), window.innerWidth - width / 2 - 8), bottom = Math.max(a.y - bubbleSpace, height + 8);
  const game = gamePanel.rect();
  if (game && x + width / 2 > game.left - 8 && x - width / 2 < game.right + 8 && bottom > game.top - 8 && bottom - height < game.bottom + 8) {
    if (game.left >= width + 16) x = game.left - width / 2 - 10;
    else if (window.innerWidth - game.right >= width + 16) x = game.right + width / 2 + 10;
    else bottom = game.top > height + 18 ? game.top - 10 : Math.min(window.innerHeight - 8, game.bottom + height + 10);
  }
  talk.style.left = `${x}px`; talk.style.top = `${bottom}px`;
}
talk.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = talkText.value.trim();
  if (text) talkPet.command(`hear:${text}`);
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
// The Othello window belongs to whichever of them invited you (the first one, if neither has).
const gamePet = () => pets.find((p) => p.game.state !== 'closed') ?? pets[0];
const gamePanel = createGamePanel(gamePet, (on) => { gameTyping = on; syncTyping(); }, () => openTalk(gamePet()));

// ── click-through ──
// The window ignores the mouse (clicks fall through to your desktop) except while the cursor is over one
// of them, their menu or the talk box, you're dragging one, or you're carrying one of their things.
let ignoring = true;
const onPet = (p: Pet, x: number, y: number) => p.dragging || p.hit(x, y) || p.uiHit(x, y) || p.carrying;
function updateClickThrough(x: number, y: number) {
  const want = !(gamePanel.dragging || overTalk(x, y) || gamePanel.over(x, y) || pets.some((p) => onPet(p, x, y)));
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
  // Smoothed mouse velocity, used when you throw one of them.
  vel.x += ((e.clientX - last.x) / dt - vel.x) * 0.5;
  vel.y += ((e.clientY - last.y) / dt - vel.y) * 0.5;
  last = { x: e.clientX, y: e.clientY, t: now };
  for (const p of pets) { p.cursor(e.clientX, e.clientY, vel.x, vel.y); p.pointerMove(e.clientX, e.clientY, vel.x, vel.y, now); }
  updateClickThrough(e.clientX, e.clientY);
});
/** Which of them the mouse is on (the one drawn on top first), or null. */
const petAt = (x: number, y: number) => [...pets].reverse().find((p) => p.hit(x, y) || p.uiHit(x, y) || p.carrying) ?? null;
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (gamePanel.over(e.clientX, e.clientY)) return;
  const who = petAt(e.clientX, e.clientY) ?? pets[0];
  if (who.contextMenu(e.clientX, e.clientY)) shell?.pressed();
  updateClickThrough(e.clientX, e.clientY);
});
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (overTalk(e.clientX, e.clientY) || gamePanel.over(e.clientX, e.clientY)) return;
  if (talkOpen && !talkPet.hit(e.clientX, e.clientY)) closeTalk(); // clicked away: done talking
  // Whoever you clicked right on; otherwise the first one (and the furniture), then the other one's things.
  const now = performance.now(), who = petAt(e.clientX, e.clientY);
  const took = who ? who.pointerDown(e.clientX, e.clientY, now) : pets.some((p) => p.pointerDown(e.clientX, e.clientY, now));
  if (took) {
    canvas.style.cursor = 'grabbing';
    shell?.pressed();
  }
});
window.addEventListener('mouseup', (e) => {
  if (pets.some((p) => p.dragging)) shell?.pressed(); // hand focus back once more after letting go
  for (const p of pets) p.pointerUp(e.clientX, e.clientY);
  updateClickThrough(e.clientX, e.clientY);
});
// If the mouse leaves the window mid-drag, let go.
window.addEventListener('blur', () => { for (const p of pets) p.pointerUp(last.x, last.y); });

// ── preview mode: a couple of fake windows to climb on ──
const fakeWins: WinRect[] = [];
if (!shell) {
  const W = window.innerWidth, H = window.innerHeight;
  fakeWins.push({ id: 1, x: W * 0.08, y: H - 210, w: Math.min(360, W * 0.3), h: 260 });
  fakeWins.push({ id: 2, x: W * 0.55, y: H - 330, w: Math.min(420, W * 0.35), h: 380 });
  setWindowsAll(fakeWins);
  applyConfigs(configs);
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
  // The mouse may sit still while held; decay its velocity so nobody gets "thrown" on release.
  if (now - last.t > 50) { vel.x *= 0.8; vel.y *= 0.8; for (const p of pets) p.pointerMove(last.x, last.y, vel.x, vel.y, now); }
  // A knockout: everyone in slow motion for a moment.
  const slow = pets.some((p) => p.slowmo > 0);
  for (const p of pets) { p.slowmo = Math.max(0, p.slowmo - Math.min(dt, 0.1)); p.update(slow ? dt * 0.3 : dt); }
  gamePanel.update();
  updateClickThrough(last.x, last.y);
  if (talkOpen) { placeTalk(); if (now - talkIdle > 45000 && document.activeElement !== talkText) closeTalk(); }
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (fakeWins.length) drawFakeWindows();
  // Furniture first (behind both of them), then whoever's nearer to you in front (a dash passes in front of the other one).
  for (const p of pets) p.drawProps(ctx);
  for (const p of [...pets].sort((a, b) => a.char.body.j.hip.z - b.char.body.j.hip.z)) p.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
