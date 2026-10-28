// Actual customer preload/IPC/renderer acceptance for Arnold and live activity feedback.
// Linux's native window reports are deliberately simulated; real OS restarts live in native-package-smoke.
const {app,BrowserWindow,session,dialog}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mallow-bonus-'));
process.env.PET_DATA_DIR=dir;process.env.PET_FAKE_WINDOWS='[]';app.disableHardwareAcceleration();
const errors=[],requests=[],output=path.resolve('.build/release');fs.mkdirSync(output,{recursive:true});
app.on('web-contents-created',(_e,web)=>{
 web.on('render-process-gone',(_e,d)=>errors.push('renderer '+d.reason));
 web.on('did-fail-load',(_e,code,description)=>errors.push(`load ${code}: ${description}`));
 web.on('console-message',(_e,d)=>{if(d.level==='error'){errors.push(d.message);console.error('Renderer:',d.message);}});
});
require('../dist/electron/main.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await pause(50);}throw Error('Timed out: '+label);}
let passed=false;
const timeout=setTimeout(()=>{console.error('Bonus QA exceeded 150 seconds');app.exit(1);},150000);
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,done)=>{requests.push(d.url);done({cancel:true});});
 let overlay,settings;
 await until(()=>{overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/app/index.html'));settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/index.html'));return overlay&&settings&&!overlay.webContents.isLoading()&&!settings.webContents.isLoading();},'customer windows');
 const run=s=>overlay.webContents.executeJavaScript(s).catch(e=>{throw Error('Overlay expression failed: '+s.slice(0,260)+'\n'+e.message)}),ui=s=>settings.webContents.executeJavaScript(s).catch(e=>{throw Error('Settings expression failed: '+s.slice(0,260)+'\n'+e.message)});
 await until(()=>run('window.pets?.length===2 && window.pet.props.placed.length===3'),'starter scene');
 assert.equal((await ui('window.petShell.getConfigs()')).length,5);
 const originals=await ui('window.petShell.getConfigs()');
 const firstName=originals[0].name;
 await ui('window.petShell.setConfig({name:"Locked alias must not change Cobalt"},5)');await pause(80);
 assert.equal((await ui('window.petShell.getConfigs()'))[0].name,firstName);
 const invalid=await ui('window.petShell.redeemCode("NO-SUCH-CODE")');assert.equal(invalid.ok,false);
 assert.equal((await ui('window.petShell.getConfigs()')).length,5);
 await ui('document.querySelector("#finishIntro").click()');
 await until(()=>ui('document.querySelector("#welcome").hidden'),'welcome acknowledged');
 const originalWrite=fs.writeFileSync;
 try{
  fs.writeFileSync=function(file,...args){if(String(file)===path.join(dir,'product-state.json.tmp'))throw Object.assign(Error('Injected disk full'),{code:'ENOSPC'});return originalWrite.call(this,file,...args);};
  const failed=await ui('window.petShell.redeemCode("ARNOLD")');assert.equal(failed.ok,false);
 }finally{fs.writeFileSync=originalWrite;}
 assert.equal((await ui('window.petShell.getConfigs()')).length,5);
 await ui('window.petShell.retrySaves()');await pause(80);
 assert.equal((await ui('window.petShell.getConfigs()')).length,5,'failed redemption was secretly retried');
 assert(!(await ui('window.petShell.getSaveHealth()')).issues.some(i=>i.key==='setup'),'successful retry left a stale setup warning');
 assert(!JSON.parse(fs.readFileSync(path.join(dir,'product-state.json'),'utf8')).unlockedCharacters?.includes('arnold'));
 console.log('PASS bonus: five fresh identities, invalid code and locked id are inert, failed atomic unlock does not leak a sixth profile');

 await ui('document.querySelector("#chatText").value="my name is Sam";document.querySelector("#chatForm").requestSubmit()');
 await until(()=>run('window.pet.brain.log.some(l=>l.text.includes("Sam"))'),'Cobalt conversation');
 const firstBook=await run('window.pet.items.list.find(i=>i.def.id==="book").uid');
 await ui('window.petShell.setConfig({figureCount:5,spawnOrder:[0,1,2,3,4]},0);window.__bonusRosterEvents=0;window.petShell.onRoster(()=>window.__bonusRosterEvents++)');
 await until(()=>run('window.pets.length===5'),'five original buddies');
 await ui('document.querySelector("[data-tab=settings]").click();document.querySelector("#bonusCode").value="  aRnOlD  ";document.querySelector("#bonusForm").requestSubmit()');
 await until(()=>ui('document.querySelector("#bonusStatus").textContent.includes("Arnold unlocked")'),'actual redemption form');
 await until(()=>run('window.figurePool.length===6 && window.figurePool[5]?.config.name==="Arnold"'),'sixth stable profile');
 const unlocked=await ui('window.petShell.getConfigs()');assert.equal(unlocked.length,6);assert.equal(unlocked[5].name,'Arnold');assert.equal(unlocked[5].look.tattoo,'jt');
 assert.equal(await run('window.pets.length'),5,'redemption silently added a sixth active figure');
 assert.equal(await ui('window.__bonusRosterEvents'),1);
 const repeated=await ui('window.petShell.redeemCode("ARNOLD")');assert(repeated.ok&&repeated.alreadyUnlocked);assert.equal(repeated.configs.length,6);assert.equal(await ui('window.__bonusRosterEvents'),1);
 await ui('document.querySelector("#bringArnold").click()');
 assert.equal(await ui('document.querySelector("#buddy").value'),'5');
 assert(await ui('document.querySelectorAll("#roster input")[5].disabled'));
 assert.equal(await run('window.pets.some(p=>p===window.figurePool[5])'),false,'Meet Arnold silently replaced an existing buddy');
 await ui('document.querySelectorAll("#roster input")[4].click()');
 await until(()=>run('window.pets.length===4'),'rest Ruby');
 await ui('document.querySelectorAll("#roster input")[5].click()');
 await until(()=>run('window.pets.length===5 && window.pets.includes(window.figurePool[5]) && !window.pets.includes(window.figurePool[4])'),'bring Arnold without replacement');
 assert(await run(`window.pet.items.list.some(i=>i.uid===${firstBook}) && window.pet.brain.log.some(l=>l.text.includes("Sam"))`));
 for(let id=0;id<5;id++){const c=(await ui('window.petShell.getConfigs()'))[id];assert.equal(c.name,originals[id].name);assert.deepEqual(c.look,originals[id].look);assert.equal(c.personality,originals[id].personality);}
 console.log('PASS bonus: trimmed mixed-case form unlock, idempotent code, six saved/five active, explicit capacity handling and original belongings/chat preserved');

 await run('for(const p of window.pets){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;p.paused=true;}for(let n=0;n<600;n++)for(const p of window.pets)p.update(1/120);for(const p of window.pets)p.paused=false;');
 await ui('document.querySelector("[data-tab=activities]").click()');
 await until(()=>ui('!document.querySelector("[data-activity=dance]").disabled'),'live activity readiness');
 const refused=await ui('window.petShell.requestActivity(5,"handheld")');assert.equal(refused.accepted,false);assert.match(refused.message,/handheld/i);
 assert(await ui('document.querySelector("[data-activity=handheld]").disabled'));
 await ui('document.querySelector("[data-activity=dance]").click()');
 await until(()=>ui('document.querySelector("#activityHelp").textContent.includes("requested")'),'actual activity acknowledgment');
 await until(()=>ui('/Dancing|Getting ready to dance/.test(document.querySelector("#currentActivity").textContent)'),'live activity label');
 await ui('window.petShell.setSession({paused:true})');
 await until(()=>ui('document.querySelector("[data-activity=dance]").disabled'),'paused controls');
 assert.equal((await ui('window.petShell.requestActivity(5,"read")')).accepted,false);
 await ui('window.petShell.setSession({paused:false})');
 console.log('PASS activities: real missing-supply rejection, button availability, acknowledged request, current label and pause guard');

 const render=await run(`(()=>{
  const p=window.figurePool[5];p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.paused=true;p.mood.asleep=false;
  for(let n=0;n<360;n++)p.update(1/120);
  const original={...p.config.look},draw=()=>{const c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;p.draw(c.getContext('2d'),false);return c;};
  const compare=pixel=>{p.config.look.pixel=pixel;p.config.look.tattoo='none';const a=draw().getContext('2d').getImageData(0,0,innerWidth,innerHeight).data;p.config.look.tattoo='jt';const b=draw().getContext('2d').getImageData(0,0,innerWidth,innerHeight).data;let changed=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;return changed;};
  const attached=[compare(1),compare(2)],before=JSON.stringify(p.char.body.points.map(q=>[q.x,q.y,q.z]));draw();const stable=before===JSON.stringify(p.char.body.points.map(q=>[q.x,q.y,q.z]));
  p.char.destructible=true;const piece=p.char.detach('armL');if(!piece)throw Error('Tattoo arm did not detach');
  const detached=[compare(1),compare(2)];
  const c=document.createElement('canvas');c.width=900;c.height=340;const g=c.getContext('2d');g.fillStyle='#f4f0e5';g.fillRect(0,0,900,340);g.fillStyle='#293a32';g.font='600 21px system-ui';g.fillText('Arnold · JT follows the actual upper arm',24,35);g.font='14px system-ui';g.fillText('Actual customer renderer · smooth and pixel styles · detached arm',24,60);
  p.char.regrow('armL');p.applyConfig({...p.config,scale:2.5,look:{...original,tattoo:'jt'}});p.char.placeHome(500);for(let n=0;n<500;n++)p.update(1/120);
  for(const [i,pixel]of [1,2].entries()){p.config.look.pixel=pixel;g.save();g.translate(220+i*360-p.char.x,305-p.char.groundY());p.draw(g,false);g.restore();g.fillStyle='#42664e';g.fillText(pixel===1?'Smooth':'Pixel 2',170+i*360,90);}
  p.char.destructible=true;p.char.detach('armL');p.config.look.pixel=1;const d=draw().toDataURL();p.char.regrow('armL');p.applyConfig({...p.config,scale:1.1,look:original});p.paused=false;
  return {attached,detached,stable,atlas:c.toDataURL(),detachedImage:d};
 })()`);
 assert(render.stable);assert(render.attached.every(n=>n>0),'JT vanished in smooth/pixel attached-arm render');assert(render.detached.every(n=>n>0),'JT vanished when the original arm detached');
 fs.writeFileSync(path.join(output,'arnold-render.png'),Buffer.from(render.atlas.split(',')[1],'base64'));fs.writeFileSync(path.join(output,'arnold-detached.png'),Buffer.from(render.detachedImage.split(',')[1],'base64'));
 console.log('PASS Arnold render: tattoo changes actual smooth/pixel pixels, follows detached arm and leaves geometry unchanged');

 await run('(()=>{const p=window.figurePool[5];p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;const b=p.items.list.find(i=>i.def.id==="book")??p.items.give("book",p.char);b.bookmark=37;p.memory.add("Arnold integration memory","event","you",2);p.command("hear:my name is Jordan");})()');
 await until(()=>run('window.figurePool[5].brain.log.some(l=>l.text.includes("Jordan"))'),'Arnold conversation');
 await run('window.petShell.retrySaves()');
 await until(()=>fs.existsSync(path.join(dir,'memory-6.json'))&&JSON.parse(fs.readFileSync(path.join(dir,'memory-6.json'),'utf8')).notes.some(n=>n.text==='Arnold integration memory'),'sixth memory file');
 const saveDialog=dialog.showSaveDialog,backupPath=path.join(dir,'bonus-backup.json');
 try{dialog.showSaveDialog=async()=>({canceled:false,filePath:backupPath});assert.equal((await ui('window.petShell.exportBackup()')).ok,true);}finally{dialog.showSaveDialog=saveDialog;}
 const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.version,2);assert.deepEqual(backup.productState.unlockedCharacters,['arnold']);assert.equal(backup.configs.length,6);assert.equal(backup.worlds.length,6);assert.equal(backup.memories.length,6);assert.equal(backup.configs[5].look.tattoo,'jt');
 await pause(300);overlay.reload();
 await until(()=>!overlay.webContents.isLoading()&&run('window.figurePool?.length===6 && window.pets?.some(p=>p===window.figurePool[5])'),'overlay restores Arnold');
 assert(await run('window.figurePool[5].items.list.some(i=>i.def.id==="book"&&i.bookmark===37)'));
 await until(()=>run('window.figurePool[5].memory.notes.some(n=>n.text==="Arnold integration memory")'),'restored Arnold memory');
 assert(await run('window.figurePool[5].brain.log.some(l=>l.text.includes("Jordan"))'));
 settings.reload();
 await until(()=>!settings.webContents.isLoading()&&ui('document.querySelector("#buddy").options.length===6'),'Settings restores six profiles');
 await ui('document.querySelector("#buddy").value="5";document.querySelector("#buddy").dispatchEvent(new Event("change"))');
 assert(await ui('!document.querySelector("#tattooOption").hidden && document.querySelector("#tattoo").checked'));
 assert.equal((await ui('window.petShell.productInfo()')).state.unlockedCharacters[0],'arnold');
 settings.setSize(560,900);await ui('document.querySelector("[data-tab=settings]").click();document.querySelector("#bonusForm").scrollIntoView({block:"center"})');await pause(200);
 fs.writeFileSync(path.join(output,'bonus-settings.png'),(await settings.webContents.capturePage()).toPNG());
 settings.setSize(380,640);await ui('document.querySelector("[data-tab=buddies]").click()');assert(await ui('document.documentElement.scrollWidth<=innerWidth'));await pause(150);fs.writeFileSync(path.join(output,'bonus-small.png'),(await settings.webContents.capturePage()).toPNG());
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 passed=true;fs.writeFileSync(path.join(output,'bonus-electron.json'),JSON.stringify({result:'passed',platform:process.platform,nativeWindows:'simulated',source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),render:{attached:render.attached,detached:render.detached},networkRequests:requests,errors},null,2));
 console.log('PASS persistence: sixth book/bookmark, private conversation/memory, backup v2/unlock state and both renderer reloads');
 app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
app.on('will-quit',()=>{clearTimeout(timeout);if(passed){assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'pet-6.json'),'utf8')).look.tattoo,'jt');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'product-state.json'),'utf8')).unlockedCharacters,['arnold']);console.log('PASS bonus: real acknowledged quit retains sixth config and unlocked product state');}fs.rmSync(dir,{recursive:true,force:true});});
