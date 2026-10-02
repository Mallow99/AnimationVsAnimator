// The settings window: live mood bars, look and movement presets plus sliders
// for every number, and general options. Changes apply to Blurp instantly.

import { PROVIDERS, RANGES, type PetConfig, type ProviderId } from '../core/config';
import { BUNDLES, PRESET_ROWS, type Variant } from '../core/presets';
import { MOOD_PRESETS, type MoodState } from '../core/mood';
import { COMMANDS } from '../core/mind';

interface LogLine { who: 'you' | 'him' | 'note'; text: string; at: number; acts?: string }
interface Weigh { name: string; score: number; why: string }
interface Drawing { title: string; shape: { x: number; y: number }[][]; color: string; at: number }
interface Note { id: number; text: string; kind: 'you' | 'event' | 'opinion'; at: number; by: 'him' | 'ai' | 'you'; weight: number }
interface MemoryView { summary: string; notes: Note[]; tally: Record<string, number>; firstMet: number; summarizedAt: number }
interface Collections { gallery: Drawing[]; recentMoves: { name: string; poses: number }[]; savedMoves: { name: string; poses: number }[]; memory?: MemoryView }
interface Stats {
  name: string; mood: MoodState; label: string; asleep: boolean; doing: string; why: string; recent: string[]; windows: number; platforms: number;
  brain: { active: boolean; status: string; log: LogLine[] };
  mind?: { weigh: Weigh[]; thinking: boolean };
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
  onCollections(cb: (c: Collections) => void): void;
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
shell.onTab((tab) => { showTab(tab === 'control' ? 'chat' : tab); if (tab === 'chat' || tab === 'control') $('talkText').focus(); });

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
  box.replaceChildren(...(log.length ? log : [{ who: 'note' as const, text: 'Say hi. He answers in his speech bubble.', at: 0 } as LogLine]).flatMap((l) => {
    const out: HTMLElement[] = [];
    if (l.text || !l.acts) {
      const p = document.createElement('p');
      p.className = l.who;
      p.textContent = l.text || '…';
      out.push(p);
    }
    if (l.acts) {
      // What he did, in his own grey line: "*hop ×3, walks away*"
      const a = document.createElement('p');
      a.className = 'acts';
      a.textContent = `*${l.acts}*`;
      out.push(a);
    }
    return out;
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
  latest = s;
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
$<HTMLInputElement>('outline').addEventListener('change', (e) => set({ look: { outline: (e.target as HTMLInputElement).checked } }));
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
  $<HTMLInputElement>('outline').checked = c.look.outline;
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

// ── Mind tab: moves and drawings ──
/** Name a made-up move before saving it (a little inline box; Electron has no prompt()). */
function askName(i: number, suggested: string) {
  const form = document.createElement('form');
  form.className = 'inline';
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 40; input.value = suggested;
  const ok = document.createElement('button');
  ok.className = 'btn small'; ok.type = 'submit'; ok.textContent = 'Save';
  form.append(input, ok);
  form.addEventListener('submit', (e) => { e.preventDefault(); shell.command(`saveMove:${i}:${input.value}`); });
  $('recentMoves').prepend(form);
  input.focus(); input.select();
}
function moveRow(name: string, poses: number, buttons: [string, () => void][]) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = name;
  const info = document.createElement('small');
  info.textContent = `${poses} poses`;
  row.append(label, info);
  for (const [text, fn] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn ghost small'; b.type = 'button'; b.textContent = text;
    b.addEventListener('click', fn);
    row.append(b);
  }
  return row;
}
function emptyNote(text: string) { const p = document.createElement('p'); p.className = 'note'; p.textContent = text; return p; }

function drawThumb(cv: HTMLCanvasElement, d: Drawing) {
  const size = 96;
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d')!;
  g.strokeStyle = d.color; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const st of d.shape) {
    if (st.length < 2) continue;
    g.beginPath();
    st.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, size / 2 + p.x * size * 0.8, size / 2 + p.y * size * 0.8));
    g.stroke();
  }
}

