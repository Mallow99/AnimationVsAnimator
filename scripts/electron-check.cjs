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
  await until(() => { settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/settings/index.html?pet=0')); return !!settings && !settings.webContents.isLoading(); });
  assert.equal(await settings.webContents.executeJavaScript('document.querySelector("#aiInterval").value'), '40');
  await settings.webContents.executeJavaScript('window.petShell.setConfig({aiInterval:120})');
  await until(() => overlay.webContents.executeJavaScript('window.pet.config.aiInterval === 120'));
  await settings.webContents.executeJavaScript('document.querySelector("[data-tab=items]").click(); window.petShell.command("sync")');
  await until(() => settings.webContents.executeJavaScript('document.querySelectorAll("#propKinds .thing-card canvas").length === 6'));
  await settings.webContents.executeJavaScript('document.querySelector("button[aria-label=\\"Wear: Helmet\\"]").click()');
  await until(() => overlay.webContents.executeJavaScript('window.pet.items.onHim.some(i => i.def.id === "helmet" && i.where === "worn")'));
  await settings.webContents.executeJavaScript('document.querySelector("#itemKinds").scrollIntoView({block:"start"})');
  await pause(100);
  fs.mkdirSync(path.join(__dirname, '../.build'), {recursive:true});
  fs.writeFileSync(path.join(__dirname, '../.build/settings-smoke.png'), (await settings.webContents.capturePage()).toPNG());
  await overlay.webContents.executeJavaScript(`(() => {
    const p=window.pet; p.paused=true; p.mind.reset(p.ctx); p.applyConfig({...p.config,windows:false}); p.setWindows([]); p.command('respawn');
    for(let i=0;i<600;i++)p.update(1/120);
    p.props.spawn('tv',p.char.x+160*p.char.scale,p.ctx.world.bounds.floor-70*p.char.scale-2,p.char.scale);
    for(let i=0;i<240;i++)p.update(1/120);
    p.paused=false; p.command('do:playgame');
    for(let i=0;i<1800 && p.game.state==='closed';i++)p.update(1/120);
  })()`);
  await until(() => overlay.webContents.executeJavaScript('!document.querySelector("#gamePanel").hidden'));
  await overlay.webContents.executeJavaScript('document.querySelector(".game-play").click()');
  await until(() => overlay.isFocusable());
  await overlay.webContents.executeJavaScript('document.querySelector(".game-actions button:last-child").click()');
  assert(await overlay.webContents.executeJavaScript('document.querySelector("#talk").classList.contains("open") && window.pet.game.state === "playing"'));
  await overlay.webContents.executeJavaScript('document.querySelector(".game-close").click()');
  await until(() => overlay.webContents.executeJavaScript('document.querySelector("#gamePanel").hidden'));
  assert(overlay.isFocusable(), 'closing the game stole focus from open chat');
  await overlay.webContents.executeJavaScript('document.querySelector("#talkClose").click()');
  await until(() => !overlay.isFocusable());
  // The second stick figure: their own settings window in their own color, their own config, the shared
  // settings kept in step, their own talk box and memory file.
  await until(() => overlay.webContents.executeJavaScript('window.pets.length === 2'));
  await overlay.webContents.executeJavaScript('window.petShell.openSettings(1)');
  let second;
  await until(() => { second = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/settings/index.html?pet=1')); return !!second && !second.webContents.isLoading(); });
  const accent = (w) => w.webContents.executeJavaScript('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()');
  await until(async () => (await accent(second)) === '#f7931e');
  assert.match(second.getTitle(), /Leonard/);
  await second.webContents.executeJavaScript('document.querySelector("[data-tab=him]")?.click()');
  await settings.webContents.executeJavaScript('document.querySelector("[data-tab=him]")?.click()');
  await pause(300);
  fs.writeFileSync(path.join(__dirname, '../.build/settings-pet1.png'), (await settings.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(__dirname, '../.build/settings-pet2.png'), (await second.webContents.capturePage()).toPNG());
  await second.webContents.executeJavaScript('window.petShell.setConfig({look:{color:"#22aa55"}})');
  await until(() => overlay.webContents.executeJavaScript('window.pets[1].config.look.color === "#22aa55"'));
  await until(async () => (await accent(second)) === '#22aa55');
  assert.notEqual(await accent(settings), '#22aa55', 'the first one changed color too');
  assert.equal(await overlay.webContents.executeJavaScript('window.pets[0].config.look.color'), '#4450d6');
  await second.webContents.executeJavaScript('window.petShell.setConfig({fightMode:"real"})');
  await until(() => overlay.webContents.executeJavaScript('window.pets[0].config.fightMode === "real" && window.pets[1].config.fightMode === "real"'));
  await overlay.webContents.executeJavaScript('window.pets[1].onTalk()');
  await until(() => overlay.isFocusable());
  assert.match(await overlay.webContents.executeJavaScript('document.querySelector("#talkText").placeholder'), /Leonard/);
  await overlay.webContents.executeJavaScript(`(() => { const input = document.querySelector('#talkText'); input.value = 'hello'; document.querySelector('#talk').requestSubmit(); })()`);
  await until(() => overlay.webContents.executeJavaScript('window.pets[1].brain.log.some(l => l.who === "him")'));
  await overlay.webContents.executeJavaScript('document.querySelector("#talkClose").click()');
  await until(() => !overlay.isFocusable());
  await overlay.webContents.executeJavaScript('window.petShell.saveMemory(0, JSON.stringify({summary:"smoke",notes:[]})); window.petShell.saveMemory(1, JSON.stringify({summary:"smoke two",notes:[]}))');
  await until(() => fs.existsSync(path.join(dir, 'memory.json')) && fs.existsSync(path.join(dir, 'memory-2.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')).summary, 'smoke');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'memory-2.json'), 'utf8')).summary, 'smoke two');
  await until(() => fs.existsSync(path.join(dir, 'pet-2.json')));
  assert.deepEqual(issues, []);
  console.log('PASS Electron: overlay, fake helper, settings inventory, Othello/chat focus, configuration, two stick figures (own settings window and color, shared settings, talk box, memory file)');
  app.quit();
}).catch((err) => { console.error(err); process.exitCode = 1; app.exit(1); });
app.on('will-quit', () => {
  if (!process.exitCode) {
    try { assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')).aiInterval, 120); }
    catch (err) { console.error(err); process.exitCode = 1; }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
