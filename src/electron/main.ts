// The desktop shell (macOS + Windows).
//  - One transparent, frameless, always-on-top, click-through window over the main screen (the figures live here).
//  - A menu-bar / tray icon with quick toggles.
//  - A settings window for each stick figure, in its color.
//  - Their settings: pet.json (first preset) and pet-2.json (the second one), in the app's data folder, shared
//    with every window. A few settings are about the app, not one of them (climbing windows, the AI
//    service, fights...): those are kept the same in both.

import { app, powerMonitor, BrowserWindow, ipcMain, Menu, screen, shell, Tray, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, friendConfig, companionConfig, activeFigureIds, mergeConfig, PROVIDERS, type PetConfig, type ProviderId } from '../core/config';
import type { WinRect } from '../core/world';
import { watchWindows, type UiReport, type WindowWatcher } from './windows';
import * as llm from './llm';
import type { BrainRequest } from '../core/brain';
import { writeAtomic, readStoredJson } from './storage';
import { COMMERCIAL, PRODUCT_NAME, PRODUCT_VERSION, LEGACY_DATA_NAME, productDefaults, offlineEdition, type SaveHealth, type SaveResult, type ProductState, type SessionState } from '../shared/product';
import { unchangedExample } from './builtin-files';
import {DesktopBridge} from './desktop-bridge';
import {watchFileWindows} from './file-windows';
import { FileDocuments } from './file-documents';
import type {FileWindow,DesktopAction,DesktopState,FileVisitStatus} from '../shared/desktop';
import builtinHistory from '../../assets/builtin-history.json';

if (COMMERCIAL) {
  app.setPath('userData', process.env.PET_DATA_DIR || path.join(app.getPath('appData'), LEGACY_DATA_NAME));
  app.setName(PRODUCT_NAME);
  app.setAboutPanelOptions({ applicationName: PRODUCT_NAME, applicationVersion: PRODUCT_VERSION });
}
const editionConfig = (c: PetConfig) => COMMERCIAL ? offlineEdition(c) : c;
const editionDefaults = COMMERCIAL ? productDefaults(DEFAULT_CONFIG) : DEFAULT_CONFIG;
const saveIssues = new Map<string, string>();
const recoveredSaves = new Set<string>();
const saveHealth = (): SaveHealth => ({ issues: [...saveIssues].map(([key, message]) => ({ key, message })) });
function saved(key: string, result: SaveResult): SaveResult {
  if (result.ok) saveIssues.delete(key); else saveIssues.set(key, result.message);
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('save:status', saveHealth());
  return result;
}
function readSave(file: string, key: string): string | null {
  try {
    const loaded = readStoredJson(file);
    if (loaded.recovered) recoveredSaves.add(key);
    saved(key, { ok: true });
    return loaded.text;
  } catch (error) {
    saved(key, { ok: false, message: (error as Error).message });
    throw error;
  }
}
let session: SessionState = { paused: false, hidden: false };
function setSession(patch: Partial<SessionState>) {
  session = { ...session, ...patch };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('session:changed', session);
  if (session.hidden) win?.hide(); else win?.showInactive();
  if (session.paused || session.hidden) watcher?.setKeyboard(false);
  buildTrayMenu();
}
const productStatePath = () => path.join(app.getPath('userData'), 'product-state.json');
let productState: ProductState = { introDone: false, sceneReady: false };
let pendingProductState: ProductState | null = null;
function saveProductState(patch: Partial<ProductState>): SaveResult {
  const next = { ...productState };
  if (typeof patch.introDone === 'boolean') next.introDone = patch.introDone;
  if (typeof patch.sceneReady === 'boolean') next.sceneReady = patch.sceneReady;
  pendingProductState = next;
  try { writeAtomic(productStatePath(), JSON.stringify(next)); productState = next; pendingProductState = null; return saved('setup', { ok: true }); }
  catch { return saved('setup', { ok: false, message: 'The welcome setup could not be saved. Free some disk space and retry.' }); }
}

let win: BrowserWindow | null = null;
/** A settings window per stick figure (by id). */
const settingsWins = new Map<number, BrowserWindow>();
let tray: Tray | null = null;
const preload = path.join(__dirname, 'preload.js');
let watcher: WindowWatcher | null = null;
let lastWins: WinRect[] = [];
let desktop:DesktopBridge|null=null;
let desktopError='';
let fileWatcher:ReturnType<typeof watchFileWindows>|null=null;
let folderWindows:FileWindow[]=[];
const documents = new FileDocuments();
let fileNote = '';
let documentNote = '';
let homes: FileVisitStatus[] = [];

