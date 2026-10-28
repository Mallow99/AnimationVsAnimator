import { transcriptView, exportConversation, conversationKeys } from './conversation-view';
import {checkSanity} from "../core/sanity";
import { isWeapon } from '../core/combat/armament';
// The overlay page: sets up the canvas, runs the frame loop, feeds mouse input to the stick figures,
// and tells the desktop shell when clicks should pass through.
//
// Up to five preset stick figures share this overlay. They are equals:
// each has its own settings (its own settings window, in its own color), its own save, memory and AI
// brain, its own talk box. They share the furniture, the windows and your cursor. `pets[0]` runs and
// saves the furniture; the second one is on whenever the first one's settings say so.

import { Pet, friendConfig, DEFAULT_CONFIG, type PetConfig } from '../core/pet';
import type { Bounds } from '../core/physics';
import type { WinRect } from '../core/world';
import type { BrainRequest } from '../core/brain';
import { playBlip, playSfx } from './sfx';
import { createPongPanel } from './pong-panel';
import { createGamePanel } from './game-panel';
import {FileHabitats} from './file-habitats';
import {PageCutouts} from './page-cutouts';
import type {FileWindow,FileVisitStatus,DesktopAction,DesktopResult,DesktopState,PageCutout} from '../shared/desktop';
import { activitySnapshot, requestActivity } from './activity-requests';
import { companionConfig, activeFigureIds } from '../core/config';
import { CursorWeapon, type CursorWeaponKind } from '../core/combat/cursor-weapon';
import { SwordMove, MOVES, STANCES, guardPose } from '../core/skills/swordplay';
import { ToolBag } from './tool-bag';
import { placeSpeech } from '../core/speech-layout';
import { readLocalSave, writeLocalSave } from './local-storage';
import { COMMERCIAL, PRODUCT_NAME, productDefaults, offlineEdition, type SaveResult, type SaveHealth, type ProductState, type SessionState } from '../shared/product';

/** Provided by the Electron preload script. Missing in a plain browser (preview mode). */
interface PetShell {
  setClickThrough(ignore: boolean): void;
  getConfigs(): Promise<PetConfig[]>;
  onRoster?(cb: (configs: PetConfig[]) => void): void;
  onConfig(cb: (c: { id: number; config: PetConfig }) => void): void;
  sendStats(id: number, stats: unknown): void;
  reportSanity(issues:string[]):void;
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
  saveMemory(id: number, json: string): Promise<SaveResult> | void;
  getSaveHealth?(): Promise<SaveHealth>;
  retrySaves?(): void;
  onSaveHealth?(cb: (health: SaveHealth) => void): void;
  onSaveRequest?(cb: (token: number) => void): void;
  saved?(token: number, ok: boolean): void;
  productInfo?(): Promise<{ state: ProductState }>;
  productSetup?(patch: Partial<ProductState>): Promise<SaveResult>;
  onSession?(cb: (state: SessionState) => void): void;
  getSession?(): Promise<SessionState>;
  openSettings(id?: number, tab?: string): void;
  getItemDefs(): Promise<unknown[]>;
  onItemDefs(cb: (defs: unknown[]) => void): void;
  setTyping(on: boolean): void;
  desktopAction(id:number,action:DesktopAction):Promise<DesktopResult>;
  onLife?(cb:(sample:import('../core/life-rhythm').LifeSample)=>void):void;
  onDesktopState(cb:(state:DesktopState)=>void):void;
  onCutout(cb:(cutout:PageCutout)=>void):void;
  onFileWindows(cb:(windows:FileWindow[])=>void):void;
  onHabitat(cb:(visit:{id:number;path:string;kind?:'folder'|'file'})=>void):void;
  fileHomes(homes:FileVisitStatus[]):void;
}
const shell = (window as unknown as { petShell?: PetShell }).petShell;
const releaseDefaults = COMMERCIAL ? productDefaults(DEFAULT_CONFIG) : DEFAULT_CONFIG;
const localIssues = new Map<string, string>();
const blockedLocalSaves = new Set<string>();
let mainIssues: SaveHealth = { issues: [] };
let session: SessionState = { paused: false, hidden: false };
const saveNotice = document.createElement('aside');
saveNotice.id = 'saveNotice'; saveNotice.hidden = true; saveNotice.setAttribute('role', 'status');
saveNotice.style.cssText = 'position:fixed;z-index:100;top:12px;left:12px;right:12px;max-width:560px;padding:12px 16px;background:#fff4df;color:#483421;border:1px solid #aa6b37;border-radius:8px;font:14px/1.5 system-ui;box-shadow:0 4px 20px #0002';
const saveMessage = document.createElement('span'), retrySave = document.createElement('button');
retrySave.type = 'button'; retrySave.textContent = 'Retry saves'; retrySave.style.cssText = 'margin-left:12px;padding:6px 10px;cursor:pointer';
saveNotice.append(saveMessage, retrySave); document.body.append(saveNotice);
function showSaveHealth() {
  const messages = [...localIssues.values(), ...mainIssues.issues.map(i => i.message)];
  saveNotice.hidden = !messages.length;
  saveMessage.textContent = messages.length ? 'Changes need attention. ' + [...new Set(messages)].join(' ') : '';
}
function localResult(key: string, result: SaveResult) {
  if (result.ok) localIssues.delete(key); else localIssues.set(key, result.message);
  showSaveHealth(); return result.ok;
}
shell?.onSaveHealth?.(health => { mainIssues = health; showSaveHealth(); });
shell?.getSaveHealth?.().then(health => { mainIssues = health; showSaveHealth(); });

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function bounds(): Bounds {
  return { left: 0, right: window.innerWidth, top: 0, floor: window.innerHeight };
}

