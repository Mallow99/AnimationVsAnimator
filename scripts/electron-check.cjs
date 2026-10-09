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
  const execute = web.executeJavaScript.bind(web);
  web.executeJavaScript = async (source, ...args) => {
    try { return await execute(source, ...args); }
    catch (error) { console.error('Failed smoke script:', source); throw error; }
  };
});
// Upgrade an existing install, while keeping an edited example and a deleted example.
const examplesDir=path.join(dir,'items');fs.mkdirSync(examplesDir);
const history=require('../assets/builtin-history.json');
for(const name of ['book','couch','console'])fs.writeFileSync(path.join(examplesDir,name+'.json'),JSON.stringify(history[name+'.json'].at(-1)));
const editedSponge={...require('../src/core/items/sponge.json'),name:'My sponge'};
fs.writeFileSync(path.join(examplesDir,'sponge.json'),JSON.stringify(editedSponge));
fs.writeFileSync(path.join(examplesDir,'.copied.json'),JSON.stringify(['book.json','couch.json','sponge.json','cup.json','console.json']));
require('../dist/electron/main.js');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn) { for (let i = 0; i < 160; i++) { if (await fn()) return; await pause(50); } throw new Error('Electron readiness timed out'); }
app.whenReady().then(async () => {
  let overlay, settings;
  await until(() => { overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/app/index.html')); return !!overlay && !overlay.webContents.isLoading(); });
  await until(() => overlay.webContents.executeJavaScript('!!window.pet'));
  await until(()=>fs.existsSync(path.join(examplesDir,'bookshelf.json')));
  for(const [name,kind]of [['book','items'],['couch','props'],['console','items']])assert.deepEqual(JSON.parse(fs.readFileSync(path.join(examplesDir,name+'.json'),'utf8')),require('../src/core/'+kind+'/'+name+'.json'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(examplesDir,'sponge.json'),'utf8')),editedSponge);
  assert(!fs.existsSync(path.join(examplesDir,'cup.json')),'an owner-deleted example returned');
  console.log('PASS Electron upgrade: stock book/couch/console updated, custom sponge kept, deleted example kept deleted, new bookshelf supplied');

  await until(() => overlay.webContents.executeJavaScript('window.pet.ctx.world.windows.length === 1'));
  await overlay.webContents.executeJavaScript('window.petShell.openSettings()');
  await until(() => { settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/settings/index.html?pet=0')); return !!settings && !settings.webContents.isLoading(); });
  assert.equal(await settings.webContents.executeJavaScript('document.querySelector("#aiInterval").value'), '40');
  await settings.webContents.executeJavaScript('window.petShell.setConfig({aiInterval:120})');
  await until(() => overlay.webContents.executeJavaScript('window.pet.config.aiInterval === 120'));
  await settings.webContents.executeJavaScript('document.querySelector("[data-tab=items]").click(); window.petShell.command("sync")');
  await settings.webContents.executeJavaScript('document.querySelector("#openInventory").click()');
  await until(() => overlay.webContents.executeJavaScript('window.toolBag.isOpen'));
  await overlay.webContents.executeJavaScript('document.querySelector("#bagSupplies").click();document.querySelector(".bag-choice[data-id=helmet]").click();document.querySelector("#bagDetails [data-action=give]").click();document.querySelector("#bagPanel header button:last-child").click()');
  await until(() => overlay.webContents.executeJavaScript('window.pet.items.onHim.some(i => i.def.id === "helmet" && i.where === "worn")'));
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
  // Bag focus/drag/close passes through the actual preload IPC and Electron input path.
  assert(await overlay.webContents.executeJavaScript('document.querySelector("#grabBag").hidden && document.querySelector("#trashCan").hidden'));
  await settings.webContents.executeJavaScript('window.petShell.setConfig({showBag:true,showTrash:true})');
  await until(() => overlay.webContents.executeJavaScript('!document.querySelector("#grabBag").hidden'));
  await overlay.webContents.executeJavaScript('for(const p of window.pets){p.mind.reset(p.ctx);p.paused=true;}document.querySelector("#grabBag").click()');
  assert(!overlay.isFocusable(), 'pointer opening a bag changed native focus');
  assert(await overlay.webContents.executeJavaScript('!document.querySelector("#bagPanel").hidden'));
  const card = await overlay.webContents.executeJavaScript('(() => {const el=document.querySelector(".bag-choice[data-id=book]");el.scrollIntoView({block:"nearest"});const r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()');
  overlay.webContents.sendInputEvent({type:'mouseMove',...card});
  overlay.webContents.sendInputEvent({type:'mouseDown',...card,button:'left',clickCount:1});
  overlay.webContents.sendInputEvent({type:'mouseMove',x:card.x+10,y:card.y});
  await until(() => overlay.webContents.executeJavaScript('window.toolBag.dragging'));
  await overlay.webContents.executeJavaScript('window.electronBagBook=window.toolBag.tools.held.object');
  assert(!overlay.isFocusable(), 'pointer pulling an item changed native focus');
  const bin = await overlay.webContents.executeJavaScript('(() => {const r=document.querySelector("#trashCan").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()');
  overlay.webContents.sendInputEvent({type:'mouseMove',...bin});
  overlay.webContents.sendInputEvent({type:'mouseUp',...bin,button:'left',clickCount:1});
  await until(() => overlay.webContents.executeJavaScript('!window.toolBag.dragging && !document.querySelector("#undoTrash").hidden'));
  await until(() => !overlay.isFocusable());
  assert(await overlay.webContents.executeJavaScript('!window.pet.items.list.includes(window.electronBagBook)'));
  await overlay.webContents.executeJavaScript('document.querySelector("#undoTrash").click()');
  assert(await overlay.webContents.executeJavaScript('window.pet.items.list.includes(window.electronBagBook)'));
  await overlay.webContents.executeJavaScript('document.querySelector("#grabBag").click()');
  assert(!overlay.isFocusable(), 'reopening the bag changed native focus');
  await overlay.webContents.executeJavaScript('document.querySelector("#bagKeyboard").click()');
  await until(() => overlay.isFocusable());
  await overlay.webContents.executeJavaScript('document.querySelector("#grabBag").click()');
  await until(() => !overlay.isFocusable());
  await overlay.webContents.executeJavaScript('document.querySelector("#grabBag").click();document.querySelector("#bagKeyboard").click()');
  await until(() => overlay.isFocusable());
  await overlay.webContents.executeJavaScript('document.querySelector(".bag-choice[data-id=book]").focus()');
  overlay.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
  overlay.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  await until(() => overlay.webContents.executeJavaScript('!document.querySelector("#bagDetails").hidden'));
  assert(overlay.isFocusable(), 'selecting an item lost keyboard focus');
  assert(await overlay.webContents.executeJavaScript('window.toolBag.isOpen && !window.toolBag.dragging'));
  await overlay.webContents.executeJavaScript('document.querySelector("#bagDetails [data-action=place]").focus()');
  overlay.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
  overlay.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  await until(() => overlay.webContents.executeJavaScript('window.toolBag.dragging'));
  assert(overlay.isFocusable(),'keyboard pull lost focus before Escape could cancel');
  overlay.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  overlay.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until(() => !overlay.isFocusable());
  assert(await overlay.webContents.executeJavaScript('!window.toolBag.dragging'));
  console.log('PASS Electron: optional pixel bag, real pointer pull/trash/undo without changing native focus, explicit keyboard navigation and close return focus');
  await overlay.webContents.executeJavaScript('for(const p of window.pets)p.paused=false');
  // The second stick figure: their own settings window in their own color, their own config, the shared
  // settings kept in step, their own talk box and memory file.
  await until(() => overlay.webContents.executeJavaScript('window.pets.length === 2'));
  await overlay.webContents.executeJavaScript('window.petShell.openSettings(1)');
  await until(() => settings.webContents.executeJavaScript('document.querySelector("#figureTarget").value === "1"'));
  assert.equal(BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/settings/')).length,1,'settings must reuse one window');
  const accent = (w) => w.webContents.executeJavaScript('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()');
  await until(async () => (await accent(settings)) === '#f7931e');
  assert.match(settings.getTitle(), /Stickmen/);
  await settings.webContents.executeJavaScript('document.querySelector("[data-tab=him]")?.click()');
  fs.writeFileSync(path.join(__dirname, '../.build/settings-pet2.png'), (await settings.webContents.capturePage()).toPNG());
  await settings.webContents.executeJavaScript('const color=document.querySelector("#color");color.value="#22aa55";color.dispatchEvent(new Event("input"));');
  await until(() => overlay.webContents.executeJavaScript('window.pets[1].config.look.color === "#22aa55"'));
  await until(async () => (await accent(settings)) === '#22aa55');
  assert.equal(await overlay.webContents.executeJavaScript('window.pets[0].config.look.color'), '#4450d6');
  await settings.webContents.executeJavaScript('window.petShell.setConfig({fightMode:"real"},1)');
  await until(() => overlay.webContents.executeJavaScript('window.pets[0].config.fightMode === "real" && window.pets[1].config.fightMode === "real"'));
  await settings.webContents.executeJavaScript('const select=document.querySelector("#figureTarget");select.value="all";select.dispatchEvent(new Event("change"));document.querySelector("#openInventory").click()');
  await until(() => overlay.webContents.executeJavaScript('document.querySelector("#bagOwner").value === "all"'));
  await overlay.webContents.executeJavaScript('document.querySelector("#bagSupplies").click();document.querySelector(".bag-choice[data-id=cup]").click();document.querySelector("#bagDetails [data-action=give]").click();document.querySelector("#bagPanel header button:last-child").click()');
  assert(await overlay.webContents.executeJavaScript('window.pets.every(p=>p.items.list.some(i=>i.def.id==="cup"))'));
  await overlay.webContents.executeJavaScript('window.pets[1].onTalk()');
  await until(() => overlay.isFocusable());
  assert.match(await overlay.webContents.executeJavaScript('document.querySelector("#talkText").placeholder'), /Amber/);
  await overlay.webContents.executeJavaScript(`(() => { const input = document.querySelector('#talkText'); input.value = 'hello'; document.querySelector('#talk').requestSubmit(); })()`);
  await until(() => overlay.webContents.executeJavaScript('window.pets[1].brain.log.some(l => l.who === "him")'));
  await overlay.webContents.executeJavaScript('document.querySelector("#talkClose").click()');
  await until(() => !overlay.isFocusable());
  await overlay.webContents.executeJavaScript('window.petShell.saveMemory(0, JSON.stringify({summary:"smoke",notes:[]})); window.petShell.saveMemory(1, JSON.stringify({summary:"smoke two",notes:[]}))');
  await until(() => fs.existsSync(path.join(dir, 'memory.json')) && fs.existsSync(path.join(dir, 'memory-2.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'memory.json'), 'utf8')).summary, 'smoke');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'memory-2.json'), 'utf8')).summary, 'smoke two');
  await until(() => fs.existsSync(path.join(dir, 'pet-2.json')));
  await settings.webContents.executeJavaScript('document.querySelector("#sanityCheck").click()');
  await until(()=>settings.webContents.executeJavaScript('document.querySelector("#sanityResult").textContent.startsWith("Passed:")'));
  console.log('PASS Electron live sanity check bridge and development UI');
  await settings.webContents.executeJavaScript('(() => {const select=document.querySelector("#figureTarget");select.value="1";select.dispatchEvent(new Event("change"));window.petShell.command("sync");})()');
  await until(()=>settings.webContents.executeJavaScript('document.querySelector("#socialBars").children.length===3 && document.querySelector("#friendships").textContent.includes("Cobalt")'));
  assert(await settings.webContents.executeJavaScript('document.querySelector("#socialBars").closest("details").open===false'));
  assert(await overlay.webContents.executeJavaScript('window.pet.items.defs.has("flowers")'));
  await settings.webContents.executeJavaScript('document.querySelector("[data-tab=mood]").click();document.querySelector("#socialBars").closest("details").open=true');
  fs.writeFileSync(path.join(__dirname, '../.build/pq2-friendship-settings.png'), (await settings.webContents.capturePage()).toPNG());
  console.log('PASS Electron personalization: three social dials and named friendships in collapsed details, default name migration, new flowers and stock-console upgrade');

  assert.deepEqual(issues, []);
  console.log('PASS Electron: overlay, fake helper, settings inventory, Othello/chat focus, configuration, two stick figures (one settings window with target selection, distinct color, All figures supplies, shared settings, talk box, memory file)');
  app.quit();
}).catch((err) => { console.error(err); process.exitCode = 1; app.exit(1); });
app.on('will-quit', () => {
  if (!process.exitCode) {
    try { assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')).aiInterval, 120); }
    catch (err) { console.error(err); process.exitCode = 1; }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
