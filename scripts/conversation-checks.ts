import assert from 'node:assert/strict';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { OfflineConversation, MESSAGE_LIMIT, TRANSCRIPT_LIMIT } from '../src/core/brains/conversation';
import { offlineReply } from '../src/core/brains/offline';
import { FileHabitats } from '../src/app/file-habitats';
import { parseReply } from '../src/core/brain';

const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
let passed = 0;
async function test(name: string, run: () => void | Promise<void>) {
  await run(); passed++; console.log(`PASS ${name}`);
}
function fixture() {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), mind: 'offline', windows: false, dailyRhythm: false });
  p.mind.holdUntil = Infinity;
  for (let i = 0; i < 400; i++) p.update(1/120);
  return p;
}
function say(p: Pet, text: string) {
  p.command(`hear:${text}`); p.update(1/120);
  return p.brain.log.filter(l => l.who === 'him').at(-1)?.text ?? ''; 
}
await test('a sustained local exchange remembers facts, follows a project and never calls a provider', () => {
  const p = fixture(); let calls = 0; p.brain.ask = async () => { calls++; throw Error('must stay local'); };
  say(p, 'My name is Sam'); say(p, 'I am building a tiny platform game');
  const replies = ['why?', 'what about you?', 'The jumping feels awkward', 'tell me more', 'I want it to feel playful', 'yeah'].map(t => say(p,t));
  assert(new Set(replies).size >= 5); assert(replies.some(s => s.includes('tiny platform game')));
  assert.match(say(p, 'what do you remember about me?'), /Sam.*tiny platform game/s);
  assert.equal(calls, 0);
});
await test('long multiline messages are kept intact instead of being cut to 300 characters', () => {
  const p = fixture(), text = 'I am working on an animation.\n' + 'Here are the details of this idea. '.repeat(45);
  say(p,text); assert.equal(p.brain.log.find(l => l.who === 'you')!.text,text.trim());
  assert(text.length > 1000 && text.length < MESSAGE_LIMIT);
});
await test('story choices change later scenes and survive a save/restart', () => {
  const p = fixture(); assert(say(p,'tell me a story').length > 300);
  say(p,'take the brass key and go to the tower');
  const q = fixture(); q.load(p.save());
  assert.match(say(q,'go to the garden'), /seed from the tower/);
  const ending = say(q,'go home'); assert.match(ending,/brass key/);
  const r = fixture(); say(r,'tell me a story');
  assert.match(say(r,'take the lantern to the river'), /bridge/);
  assert(!r.brain.log.some(l=>l.acts));
});
await test('statements, questions and negated clauses cannot accidentally trigger physical commands', () => {
  const p = fixture();
  for (const text of ['I read a book today', 'I hate this jump in my game', 'Why do you fight?', 'I would like to draw a cat', 'Please do not close this window', 'dance and do not close the window']) {
    const reply = offlineReply(p.ctx,text);
    if (text.startsWith('dance')) assert.deepEqual(reply.plan,[{do:'dance'}]);
    else assert.deepEqual(reply.plan,[],text);
  }
  assert.deepEqual(offlineReply(p.ctx,'can you dance and then jump 2 times').plan,[{do:'dance'},{do:'hop'},{do:'hop'}]);
  say(p,'dance and do not close the window');
  assert.equal(p.brain.log.at(-1)!.acts,'dance');
});
await test('ordinary conversation preserves a seated reader and its exact book', () => {
  const p = fixture(), book = p.items.give('book',p.char)!; p.command('do:read');
  for(let i=0;i<1800;i++)p.update(1/120);
  const skill = p.mind.activeSkill; assert.equal(skill?.name,'read');
  say(p,'I read a book about drawing today'); say(p,'what about you?');
  assert.equal(p.mind.activeSkill,skill); assert(p.items.list.includes(book));
  say(p,'dance'); assert.notEqual(p.mind.activeSkill,skill);
});
await test('separate queued messages receive separate replies, never a joined command', () => {
  const p = fixture(); p.command('hear:my name is Jo'); p.command('hear:what is my name?');
  p.update(1/120); p.update(1/120);
  const replies=p.brain.log.filter(l=>l.who==='him');assert.equal(replies.length,2);assert.match(replies[1].text,/Jo/);
});
await test('an open conversation permits requested walking instead of stopping it every frame', () => {
  const p=fixture(), x=p.char.x;p.listening=true;p.cursor(x+250,700,0,0);say(p,'come here');
  for(let i=0;i<360;i++)p.update(1/120);
  assert(p.char.x>x+80,'listening interrupted the explicit approach');
});
await test('context and transcript belong to one figure and survive travel back from a visit', () => {
  const p = fixture(), other = fixture();say(p,'I am making a paper dragon');
  assert(!say(other,'what do you remember about me?').includes('paper dragon'));
  const habitats = new FileHabitats(()=>{}); assert(habitats.enter(0,p,'/example'));
  const visitor=habitats.petFor(0)!;visitor.paused=false;
  assert.match(say(visitor,'what about you?'),/paper dragon/);
  habitats.returnHome(0); p.paused=false;
  assert.match(say(p,'what do you remember about me?'),/paper dragon/);
});
await test('saved dialogue validates malformed data and bounds transcript size', () => {
  const p=fixture();p.brain.loadConversation({v:1,local:{v:1,topic:'made-up',turns:NaN,facts:{name:42},story:{place:'bad'}},log:[null,{who:'script',text:'bad',at:0},{who:'you',text:'ok',at:3}]});
  assert.equal(p.brain.log.length,1);assert.doesNotThrow(()=>say(p,'hello'));
  p.brain.loadConversation({v:1,log:Array.from({length:600},(_,i)=>({who:'you',text:'x'.repeat(4000),at:i}))});
  assert(p.brain.log.length<=TRANSCRIPT_LIMIT);assert(p.brain.log.reduce((n,l)=>n+l.text.length,0)<=120000);
});
await test('name corrections replace conversation facts rather than preserving the old name', () => {
  const p=fixture();say(p,'my name is Alex');say(p,'actually, call me Morgan');
  const remembered=say(p,'what is my name?');assert.match(remembered,/Morgan/);assert(!remembered.includes('Alex'));
});
await test('new conversation clears transcript/context and ignores a delayed provider reply', async () => {
  const p=fixture();say(p,'my name is Lee');say(p,'tell me a story');
  p.applyConfig({...p.config,mind:'chat'});let resolve!: (s:string)=>void;
  p.brain.ask=()=>new Promise(r=>{resolve=r;});say(p,'hello');
  p.command('conversation:new');resolve('{"say":"stale reply","plan":[{"do":"dance"}]}');
  await new Promise(r=>setImmediate(r));assert.deepEqual(p.brain.log,[]);assert.equal(p.brain.conversation.save().story,null);
});
await test('Stop immediately cancels the action and invalidates an in-flight provider plan', async () => {
  const p=fixture();p.applyConfig({...p.config,mind:'chat'});let resolve!:(s:string)=>void;
  p.brain.ask=()=>new Promise(r=>{resolve=r;});say(p,'dance');say(p,'stop');
  resolve('{"say":"late","plan":[{"do":"dance"}]}');await new Promise(r=>setImmediate(r));
  assert(!p.brain.log.some(l=>l.text==='late'));assert.notEqual(p.mind.activeSkill?.name,'dance');
});
await test('unknown topics ask for direction without pretending to have a factual answer', () => {
  const p=fixture();assert.match(say(p,'what is the capital of Iceland?'),/don’t have a reliable answer/);
  const engine = new OfflineConversation();engine.load({v:1,story:{place:'tower',item:'key',visited:[]},topic:'story'});
  assert.match(engine.respond(p.ctx,'investigate the purple elephant','Cobalt').say,/need a direction/);
});
await test('long model replies and restored transcript context survive the provider boundary', async () => {
  const p=fixture();say(p,'I am building a paper dragon');
  const q=fixture();q.load(p.save());q.applyConfig({...q.config,mind:'chat'});
  let context='';const long='A detailed paragraph about this little adventure. '.repeat(16).trim();
  q.brain.ask=async req=>{context=JSON.stringify(req.messages);return JSON.stringify({say:long,plan:[]});};
  say(q,'tell me more');await new Promise(r=>setImmediate(r));
  assert(context.includes('paper dragon'));assert.equal(q.brain.log.at(-1)!.text,long);
  assert.equal(parseReply(long)!.say,long);
});
await test('the provider call cap falls back to local dialogue instead of leaving a message unanswered', async () => {
  const p=fixture();p.applyConfig({...p.config,mind:'chat'});let calls=0;
  p.brain.ask=async()=>{calls++;return '{"say":"hello","plan":[]}';};
  for(let i=0;i<120;i++){say(p,'hello');await new Promise(r=>setImmediate(r));}
  assert.equal(calls,120);const response=say(p,'tell me a story');
  assert.match(response,/brass key/);assert.equal(calls,120);
});
console.log(`${passed} conversation checks passed`);
