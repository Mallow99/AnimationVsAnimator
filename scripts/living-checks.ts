import assert from 'node:assert/strict';
import {Pet,DEFAULT_CONFIG} from '../src/core/pet';
import {companionConfig,activeFigureIds,mergeConfig} from '../src/core/config';
import {DrawTool} from '../src/core/skills/draw-tool';
import {ShootGun} from '../src/core/skills/gun';
import {ReadBook} from '../src/core/skills/read-book';
import {OverlayTools} from '../src/core/overlay-tools';
import {CursorWeapon} from '../src/core/combat/cursor-weapon';
import {Props,makeBox} from '../src/core/props';
import {drawItem,itemParts} from '../src/core/items';
import {satchelParts} from '../src/core/satchel';
import {bookShape} from '../src/core/book-art';
import {checkSanity} from '../src/core/sanity';
import {GroupActivity,groupPlan} from '../src/core/skills/group';
import {Mood} from '../src/core/mood';
import {MoveFurniture} from '../src/core/skills/arrange';
import {Duel} from '../src/core/skills/duel';
import {conversationLine,everydayReply} from '../src/core/personality';
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
test('roster selection uses stable identities, validates ids and retains legacy solo settings',()=>{
 const solo=mergeConfig(DEFAULT_CONFIG,{figureCount:1,spawnOrder:[4,2,0,1,3]});assert.deepEqual(activeFigureIds(solo),[4]);
 const pair=mergeConfig(solo,{figureCount:2});assert.deepEqual(activeFigureIds(pair),[4,2]);assert(pair.friend.on);
 const invalid=mergeConfig(DEFAULT_CONFIG,{spawnOrder:[4,4,-1,99,2]});assert.deepEqual(invalid.spawnOrder,[4,2,0,1,3]);
 assert.deepEqual(activeFigureIds(mergeConfig(DEFAULT_CONFIG,{friend:{on:false}})),[0]);
 const profile=companionConfig(pair,4),newProfile=mergeConfig(profile,{figureCount:5});assert.equal(newProfile.name,'Ruby');assert.equal(newProfile.look.color,profile.look.color);
});

