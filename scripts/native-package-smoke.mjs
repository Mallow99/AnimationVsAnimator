// Launch the extracted candidate itself on its target OS; no fake native adapters.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const platform = process.platform;
assert(['darwin','win32'].includes(platform), 'Run on a supported target OS');
const root = resolve('out'), zip = join(root,readdirSync(root).find(f=>f.endsWith('.zip')) ?? 'missing');
const extract = mkdtempSync(join(tmpdir(),'Mallow candidate with spaces '));
if(platform==='darwin')execFileSync('ditto',['-x','-k',zip,extract]);
else { const script=resolve('.build/extract-candidate.ps1');writeFileSync(script,"param([string]$Source,[string]$Destination)\n$ErrorActionPreference='Stop'\nExpand-Archive -LiteralPath $Source -DestinationPath $Destination\n");execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Source',zip,'-Destination',extract]); }
const folder=join(extract,readdirSync(extract).find(f=>f.startsWith('Mallow-Desk-Buddies')));
assert(existsSync(join(folder,'START-HERE.txt')), 'Missing plain-language launch instructions');
assert(existsSync(join(folder,'FEATURES.md')), 'Packaged feature/customization guide is missing');
const executable=platform==='darwin'?join(folder,'Mallow-Desk-Buddies.app/Contents/MacOS/Mallow-Desk-Buddies'):join(folder,'Mallow-Desk-Buddies.exe');
const data=mkdtempSync(join(tmpdir(),'mallow-native-data-')), output=resolve('.build/release');mkdirSync(output,{recursive:true});
const env={...process.env,PET_DATA_DIR:data};delete env.PET_FAKE_WINDOWS;
let proc, socket, id=0;const pending=new Map(),errors=[],logs=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<240;i++){if(await fn())return;await pause(100);}throw Error('Timed out: '+label);}
function send(method,params={}){const key=++id;socket.send(JSON.stringify({id:key,method,params}));return new Promise((resolve,reject)=>pending.set(key,{resolve,reject}));}
async function run(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function connect(){
 await until(()=>existsSync(join(data,'DevToolsActivePort')),'debug port');
 const port=Number(readFileSync(join(data,'DevToolsActivePort'),'utf8').split('\n')[0]);let tab;
 await until(async()=>{const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();tab=tabs.find(t=>t.url.endsWith('/app/index.html'));return tab;},'overlay');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
 socket.onclose=()=>{for(const p of pending.values())p.reject(Error('App connection closed'));pending.clear();};
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p?.reject(Error(JSON.stringify(message.error)));else p?.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params);};
 await send('Runtime.enable');await until(()=>run('window.pets?.length===2'),'two buddies');
}
function launch(){proc=spawn(executable,['--remote-debugging-port=0'],{env,stdio:['ignore','pipe','pipe']});proc.on('error',e=>errors.push(e.message));for(const stream of [proc.stdout,proc.stderr])stream.on('data',data=>logs.push(data.toString()));}
try {
 launch();await connect();
 assert.equal((await run('window.petShell.productInfo()')).commercial,true);
 assert.deepEqual(await run('window.petShell.getSaveHealth()'),{issues:[]});
 assert.equal(await run('window.petShell.getConfigs().then(cs=>cs.length)'),5);
 const unlocked=await run('window.petShell.redeemCode("  aRnOlD  ")');
 assert(unlocked.ok&&!unlocked.alreadyUnlocked);assert.equal(unlocked.configs.length,6);assert.equal(unlocked.configs[5].look.tattoo,'jt');
 await until(()=>run('window.figurePool?.length===6 && window.figurePool[5]?.config.name==="Arnold"'),'unlocked sixth saved profile');
 await run('window.exportBackupSnapshot().then(()=>true)'); // Wait for actual memory loads before editing.
 await run('(()=>{const p=window.figurePool[5];const b=p.items.list.find(i=>i.def.id==="book")??p.items.give("book",p.char);b.bookmark=23;p.memory.add("Native Arnold restart memory","event","you",2);})()');
 await run('window.petShell.setConfig({name:"Native restart check",windows:true});window.petShell.productSetup({introDone:true})');
 await until(()=>logs.some(l=>l.includes('helper running: sees')),'real native window helper');
 await run('window.petShell.setSession({paused:true})');await pause(200);const time=await run('window.pet.ctx.world.time');await pause(300);assert.equal(await run('window.pet.ctx.world.time'),time);
 await run('window.petShell.setSession({paused:false});window.petShell.retrySaves()');await pause(500);
 const image=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(output,`native-${platform}.png`),Buffer.from(image.data,'base64'));
 // Use the same IPC as the customer Quit button, including the before-quit flush.
 await run('window.petShell.quit()').catch(()=>{});await until(()=>proc.exitCode!==null,'normal quit');socket.close();
 assert.equal(JSON.parse(readFileSync(join(data,'pet.json'),'utf8')).name,'Native restart check');
 assert(JSON.parse(readFileSync(join(data,'memory.json'),'utf8')));
 assert.equal(JSON.parse(readFileSync(join(data,'pet-6.json'),'utf8')).look.tattoo,'jt');
 assert.deepEqual(JSON.parse(readFileSync(join(data,'product-state.json'),'utf8')).unlockedCharacters,['arnold']);
 assert(JSON.parse(readFileSync(join(data,'memory-6.json'),'utf8')).notes.some(n=>n.text==='Native Arnold restart memory'));
 rmSync(join(data,'DevToolsActivePort'),{force:true});launch();await connect();
 assert.equal(await run('window.pet.config.name'),'Native restart check');
 assert.equal(await run('window.petShell.getConfigs().then(cs=>cs.length)'),6);
 await until(()=>run('window.figurePool[5]?.items.list.some(i=>i.def.id==="book"&&i.bookmark===23)'),'Arnold book restored');
 await until(()=>run('window.figurePool[5].memory.notes.some(n=>n.text==="Native Arnold restart memory")'),'Arnold memory restored');
 assert.equal(await run('window.figurePool[5].config.look.tattoo'),'jt');
 assert.equal(await run('window.figurePool[5].items.list.filter(i=>i.def.id==="quill").length'),1);
 assert.deepEqual((await run('window.petShell.productInfo()')).state.unlockedCharacters,['arnold']);
 assert.equal((await run('window.petShell.redeemCode("ARNOLD")')).alreadyUnlocked,true);
 await run('window.petShell.quit()').catch(()=>{});await until(()=>proc.exitCode!==null,'restart quit');
 assert.deepEqual(errors,[]);
 writeFileSync(join(output,`native-${platform}.json`),JSON.stringify({platform,result:'passed',source:JSON.parse(readFileSync(join(folder,'release-source.json'),'utf8')),extractedPathWithSpaces:true,helper:'real; reported windows',normalQuitAndRestart:true,arnoldUnlockAndSixthProfileRestart:true,limits:'CI runner smoke only; physical focus/input/permissions/DPI/sleep/resources gates remain'},null,2));
 console.log('PASS extracted native candidate: real helper, UI, pause/resume, saves, Arnold unlock/book/memory, normal quit and restart');
} finally {socket?.close();if(proc&&proc.exitCode===null)proc.kill();writeFileSync(join(output,`native-${platform}.log`),logs.join(''));rmSync(data,{recursive:true,force:true});rmSync(extract,{recursive:true,force:true});}
