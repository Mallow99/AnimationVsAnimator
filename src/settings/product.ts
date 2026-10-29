import { activeFigureIds, CHARACTER_PRESETS, RANGES, type PetConfig, type Personality } from '../core/config';
import { hexToHsl, hslToHex, type Hsl } from './color';
import { conversationKeys, exportConversation, transcriptView } from '../app/conversation-view';
import { ARNOLD_ID, MAX_ACTIVE_FIGURES } from '../core/profiles';
import { type ActivitySnapshot, type ActivityRequestResult } from '../shared/activity';
import { PRODUCT_NAME, type RedeemResult, type SaveHealth, type SaveResult, type SessionState } from '../shared/product';

interface Stats { activity?: ActivitySnapshot; name: string; label: string; doing: string; windows: number; moveNote?: string; brain: { log: Parameters<typeof exportConversation>[0] } }
interface Shell {
  quit(): void;
  getConfigs(): Promise<PetConfig[]>;
  setConfig(patch: unknown, id?: number): void;
  onRoster(cb: (configs: PetConfig[]) => void): void;
  redeemCode(code: string): Promise<RedeemResult>;
  requestActivity(id:number, command:string): Promise<ActivityRequestResult>;
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
const activeIds = () => configs[0] ? activeFigureIds(configs[0],configs.map((_,id)=>id)) : [];
function choose(id: number) {
  if (!Number.isInteger(id) || id < 0 || id >= configs.length) return;
  if (!configs[id]) { selected = id; return; }
  drafts.set(selected, $<HTMLTextAreaElement>('chatText').value);
  selected = id; $<HTMLTextAreaElement>('chatText').value = drafts.get(id) ?? '';
  render(); updateFineTune(); shell.command('sync', id);
}
shell.onSelect(choose);
shell.onTab(name => { tab(name); if (name === 'chat') $('chatText').focus(); });
type ConfigPatch = Omit<Partial<PetConfig>, 'look' | 'body'> & { look?: Partial<PetConfig['look']>; body?: Partial<PetConfig['body']> };
function set(patch: ConfigPatch) { shell.setConfig(patch, selected); }
function render() {
  const c = configs[selected]; if (!c) return;
  const active = activeIds();
  $('roster').replaceChildren(...configs.map((c, id) => {
    const label = document.createElement('label'), input = document.createElement('input'), swatch = document.createElement('span');
    input.type = 'checkbox'; input.checked = active.includes(id); input.disabled=!input.checked&&active.length>=MAX_ACTIVE_FIGURES; input.setAttribute('aria-label', `Show ${c.name}`);
    swatch.className = 'swatch'; swatch.style.background = c.look.color;
    input.onchange = () => { const next = input.checked ? [...activeIds(), id] : activeIds().filter(i => i !== id); if (!next.length || next.length>MAX_ACTIVE_FIGURES) { input.checked = activeIds().includes(id); return; }
      shell.setConfig({ figureCount: next.length, spawnOrder: [...new Set([...next, ...configs.map((_,i)=>i)])] }, 0); };
    label.append(input, swatch, document.createTextNode(c.name)); return label;
  }));
  $('rosterHelp').textContent=active.length>=MAX_ACTIVE_FIGURES?'Five buddies are on the desktop. Put someone away before bringing another out.':'Up to five buddies on the desktop. Their belongings and friendships stay when you put them away.';
  $('tattooOption').hidden=selected!==ARNOLD_ID;
  $<HTMLInputElement>('tattoo').checked=c.look.tattoo==='jt';
  const chooser = $<HTMLSelectElement>('buddy');
  chooser.replaceChildren(...configs.map((c, id) => new Option(c.name + (active.includes(id) ? '' : ' · resting away'), String(id)))); chooser.value = String(selected);
  for (const [id, value] of [['name', c.name], ['color', c.look.color], ['size', c.scale], ['pace', c.hyperactivity], ['volume', c.volume], ['fightMode', c.fightMode]] as const) {
    if (document.activeElement !== $(id)) $<HTMLInputElement>(id).value = String(value);
  }
  for (const id of ['windows', 'sound', 'sfx', 'dailyRhythm', 'moveWindows', 'knockCursor', 'mischief', 'screenAware', 'smacking', 'destructible'] as const) $<HTMLInputElement>(id).checked = c[id];
  $<HTMLSelectElement>('personalityChoice').value = c.personality;
  $('personality').textContent = (selected === ARNOLD_ID ? 'Talkative and cheerfully unfunny. Feather-quill sketches, corny puns and plenty to say. Activity preference: ' : '') + (CHARACTER_PRESETS.find(p => p.personality === c.personality)?.description ?? '');
  syncColor();
  const enabled = active.includes(selected);
  for (const id of ['chatText', 'sendChat', 'exportChat', 'newChat', 'stopActivity']) $<HTMLButtonElement>(id).disabled = !enabled;
  $('confirmReset').hidden = true;
  renderStats();
}
function renderStats() {
  const c = configs[selected], s = stats.get(selected); if (!c) return;
  $('liveStatus').textContent = activeIds().includes(selected) ? s ? `${c.name} · ${s.activity?.current.label ?? s.label}` : 'Getting settled…' : 'Resting away';
  transcript((s?.brain.log ?? []).filter(line => line.who !== "note"), c.name, String(selected));
  updateActivities();
  $('windowStatus').textContent = !c.windows ? 'Optional. Buddies currently play on the desktop floor.' : s?.windows ? `${s.windows} window surfaces detected.` : 'Waiting for accessible windows. On Mac, check Accessibility permission for Mallow Desk Buddies. The desktop floor stays available.';
}
shell.onStats(({ id, stats: value }) => { stats.set(id, value); if (id === selected) renderStats(); });
shell.onRoster(value=>{configs=value;render();updateFineTune();});
shell.onConfig(({ id, config }) => { configs[id] = config; render(); });
$<HTMLSelectElement>('buddy').onchange = () => choose(Number($<HTMLSelectElement>('buddy').value));
$<HTMLInputElement>('name').onchange = () => { const name = $<HTMLInputElement>('name').value.trim(); if (name) set({ name }); else render(); };
$<HTMLInputElement>('color').oninput = () => set({ look: { color: $<HTMLInputElement>('color').value } });
for (const [id, key] of [['size', 'scale'], ['pace', 'hyperactivity'], ['volume', 'volume']] as const) $<HTMLInputElement>(id).oninput = () => set({ [key]: Number($<HTMLInputElement>(id).value) });
for (const key of ['windows', 'sound', 'sfx', 'dailyRhythm', 'moveWindows', 'knockCursor', 'mischief', 'screenAware', 'smacking', 'destructible'] as const) $<HTMLInputElement>(key).onchange = () => set({ [key]: $<HTMLInputElement>(key).checked });
$<HTMLInputElement>('tattoo').onchange=()=>set({look:{tattoo:$<HTMLInputElement>('tattoo').checked?'jt':'none'}});
$<HTMLSelectElement>('fightMode').onchange = () => set({ fightMode: $<HTMLSelectElement>('fightMode').value as PetConfig['fightMode'] });
for (const preset of CHARACTER_PRESETS) {
  const label = preset.personality[0].toUpperCase() + preset.personality.slice(1);
  $<HTMLSelectElement>('personalityChoice').add(new Option(label, preset.personality));
}
$<HTMLSelectElement>('personalityChoice').onchange = () => set({ personality: $<HTMLSelectElement>('personalityChoice').value as Personality });
$('customizeBuddy').onclick = () => { tab('buddies'); $('personalityChoice').focus(); };
const colorDrafts = new Map<number, Hsl & { hex: string }>();
function sliderControl(id: string, title: string, min: number, max: number, step: number, parent: HTMLElement, hint: string, change: (value: number) => void, format = (value: number) => String(value)) {
  const label = document.createElement('label'), input = document.createElement('input'), heading = document.createElement('span'), output = document.createElement('output');
  label.className = 'field slider-field'; input.type = 'range'; input.id = id; input.min = String(min); input.max = String(max); input.step = String(step); input.title = hint;
  output.setAttribute('for', id); output.id = id + '-value'; heading.className = 'slider-label'; heading.append(document.createTextNode(title), output);
  input.oninput = () => { output.value = format(Number(input.value)); change(Number(input.value)); };
  label.append(heading, input); parent.append(label); return input;
}
for (const [key, title, max, suffix] of [['h','Hue',359,'°'],['s','Saturation',100,'%'],['l','Lightness',100,'%']] as const) {
  sliderControl('color-'+key,title,0,max,1,$('colorSliders'),'Adjust the selected buddy’s colour',value=>{
    const current=colorDrafts.get(selected) ?? {...hexToHsl(configs[selected].look.color),hex:configs[selected].look.color};
    const next={...current,[key]:value};next.hex=hslToHex(next);colorDrafts.set(selected,next);
    set({look:{color:next.hex}});syncColor(next.hex);
  },v=>Math.round(v)+suffix);
}
$<HTMLInputElement>('colorCode').onchange = () => {
  const input=$<HTMLInputElement>('colorCode'), value=input.value.trim();
  if(!/^#[0-9a-f]{6}$/i.test(value)){input.setAttribute('aria-invalid','true');$('colorHelp').textContent='Use a six-digit colour code, such as #4450d6.';return;}
  input.removeAttribute('aria-invalid');$('colorHelp').textContent='Choose any colour. Changes save for this buddy.';set({look:{color:value.toLowerCase()}});
};
function syncColor(hex = configs[selected].look.color) {
  let value=colorDrafts.get(selected);
  if(!value || value.hex!==hex){const parsed=hexToHsl(hex);value={...parsed,h:parsed.s<0.01?(value?.h??parsed.h):parsed.h,hex};colorDrafts.set(selected,value);}
  if(document.activeElement!==$('colorCode')){$<HTMLInputElement>('colorCode').value=hex;$('colorCode').removeAttribute('aria-invalid');$('colorHelp').textContent='Choose any colour. Changes save for this buddy.';}
  for(const [key,suffix]of [['h','°'],['s','%'],['l','%']] as const){const input=$<HTMLInputElement>('color-'+key);if(document.activeElement!==input)input.value=String(Math.round(value[key]));$<HTMLOutputElement>('color-'+key+'-value').value=Math.round(value[key])+suffix;}
  $('color-s').style.background=`linear-gradient(90deg,hsl(${value.h} 0% 50%),hsl(${value.h} 100% 50%))`;
  $('color-l').style.background=`linear-gradient(90deg,#101410,hsl(${value.h} ${value.s}% 50%),#fff)`;
  $<HTMLInputElement>('color').value=hex;
}
const controlNames: Record<string,string> = {'look.pixel':'Pixel detail','body.stand':'Leg straightness','body.spread':'Stance width','body.stride':'Step length','body.bob':'Walking bounce'};
const formatRange=(key:string,value:number)=>key==='look.pixel'?(value===1?'Smooth':value+' px'):key==='look.lineWidth'?value+' px':Number(value.toFixed(2))+'×';
for(const [key,range]of Object.entries(RANGES).filter(([key])=>key.startsWith('body.')||key.startsWith('look.'))){
  const input=sliderControl('adjust-'+key.replace('.','-'),controlNames[key]??range.label,range.min,range.max,range.step,$(key.startsWith('body.')?'movementControls':'appearanceControls'),range.hint,value=>{
    const [group,field]=key.split('.') as ['body'|'look',string];set({[group]:{[field]:value}});
  },v=>formatRange(key,v));input.dataset.path=key;
}
shell.onConfig(() => updateFineTune());
function updateFineTune() {
  for(const input of document.querySelectorAll<HTMLInputElement>('[data-path]')){
    const [group,key]=input.dataset.path!.split('.');const values=configs[selected]?.[group as 'body'|'look'] as unknown as Record<string,number>;
    if(values){if(document.activeElement!==input)input.value=String(values[key]);$<HTMLOutputElement>(input.id+'-value').value=formatRange(input.dataset.path!,values[key]);}
  }
}
const chat = $<HTMLTextAreaElement>('chatText'), form = $<HTMLFormElement>('chatForm');
conversationKeys(chat, form);
form.onsubmit = event => { event.preventDefault(); if (chat.disabled || !chat.value.trim()) return; shell.command('hear:' + chat.value, selected); chat.value = ''; drafts.delete(selected); };
$('exportChat').onclick = () => exportConversation(stats.get(selected)?.brain.log ?? [], configs[selected].name);
$('newChat').onclick = () => { $('confirmReset').hidden = false; $('clearChat').focus(); };
$('keepChat').onclick = () => { $('confirmReset').hidden = true; $('newChat').focus(); };
$('clearChat').onclick = () => { shell.command('conversation:new', selected); $('confirmReset').hidden = true; chat.focus(); };
const activityButtons = new Map<string,{button:HTMLButtonElement;title:HTMLElement;small:HTMLElement}>();
function updateActivities(){
  const s=stats.get(selected),available=activeIds().includes(selected),snapshot=s?.activity;
  $('currentActivity').textContent=!available?'Resting away':session.paused?'Paused':session.hidden?'Hidden':snapshot?`${snapshot.current.label}${snapshot.current.reason?' · '+snapshot.current.reason:''}`:'Getting settled…';
  for(const [id,entry]of activityButtons){const choice=snapshot?.choices.find(c=>c.id===id);
    if(choice)entry.title.textContent=choice.label;
    const reason=!available?'Bring this buddy onto the desktop first.':session.paused?'Resume buddies to start.':session.hidden?'Show buddies to start.':choice?.needs;
    entry.button.disabled=!!reason||!choice;entry.small.textContent=reason??choice?.hint??'Waiting for buddy status…';
  }
}
for(const [id,label]of [['dance','Have a dance'],['read','Read a book'],['catch','Play catch'],['watchtv','Watch TV'],['doodle','Draw something'],['handheld','Play a pocket game'],['pong','Play Pong'],['duel','Friendly spar']]){
  const button=document.createElement('button'),title=document.createElement('span'),small=document.createElement('small');title.textContent=label;button.dataset.activity=id;button.append(title,small);
  button.onclick=async()=>{const target=selected;button.disabled=true;try{const result=await shell.requestActivity(target,id);if(selected===target)$('activityHelp').textContent=result.message;}catch{if(selected===target)$('activityHelp').textContent='The activity could not be requested. Try again once the desktop is ready.';}finally{updateActivities();}};
  activityButtons.set(id,{button,title,small});$('activityList').append(button);
}
$('bonusForm').onsubmit=async event=>{
  event.preventDefault();const button=$<HTMLButtonElement>('redeemCode');button.disabled=true;
  try{const result=await shell.redeemCode($<HTMLInputElement>('bonusCode').value);
    if(!result.ok){$('bonusStatus').textContent=result.message;return;}
    configs=result.configs;$<HTMLInputElement>('bonusCode').value='';$('bonusStatus').textContent=result.alreadyUnlocked?'Arnold is already in your roster.':'Arnold unlocked. His JT tattoo and saved life are his own.';
    $('bringArnold').hidden=false;render();
  }catch{$('bonusStatus').textContent='The code could not be saved. Your existing buddies are kept.';}
  finally{button.disabled=false;}
};
$('bringArnold').onclick=()=>{choose(ARNOLD_ID);tab('buddies');
  if(activeIds().includes(ARNOLD_ID))return;
  if(activeIds().length>=MAX_ACTIVE_FIGURES){$('rosterHelp').textContent='Put one buddy away, then tick Arnold to bring him out.';$('roster').scrollIntoView({block:'center'});return;}
  const next=[...activeIds(),ARNOLD_ID];shell.setConfig({figureCount:next.length,spawnOrder:[...new Set([...next,...configs.map((_,id)=>id)])]},0);
};
$('openActivities').onclick = () => shell.command('openActivities', selected);
$('stopActivity').onclick = () => shell.command('hear:stop', selected);
$('openBag').onclick = () => shell.command('openInventory', selected);
$('placeFurniture').onclick = () => shell.command('openSupplies', selected);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-supply]')) button.onclick = () => { if (activeIds().includes(selected)) shell.command('item:give:' + button.dataset.supply, selected); else { tab('buddies'); $('liveStatus').textContent = 'Bring this buddy onto the desktop first.'; } };
$('openItems').onclick = () => shell.openItemsFolder(); $('reloadItems').onclick = () => shell.reloadItems();
function showHealth(health: SaveHealth) { $('health').hidden = !health.issues.length; $('healthText').textContent = health.issues.map(i => i.message).join(' '); }
shell.onSaveHealth(showHealth); void shell.getSaveHealth().then(showHealth);
$('retrySave').onclick = () => shell.retrySaves();
function sessionView(value: SessionState) { session = value; $('pause').textContent = session.paused ? 'Resume buddies' : 'Pause buddies'; $('hide').textContent = session.hidden ? 'Show all buddies' : 'Hide all buddies'; updateActivities(); }
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
void shell.getConfigs().then(value => { configs = value; $('bringArnold').hidden=configs.length<=ARNOLD_ID; render(); updateFineTune(); shell.command('sync', selected); });
