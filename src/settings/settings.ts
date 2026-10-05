// The settings window: live mood bars, look and movement presets plus sliders
// for every number, and general options. Changes apply to Blurp instantly.

import { PROVIDERS, RANGES, type PetConfig, type ProviderId } from '../core/config';
import { BUNDLES, PRESET_ROWS, type Variant } from '../core/presets';
import { MOOD_PRESETS, type MoodState } from '../core/mood';
import { COMMANDS } from '../core/mind';
import { thingCard, type ThingPreview } from './item-card';

interface LogLine { who: 'you' | 'him' | 'note'; text: string; at: number; acts?: string }
interface Weigh { name: string; score: number; why: string; bias?: number }
interface Drawing { title: string; shape: { x: number; y: number }[][]; color: string; at: number }
interface Note { id: number; text: string; kind: 'you' | 'event' | 'opinion'; at: number; by: 'him' | 'ai' | 'you'; weight: number }
interface MemoryView { summary: string; notes: Note[]; tally: Record<string, number>; firstMet: number; summarizedAt: number }
interface PropsView { kinds: ThingPreview[]; placed: { i: number; id: string; name: string }[] }
interface ItemsView { kinds: (ThingPreview & { use: string; wear?: 'head' | 'feet'; drawn: boolean })[]; list: { uid: number; id: string; name: string; where: 'belt' | 'hand' | 'worn' | 'world' | 'cursor'; slot: number; drawn: boolean }[] }
interface Collections { gallery: Drawing[]; recentMoves: { name: string; poses: number }[]; savedMoves: { name: string; poses: number }[]; memory?: MemoryView; items?: ItemsView; props?: PropsView }
interface Stats {
  name: string; mood: MoodState; label: string; asleep: boolean; doing: string; why: string; recent: string[]; windows: number; platforms: number; windowsStuck?: boolean; moveNote?: string;
  brain: { active: boolean; status: string; log: LogLine[] };
  mind?: { weigh: Weigh[]; thinking: boolean };
}
interface KeyStatus { provider: ProviderId; saved: boolean; hint: string }
interface Shell {
  /** Which stick figure this window is for (0 = the first, 1 = the second). */
  petId: number;
  getConfig(): Promise<PetConfig>;
  onConfig(cb: (c: { id: number; config: PetConfig }) => void): void;
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
  openItemsFolder(): void;
  reloadItems(): void;
  desktopInfo?():Promise<{pairing:string;error:string;homes:{id:number;path:string}[];connected:boolean}>;
  openExtensionFolder?():void;
  chooseHabitat?(kind?:'folder'|'file'):Promise<{ok:boolean;message:string}>;
  onFileNote?(cb:(message:string)=>void):void;
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
  kick: 'Kicking his ball', drawball: 'Drawing a ball', drawbox: 'Drawing a box', drawledge: 'Drawing a ledge', drawsword: 'Drawing a sword', getonit: 'Getting on what he drew', walljump: 'Wall jumping', backflip: 'Backflip', frontflip: 'Front flip', roll: 'Rolling', reattach: 'Getting his limb back', swing: 'Swinging his sword', slash: 'Attacking your cursor', pickup: 'Picking his stuff up', askback: 'Asking for his stuff back', hey: 'Hey!', loseArm: 'Taking his arm off', loseLeg: 'Taking his leg off', move: 'Doing a made-up move',
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
  $('moveInfo').textContent = (s.windowsStuck ? "He tried to move a window and it didn't budge. On a Mac: System Settings → Privacy & Security → Accessibility, and switch on the app he runs in (Terminal or Electron), then restart him. " : '')
    + (s.moveNote ? `Last word from the window helper: ${s.moveNote}` : '');
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
  const host = key === 'scale' ? $('sizeSlider') : key === 'volume' ? $('volumeSlider') : key.startsWith('look.') ? $('lookSliders') : $('bodySliders');
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
$<HTMLInputElement>('moveWindows').addEventListener('change', (e) => set({ moveWindows: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('screenAware').addEventListener('change', (e) => set({ screenAware: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('knockCursor').addEventListener('change', (e) => set({ knockCursor: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('smacking').addEventListener('change', (e) => set({ smacking: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('sound').addEventListener('change', (e) => set({ sound: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('sfx').addEventListener('change', (e) => set({ sfx: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('destructible').addEventListener('change', (e) => set({ destructible: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('friendOn').addEventListener('change', (e) => set({ friend: { on: (e.target as HTMLInputElement).checked } }));
for(const id of ['debugCombat','drawTools','browserPlay','closeWindows','fileHomes'] as const)$<HTMLInputElement>(id).addEventListener('change',()=>set({[id]:$<HTMLInputElement>(id).checked}));
$<HTMLSelectElement>('figureCount').addEventListener('change',()=>set({figureCount:Number($<HTMLSelectElement>('figureCount').value)}));
$<HTMLSelectElement>('personality').addEventListener('change',()=>set({personality:$<HTMLSelectElement>('personality').value}));
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-weapon]'))button.onclick=()=>shell.command(`cursorWeapon:${button.dataset.weapon}`);
$<HTMLSelectElement>('fightMode').addEventListener('change', (e) => set({ fightMode: (e.target as HTMLSelectElement).value }));
$('duelNow').addEventListener('click', () => shell.command('do:duel'));
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.addEventListener('change', () => set({ mind: r.value }));
$<HTMLTextAreaElement>('persona').addEventListener('input', (e) => set({ persona: (e.target as HTMLTextAreaElement).value }));
$<HTMLInputElement>('model').addEventListener('change', (e) => set({ model: (e.target as HTMLInputElement).value.trim() }));
$<HTMLInputElement>('outline').addEventListener('change', (e) => set({ look: { outline: (e.target as HTMLInputElement).checked } }));
$<HTMLInputElement>('puppet').addEventListener('change', (e) => set({ puppet: (e.target as HTMLInputElement).checked }));
$<HTMLSelectElement>('aiInterval').addEventListener('change', (e) => set({ aiInterval: Number((e.target as HTMLSelectElement).value) }));

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
  const provider = providerSel.value;
  const button = $<HTMLButtonElement>('findModels');
  button.disabled = true;
  $('modelInfo').textContent = 'Asking…';
  try {
    const r = await shell.listModels();
    if (provider !== providerSel.value) return;
    if (!r.ok) { $('modelInfo').textContent = r.error; return; }
    $('modelList').replaceChildren(...r.models.map((m) => new Option(m, m)));
    $('modelInfo').textContent = r.models.length ? `${r.models.length} model(s) available. Click the Model box to pick one.` : 'No matching models returned. Try again later or choose another service.';
  } catch { if (provider === providerSel.value) $('modelInfo').textContent = 'Could not load models. Try again.'; }
  finally { button.disabled = false; }
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
/** The window wears its stick figure's color: tabs, buttons, chips, the mood badge. */
function theme(color: string) {
  const n = parseInt(color.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62; // pale colors get dark text on them
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--accent-ink', light ? '#1b1a22' : '#ffffff');
  root.setProperty('--track', `rgba(${r}, ${g}, ${b}, 0.18)`);
}

function render(c: PetConfig) {
  cfg = c;
  theme(c.look.color);
  $('title').textContent = c.name;
  document.title = `${c.name} — Settings`;
  const name = $<HTMLInputElement>('name');
  if (document.activeElement !== name) name.value = c.name;
  $<HTMLInputElement>('color').value = c.look.color;
  $<HTMLInputElement>('smacking').checked = c.smacking;
  $<HTMLInputElement>('sound').checked = c.sound;
  $<HTMLInputElement>('destructible').checked = c.destructible;
  $<HTMLInputElement>('friendOn').checked = c.friend.on;
  $<HTMLSelectElement>('fightMode').value = c.fightMode;
  $<HTMLSelectElement>('figureCount').value=String(c.figureCount);
  $<HTMLSelectElement>('personality').value=c.personality;
  for(const id of ['browserPlay','closeWindows','fileHomes'] as const)$<HTMLInputElement>(id).checked=c[id];
  $<HTMLInputElement>('debugCombat').checked=c.debugCombat;
  $<HTMLInputElement>('drawTools').checked=c.drawTools;
  $('duelNow').toggleAttribute('disabled', !c.friend.on);
  $<HTMLInputElement>('sfx').checked = c.sfx;
  $<HTMLInputElement>('windows').checked = c.windows;
  $<HTMLInputElement>('mischief').checked = c.mischief;
  $<HTMLInputElement>('moveWindows').checked = c.moveWindows;
  $<HTMLInputElement>('knockCursor').checked = c.knockCursor;
  $<HTMLInputElement>('screenAware').checked = c.screenAware;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="mind"]')) r.checked = r.value === c.mind;
  const persona = $<HTMLTextAreaElement>('persona'), model = $<HTMLInputElement>('model');
  if (document.activeElement !== persona) persona.value = c.persona;
  if (document.activeElement !== model) model.value = c.model;
  providerSel.value = c.provider;
  $<HTMLAnchorElement>('keyLink').href = PROVIDERS[c.provider].keyUrl;
  $<HTMLInputElement>('puppet').checked = c.puppet;
  const interval = $<HTMLSelectElement>('aiInterval');
  for (const o of [...interval.options]) if (o.dataset.custom) o.remove();
  if (![...interval.options].some((o) => Number(o.value) === c.aiInterval)) {
    const option = new Option(`Every ${c.aiInterval} seconds`, String(c.aiInterval)); option.dataset.custom = 'true'; interval.add(option);
  }
  interval.value = String(c.aiInterval);
  $<HTMLInputElement>('outline').checked = c.look.outline;
  $('mindHead').setAttribute('aria-pressed', String(c.mindLook !== 'circuit'));
  $('mindCircuit').setAttribute('aria-pressed', String(c.mindLook === 'circuit'));
  $('mindHeadNote').hidden = c.mindLook === 'circuit'; $('mindCircuitNote').hidden = c.mindLook !== 'circuit';
  for (const [input, out, key] of sliders) {
    const [a, b] = key.split('.');
    const v = b ? (c as any)[a][b] : (c as any)[a];
    if (document.activeElement !== input) input.value = String(v);
    out.textContent = String(Math.round(v * 100) / 100);
  }
  for (const [btn, isOn] of presetButtons) btn.setAttribute('aria-pressed', String(isOn()));
}
shell.getConfig().then(render);
shell.onConfig(({ id, config }) => { if (id === (shell.petId ?? 0)) render(config); });

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
function moveRow(name: string, poses: number, buttons: [string, () => void][], detail?: string) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = name;
  const info = document.createElement('small');
  info.textContent = detail ?? `${poses} poses`;
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
shell.onCollections((c) => { if (c.memory) renderMemory(c.memory); if (c.items) renderItems(c.items); if (c.props) renderProps(c.props); });

// ── Items tab ──
const SLOTS = ['left hip', 'right hip', 'back', 'pocket'];
function renderItems(v: ItemsView) {
  const where = (it: ItemsView['list'][number]) => it.where === 'belt' ? `on his belt (${SLOTS[it.slot] ?? '?'})` : it.where === 'hand' ? 'in his hand' : it.where === 'worn' ? 'wearing it' : it.where === 'world' ? 'lying around' : 'you have it';
  $('itemList').replaceChildren(...(v.list.length ? v.list.map((it) => moveRow(it.name + (it.drawn ? ' (drawn)' : ''), 0, [
    ...(it.where === 'belt' || it.where === 'hand' || it.where === 'worn' ? [['Take', () => shell.command(`item:take:${it.uid}`)] as [string, () => void]] : []),
    ...(it.where === 'cursor' || it.where === 'world' ? [['Give back', () => shell.command(`item:return:${it.uid}`)] as [string, () => void]] : []),
    ['Put away', () => shell.command(`item:remove:${it.uid}`)],
  ], where(it))) : [emptyNote('He has nothing. Give him something below.')]));
  // His inventory: every kind of thing there is. Drop one in (it falls from the top of the screen and he
  // goes to get it), or put it straight on his belt.
  $('itemKinds').replaceChildren(...v.kinds.filter((k) => !k.drawn).map((k) => thingCard(k, [
    ['Drop it in', () => shell.command(`item:spawn:${k.id}`)],
    [k.wear ? 'Wear' : 'Give him', () => shell.command(`item:give:${k.id}`)],
  ])));
}
function renderProps(v: PropsView) {
  $('propKinds').replaceChildren(...v.kinds.map((k) => thingCard(k, [['Drop it in', () => shell.command(`prop:spawn:${k.id}`)]])));
  $('propPlaced').replaceChildren(...(v.placed.length
    ? [...v.placed.map((p) => moveRow(p.name, 0, [
        ...(p.id === 'tv' ? [
          ['Watch TV', () => shell.command('do:watchtv')],
          ['Video games', () => shell.command('do:videogame')],
          ['Play Othello', () => shell.command('do:playgame')],
          ['Change channel', () => shell.command(`prop:channel:${p.i}`)],
        ] as [string, () => void][] : []),
        ...(p.id === 'canvas' ? [['Paint', () => shell.command('do:paint')] as [string, () => void]] : []),
        ['Put away', () => shell.command(`prop:remove:${p.i}`)]
      ], 'on the desktop')),
      moveRow('All of them', 0, [['Put everything away', () => shell.command('prop:clear')]], '')]
    : [emptyNote('Nothing out on the desktop yet.')]));
}
$('openItems').addEventListener('click', () => shell.openItemsFolder());
$('reloadItems').addEventListener('click', () => shell.reloadItems());

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
  const met = ago(m.firstMet);
  $('memTally').textContent = `Met you ${met === 'just now' ? met : met.replace(' ago', '') + ' ago'}${parts.length ? ' · ' + parts.join(' · ') : ''}`;
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

// ── Mind tab: neurons inside his head ──
// A 3D model of his head with his real decision-making inside: what he feels (a ring of
// neurons low at the back), everything he could do (scattered through his head, bigger and
// brighter = wants it more), and what he's doing (at the front). Not decoration: it's drawn
// straight from his mind, live. Drag the head to turn it. Drag a feeling up or down to change
// it. Click a choice to make him do it; drag it up or down (or scroll on it) to make him like
// it more or less from now on.
let latest: Stats | null = null;
const cvN = $<HTMLCanvasElement>('neurons');
const shown: Record<string, number> = {}; // eased values so neurons glide instead of jumping
const ease = (key: string, v: number) => (shown[key] = (shown[key] ?? v) + (v - (shown[key] ?? v)) * 0.15);
type V = { x: number; y: number; z: number };
interface Neuron { id: string; kind: 'mood' | 'option' | 'out' | 'ai'; pos: V; label: string; lit: number; size: number; why?: string; bias?: number; key?: keyof MoodState; value?: number }
const view = { yaw: 0.5, pitch: -0.18, auto: true, lastTouch: 0 };
let drag: { mode: 'rotate' | 'mood' | 'option'; n?: Neuron; x: number; y: number; yaw: number; pitch: number; start: number; moved: number } | null = null;
let hover: Neuron | null = null;
let projected: { n: Neuron; sx: number; sy: number; r: number; z: number }[] = [];

/** A stable spot inside his head for each choice (so a neuron doesn't jump around as choices come and go). */
function spotFor(name: string): V {
  let h1 = 2166136261, h2 = 52711;
  for (const ch of name) { h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619); h2 = Math.imul(h2 + ch.charCodeAt(0), 2654435761); }
  const u = ((h1 >>> 0) % 1000) / 1000, v = ((h2 >>> 0) % 1000) / 1000;
  const y = -0.62 + u * 0.8, phi = v * Math.PI * 2, r = Math.sqrt(Math.max(0.05, 0.62 - y * y)) * 0.85;
  return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r };
}

function neuronsNow(s: Stats): Neuron[] {
  const out: Neuron[] = [];
  MOOD_ROWS.forEach(([k, label], i) => {
    const a = (i / MOOD_ROWS.length) * Math.PI * 2 + Math.PI;
    const v = ease('in-' + k, s.mood[k]);
    out.push({ id: 'mood-' + k, kind: 'mood', key: k, value: s.mood[k], pos: { x: Math.cos(a) * 0.62, y: 0.5 + Math.sin(a * 2) * 0.08, z: Math.sin(a) * 0.62 - 0.1 }, label: `${label} ${v.toFixed(2)}`, lit: v, size: 5 });
  });
  const opts = s.mind!.weigh, maxScore = Math.max(1, ...opts.map((o) => o.score));
  for (const o of opts) {
    const v = ease('op-' + o.name, o.score / maxScore);
    out.push({ id: 'op-' + o.name, kind: 'option', pos: spotFor(o.name), label: o.name, lit: v, size: 2.5 + v * 5.5, why: o.why, bias: o.bias ?? 1 });
  }
  out.push({ id: 'out', kind: 'out', pos: { x: 0, y: 0.02, z: 0.8 }, label: DOING[s.doing] ?? s.doing, lit: 1, size: 9 });
  out.push({ id: 'ai', kind: 'ai', pos: { x: 0, y: -0.86, z: 0.1 }, label: s.mind!.thinking ? 'AI thinking…' : 'AI brain', lit: s.mind!.thinking ? 1 : /\(AI/.test(s.why) ? 0.6 : 0.1, size: 6 });
  return out;
}

function project(p: V, W: number, H: number) {
  const R = Math.min(W, H) * 0.38, cx = W / 2, cy = H * 0.46;
  const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const x1 = p.x * cyw + p.z * syw, z1 = -p.x * syw + p.z * cyw;
  const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
  const k = 3.2 / (3.2 - z2);
  return { sx: cx + x1 * k * R, sy: cy + y2 * k * R, k, z: z2, R };
}

function neurons(now: number) {
  requestAnimationFrame(neurons);
  if (cvN.offsetParent === null || !latest?.mind) return; // tab hidden
  const dpr = window.devicePixelRatio || 1, W = cvN.clientWidth, H = 380;
  if (cvN.width !== Math.round(W * dpr)) { cvN.width = Math.round(W * dpr); cvN.height = Math.round(H * dpr); cvN.style.height = H + 'px'; }
  const g = cvN.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim(), ink = css.getPropertyValue('--ink').trim(), muted = css.getPropertyValue('--muted').trim(), panel = css.getPropertyValue('--panel').trim();
  const skin = cfg?.look.color ?? accent;
  if (view.auto && !drag && now - view.lastTouch > 4000) view.yaw += 0.004;
  g.font = '11px ' + css.getPropertyValue('--ui');
  g.textBaseline = 'middle';

  const s = latest, ns = neuronsNow(s);
  if (cfg?.mindLook === 'circuit') {
    circuit(g, W, H, now, s, ns, { accent, ink, muted, skin });
    tooltip(g, W, H, css, ink, panel);
    return;
  }
  const P = (p: V) => project(p, W, H);
  const head = P({ x: 0, y: 0, z: 0 }), R = head.R;

  // His neck and head: a thick outline in his color, like him.
  const neckA = P({ x: 0, y: 1, z: 0 }), neckB = P({ x: 0, y: 1.45, z: 0 });
  g.strokeStyle = skin; g.lineCap = 'round'; g.lineWidth = R * 0.16;
  g.beginPath(); g.moveTo(neckA.sx, neckA.sy); g.lineTo(neckB.sx, neckB.sy); g.stroke();
  const grad = g.createRadialGradient(head.sx - R * 0.3, head.sy - R * 0.35, R * 0.1, head.sx, head.sy, R * 1.08);
  grad.addColorStop(0, panel); grad.addColorStop(1, skin + '22');
  g.fillStyle = grad;
  g.beginPath(); g.arc(head.sx, head.sy, R * 1.05, 0, 7); g.fill();
  g.lineWidth = Math.max(3, R * 0.07); g.strokeStyle = skin;
  g.beginPath(); g.arc(head.sx, head.sy, R * 1.05, 0, 7); g.stroke();
  // A faint equator and meridian so you can see it turn.
  g.lineWidth = 1; g.strokeStyle = skin; g.globalAlpha = 0.18;
  for (const ring of [(a: number): V => ({ x: Math.cos(a), y: 0, z: Math.sin(a) }), (a: number): V => ({ x: 0, y: Math.cos(a), z: Math.sin(a) })]) {
    g.beginPath();
    for (let i = 0; i <= 48; i++) { const q = P(ring((i / 48) * Math.PI * 2)); if (i) g.lineTo(q.sx, q.sy); else g.moveTo(q.sx, q.sy); }
    g.stroke();
  }
  g.globalAlpha = 1;

  projected = ns.map((n) => { const q = P(n.pos); return { n, sx: q.sx, sy: q.sy, r: n.size * q.k, z: q.z }; });
  const at = (id: string) => projected.find((q) => q.n.id === id)!;
  const chosen = projected.find((q) => q.n.kind === 'option' && q.n.label === s.doing);
  const out = at('out'), ai = at('ai');

  // Wires: every feeling feeds every choice (faint); the winning path glows, with pulses running along it.
  for (const m of projected.filter((q) => q.n.kind === 'mood')) for (const o of projected.filter((q) => q.n.kind === 'option')) {
    g.strokeStyle = accent; g.lineWidth = 1;
    g.globalAlpha = o === chosen ? 0.12 + m.n.lit * 0.5 : 0.02 + o.n.lit * 0.05;
    g.beginPath(); g.moveTo(m.sx, m.sy); g.lineTo(o.sx, o.sy); g.stroke();
  }
  const pulse = (a: { sx: number; sy: number }, b: { sx: number; sy: number }, speed: number) => {
    const u = ((now / 1000) * speed) % 1;
    g.globalAlpha = 1; g.fillStyle = accent;
    g.beginPath(); g.arc(a.sx + (b.sx - a.sx) * u, a.sy + (b.sy - a.sy) * u, 2.5, 0, 7); g.fill();
  };
  if (chosen) {
    g.globalAlpha = 0.8; g.lineWidth = 2; g.strokeStyle = accent;
    g.beginPath(); g.moveTo(chosen.sx, chosen.sy); g.lineTo(out.sx, out.sy); g.stroke();
    pulse(chosen, out, 0.9);
    for (const m of projected.filter((q) => q.n.kind === 'mood' && q.n.lit > 0.35)) pulse(m, chosen, 0.5 + m.n.lit);
  }
  if (ai.n.lit > 0.3) {
    g.globalAlpha = ai.n.lit; g.lineWidth = 2; g.strokeStyle = accent;
    g.beginPath(); g.moveTo(ai.sx, ai.sy); g.lineTo(out.sx, out.sy); g.stroke();
    if (/\(AI/.test(s.why)) pulse(ai, out, 0.8);
  }

  // Neurons, back to front. Ones you've made him like more get a ring (fewer rings = likes it less).
  const top = new Set(projected.filter((q) => q.n.kind === 'option').sort((a, b) => b.n.lit - a.n.lit).slice(0, 5).map((q) => q.n.id));
  for (const q of [...projected].sort((a, b) => a.z - b.z)) {
    const n = q.n, depth = 0.55 + 0.45 * Math.min(1, Math.max(0, (q.z + 1) / 2));
    g.globalAlpha = depth;
    g.fillStyle = panel; g.beginPath(); g.arc(q.sx, q.sy, q.r, 0, 7); g.fill();
    g.globalAlpha = depth * (0.15 + n.lit * 0.85);
    g.fillStyle = n.kind === 'mood' ? skin : accent; g.beginPath(); g.arc(q.sx, q.sy, q.r, 0, 7); g.fill();
    g.globalAlpha = depth;
    const bold = n === chosen?.n || n.kind === 'out' || n === hover;
    g.strokeStyle = n.kind === 'mood' ? skin : accent; g.lineWidth = bold ? 2.5 : 1;
    g.beginPath(); g.arc(q.sx, q.sy, q.r, 0, 7); g.stroke();
    if (n.bias && Math.abs(n.bias - 1) > 0.02) {
      g.setLineDash(n.bias < 1 ? [2, 3] : []); g.lineWidth = 1.5;
      g.beginPath(); g.arc(q.sx, q.sy, q.r + 3 + Math.abs(Math.log(n.bias)) * 4, 0, 7); g.stroke();
      g.setLineDash([]);
    }
    if (n.kind !== 'option' || top.has(n.id) || n === hover || n === chosen?.n) {
      g.fillStyle = bold ? ink : muted; g.globalAlpha = Math.max(depth, 0.7);
      const right = q.sx >= head.sx;
      g.textAlign = right ? 'left' : 'right';
      g.fillText(n.label, q.sx + (right ? 1 : -1) * (q.r + 5), q.sy);
    }
  }
  g.globalAlpha = 1;
  tooltip(g, W, H, css, ink, panel);
}

/** What the neuron (or chip) under your cursor is, along the bottom. */
function tooltip(g: CanvasRenderingContext2D, W: number, H: number, css: CSSStyleDeclaration, ink: string, panel: string) {
  if (hover) {
    const n = hover;
    const text = n.kind === 'mood' ? `${n.label} — drag up or down to change it`
      : n.kind === 'option' ? `${n.label}: ${n.why ?? ''}${n.bias && Math.abs(n.bias - 1) > 0.02 ? ` · you made him like it ×${n.bias.toFixed(1)}` : ''} — click: do it · drag ↕: like it more/less`
        : n.label;
    g.font = '12px ' + css.getPropertyValue('--ui');
    const w = Math.min(W - 16, g.measureText(text).width + 16);
    g.fillStyle = ink; g.globalAlpha = 0.9; g.beginPath(); g.roundRect(8, H - 30, w, 22, 6); g.fill();
    g.fillStyle = panel; g.globalAlpha = 1; g.textAlign = 'left'; g.fillText(text, 16, H - 19, W - 32);
  }
}

/**
 * The same mind as a circuit board. Feelings are input pins down the left, feeding a bus; every
 * choice is a chip (bigger and brighter = wants it more); what he's doing is the big processor on
 * the right; his AI brain is the chip at the top. The winning path lights up, with signals running
 * along it. Same hit-testing as the head (it fills in `projected`), so every drag and click works.
 */
function circuit(g: CanvasRenderingContext2D, W: number, H: number, now: number, s: Stats, ns: Neuron[], c: { accent: string; ink: string; muted: string; skin: string }) {
  const BOARD = '#0f3a2c', BOARD_EDGE = '#1d5a43', TRACE = '#2f7656', COPPER = '#d8b25a', SILK = '#cfe9d6', GLOW = '#7dffc4', CHIP = '#1b1e25', LED = '#ffc94d';
  const t = now / 1000;
  g.save();
  g.fillStyle = BOARD; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 10); g.fill();
  g.strokeStyle = BOARD_EDGE; g.lineWidth = 2; g.stroke();
  // Vias: a faint grid of plated holes, and a few mounting holes in the corners.
  g.fillStyle = BOARD_EDGE;
  for (let x = 24; x < W - 12; x += 24) for (let y = 24; y < H - 12; y += 24) { g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill(); }
  for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) {
    g.fillStyle = COPPER; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = BOARD; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
  }
  const silk = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    g.fillStyle = SILK; g.globalAlpha = 0.75; g.font = '600 9px ' + getComputedStyle(document.documentElement).getPropertyValue('--mono');
    g.textAlign = align; g.fillText(text, x, y); g.globalAlpha = 1;
  };
  const trace = (pts: [number, number][], lit: number, width = 2) => {
    g.strokeStyle = lit > 0.5 ? GLOW : TRACE; g.globalAlpha = lit > 0.5 ? 0.35 + 0.65 * lit : 0.55 + lit * 0.3;
    g.lineWidth = width; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.globalAlpha = 1;
  };
  const signal = (pts: [number, number][], speed: number) => {
    // A bright pulse running along a polyline.
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = lens.reduce((a, b) => a + b, 0) || 1;
    let d = ((t * speed * 120) % total);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const u = d / (lens[i] || 1), x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
        g.fillStyle = GLOW; g.shadowColor = GLOW; g.shadowBlur = 8; g.fillRect(x - 2.5, y - 2.5, 5, 5); g.shadowBlur = 0;
        return;
      }
      d -= lens[i];
    }
  };
  const chipBox = (x: number, y: number, w: number, h: number, pins: number, lit: number, edge: string) => {
    // Pins along the top and bottom, then the body, then a glow edge as bright as he wants it.
    g.fillStyle = COPPER; g.globalAlpha = 0.85;
    for (let i = 0; i < pins; i++) {
      const px = x - w / 2 + ((i + 0.5) / pins) * w;
      g.fillRect(px - 1.5, y - h / 2 - 3, 3, 3); g.fillRect(px - 1.5, y + h / 2, 3, 3);
    }
    g.globalAlpha = 1; g.fillStyle = CHIP; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 2.5); g.fill();
    g.strokeStyle = edge; g.globalAlpha = 0.25 + lit * 0.75; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1;
    g.fillStyle = SILK; g.globalAlpha = 0.5; g.beginPath(); g.arc(x - w / 2 + 3.5, y - h / 2 + 3.5, 1.2, 0, 7); g.fill(); g.globalAlpha = 1;
  };

  const moods = ns.filter((n) => n.kind === 'mood'), opts = ns.filter((n) => n.kind === 'option').sort((a, b) => a.label.localeCompare(b.label));
  const out = ns.find((n) => n.kind === 'out')!, ai = ns.find((n) => n.kind === 'ai')!;
  const chosen = opts.find((n) => n.label === s.doing);
  const top = new Set([...opts].sort((a, b) => b.lit - a.lit).slice(0, 5).map((n) => n.id));
  projected = [];

  // Feelings: pads with an LED, down the left edge, wired to a bus.
  const padX = 34, busX = 112, y0 = 46, y1 = H - 46;
  silk('MOOD IN', padX - 14, 26);
  moods.forEach((n, i) => {
    const y = y0 + (i / Math.max(1, moods.length - 1)) * (y1 - y0);
    trace([[padX + 8, y], [busX, y]], n.lit * 0.6);
    g.fillStyle = COPPER; g.fillRect(padX - 8, y - 6, 16, 12);
    g.fillStyle = LED; g.globalAlpha = 0.15 + n.lit * 0.85; g.shadowColor = LED; g.shadowBlur = 12 * n.lit;
    g.beginPath(); g.arc(padX + 18, y - 11, 3.5, 0, 7); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
    silk(n.label, padX + 26, y - 10);
    projected.push({ n, sx: padX, sy: y, r: 9, z: 0 });
  });
  trace([[busX, y0], [busX, y1]], 0.2, 3);

  // What he's doing: the processor.
  const cpuX = W - 78, cpuY = H / 2 + 14, cpuW = 92, cpuH = 74;
  // His AI brain: a chip at the top, feeding the processor.
  const aiX = W - 78, aiY = 52;
  trace([[aiX, aiY + 14], [aiX, cpuY - cpuH / 2 - 4]], ai.lit, 2.5);
  if (ai.lit > 0.5) signal([[aiX, aiY + 14], [aiX, cpuY - cpuH / 2 - 4]], 1);
  chipBox(aiX, aiY, 54, 26, 6, ai.lit, c.accent);
  silk('AI', aiX, aiY + 1, 'center'); silk(ai.label.toUpperCase(), aiX, aiY - 24, 'center');
  projected.push({ n: ai, sx: aiX, sy: aiY, r: 16, z: 0 });

  // Every choice: a chip in a grid, wired off the bus. The chosen one is wired on to the processor.
  const gx0 = busX + 26, gx1 = cpuX - cpuW / 2 - 30, gy0 = 40, gy1 = H - 40;
  const cols = Math.max(2, Math.round(Math.sqrt(opts.length * (gx1 - gx0) / (gy1 - gy0)))), rows = Math.max(1, Math.ceil(opts.length / cols));
  const cw = (gx1 - gx0) / cols, chh = (gy1 - gy0) / rows;
  const chips = opts.map((n, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = gx0 + (col + 0.5) * cw, y = gy0 + (row + 0.5) * chh;
    const w = Math.max(14, cw * (0.35 + 0.45 * n.lit)), h = Math.max(9, chh * (0.28 + 0.3 * n.lit));
    return { n, x, y, w, h };
  });
  for (const ch of chips) trace([[busX, ch.y], [ch.x - ch.w / 2 - 3, ch.y]], ch.n === chosen ? 1 : ch.n.lit * 0.4, 1.2);
  if (chosen) {
    const ch = chips.find((q) => q.n === chosen)!;
    const path: [number, number][] = [[ch.x + ch.w / 2 + 3, ch.y], [gx1 + 14, ch.y], [gx1 + 14, cpuY], [cpuX - cpuW / 2 - 4, cpuY]];
    trace(path, 1, 3);
    signal(path, 1.1);
    for (const m of moods.filter((q) => q.lit > 0.35)) {
      const p = projected.find((q) => q.n === m)!;
      signal([[padX + 8, p.sy], [busX, p.sy], [busX, ch.y], [ch.x - ch.w / 2 - 3, ch.y]], 0.6 + m.lit);
    }
  }
  for (const ch of chips) {
    const n = ch.n, bold = n === chosen || n === hover;
    chipBox(ch.x, ch.y, ch.w, ch.h, Math.max(2, Math.round(ch.w / 9)), n.lit, n === chosen || n.lit > 0.75 ? GLOW : c.accent);
    if (n.bias && Math.abs(n.bias - 1) > 0.02) {
      g.strokeStyle = COPPER; g.lineWidth = 1.2; g.setLineDash(n.bias < 1 ? [2, 3] : []);
      const pad = 4 + Math.abs(Math.log(n.bias)) * 4;
      g.beginPath(); g.roundRect(ch.x - ch.w / 2 - pad, ch.y - ch.h / 2 - pad, ch.w + pad * 2, ch.h + pad * 2, 4); g.stroke(); g.setLineDash([]);
    }
    if (top.has(n.id) || bold) {
      g.fillStyle = bold ? '#ffffff' : SILK; g.globalAlpha = bold ? 1 : 0.8;
      g.font = (bold ? '600 ' : '') + '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--ui');
      g.textAlign = 'center'; g.fillText(n.label, ch.x, ch.y + ch.h / 2 + 11); g.globalAlpha = 1;
    }
    projected.push({ n, sx: ch.x, sy: ch.y, r: Math.max(ch.w, ch.h) / 2, z: 0 });
  }

  chipBox(cpuX, cpuY, cpuW, cpuH, 9, 1, GLOW);
  g.fillStyle = GLOW; g.globalAlpha = 0.12 + 0.08 * Math.sin(t * 3); g.beginPath(); g.roundRect(cpuX - cpuW / 2 + 6, cpuY - cpuH / 2 + 6, cpuW - 12, cpuH - 12, 3); g.fill(); g.globalAlpha = 1;
  silk('DOING', cpuX, cpuY - 16, 'center');
  g.fillStyle = '#ffffff'; g.font = '600 12px ' + getComputedStyle(document.documentElement).getPropertyValue('--ui'); g.textAlign = 'center';
  g.fillText(out.label, cpuX, cpuY + 6, cpuW - 10);
  projected.push({ n: out, sx: cpuX, sy: cpuY, r: cpuW / 2, z: 0 });
  silk(`${(cfg?.name ?? 'BLURP').toUpperCase()} REV 2`, W - 30, H - 14, 'right');
  g.restore();
}
requestAnimationFrame(neurons);
(window as unknown as { __neurons: () => typeof projected }).__neurons = () => projected; // for poking at in DevTools

function neuronAt(x: number, y: number) {
  let best: Neuron | null = null, bd = Infinity;
  for (const q of projected) { const d = Math.hypot(q.sx - x, q.sy - y); if (d < Math.max(9, q.r + 3) && d < bd) { bd = d; best = q.n; } }
  return best;
}
const local = (e: PointerEvent | WheelEvent) => { const r = cvN.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
let biasSent = 0;
function setBias(name: string, v: number, force = false) {
  const biases = { ...(cfg?.biases ?? {}), [name]: Math.min(3, Math.max(0.2, v)) };
  if (cfg) cfg.biases = biases;
  if (force || performance.now() - biasSent > 100) { biasSent = performance.now(); set({ biases }); }
}
cvN.addEventListener('pointerdown', (e) => {
  const p = local(e), n = neuronAt(p.x, p.y);
  view.lastTouch = performance.now();
  cvN.setPointerCapture(e.pointerId);
  const mode = n?.kind === 'mood' ? 'mood' : n?.kind === 'option' ? 'option' : 'rotate';
  drag = { mode, n: n ?? undefined, x: p.x, y: p.y, yaw: view.yaw, pitch: view.pitch, start: mode === 'mood' ? n!.value ?? 0 : mode === 'option' ? n!.bias ?? 1 : 0, moved: 0 };
});
cvN.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (!drag) { hover = neuronAt(p.x, p.y); cvN.style.cursor = hover ? (hover.kind === 'option' ? 'pointer' : hover.kind === 'mood' ? 'ns-resize' : 'default') : 'grab'; return; }
  view.lastTouch = performance.now();
  const dx = p.x - drag.x, dy = p.y - drag.y;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  if (drag.mode === 'rotate') {
    view.yaw = drag.yaw + dx * 0.01;
    view.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + dy * 0.01));
  } else if (drag.mode === 'mood' && drag.n?.key) {
    const v = Math.min(1, Math.max(0, drag.start - dy / 120));
    shell.command(`setMood:${JSON.stringify({ [drag.n.key]: v })}`);
  } else if (drag.mode === 'option' && drag.n && drag.moved > 4) {
    setBias(drag.n.label, drag.start * Math.exp(-dy / 90));
  }
});
cvN.addEventListener('pointerup', () => {
  if (drag?.mode === 'option' && drag.n) {
    if (drag.moved <= 4) shell.command(`do:${drag.n.label}`); // a click: do it now
    else setBias(drag.n.label, (cfg?.biases ?? {})[drag.n.label] ?? 1, true);
  }
  drag = null;
});
cvN.addEventListener('wheel', (e) => {
  const p = local(e), n = neuronAt(p.x, p.y);
  if (n?.kind !== 'option') return;
  e.preventDefault();
  setBias(n.label, (n.bias ?? 1) * (e.deltaY < 0 ? 1.12 : 1 / 1.12), true);
}, { passive: false });
cvN.addEventListener('pointerleave', () => { hover = null; });
$('resetBiases').addEventListener('click', () => set({ biases: {} }));
$('mindHead').addEventListener('click', () => set({ mindLook: 'head' }));
$('mindCircuit').addEventListener('click', () => set({ mindLook: 'circuit' }));

// Everything's set up: ask him for his drawings, moves, memories and things.
shell.command('sync');

$('extensionFolder').onclick=()=>shell.openExtensionFolder?.();
$('pairChrome').onclick=async()=>{try{const info=await shell.desktopInfo?.();if(!info?.pairing)throw new Error(info?.error || 'The Chrome bridge is unavailable.');await navigator.clipboard.writeText(info.pairing);$('chromeInfo').textContent='Pairing link copied. Paste it into the Chrome extension.';}catch(error){$('chromeInfo').textContent=(error as Error).message;}};
$('chooseHabitat').onclick=async()=>{try{const result=await shell.chooseHabitat?.('folder');$('fileInfo').textContent=result?.message??'Use the desktop app for file visits.';}catch(error){$('fileInfo').textContent=(error as Error).message;}};
$('returnHome').onclick=()=>shell.command('returnHome');
shell.onFileNote?.(message=>{$('fileInfo').textContent=message;});
setInterval(async()=>{try{const info=await shell.desktopInfo?.();if(!info)return;const home=info.homes.find(h=>h.id===shell.petId);if(home)$('fileInfo').textContent=`Visiting ${home.path}. Open it in Finder / Explorer to see him.`;if(info.error)$('chromeInfo').textContent=info.error;else if(info.connected)$('chromeInfo').textContent='A Chrome page is connected.';}catch{}},3000);

$('chooseFile').onclick=async()=>{try{const result=await shell.chooseHabitat?.('file');$('fileInfo').textContent=result?.message??'Use the desktop app.';}catch(error){$('fileInfo').textContent=(error as Error).message;}};
