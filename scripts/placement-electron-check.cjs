// Customer bag and overlay integration. Native window positions are simulated on Linux.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mallow-placement-'));
process.env.PET_DATA_DIR=dir;process.env.PET_FAKE_WINDOWS='[]';app.disableHardwareAcceleration();
const errors=[],requests=[],output=path.resolve('.build/release');fs.mkdirSync(output,{recursive:true});
app.on('web-contents-created',(_e,web)=>{
 web.on('render-process-gone',(_e,d)=>errors.push('renderer '+d.reason));
 web.on('did-fail-load',(_e,code,description)=>errors.push(`load ${code}: ${description}`));
 web.on('console-message',(_e,d)=>{if(d.level==='error')errors.push(d.message);});
});
require('../dist/electron/main.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<300;i++){if(await fn())return;await pause(50);}throw Error('Timed out: '+label);}
let passed=false;
const timeout=setTimeout(()=>{console.error('Placement QA exceeded 90 seconds');app.exit(1);},90000);
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,done)=>{requests.push(d.url);done({cancel:true});});
 let overlay,settings;
 await until(()=>{overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/app/index.html'));settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/index.html'));return overlay&&settings&&!overlay.webContents.isLoading()&&!settings.webContents.isLoading();},'customer windows');
 const run=s=>overlay.webContents.executeJavaScript(s),ui=s=>settings.webContents.executeJavaScript(s);
 await until(()=>run('window.pets?.length===2 && window.pet.props.placed.length===3'),'starter scene');
 await ui('document.querySelector("#finishIntro").click()');
 await run(`(()=>{
  for(const p of window.pets){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;}
  // Observe the actual frame's guide text, without replacing its drawing implementation.
  window.__placementLabels=[];window.__placementText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...rest){if(/Floor aligned|Move clear to snap|Free placement/.test(text))window.__placementLabels.push(text);return window.__placementText.call(this,text,...rest);};
  window.__positionSupply=(x,gap=7)=>{
   const t=window.toolBag.tools.held.object,b=window.pet.ctx.world.bounds;
   t.place({x,y:b.floor-100},0);
   const bottom=Math.max(...t.collisionHull.map(p=>p.y));t.place({x,y:t.center.y+b.floor-1.5-bottom-gap},0);
   const at=t.center;t.grab(at.x,at.y);
   window.dispatchEvent(new MouseEvent('mousemove',{clientX:at.x,clientY:at.y,bubbles:true}));
   window.toolBag.move(at.x,at.y,0,0);window.toolBag.refresh();
   return window.toolBag.tools.placementPreview;
  };
 })()`);
 const baseline=await run('window.pet.props.placed.length');
 const pull=async()=>{
  await run('window.toolBag.showFor(window.pet,"supplies")');
  await until(()=>run('!!document.querySelector(".bag-choice[data-kind=prop][data-id=chair]")'),'chair supply card');
  await run('document.querySelector(".bag-choice[data-kind=prop][data-id=chair]").click();document.querySelector("#bagDetails [data-action=place]").click()');
  await until(()=>run('window.toolBag.tools.held?.object.def?.id==="chair" && !document.querySelector("#bagTransport").hidden && !document.querySelector("#furnitureFloorSnap").parentElement.hidden'),'actual furniture transport');
 };
 await pull();
 assert.equal(await run('window.pet.props.placed.length'),baseline+1);
 const aligned=await run(`(()=>{const b=window.pet.ctx.world.bounds;for(let x=b.left+100;x<b.right-100;x+=60){const p=window.__positionSupply(x);if(p?.snap)return {x,preview:p};}throw Error('No clear floor for test chair');})()`);
 assert(aligned.preview.nearFloor&&!aligned.preview.blocked&&aligned.preview.snap);
 await until(()=>run('window.__placementLabels.includes("Floor aligned")'),'visible floor-aligned guide from frame');
 assert(await run('document.querySelector("#furnitureFloorSnap").checked'));
 await run('document.body.style.background="#ecebdf"');await pause(100);
 fs.writeFileSync(path.join(output,'placement.png'),(await overlay.webContents.capturePage()).toPNG());
 await run('document.querySelector("#furnitureFloorSnap").click()');
 assert(await run('!window.toolBag.tools.snapToFloor && !window.toolBag.tools.placementPreview.snap && localStorage.getItem("furniture-floor-snap")==="false"'));
 await until(()=>run('window.__placementLabels.includes("Free placement")'),'free-placement guide from frame');
 await run('document.querySelector("#furnitureFloorSnap").click()');
 const blocked=await run(`(()=>{const held=window.toolBag.tools.held.object;for(const t of window.pet.props.placed.filter(t=>t!==held)){const p=window.__positionSupply(t.center.x);if(p?.nearFloor&&p.blocked)return p;}throw Error('No collision blocker for test chair');})()`);
 assert(blocked.blocked&&!blocked.snap);
 await until(()=>run('window.__placementLabels.includes("Move clear to snap")'),'visible blocked-placement guide from frame');
 await run('[...document.querySelectorAll("#bagTransport button")].find(b=>b.textContent==="Cancel").click()');
 assert(await run('!window.toolBag.dragging && window.toolBag.tools.placementPreview===null && document.querySelector("#bagTransport").hidden'));
 assert.equal(await run('window.pet.props.placed.length'),baseline,'Cancel left the new chair in the world');
 console.log('PASS placement: actual supply card/Place, visible collision-footprint/floor guide, clear and blocked feedback, optional free placement, and Cancel removes the supply');

 await pull();
 const dropped=await run(`(()=>{const p=window.__positionSupply(${aligned.x});if(!p.snap)throw Error('Clear floor no longer available for release');const t=window.toolBag.tools.held.object,at=t.center;window.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:at.x,clientY:at.y,bubbles:true}));return {held:!!t.held,dragging:window.toolBag.dragging,bottom:Math.max(...t.collisionHull.map(q=>q.y)),floor:window.pet.ctx.world.bounds.floor};})()`);
 assert(!dropped.held&&!dropped.dragging);
 assert(Math.abs(dropped.bottom-(dropped.floor-1.5))<0.05,'actual mouseup did not apply the floor-aligned preview');
 assert.equal(await run('window.pet.props.placed.length'),baseline+1);
 console.log('PASS placement release: actual overlay mouseup places the exact preview on the floor and releases the physical hold');
 await pull();
 await run('document.querySelector("#furnitureFloorSnap").click();window.toolBag.cancel();window.petShell.retrySaves()');
 assert.equal(await run('localStorage.getItem("furniture-floor-snap")'),'false');
 await pause(250);overlay.reload();
 await until(()=>!overlay.webContents.isLoading()&&run(`window.pets?.length===2 && window.toolBag && window.pet.props.placed.length===${baseline+1}`),'reload after cancellation');
 assert.equal(await run('window.toolBag.tools.snapToFloor'),false,'floor snap choice did not survive renderer reload');
 await pull();assert(await run('!document.querySelector("#furnitureFloorSnap").checked && !window.toolBag.tools.placementPreview.snap'));
 await run('window.toolBag.cancel();window.petShell.retrySaves()');
 assert.equal(await run('window.pet.props.placed.length'),baseline+1);
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 passed=true;
 fs.writeFileSync(path.join(output,'placement-electron.json'),JSON.stringify({result:'passed',platform:process.platform,nativeWindows:'simulated',source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actualSupplyUI:true,frameGuideFeedback:['Floor aligned','Free placement','Move clear to snap'],actualMouseupAppliesPreview:true,preferenceReload:true,cancelRemovesSupply:true,networkRequests:requests,errors},null,2));
 console.log('PASS placement persistence: free-placement preference survives reload, no cancelled furniture returns, clean runtime and zero network requests');app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
app.on('will-quit',()=>{clearTimeout(timeout);if(passed)console.log('PASS placement: acknowledged quit');fs.rmSync(dir,{recursive:true,force:true});});