/** Stable figure pool: index is the save identity, independent of active roster order. */
const pets: Pet[] = [];
/** Stable save/config ids remain in the pool even when a character leaves the desktop. */
const figures: Pet[] = [];
const habitats = new FileHabitats((homes) => {
  shell?.fileHomes?.(homes);
  syncPeers();
  save();
}, wirePet);
const cutouts = new PageCutouts();
const desktopPets = () => pets.filter(p => !habitats.isAway(figures.indexOf(p)));
const activePets = () => [...desktopPets(), ...habitats.activePets];
const audit = () => checkSanity([...figures, ...habitats.allPets], activePets());
function returnFromVisit(id: number) {
  const visiting = habitats.petFor(id);
  if (!visiting) return;
  if (talkPet === visiting) closeTalk();
  if (toolBag.tools.held?.owner === visiting) toolBag.cancel();
  if (cursorWeapon.owner === visiting) equipCursor('none');
  visiting.closeMenu();
  habitats.returnHome(id);
  toolBag.refresh();
}
function syncPeers() {
  const active = desktopPets();
  for (const p of active) p.others = active.filter((o) => o !== p);
}
let restoredHabitats = false;
let desktopState: DesktopState = { browser: null };
Object.assign(window, { habitats, cutouts });
let lastWins: WinRect[] = [], lastDefs: unknown[] = [];
// Browser storage for their mood and things (works in Electron too); memories go in files on the desktop.
const saveKey = (id: number) => (id ? `pet-save-${id + 1}` : 'pet-save');
const memoryKey = (id: number) => (id ? `pet-memory-${id + 1}` : 'pet-memory');
const memoryLoaded: boolean[] = [];
const memoryLoads: Promise<unknown>[] = [];
let freshWorld = false;
try { freshWorld = localStorage.getItem(saveKey(0)) === null && localStorage.getItem(saveKey(0) + '.backup') === null; } catch { /* Reported by readLocalSave. */ }

/** Save one of them (mood, things, gallery) and their memories. */
async function saveOne(id: number): Promise<boolean> {
  const home=figures[id],p=habitats.petFor(id)??home;
  if (!p) return true;
  let ok = !blockedLocalSaves.has(saveKey(id));
  if (ok) try {
    const saved = JSON.parse(p.save()); if (id === 0) saved.props = home.props.savePlaced(); else delete saved.props;
    ok = localResult(saveKey(id), writeLocalSave(localStorage, saveKey(id), JSON.stringify(saved)));
  } catch { ok = localResult(saveKey(id), { ok: false, message: 'The current scene could not be saved. Your previous save is kept.' }); }
  if (!memoryLoaded[id] || blockedLocalSaves.has(memoryKey(id))) return false; // Never replace unread or damaged memories.
  const json = p.memory.save();
  if (shell) {
    try { const result = await shell.saveMemory(id, json); if (result) ok = localResult(memoryKey(id), result) && ok; }
    catch { ok = localResult(memoryKey(id), { ok: false, message: 'Memories could not be saved. Retry before quitting.' }); }
  } else ok = localResult(memoryKey(id), writeLocalSave(localStorage, memoryKey(id), json)) && ok;
  return ok;
}
const save = async () => {
  const results = await Promise.all(figures.map((_, id) => saveOne(id)));
  if (!COMMERCIAL) try { localStorage.setItem('file-homes', JSON.stringify(habitats.save())); } catch { /* Development-only visit state. */ }
  return results.every(Boolean) && !localIssues.size;
};
retrySave.onclick = () => { void save(); shell?.retrySaves?.(); };
shell?.onSaveRequest?.(token => { void Promise.allSettled(memoryLoads).then(() => save()).then(ok => shell.saved?.(token, ok), () => shell.saved?.(token, false)); });
setInterval(save, 15000);
window.addEventListener('beforeunload', () => { void save(); });

