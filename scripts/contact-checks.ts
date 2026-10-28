import assert from 'node:assert/strict';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
import { Handling } from '../src/core/skills/handling';
import { FetchItem, Tool } from '../src/core/skills';
import { ReadingLight, SwitchLamp } from '../src/core/skills/domestic';
import { GiveGift } from '../src/core/skills/gift';
import { ReadBook } from '../src/core/skills/read-book';
import type { Ctx, Skill } from '../src/core/skills/context';
import { checkSanity } from '../src/core/sanity';

let seed = 73;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const dt = 1 / 120;
let passed = 0;
function test(name: string, run: () => void) {
  seed = 73;
  run();
  passed++;
  console.log('PASS contact:', name);
}
function pets(count = 1) {
  const cfg = { ...structuredClone(DEFAULT_CONFIG), windows: false, dailyRhythm: false, destructible: false };
  const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
  const first = new Pet(bounds, cfg, { identity: 'contact-0' });
  const all = [first, ...Array.from({ length: count - 1 }, (_, i) => new Pet(bounds, companionConfig(cfg, i + 1), { props: first.props, identity: `contact-${i + 1}` }))];
  for (const [i,p] of all.entries()) { p.paused = true; p.mind.holdUntil = Infinity; p.char.placeHome(300 + i * 75); }
  for (let i = 0; i < 500; i++) for (const p of all) p.update(dt);
  for (const p of all) p.others = all.filter(q => q !== p);
  return all;
}
function frozen(scale = 1, personality: Ctx['personality'] = 'inventive') {
  return { char: { useHand: 'R', scale, body: { j: { handR: { x: 0, y: 0 } } }, handTarget: null }, personality } as unknown as Ctx;
}
function advance(skill: Skill, c: Ctx, seconds = 5) {
  skill.start(c);
  let done = false;
  for (let i = 0; i < seconds / dt && !done; i++) { skill.t += dt; done = skill.update(c, dt); }
  skill.stop(c);
  return done;
}

