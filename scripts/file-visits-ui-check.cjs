// File/folder repair UI verification with explicit fake native reports and disposable app data.
// Does not test Finder / Explorer detection or platform permissions. Build before running.
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
require('../dist/electron/main.js');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn) { for (let i = 0; i < 160; i++) { if (await fn()) return; await pause(50); } throw new Error('Electron readiness timed out'); }
app.whenReady().then(async () => {
  let overlay, settings;
  await until(() => {overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/app/index.html'));return overlay&&!overlay.webContents.isLoading();});
  await until(() => overlay.webContents.executeJavaScript('!!window.pet'));
  await overlay.webContents.executeJavaScript('window.petShell.openSettings(0)');
  await until(() => {settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/'));return settings&&!settings.webContents.isLoading();});
  await settings.webContents.executeJavaScript('window.petShell.setConfig({fileHomes:true,figureCount:5,friend:{on:true}},0)');
  await until(() => overlay.webContents.executeJavaScript('window.pets.length===5 && window.pet.config.fileHomes'));
  for(let id=0;id<5;id++)overlay.webContents.send('desktop:habitat',{id,path:'/test/five-visitors',kind:'folder'});
  await until(()=>overlay.webContents.executeJavaScript('window.figurePool.every((_,id)=>window.habitats.isAway(id))'));
  process.env.PET_FAKE_FILES=JSON.stringify([{id:1,path:'/test/five-visitors',kind:'folder',x:100,y:350,width:350,height:300}]);
  overlay.webContents.send('world:files',[{id:1,path:'/test/five-visitors',kind:'folder',x:100,y:350,width:350,height:300}]);
  await until(()=>overlay.webContents.executeJavaScript('window.habitats.activePets.length===5'));
  await overlay.webContents.executeJavaScript('for(const p of window.habitats.activePets){p.paused=true;p.mind.holdUntil=Infinity;p.config.destructible=false;}');
  await pause(1800);
  assert.equal(await overlay.webContents.executeJavaScript("window.habitats.activePets.length"),5);
  assert.equal(await overlay.webContents.executeJavaScript("new Set(window.habitats.activePets.map(p=>Math.round(p.char.x))).size"),5);
  assert.deepEqual(await overlay.webContents.executeJavaScript('window.checkSanity()'),[]);
  fs.mkdirSync(path.join(__dirname,'../.build'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../.build/file-visitors-five-cloud.png'),(await overlay.webContents.capturePage()).toPNG());
  process.env.PET_FAKE_FILES='[]';
  overlay.webContents.send('world:files',[]);
  await settings.webContents.executeJavaScript('(() => {const s=document.querySelector("#figureTarget");s.value="all";s.dispatchEvent(new Event("change"));document.querySelector("[data-tab=him]").click();})()');
  await until(()=>settings.webContents.executeJavaScript('document.querySelector("#fileLocations").textContent.includes("Ruby") && document.querySelector("#fileLocations").textContent.includes("Waiting for its window")'));
  assert.equal(await settings.webContents.executeJavaScript('document.querySelector("#returnHome").textContent'),'Return all visitors');
  assert(await settings.webContents.executeJavaScript('document.querySelector("#chooseHabitat").disabled && document.querySelector("#chooseFile").disabled'));
  await settings.webContents.executeJavaScript('document.querySelector("#fileSupport").scrollIntoView({block:"start"});window.scrollBy(0,-220)');
  await pause(500);
  fs.writeFileSync(path.join(__dirname,'../.build/file-visits-all-cloud.png'),(await settings.webContents.capturePage()).toPNG());
  const at=await settings.webContents.executeJavaScript('(() => {const r=document.querySelector("#returnHome").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()');
  settings.webContents.sendInputEvent({type:'mouseMove',...at});
  settings.webContents.sendInputEvent({type:'mouseDown',...at,button:'left',clickCount:1});
  settings.webContents.sendInputEvent({type:'mouseUp',...at,button:'left',clickCount:1});
  await until(()=>overlay.webContents.executeJavaScript('window.figurePool.every((_,id)=>!window.habitats.isAway(id)) && JSON.parse(localStorage.getItem("file-homes")).length===0'));
  assert.deepEqual(await overlay.webContents.executeJavaScript('window.checkSanity()'),[]);
  assert.deepEqual(issues,[]);
  console.log('PASS focused Electron: five separated visitors, All status/disabled choices, actual pointer Return all, immediate save, live sanity (fake native reports)');app.quit();
}).catch(e=>{console.error(e);process.exitCode=1;app.exit(1);});
app.on('will-quit',()=>fs.rmSync(dir,{recursive:true,force:true}));