/** Bring one of them to life: load their save and memories, and wire them to the desktop. */
function makePet(id: number, config: PetConfig): Pet {
  const p = id === 0 ? new Pet(bounds(), config,{identity:'pet-0'}) : new Pet(bounds(), config, { props: figures[0].props,identity:`pet-${id}` });
  try {
    // (The second one used to be saved as "friend-save"/"friend-memory": pick those up once.)
    const loaded = readLocalSave(localStorage, saveKey(id));
    if (loaded.error) { blockedLocalSaves.add(saveKey(id)); localResult(saveKey(id), { ok: false, message: loaded.error }); }
    p.load(loaded.text ?? (id === 1 ? localStorage.getItem('friend-save') : null));
    if (!shell) {
      const memory = readLocalSave(localStorage, memoryKey(id));
      if (memory.error) { blockedLocalSaves.add(memoryKey(id)); localResult(memoryKey(id), { ok: false, message: memory.error }); }
      p.memory.load(memory.text ?? (id === 1 ? localStorage.getItem('friend-memory') : null));
    }
  } catch { localResult(saveKey(id), { ok: false, message: 'Local saves are unavailable. Changes remain in this session only.' }); }
  memoryLoaded[id] = !shell;
  const memoryLoad = shell?.loadMemory(id).then((json) => {
    if (json === null && id === 1) { try { json = localStorage.getItem('friend-memory'); } catch { /* ignore */ } }
    const current=habitats.petFor(id)??p; current.memory.load(json); memoryLoaded[id] = true; current.onCollections?.();
  }, () => { localResult(memoryKey(id), { ok: false, message: 'Saved memories need recovery. The original file has been kept.' }); });
  if (memoryLoad) memoryLoads.push(memoryLoad);
  wirePet(id, p);
  return p;
}
/** Both desktop and visiting bodies receive the same input/save callbacks. */
function wirePet(id: number, p: Pet) {
  let memTimer: ReturnType<typeof setTimeout> | undefined;
  p.onMemorySave = () => { clearTimeout(memTimer); memTimer = setTimeout(() => saveOne(id), 1000); };
  p.setWindows(lastWins);
  if (lastDefs.length) p.addDefs(lastDefs);
  // Voices: the second one a little lower, so you can tell who's talking.
  p.onBlip = (pitch) => playBlip(pitch * (id ? 0.85 : 1), p.config.volume);
  p.onSound = (name, strength) => playSfx(name, strength, p.config.volume, (id ? 0.75 : 0.8) + p.mood.s.happiness * 0.4);
  p.onTalk = () => openTalk(p);
  p.onSatchel = () => { closeTalk(); toolBag.showFor(p); };
  p.onSupplies = () => toolBag.showFor(p, 'supplies');
  p.onActivities = () => toolBag.showFor(p, 'activities');
  p.onTrash = object => toolBag.trashObject(p, object);
  p.onTake = item => toolBag.takeItem(p, item);
  p.onStore = item => toolBag.storeItem(p, item);
  if (shell) {
    p.onDesktopAction=async action=>{const result=await shell.desktopAction(id,action);if(result.ok && action==='restorepage')cutouts.clear();return result;};
    p.desktopState=desktopState;
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
}

/** Apply a selected roster without reassigning identity, possessions or save slots. */
function applyConfigs(configs: PetConfig[]) {
  if (COMMERCIAL) configs = configs.map(offlineEdition);
  const ids = activeFigureIds(configs[0],configs.map((_,id)=>id)), previous = new Set(pets);
  const time = Math.max(0,...figures.map(p=>p.ctx.world.time));
  for (let id=0;id<configs.length;id++) {
    if (!figures[id]) figures[id]=makePet(id,configs[id] ?? companionConfig(configs[0],id));
    else figures[id].applyConfig(configs[id] ?? companionConfig(configs[0],id));
  }
  const next=ids.map(id=>figures[id]);
  for (const p of figures) if (!next.includes(p)) {
    const id=figures.indexOf(p); returnFromVisit(id);
    if (talkPet===p) closeTalk();
    if (toolBag.tools.held?.owner===p) toolBag.cancel();
    if(cursorWeapon.owner===p)equipCursor("none");
    p.leaveWorld(); p.others=[]; saveOne(id);
  }
  for(const p of figures)p.ownsProps=false;
  next[0].ownsProps=true;
  for(const [i,p]of next.entries()) {
    p.ctx.world.time=time;
    if(!previous.has(p)) {
      p.enterWorld();
      p.char.standUp(); p.char.placeHome((innerWidth*(i+1))/(next.length+1));
    }
  }
  pets.splice(0,pets.length,...next);
  habitats.sync(figures);
  for(let id=0;id<figures.length;id++)if(!configs[0].fileHomes || !ids.includes(id))returnFromVisit(id);
  if (!restoredHabitats) {
    restoredHabitats=true;
    if(configs[0].fileHomes)try{habitats.restore(JSON.parse(localStorage.getItem('file-homes')??'null'),figures,ids);}catch{}
  }
  syncPeers();
  void save();
  void prepareWelcomeScene();
}

const configs: PetConfig[] = Array.from({length:5},(_,id)=>companionConfig(releaseDefaults,id));
figures[0] = makePet(0, configs[0]);
pets[0] = figures[0];

const setWindowsAll = (wins: WinRect[]) => { lastWins = wins; for (const p of figures) p.setWindows(wins); };

// Settings live in the desktop shell (pet.json, pet-2.json). Get them now, and whenever they change.
if (shell) {
  shell.getConfigs().then((cs) => { cs.forEach((c, i) => (configs[i] = c)); applyConfigs(configs); });
  shell.onRoster?.(cs=>{configs.splice(0,configs.length,...cs);applyConfigs(configs);});
  shell.onConfig(({ id, config }) => { configs[id] = config; applyConfigs(configs); });
  shell.onCommand(({id,cmd}) => {
    if (cmd === 'sanity') { shell.reportSanity(audit()); return; }
    if (cmd === 'openInventory:all') {
      for (const [i] of figures.entries()) {
        const visiting = habitats.petFor(i);
        if (visiting && !habitats.activePets.includes(visiting)) returnFromVisit(i);
      }
      toolBag.showAll(); return;
    }
    if (cmd === 'openInventory') {
      const visiting = habitats.petFor(id);
      if (visiting && !habitats.activePets.includes(visiting)) returnFromVisit(id);
      const p = activePets().find(p => p.ctx.who === figures[id]?.ctx.who) ?? activePets()[0];
      if (p) toolBag.showFor(p);
      return;
    }
    if (cmd === 'openActivities' || cmd === 'openSupplies') {
      const p = figures[id]; if (p && pets.includes(p)) toolBag.showFor(p, cmd === 'openActivities' ? 'activities' : 'supplies');
      return;
    }
    if (cmd === 'returnHome') { returnFromVisit(id); return; }
    (habitats.petFor(id) ?? figures[id])?.command(cmd);
  });
  shell.onLife?.(sample => {for(const p of activePets())p.life(sample);});
  shell.onDesktopState?.(state=>{desktopState=state;for(const p of [...pets,...habitats.activePets])p.desktopState=state;});
  shell.onCutout?.(cutout=>cutouts.add(cutout));
  shell.onFileWindows?.(files=>{
    habitats.refresh(files);
    if (talkPet && !activePets().includes(talkPet)) closeTalk();
    const owner = toolBag.tools.held?.owner;
    if (owner && !activePets().includes(owner)) toolBag.cancel();
    if (cursorWeapon.owner && !activePets().includes(cursorWeapon.owner)) equipCursor('none');
  });
  shell.onHabitat?.(({id,path,kind})=>{if(figures[id] && pets.includes(figures[id])) {
    closeTalk(); toolBag.cancel(); toolBag.close();
    if (cursorWeapon.owner?.ctx.who === figures[id].ctx.who) equipCursor('none');
    returnFromVisit(id);
    habitats.enter(id,figures[id],path,kind);
  }});
  shell.onWindows((wins) => setWindowsAll(wins)); // other apps' windows become platforms
  shell.onUi((ui) => { for (const p of pets) p.setScreen(ui); }); // what you're doing: they comment on it, and sit on things in your window
  shell.onWindowsLog((line) => { if (line.startsWith('move:')) for (const p of pets) p.moveNote = line.slice(5).trim(); }); // how moving windows is going
  setInterval(() => figures.forEach((p, id) => shell.sendStats(id,{...(habitats.petFor(id)??p).stats(),activity:activitySnapshot(habitats.petFor(id)??p)})), 400);
  // Item definition files (yours, from the items folder) on top of the ones they come with.
  shell.getItemDefs().then((d) => { lastDefs = d; for (const p of [...figures,...habitats.allPets]) p.addDefs(d); }, () => {});
  shell.onItemDefs((d) => { lastDefs = d; for (const p of [...figures,...habitats.allPets]) p.addDefs(d); });
}
Object.defineProperty(window,'pet',{get:()=>pets[0]}); // handy for poking at from DevTools
Object.defineProperty(window, 'friend', { get: () => pets[1] ?? null }); // the second one, the same way
Object.defineProperty(window, 'pets', { get: () => pets });
Object.assign(window,{requestBuddyActivity:(id:number,command:string)=>{const p=pets.find(p=>p===figures[id]);return p?requestActivity(p,command):{accepted:false,message:'Bring this buddy onto the desktop first.'};},setRoster:(ids:number[])=>{const order=[...ids,...configs.map((_,id)=>id).filter(id=>!ids.includes(id))];for(const c of configs){c.spawnOrder=order;c.figureCount=ids.length;c.friend.on=ids.length>1;}applyConfigs(configs);},figurePool:figures});
(window as unknown as { swordplay: unknown }).swordplay = { SwordMove, MOVES, STANCES, guardPose }; // for trying sword moves from DevTools

if (!shell) {
  document.body.classList.add('preview');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = COMMERCIAL ? `${PRODUCT_NAME} · Browser preview · double-click to talk · right-click for activities` : 'Preview mode — click to poke, drag to pick up, fling to throw. Press S to toggle smack mode.';
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
  for (const p of figures) p.setBounds(bounds());
}
window.addEventListener('resize', resize);
resize();

// ── talking to them right on the desktop ──
// Double-click one (or pick "Talk" from their right-click menu): a little text box pops up over their head,
// in their color. Whatever you type goes to that one.
const talk = document.getElementById('talk') as HTMLFormElement;
const talkText = document.getElementById('talkText') as HTMLTextAreaElement;
const talkDrafts = new Map<string, string>();
const renderTalkLog = transcriptView(document.getElementById('talkLog')!);
let talkLogVersion = -1;
conversationKeys(talkText, talk);
document.getElementById('talkExport')!.onclick = () => exportConversation(talkPet.brain.log, talkPet.config.name);
let talkOpen = false, gameTyping = false, toolsTyping = false;
let talkPet: Pet = pets[0];
let typingSent = false;
const syncTyping = () => {
  const on = talkOpen || gameTyping || toolsTyping || pongTyping;
  if (on === typingSent) return;
  typingSent = on; shell?.setTyping(on);
};
function openTalk(p: Pet = talkPet) {
  if (talkOpen) { talkDrafts.set(talkPet.ctx.who, talkText.value); talkPet.listening = false; }
  talkPet = p;
  talkText.value = talkDrafts.get(p.ctx.who) ?? "";
  document.getElementById("talkTitle")!.textContent = `Talk to ${p.config.name}`;
  renderTalkLog(p.brain.log, p.config.name, p.ctx.who);
  talkLogVersion = p.brain.conversationVersion;
  talkOpen = true;
  talk.classList.add('open');
  talk.style.setProperty('--ink', p.config.look.color);
  talkText.placeholder = `say something to ${p.config.name}…`;
  syncTyping(); // the desktop window has to accept typing for a moment
  p.listening = true;
  placeTalk();
  setTimeout(() => talkText.focus(), 30);
}
function closeTalk() {
  if (!talkOpen) return;
  talkDrafts.set(talkPet.ctx.who, talkText.value);
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
  talkText.value = ''; talkDrafts.delete(talkPet.ctx.who); talkText.focus();
});
talk.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeTalk(); } });
document.getElementById('talkClose')!.addEventListener('click', closeTalk);
const overTalk = (x: number, y: number) => {
  if (!talkOpen) return false;
  const r = talk.getBoundingClientRect();
  return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 12;
};
// The Othello window belongs to whichever of them invited you (the first one, if neither has).
const gamePet = () => pets.find((p) => p.game.state !== 'closed') ?? pets[0];
let pongTyping = false;
const pongPanel = createPongPanel(desktopPets, on => { pongTyping = on; syncTyping(); });
const gamePanel = createGamePanel(gamePet, (on) => { gameTyping = on; syncTyping(); }, () => openTalk(gamePet()));

