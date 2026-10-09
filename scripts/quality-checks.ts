import assert from 'node:assert/strict';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
import { Skill } from '../src/core/skills/context';
import { FriendlyMoment } from '../src/core/skills/friendly-moment';
import { ShootGun } from '../src/core/skills/gun';
import { ReadBook } from '../src/core/skills/read-book';
import { EverydayItem } from '../src/core/skills/everyday-item';
import { OverlayTools } from '../src/core/overlay-tools';
import { CursorWeapon } from '../src/core/combat/cursor-weapon';
import { makeBox } from '../src/core/props';
import { overlapOffset } from '../src/core/geometry';
import { offlineReply } from '../src/core/brains/offline';
import { activitiesFor } from '../src/app/activities';
import { groupPlan } from '../src/core/skills/group';
const bounds={left:0,right:1400,top:0,floor:800}, dt=1/120;
let seed=7; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let passed=0;
function test(name:string,fn:()=>void) {fn();passed++;console.log(`PASS ${name}`);}
function fixture(n=1) {
  const cfg={...structuredClone(DEFAULT_CONFIG),windows:false,dailyRhythm:false,hyperactivity:1};
  const a=new Pet(bounds,cfg,{identity:'figure-0'}), pets=[a];
  for(let i=1;i<n;i++)pets.push(new Pet(bounds,companionConfig(cfg,i),{props:a.props,identity:`figure-${i}`}));
  for(const [i,p] of pets.entries()){p.paused=true;p.char.body.translate(350+i*80-p.char.x,0);p.setWindows([]);p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;}
  for(let i=0;i<400;i++)for(const p of pets)p.update(dt);
  for(const p of pets)p.others=pets.filter(q=>q!==p);
  return pets;
}
function tick(p:Pet,s:Skill,secs:number,observe=()=>{}) {
  for(let i=0;i<secs/dt;i++){s.t+=dt;const done=s.update(p.ctx,dt);p.update(dt);observe();if(done)return true;}return false;
}
test('an interrupted empty gun completes one reload across repeated burst restarts',()=>{
  const [p]=fixture(),gun=p.items.give('gun',p.char)!;gun.ammo=0;
  const target=()=>({x:p.char.x+300,y:p.char.body.j.neck.y});
  let shots=0;p.ctx.fire=()=>shots++;
  for(let i=0;i<8;i++){const s=new ShootGun(target,'cursor',1,gun);s.start(p.ctx);tick(p,s,0.55);s.stop(p.ctx);}
  assert(shots>0,'restarts must not restart the reload forever');assert(gun.ammo>0);
});
test('reload follows the actual gun through storage, cursor use, cancellation and restart',()=>{
  const [p]=fixture(),gun=p.items.give('gun',p.char)!;gun.ammo=0;gun.beginReload();gun.tickReload(0.4);
  const q=fixture()[0];q.load(p.save());const restored=q.items.find('gun')!;
  assert.equal(restored.reloadRemaining,gun.reloadRemaining);assert.equal(restored.ammo,0);
  p.useItem(gun);const control=new CursorWeapon();control.attach(gun,p);control.reload();control.reload();
  for(let i=0;i<120;i++){p.update(dt);control.update(dt,[p]);}assert.equal(gun.ammo,6);assert.equal(gun.reloadRemaining,0);
  control.detach();p.giveBack(gun);assert.equal(p.items.list.filter(i=>i.def.id==='gun').length,1);
});
test('pickup never enables weapon use and a cursor gun can return to passive transport',()=>{
  const [p]=fixture(),gun=p.items.give('gun',p.char)!,tools=new OverlayTools(()=>[p]);
  p.takeItem(gun);assert(!gun.cursorControlled&&!p.userWeaponControlled);
  p.giveBack(gun);assert(tools.beginItem(p,gun,{x:100,y:200}));tools.move({x:900,y:200},{x:2000,y:0});
  assert.equal(gun.ammo,6);assert(tools.release({x:900,y:200},{x:0,y:0}));assert.equal(gun.where,'world');
  p.useItem(gun);const control=new CursorWeapon();control.attach(gun,p);control.detach();
  assert(tools.beginItem(p,gun,{x:500,y:200}));tools.cancel();assert.equal(gun.where,'belt');
});
for(const [name,use,id] of [['sip','sip','cup'],['exercise','exercise','dumbbell'],['yoyo','play','yo-yo']] as const)
  test(`${id} completes useful repetitions and stows the original, with no stranded hand targets`,()=>{
    const [p]=fixture(),item=p.items.give(id,p.char)!,s=new EverydayItem(use,name);s.start(p.ctx);
    assert(tick(p,s,65),`${id} never completed`);s.stop(p.ctx);
    assert.equal(item.where,'belt');assert.equal(p.items.list.filter(i=>i.def.id===id).length,1);
    assert.equal(p.char.handsAt,null);assert.equal(p.char.handTarget,null);assert.equal(item.yoyoDrop,0);
    const q=fixture()[0];q.load(p.save());assert.equal(q.items.list.filter(i=>i.def.id===id).length,1);
  });
