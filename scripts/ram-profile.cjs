// Whole Electron process-tree RAM. Disposable saves, offline, Xvfb/software mode. See PET-QUALITY-2-PLAN.md.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const count=Number(process.env.AVA_RAM_COUNT||2),rich=process.env.AVA_RAM_RICH==='1';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ava-ram-'));
app.setPath('userData',dir);app.disableHardwareAcceleration();
process.env.PET_FAKE_WINDOWS='[]';
fs.writeFileSync(path.join(dir,'pet.json'),JSON.stringify({figureCount:count,spawnOrder:[0,1,2,3,4],friend:{on:count>1,name:'Amber',color:'#f7931e'},windows:false,dailyRhythm:false,mind:'offline'}));
require('../dist/electron/main.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await pause(50);}throw Error('Timed out');}
function memory(){
 const parents=new Map();for(const name of fs.readdirSync('/proc')){if(!/^\d+$/.test(name))continue;try{const stat=fs.readFileSync(`/proc/${name}/stat`,'utf8');parents.set(Number(name),Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[1]));}catch{}}
 const pids=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const [pid,ppid]of parents)if(pids.has(ppid)&&!pids.has(pid)){pids.add(pid);changed=true;}}
 const metrics=new Map(app.getAppMetrics().map(m=>[m.pid,m.type]));
 const processes=[];for(const pid of pids){try{const data=fs.readFileSync(`/proc/${pid}/smaps_rollup`,'utf8');const field=name=>Number(data.match(new RegExp(`^${name}:\\s+(\\d+)`,'m'))?.[1]||0)/1024;processes.push({pid,type:metrics.get(pid)||'child',pss:field('Pss'),rss:field('Rss'),private:field('Private_Clean')+field('Private_Dirty'),swap:field('Swap')});}catch(error){if(parents.has(pid)){const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8');if(!stat.includes(') Z '))throw error;}}}
 return {at:Date.now(),pss:processes.reduce((n,p)=>n+p.pss,0),rss:processes.reduce((n,p)=>n+p.rss,0),private:processes.reduce((n,p)=>n+p.private,0),swap:processes.reduce((n,p)=>n+p.swap,0),processes};
}
const report={count,rich,platform:process.platform,electron:process.versions.electron,display:'Xvfb 1440x900 software rendering',units:'MiB',samples:[]};
function stats(samples,key){const a=samples.map(s=>s[key]).sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],min:a[0],max:a.at(-1)};}
async function sample(label,overlay,warm=30000){await pause(warm);const samples=[];for(let i=0;i<10;i++){samples.push(memory());await pause(1000);}const summary={label,pss:stats(samples,'pss'),rss:stats(samples,'rss'),private:stats(samples,'private'),swap:stats(samples,'swap'),processCount:samples.at(-1).processes.length,scene:await overlay.webContents.executeJavaScript('({figures:window.pets.length,props:window.pet.props.things.length,items:window.pets.reduce((n,p)=>n+p.items.list.length,0),skills:window.pets.map(p=>p.mind.skill?.name||null),sanity:window.checkSanity()})')};report.samples.push({summary,samples});console.log(JSON.stringify(summary));fs.writeFileSync(path.join(__dirname,'../.build',`ram-${count}${rich?'-rich':''}${process.env.AVA_RAM_CHURN==='1'?'-churn':''}.json`),JSON.stringify(report,null,2));}
app.whenReady().then(async()=>{let overlay;await until(()=>{overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/app/index.html'));return overlay&&!overlay.webContents.isLoading();});await until(()=>overlay.webContents.executeJavaScript(`!!window.pet&&window.pets.length===${count}`));
 if(rich)await overlay.webContents.executeJavaScript(`(()=>{for(const [i,p]of window.pets.entries()){p.items.give(['book','cup','dumbbell','yo-yo','handheld'][i],p.char);p.items.spawn('book',{x:900+i*45,y:750},1);p.items.spawn('cup',{x:920+i*45,y:725},1);p.command('do:'+['read','sip','exercise','yoyo','handheld'][i]);}for(const [i,id]of ['chair','couch','tv','canvas','scooter','desk','workbench','storage','bookshelf'].entries())window.pet.props.spawn(id,60+i*140,760,1);})()`);
 await sample(rich?'busy':'ordinary',overlay);
 if(rich && process.env.AVA_RAM_CHURN==='1'){for(let i=0;i<12;i++){await overlay.webContents.executeJavaScript('window.petShell.openSettings()');await until(()=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/'));return w&&!w.webContents.isLoading();});await pause(500);for(const w of BrowserWindow.getAllWindows())if(w.webContents.getURL().includes('/settings/'))w.close();await pause(1000);}await sample('after-12-settings-cycles',overlay,15000);await sample('after-12-settings-cycles-rested',overlay,60000);app.quit();return;}
 if(rich){await overlay.webContents.executeJavaScript('window.petShell.openSettings()');await until(()=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/'));return w&&!w.webContents.isLoading();});await sample('busy-settings-open',overlay,15000);for(const w of BrowserWindow.getAllWindows())if(w.webContents.getURL().includes('/settings/'))w.close();await sample('busy-settings-closed',overlay,15000);}
 app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
app.on('will-quit',()=>fs.rmSync(dir,{recursive:true,force:true}));
