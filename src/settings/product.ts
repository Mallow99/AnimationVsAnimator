import { CHARACTER_PRESETS, RANGES, type PetConfig } from '../core/config';
import { BUNDLES } from '../core/presets';
import { conversationKeys, exportConversation, transcriptView } from '../app/conversation-view';
import { PRODUCT_NAME, type SaveHealth, type SaveResult, type SessionState } from '../shared/product';

interface Stats { name: string; label: string; doing: string; windows: number; moveNote?: string; brain: { log: Parameters<typeof exportConversation>[0] } }
interface Shell {
  quit(): void;
  getConfigs(): Promise<PetConfig[]>;
  setConfig(patch: unknown, id?: number): void;
  onConfig(cb: (value: { id: number; config: PetConfig }) => void): void;
  onStats(cb: (value: { id: number; stats: Stats }) => void): void;
  command(cmd: string, id?: number): void;
  onSelect(cb: (id: number) => void): void;
  onTab(cb: (tab: string) => void): void;
  getSaveHealth(): Promise<SaveHealth>;
  onSaveHealth(cb: (health: SaveHealth) => void): void;
  retrySaves(): void;
  productInfo(): Promise<{ name: string; version: string; state: { introDone: boolean }; recovered: string[] }>;
  productSetup(patch: unknown): Promise<SaveResult>;
  getSession(): Promise<SessionState>;
  setSession(patch: Partial<SessionState>): void;
  onSession(cb: (state: SessionState) => void): void;
  openItemsFolder(): void;
  reloadItems(): void;
  openData(): void;
  exportBackup(): Promise<SaveResult>;
}
const shell = (window as unknown as { petShell: Shell }).petShell;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let configs: PetConfig[] = [], selected = 0;
const stats = new Map<number, Stats>(), drafts = new Map<number, string>();
let session: SessionState = { paused: false, hidden: false };
const transcript = transcriptView($('chatLog'));
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
function tab(name: string) {
  const mapped = ({ chat: 'buddies', mood: 'activities', items: 'things', him: 'settings', look: 'buddies', body: 'buddies', mind: 'activities' } as Record<string, string>)[name] ?? name;
  if (!tabs.some(t => t.dataset.tab === mapped)) return;
  for (const t of tabs) { const active = t.dataset.tab === mapped; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; $(t.dataset.tab!).hidden = !active; }
  window.scrollTo({top:0,behavior:"auto"});
}
for (const [i, button] of tabs.entries()) {
  button.onclick = () => tab(button.dataset.tab!);
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tab(tabs[next].dataset.tab!); tabs[next].focus();
  };
}
tab('buddies');
const activeIds = () => configs[0]?.spawnOrder.slice(0, configs[0].figureCount) ?? [];
function choose(id: number) {
  if (!Number.isInteger(id) || id < 0 || id > 4) return;
  if (!configs[id]) { selected = id; return; }
  drafts.set(selected, $<HTMLTextAreaElement>('chatText').value);
  selected = id; $<HTMLTextAreaElement>('chatText').value = drafts.get(id) ?? '';
  render(); updateFineTune(); shell.command('sync', id);
}
shell.onSelect(choose);
shell.onTab(name => { tab(name); if (name === 'chat') $('chatText').focus(); });
function set(patch: Partial<PetConfig>) { shell.setConfig(patch, selected); }
function render() {
  const c = configs[selected]; if (!c) return;
  const active = activeIds();
  $('roster').replaceChildren(...configs.map((c, id) => {
    const label = document.createElement('label'), input = document.createElement('input'), swatch = document.createElement('span');
    input.type = 'checkbox'; input.checked = active.includes(id); input.setAttribute('aria-label', `Show ${c.name}`);
    swatch.className = 'swatch'; swatch.style.background = c.look.color;
    input.onchange = () => { const next = input.checked ? [...activeIds(), id] : activeIds().filter(i => i !== id); if (!next.length) { input.checked = true; return; }
      shell.setConfig({ figureCount: next.length, spawnOrder: [...new Set([...next, 0, 1, 2, 3, 4])] }, 0); };
    label.append(input, swatch, document.createTextNode(c.name)); return label;
  }));
  const chooser = $<HTMLSelectElement>('buddy');
  chooser.replaceChildren(...configs.map((c, id) => new Option(c.name + (active.includes(id) ? '' : ' · resting away'), String(id)))); chooser.value = String(selected);
  for (const [id, value] of [['name', c.name], ['color', c.look.color], ['size', c.scale], ['pace', c.hyperactivity], ['volume', c.volume], ['fightMode', c.fightMode]] as const) {
    if (document.activeElement !== $(id)) $<HTMLInputElement>(id).value = String(value);
  }
  for (const id of ['windows', 'sound', 'sfx', 'dailyRhythm', 'moveWindows', 'knockCursor', 'mischief', 'screenAware', 'smacking', 'destructible'] as const) $<HTMLInputElement>(id).checked = c[id];
  $('personality').textContent = `${c.personality[0].toUpperCase() + c.personality.slice(1)} · ${CHARACTER_PRESETS[selected].description}`;
  const enabled = active.includes(selected);
  for (const id of ['chatText', 'sendChat', 'exportChat', 'newChat', 'stopActivity']) $<HTMLButtonElement>(id).disabled = !enabled;
  $('confirmReset').hidden = true;
  renderStats();
}
function renderStats() {
  const c = configs[selected], s = stats.get(selected); if (!c) return;
  $('liveStatus').textContent = activeIds().includes(selected) ? s ? `${s.name} · ${s.label}` : 'Getting settled…' : 'Resting away';
  transcript((s?.brain.log ?? []).filter(line => line.who !== "note"), c.name, String(selected));
  $('windowStatus').textContent = !c.windows ? 'Optional. Buddies currently play on the desktop floor.' : s?.windows ? `${s.windows} window surfaces detected.` : 'Waiting for accessible windows. On Mac, check Accessibility permission for Mallow Desk Buddies. The desktop floor stays available.';
}
shell.onStats(({ id, stats: value }) => { stats.set(id, value); if (id === selected) renderStats(); });
shell.onConfig(({ id, config }) => { configs[id] = config; render(); });
$<HTMLSelectElement>('buddy').onchange = () => choose(Number($<HTMLSelectElement>('buddy').value));
$<HTMLInputElement>('name').onchange = () => { const name = $<HTMLInputElement>('name').value.trim(); if (name) set({ name }); else render(); };
$<HTMLInputElement>('color').oninput = () => set({ look: { ...configs[selected].look, color: $<HTMLInputElement>('color').value } });
for (const [id, key] of [['size', 'scale'], ['pace', 'hyperactivity'], ['volume', 'volume']] as const) $<HTMLInputElement>(id).oninput = () => set({ [key]: Number($<HTMLInputElement>(id).value) });
for (const key of ['windows', 'sound', 'sfx', 'dailyRhythm', 'moveWindows', 'knockCursor', 'mischief', 'screenAware', 'smacking', 'destructible'] as const) $<HTMLInputElement>(key).onchange = () => set({ [key]: $<HTMLInputElement>(key).checked });
$<HTMLSelectElement>('fightMode').onchange = () => set({ fightMode: $<HTMLSelectElement>('fightMode').value as PetConfig['fightMode'] });
for (const preset of BUNDLES) { const button = document.createElement('button'); button.textContent = preset.name; button.onclick = () => set({ look: { ...configs[selected].look, ...preset.look }, body: { ...configs[selected].body, ...preset.body } }); $('presets').append(button); }
for (const [key, range] of Object.entries(RANGES).filter(([key]) => key.startsWith('body.') || key.startsWith('look.'))) {
  const label = document.createElement('label'), input = document.createElement('input'); label.className = 'field'; input.type = 'range'; input.min = String(range.min); input.max = String(range.max); input.step = String(range.step); input.title = range.hint;
  input.dataset.path = key;
  input.oninput = () => { const [group, field] = key.split('.') as ['body' | 'look', string]; set({ [group]: { ...configs[selected][group], [field]: Number(input.value) } }); };
  label.append(document.createTextNode(range.label), input); $('fineTune').append(label);
}
shell.onConfig(() => updateFineTune());
function updateFineTune() { for (const input of document.querySelectorAll<HTMLInputElement>('[data-path]')) { const [group, key] = input.dataset.path!.split('.'); const values = configs[selected]?.[group as 'body' | 'look'] as unknown as Record<string, number>; if (values && document.activeElement !== input) input.value = String(values[key]); } }
const chat = $<HTMLTextAreaElement>('chatText'), form = $<HTMLFormElement>('chatForm');
conversationKeys(chat, form);
form.onsubmit = event => { event.preventDefault(); if (chat.disabled || !chat.value.trim()) return; shell.command('hear:' + chat.value, selected); chat.value = ''; drafts.delete(selected); };
$('exportChat').onclick = () => exportConversation(stats.get(selected)?.brain.log ?? [], configs[selected].name);
$('newChat').onclick = () => { $('confirmReset').hidden = false; $('clearChat').focus(); };
$('keepChat').onclick = () => { $('confirmReset').hidden = true; $('newChat').focus(); };
$('clearChat').onclick = () => { shell.command('conversation:new', selected); $('confirmReset').hidden = true; chat.focus(); };
for (const [label, action, hint] of [
  ['Have a dance', 'dance', 'A little room to move.'], ['Read a book', 'read', 'Pick up an owned book and settle in.'],
  ['Play catch', 'catch', 'Needs a ball and an available friend.'], ['Watch TV', 'watchtv', 'Needs a placed TV.'],
  ['Draw something', 'doodle', 'Needs their pen.'], ['Play a pocket game', 'handheld', 'Needs an owned handheld.'],
  ['Play Pong', 'pong', 'Needs a TV and an available friend.'], ['Friendly spar', 'duel', 'Invite an available friend.'],
] as const) { const button = document.createElement('button'), title = document.createElement('span'), small = document.createElement('small'); title.textContent = label; small.textContent = hint; button.append(title, small); button.onclick = () => { if (!activeIds().includes(selected)) { $('activityHelp').textContent = 'Bring this buddy onto the desktop first.'; return; } shell.command('do:' + action, selected); $('activityHelp').textContent = `${configs[selected].name}: ${hint} Open all activities to see current requirements.`; }; $('activityList').append(button); }
$('openActivities').onclick = () => shell.command('openActivities', selected);
$('stopActivity').onclick = () => shell.command('hear:stop', selected);
$('openBag').onclick = () => shell.command('openInventory', selected);
$('placeFurniture').onclick = () => shell.command('openSupplies', selected);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-supply]')) button.onclick = () => { if (activeIds().includes(selected)) shell.command('item:give:' + button.dataset.supply, selected); else { tab('buddies'); $('liveStatus').textContent = 'Bring this buddy onto the desktop first.'; } };
$('openItems').onclick = () => shell.openItemsFolder(); $('reloadItems').onclick = () => shell.reloadItems();
function showHealth(health: SaveHealth) { $('health').hidden = !health.issues.length; $('healthText').textContent = health.issues.map(i => i.message).join(' '); }
shell.onSaveHealth(showHealth); void shell.getSaveHealth().then(showHealth);
$('retrySave').onclick = () => shell.retrySaves();
function sessionView(value: SessionState) { session = value; $('pause').textContent = session.paused ? 'Resume buddies' : 'Pause buddies'; $('hide').textContent = session.hidden ? 'Show all buddies' : 'Hide all buddies'; }
shell.onSession(sessionView); void shell.getSession().then(sessionView);
$('quit').onclick = () => shell.quit();
$('pause').onclick = () => shell.setSession({ paused: !session.paused }); $('hide').onclick = () => shell.setSession({ hidden: !session.hidden });
$('finishIntro').onclick = async () => { const result = await shell.productSetup({ introDone: true }); if (result.ok) $('welcome').hidden = true; };
$('showWelcome').onclick = () => { $('welcome').hidden = false; window.scrollTo({ top: 0, behavior: 'auto' }); };
$('openData').onclick = () => shell.openData();
$('exportBackup').onclick = async () => {
  const button = $<HTMLButtonElement>('exportBackup'); button.disabled = true;
  try { const result = await shell.exportBackup(); $('backupStatus').textContent = result.ok ? 'Backup exported.' : result.message; }
  catch { $('backupStatus').textContent = 'The backup could not be exported. Existing saves are kept.'; }
  finally { button.disabled = false; }
};
void shell.productInfo().then(info => { $('version').textContent = `${PRODUCT_NAME} ${info.version}`; $('welcome').hidden = info.state.introDone; if (info.recovered.length) $('recoveryStatus').textContent = 'A damaged save was recovered from its last-good backup. The damaged original was retained.'; });
void shell.getConfigs().then(value => { configs = value; render(); updateFineTune(); shell.command('sync', selected); });
