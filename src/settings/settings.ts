// The settings window: live mood bars, look and movement presets plus sliders
// for every number, and general options. Changes apply to Blurp instantly.

import { RANGES, type PetConfig } from '../core/config';
import { BUNDLES, PRESET_ROWS, type Variant } from '../core/presets';
import { MOOD_PRESETS, type MoodState } from '../core/mood';
import { COMMANDS } from '../core/mind';

interface Stats { name: string; mood: MoodState; label: string; asleep: boolean; doing: string; why: string; recent: string[] }
interface Shell {
  getConfig(): Promise<PetConfig>;
  onConfig(cb: (c: PetConfig) => void): void;
  setConfig(patch: unknown): void;
  resetConfig(): void;
  command(cmd: string): void;
  onStats(cb: (s: Stats) => void): void;
}
const shell = (window as unknown as { petShell: Shell }).petShell;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cfg: PetConfig;

// ── tabs ──
for (const tab of document.querySelectorAll<HTMLButtonElement>('nav button')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('nav button')) t.setAttribute('aria-selected', String(t === tab));
    for (const p of document.querySelectorAll<HTMLElement>('[data-panel]')) p.hidden = p.dataset.panel !== tab.dataset.tab;
  });
}

// ── mood ──
const MOOD_ROWS: [keyof MoodState, string][] = [
  ['happiness', 'Happiness'], ['energy', 'Energy'], ['boredom', 'Boredom'],
  ['annoyance', 'Annoyance'], ['fear', 'Fear'], ['trust', 'Trust in you'],
];
// Each mood is a slider: it follows his real mood live, and you can drag it to set it.
const fills: Record<string, [HTMLInputElement, HTMLElement]> = {};
let dragging: string | null = null;
for (const [k, label] of MOOD_ROWS) {
  const row = document.createElement('label');
  row.className = 'bar';
  row.innerHTML = `<span class="name">${label}</span><input type="range" min="0" max="1" step="0.01" id="mood-${k}" /><span class="val">–</span>`;
  $('bars').appendChild(row);
  const input = row.querySelector('input')!;
  input.addEventListener('pointerdown', () => { dragging = k; });
  input.addEventListener('pointerup', () => { dragging = null; });
  input.addEventListener('blur', () => { dragging = null; });
  input.addEventListener('input', () => {
    row.querySelector('.val')!.textContent = Number(input.value).toFixed(2);
    shell.command(`setMood:${JSON.stringify({ [k]: Number(input.value) })}`);
  });
  fills[k] = [input, row.querySelector('.val')!];
}
for (const name of Object.keys(MOOD_PRESETS)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = name[0].toUpperCase() + name.slice(1);
  b.addEventListener('click', () => shell.command(`mood:${name}`));
  $('moodPresets').appendChild(b);
}
for (const c of COMMANDS) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = c.label;
  b.addEventListener('click', () => shell.command(`do:${c.name}`));
  $('commands').appendChild(b);
}
$('sayForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $<HTMLInputElement>('sayText');
  if (t.value.trim()) shell.command(`say:${t.value}`);
  t.value = '';
});
const DOING: Record<string, string> = {
  idle: 'Standing around', wander: 'Wandering', sit: 'Sitting', sulk: 'Sulking', sleep: 'Napping', chase: 'Chasing your cursor',
  hunt: 'Hunting your cursor', avoid: 'Keeping away from you', dance: 'Dancing', hop: 'Hopping', tantrum: 'Throwing a tantrum',
  greet: 'Saying hi', retaliate: 'Getting you back', glare: 'Glaring at you', flinch: 'Flinching', giggle: 'Giggling',
  tag: 'Playing tag', boing: 'Bouncing', 'poke-back': 'Poking you back', huh: 'Confused', shrug: 'Shrugging', woken: 'Woken up',
  again: 'Wants to go again', mope: 'Moping', 'shake-off': 'Shaking it off', wave: 'Waving', laugh: 'Laughing', stomp: 'Stomping',
  cower: 'Cowering', explore: 'Exploring', climb: 'Climbing onto a window', getdown: 'Getting down', stuck: 'Stuck up high', stretch: 'Stretching', sigh: 'Sighing', held: 'Being held', air: 'Flying', ragdoll: 'Sprawled out',
  getup: 'Getting up', ground: 'Standing', lie: 'Lying down',
};
shell.onStats((s) => {
  for (const [k] of MOOD_ROWS) {
    if (dragging === k) continue;
    const v = s.mood[k];
    fills[k][0].value = String(v);
    fills[k][1].textContent = v.toFixed(2);
  }
  $('label').textContent = s.asleep ? 'asleep' : s.label;
  $('doing').textContent = (DOING[s.doing] ?? s.doing) + (s.why ? ` — ${s.why}` : '');
  $('recent').textContent = s.recent.length ? s.recent.slice().reverse().join(' ← ') : '—';
});
$('resetMood').addEventListener('click', () => shell.command('resetMood'));
$('respawn').addEventListener('click', () => shell.command('respawn'));

