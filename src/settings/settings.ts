// The settings window: live mood bars, look and movement presets plus sliders
// for every number, and general options. Changes apply to Blurp instantly.

import { PROVIDERS, RANGES, type PetConfig, type ProviderId } from '../core/config';
import { BUNDLES, PRESET_ROWS, type Variant } from '../core/presets';
import { MOOD_PRESETS, type MoodState } from '../core/mood';
import { COMMANDS } from '../core/mind';

interface LogLine { who: 'you' | 'him' | 'note'; text: string; at: number }
interface Stats {
  name: string; mood: MoodState; label: string; asleep: boolean; doing: string; why: string; recent: string[]; windows: number; platforms: number;
  brain: { active: boolean; status: string; log: LogLine[] };
}
interface KeyStatus { provider: ProviderId; saved: boolean; hint: string }
interface Shell {
  getConfig(): Promise<PetConfig>;
  onConfig(cb: (c: PetConfig) => void): void;
  setConfig(patch: unknown): void;
  resetConfig(): void;
  command(cmd: string): void;
  onStats(cb: (s: Stats) => void): void;
  keyStatus(provider: ProviderId): Promise<KeyStatus>;
  listModels(): Promise<{ ok: true; models: string[] } | { ok: false; error: string }>;
  onKeyStatus(cb: (k: KeyStatus) => void): void;
  setKey(key: string): void;
  onTab(cb: (tab: string) => void): void;
}
const shell = (window as unknown as { petShell: Shell }).petShell;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cfg: PetConfig;

// ── tabs ──
function showTab(name: string) {
  for (const t of document.querySelectorAll<HTMLButtonElement>('nav button')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll<HTMLElement>('[data-panel]')) p.hidden = p.dataset.panel !== name;
}
for (const tab of document.querySelectorAll<HTMLButtonElement>('nav button')) tab.addEventListener('click', () => showTab(tab.dataset.tab!));
shell.onTab((tab) => { showTab(tab); if (tab === 'control') $('talkText').focus(); });

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
// ── talking ──
$('talkForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $<HTMLInputElement>('talkText');
  if (t.value.trim()) shell.command(`hear:${t.value}`);
  t.value = '';
});
let chatShown = '';
function renderChat(log: LogLine[], status: string, active: boolean) {
  const key = JSON.stringify(log) + status;
  if (key === chatShown) return;
  chatShown = key;
  const box = $('chat');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.replaceChildren(...(log.length ? log : [{ who: 'note' as const, text: 'Say hi. He answers in his speech bubble.', at: 0 }]).map((l) => {
    const p = document.createElement('p');
    p.className = l.who;
    p.textContent = l.text;
    return p;
  }));
  if (atBottom) box.scrollTop = box.scrollHeight;
  $('brainState').textContent = status === 'thinking…' ? 'He\'s thinking…'
    : active ? '' : 'His brain is Offline, so he won\'t understand. Turn on Chat or Full under General → Brain.';
}

