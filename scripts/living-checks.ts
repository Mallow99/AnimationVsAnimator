import assert from 'node:assert/strict';
import {Pet,DEFAULT_CONFIG} from '../src/core/pet';
import {companionConfig} from '../src/core/config';
import {DrawTool} from '../src/core/skills/draw-tool';
import {ShootGun} from '../src/core/skills/gun';
import {ReadBook} from '../src/core/skills/read-book';
import {OverlayTools} from '../src/core/overlay-tools';
import {CursorWeapon} from '../src/core/combat/cursor-weapon';
import {Props,makeBox} from '../src/core/props';
import {drawItem,itemParts} from '../src/core/items';
import {satchelParts} from '../src/core/satchel';
import {bookShape} from '../src/core/book-art';
import {overlapOffset} from '../src/core/geometry';
const bounds={left:0,right:1400,top:0,floor:800},dt=1/120;
let seed=7;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let passed=0;
function test(name:string,fn:()=>void){fn();passed++;console.log(`PASS ${name}`);}
function fixture(n=1){
 const cfg={...structuredClone(DEFAULT_CONFIG),windows:false,dailyRhythm:false,hyperactivity:1};
 const a=new Pet(bounds,cfg,{identity:'figure-0'}),pets=[a];
 for(let i=1;i<n;i++)pets.push(new Pet(bounds,companionConfig(cfg,i),{props:a.props,identity:`figure-${i}`}));
 for(const [i,p]of pets.entries()){p.paused=true;p.char.body.translate(350+i*80-p.char.x,0);p.setWindows([]);p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;}
 for(let i=0;i<400;i++)for(const p of pets)p.update(dt);
 for(const p of pets)p.others=pets.filter(q=>q!==p);return pets;
}
test('drawing a second ink katana preserves the earlier project identity and progress',()=>{
 const [p]=fixture(),base=p.items.defs.get('katana')!,def={...structuredClone(base),id:'ink-katana',name:'Drawn Katana',drawn:true};
 p.items.defs.set(def.id,def);const first=p.items.give(def,p.char)!;first.ink={source:'katana',progress:.5,remaining:300};
 const draw=new DrawTool('katana');draw.start(p.ctx);let done=false;
 for(let i=0;i<4200&&!done;i++){draw.t+=dt;done=draw.update(p.ctx,dt);p.update(dt);}draw.stop(p.ctx);
 assert(done&&draw.item);assert(p.items.list.includes(first));assert.equal(first.ink?.progress,.5);
 assert.equal(p.items.list.filter(i=>i.def.id==='ink-katana').length,2);
 const [q]=fixture();q.load(p.save());assert.equal(q.items.list.filter(i=>i.ink?.source==='katana').length,2);
});
test('an interrupted reload completes while held in an idle hand with a full bag',()=>{
 const [p]=fixture(),gun=p.items.give('gun',p.char)!;p.items.wield(gun,p.char.useHand!);
 while(!p.items.belt.every(Boolean))p.items.give('cup',p.char);
 gun.ammo=0;gun.beginReload();const skill=new ShootGun(()=>({x:p.char.x+200,y:700}),'cursor',1,gun);skill.start(p.ctx);skill.stop(p.ctx);
 assert.equal(gun.where,'hand');for(let i=0;i<150;i++)p.update(dt);
 assert.equal(gun.ammo,6);assert.equal(gun.reloadRemaining,0);
});
test('passive carrying reloads and an active owned controller never doubles its clock',()=>{
 const [p]=fixture(),gun=p.items.give('gun',p.char)!,tools=new OverlayTools(()=>[p]);gun.ammo=0;gun.beginReload();
 tools.beginItem(p,gun,{x:500,y:300});for(let i=0;i<60;i++)p.update(dt);assert(Math.abs(gun.reloadRemaining-.65)<1e-6);
 tools.cancel();p.useItem(gun);const cursor=new CursorWeapon();cursor.attach(gun,p);
 for(let i=0;i<60;i++){p.update(dt);cursor.update(dt,[p]);}assert(Math.abs(gun.reloadRemaining-.15)<1e-6);assert.equal(gun.ammo,0);
 for(let i=0;i<20;i++){p.update(dt);cursor.update(dt,[p]);}assert.equal(gun.ammo,6);cursor.detach();
});
test('closed and open stock-book hulls match their visible artwork',()=>{
 const [p]=fixture(),book=p.items.spawn('book',{x:900,y:600},1)!;book.dir={x:1,y:0,z:0};book.loosen();
 for(const open of [0,.5,1]){book.bookOpen=open;const art=bookShape(open).flatMap(s=>s.pts),hull=book.collisionHull;
  assert.equal(Math.max(...art.map(p=>p[0]))-Math.min(...art.map(p=>p[0])),Math.max(...hull.map(p=>p.x))-Math.min(...hull.map(p=>p.x)));}
});
test('edited book artwork is rendered from its definition',()=>{
 const [p]=fixture(),book=p.items.give('book',p.char)!;
 p.items.addDefs([{...structuredClone(book.def),shape:[{pts:[[0,0],[20,0],[20,15],[0,15]],fill:'#ff00ff',width:0}]}]);
 const colors:string[]=[],g={globalAlpha:1,save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){colors.push((this as any).fillStyle);},stroke(){}};
 drawItem(g as any,book);assert(colors.includes('#ff00ff'));assert(!book.animatedBook);
});
test('returning to a distant bookshelf releases old reading hand targets',()=>{
 const [p]=fixture();p.props.spawn('bookshelf',1000,733,1);for(let i=0;i<240;i++)p.update(dt);
 const r=new ReadBook();r.start(p.ctx);let returned=false,walked=false;
 for(let i=0;i<42000;i++){r.t+=dt;const done=r.update(p.ctx,dt);p.update(dt);
  if((r as any).phase==='return'){walked=true;assert.equal(p.char.handsAt,null);}
  if(done){r.stop(p.ctx);returned=!!p.items.list.find(i=>i.shelf);break;}}
 assert(walked&&returned);
});
test('held reading-book depth stays in front of its strap in either facing',()=>{
 const [p]=fixture(),book=p.items.give('book',p.char)!;p.items.toHand(book,p.char.useHand!);book.bookReading=true;
 for(const facing of [-1,1] as const){p.char.facing=facing;const bookZ=itemParts(book,p.char)[0].z,strapZ=satchelParts(p.char)[0].z;assert(bookZ>strapZ);}
 const upright=bookShape(1),reading=bookShape(1,0,true);
 const span=(s:typeof upright)=>Math.max(...s.flatMap(x=>x.pts.map(p=>p[1])))-Math.min(...s.flatMap(x=>x.pts.map(p=>p[1])));
 assert(span(reading)<span(upright)*.6,'pages must tilt toward the reader');
});
test('a five-body stack settles without creep, overlap or shape deformation and still responds to impact',()=>{
 const props=new Props(),boxes=Array.from({length:5},(_,i)=>{const t=makeBox({strokes:[],color:'#555555',born:0,done:true},680+i*3,745-i*50,800+i*3,793-i*50);t.forever=true;props.add(t);return t;});
 for(let i=0;i<1800;i++)props.update(dt,i*dt,bounds,[]);const centers=boxes.map(t=>({...t.center}));let drift=0;
 for(let i=0;i<1200;i++){props.update(dt,15+i*dt,bounds,[]);for(const [k,t]of boxes.entries())drift=Math.max(drift,Math.hypot(t.center.x-centers[k].x,t.center.y-centers[k].y));}
 assert(drift<.5,`resting stack drifted ${drift}`);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const o=overlapOffset(boxes[i].collisionHull,boxes[j].collisionHull);assert(!o||Math.hypot(o.x,o.y)<.002);}
 const top=boxes[4],at={...top.center};top.hit(at.x,at.y,700,-350);for(let i=0;i<120;i++)props.update(dt,25+i*dt,bounds,[]);
 assert(Math.hypot(top.center.x-at.x,top.center.y-at.y)>10);
});
test('angled furniture contact dissipates deformation energy instead of launching across the room',()=>{
 const props=new Props();props.spawn('couch',720,740,1);const desk=props.spawn('desk',860,650,1)!;desk.place({x:860,y:710},.5);
 for(let i=0;i<1800;i++)props.update(dt,i*dt,bounds,[]);assert(Math.abs(desk.center.x-860)<80);
 const at={...desk.center};for(let i=0;i<1200;i++)props.update(dt,15+i*dt,bounds,[]);
 assert(Math.hypot(desk.center.x-at.x,desk.center.y-at.y)<.5);
 desk.grab(desk.center.x,desk.center.y);desk.held!.vx=800;desk.held!.vy=-700;desk.release();
 for(let i=0;i<60;i++)props.update(dt,25+i*dt,bounds,[]);assert(Math.hypot(desk.center.x-at.x,desk.center.y-at.y)>20);
});
console.log(`${passed} living stickmen checks passed`);
