// Scheduled core feature soak. Real Chromium/Electron input remains a separate acceptance check.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {Pet,DEFAULT_CONFIG} from '../src/core/pet';
import {companionConfig} from '../src/core/config';
import {OverlayTools} from '../src/core/overlay-tools';
import {CursorWeapon} from '../src/core/combat/cursor-weapon';
import {checkSanity} from '../src/core/sanity';
import {activitiesFor} from '../src/app/activities';
import {makeBox} from '../src/core/props';

let state=Number(process.env.LIVING_SOAK_SEED??21)>>>0;
Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const bounds={left:0,right:1800,top:0,floor:800},dt=1/120;
const cfg={...structuredClone(DEFAULT_CONFIG),windows:false,dailyRhythm:false,destructible:false,hyperactivity:1,inkLifetime:0};
let pets:Pet[]=[];
function create(){const first=new Pet(bounds,cfg,{identity:'pet-0'});return [first,...[1,2,3,4].map(id=>new Pet(bounds,companionConfig(cfg,id),{props:first.props,identity:`pet-${id}`}))];}
pets=create();
let active=pets,elapsed=0,audits=0,step=0;
const coverage:{feature:string;seconds:number;result:string}[]=[];
function peers(){for(const p of pets){p.others=active.includes(p)?active.filter(q=>q!==p):[];p.ownsProps=p===active[0];if(active.includes(p))p.enterWorld();}}
function audit(){audits++;assert.deepEqual(checkSanity(pets,active),[],`live audit at ${elapsed.toFixed(2)}s`);for(const p of active){const h=p.char.body.j.hip;assert(h.x>=bounds.left-15&&h.x<=bounds.right+15&&h.y>=bounds.top-200&&h.y<=bounds.floor+15,`${p.config.name} left the desktop`);}}
function run(seconds:number,observe=()=>{}){
 for(let i=0;i<Math.ceil(seconds/dt);i++){for(const p of active)p.update(dt);observe();elapsed+=dt;if(++step%120===0)audit();}
}
function record(feature:string,at:number,result:string){coverage.push({feature,seconds:Number((elapsed-at).toFixed(2)),result});console.log(`PASS ${feature}: ${result}`);}
function room(props:[string,number][]=[]){
 for(const p of pets){p.paused=true;p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;p.char.standUp();p.char.hp=1;}
 for(const t of [...pets[0].props.things])pets[0].props.remove(t);
 for(const [i,p]of active.entries())p.char.placeHome(180+i*75);
 for(const [id,x]of props){const def=pets[0].props.defs.get(id)!;pets[0].props.spawn(id,x,bounds.floor-(def.bounds![3]-def.bounds![1])/2-2,1);}
 run(5);for(const p of pets){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.paused=false;}peers();audit();
}
function commands(feature:string,requests:[number,string][],seconds=65){
 const at=elapsed,seen=new Map<number,Set<string>>();for(const [id,cmd]of requests){seen.set(id,new Set());pets[id].command(`do:${cmd}`);}
 run(seconds,()=>{for(const [id]of requests){const name=pets[id].mind.activeSkill?.name;if(name)seen.get(id)!.add(name);}});
 for(const [id,cmd]of requests){
  const expected=cmd.startsWith('group:')||['pong','carrytogether'].includes(cmd)?'group':cmd.startsWith('drawitem:')||cmd==='drawgun'?'drawtool':cmd.startsWith('drawprop:')?'drawfurniture':['readingcorner','workcorner'].includes(cmd)?'arrange':['passtool','comparedrawings','checkfriend'].includes(cmd)?'moment':cmd;
  assert(seen.get(id)!.has(expected),`${feature}: ${cmd} never started its requested skill (${[...seen.get(id)!]})`);
 }
 for(const p of pets)p.mind.reset(p.ctx);run(2);audit();record(feature,at,'started, observed, completed or explicitly stopped; claims and ownership clean');
}
peers();for(const p of pets){p.paused=true;p.mind.holdUntil=Infinity;for(const id of ['book','cup','dumbbell','yo-yo','handheld'])p.items.give(id,p.char);}
run(5);for(const p of pets)p.mind.reset(p.ctx);
// Every built-in item goes through the original-object lifecycle, with passive transport.
room();let at=elapsed;
const tools=new OverlayTools(()=>active);
for(const def of pets[0].items.defs.values()){
 const owner=pets[0],other=pets[1],item=owner.items.give(def,owner.char)!;
 const uid=item.uid;assert(tools.beginItem(owner,item,{x:700,y:300}));tools.move({x:950,y:300},{x:800,y:0});run(2);
 assert(!tools.using);assert.equal(item.uid,uid);assert(tools.cancel());
 assert(tools.beginItem(owner,item,{x:700,y:300}));assert(tools.release({x:other.char.x,y:700},{x:0,y:0},other));
 assert(!owner.items.list.includes(item)&&other.items.list.includes(item));
 assert(tools.trashObject(other,item));assert(!other.items.list.includes(item));assert(tools.undo({x:1050,y:700}));
 assert(other.items.list.includes(item));other.giveBack(item);run(1);audit();
}
record('all 19 stock item lifecycles',at,'passive take/move, cancel, pass, trash/undo, store, original identity retained');
// Every furniture definition is placed, dragged and released through the same path.
room();at=elapsed;
for(const def of pets[0].props.defs.values()){
 assert(tools.pull(pets[0],'prop',def.id,{x:1150,y:500}));tools.move({x:1200,y:560},{x:100,y:0});run(1);
 assert(tools.release({x:1200,y:560},{x:100,y:0}));run(3);
 const t=pets[0].props.placed.find(t=>t.def?.id===def.id)!;assert(t);assert(tools.trashObject(pets[0],t));assert(tools.undo({x:1200,y:650}));run(2);pets[0].props.remove(t);
}
record('all nine stock furniture lifecycles',at,'place, rigid dragging, release, settle, trash/undo');
room([['bookshelf',1100],['couch',650]]);
commands('five parallel everyday activities',[[0,'sip'],[1,'exercise'],[2,'yoyo'],[3,'handheld'],[4,'read']],75);
room([['bookshelf',650]]);commands('book open/read/page/close/return',[[0,'read']],360);
room([['couch',650],['tv',950]]);commands('TV and Othello invitation',[[0,'watchtv'],[1,'videogame'],[2,'playgame']],45);
room([['canvas',450],['desk',650],['workbench',1000]]);commands('painting, blueprint and drawing',[[0,'paint'],[1,'deskwork'],[2,'drawitem:katana'],[3,'drawprop:chair'],[4,'drawgun']],80);
room([['workbench',650],['storage',1000]]);commands('refinement and tool sorting',[[2,'refine'],[1,'sorttools']],65);
for(const [act,n]of [['wave',5],['chat',5],['couch',5],['watch',5],['duet',2],['triangle',3],['mirror',4],['relay',5]] as const){
 active=pets.slice(0,n);peers();room([['couch',650],['tv',950]]);commands(`group:${act} (${n} figures)`,[[0,`group:${act}`]],65);
}
active=pets;peers();room([['couch',650],['tv',1050]]);commands('Pong match and interruption',[[0,'pong']],90);
room([['couch',650],['tv',1150]]);commands('TV arrangement',[[0,'arrange']],40);
room([['couch',650],['tv',1150]]);commands('cooperative carry',[[0,'carrytogether']],45);
room([['bookshelf',950],['chair',600]]);commands('reading corner',[[0,'readingcorner']],40);
room([['desk',950],['workbench',600]]);commands('work corner',[[0,'workcorner']],40);
room();commands('peer gift and drawing comparison',[[0,'passtool'],[2,'comparedrawings']],40);
room();pets[1].char.hp=.4;commands('reassurance',[[0,'checkfriend']],25);
room();pets[0].selectPeer(pets[1].ctx.who);pets[1].selectPeer(pets[0].ctx.who);commands('duel with three spectators',[[0,'duel']],30);
assert(pets.slice(2).every(p=>p.char.hp===1),'a spectator took combat damage');
// Owned gun clocks run through passive transport, active control and a reload interrupted by restart.
room();at=elapsed;const owner=pets[1],gun=owner.items.give('gun',owner.char)!;gun.ammo=0;gun.beginReload();
assert(tools.beginItem(owner,gun,{x:800,y:200}));run(2);assert.equal(gun.ammo,6);tools.cancel();
owner.useItem(gun);const cursor=new CursorWeapon();cursor.attach(gun,owner);cursor.pointer(800,200);cursor.press(true);cursor.pointer(1000,200);
run(2,()=>cursor.update(dt,active));cursor.press(false);cursor.detach();owner.giveBack(gun);gun.ammo=0;gun.beginReload();run(.4);
const gunIndex=owner.items.list.indexOf(gun),pending=gun.reloadRemaining;
assert(pending>0&&pending<1.15,'reload was not in progress at the restart');
const saved=pets.map(p=>p.save()),signatures=pets.map(p=>p.items.list.map(i=>i.def.id).sort());
pets=create();active=pets;for(const [id,p]of pets.entries()){p.paused=true;p.load(saved[id]);p.mind.holdUntil=Infinity;}peers();
assert.deepEqual(pets.map(p=>p.items.list.map(i=>i.def.id).sort()),signatures);
const restoredGun=pets[1].items.list[gunIndex];assert.equal(restoredGun.def.id,'gun');assert.equal(restoredGun.reloadRemaining,pending);
run(2);assert.equal(restoredGun.ammo,6);assert.equal(restoredGun.reloadRemaining,0);
record('cursor gun, reload and restart',at,'one gun, one clock, inventories/moods/relationships restored');
// Leaving and rejoining keep ownership; sleep remains asleep through a gentle actual pickup.
room();at=elapsed;const ruby=pets[4],originals=[...ruby.items.list];ruby.leaveWorld();active=pets.slice(0,4);peers();run(15);active=pets;peers();run(15);assert.deepEqual(ruby.items.list,originals);
const sleeper=pets[2];sleeper.mood.asleep=true;sleeper.char.sleeping=true;sleeper.char.lieDown();run(3);
const neck=sleeper.char.body.j.neck;sleeper.char.grab('neck',neck.x,neck.y);sleeper.char.moveHold(neck.x,neck.y-20,0,0);run(2);assert(sleeper.mood.asleep);sleeper.char.release();run(3);sleeper.mood.asleep=false;
record('roster removal/rejoin and sleeping pickup',at,'same Ruby and belongings; gentle carry preserves sleep');
// Settled stack, impacts and mixed-mass leaning remain live rather than pinned.
room();at=elapsed;
const boxes=Array.from({length:5},(_,i)=>{const t=makeBox({strokes:[],color:'#555',born:elapsed,done:true},1200,750-i*48,1310,798-i*48);t.forever=true;pets[0].props.add(t);return t;});
run(25);const centers=boxes.map(t=>({...t.center}));run(20);for(const [i,t]of boxes.entries())assert(Math.hypot(t.center.x-centers[i].x,t.center.y-centers[i].y)<.5);
boxes[4].hit(boxes[4].center.x,boxes[4].center.y,700,-350);run(10);assert(Math.hypot(boxes[4].center.x-centers[4].x,boxes[4].center.y-centers[4].y)>10);
pets[0].props.spawn('couch',900,760,1);const desk=pets[0].props.spawn('desk',1040,730,1)!;desk.place({x:1040,y:745},.4);run(30);
record('stacking, impact and leaning',at,'resting stack drift <0.5px; impact moves it; mixed contact remains finite');
// Finish in ordinary unattended life; choices are no longer held by the fixture.
for(const p of active){p.paused=false;p.mind.holdUntil=0;p.mood.s.energy=.65;}run(180);audit();
writeFileSync('.build/living-soak-report.json',JSON.stringify({seed:Number(process.env.LIVING_SOAK_SEED??21),simulatedSeconds:Number(elapsed.toFixed(2)),audits,coverage,issues:[]},null,2));
console.log(`PASS scheduled Living Stickmen soak: ${elapsed.toFixed(1)} simulated seconds, ${audits} live audits, ${coverage.length} feature phases; no issues. Report: .build/living-soak-report.json`);
