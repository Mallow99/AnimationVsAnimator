// The desktop shell (macOS + Windows).
//  - One transparent, frameless, always-on-top, click-through window over the main screen (Blurp lives here).
//  - A menu-bar / tray icon with quick toggles.
//  - A settings window.
//  - His settings, saved as pet.json in the app's data folder and shared with every window.

import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, mergeConfig, type PetConfig } from '../core/config';

let win: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
const preload = path.join(__dirname, 'preload.js');

// ───────────── settings file ─────────────

const configPath = () => path.join(app.getPath('userData'), 'pet.json');
let config: PetConfig = structuredClone(DEFAULT_CONFIG);
let saveTimer: NodeJS.Timeout | undefined;

function loadConfig() {
  try { config = mergeConfig(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); }
  catch { config = structuredClone(DEFAULT_CONFIG); } // first run, or a broken file: use defaults
}

function setConfig(patch: unknown) {
  config = mergeConfig(config, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(configPath(), JSON.stringify(config, null, 2), () => {}), 300);
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('config:changed', config);
  buildTrayMenu();
  settingsWin?.setTitle(`${config.name} — Settings`);
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

  const fit = () => win?.setBounds(screen.getPrimaryDisplay().workArea);
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
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
    { label: 'Settings…', click: openSettings },
    { label: 'Smack mode', type: 'checkbox', checked: config.smacking, click: () => setConfig({ smacking: !config.smacking }) },
    { type: 'separator' },
    { label: 'Drop him in again', click: () => win?.webContents.send('pet:command', 'respawn') },
    { label: 'Reload', click: () => win?.reload() },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  // "Template" in the file name tells macOS to tint it to match the menu bar.
  tray = new Tray(path.join(__dirname, '../../assets/trayTemplate.png'));
  if (process.platform !== 'darwin') tray.on('click', openSettings); // Windows: click opens settings
  buildTrayMenu();
}

// ───────────── messages between windows ─────────────

ipcMain.on('pet:clickThrough', (_e, ignore: boolean) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.handle('config:get', () => config);
ipcMain.on('config:set', (_e, patch: unknown) => setConfig(patch));
ipcMain.on('config:reset', () => setConfig(DEFAULT_CONFIG));
ipcMain.on('pet:stats', (_e, stats: unknown) => settingsWin?.webContents.send('pet:stats', stats));
ipcMain.on('pet:command', (_e, cmd: string) => win?.webContents.send('pet:command', cmd));
ipcMain.on('settings:open', openSettings);

app.whenReady().then(() => {
  loadConfig();
  // He lives in the menu bar, not the Dock. Keep an Edit menu so copy/paste
  // shortcuts work in the settings window's text boxes.
  if (process.platform === 'darwin') app.dock?.hide();
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  createOverlay();
  createTray();
});
app.on('window-all-closed', () => app.quit());