shell.onCollections((c) => {
  $('savedMoves').replaceChildren(...(c.savedMoves.length ? c.savedMoves.map((m, i) => moveRow(m.name, m.poses, [
    ['Do it', () => shell.command(`playMove:${i}`)],
    ['Forget', () => shell.command(`forgetMove:${i}`)],
  ])) : [emptyNote('None yet.')]));
  $('recentMoves').replaceChildren(...(c.recentMoves.length ? c.recentMoves.map((m, i) => moveRow(m.name, m.poses, [
    ['Save', () => askName(i, m.name)],
  ])).reverse() : [emptyNote('Nothing yet. Ask him for something weird in Chat ("do a handstand").')]));
  $('gallery').replaceChildren(...(c.gallery.length ? c.gallery.map((d, i) => {
    const fig = document.createElement('figure');
    const cv = document.createElement('canvas');
    drawThumb(cv, d);
    const cap = document.createElement('figcaption');
    cap.textContent = d.title;
    cap.title = new Date(d.at).toLocaleString();
    const btns = document.createElement('div');
    btns.className = 'btns';
    for (const [text, cmd] of [['Again', 'redraw'], ['✕', 'forgetDrawing']] as const) {
      const b = document.createElement('button');
      b.className = 'btn ghost small'; b.type = 'button'; b.textContent = text;
      b.title = cmd === 'redraw' ? 'Have him draw it again' : 'Throw it away';
      b.addEventListener('click', () => shell.command(`${cmd}:${i}`));
      btns.append(b);
    }
    fig.append(cv, cap, btns);
    return fig;
  }).reverse() : [emptyNote('No drawings yet.')]));
});
shell.onCollections((c) => { if (c.memory) renderMemory(c.memory); });
shell.command('sync'); // ask him for his drawings, moves and memories

// ── Mind tab: memories ──
const KIND_LABEL = { you: 'about you', event: 'happened', opinion: 'opinion' } as const;
const ago = (t: number) => {
  const m = (Date.now() - t) / 60000;
  return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
let memShown = '';
function renderMemory(m: MemoryView) {
  const t = m.tally, parts = [['thrown', 'thrown'], ['poked', 'poked'], ['petted', 'petted'], ['smacked', 'smacked'], ['talks', 'talked to'], ['ripped', 'limbs lost']]
    .filter(([k]) => t[k]).map(([k, label]) => `${label} ${t[k]}×`);
  $('memTally').textContent = `Met you ${ago(m.firstMet).replace(' ago', '')} ago${parts.length ? ' · ' + parts.join(' · ') : ''}`;
  const sum = $<HTMLTextAreaElement>('memSummary');
  if (document.activeElement !== sum) sum.value = m.summary;
  $('memSummaryInfo').textContent = m.summarizedAt ? `Last tidied ${ago(m.summarizedAt)}.` : '';
  // Don't rebuild the list while you're editing a note.
  const key = JSON.stringify(m.notes);
  if (key === memShown || document.activeElement?.closest('#memNotes')) return;
  memShown = key;
  $('memNotes').replaceChildren(...(m.notes.length ? [...m.notes].reverse().map((n) => {
    const row = document.createElement('div');
    row.className = 'row';
    const kind = document.createElement('span');
    kind.className = 'kind'; kind.textContent = KIND_LABEL[n.kind];
    const text = document.createElement('span');
    text.className = 'text'; text.textContent = n.text; text.contentEditable = 'plaintext-only';
    text.title = `${n.by === 'you' ? 'written by you' : n.by === 'ai' ? 'written by his AI brain' : 'written by him (instinct)'} · ${new Date(n.at).toLocaleString()}`;
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
    text.addEventListener('blur', () => { if (text.textContent!.trim() && text.textContent !== n.text) shell.command(`memEdit:${n.id}:${text.textContent}`); });
    const when = document.createElement('small');
    when.textContent = ago(n.at);
    const del = document.createElement('button');
    del.className = 'btn ghost small'; del.type = 'button'; del.textContent = '✕'; del.title = 'Make him forget this';
    del.addEventListener('click', () => shell.command(`memDel:${n.id}`));
    row.append(kind, text, when, del);
    return row;
  }) : [emptyNote('No notes yet. He writes them as things happen.')]));
}
$('memSummary').addEventListener('change', (e) => shell.command(`memSummary:${(e.target as HTMLTextAreaElement).value}`));
$('memForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $<HTMLInputElement>('memText');
  if (t.value.trim()) shell.command(`memAdd:${t.value.trim()}`);
  t.value = '';
});
$('memTidy').addEventListener('click', () => shell.command('memTidy'));
let clearArmed = 0;
$('memClear').addEventListener('click', () => {
  const b = $('memClear');
  if (Date.now() - clearArmed < 4000) { shell.command('memClear'); b.textContent = 'Forget everything'; clearArmed = 0; return; }
  clearArmed = Date.now();
  b.textContent = 'Click again to wipe his memory';
  setTimeout(() => { if (Date.now() - clearArmed >= 4000) b.textContent = 'Forget everything'; }, 4100);
});

