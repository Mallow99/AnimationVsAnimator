// Smoke-test the real shell with fake windows and disposable app data. Linux cloud only.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-electron-'));
app.setPath('userData', dir); app.disableHardwareAcceleration();
process.env.PET_FAKE_WINDOWS = JSON.stringify([{ id: 1, x: 100, y: 350, w: 350, h: 300 }]);
const issues = [];
app.on('web-contents-created', (_e, web) => {
  web.on('render-process-gone', (_event, details) => issues.push(`renderer ${details.reason}`));
  web.on('did-fail-load', (_event, code, description) => issues.push(`load ${code}: ${description}`));
});
require('../dist/electron/main.js');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn) { for (let i = 0; i < 160; i++) { if (await fn()) return; await pause(50); } throw new Error('Electron readiness timed out'); }
app.whenReady().then(async () => {
  let overlay, settings;
  await until(() => { overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/app/index.html')); return !!overlay && !overlay.webContents.isLoading(); });
  await until(() => overlay.webContents.executeJavaScript('!!window.pet'));
  await until(() => overlay.webContents.executeJavaScript('window.pet.ctx.world.windows.length === 1'));
  await overlay.webContents.executeJavaScript('window.petShell.openSettings()');
  await until(() => { settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings/index.html')); return !!settings && !settings.webContents.isLoading(); });
  assert.equal(await settings.webContents.executeJavaScript('document.querySelector("#aiInterval").value'), '40');
  await settings.webContents.executeJavaScript('window.petShell.setConfig({aiInterval:120})');
  await until(() => overlay.webContents.executeJavaScript('window.pet.config.aiInterval === 120'));
  await overlay.webContents.executeJavaScript('window.petShell.saveMemory(JSON.stringify({summary:"smoke",notes:[]}))');
  await until(() => fs.existsSync(path.join(dir, 'memory.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')).summary, 'smoke');
  assert.deepEqual(issues, []);
  console.log('PASS Electron: overlay, preload bridge, fake window helper, settings, live configuration and memory save');
  app.quit();
}).catch((err) => { console.error(err); process.exitCode = 1; app.quit(); });
app.on('will-quit', () => {
  if (!process.exitCode) {
    try { assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')).aiInterval, 120); }
    catch (err) { console.error(err); process.exitCode = 1; }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
