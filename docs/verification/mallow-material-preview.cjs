const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mallow-material-'));
process.env.PET_DATA_DIR=dir;process.env.PET_FAKE_WINDOWS='[]';app.disableHardwareAcceleration();
fs.writeFileSync(path.join(dir,'product-state.json'),JSON.stringify({introDone:true,sceneReady:true}));
require('../../dist/electron/main.js');
app.whenReady().then(async()=>{
 let overlay;for(let i=0;i<300;i++){
 overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/app/index.html'));
 if(overlay&&!overlay.webContents.isLoading()&&await overlay.webContents.executeJavaScript('!!window.pet'))break;
 await new Promise(r=>setTimeout(r,50));}
 const url=await overlay.webContents.executeJavaScript(`(()=>{
 const c=document.createElement('canvas');c.width=1440;c.height=1050;const g=c.getContext('2d');g.fillStyle='#f4f0e5';g.fillRect(0,0,c.width,c.height);
 g.fillStyle='#293a32';g.font='600 24px system-ui';g.fillText('Mallow Desk Buddies — stock materials',35,45);
 g.font='15px system-ui';g.fillText('Actual renderer · smooth at 2× · texture and silhouette review',35,75);
 const props=window.pet.props;
 for(const [i,id]of [...props.defs.keys()].entries()){
 const x=240+(i%3)*480,y=200+Math.floor(i/3)*220;
 const t=props.spawn(id,0,0,2),b=t.def.bounds,a=t.toWorld(b[0],b[1]),z=t.toWorld(b[2],b[3]);g.save();g.translate(x-(a.x+z.x)/2,y-(a.y+z.y)/2);t.draw(g,1,0,1);g.restore();props.remove(t);
 g.fillStyle='#42664e';g.font='600 16px system-ui';g.fillText(id,x-70,y+105);
 }
 return c.toDataURL();})()`);
 fs.writeFileSync(path.join(__dirname,'mallow-material-atlas.png'),Buffer.from(url.split(',')[1],'base64'));app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(dir,{recursive:true,force:true}));
