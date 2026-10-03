// The desktop shell (macOS + Windows).
//  - One transparent, frameless, always-on-top, click-through window over the main screen (Blurp lives here).
//  - A menu-bar / tray icon with quick toggles.
//  - A settings window.
//  - His settings, saved as pet.json in the app's data folder and shared with every window.

import { app, BrowserWindow, ipcMain, Menu, screen, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, mergeConfig, PROVIDERS, type PetConfig, type ProviderId } from '../core/config';
import type { WinRect } from '../core/world';
import { watchWindows, type UiReport, type WindowWatcher } from './windows';
import * as llm from './llm';
import type { BrainRequest } from '../core/brain';
import { writeAtomic } from './storage';

let win: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
const preload = path.join(__dirname, 'preload.js');
let watcher: WindowWatcher | null = null;
let lastWins: WinRect[] = [];

// ───────────── settings file ─────────────

const configPath = () => path.join(app.getPath('userData'), 'pet.json');
let config: PetConfig = structuredClone(DEFAULT_CONFIG);
let saveTimer: NodeJS.Timeout | undefined;
let configDirty = false;

function saveConfig() {
  if (!configDirty) return;
  try { writeAtomic(configPath(), JSON.stringify(config, null, 2)); configDirty = false; }
  catch (err) { console.error('[save] could not save settings:', (err as Error).message); }
}

function loadConfig() {
  try { config = mergeConfig(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); }
  catch { config = structuredClone(DEFAULT_CONFIG); } // first run, or a broken file: use defaults
}

function setConfig(patch: unknown) {
  config = mergeConfig(config, patch);
  configDirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConfig, 300);
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('config:changed', config);
  buildTrayMenu();
  settingsWin?.setTitle(`${config.name} — Settings`);
  updateWatcher();
}

// ───────────── his memory file ─────────────
// memory.json in the app's data folder: his notes and summary (milestone 5). Plain JSON, so you can read it.

const memoryPath = () => path.join(app.getPath('userData'), 'memory.json');
function saveMemory(json: string) {
  if (typeof json !== 'string' || json.length > 2_000_000) return;
  try { JSON.parse(json); writeAtomic(memoryPath(), json); }
  catch (err) { console.error('[save] could not save memories:', (err as Error).message); }
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
        if (f.endsWith('.md') || (!copied.includes(f) && !fs.existsSync(to))) fs.copyFileSync(path.join(examples, f), to);
        if (!copied.includes(f)) copied.push(f);
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
  const need = config.windows || config.mischief || config.knockCursor || config.screenAware;
  if (need && !watcher) {
    watcher = watchWindows((wins) => {
      lastWins = config.windows ? toOverlay(wins) : [];
      win?.webContents.send('world:windows', lastWins);
    }, (m) => { console.log('[windows]', m); win?.webContents.send('world:log', m); }, (ui) => sendUi(ui));
  } else if (!need && watcher) {
    watcher.stop();
    watcher = null;
  }
  if (!config.windows && lastWins.length) { lastWins = []; win?.webContents.send('world:windows', []); }
  watcher?.setUi(config.screenAware);
  if (!config.screenAware) win?.webContents.send('world:ui', null);
}

