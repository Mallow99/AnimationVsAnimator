// Design lab: every look/body option side by side, animated with the real
// physics, plus a live stage showing the current combination. `npm run lab`

import { Character } from '../core/character';
import { DEFAULT_CONFIG, Pet, type PetConfig } from '../core/pet';
import { drawCharacter, PixelLayer } from '../core/render';
import { PRESET_ROWS, type PresetRow, type Variant } from '../core/presets';

type Row = PresetRow;
const ROWS = PRESET_ROWS;

const STORE = 'lab-picks';
let picks: Record<string, string> = { stance: 'C', walk: '1', color: 'deep', line: 'chunky', render: 'px2' };
try { Object.assign(picks, JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { /* storage unavailable */ }

function configFor(override?: { row: string; id: string }): PetConfig {
  const cfg: PetConfig = structuredClone(DEFAULT_CONFIG);
  cfg.smacking = true; // the lab's stage is for playing with him
  for (const row of ROWS) {
    const id = override && override.row === row.key ? override.id : picks[row.key];
    const v = row.variants.find((x) => x.id === id) ?? row.variants[0];
    Object.assign(cfg.body, v.body);
    Object.assign(cfg.look, v.look);
  }
  return cfg;
}

function summary() {
  return ROWS.map((r) => {
    const v = r.variants.find((x) => x.id === picks[r.key])!;
    const code = r.key === 'stance' || r.key === 'walk' ? `${v.id} ` : '';
    return `${r.title} ${code}(${v.name})`;
  }).join(' · ');
}

// ───────────── canvases ─────────────

const DESK_DARK = '#2b2f45', DESK_LIGHT = '#e6e8f0';

function fitCanvas(cv: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}

function paintDesk(g: CanvasRenderingContext2D, w: number, h: number, split: boolean) {
  g.fillStyle = DESK_DARK; g.fillRect(0, 0, w, h);
  if (split) { g.fillStyle = DESK_LIGHT; g.fillRect(w / 2, 0, w / 2, h); }
}

/** One demo cell: a character pacing back and forth. */
class Cell {
  char!: Character;
  private size = { w: 0, h: 0 };
  private acc = 0;
  private wait = 0.8;
  private side = 1;
  private pixels = new PixelLayer();
  cfg!: PetConfig;

  constructor(readonly cv: HTMLCanvasElement, readonly row: Row, readonly variant: Variant) { this.resize(); this.refresh(); }

  resize() {
    this.size = fitCanvas(this.cv);
    const b = { left: 0, right: this.size.w, top: 0, floor: this.size.h - 10 };
    if (!this.char) this.char = new Character(b, this.size.w * 0.3, 0.95);
    else this.char.setBounds(b);
  }

  refresh() {
    this.cfg = configFor({ row: this.row.key, id: this.variant.id });
    this.char.style = { ...this.cfg.body };
    this.char.setHeadSize(this.cfg.look.headSize);
  }

  update(dt: number) {
    const c = this.char;
    if (c.ready && !c.walking) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.side = -this.side;
        c.walkTo(this.size.w * (this.side > 0 ? 0.78 : 0.22));
        this.wait = 1.1;
      }
    }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 120) { c.step(1 / 120); this.acc -= 1 / 120; }
    c.drainEvents();
  }

  draw() {
    const g = this.cv.getContext('2d')!;
    paintDesk(g, this.size.w, this.size.h, !!this.row.split);
    if (this.cfg.look.pixel > 1) this.pixels.draw(g, this.char, this.cfg.look);
    else drawCharacter(g, this.char, this.cfg.look);
  }
}

// ───────────── build the page ─────────────

const rowsEl = document.getElementById('rows')!;
const cells: Cell[] = [];
const buttons: Record<string, HTMLButtonElement[]> = {};