const DOING: Record<string, string> = {
  idle: 'Standing around', wander: 'Wandering', sit: 'Sitting', sulk: 'Sulking', sleep: 'Napping', chase: 'Chasing your cursor',
  hunt: 'Hunting your cursor', avoid: 'Keeping away from you', dance: 'Dancing', hop: 'Hopping', tantrum: 'Throwing a tantrum',
  greet: 'Saying hi', doodle: 'Doodling', grabcursor: 'Messing with your cursor', enjoy: 'Enjoying the pets', retaliate: 'Getting you back', glare: 'Glaring at you', flinch: 'Flinching', giggle: 'Giggling',
  tag: 'Playing tag', boing: 'Bouncing', 'poke-back': 'Poking you back', huh: 'Confused', shrug: 'Shrugging', woken: 'Woken up',
  again: 'Wants to go again', mope: 'Moping', 'shake-off': 'Shaking it off', wave: 'Waving', laugh: 'Laughing', stomp: 'Stomping',
  cower: 'Cowering', explore: 'Exploring', climb: 'Climbing onto a window', monkeybars: 'Monkey bars', climbwall: 'Climbing', getdown: 'Getting down', stuck: 'Stuck up high', stretch: 'Stretching', sigh: 'Sighing', held: 'Being held', air: 'Flying', ragdoll: 'Sprawled out',
  getup: 'Getting up', ground: 'Standing', lie: 'Lying down', ceiling: 'Hanging from the top of the screen',
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
  $('winInfo').textContent = s.windows ? `He can see ${s.windows} window(s) and ${s.platforms} window top(s) to stand on.` : 'He can\'t see any windows yet. If this stays at zero, check the Terminal for lines starting with [windows].';
  $('recent').textContent = s.recent.length ? s.recent.slice().reverse().join(' ← ') : '—';
  if (s.brain) renderChat(s.brain.log, s.brain.status, s.brain.active);
});
$('resetMood').addEventListener('click', () => shell.command('resetMood'));
$('clearDoodles').addEventListener('click', () => shell.command('clearDoodles'));
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
$<HTMLInputElement>('mischief').addEventListener('change', (e) => set({ mischief: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('windows').addEventListener('change', (e) => set({ windows: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('smacking').addEventListener('change', (e) => set({ smacking: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('sound').addEventListener('change', (e) => set({ sound: (e.target as HTMLInputElement).checked }));
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.addEventListener('change', () => set({ mind: r.value }));
$<HTMLTextAreaElement>('persona').addEventListener('input', (e) => set({ persona: (e.target as HTMLTextAreaElement).value }));
$<HTMLInputElement>('model').addEventListener('change', (e) => set({ model: (e.target as HTMLInputElement).value.trim() }));
$<HTMLInputElement>('puppet').addEventListener('change', (e) => set({ puppet: (e.target as HTMLInputElement).checked }));

// ── AI service + key (kept by the desktop shell; this page only ever sees the last 4 characters) ──
const providerSel = $<HTMLSelectElement>('provider');
for (const [id, p] of Object.entries(PROVIDERS)) providerSel.add(new Option(p.label + (p.free ? ' (free)' : ''), id));
providerSel.addEventListener('change', () => {
  const id = providerSel.value as ProviderId;
  set({ provider: id, model: PROVIDERS[id].model });
  $('modelList').replaceChildren();
  shell.keyStatus(id).then(showKey);
});
function showKey(k: KeyStatus) {
  if (k.provider !== providerSel.value) return;
  $('keyInfo').textContent = k.saved ? `Saved (${k.hint}). Stored on this computer only.` : `No ${PROVIDERS[k.provider].label} key yet.`;
}
$('findModels').addEventListener('click', async () => {
  $('modelInfo').textContent = 'Asking…';
  const r = await shell.listModels();
  if (!r.ok) { $('modelInfo').textContent = r.error; return; }
  $('modelList').replaceChildren(...r.models.map((m) => new Option(m, m)));
  $('modelInfo').textContent = `${r.models.length} model(s) available. Click the Model box to pick one.`;
});
$('keyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('apiKey');
  if (input.value.trim()) shell.setKey(input.value.trim());
  input.value = '';
});
$('forgetKey').addEventListener('click', () => shell.setKey(''));
shell.getConfig().then((c) => shell.keyStatus(c.provider).then(showKey));
shell.onKeyStatus(showKey);
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
  $<HTMLInputElement>('sound').checked = c.sound;
  $<HTMLInputElement>('windows').checked = c.windows;
  $<HTMLInputElement>('mischief').checked = c.mischief;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.checked = r.value === c.mind;
  const persona = $<HTMLTextAreaElement>('persona'), model = $<HTMLInputElement>('model');
  if (document.activeElement !== persona) persona.value = c.persona;
  if (document.activeElement !== model) model.value = c.model;
  providerSel.value = c.provider;
  $<HTMLAnchorElement>('keyLink').href = PROVIDERS[c.provider].keyUrl;
  $<HTMLInputElement>('puppet').checked = c.puppet;
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