test('elapsed time cannot become contact at any supported size or personality', () => {
  for (const scale of [.6,1,2.5]) for (const personality of ['inventive','competitive','gentle','mischievous','adventurous'] as const) {
    const c = frozen(scale, personality), reach = new Handling();
    for (let i = 0; i < 4 / dt; i++) assert.equal(reach.reach(c,{x:1000,y:1000},dt),false);
    assert(reach.failed); assert.equal(c.char.handTarget,null);
  }
});
test('a moving target does not acquire success from an old reach timer', () => {
  const c = frozen(), reach = new Handling();
  for (let i=0;i<4/dt;i++) assert.equal(reach.reach(c,{x:100+Math.sin(i/30)*30,y:50},dt),false);
  assert(reach.failed); assert.equal(c.char.handTarget,null);
});
test('real nearby contact still waits for notice/reach and uses a scaled tolerance', () => {
  for (const scale of [.6,1,2.5]) {
    const c = frozen(scale), reach = new Handling(); let touchedAt = 0;
    for (let i=0;i<2/dt;i++) if(reach.reach(c,{x:3*scale,y:2*scale},dt)){touchedAt=(i+1)*dt;break;}
    assert(touchedAt>=.53&&touchedAt<1); assert(!reach.failed);
  }
  const c=frozen();Object.defineProperty(c.char,'useHand',{value:null});
  const reach=new Handling();assert(!reach.reach(c,{x:0,y:0},dt));assert(reach.failed);
});
test('an unreachable belt slot neither draws nor stows its original tool', () => {
  const [p] = pets(), item = p.items.give('book',p.char)!;p.items.stow(item);
  const uid=item.uid, original=p.items.slotPose;
  p.items.slotPose=()=>({at:{x:10000,y:-10000,z:0},dir:{x:1,y:0,z:0}}) as ReturnType<typeof original>;
  try {
    const tool = new Tool('none');tool.item=item;let result:'working'|'ready'|'none'='working';
    for(let i=0;i<3/dt&&result==='working';i++)result=tool.fetch(p.ctx,dt);
    assert.equal(result,'none');assert.equal(tool.why,'unreachable');assert.equal(item.where,'belt');assert.equal(item.uid,uid);
    p.items.toHand(item,p.char.useHand!);const storing=new Tool('none');storing.item=item;let done=false;
    for(let i=0;i<3/dt&&!done;i++)done=storing.stow(p.ctx,dt);
    assert(done);assert.equal(item.where,'hand');assert(p.items.list.includes(item));assert.equal(p.char.handTarget,null);
  } finally { p.items.slotPose=original; }
});
test('failed pickup makes bounded approach attempts and retains the same loose original', () => {
  const [p] = pets(), item = p.items.spawn('book',{x:p.char.x+8,y:798},1)!;
  const skill = new FetchItem(item,false);assert(advance(skill,p.ctx,8));
  assert.equal(item.where,'world');assert(p.items.list.includes(item));assert.equal(p.char.handTarget,null);
});
test('an unreachable lamp switch does not activate, claim, or block optional reading preparation', () => {
  const [p] = pets(), lamp = p.props.spawn('lamp',p.char.x+25,740,1)!;
  const original=lamp.toWorld;lamp.toWorld=()=>({x:p.char.x,y:-1000});
  try {
    assert(advance(new SwitchLamp(lamp,true),p.ctx,4));
    assert.equal(lamp.manualLight,null);assert(!lamp.on);assert.equal(lamp.lightUsers.size,0);
    const light=new ReadingLight();let ready=false;
    for(let i=0;i<4/dt&&!ready;i++)ready=light.prepare(p.ctx,dt);
    assert(ready);assert.equal(lamp.lightUsers.size,0);assert(!lamp.on);light.stop(p.ctx);assert.equal(p.char.handTarget,null);
  } finally { lamp.toWorld=original; }
});
test('a missed gift handoff retains ownership, bookmark and original identity', () => {
  const [p,q] = pets(2);for(const it of [...p.items.list])p.items.remove(it);
  q.char.placeHome(p.char.x+22*p.char.scale);
  const item=p.items.give('book',p.char)!;p.items.stow(item);item.bookmark=9;
  const view=q.view();view.joints.handL={x:10000,y:-10000,z:0};view.joints.handR={x:10000,y:-10000,z:0};
  p.ctx.peers=()=>[view];let delivered=0;p.ctx.deliverGift=()=>{delivered++;return()=>{};};
  const skill=new GiveGift(false);skill.start(p.ctx);p.items.toHand(item,p.char.useHand!);let done=false;
  for(let i=0;i<4/dt&&!done;i++){skill.t+=dt;done=skill.update(p.ctx,dt);}
  assert(done);assert.equal(delivered,0);assert(p.items.list.includes(item));assert(!q.items.list.some(i=>i.uid===item.uid));assert.equal(item.bookmark,9);
  skill.stop(p.ctx);assert(p.items.list.includes(item));assert.equal(p.char.handTarget,null);
});
test('a normal physical pickup succeeds only after the actual hand reaches the original', () => {
  const [p] = pets(), item=p.items.spawn('book',{x:p.char.x+8,y:798},1)!;let transfers=0;
  const toHand=p.items.toHand.bind(p.items);
  p.items.toHand=(it,hand)=>{
    if(it===item){const actual=p.char.body.j[hand==='L'?'handL':'handR'];assert(Math.hypot(actual.x-it.at.x,actual.y-it.at.y)<7*p.char.scale);transfers++;}
    return toHand(it,hand);
  };
  p.paused=false;p.mind.startActivity(p.ctx,new FetchItem(item,false));
  for(let i=0;i<15/dt;i++)p.update(dt);
  assert.equal(transfers,1);assert(p.items.list.includes(item));assert(['belt','hand'].includes(item.where));assert.deepEqual(checkSanity([p]),[]);
});
test('an unreachable shelf return preserves the finished original and bookmark', () => {
  const [p]=pets(),book=p.items.give('book',p.char)!,shelf=p.props.spawn('bookshelf',p.char.x,660,1)!;
  book.bookPages=8;book.bookmark=7;const uid=book.uid,world=shelf.toWorld.bind(shelf);
  shelf.toWorld=(x,y)=>y===35?{x:10000,y:-10000}:world(x,y);
  p.paused=false;p.mind.startActivity(p.ctx,new ReadBook(book));
  for(let i=0;i<60/dt;i++)p.update(dt);
  assert(p.items.list.includes(book));assert.equal(book.uid,uid);assert.equal(book.bookmark,8);
  assert.equal(book.shelf,null);assert.notEqual(p.mind.activeSkill?.name,'read');assert.equal(p.char.handTarget,null);
  assert.deepEqual(checkSanity([p]),[]);
});
test('a successful shelf return touches the exact slot before placing the original', () => {
  const [p]=pets(),shelf=p.props.spawn('bookshelf',p.char.x+70,733,1)!;
  for(let i=0;i<240;i++)p.update(dt);
  const book=p.items.give('book',p.char)!;book.bookPages=8;book.bookmark=7;
  const originalDrop=p.items.drop.bind(p.items);let returns=0;
  p.items.drop=(item,vx,vy)=>{
    if(item===book){
      const hand=p.char.body.j[p.char.useHand==='L'?'handL':'handR'];
      assert(Math.hypot(hand.x-item.at.x,hand.y-item.at.y)<7*p.char.scale,'shelf placement preceded hand contact');
      returns++;
    }
    return originalDrop(item,vx,vy);
  };
  const skill=new ReadBook(book);skill.start(p.ctx);let done=false;
  for(let i=0;i<60/dt&&!done;i++){skill.t+=dt;done=skill.update(p.ctx,dt);p.update(dt);}
  assert(done);skill.stop(p.ctx);assert.equal(returns,1);assert.equal(book.where,'world');assert.equal(book.shelf?.key,shelf.storageKey);
  assert.equal(book.bookmark,8);assert(p.items.list.includes(book));assert.equal(p.char.handTarget,null);assert.deepEqual(checkSanity([p]),[]);
});
test('a successful gift transfers only after a real hand-to-hand reach', () => {
  const [a,b]=pets(2);for(const p of [a,b])for(const it of [...p.items.list])p.items.remove(it);
  const book=a.items.give('book',a.char)!;book.bookmark=9;
  const deliver=a.ctx.deliverGift!;let deliveries=0;
  a.ctx.deliverGift=(id,message,reply)=>{
    const hand=a.char.body.j[book.hand==='L'?'handL':'handR'];
    const receiver=b.view();const distance=Math.min(...[receiver.joints.handL,receiver.joints.handR].filter(v=>!!v).map(v=>Math.hypot(v!.x-hand.x,v!.y-hand.y)));
    assert(distance<7*a.char.scale);deliveries++;return deliver(id,message,reply);
  };
  a.paused=false;b.paused=false;a.mind.startActivity(a.ctx,new GiveGift(false));
  for(let i=0;i<15/dt;i++)for(const p of [a,b])p.update(dt);
  assert.equal(deliveries,1);assert(!a.items.list.includes(book));assert(b.items.list.some(it=>it.uid===book.uid&&it.bookmark===9));
  assert.deepEqual(checkSanity([a,b]),[]);
});
test('a turned figure stows the original with its actual held arm', () => {
  const [p]=pets(),book=p.items.give('book',p.char)!;
  p.items.toHand(book,'L');p.char.facing=1;
  const stow=p.items.stow.bind(p.items);let stored=0;
  p.items.stow=(item)=>{
    if(item===book){const hand=p.char.body.j.handL,at=p.items.slotPose(p.char,0).at;
      assert(Math.hypot(hand.x-at.x,hand.y-at.y)<7*p.char.scale,'the empty front hand cannot stow a back-hand original');stored++;}
    return stow(item);
  };
  const tool=new Tool('none');tool.item=book;let done=false;
  for(let n=0;n<4/dt&&!done;n++){done=tool.stow(p.ctx,dt);p.update(dt);}
  assert(done);assert.equal(stored,1);assert.equal(book.where,'belt');assert.equal(p.char.handTarget,null);
});
test('a missing selected arm fails safely and later world reaches discard body-relative arm state', () => {
  const [p]=pets();p.char.destructible=true;p.char.detach('armL');
  const missing=new Handling();assert(!missing.reach(p.ctx,{x:p.char.x,y:750},dt,false,'L'));assert(missing.failed);assert.equal(Boolean(p.char.handTarget),false);
  p.char.regrow('armL');p.char.facing=1;
  const book=p.items.give('book',p.char)!;p.items.toHand(book,'L');const tool=new Tool('none');tool.item=book;
  for(let n=0;n<30;n++){tool.stow(p.ctx,dt);p.update(dt);}
  assert.equal(p.char.handTarget?.bodyRelative,true);assert.equal(p.char.reachingHand,'L');
  const world=new Handling();for(let n=0;n<25;n++)world.reach(p.ctx,{x:p.char.x+14,y:798},dt);
  assert.equal(p.char.handTarget?.bodyRelative,undefined);assert.equal(p.char.handTarget?.hand,undefined);assert.equal(p.char.reachingHand,'R');
  const before=p.char.body.j.neck.y;
  p.char.handTarget={x:p.char.x+14,y:798};for(let n=0;n<120;n++)p.update(dt);
  assert(p.char.body.j.neck.y>before+10,'a later floor reach must still bend down');
  p.char.handTarget=null;assert.equal(p.char.reachingHand,p.char.useHand);
});
test('wrapped gifts recover from deep wrapping posture in both directions and touch with the held original', () => {
  for(const side of [-1,1] as const){
    const [a,b]=pets(2);for(const it of [...b.items.list])b.items.remove(it);
    b.char.placeHome(a.char.x+75*side);for(let n=0;n<600;n++)for(const p of [a,b])p.update(dt);
    Object.assign(a.mood.s,{happiness:.085,trust:.06,boredom:1,inspiration:1,energy:.8,contentment:.93,confidence:.95,affection:.95});
    a.char.facing=side===1?-1:1;
    const gift=a.items.give('dumbbell',a.char)!;a.items.give('flowers',a.char);
    const pen=a.items.find('draw')!;a.items.toHand(pen,side===1?'L':'R');
    const deliver=a.ctx.deliverGift!;let offered=0;
    a.ctx.deliverGift=(id,message,reply)=>{
      assert.equal(message.uid,gift.uid);assert((message.wrap??0)>0);
      const hand=a.char.body.j[gift.hand==='L'?'handL':'handR'],view=b.view();
      assert(Math.min(...[view.joints.handL,view.joints.handR].filter(p=>p).map(p=>Math.hypot(p!.x-hand.x,p!.y-hand.y)))<7*a.char.scale);
      offered++;return deliver(id,message,reply);
    };
    a.paused=false;b.paused=false;a.mind.startActivity(a.ctx,new GiveGift(true));
    for(let n=0;n<18/dt;n++)for(const p of [a,b])p.update(dt);
    assert.equal(offered,1);assert(!a.items.list.includes(gift));assert(b.items.list.some(it=>it.uid===gift.uid));
    assert.equal(b.ctx.relationship!(a.ctx.who).giftsReceived,1);assert.equal(a.char.handTarget,null);
    assert.deepEqual(checkSanity([a,b]),[]);
  }
});
console.log(`${passed} contact checks passed`);