// ── click-through ──
// The window ignores the mouse (clicks fall through to your desktop) except while the cursor is over one
// of them, their menu or the talk box, you're dragging one, or you're carrying one of their things.
let ignoring = true;
const onPet = (p: Pet, x: number, y: number) => p.dragging || p.hit(x, y) || p.satchelHit(x, y) || p.uiHit(x, y) || p.carrying;
function updateClickThrough(x: number, y: number) {
  const notice = saveNotice.getBoundingClientRect();
  const overNotice = !saveNotice.hidden && x >= notice.left && x <= notice.right && y >= notice.top && y <= notice.bottom;
  const want = session.paused || session.hidden ? true : !cursorWeapon.active && !(overNotice || toolBag.dragging || toolBag.over(x, y) || gamePanel.dragging || pongPanel.over(x,y) || overTalk(x, y) || gamePanel.over(x, y) || !!cutouts.hit(x,y) || !!habitats.hit(x,y,lastWins) || activePets().some((p) => p.dragging) || desktopPets().some((p) => onPet(p, x, y)));
  if (want !== ignoring) {
    ignoring = want;
    shell?.setClickThrough(want);
    canvas.style.cursor = want ? 'default' : 'grab';
  }
}

const cursorWeapon = new CursorWeapon();
const weaponBar = document.createElement('div');
weaponBar.id = 'weaponBar';
weaponBar.style.cssText =
  'position:fixed;right:12px;top:12px;display:none;gap:5px;padding:8px;background:#f4efe5;color:#343c3b;font:12px monospace;border:2px solid #8e806d;max-width:calc(100vw - 24px);box-sizing:border-box;flex-wrap:wrap;z-index:26';