for (const row of ROWS) {
  const sec = document.createElement('section');
  sec.className = 'row';
  sec.innerHTML = `<header><h2>${row.title}</h2><p>${row.blurb}</p></header><div class="cells"></div>`;
  const grid = sec.querySelector('.cells')!;
  rowsEl.appendChild(sec); // must be on the page before canvases can measure themselves
  buttons[row.key] = [];
  for (const v of row.variants) {
    const btn = document.createElement('button');
    btn.className = 'cell';
    btn.type = 'button';
    btn.id = `pick-${row.key}-${v.id}`;
    btn.innerHTML = `<canvas></canvas><span class="meta"><span class="name">${row.key === 'stance' || row.key === 'walk' ? `<b>${v.id}</b> ` : ''}${v.name}</span><span class="detail">${v.detail}</span></span><span class="chip">Picked</span>`;
    btn.addEventListener('click', () => choose(row.key, v.id));
    grid.appendChild(btn);
    buttons[row.key].push(btn);
    cells.push(new Cell(btn.querySelector('canvas')!, row, v));
  }
}

// The live stage: a full pet with his mind switched on.
const stage = document.getElementById('stage') as HTMLCanvasElement;
let stageSize = fitCanvas(stage);
const stageBounds = () => ({ left: 0, right: stageSize.w, top: 0, floor: stageSize.h - 12 });
const pet = new Pet(stageBounds(), configFor());

const summaryEl = document.getElementById('summary')!;
function syncUI() {
  for (const row of ROWS) {
    buttons[row.key].forEach((b, i) => {
      const on = row.variants[i].id === picks[row.key];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  summaryEl.textContent = summary();
  pet.applyConfig(configFor());
  for (const c of cells) c.refresh();
}

function choose(row: string, id: string) {
  picks[row] = id;
  try { localStorage.setItem(STORE, JSON.stringify(picks)); } catch { /* ignore */ }
  syncUI();
}

const copyBtn = document.getElementById('copy') as HTMLButtonElement;
copyBtn.addEventListener('click', () => {
  const text = summary();
  const done = () => { copyBtn.textContent = 'Copied'; setTimeout(() => (copyBtn.textContent = 'Copy picks'), 1500); };
  navigator.clipboard?.writeText(text).then(done, () => {
    const r = document.createRange(); r.selectNodeContents(summaryEl);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
  });
});

// Stage input: poke, drag, throw, swipe-smack, rub-to-pet.
let last = { x: 0, y: 0, t: performance.now() }, vel = { x: 0, y: 0 };
const local = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
stage.addEventListener('pointermove', (e) => {
  const p = local(e), now = performance.now(), dt = Math.max((now - last.t) / 1000, 1 / 240);
  vel.x += ((p.x - last.x) / dt - vel.x) * 0.5;
  vel.y += ((p.y - last.y) / dt - vel.y) * 0.5;
  last = { ...p, t: now };
  pet.cursor(p.x, p.y, vel.x, vel.y);
  pet.pointerMove(p.x, p.y, vel.x, vel.y, now);
  stage.style.cursor = pet.dragging ? 'grabbing' : pet.hit(p.x, p.y) ? 'grab' : 'default';
});
stage.addEventListener('pointerdown', (e) => {
  const p = local(e);
  if (pet.pointerDown(p.x, p.y, performance.now())) stage.setPointerCapture(e.pointerId);
});
const up = (e: PointerEvent) => { const p = local(e); pet.pointerUp(p.x, p.y); };
stage.addEventListener('pointerup', up);
stage.addEventListener('pointercancel', up);

window.addEventListener('resize', () => {
  stageSize = fitCanvas(stage);
  pet.setBounds(stageBounds());
  for (const c of cells) c.resize();
});

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let prev = performance.now();
function frame(now: number) {
  const dt = reduced ? 1 / 60 : (now - prev) / 1000;
  prev = now;
  if (now - last.t > 50) { vel.x *= 0.8; vel.y *= 0.8; pet.pointerMove(last.x, last.y, vel.x, vel.y, now); }
  pet.update(dt);
  const g = stage.getContext('2d')!;
  paintDesk(g, stageSize.w, stageSize.h, false);
  pet.draw(g);
  for (const c of cells) { c.update(dt); c.draw(); }
  requestAnimationFrame(frame);
}
syncUI();
requestAnimationFrame(frame);
