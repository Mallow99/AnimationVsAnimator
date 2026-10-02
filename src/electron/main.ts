// The desktop shell (macOS + Windows). Creates one transparent, frameless,
// always-on-top window covering the main screen, and makes empty areas
// click-through so you can keep using your computer normally.

import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import path from 'node:path';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

/** Menu-bar (macOS) / system-tray (Windows) icon. The settings window will hang off this later. */
function createTray() {
  // "Template" in the file name tells macOS to tint it to match the menu bar.
  tray = new Tray(path.join(__dirname, '../../assets/trayTemplate.png'));
  tray.setToolTip('AnimationVsAnimator');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Reload him', click: () => win?.reload() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createWindow() {
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
      preload: path.join(__dirname, 'preload.js'),
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

  const fit = () => win?.setBounds(screen.getPrimaryDisplay().workArea);
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

ipcMain.on('pet:clickThrough', (_e, ignore: boolean) => {
  win?.setIgnoreMouseEvents(ignore, { forward: true });
});

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => app.quit());