// ───────────── settings files ─────────────

const configPath = (id: number) => path.join(app.getPath('userData'), id ? `pet-${id + 1}.json` : 'pet.json');
/** Their settings, by id. `config` is the first one's (the app-wide settings are the same in both). */
const configs: PetConfig[] = Array.from({length:5},(_,id)=>companionConfig(editionDefaults,id));
let config = configs[0];
/** Settings that are about the app (or both of them), kept the same in both stick figures. */
const SHARED: (keyof PetConfig)[] = ['windows', 'moveWindows', 'screenAware', 'knockCursor', 'mischief', 'fightMode', 'friend', 'provider', 'model', 'sfx', 'volume', 'figureCount', 'debugCombat', 'closeWindows', 'browserPlay', 'fileHomes', 'showBag', 'showTrash', 'inkLifetime', 'consoleRequired', 'dailyRhythm', 'spawnOrder'];
let saveTimer: NodeJS.Timeout | undefined;
const dirty = new Set<number>();

function saveConfig() {
  for (const id of dirty) {
    if (saveIssues.has(`read:config:${id}`)) continue;
    try { writeAtomic(configPath(id), JSON.stringify(configs[id], null, 2)); dirty.delete(id); saved(`config:${id}`, { ok: true }); }
    catch { saved(`config:${id}`, { ok: false, message: `Settings for ${configs[id].name} could not be saved. Free some disk space and retry.` }); }
  }
}

function loadConfig() {
  try { const text = readSave(configPath(0), 'read:config:0'); configs[0] = editionConfig(mergeConfig(editionDefaults, text ? JSON.parse(text) : null)); }
  catch { configs[0] = structuredClone(editionDefaults); }
  // The second one: their own file, or (first time) made from the first one's, with their own name and color.
  const second = mergeConfig(editionDefaults, { ...friendConfig(configs[0]), name: configs[0].friend.name, look: { ...configs[0].look, color: configs[0].friend.color } });
  try { const text = readSave(configPath(1), 'read:config:1'); configs[1] = editionConfig(mergeConfig(second, text ? JSON.parse(text) : null)); }
  catch { configs[1] = second; }
  for(let id=2;id<5;id++) {
    const defaults=companionConfig(configs[0],id);
    try { const text = readSave(configPath(id), `read:config:${id}`); configs[id] = editionConfig(mergeConfig(defaults, text ? JSON.parse(text) : null)); } catch { configs[id]=defaults; }
  }
  for(let id=1;id<5;id++)for (const k of SHARED) (configs[id] as unknown as Record<string, unknown>)[k] = structuredClone(configs[0][k]);
  config = configs[0];
}

function setConfig(id: number, patch: unknown) {
  if (!Number.isInteger(id) || id<0 || id>=configs.length) return;
  configs[id] = editionConfig(mergeConfig(configs[id], patch));
  dirty.add(id);
  // App-wide settings changed in either window: the other one gets them too.
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const changed: number[] = [id];
  if (SHARED.some((k) => k in p)) {
    for(let other=0;other<configs.length;other++)if(other!==id){
      for (const k of SHARED) (configs[other] as unknown as Record<string, unknown>)[k] = structuredClone(configs[id][k]);
      dirty.add(other);changed.push(other);
    }
  }
  config = configs[0];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConfig, 300);
  for (const w of BrowserWindow.getAllWindows()) for (const i of changed) w.webContents.send('config:changed', { id: i, config: configs[i] });
  buildTrayMenu();
  for (const [i, sw] of settingsWins) sw.setTitle(`Stickmen — Settings`);
  updateWatcher();
}

// ───────────── their memory files ─────────────
// memory.json (and memory-2.json for the second one) in the app's data folder: their notes and summary.
// Plain JSON, so you can read it.

const memoryPath = (id: number) => path.join(app.getPath('userData'), id ? `memory-${id + 1}.json` : 'memory.json');
function saveMemory(id: number, json: string): SaveResult {
  if ((!Number.isInteger(id) || id<0 || id>=configs.length) || typeof json !== 'string' || json.length > 2_000_000)
    return { ok: false, message: 'The memory save is invalid or too large.' };
  if (saveIssues.has(`read:memory:${id}`)) return { ok: false, message: 'The original memory file needs recovery before it can be replaced.' };
  try { JSON.parse(json); writeAtomic(memoryPath(id), json); return saved(`memory:${id}`, { ok: true }); }
  catch { return saved(`memory:${id}`, { ok: false, message: `Memories for ${configs[id].name} could not be saved. Free some disk space and retry.` }); }
}