/** What you're doing (app, title, where things are in its window): to the overlay, in its coordinates. */
function sendUi(ui: UiReport) {
  if (!config.screenAware) return;
  const els = toOverlay(ui.els.map(([x, y, w, h], i) => ({ id: i, x, y, w, h }))).map((r) => [r.x, r.y, r.w, r.h]);
  win?.webContents.send('world:ui', { app: String(ui.app ?? '').slice(0, 60), title: String(ui.title ?? '').slice(0, 80), win: ui.win, trusted: ui.trusted, els });
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
    // Clicking him shouldn't steal focus from the app you're using.
    // macOS: a "panel" window takes clicks without activating the app.
    // Windows: a non-focusable window does the same.
    ...(process.platform === 'darwin' ? { type: 'panel' } : { focusable: false }),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep simulating even when not focused
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS: follow you across desktops (Spaces) and over full-screen apps.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

function openSettings(tab?: string) {
  const goTo = () => { if (typeof tab === 'string') settingsWin?.webContents.send('settings:tab', tab); };
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); goTo(); return; }
  settingsWin = new BrowserWindow({
    width: 500,
    height: 760,
    minWidth: 380,
    minHeight: 480,
    title: `${config.name} — Settings`,
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.loadFile(path.join(__dirname, '../settings/index.html'));
  settingsWin.webContents.once('did-finish-load', goTo);
  // Links (like "Get a free key") open in your normal browser.
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  settingsWin.once('ready-to-show', () => {
    settingsWin?.show();
    if (process.platform === 'darwin') app.focus({ steal: true });
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ───────────── menu-bar / tray icon ─────────────

function buildTrayMenu() {
  if (!tray) return;
  tray.setToolTip(config.name);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: config.name, enabled: false },
    { label: 'Settings…', click: () => openSettings() },
    { label: `Talk to ${config.name}…`, click: () => openSettings('chat') },
    { label: 'Items…', click: () => openSettings('items') },
    { label: 'Smack mode', type: 'checkbox', checked: config.smacking, click: () => setConfig({ smacking: !config.smacking }) },
    { label: 'Mischief mode', type: 'checkbox', checked: config.mischief, click: () => setConfig({ mischief: !config.mischief }) },
    { label: 'He can hit your cursor', type: 'checkbox', checked: config.knockCursor, click: () => setConfig({ knockCursor: !config.knockCursor }) },
    { label: 'He can move your windows', type: 'checkbox', checked: config.moveWindows, click: () => setConfig({ moveWindows: !config.moveWindows }) },
    { label: 'Climb on windows', type: 'checkbox', checked: config.windows, click: () => setConfig({ windows: !config.windows }) },
    { label: 'Breakable', type: 'checkbox', checked: config.destructible, click: () => setConfig({ destructible: !config.destructible }) },
    { type: 'separator' },
    { label: 'Drop him in again', click: () => win?.webContents.send('pet:command', 'respawn') },
    { label: 'Reload', click: () => win?.reload() },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  // "Template" in the file name tells macOS to tint it to match the menu bar.
  tray = new Tray(path.join(__dirname, '../../assets/trayTemplate.png'));
  if (process.platform !== 'darwin') tray.on('click', () => openSettings()); // Windows: click opens settings
  buildTrayMenu();
}

// ───────────── messages between windows ─────────────

ipcMain.on('pet:clickThrough', (_e, ignore: boolean) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.handle('config:get', () => config);
ipcMain.on('config:set', (_e, patch: unknown) => setConfig(patch));
ipcMain.on('config:reset', () => setConfig(DEFAULT_CONFIG));
ipcMain.on('pet:stats', (_e, stats: unknown) => settingsWin?.webContents.send('pet:stats', stats));
ipcMain.on('pet:collections', (_e, data: unknown) => settingsWin?.webContents.send('pet:collections', data));
ipcMain.on('pet:command', (_e, cmd: string) => win?.webContents.send('pet:command', cmd));
ipcMain.on('settings:open', () => openSettings());
ipcMain.handle('memory:load', () => { try { return fs.readFileSync(memoryPath(), 'utf8'); } catch { return null; } });
ipcMain.handle('items:defs', () => readItemDefs());
ipcMain.on('items:reload', () => win?.webContents.send('items:defs', readItemDefs()));
ipcMain.on('items:openFolder', () => { readItemDefs(); shell.openPath(itemsDir()); });
// The talk box on the desktop needs keyboard focus for a moment, then gives it back.
ipcMain.on('pet:typing', (_e, on: boolean) => {
  if (!win) return;
  if (on) {
    if (process.platform !== 'darwin') win.setFocusable(true);
    win.focus();
    if (process.platform === 'darwin') win.focusOnWebView();
  } else {
    if (process.platform !== 'darwin') { win.setFocusable(false); win.blur(); }
    else watcher?.refocus();
  }
});
ipcMain.on('memory:save', (_e, json: string) => saveMemory(json));
// The AI brain: the overlay asks, main calls the AI service with the saved key.
ipcMain.handle('brain:ask', (_e, req: BrainRequest) => llm.ask(config.provider, config.model, req));
ipcMain.handle('brain:keyStatus', (_e, provider: ProviderId) => llm.keyStatus(Object.hasOwn(PROVIDERS, provider) ? provider : config.provider));
ipcMain.handle('brain:models', () => llm.listModels(config.provider));
ipcMain.on('brain:setKey', (_e, key: string) => {
  llm.setKey(config.provider, String(key ?? ''));
  settingsWin?.webContents.send('brain:keyStatus', llm.keyStatus(config.provider));
});
// You pressed on him. On macOS that (wrongly) activates our app, so hand focus right back.
ipcMain.on('pet:pressed', () => watcher?.refocus());
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

// His talking blips should play without you having to click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  loadConfig();
  // He lives in the menu bar, not the Dock. Keep an Edit menu so copy/paste
  // shortcuts work in the settings window's text boxes.
  if (process.platform === 'darwin') app.dock?.hide();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  createOverlay();
  createTray();
  updateWatcher();
});
app.on('will-quit', () => { clearTimeout(saveTimer); saveConfig(); watcher?.stop(); });
app.on('window-all-closed', () => app.quit());