test('new everyday actions work offline and explain missing supplies',()=>{
  const [p]=fixture();for(const [text,name] of [['have a drink','sip'],['lift weights','exercise'],['play with a yo-yo','yoyo']]){
    assert(offlineReply(p.ctx,text).plan.some(s=>'do' in s && s.do===name));assert(activitiesFor(p).find(a=>a.command===name)?.needs);
  }
});
test('reading opens, turns pages, closes and returns one real book to its saved shelf',()=>{
  const [p]=fixture(),shelf=p.props.spawn('bookshelf',p.char.x+70,733,1)!;
  for(let i=0;i<240;i++)p.update(dt);
  const s=new ReadBook();s.start(p.ctx);let opened=false,paged=false,closed=false;
  assert(tick(p,s,350,()=>{const b=p.items.list.find(i=>i.def.id==='book');if(b){opened ||= b.bookOpen>0.9;paged ||= b.bookPage>0.3;closed ||= opened&&b.bookOpen<0.02;}}),'reading did not finish');
  s.stop(p.ctx);const book=p.items.list.find(i=>i.def.id==='book')!;
  assert(opened&&paged&&closed);assert.equal(book.where,'world');assert.equal(book.shelf?.key,shelf.storageKey);
  const q=fixture()[0];q.load(p.save());const restored=q.items.list.find(i=>i.def.id==='book')!;
  assert.equal(restored.shelf?.key,q.props.placed.find(t=>t.def?.id==='bookshelf')!.storageKey);
  const again=new ReadBook();again.start(q.ctx);assert(!tick(q,again,10));assert.equal(q.items.list.filter(i=>i.def.id==='book').length,1);assert.equal(restored.where,'hand');again.stop(q.ctx);
});
test('taking a reading book interrupts cleanly and never creates a replacement behind the cursor',()=>{
  const [p]=fixture(),s=new ReadBook();s.start(p.ctx);tick(p,s,3);const book=p.items.list.find(i=>i.def.id==='book')!;
  p.takeItem(book);assert(tick(p,s,0.1));s.stop(p.ctx);assert.equal(book.where,'cursor');
  const again=new ReadBook();again.start(p.ctx);assert(tick(p,again,0.1));again.stop(p.ctx);assert.equal(p.items.list.filter(i=>i.def.id==='book').length,1);
});
test('ambient invitations and challenges cannot interrupt reading or a queued explicit activity',()=>{
  const [a,b]=fixture(2);a.paused=false;a.command('do:read');
  assert(a.view().busy);assert.equal(a.view().doing,'read');
  a.receive({type:'challenge',armed:true},b);a.update(dt);assert.equal(a.mind.activeSkill?.name,'read');
  for(let i=0;i<300;i++)a.update(dt);
  a.receive({type:'invite',act:'highfive'},b);a.receive({type:'challenge',armed:true},b);
  assert.equal(a.mind.activeSkill?.name,'read');assert.equal(a.char.mode,'sit');
});
test('five couch seats have head clearance and all stay inside the cushions',()=>{
  const [p]=fixture(),couch=p.props.spawn('couch',500,740,1)!;
  for(let i=0;i<5;i++)assert(couch.claimSeat(String(i),500+i*50));
  const xs=[...couch.sitters.keys()].map(id=>couch.seatFor(id)!.x).sort((a,b)=>a-b);
  for(let i=1;i<5;i++)assert(xs[i]-xs[i-1]>=30,'heads would pile together');
  assert(xs[0]>couch.collisionHull[0].x);assert(xs[4]<Math.max(...couch.collisionHull.map(p=>p.x)));
});
test('relationship preference selects a trusted available partner, while talents still take priority',()=>{
  const [a,b,c]=fixture(3);b.config.personality='competitive';c.config.personality='competitive';
  a.ctx.relationship!(b.ctx.who).bond=-0.8;a.ctx.relationship!(c.ctx.who).bond=0.9;
  const plan=groupPlan(a.ctx,'duet')!;assert.equal(plan.members[1],c.ctx.who);
});
test('resting stacks settle with little drift and still move when deliberately struck',()=>{
  const [p]=fixture(),d={strokes:[],color:'#555555',born:0,done:true};
  const low=makeBox(d,700,750,820,795),up=makeBox(d,720,702,790,745);p.props.add(low);p.props.add(up);
  for(let i=0;i<1200;i++)p.update(dt);
  const at=up.center;let drift=0;
  for(let i=0;i<1200;i++){p.update(dt);drift=Math.max(drift,Math.hypot(up.center.x-at.x,up.center.y-at.y));}
  console.log('  stack drift px',drift.toFixed(3));assert(drift<2);assert(!overlapOffset(up.collisionHull,low.collisionHull));
  up.hit(up.center.x,up.center.y,700,-350);for(let i=0;i<60;i++)p.update(dt);console.log('  struck stack movement px',Math.hypot(up.center.x-at.x,up.center.y-at.y).toFixed(3));assert(Math.hypot(up.center.x-at.x,up.center.y-at.y)>1);
  up.grab(up.center.x,up.center.y);up.held!.vx=800;up.held!.vy=-700;up.release();const thrown=up.center;for(let i=0;i<60;i++)p.update(dt);assert(Math.hypot(up.center.x-thrown.x,up.center.y-thrown.y)>20);
});
test('loose books stack without overlapping artwork and remain throwable',()=>{
  const [p]=fixture(),a=p.items.spawn('book',{x:950,y:730},1)!,b=p.items.spawn('book',{x:950,y:700},1)!;
  for(const it of [a,b]){it.dir={x:1,y:0,z:0};it.loosen();}
  for(let i=0;i<1800;i++)p.update(dt);
  assert(!overlapOffset(a.collisionHull,b.collisionHull),'settled books still overlap');
  const at={...b.at};b.push(500,-400);for(let i=0;i<60;i++)p.update(dt);assert(Math.hypot(b.at.x-at.x,b.at.y-at.y)>10);
});
test('five readers return distinct real books; Cancel preserves a shelf slot and dragging frees its contents',()=>{
  const pets=fixture(5),shelf=pets[0].props.spawn('bookshelf',760,733,1)!;
  for(let i=0;i<240;i++)for(const p of pets)p.update(dt);
  const readers=pets.map(p=>{const r=new ReadBook();r.start(p.ctx);return r;}),finished=new Set<number>();
  for(let step=0;step<42000 && finished.size<5;step++)for(const [i,p] of pets.entries()){
    if(!finished.has(i)){const r=readers[i];r.t+=dt;if(r.update(p.ctx,dt)){r.stop(p.ctx);finished.add(i);}}
    p.update(dt);
  }
  assert.equal(finished.size,5);
  const books=pets.map(p=>p.items.list.find(i=>i.def.id==='book')!);
  assert(books.every(b=>b.where==='world'&&b.shelf?.key===shelf.storageKey));assert.equal(new Set(books.map(b=>b.shelf!.slot)).size,5);
  const tools=new OverlayTools(()=>pets),home={...books[0].shelf!};assert(tools.beginItem(pets[0],books[0],{x:200,y:200}));tools.cancel();assert.deepEqual(books[0].shelf,home);
  shelf.grab(shelf.center.x,shelf.center.y);for(const p of pets)p.update(dt);
  assert(books.every(b=>!b.shelf&&b.where==='world'),'dragged shelves must release, not strand, their real contents');shelf.release();
});
test('loose items owned by different figures share contacts through snapshots',()=>{
  const [p,q]=fixture(2),a=p.items.spawn('book',{x:1050,y:770},1)!,b=q.items.spawn('book',{x:1050,y:750},1)!;
  for(const it of [a,b]){it.dir={x:1,y:0,z:0};it.loosen();}
  for(let i=0;i<2400;i++){p.update(dt);q.update(dt);}
  assert(!overlapOffset(a.collisionHull,b.collisionHull));const at={...b.at};b.push(500,-450);
  for(let i=0;i<60;i++){p.update(dt);q.update(dt);}assert(Math.hypot(b.at.x-at.x,b.at.y-at.y)>10);
});
test('group members descend from window platforms before gathering on the floor',()=>{
  const [a,b]=fixture(2);const window={id:4,x:850,y:420,w:340,h:380};b.config.windows=true;b.setWindows([window]);
  b.char.grab('neck',b.char.body.j.neck.x,b.char.body.j.neck.y);b.char.moveHold(1020,300,0,0);
  for(let i=0;i<180;i++)b.update(dt);b.char.release();
  for(let i=0;i<480;i++)b.update(dt);
  assert(b.char.ready&&b.char.support>=0,'fixture did not land on the window');
  a.mind.reset(a.ctx);b.mind.reset(b.ctx);a.command('do:group:duet');let gathered=false,descended=false;
  for(let i=0;i<6000;i++){a.paused=false;b.paused=false;a.update(dt);b.update(dt);descended ||= b.char.body.j.footL.y>bounds.floor-30;gathered ||= a.view().group?.phase==='do';if(gathered)break;}
  assert(descended,'member stayed on a window trying to walk to a floor goal');assert(gathered,'members never reached their shared activity');
});
test('peer gifts and weapon recovery transfer the remaining reload with exclusive ownership',()=>{
  const [a,b]=fixture(2),gun=a.items.give('gun',a.char)!;gun.ammo=0;gun.beginReload();gun.tickReload(0.45);
  const deliver=a.ctx.deliverGift!,capture:{value?:{ammo:number;reloadRemaining?:number}}={};
  a.ctx.deliverGift=(id,message,reply)=>{capture.value={ammo:message.ammo,reloadRemaining:message.reloadRemaining};return deliver(id,message,reply);};
  const pass=new FriendlyMoment('pass');pass.start(a.ctx);assert(tick(a,pass,12));pass.stop(a.ctx);
  assert(!a.items.list.includes(gun));const given=b.items.find('gun')!;assert(capture.value);assert.equal(given.ammo,capture.value.ammo);assert.equal(given.reloadRemaining,capture.value.reloadRemaining);
  // The deliberate fetch/reach may finish the first reload before the handoff. Start a fresh one
  // to exercise weapon recovery while the original's reload is genuinely still in progress.
  given.ammo=0;given.beginReload();given.tickReload(.45);assert(given.reloadRemaining>0&&given.reloadRemaining<1.15);
  const remaining=given.reloadRemaining;b.items.drop(given,0,0);given.at={x:a.char.x,y:bounds.floor-16,z:0};given.loosen();
  const claimed=a.ctx.claimWeapon!(b.view().looseWeapons![0]);assert(claimed);assert.equal(claimed.reloadRemaining,remaining);assert.equal(claimed.ammo,0);assert(!b.items.list.includes(given));
  for(let i=0;i<150;i++)a.update(dt);assert.equal(claimed.ammo,6);
});
console.log(`${passed} pet quality checks passed`);