// ───────────── item definition files ─────────────
// userData/items/*.json: your own items (see the README.md there). The ones he comes
// with are copied in on first run as examples to copy and change.

const itemsDir = () => path.join(app.getPath('userData'), 'items');
function readItemDefs(): unknown[] {
  const dir = itemsDir(), out: unknown[] = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    // The example files (and the how-to) go in once each, so new ones that come with an update show
    // up too, without bringing back any you deleted. (The guide is always the newest.)
    const examples = path.join(__dirname, '../items'), marker = path.join(dir, '.copied.json');
    let copied: string[] = [];
    try {
      const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
      copied = Array.isArray(saved) ? saved.filter((f): f is string => typeof f === 'string') : fs.readdirSync(dir);
    } catch { copied = fs.readdirSync(dir); }
    if (fs.existsSync(examples)) {
      for (const f of fs.readdirSync(examples)) {
        const to = path.join(dir, f);
        const old = (builtinHistory as Record<string, unknown[]>)[f] ?? [];
        if (f.endsWith('.md') || (!copied.includes(f) && !fs.existsSync(to)) || unchangedExample(to, old)) fs.copyFileSync(path.join(examples, f), to);
        if (!copied.includes(f)) copied.push(f);
      }
      // Examples that no longer ship (the Othello table, the mallet) go away, unless you edited them.
      const shipped = new Set(fs.readdirSync(examples));
      for (const [f, old] of Object.entries(builtinHistory as Record<string, unknown[]>)) {
        const at = path.join(dir, f);
        if (!shipped.has(f) && fs.existsSync(at) && unchangedExample(at, old)) fs.rmSync(at);
      }
      fs.writeFileSync(marker, JSON.stringify(copied));
    }
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('.')) continue;
      try { out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
      catch (e) { console.log(`[items] couldn't read ${f}: ${(e as Error).message}`); }
    }
  } catch { /* no items folder: he just has his own things */ }
  return out;
}

// ───────────── other windows (platforms) ─────────────

/** Convert screen rectangles to the overlay's coordinates (its top-left is 0,0). */
function toOverlay(wins: WinRect[]): WinRect[] {
  const wa = screen.getPrimaryDisplay().workArea;
  return wins.map((w) => {
    let r = { x: w.x, y: w.y, width: w.w, height: w.h };
    if (process.platform === 'win32') r = screen.screenToDipRect(null, r); // real pixels → app units
    return { id: w.id, x: r.x - wa.x, y: r.y - wa.y, w: r.width, h: r.height };
  });
}

/** Overlay coordinates → the helper's screen coordinates (real pixels on Windows). */
function toScreen(x: number, y: number, w = 1, h = 1) {
  const wa = screen.getPrimaryDisplay().workArea;
  let r = { x: x + wa.x, y: y + wa.y, width: w, height: h };
  if (process.platform === 'win32') r = screen.dipToScreenRect(null, r); // app units → real pixels
  return r;
}

// The helper runs whenever he needs it: to see windows, or to move your cursor (mischief, knocking it around).
function updateWatcher() {
  const scan = config.fileHomes || config.closeWindows || config.windows || config.mischief || config.knockCursor || config.screenAware;
  const need = scan || (COMMERCIAL && process.platform === 'darwin');
  if (need && !watcher) {
    watcher = watchWindows((wins) => {
      lastWins = (config.windows || config.fileHomes || config.closeWindows) ? toOverlay(wins) : [];
      sendFileWindows();
      win?.webContents.send('world:windows', lastWins);
    }, (m) => { console.log('[windows]', m); win?.webContents.send('world:log', m); }, (ui) => sendUi(ui));
  } else if (!need && watcher) {
    watcher.stop();
    watcher = null;
  }
  if (!(config.windows || config.fileHomes || config.closeWindows) && lastWins.length) { lastWins = []; win?.webContents.send('world:windows', []); }
  watcher?.setWindowScan(scan);
  watcher?.setUi(config.screenAware || config.fileHomes);
  if(config.fileHomes && !fileWatcher)fileWatcher=watchFileWindows(files=>{folderWindows=files;sendFileWindows();},text=>{fileNote=text;win?.webContents.send('world:fileNote',text);});
  else if(!config.fileHomes && fileWatcher){fileWatcher.stop();fileWatcher=null;folderWindows=[];documents.clear();fileNote='';documentNote='';sendFileWindows();}
  if (!config.screenAware) win?.webContents.send('world:ui', null);
}

