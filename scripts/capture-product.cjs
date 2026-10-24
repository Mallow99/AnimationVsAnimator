// Actual Electron/runtime store media; disposable offline scene. Requires ffmpeg on PATH.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mallow-media-'));
process.env.PET_DATA_DIR = dir; process.env.PET_FAKE_WINDOWS = '[]';
fs.writeFileSync(path.join(dir, 'product-state.json'), JSON.stringify({ introDone: true, sceneReady: true }));
app.disableHardwareAcceleration();
require('../dist/electron/main.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.join(__dirname, '../docs/store/media'); fs.mkdirSync(output, { recursive: true });
async function until(fn) { for (let i = 0; i < 600; i++) { if (await fn()) return; await pause(50); } throw Error('Runtime did not become ready'); }
app.whenReady().then(async () => {
 let overlay;
 await until(() => { overlay = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/app/index.html')); return overlay && !overlay.webContents.isLoading(); });
 const run = code => overlay.webContents.executeJavaScript(code);
 await until(() => run('window.pets?.length===2'));
 overlay.setBounds({ x: 0, y: 0, width: 960, height: 600 });
 await pause(300);
 await run(`(()=>{document.body.style.background='#ecebdf';
  for(const [i,p]of window.pets.entries()){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;p.mood.s.energy=.85;p.command('respawn');p.mind.holdUntil=Infinity;p.char.standUp();p.char.placeHome(350+i*240);p.items.give(i?'handheld':'book',p.char);}
  for(const [id,x]of [['couch',470],['lamp',220],['tv',790]]){const d=window.pet.props.defs.get(id);window.pet.props.spawn(id,x,innerHeight-(d.bounds[3]-d.bounds[1])/2-2,1);}
  for(let step=0;step<720;step++)for(const p of window.pets)p.update(1/120);
  window.pet.command('do:read');window.pets[1].command('do:handheld');})()`);
 await until(()=>run('window.pet.items.list.some(i=>i.def.id==="book" && i.bookOpen>.8)'));
 await pause(500);
 const shot = async name => fs.writeFileSync(path.join(output, name), (await overlay.webContents.capturePage()).toPNG());
 await shot('reading-and-games.png');
 const captureStarted = Date.now();
 const movie = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '12', '-i', '-', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'runtime-demo.mp4')], { stdio: ['pipe','ignore','inherit'] });
 let movieError;movie.on('error',error=>movieError=error);
 for (let i = 0; i < 180; i++) { const start = Date.now(); const frame = (await overlay.webContents.capturePage()).toJPEG(90); if(movieError)throw movieError; if(!movie.stdin.write(frame))await once(movie.stdin,'drain'); await pause(Math.max(0, 1000/12-(Date.now()-start))); }
 const captureWallSeconds = (Date.now()-captureStarted)/1000;
 movie.stdin.end(); const [code] = await once(movie, 'close'); if (code !== 0) throw Error('Video encoding failed');
 await shot('a-little-company.png');
 await run('window.petShell.openSettings()');
 let settings;await until(()=>{settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/'));return settings&&!settings.webContents.isLoading();});
 settings.setSize(560, 900);await pause(300);
 fs.writeFileSync(path.join(output,'personalize.png'),(await settings.webContents.capturePage()).toPNG());
 await settings.webContents.executeJavaScript(`(()=>{const d=document.querySelector('#appearancePanel');d.open=true;window.scrollTo(0,d.getBoundingClientRect().top+scrollY-195);})()`);
 settings.webContents.sendInputEvent({type:'mouseMove',x:1,y:1});await pause(200);
 fs.writeFileSync(path.join(output,'customization.png'),(await settings.webContents.capturePage()).toPNG());settings.close();
 // A cover composed in the runtime DOM. The figures/objects remain the actual renderer.
 overlay.setBounds({x:0,y:0,width:630,height:500});await pause(300);
 await run(`(()=>{for(const t of [...window.pet.props.placed])window.pet.props.remove(t);
 for(const [i,p]of window.pets.entries()){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;p.mood.s.energy=.85;p.applyConfig({...p.config,scale:1.6});p.setBounds({left:0,right:innerWidth,top:0,floor:innerHeight-32});p.command('respawn');p.mind.holdUntil=Infinity;p.char.standUp();p.char.stop();p.char.placeHome(190+i*220);}
 for(let step=0;step<720;step++)for(const p of window.pets)p.update(1/120);for(const [i,p]of window.pets.entries())p.command('do:'+ (i?'handheld':'read'));
 const h=document.createElement('header');h.style.cssText='position:fixed;inset:44px 36px auto;pointer-events:none;color:#344139;font-family:system-ui';h.innerHTML='<div style="font-size:14px;letter-spacing:3px;font-weight:700;color:#527052">A LITTLE LIFE ON YOUR DESKTOP</div><div style="font-size:52px;font-weight:750;line-height:1.08;margin:16px 0">Mallow<br>Desk Buddies</div><div style="font-size:20px">Make room for a little company.</div>';document.body.append(h);const f=document.createElement('footer');f.style.cssText='position:fixed;inset:auto 0 0;height:31px;border-top:1px solid #cdd3c4;text-align:center;line-height:31px;color:#527052;font:13px/31px system-ui;pointer-events:none';f.textContent='OFFLINE · LOCAL SAVES · ONE TO FIVE BUDDIES';document.body.append(f);})()`);
 await until(()=>run('window.pet.items.list.some(i=>i.def.id==="book" && i.bookOpen>.8)'));await pause(300);await shot('cover.png');
 fs.writeFileSync(path.join(output,'SOURCE.json'), JSON.stringify({source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),captureScriptSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),platform:'Linux Electron/Xvfb',nativeWindows:'simulated; no OS desktop claims',background:'plain cream backdrop',cover:'typographic header/footer in DOM; actual runtime figures above a 32px footer, scale 1.6 (available in Settings)',demo:'180 actual runtime frames sampled at a target of 12fps; 15-second output; no audio',captureWallSeconds,publish:'only after native acceptance'},null,2));
 console.log('Captured actual runtime screenshots, cover and 15-second demo. Native acceptance remains pending.');app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
app.on('will-quit',()=>fs.rmSync(dir,{recursive:true,force:true}));