for (const kind of ['none', 'sword', 'mace', 'gun', 'bow'] as CursorWeaponKind[]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = kind === 'none' ? 'Put away' : kind;
  button.onclick = () => {
    equipCursor(kind);
    updateClickThrough(last.x, last.y);
  };
  weaponBar.append(button);
}
const carryWeapon = document.createElement('button');
carryWeapon.textContent = 'Carry';
carryWeapon.onclick = () => {
  const item = cursorWeapon.item, owner = cursorWeapon.owner;
  if (!item || !owner) return;
  cursorWeapon.detach(); weaponBar.style.display = 'none';
  toolBag.takeItem(owner, item); updateClickThrough(last.x, last.y);
};
const dropWeapon = document.createElement('button');
dropWeapon.textContent = 'Drop';
dropWeapon.onclick = () => {
  const item = cursorWeapon.item, owner = cursorWeapon.owner;
  if (!item || !owner) return;
  cursorWeapon.detach(); owner.items.drop(item, 0, 0);
  weaponBar.style.display = 'none'; save(); updateClickThrough(last.x, last.y);
};
const reloadWeapon = document.createElement('button');
reloadWeapon.textContent = 'Reload';
reloadWeapon.onclick = () => cursorWeapon.reload();
weaponBar.append(carryWeapon, dropWeapon, reloadWeapon);
const weaponHint = document.createElement('span');
weaponHint.style.cssText = 'max-width:260px;align-self:center;font-size:12px';
weaponBar.append(weaponHint);
document.body.append(weaponBar);
function equipCursor(kind: CursorWeaponKind) {
  if (!['none', 'sword', 'mace', 'gun', 'bow'].includes(kind)) return;
  const held = cursorWeapon.item, owner = cursorWeapon.owner;
  if (owner && held) owner.giveBack(held);
  cursorWeapon.equip(kind);
  weaponBar.style.display = kind === 'none' ? 'none' : 'flex';
  closeTalk();
  updateClickThrough(last.x, last.y);
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') equipCursor('none');
  if ((e.key === 'r' || e.key === 'R') && !(e.target as Element).closest('input, textarea, [contenteditable]') && cursorWeapon.active) { cursorWeapon.reload(); e.preventDefault(); }
});
if (shell)
  shell.onCommand(({ cmd }) => {
    if (cmd.startsWith('cursorWeapon:'))
      equipCursor(cmd.split(':')[1] as CursorWeaponKind);
  });