// ── Mind tab: neurons ──
// What he feels on the left, everything he could do in the middle (sized by how much he wants it),
// what he's doing on the right. Not decoration: it's drawn straight from his real decision-making.
let latest: Stats | null = null;
const cvN = $<HTMLCanvasElement>('neurons');
const shown: Record<string, number> = {}; // eased values so nodes glide instead of jumping
const ease = (key: string, v: number) => (shown[key] = (shown[key] ?? v) + (v - (shown[key] ?? v)) * 0.15);
function neurons(now: number) {
  requestAnimationFrame(neurons);
  if (cvN.offsetParent === null || !latest?.mind) return; // tab hidden
  const dpr = window.devicePixelRatio || 1, W = cvN.clientWidth, H = 320;
  if (cvN.width !== Math.round(W * dpr)) { cvN.width = Math.round(W * dpr); cvN.height = Math.round(H * dpr); }
  const g = cvN.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim(), ink = css.getPropertyValue('--ink').trim(), muted = css.getPropertyValue('--muted').trim();
  g.font = '11px ' + css.getPropertyValue('--ui');
  g.textBaseline = 'middle';

  const s = latest;
  const inputs = MOOD_ROWS.map(([k, label]) => ({ label, v: ease('in-' + k, s.mood[k]) }));
  const opts = s.mind!.weigh;
  const maxScore = Math.max(1, ...opts.map((o) => o.score));
  const doing = s.doing, aiDriven = /\(AI/.test(s.why);
  const inX = 112, opX = W * 0.5, outX = W - 64;
  const inY = (i: number) => 40 + (i * (H - 80)) / (inputs.length - 1);
  const opY = (i: number) => 14 + (i * (H - 28)) / Math.max(1, opts.length - 1);
  const outY = H / 2, aiY = 34;
  const chosen = opts.findIndex((o) => o.name === doing);

  // Wires: everything he feels feeds every choice (faint); the winning path glows, with pulses running along it.
  g.lineWidth = 1;
  for (let i = 0; i < inputs.length; i++) for (let k = 0; k < opts.length; k++) {
    g.strokeStyle = accent; g.globalAlpha = k === chosen ? 0.12 + inputs[i].v * 0.5 : 0.03 + (opts[k].score / maxScore) * 0.05;
    g.beginPath(); g.moveTo(inX, inY(i)); g.lineTo(opX, opY(k)); g.stroke();
  }
  const pulse = (x1: number, y1: number, x2: number, y2: number, speed: number) => {
    const u = ((now / 1000) * speed) % 1;
    g.globalAlpha = 1; g.fillStyle = accent;
    g.beginPath(); g.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 2.5, 0, 7); g.fill();
  };
  if (chosen >= 0) {
    g.globalAlpha = 0.8; g.lineWidth = 2; g.strokeStyle = accent;
    g.beginPath(); g.moveTo(opX, opY(chosen)); g.lineTo(outX, outY); g.stroke();
    pulse(opX, opY(chosen), outX, outY, 0.9);
    for (let i = 0; i < inputs.length; i++) if (inputs[i].v > 0.35) pulse(inX, inY(i), opX, opY(chosen), 0.5 + inputs[i].v);
  }
  // The AI brain: lights up while it thinks; wired to the output when it made the call.
  const aiOn = s.mind!.thinking;
  if (aiDriven || aiOn) {
    g.globalAlpha = aiOn ? 0.5 + 0.5 * Math.sin(now / 120) ** 2 : 0.7; g.lineWidth = 2; g.strokeStyle = accent;
    g.beginPath(); g.moveTo(outX, aiY); g.lineTo(outX, outY); g.stroke();
    if (aiDriven) pulse(outX, aiY, outX, outY, 0.8);
  }

  // Nodes.
  const node = (x: number, y: number, r: number, lit: number, label: string, side: -1 | 1, bold = false) => {
    g.globalAlpha = 1;
    g.fillStyle = css.getPropertyValue('--panel').trim(); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.globalAlpha = 0.15 + lit * 0.85; g.fillStyle = accent; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.globalAlpha = 1; g.strokeStyle = accent; g.lineWidth = bold ? 2.5 : 1; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    g.fillStyle = bold ? ink : muted; g.textAlign = side < 0 ? 'right' : 'left';
    g.fillText(label, x + side * (r + 5), y);
  };
  inputs.forEach((n, i) => node(inX, inY(i), 7, n.v, `${n.label} ${n.v.toFixed(2)}`, -1));
  opts.forEach((o, k) => {
    const v = ease('op-' + o.name, o.score / maxScore);
    node(opX, opY(k), 2.5 + v * 6, v, o.name, 1, k === chosen);
  });
  node(outX, outY, 12, 1, DOING[doing] ?? doing, -1, true);
  node(outX, aiY, 9, aiOn ? 1 : aiDriven ? 0.6 : 0.1, aiOn ? 'AI thinking…' : 'AI brain', -1, aiOn);
}
requestAnimationFrame(neurons);