/** What you're doing (app, title, where things are in its window): to the overlay, in its coordinates. */
function sendUi(ui: UiReport) {
  let document: FileWindow | null = null;
  if(config.fileHomes && ui.document && path.isAbsolute(ui.document)) {
    const frame=lastWins.find(w=>w.id===ui.win);
    if(frame){let kind:'folder'|'file'='file';try{if(fs.statSync(ui.document).isDirectory())kind='folder';}catch{}
      document={id:ui.win,path:normalizedPath(ui.document),kind,x:frame.x,y:frame.y,width:frame.w,height:frame.h,tops:toOverlay(ui.els.map(([x,y,w,h],i)=>({id:i,x,y,w,h}))).map(r=>[r.x,r.y,r.w,r.h])};}
  }
  if (config.fileHomes) {
    if (process.platform === 'darwin' && !ui.trusted) {
      documents.clear();
      documentNote = 'Allow Accessibility in System Settings → Privacy & Security so document windows can be detected.';
    } else { documentNote = ''; documents.observe(ui.win, document); }
  }
  sendFileWindows();
  if (!config.screenAware) return;
  const els = toOverlay(ui.els.map(([x, y, w, h], i) => ({ id: i, x, y, w, h }))).map((r) => [r.x, r.y, r.w, r.h]);
  win?.webContents.send('world:ui', { app: String(ui.app ?? '').slice(0, 60), title: String(ui.title ?? '').slice(0, 80), win: ui.win, trusted: ui.trusted, els });
}

function sendFileWindows() {
  const files: FileWindow[] = [];
  for (const f of folderWindows) {
    let source = lastWins.find((w) => w.id === f.id);
    if (!source && process.platform === 'darwin') {
      const converted = toOverlay([
        { id: 0, x: f.x, y: f.y, w: f.width, h: f.height },
      ])[0];
      source = lastWins.find(
        (w) =>
          Math.abs(w.x - converted.x) < 5 &&
          Math.abs(w.y - converted.y) < 5 &&
          Math.abs(w.w - converted.w) < 10 &&
          Math.abs(w.h - converted.h) < 10,
      );
    }
    if (source)
      files.push({
        ...f,
        path: normalizedPath(f.path),
        id: source.id,
        x: source.x,
        y: source.y,
        width: source.w,
        height: source.h,
      });
  }
  for (const document of documents.visible(lastWins))
    if (!files.some(f => f.id === document.id)) files.push(document);
  win?.webContents.send('world:files', files);
}
function normalizedPath(file: string) {
  let full = path.resolve(file);
  try {
    full = fs.realpathSync(full);
  } catch {}
  return process.platform === 'win32' ? full.toLowerCase() : full;
}
async function chooseHabitat(id: number, kind: 'folder' | 'file' = 'folder') {
  if (!activeFigureIds(config).includes(id))
    return { ok: false, message: 'Select a figure in the current roster first.' };
  if (!['darwin', 'win32'].includes(process.platform) || (kind === 'file' && process.platform !== 'darwin'))
    return { ok: false, message: kind === 'file'
      ? 'Document visits are available on Mac only, in apps that report their open file. Folder visits work in Finder / Explorer.'
      : 'Folder visits need the desktop app on Mac or Windows.' };
  const result = await dialog.showOpenDialog({
    title: 'Choose the real file or folder for this figure to enter',
    properties: [kind === 'file' ? 'openFile' : 'openDirectory'],
  });
  if (result.canceled || !result.filePaths[0])
    return { ok: false, message: 'No place selected.' };
  if (!activeFigureIds(config).includes(id))
    return { ok: false, message: 'That figure left the roster while you were choosing. Select an active figure.' };
  let target: string;
  try { target = normalizedPath(fs.realpathSync(result.filePaths[0])); }
  catch { return { ok: false, message: 'That place is no longer available. Choose an existing file or folder.' }; }
  setConfig(id, { fileHomes: true });
  if (kind === 'file' && !documents.visible(lastWins).some(f => f.kind === 'file' && f.path === target))
    return { ok: false, message: 'Open this file in its Mac app first, then try again. Its app must report the document path; the figure stays on the desktop until it is detected.' };
  win?.webContents.send('desktop:habitat', { id, path: target, kind });
  return {
    ok: true,
    message:
      kind === 'folder'
        ? 'Folder selected. The figure appears when that exact folder is visible in Finder / Explorer. Return to desktop recalls it even when the folder is closed.'
        : 'File selected. The figure appears in the detected document window. Return to desktop recalls it at any time.',
  };
}

// ───────────── windows ─────────────