// ── presets ──
const set = (patch: unknown) => shell.setConfig(patch);
const matches = (v: Variant) =>
  Object.entries(v.look ?? {}).every(([k, x]) => (cfg.look as any)[k] === x) &&
  Object.entries(v.body ?? {}).every(([k, x]) => Math.abs((cfg.body as any)[k] - (x as number)) < 1e-6);
const presetButtons: [HTMLButtonElement, () => boolean][] = [];

for (const b of BUNDLES) {
  const btn = document.createElement('button');
  btn.className = 'chip bundle';
  btn.type = 'button';
  btn.innerHTML = `<span><span class="sw" style="background:${b.look.color}"></span>${b.name}</span><small>${b.detail}</small>`;
  btn.addEventListener('click', () => set({ look: b.look, body: b.body }));
  $('bundles').appendChild(btn);
  presetButtons.push([btn, () => matches({ id: '', name: '', detail: '', look: b.look, body: b.body })]);
}
for (const row of PRESET_ROWS) {
  const host = row.variants.some((v) => v.body) ? $('bodyRows') : $('lookRows');
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<h2>${row.title}</h2><div class="chips"></div>`;
  for (const v of row.variants) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.innerHTML = (v.look?.color ? `<span class="sw" style="background:${v.look.color}"></span>` : '') + v.name;
    btn.title = v.detail;
    btn.addEventListener('click', () => set({ look: v.look ?? {}, body: v.body ?? {} }));
    g.querySelector('.chips')!.appendChild(btn);
    presetButtons.push([btn, () => matches(v)]);
  }
  host.appendChild(g);
}

// ── sliders (built from the config's range table) ──
const sliders: [HTMLInputElement, HTMLElement, string][] = [];
for (const [key, r] of Object.entries(RANGES)) {
  const host = key === 'scale' ? $('sizeSlider') : key.startsWith('look.') ? $('lookSliders') : $('bodySliders');
  const wrap = document.createElement('label');
  wrap.className = 'slider';
  wrap.innerHTML = `<span class="top"><span class="row-label">${r.label}</span><span></span></span><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" id="s-${key}" /><small>${r.hint}</small>`;
  const input = wrap.querySelector('input')!, out = wrap.querySelector('.top span:last-child') as HTMLElement;
  input.addEventListener('input', () => {
    const v = Number(input.value), [a, b] = key.split('.');
    out.textContent = String(v);
    set(b ? { [a]: { [b]: v } } : { [a]: v });
  });
  host.appendChild(wrap);
  sliders.push([input, out, key]);
}

// ── general ──
$<HTMLInputElement>('color').addEventListener('input', (e) => set({ look: { color: (e.target as HTMLInputElement).value } }));
$<HTMLInputElement>('name').addEventListener('input', (e) => set({ name: (e.target as HTMLInputElement).value }));
$<HTMLInputElement>('windows').addEventListener('change', (e) => set({ windows: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('smacking').addEventListener('change', (e) => set({ smacking: (e.target as HTMLInputElement).checked }));
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.addEventListener('change', () => set({ mind: r.value }));
$('resetAll').addEventListener('click', () => shell.resetConfig());

// ── show the current settings ──
function render(c: PetConfig) {
  cfg = c;
  $('title').textContent = c.name;
  document.title = `${c.name} — Settings`;
  const name = $<HTMLInputElement>('name');
  if (document.activeElement !== name) name.value = c.name;
  $<HTMLInputElement>('color').value = c.look.color;
  $<HTMLInputElement>('smacking').checked = c.smacking;
  $<HTMLInputElement>('windows').checked = c.windows;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.checked = r.value === c.mind;
  for (const [input, out, key] of sliders) {
    const [a, b] = key.split('.');
    const v = b ? (c as any)[a][b] : (c as any)[a];
    if (document.activeElement !== input) input.value = String(v);
    out.textContent = String(Math.round(v * 100) / 100);
  }
  for (const [btn, isOn] of presetButtons) btn.setAttribute('aria-pressed', String(isOn()));
}
shell.getConfig().then(render);
shell.onConfig(render);