Object.assign(window, { cursorWeapon, equipCursor });
// ── mouse ──
let last = { x: 0, y: 0, t: performance.now() };
let vel = { x: 0, y: 0 };
const toolBag = new ToolBag(activePets, save, on => { toolsTyping = on; syncTyping(); }, () => !cursorWeapon.active);
Object.assign(window, { toolBag, checkSanity:()=>audit() });
Object.assign(window, { exportBackupSnapshot: async () => {
  await Promise.allSettled(memoryLoads);
  if (blockedLocalSaves.size || figures.some((_, id) => !memoryLoaded[id])) throw new Error('Recover unread saves before exporting.');
  return {
    worlds: figures.map((p, id) => { const value = JSON.parse(p.save()); if (id === 0) value.props = figures[0].props.savePlaced(); else delete value.props; return value; }),
    memories: figures.map(p => JSON.parse(p.memory.save())),
  };
} });
let welcomePrepared = false;
async function prepareWelcomeScene() {
  if (!COMMERCIAL || welcomePrepared || !pets.length) return;
  welcomePrepared = true;
  try {
    const info = await shell?.productInfo?.();
    if (freshWorld && !info?.state.sceneReady) {
      const first = pets[0], floor = bounds().floor, width = bounds().right;
      for (const p of pets) { p.items.give('book', p.char); p.items.give('bouncy-ball', p.char); }
      for (const [id, fraction] of [['couch', 0.42], ['tv', 0.68], ['lamp', 0.25]] as const) {
        const def = first.props.defs.get(id);
        if (def?.bounds) first.props.spawn(id, width * fraction, floor - (def.bounds[3] - def.bounds[1]) / 2 - 2, 1);
      }
      first.command('say:hello! make yourself at home.');
    }
    await Promise.allSettled(memoryLoads);
    if (await save()) await shell?.productSetup?.({ sceneReady: true });
  } catch { localResult('welcome', { ok: false, message: 'The starter scene could not be saved. Retry before quitting.' }); }
}
const applySession = (state: SessionState) => {
  session = state;
  if (state.paused || state.hidden) {
    closeTalk(); toolBag.cancel(); toolBag.close(); equipCursor('none'); cutouts.release();
    for (const p of activePets()) { p.closeMenu(); p.pointerUp(last.x, last.y); }
    shell?.setClickThrough(true); shell?.setTyping(false);
  }
};
shell?.onSession?.(applySession);
shell?.getSession?.().then(applySession);
window.addEventListener('mousemove', (e) => {
  lastPointerAt = performance.now();
  const now = performance.now();
  const dt = Math.max((now - last.t) / 1000, 1 / 240);
  // Smoothed mouse velocity, used when you throw one of them.
  vel.x += ((e.clientX - last.x) / dt - vel.x) * 0.5;
  vel.y += ((e.clientY - last.y) / dt - vel.y) * 0.5;
  last = { x: e.clientX, y: e.clientY, t: now };
  if (session.paused || session.hidden) { vel.x = vel.y = 0; return; }
  cursorWeapon.pointer(e.clientX,e.clientY);
  cutouts.move(e.clientX,e.clientY,vel.x,vel.y);
  for (const p of activePets()) { p.cursor(e.clientX, e.clientY, vel.x, vel.y); p.pointerMove(e.clientX, e.clientY, vel.x, vel.y, now); }
  toolBag.move(e.clientX, e.clientY, vel.x, vel.y);
  updateClickThrough(e.clientX, e.clientY);
});
/** Which of them the mouse is on (the one drawn on top first), or null. */
const petAt = (x: number, y: number) => {
  const figures=[...desktopPets()].reverse();
  // Shared furniture must not steal a click from the figure drawn in front of it.
  return habitats.hit(x,y,lastWins) ?? figures.find(p=>p.char.hitTest(x,y)!==null ||
    p.char.hitLimb(x,y)!==null || p.satchelHit(x,y) || p.uiHit(x,y) ||
    p.items.onHim.some(i=>i.where==='hand'&&i.distTo(x,y)<8)) ??
    figures.find(p=>p.hit(x,y)||p.carrying) ?? null;
};
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (session.paused || session.hidden) return;
  if (toolBag.dragging) { toolBag.cancel(); updateClickThrough(e.clientX, e.clientY); return; }
  if (gamePanel.over(e.clientX, e.clientY)) return;
  toolBag.close();
  if (cursorWeapon.owner && cursorWeapon.item) {
    const owner = cursorWeapon.owner, item = cursorWeapon.item;
    cursorWeapon.detach();
    const recipient = [...desktopPets()].find(p => p.char.hitTest(e.clientX, e.clientY, 12));
    if (recipient && recipient !== owner) { owner.items.remove(item); recipient.items.list.push(item); recipient.giveBack(item); }
    else if (recipient) owner.giveBack(item);
    else owner.items.drop(item, vel.x, vel.y);
    weaponBar.style.display = 'none'; updateClickThrough(e.clientX, e.clientY); return;
  }
  const who = petAt(e.clientX, e.clientY) ?? pets[0];
  if (who.contextMenu(e.clientX, e.clientY)) shell?.pressed();
  updateClickThrough(e.clientX, e.clientY);
});
window.addEventListener('mousedown', (e) => {
  if (session.paused || session.hidden || saveNotice.contains(e.target as Node)) return;
  if (e.button !== 0) return;
  if((e.target as Element).closest('#weaponBar'))return;
  if (toolBag.over(e.clientX, e.clientY)) return;
  if (toolBag.dragging) { shell?.pressed(); return; }
  if(cursorWeapon.active){cursorWeapon.pointer(e.clientX,e.clientY);cursorWeapon.press(true);shell?.pressed();return;}
  if (pongPanel.over(e.clientX,e.clientY) || overTalk(e.clientX, e.clientY) || gamePanel.over(e.clientX, e.clientY)) return;
  if(cutouts.grab(e.clientX,e.clientY)){shell?.pressed();return;}
  if (talkOpen && !talkPet.hit(e.clientX, e.clientY)) closeTalk(); // clicked away: done talking
  // Open menus get first refusal, even where a row overlaps a satchel or held tool.
  const menu = [...desktopPets()].reverse().find(p => p.menuOpen);
  if (menu) { menu.pointerDown(e.clientX, e.clientY, performance.now()); updateClickThrough(e.clientX, e.clientY); return; }
  if (toolBag.isOpen) toolBag.close();
  const satchel = [...desktopPets()].reverse().find(p => p.satchelHit(e.clientX, e.clientY));
  if (satchel) { toolBag.showFor(satchel); updateClickThrough(e.clientX, e.clientY); return; }
  for (const p of [...desktopPets()].reverse()) {
    const item = p.items.onHim.find(i => i.where === 'hand' && i.distTo(e.clientX, e.clientY) < 5);
    if (item && toolBag.tools.beginItem(p, item, { x: e.clientX, y: e.clientY })) return;
  }
  // Whoever you clicked right on; otherwise the first one (and the furniture), then the other one's things.
  const now = performance.now(), who = petAt(e.clientX, e.clientY);
  // Items have one owner even when furniture and several figures overlap their hitboxes.
  for (const p of [...desktopPets()].reverse()) {
    const item = p.items.hitWorld(e.clientX, e.clientY);
    if (item && toolBag.tools.beginItem(p, item, { x: e.clientX, y: e.clientY })) { shell?.pressed(); return; }
  }
  const took = who ? who.pointerDown(e.clientX, e.clientY, now) : desktopPets().some((p) => p.pointerDown(e.clientX, e.clientY, now));
  if (took) {
    canvas.style.cursor = 'grabbing';
    shell?.pressed();
  }
});
window.addEventListener('mouseup', (e) => {
  if (session.paused || session.hidden) return;
  if (e.button !== 0) return;
  if (toolBag.release(e.clientX, e.clientY, vel.x, vel.y)) { shell?.pressed(); updateClickThrough(e.clientX, e.clientY); return; }
  if (toolBag.overTrash(e.clientX, e.clientY)) {
    // End a weapon controller before inventory removes its actual item.
    if (cursorWeapon.owner) { cursorWeapon.detach(); weaponBar.style.display = 'none'; }
    if (toolBag.tools.trashHeld()) toolBag.trashed();
  } else if (!cursorWeapon.active) {
    const owner = desktopPets().find(p => p.items.carried);
    const recipient = [...desktopPets()].reverse().find(p => p.char.hitTest(e.clientX, e.clientY, 12));
    if (owner?.items.carried && recipient && recipient !== owner) {
      const item = owner.items.carried; owner.items.remove(item); recipient.items.list.push(item); recipient.giveBack(item);
    }
  }
  cursorWeapon.press(false);cutouts.release();
  if (activePets().some((p) => p.dragging)) shell?.pressed(); // hand focus back once more after letting go
  for (const p of activePets()) if (!p.userWeaponControlled) p.pointerUp(e.clientX, e.clientY);
  updateClickThrough(e.clientX, e.clientY);
});
// If the mouse leaves the window mid-drag, let go.
window.addEventListener('blur', () => { toolBag.cancel(); cursorWeapon.cancel();cutouts.release(); for (const p of activePets()) if (!p.userWeaponControlled) p.pointerUp(last.x, last.y); });

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
let propAccumulator=0,propTime=0;
let lastPointerAt = performance.now();
let toolsRefreshAt = 0;
function frame(now: number) {
  const dt = (now - prev) / 1000;
  prev = now;
  if (session.paused || session.hidden) { requestAnimationFrame(frame); return; }
  // The mouse may sit still while held; decay its velocity so nobody gets "thrown" on release.
  if (now - last.t > 50) {
    vel.x *= 0.8;
    vel.y *= 0.8;
    for (const p of activePets())
      p.pointerMove(last.x, last.y, vel.x, vel.y, now);
    toolBag.move(last.x, last.y, vel.x, vel.y);
  }
  // A knockout: everyone in slow motion for a moment.
  const slow = activePets().some((p) => p.slowmo > 0);
  for (const p of desktopPets()) {
    p.slowmo = Math.max(0, p.slowmo - Math.min(dt, 0.1));
    p.update(slow ? dt * 0.3 : dt);
  }
  if (!desktopPets().some(p=>p.ownsProps)) {
    propAccumulator += Math.min(0.05, Math.max(0, dt));
    propTime += Math.min(0.05, Math.max(0, dt));
    while (propAccumulator >= 1 / 120) {
      pets[0].props.update(
        1 / 120,
        propTime,
        bounds(),
        pets[0].ctx.world.platforms.filter((p) => p.id < 1_000_000_000),
        lastWins,
      );
      propAccumulator -= 1 / 120;
    }
  }
  habitats.update(slow ? dt * 0.3 : dt);
  if (now > toolsRefreshAt) { if(!shell)for(const p of activePets())p.life({hour:new Date().getHours(),idleSeconds:(now-lastPointerAt)/1000}); toolBag.refresh(); toolsRefreshAt = now + 1000; }
  if (cursorWeapon.owner && cursorWeapon.item && (!cursorWeapon.owner.items.list.includes(cursorWeapon.item) || cursorWeapon.item.where !== 'cursor')) {
    cursorWeapon.detach(); weaponBar.style.display = 'none';
  }
  const owner = desktopPets().find(p => p.userWeaponControlled && p.items.carried?.cursorControlled && isWeapon(p.items.carried.def));
  if (!toolBag.dragging && owner && owner.items.carried && cursorWeapon.item !== owner.items.carried) {
    cursorWeapon.attach(owner.items.carried, owner);
    weaponBar.style.display = 'flex'; updateClickThrough(last.x, last.y);
  }
  cursorWeapon.update(dt, desktopPets());
  for (const button of Array.from(weaponBar.querySelectorAll('button')).slice(1,5)) button.hidden = !!cursorWeapon.owner;
  carryWeapon.hidden = dropWeapon.hidden = !cursorWeapon.owner;
  reloadWeapon.hidden = cursorWeapon.kind !== 'gun';
  reloadWeapon.disabled = !!cursorWeapon.item?.reloadRemaining || cursorWeapon.item?.ammo === 6;
  const hint = cursorWeapon.item?.def.use === 'gun' ? 'Hold and drag to aim/fire · Reload button' : cursorWeapon.item?.def.use === 'shoot' ? 'Hold and drag to aim · release to shoot' : 'Hold and swipe to swing';
  weaponHint.textContent = `${cursorWeapon.status} · ${hint}`;
  weaponBar.title = `${cursorWeapon.status} · ${hint} · right-click to drop or hand back · Esc to return`;
  weaponBar.setAttribute('aria-label', weaponBar.title);
  cutouts.update(
    dt,
    bounds(),
    figures.map((p, id) => (!pets.includes(p) || habitats.isAway(id) ? undefined : p)) as Pet[],
  );
  gamePanel.update(); pongPanel.update();
  toolBag.hover(!cursorWeapon.active && !talkOpen && !toolBag.over(last.x, last.y) ? [...desktopPets()].reverse().find(p => p.char.hitTest(last.x, last.y, 8) || p.satchelHit(last.x, last.y)) ?? null : null, now);
  updateClickThrough(last.x, last.y);
  if (talkOpen) {
    placeTalk();
    if (talkLogVersion !== talkPet.brain.conversationVersion) {
      renderTalkLog(talkPet.brain.log, talkPet.config.name, talkPet.ctx.who);
      talkLogVersion = talkPet.brain.conversationVersion;
    }
    document.getElementById("talkStatus")!.textContent = talkPet.brain.status || (talkPet.brain.active ? "AI mode · local fallback available" : "Local conversation · no key needed");
  }
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (fakeWins.length && pets[0]?.config.windows) drawFakeWindows();
  // Furniture first (behind both of them), then whoever's nearer to you in front (a dash passes in front of the other one).
  pets[0]?.drawProps(ctx);
  toolBag.drawPlacement(ctx);
  for (const p of [...desktopPets()].sort(
    (a, b) => a.char.body.j.hip.z - b.char.body.j.hip.z,
  ))
    p.draw(ctx, false);
  const speakers = desktopPets().filter(p => p.speaking);
  const rectangles = placeSpeech(speakers.map(p => p.speechRect(ctx)!), window.innerWidth, window.innerHeight);
  if (!desktopPets().some(p => p.menuOpen)) speakers.forEach((p, i) => p.drawSpeech(ctx, rectangles[i]));
  habitats.draw(ctx, lastWins);
  cutouts.draw(ctx);
  cursorWeapon.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