function createOverlay() {
  // workArea = the screen minus the macOS menu bar / Dock or the Windows taskbar.
  // So the "floor" is the top of the Dock/taskbar.
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    // Clicking him shouldn't steal focus from the app you're using (or, on macOS, switch you to another desktop:
    // activating our app jumps to whichever desktop holds one of its windows, like a settings window).
    // macOS: a "panel" window that can't take focus; Windows: a non-focusable window. Only the talk box makes
    // it focusable, for as long as you're typing.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    focusable: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep simulating even when not focused
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS: follow you across desktops (Spaces) and over full-screen apps.
  // (skipTransformProcessType: he's already out of the Dock; flipping the app's type here can activate it.)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  // Start click-through. `forward` still lets us see mouse movement so we know
  // when the cursor is over him.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '../app/index.html'));
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', () => win?.webContents.send('world:windows', lastWins));

  const fit = () => win?.setBounds(screen.getPrimaryDisplay().workArea);
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

function openSettings(id = 0, tab?: string) {
  if (!Number.isInteger(id) || id<0 || id>=configs.length) id=0;
  const existing = settingsWins.get(0);
  const goTo = () => {const sw=settingsWins.get(0);sw?.webContents.send('settings:select',id);if(typeof tab==='string')sw?.webContents.send('settings:tab',tab);};
  if (existing) { existing.show(); existing.focus(); goTo(); return; }
  const sw = new BrowserWindow({
    width: 500,
    height: 760,
    minWidth: 380,
    minHeight: 480,
    title: COMMERCIAL ? PRODUCT_NAME : 'Stickmen — Settings',
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
  });
  settingsWins.set(0, sw);
  sw.loadFile(path.join(__dirname, '../settings/index.html'), { query: { pet: String(id) } });
  sw.webContents.once('did-finish-load', goTo);
  // Links (like "Get a free key") open in your normal browser.
  sw.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  sw.once('ready-to-show', () => {
    sw.show();
    if (process.platform === 'darwin') app.focus({ steal: true });
  });
  sw.on('closed', () => { settingsWins.delete(0); });
}

// ───────────── menu-bar / tray icon ─────────────

function buildTrayMenu() {
  if (!tray) return;
  const both = activeFigureIds(config);
  tray.setToolTip(both.map((i) => configs[i].name).join(' & '));
  const all = (patch: Partial<PetConfig>) => { for (const i of both) setConfig(i, patch); };
  tray.setContextMenu(Menu.buildFromTemplate([
    ...(COMMERCIAL ? [
      { label: PRODUCT_NAME, enabled: false },
      { label: session.paused ? 'Resume buddies' : 'Pause buddies', click: () => setSession({ paused: !session.paused }) },
      { label: session.hidden ? 'Show all buddies' : 'Hide all buddies', click: () => setSession({ hidden: !session.hidden }) },
      { type: 'separator' as const },
    ] : []),
    {label:'Settings…',click:()=>openSettings(both[0])},
    {label:'Inventory and supplies…',click:()=>win?.webContents.send('pet:command',{id:both[0],cmd:'openInventory:all'})},
    {label:'Talk to…',submenu:both.map(i=>({label:configs[i].name,click:()=>openSettings(i,'chat')}))},
    {label:'Stick men on the desktop',submenu:[1,2,3,4,5].map(n=>({label:n===1?'1 stick man':`${n} stick men`,type:'radio' as const,checked:both.length===n,click:()=>setConfig(0,{figureCount:n})}))},
    {type:'separator'},
    { label: 'Smack mode', type: 'checkbox', checked: config.smacking, click: () => all({ smacking: !config.smacking }) },
    { label: 'Mischief mode', type: 'checkbox', checked: config.mischief, click: () => setConfig(0, { mischief: !config.mischief }) },
    { label: 'They can hit your cursor', type: 'checkbox', checked: config.knockCursor, click: () => setConfig(0, { knockCursor: !config.knockCursor }) },
    { label: 'They can move your windows', type: 'checkbox', checked: config.moveWindows, click: () => setConfig(0, { moveWindows: !config.moveWindows }) },
    { label: 'Climb on windows', type: 'checkbox', checked: config.windows, click: () => setConfig(0, { windows: !config.windows }) },
    { label: 'Breakable', type: 'checkbox', checked: config.destructible, click: () => all({ destructible: !config.destructible }) },
    { type: 'separator' },
    { label: 'Drop them in again', click: () => { for (const i of both) win?.webContents.send('pet:command', { id: i, cmd: 'respawn' }); } },
    ...(!COMMERCIAL ? [{ label: 'Reload', click: () => win?.reload() }] : []),
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  // "Template" in the file name tells macOS to tint it to match the menu bar.
  tray = new Tray(path.join(__dirname, '../../assets/trayTemplate.png'));
  if (process.platform !== 'darwin') tray.on('click', () => openSettings(0)); // Windows: click opens settings
  buildTrayMenu();
}

// ───────────── messages between windows ─────────────

ipcMain.on('pet:clickThrough', (_e, ignore: boolean) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
const petIndex = (id: unknown) => typeof id==='number' && Number.isInteger(id) && id>=0 && id<configs.length ? id : 0;
ipcMain.handle('config:all', () => configs);
ipcMain.handle('config:get', (_e, id: unknown) => configs[petIndex(id)]);
ipcMain.on('config:set', (_e, id: unknown, patch: unknown) => setConfig(petIndex(id), patch));
// Reset: back to defaults (keeping who they are: the second one keeps their own name and color).
ipcMain.on('config:reset', (_e, id: unknown) => {
  const i = petIndex(id);
  setConfig(i, { ...DEFAULT_CONFIG, name: configs[i].name, personality:configs[i].personality, persona:configs[i].persona, figureCount:configs[0].figureCount, spawnOrder:configs[0].spawnOrder, friend:configs[0].friend, look: { ...DEFAULT_CONFIG.look, color: configs[i].look.color } });
});
ipcMain.on('pet:sanity',(_e,issues:unknown)=>{if(Array.isArray(issues))settingsWins.get(0)?.webContents.send('pet:sanity',issues.filter(x=>typeof x==='string').slice(0,30));});
ipcMain.on('pet:stats', (_e, id: unknown, stats: unknown) => settingsWins.get(0)?.webContents.send('pet:stats', {id:petIndex(id),stats}));
ipcMain.on('pet:collections', (_e, id: unknown, data: unknown) => settingsWins.get(0)?.webContents.send('pet:collections', {id:petIndex(id),data}));
ipcMain.on('pet:command',(_e,id:unknown,cmd:string)=>{if(cmd==='returnHome')homes=homes.filter(h=>h.id!==petIndex(id));win?.webContents.send('pet:command',{id:petIndex(id),cmd});});
ipcMain.on('settings:open', (_e, id: unknown, tab?: string) => openSettings(petIndex(id), typeof tab === 'string' ? tab : undefined));
ipcMain.handle('memory:load', (_e, id: unknown) => readSave(memoryPath(petIndex(id)), `read:memory:${petIndex(id)}`));
ipcMain.handle('items:defs', () => readItemDefs());
ipcMain.on('items:reload', () => win?.webContents.send('items:defs', readItemDefs()));
ipcMain.on('items:openFolder', () => { readItemDefs(); shell.openPath(itemsDir()); });
// The talk box on the desktop needs keyboard focus for a moment, then gives it back.
ipcMain.on('pet:typing', (_e, on: boolean) => {
  if (!win) return;
  if (win.isFocusable() === !!on) return; // Avoid recreating/toggling a native panel for duplicate focus messages.
  watcher?.setKeyboard(!!on);
  if (on) {
    win.setFocusable(true);
    win.focus();
    if (process.platform === 'darwin') win.focusOnWebView();
  } else {
    win.setFocusable(false); win.blur();
    if (process.platform === 'darwin') watcher?.refocus();
  }
});
ipcMain.on('memory:save', (_e, id: unknown, json: string) => saveMemory(petIndex(id), json));
ipcMain.handle('memory:save', (_e, id: unknown, json: string) => saveMemory(petIndex(id), json));
ipcMain.handle('save:status', () => saveHealth());
ipcMain.handle('product:info', () => ({ name: PRODUCT_NAME, version: PRODUCT_VERSION, commercial: COMMERCIAL, state: productState, recovered: [...recoveredSaves] }));
ipcMain.handle('product:setup', (_e, patch: Partial<ProductState>) => saveProductState(patch ?? {}));
ipcMain.on('product:openData', () => { void shell.openPath(app.getPath('userData')); });
ipcMain.handle('product:exportBackup', async (): Promise<SaveResult> => {
  if (!win || win.isDestroyed()) return { ok: false, message: 'The desktop is unavailable. Try again once the buddies are ready.' };
  try {
    const snapshot = await win.webContents.executeJavaScript('window.exportBackupSnapshot()');
    const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Export buddy backup',
      defaultPath: `Mallow-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'Buddy backup', extensions: ['json'] }] });
    if (canceled || !filePath) return { ok: false, message: 'Export cancelled.' };
    // Explicit allowlist: never export provider credentials, browser pairing secrets or OS key stores.
    const backup = { format: 'mallow-desk-buddies', version: 1, exportedAt: new Date().toISOString(),
      configs: configs.map(offlineEdition), worlds: snapshot.worlds, memories: snapshot.memories, definitions: readItemDefs() };
    writeAtomic(filePath, JSON.stringify(backup, null, 2)); return { ok: true };
  } catch { return { ok: false, message: 'The backup could not be exported. Your existing saves have not been changed.' }; }
});
ipcMain.handle('session:get', () => session);
ipcMain.on('session:set', (_e, patch: Partial<SessionState>) => setSession({
  ...(typeof patch?.paused === 'boolean' ? { paused: patch.paused } : {}),
  ...(typeof patch?.hidden === 'boolean' ? { hidden: patch.hidden } : {}),
}));
ipcMain.on('save:retry', () => { saveConfig(); if (pendingProductState) saveProductState(pendingProductState); win?.webContents.send('save:request', 0); });
// Their AI brains: the overlay asks, main calls the AI service with the saved key (one key for both).
ipcMain.handle('brain:ask', (_e, id: unknown, req: BrainRequest) => { if (COMMERCIAL) return { ok: false, error: 'This edition uses built-in offline dialogue.' }; const c = configs[petIndex(id)]; return llm.ask(c.provider, c.model, req); });
ipcMain.handle('brain:keyStatus', (_e, provider: ProviderId) => COMMERCIAL ? { provider: config.provider, saved: false, hint: 'Offline edition' } : llm.keyStatus(Object.hasOwn(PROVIDERS, provider) ? provider : config.provider));
ipcMain.handle('brain:models', () => COMMERCIAL ? { ok: false, error: 'This edition uses built-in offline dialogue.' } : llm.listModels(config.provider));
ipcMain.on('brain:setKey', (_e, key: string) => {
  if (COMMERCIAL) return;
  llm.setKey(config.provider, String(key ?? ''));
  for (const sw of settingsWins.values()) sw.webContents.send('brain:keyStatus', llm.keyStatus(config.provider));
});
// You pressed on him. On macOS that (wrongly) activates our app, so hand focus right back.
ipcMain.on('pet:pressed', () => { if (!win?.isFocusable()) watcher?.refocus(); });
// He grabbed your cursor (mischief mode) or knocked it flying. Overlay coordinates → screen coordinates.
ipcMain.on('pet:moveCursor', (_e, x: number, y: number) => {
  if (!(config.mischief || config.knockCursor) || !watcher || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const p = toScreen(x, y);
  watcher.moveCursor(p.x, p.y);
});
// He pushed, kicked or surfed one of your windows: move it for real.
ipcMain.on('pet:moveWindow', (_e, id: number, x: number, y: number, w: number, h: number) => {
  if (!config.moveWindows || !config.windows || !watcher || ![id, x, y, w, h].every(Number.isFinite)) return;
  const r = toScreen(x, y, w, h);
  watcher.moveWindow(id, r.x, r.y);
});

ipcMain.handle('desktop:info', () => ({
  pairing: desktop?.pairing ?? '',
  error: desktopError,
  homes,
  connected: !!desktop?.state.browser,
  fileNote: [fileNote,documentNote].filter(Boolean).join(' '),
  foldersSupported: ['darwin', 'win32'].includes(process.platform),
  filesSupported: process.platform === 'darwin',
}));
ipcMain.on('desktop:extensionFolder', () =>
  shell.openPath(path.join(__dirname, '../extension/chrome')),
);
ipcMain.handle('desktop:chooseHabitat', (_e, id, kind) =>
  COMMERCIAL ? { ok: false, message: 'File visits are outside this edition.' } : chooseHabitat(petIndex(id), kind === 'file' ? 'file' : 'folder'),
);
ipcMain.on('desktop:fileHomes', (_e, value: unknown) => {
  if (Array.isArray(value))
    homes = value
      .slice(0, 5)
      .filter(
        (h) =>
          h &&
          Number.isInteger(h.id) &&
          h.id >= 0 &&
          h.id < 5 &&
          typeof h.path === 'string' &&
          h.path.length < 4096,
      ).map(h => ({id:h.id, path:h.path, kind:h.kind==='file'?'file':'folder', visible:h.visible===true}));
});
ipcMain.handle(
  'desktop:action',
  async (_e, id: unknown, action: DesktopAction) => {
    if (COMMERCIAL) return { ok: false, message: 'Browser and file integrations are outside this edition.' };
    const i = petIndex(id);
    if (action === 'folder' || action === 'file')
      return chooseHabitat(i, action);
    if (action === 'closewindow') {
      if (!config.closeWindows)
        return {
          ok: false,
          message: 'Enable window closing in General first.',
        };
      const target = lastWins[0];
      if (!target || !watcher)
        return { ok: false, message: 'No accessible window is available.' };
      return watcher.closeWindow(target.id);
    }
    if (['closetab', 'pluck', 'restorepage'].includes(action))
      return (
        desktop?.browserAction(
          action as 'closetab' | 'pluck' | 'restorepage',
          i,
        ) ?? {
          ok: false,
          message: desktopError || 'The Chrome bridge is unavailable.',
        }
      );
    return { ok: false, message: 'Unknown desktop action.' };
  },
);

// His talking blips should play without you having to click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  if (COMMERCIAL && !app.requestSingleInstanceLock()) { app.quit(); return; }
  if (COMMERCIAL) app.on('second-instance', () => { setSession({ hidden: false }); openSettings(); });
  const life = () => win?.webContents.send('world:life', {hour:new Date().getHours(),idleSeconds:powerMonitor.getSystemIdleTime()});
  setInterval(life,10000).unref();
  loadConfig();
  if (COMMERCIAL) {
    try { const text = readSave(productStatePath(), 'read:setup'); if (text) {
      const value = JSON.parse(text); productState = { introDone: value.introDone === true, sceneReady: value.sceneReady === true };
    } } catch { /* Original retained; the save-health panel explains recovery. */ }
  }
  // He lives in the menu bar, not the Dock. Keep an Edit menu so copy/paste
  // shortcuts work in the settings window's text boxes.
  if (process.platform === 'darwin') app.dock?.hide();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]),
  );
  createOverlay();
  createTray();
  updateWatcher();
  if (!COMMERCIAL) desktop = new DesktopBridge({
    dataDir: app.getPath('userData'),
    enabled: () => config.browserPlay,
    changed: (state: DesktopState) => {
      const b = state.browser,
        wa = screen.getPrimaryDisplay().workArea;
      win?.webContents.send('desktop:state', {
        browser: b ? { ...b, x: b.x - wa.x, y: b.y - wa.y } : null,
      });
    },
    cutout: (cutout) => {
      const wa = screen.getPrimaryDisplay().workArea;
      win?.webContents.send('desktop:cutout', {
        ...cutout,
        x: cutout.x - wa.x,
        y: cutout.y - wa.y,
      });
    },
  });
  desktop?.start().catch((err) => {
    desktopError = `Chrome bridge could not start: ${(err as Error).message}`;
    console.error(desktopError);
    desktop = null;
  });
  if (COMMERCIAL) {
    win?.webContents.once('did-finish-load', () => {
      win?.webContents.send('session:changed', session);
      if (!productState.introDone) openSettings();
    });
  }
});

// Wait for renderer state AND acknowledged memory writes before tearing down Electron.
let quitting = false, quitInFlight = false, quitToken = 0;
let pendingQuit: { token: number; resolve: (ok: boolean) => void } | null = null;
ipcMain.on('save:flushed', (event, token: number, ok: boolean) => {
  if (event.sender !== win?.webContents || !pendingQuit || pendingQuit.token !== token) return;
  pendingQuit.resolve(ok === true); pendingQuit = null;
});
app.on('before-quit', event => {
  if (!COMMERCIAL || quitting || !win || win.isDestroyed()) return;
  event.preventDefault();
  if (quitInFlight) return;
  quitInFlight = true;
  saveConfig();
  if (pendingProductState) saveProductState(pendingProductState);
  const token = ++quitToken;
  const flushed = new Promise<boolean>(resolve => {
    const timer = setTimeout(() => { if (pendingQuit?.token === token) { pendingQuit = null; resolve(false); } }, 8000);
    pendingQuit = { token, resolve: ok => { clearTimeout(timer); resolve(ok); } };
  });
  win.webContents.send('save:request', token);
  void flushed.then(async ok => {
    if (!ok || saveIssues.size) {
      const { response } = await dialog.showMessageBox({ type: 'warning', title: PRODUCT_NAME,
        message: 'Some changes have not been saved.', detail: 'Retry after freeing disk space, or keep the app open. Quitting now may lose the latest changes.',
        buttons: ['Retry saves', 'Quit without saving', 'Keep open'], defaultId: 2, cancelId: 2 });
      if (response === 0) { quitInFlight = false; app.quit(); return; }
      if (response !== 1) { quitInFlight = false; return; }
    }
    quitting = true; app.quit();
  }).catch(error => { quitInFlight = false; console.error('Save confirmation failed; app remains open.', error); });
});
app.on('will-quit', () => { clearTimeout(saveTimer); saveConfig(); watcher?.stop();fileWatcher?.stop();void desktop?.stop(); });
app.on('window-all-closed', () => app.quit());