test('scooting braces before moving, visibly lifts, advances in small steps and settles',()=>{
 const [p]=fixture(),ch=p.char;ch.sitOn({x:ch.x,y:770},1,'front');for(let i=0;i<120;i++)p.update(dt);
 const at={...ch.seat!},hip=ch.body.j.hip.y;ch.scootTo({x:at.x+36,y:at.y});
 for(let i=0;i<18;i++)p.update(dt);assert(Math.abs(ch.seat!.x-at.x)<.01,'must brace before sliding');
 for(let i=0;i<30;i++)p.update(dt);assert(ch.body.j.hip.y<hip-1,'must lift while scooting');
 assert(ch.seat!.x>at.x && ch.seat!.x<at.x+22);for(let i=0;i<90;i++)p.update(dt);
 assert(!ch.scooting);assert(Math.abs(ch.seat!.x-at.x-18*ch.scale)<.01);ch.standUp();p.update(dt);assert(!ch.scooting);
});
test('ordinary chat creates a five-person conversation, takes separate turns and records completion for everyone',()=>{
 const pets=fixture(5),spoken:{who:string;text:string;time:number}[]=[];
 for(const p of pets){p.paused=false;p.ctx.say=(text)=>{if(p.view().group?.phase==="do")spoken.push({who:p.ctx.who,text,time:p.ctx.world.time});};}
 pets[0].command('do:chat');let reached=false;
 for(let i=0;i<10000;i++){for(const p of pets)p.update(dt);if(pets.every(p=>p.mind.activeSkill instanceof GroupActivity && p.view().group?.phase==='do'))reached=true;}
 assert(reached);const lines=spoken.filter(s=>s.text!=='Come join us!');assert.equal(new Set(lines.map(s=>s.who)).size,5);
 for(let i=1;i<lines.length;i++)assert(lines[i].time-lines[i-1].time>3.5,'speakers must leave a pause: '+JSON.stringify(lines));
 for(const p of pets){assert(!p.view().group);for(const q of pets.filter(q=>q!==p))assert.equal(p.ctx.relationship!(q.ctx.who).activities.chat,1);}
});
test('group invitations preserve a reader and can include a quietly seated companion',()=>{
 const pets=fixture(4);for(const p of pets)p.paused=false;
 pets[3].items.give('book',pets[3].char);pets[3].command('do:read');for(let i=0;i<360;i++)for(const p of pets)p.update(dt);
 const reader=pets[3].mind.activeSkill;assert.equal(reader?.name,'read');
 const couch=pets[0].props.spawn('couch',500,744,1)!;for(let i=0;i<240;i++)for(const p of pets)p.update(dt);
 pets[1].char.sitOn(couch.seatAt!,1,'front');pets[0].command('do:group:chat');
 for(let i=0;i<1200;i++)for(const p of pets)p.update(dt);
 assert.equal(pets[3].mind.activeSkill,reader);assert.equal(pets[0].view().group?.members.length,3);assert(pets[1].view().group);
});
test('a duel ignores a bystander hit and a third challenger without changing its opponent',()=>{
 const [a,b,c,d,e]=fixture(5);a.selectPeer(b.ctx.who);b.selectPeer(a.ctx.who);
 a.mind.startActivity(a.ctx,new Duel(false));b.mind.startActivity(b.ctx,new Duel(false));a.paused=b.paused=false;a.update(dt);b.update(dt);
 const message={type:'hit' as const,joint:'hip' as const,vx:400,vy:-50,power:1,weapon:null,at:{x:c.char.x,y:c.char.body.j.hip.y},kind:'cross' as const};
 const hp=c.char.hp;c.receive(message,a);assert.equal(c.char.hp,hp);assert.notEqual(c.mind.activeSkill?.name,'duel');
 const ownHp=b.char.hp;b.receive(message,c);assert.equal(b.char.hp,ownHp);b.receive({type:'challenge',armed:false},d);assert.equal(b.partnerId,a.ctx.who);
 for(let i=0;i<1800;i++)for(const p of [a,b,c,d,e])p.update(dt);
 assert.equal(c.char.hp,1);assert.equal(d.char.hp,1);assert.equal(e.char.hp,1);
});
test('moving a TV completes with visible travel and releases an occupied, grabbed or blocked object',()=>{
 const [p]=fixture(),couch=p.props.spawn('couch',650,744,1)!,tv=p.props.spawn('tv',1070,728,1)!;
 for(let i=0;i<360;i++)p.update(dt);const start={...tv.center};const move=new MoveFurniture();move.start(p.ctx);let done=false,saw=false;
 for(let i=0;i<9000&&!done;i++){move.t+=dt;done=move.update(p.ctx,dt);p.update(dt);if(tv.movingBy===p.ctx.who && Math.abs(tv.center.x-start.x)>10)saw=true;}
 move.stop(p.ctx);assert(done&&saw);assert(Math.abs(tv.center.x-start.x)>80);assert(Math.abs(tv.center.x-couch.center.x)<220);assert.equal(tv.facing,-1);assert.equal(tv.movingBy,null);
 const busy=new MoveFurniture();tv.watchers.add('watcher');busy.start(p.ctx);for(let i=0;i<800;i++){busy.t+=dt;if(busy.update(p.ctx,dt))break;p.update(dt);}busy.stop(p.ctx);assert.equal(tv.movingBy,null);tv.watchers.clear();
});
test('offline needs have real causes, calm during work and retain legacy/new saved moods and relationships',()=>{
 const [p,q]=fixture(2);p.mood.s.socialNeed=.8;p.mood.s.inspiration=.8;p.mood.s.frustration=.8;p.paused=false;
 p.items.give('book',p.char);p.command('do:read');for(let i=0;i<1800;i++)p.update(dt);
 assert(p.mood.s.inspiration<.72);assert(p.mood.s.frustration<.6);p.ctx.recordActivity!(q.ctx.who,'check',true);
 const relation=p.ctx.relationship!(q.ctx.who);assert(relation.care>0&&relation.cooperation>.5);const [r]=fixture();r.load(p.save());assert.deepEqual(r.ctx.relationship!(q.ctx.who),relation);
 const m=new Mood();m.load({energy:.4,trust:.8,savedAt:Date.now()});assert(Number.isFinite(m.s.socialNeed));m.nudge({inspiration:NaN});assert(Number.isFinite(m.s.inspiration));
 assert.equal(new Set(['inventive','competitive','gentle','mischievous','adventurous'].map(p=>everydayReply(p as any,'taken'))).size,5);
 assert.equal(new Set(['inventive','competitive','gentle','mischievous','adventurous'].map(p=>conversationLine(p as any,0,true))).size,5);
});
test('live sanity audit catches duplicate ownership, invalid coordinates and stale shared claims without changing the world',()=>{
 const [a,b]=fixture(2);assert.deepEqual(checkSanity([a,b]),[]);const book=a.items.give('book',a.char)!;b.items.list.push(book);
 const couch=a.props.spawn('couch',600,744,1)!;couch.sitters.set('missing',{x:0,lying:false} as any);a.char.body.j.head.x=NaN;
 const issues=checkSanity([a,b]);assert(issues.some(i=>i.includes('duplicate ownership')));assert(issues.some(i=>i.includes('invalid body')));assert(issues.some(i=>i.includes('stale seat')));assert(b.items.list.includes(book));
});
test('friendly rivalry chooses familiar game partners and care increases reassurance choices',()=>{
 const [a,b,c]=fixture(3);b.applyConfig({...b.config,personality:'mischievous'});c.applyConfig({...c.config,personality:'mischievous'});
 const tv=a.props.spawn('tv',850,728,1)!;for(let i=0;i<240;i++)for(const p of [a,b,c])p.update(dt);
 a.ctx.relationship!(c.ctx.who).rivalry=1;
 assert.equal(groupPlan(a.ctx,'pong',tv)?.members[1],c.ctx.who);
 a.ctx.world.time=120;b.char.hp=.4;
 const before=a.mind.weigh(a.ctx).find(o=>o.name==='checkfriend')!.score;
 a.ctx.relationship!(b.ctx.who).care=1;
 assert(a.mind.weigh(a.ctx).find(o=>o.name==='checkfriend')!.score>before);
});
test('departing owners release bookshelf slots and rejoining owners receive furniture platforms',()=>{
 const [a,b]=fixture(2),shelf=a.props.spawn('bookshelf',850,700,1)!,book=b.items.give('book',b.char)!;
 b.items.drop(book,0,0);book.shelf={key:shelf.storageKey,slot:0};b.leaveWorld();assert.equal(book.shelf,null);assert(b.items.list.includes(book));
 b.enterWorld();const box=makeBox({strokes:[],color:'#555',born:0,done:true},700,600,800,650);a.props.add(box);
 for(let i=0;i<240;i++)a.update(dt);
 assert(b.ctx.world.platforms.some(p=>p.id===box.platform.id),'rejoining owner did not receive the new platform');
 const duplicate=a.items.give('book',a.char)!;a.items.drop(duplicate,0,0);duplicate.shelf={key:shelf.storageKey,slot:0};
 b.items.drop(book,0,0);book.shelf={key:shelf.storageKey,slot:0};assert(checkSanity([a,b]).some(i=>i.includes('duplicate bookshelf')));
});
test('a completed Pong match and friendly duel record shared rivalry for their actual partners',()=>{
 const [a,b]=fixture(2);for(const p of [a,b])p.paused=false;
 const tv=a.props.spawn('tv',650,728,1)!;for(let i=0;i<240;i++)for(const p of [a,b])p.update(dt);
 a.command('do:pong');let played=false;
 for(let i=0;i<6500;i++){for(const p of [a,b])p.update(dt);if(tv.pong){played=true;tv.pong.winner=0;tv.pong.time=0;}}
 assert(played);for(const p of [a,b]){const r=p.ctx.relationship!(p===a?b.ctx.who:a.ctx.who);assert.equal(r.activities.pong,1);assert(r.rivalry>0);}
 a.selectPeer(b.ctx.who);const duel=new Duel(false);duel.start(a.ctx);b.char.hp=0;duel.t=1;duel.update(a.ctx,dt);duel.stop(a.ctx);
 assert.equal(a.ctx.relationship!(b.ctx.who).activities.duel,1);
});
console.log(`${passed} living stickmen checks passed`);
