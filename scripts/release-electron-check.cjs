// Real Electron/preload/renderer checks. Native windows are explicitly simulated on Linux.
const { app, BrowserWindow, session, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const http = require('node:http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mallow-release-'));
process.env.PET_DATA_DIR = dir;
process.env.PET_FAKE_WINDOWS = '[]';
app.disableHardwareAcceleration();
const errors = [], requests = [];
let listens = 0;
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) { listens++; return listen.apply(this, args); };
const fetch = global.fetch;
global.fetch = (...args) => { requests.push(String(args[0])); return Promise.reject(new Error('No network allowed in release QA')); };
fs.writeFileSync(path.join(dir, 'pet.json'), JSON.stringify({ name: 'My little friend', mind: 'full', browserPlay: true, fileHomes: true, closeWindows: true, look: { color: '#596cb2' } }));
app.on('web-contents-created', (_e, web) => {
  web.on('render-process-gone', (_e, details) => errors.push('renderer ' + details.reason));
  web.on('did-fail-load', (_e, code, description) => errors.push(`load ${code}: ${description}`));
  web.on('console-message', (_e, details) => { if (details.level === 'error') errors.push(details.message); });
});
require('../dist/electron/main.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) { for (let i = 0; i < 200; i++) { if (await fn()) return; await pause(50); } throw new Error('Timed out: ' + label); }
const output = path.join(__dirname, '../.build/release'); fs.mkdirSync(output, { recursive: true });
let passed = false;
const timeout = setTimeout(() => { console.error('Release QA exceeded 120 seconds'); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, done) => { requests.push(details.url); done({ cancel: true }); });
  let overlay, settings;
  await until(() => { overlay = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/app/index.html')); settings = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/settings/index.html')); return overlay && settings && !overlay.webContents.isLoading() && !settings.webContents.isLoading(); }, 'release windows');
  const run = source => overlay.webContents.executeJavaScript(source);
  const ui = source => settings.webContents.executeJavaScript(source);
  await until(() => run('window.pets?.length===2 && window.pet.props.placed.length===3'), 'starter scene');
  assert.equal(await ui('document.querySelectorAll("[role=tab]").length'), 4);
  assert(await ui('!document.querySelector("#welcome").hidden && !document.querySelector("#provider") && !document.querySelector("#fileHomes")'));
  assert(await run('window.pets.every(p=>p.config.mind==="offline"&&!p.config.fileHomes&&!p.config.browserPlay&&!p.config.closeWindows&&!p.config.sound&&!p.config.sfx&&!p.config.moveWindows&&!p.config.knockCursor)'));
  assert.equal(await ui('document.querySelector("#name").value'), 'My little friend');
  assert.equal(await ui('document.querySelector("#color").value'), '#596cb2');
  assert.equal(listens, 0, 'offline build started a loopback service');
  console.log('PASS release: four customer tabs, onboarding, quiet fresh defaults, old identity/colour preserved, integrations forced offline, no loopback service');

  await ui('document.querySelector("#finishIntro").click()');
  await until(() => ui('document.querySelector("#welcome").hidden'), 'intro acknowledged');
  await ui('document.querySelector("#chatText").value="my name is Sam";document.querySelector("#chatForm").requestSubmit()');
  await until(() => ui('document.querySelector("#chatLog").textContent.includes("Sam")'), 'local dialogue');
  await ui('document.querySelector("#newChat").click();document.querySelector("#keepChat").click()');
  assert(await ui('document.querySelector("#chatLog").textContent.includes("Sam")'));
  await ui('document.querySelector("#name").value="Clover";document.querySelector("#name").dispatchEvent(new Event("change"))');
  await until(() => run('window.pet.config.name==="Clover"'), 'name persisted through IPC');
  await ui('document.querySelector("[data-tab=things]").click();document.querySelector("[data-supply=handheld]").click();document.querySelector("#openBag").click()');
  await until(() => run('window.toolBag.isOpen && window.pet.items.list.some(i=>i.def.id==="handheld")'), 'bag and supply');
  await run('window.toolBag.close()');
  await ui('document.querySelector("[data-tab=activities]").click();document.querySelector("#openActivities").click()');
  await until(() => run('window.toolBag.isOpen && document.querySelector("#bagActivities").getAttribute("aria-pressed")==="true"'), 'real activity chooser');
  await run('window.toolBag.close()');
  console.log('PASS release IPC: local dialogue, reset cancellation, rename, supplies, bags and contextual activity chooser');

  await ui('document.querySelector("[data-tab=settings]").click();document.querySelector("#pause").click()');
  await pause(100); const stopped = await run('window.pet.ctx.world.time'); await pause(300);
  assert.equal(await run('window.pet.ctx.world.time'), stopped, 'pause continued simulation');
  await ui('document.querySelector("#pause").click();document.querySelector("#hide").click()');
  await until(() => !overlay.isVisible(), 'hide');
  await ui('document.querySelector("#hide").click()');
  await until(() => overlay.isVisible(), 'show');
  await until(() => run(`window.pet.ctx.world.time>${stopped}`), 'resume simulation');
  console.log('PASS release: Pause freezes simulation, Hide/Show controls the real overlay, resume restores the same buddies');

  // Full browser storage makes failure visible and retains the previous save.
  await run('window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith("pet-save"))throw new Error("QuotaExceededError");return window.originalSetItem.call(this,k,v)};window.petShell.retrySaves()');
  await until(() => run('!document.querySelector("#saveNotice").hidden'), 'visible quota failure');
  await run('Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;window.petShell.retrySaves()');
  await until(() => run('document.querySelector("#saveNotice").hidden'), 'save retry');
  const originalWrite = fs.writeFileSync;
  try {
    fs.writeFileSync = function(file, ...args) { if (String(file) === path.join(dir, 'memory.json.tmp')) throw new Error('Injected disk-full'); return originalWrite.call(this, file, ...args); };
    const result = await run('window.petShell.saveMemory(0,window.pet.memory.save())'); assert.equal(result.ok, false);
    await until(() => ui('!document.querySelector("#health").hidden'), 'acknowledged memory error');
  } finally { fs.writeFileSync = originalWrite; }
  await run('window.petShell.retrySaves()');
  await until(() => ui('document.querySelector("#health").hidden'), 'healthy memory retry');
  assert.deepEqual(await run('window.petShell.getSaveHealth()'), { issues: [] });
  console.log('PASS release: injected storage quota and disk-write failures are visible, acknowledged and recover after Retry');

  await run('window.petShell.setConfig({mind:"full",browserPlay:true,fileHomes:true})');
  await until(() => run('window.pet.config.mind==="offline"&&!window.pet.config.fileHomes&&!window.pet.config.browserPlay'), 'release scope enforcement');
  const oldCount = await run('window.pet.props.placed.length');
  await run('window.petShell.retrySaves()'); await pause(400);
  overlay.reload();
  await until(() => !overlay.webContents.isLoading() && run('window.pets?.length===2 && window.pet.config.name==="Clover"'), 'reload restored identity');
  assert.equal(await run('window.pet.props.placed.length'), oldCount, 'starter scene duplicated on reload');
  assert(await run('window.pet.items.list.some(i=>i.def.id==="handheld")'));
  assert(await run('window.pet.brain.log.some(l=>l.text.includes("Sam"))'));
  console.log('PASS release: reload retains name, dialogue, owned items and exact furniture count without reseeding');

  const saveDialog = dialog.showSaveDialog;
  try {
    const backupPath = path.join(dir, 'exported-backup.json');
    fs.writeFileSync(path.join(dir, 'ai-keys.bin'), 'do-not-export-credential');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: backupPath });
    assert.equal((await ui('window.petShell.exportBackup()')).ok, true);
    const text = fs.readFileSync(backupPath, 'utf8'), backup = JSON.parse(text);
    assert.equal(backup.format, 'mallow-desk-buddies');assert.equal(backup.configs[0].name, 'Clover');
    assert(backup.worlds.length === 5 && backup.memories.length === 5);
    assert(!text.includes('do-not-export-credential'));
    dialog.showSaveDialog = async () => ({ canceled: true });
    assert.equal((await ui('window.petShell.exportBackup()')).ok, false);
  } finally { dialog.showSaveDialog = saveDialog; }
  console.log('PASS release: full JSON backup contains every stable identity, excludes credential files and respects cancellation');

  settings.setSize(560, 900);
  await ui('document.querySelector("[data-tab=buddies]").click();window.scrollTo(0,0)'); await pause(200);
  fs.writeFileSync(path.join(output, 'buddies.png'), (await settings.webContents.capturePage()).toPNG());
  await ui('document.querySelector("[data-tab=settings]").click()'); await pause(100);
  fs.writeFileSync(path.join(output, 'settings.png'), (await settings.webContents.capturePage()).toPNG());
  settings.setSize(380, 640);
  assert(await ui('document.documentElement.scrollWidth<=innerWidth'));
  await ui('document.querySelector("[data-tab=activities]").click()');
  assert(await ui('document.documentElement.scrollWidth<=innerWidth'));
  fs.writeFileSync(path.join(output, 'small-screen.png'), (await settings.webContents.capturePage()).toPNG());
  await run('document.body.style.background="#ecebdf";window.pets.forEach(p=>{p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.paused=false;p.mood.asleep=false;p.char.standUp();p.char.placeHome(520+window.pets.indexOf(p)*230);p.command("do:read")})');
  await pause(5000);
  fs.writeFileSync(path.join(output, 'desktop.png'), (await overlay.webContents.capturePage()).toPNG());
  assert.deepEqual(requests, [], 'commercial edition attempted a network request');
  assert.deepEqual(errors, [], 'runtime errors');
  passed = true;
  fs.writeFileSync(path.join(output, 'electron.json'), JSON.stringify({ platform: process.platform, electron: process.versions.electron, source: require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), result: 'passed', nativeWindows: 'simulated', networkRequests: requests, errors }, null, 2));
  console.log('PASS release: customer screenshots, 380px layout, no runtime exceptions or network requests; requesting acknowledged quit');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => {
  clearTimeout(timeout);
  if (!passed) return;
  assert(JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')).name, 'Clover');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'product-state.json'), 'utf8')).introDone, true);
  global.fetch = fetch; http.Server.prototype.listen = listen;
  console.log('PASS release: real quit flush acknowledged before teardown; configs and memories exist on disk');
  fs.rmSync(dir, { recursive: true, force: true });
});
