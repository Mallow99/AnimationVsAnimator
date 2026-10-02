// Headless physics checks: run the character with no screen, many times faster
// than real time, and make sure he behaves. `npm run sim`
import { Character } from '../src/core/character';
import type { Bounds } from '../src/core/physics';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { FLOOR, type Platform } from '../src/core/physics';
import { windowPlatforms } from '../src/core/world';

const DT = 1 / 120;
const bounds: Bounds = { left: 0, right: 1400, top: 0, floor: 800 };
let failures = 0;

function run(c: Character, seconds: number, each?: (t: number) => void) {
  const events: string[] = [];
  for (let i = 0; i < seconds / DT; i++) {
    each?.(i * DT);
    c.step(DT);
    for (const p of c.body.points) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('NaN in physics');
    for (const e of c.drainEvents()) events.push(e.type);
  }
  return events;
}

function upright(c: Character) {
  const j = c.body.j;
  return c.mode === 'ground' && j.head.y < j.neck.y && j.neck.y < j.hip.y && j.hip.y < Math.min(j.footL.y, j.footR.y);
}

function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failures++;
}

{ // Stands still without drifting or collapsing.
  const c = new Character(bounds, 500);
  run(c, 5);
  check('stands still', upright(c) && Math.abs(c.x - 500) < 6, `x=${c.x.toFixed(1)} mode=${c.mode}`);
}
{ // Gentle drop lands on feet.
  const c = new Character(bounds, 500);
  c.grab('head', c.body.j.head.x, c.body.j.head.y);
  run(c, 1, (t) => c.moveHold(500, 750 - 200 * t, 0, -200));
  c.release();
  const ev = run(c, 3);
  check('small drop lands on feet', ev.includes('landed') && !ev.includes('crashed') && upright(c), ev.join(','));
}
{ // Big drop crashes, then gets up.
  const c = new Character(bounds, 500);
  c.grab('head', c.body.j.head.x, c.body.j.head.y);
  run(c, 1.5, (t) => c.moveHold(500, 700 - 400 * t, 0, -400));
  c.moveHold(500, 100, 0, 0);
  run(c, 0.5);
  c.release();
  const ev = run(c, 6);
  check('big drop crashes then recovers', ev.includes('crashed') && ev.includes('gotUp') && upright(c), ev.join(','));
}
{ // Thrown sideways hard: bounces around, ends up standing.
  const c = new Character(bounds, 300);
  c.grab('neck', c.body.j.neck.x, c.body.j.neck.y);
  run(c, 0.5, (t) => c.moveHold(300 + 600 * t, 600, 1800, -400));
  c.release();
  const ev = run(c, 8);
  check('thrown recovers', upright(c) && c.x > 0 && c.x < 1400, `${ev.join(',')} x=${c.x.toFixed(0)}`);
}
{ // Walks to a target.
  const c = new Character(bounds, 300);
  run(c, 1);
  c.walkTo(900);
  const ev = run(c, 12);
  check('walks to target', ev.includes('arrived') && Math.abs(c.x - 900) < 15 && upright(c), `x=${c.x.toFixed(1)} ${[...new Set(ev)].join(',')}`);
}
{ // Runs back.
  const c = new Character(bounds, 900);
  run(c, 1);
  c.walkTo(200, true);
  const ev = run(c, 6);
  check('runs to target', ev.includes('arrived') && upright(c), `x=${c.x.toFixed(1)}`);
}
{ // Gentle poke wobbles but doesn't fall; hard shove knocks him over.
  const c = new Character(bounds, 600);
  run(c, 1);
  c.poke('neck', 250, 0);
  const ev1 = run(c, 2);
  check('gentle poke: stays up', !ev1.includes('tripped') && upright(c), ev1.join(','));
  c.poke('neck', 1600, -200);
  c.poke('head', 1600, -200);
  const ev2 = run(c, 5);
  check('hard shove: falls, gets up', ev2.includes('tripped') && ev2.includes('gotUp') && upright(c), ev2.join(','));
}
{ // Jump.
  const c = new Character(bounds, 600);
  run(c, 1);
  c.jump(150, -700);
  const ev = run(c, 3);
  check('jumps and lands', ev.includes('jumped') && ev.includes('landed') && upright(c), ev.join(','));
}
for (const scale of [1, 1.1, 1.5]) { // Sit, lie, get up; every gesture finishes standing.
  const c = new Character(bounds, 600, scale);
  run(c, 1); c.sit(); run(c, 2);
  const sat = c.mode === 'sit' && c.body.j.hip.y > 780;
  c.drainEvents();
  c.standUp(); run(c, 2);
  check(`sit and stand (size ${scale})`, sat && upright(c) && !c.drainEvents().some((e) => e.type === 'tripped'), `hipY=${c.body.j.hip.y.toFixed(0)}`);
  c.lieDown(); run(c, 3);
  const lying = c.mode === 'lie' && c.body.j.head.y > 760;
  c.standUp(); run(c, 3);
  check(`lie down and get up (size ${scale})`, lying && upright(c), `mode=${c.mode}`);
  for (const g of ['stomp', 'wave', 'shrug', 'laugh', 'flail', 'pokeBack', 'stretch', 'lookAround', 'cower'] as const) {
    c.doGesture(g, { x: 700, y: 650 }); run(c, 3);
    if (!upright(c)) check(`gesture ${g}`, false);
  }
  check(`all gestures end upright (size ${scale})`, upright(c));
}

// ───── windows as platforms ─────
{
  const plats = windowPlatforms(
    [{ id: 1, x: 100, y: 300, w: 300, h: 200 }, { id: 2, x: 50, y: 400, w: 600, h: 300 }, { id: 3, x: 900, y: 10, w: 400, h: 600 }],
    bounds,
  );
  // Window 2's top (y=400) is partly behind window 1 (x 100..400): two visible pieces. Window 3 is too high up (maximized-ish).
  const ok = plats.length === 3 && plats[0].id === 8 && plats.some((p) => p.x1 === 50 && p.x2 === 100) && plats.some((p) => p.x1 === 400 && p.x2 === 650);
  check('window tops: covered parts removed', ok, JSON.stringify(plats));
}
function onWindow(): Character {
  const c = new Character(bounds, 600);
  c.setPlatforms([{ id: 8, x1: 450, x2: 750, y: 500 }]);
  c.grab('neck', c.body.j.neck.x, c.body.j.neck.y);
  run(c, 0.6, (t) => c.moveHold(600, 700 - 400 * t, 0, -400));
  c.moveHold(600, 400, 0, 0); run(c, 0.4);
  c.release();
  run(c, 3);
  return c;
}
{
  const c = onWindow();
  check('dropped onto a window: lands on it', c.support === 8 && upright(c) && c.body.j.footL.y < 501, `support=${c.support} mode=${c.mode} footY=${c.body.j.footL.y.toFixed(0)}`);
  c.walkTo(1200);
  run(c, 8);
  check('walks to the edge and stops', c.support === 8 && upright(c) && c.x > 720 && c.x <= 750, `x=${c.x.toFixed(0)} support=${c.support}`);
  c.walkTo(1000, false, true);
  const ev = run(c, 6);
  check('walks off the edge on purpose, lands on the floor', ev.includes('fellOff') && c.support === FLOOR && upright(c), ev.join(','));
}
{
  const c = onWindow();
  let p: Platform = { id: 8, x1: 450, x2: 750, y: 500 };
  for (let i = 0; i < 20; i++) { p = { ...p, x1: p.x1 + 8, x2: p.x2 + 8, y: p.y - 3 }; c.setPlatforms([p]); run(c, 0.1); }
  run(c, 1);
  check('window dragged slowly: carried along', c.support === 8 && upright(c) && c.x > 700, `x=${c.x.toFixed(0)} support=${c.support} mode=${c.mode}`);
  c.setPlatforms([]);
  const ev = run(c, 4);
  check('window closed: falls to the floor', ev.includes('fellOff') && c.support === FLOOR && upright(c), ev.join(','));
}

// ───── mind + mood ─────
function petFor(seconds: number, pet: Pet, each?: (t: number) => void) {
  const fps = 1 / 60;
  for (let i = 0; i < seconds / fps; i++) {
    each?.(i * fps);
    pet.update(fps);
    for (const p of pet.char.body.points) if (!Number.isFinite(p.x)) throw new Error('NaN');
  }
}
{ // A long life: 30 simulated minutes with you poking, petting and throwing him now and then.
  const pet = new Pet(bounds);
  const seen = new Set<string>();
  let outOfBounds = 0;
  petFor(1800, pet, (t) => {
    if (pet.mind.skill) seen.add(pet.mind.skill.name);
    const j = pet.char.body.j;
    if (j.hip.x < 0 || j.hip.x > 1400 || j.hip.y > 800) outOfBounds++;
    if (Math.random() < 0.004) pet.cursor(Math.random() * 1400, 300 + Math.random() * 500);
    if (Math.random() < 0.0008) { const n = j.neck; pet.pointerDown(n.x, n.y + 3, t * 1000); pet.pointerUp(n.x, n.y); }
    if (Math.random() < 0.0002 && pet.char.mode === 'ground') {
      const n = j.neck; pet.pointerDown(n.x, n.y + 3, t * 1000);
      pet.pointerMove(n.x, n.y - 200, 0, -900, t * 1000 + 300);
      pet.update(0.3); pet.pointerMove(n.x + 100, n.y - 250, 1500, -500, t * 1000 + 600); pet.pointerUp(n.x + 100, n.y - 250);
    }
  });
  check('30-minute life: stays on screen', outOfBounds === 0, `out=${outOfBounds}`);
  check('30-minute life: varied behavior', seen.size >= 8, [...seen].join(','));
}
{ // Left alone, he should never fall over by himself.
  let trips = 0;
  for (let k = 0; k < 10; k++) {
    const pet = new Pet({ left: 0, right: 900, top: 0, floor: 400 });
    const orig = pet.mind.onEvent.bind(pet.mind);
    pet.mind.onEvent = (c, e) => { if (e.type === 'tripped' || e.type === 'crashed') trips++; orig(c, e); };
    petFor(120, pet);
  }
  check('left alone 20 minutes: never falls over', trips === 0, `falls=${trips}`);
}
{ // Fast swipe through him = smack. Slow rub = petting.
  const pet = new Pet(bounds);
  petFor(3, pet);
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { got.push(e.type); orig(c, e); };
  const swipe = () => {
    const y = pet.char.body.j.neck.y + 10, x0 = pet.char.x;
    for (let i = -6; i <= 6; i++) pet.cursor(x0 + i * 40, y, 2400, 0); // 40px per event at 60fps ≈ 2400 px/s
    petFor(0.2, pet);
  };
  swipe();
  check('smack mode off: swipe does nothing', !got.includes('smacked'), got.join(','));
  petFor(1, pet);
  pet.config.smacking = true;
  const before = pet.mood.s.annoyance;
  swipe();
  check('fast swipe smacks him', got.includes('smacked') && pet.mood.s.annoyance > before + 0.2, got.join(','));
}
{
  const pet = new Pet(bounds);
  petFor(3, pet);
  pet.paused = true; // hold still so the rub stays on him
  pet.char.stop();
  petFor(1, pet);
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { got.push(e.type); orig(c, e); };
  const hx = pet.char.x, hy = pet.char.body.j.hip.y - 10;
  for (let i = 0; i < 60; i++) { pet.cursor(hx + Math.sin(i / 3) * 12, hy, Math.cos(i / 3) * 240, 0); pet.update(1 / 60); }
  check('slow rub pets him (no smack)', got.includes('petted') && !got.includes('smacked'), got.join(','));
}
{ // Changing his size mid-life rebuilds his body without breaking anything.
  const pet = new Pet(bounds);
  petFor(3, pet);
  pet.paused = true;
  pet.applyConfig({ ...pet.config, scale: 1.8 });
  petFor(4, pet);
  pet.applyConfig({ ...pet.config, scale: 0.7 });
  petFor(4, pet);
  check('resize in settings: still standing', upright(pet.char) && Math.abs(pet.char.scale - 0.7) < 1e-6, `mode=${pet.char.mode}`);
}
{ // Dragging a window sideways while another window covers part of its top: he still rides along.
  const c = onWindow();
  for (let i = 0; i < 30; i++) {
    const wx = 450 + i * 6;
    c.setPlatforms(windowPlatforms([{ id: 9, x: 200, y: 450, w: 300, h: 200 }, { id: 1, x: wx, y: 500, w: 300, h: 300 }], bounds));
    run(c, 1 / 30);
  }
  run(c, 1);
  check('dragged sideways while partly covered: rides along', c.support >= 0 && upright(c) && c.x > 700, `x=${c.x.toFixed(0)} support=${c.support} mode=${c.mode}`);
}
{ // Life with windows: he climbs up, gets down, never leaves the screen.
  const pet = new Pet(bounds);
  pet.setWindows([
    { id: 1, x: 150, y: 560, w: 380, h: 300 },
    { id: 2, x: 700, y: 420, w: 450, h: 400 },
  ]);
  const seen = new Set<string>();
  let out = 0, onWin = 0;
  petFor(900, pet, () => {
    if (pet.mind.skill) seen.add(pet.mind.skill.name);
    const j = pet.char.body.j;
    if (j.hip.x < 0 || j.hip.x > 1400 || j.hip.y > 800) out++;
    if (pet.char.support >= 0) onWin++;
  });
  check('with windows: climbs up and gets down', seen.has('climb') && seen.has('getdown') && out === 0, `${[...seen].join(',')} onWindowFrames=${onWin}`);
}
{ // Cheap learning: a jump down that hurts makes him warier of that height.
  const pet = new Pet(bounds);
  pet.setWindows([{ id: 1, x: 500, y: 250, w: 400, h: 500 }]); // ~550px drop: will hurt
  petFor(1, pet);
  pet.paused = true;
  const c = pet.char;
  c.grab('neck', c.body.j.neck.x, c.body.j.neck.y);
  for (let i = 0; i < 30; i++) { c.moveHold(700, 700 - i * 15, 0, -900); pet.update(1 / 60); }
  c.moveHold(700, 160, 0, 0); petFor(0.5, pet);
  c.release(); petFor(3, pet);
  const onTop = c.support >= 0;
  pet.ctx.lessons.safeDrop = 600;
  pet.paused = false;
  (pet.mind as any).interrupt(pet.ctx, new (await import('../src/core/skills')).GetDown(1));
  petFor(8, pet);
  check('jumping off a too-high window teaches him', onTop && pet.ctx.lessons.safeDrop < 500, `onTop=${onTop} safeDrop=${pet.ctx.lessons.safeDrop.toFixed(0)}`);
}
{ // Tall windows (like a MacBook screen): he climbs their sides, climbs down when the drop scares him,
  // and does monkey bars across the top of the screen.
  const B = { left: 0, right: 1440, top: 0, floor: 860 };
  const wins = [{ id: 1, x: 200, y: 60, w: 700, h: 700 }, { id: 2, x: 950, y: 120, w: 450, h: 740 }];
  // Mind paused during warm-up so he isn't already mid-climb when the test starts.
  const setup = () => { const p = new Pet(B); p.setWindows(wins); p.paused = true; petFor(3, p); p.paused = false; return p; };
  let pet = setup();
  pet.mind.command(pet.ctx, 'climb');
  const calm = () => ['ground', 'sit'].includes(pet.char.mode);
  let up = false;
  for (let i = 0; i < 30 * 60 && !up; i++) { pet.update(1 / 60); if (pet.char.support >= 0 && calm()) up = true; }
  petFor(1, pet);
  check('climbs the side of a tall window onto it', up, `support=${pet.char.support} mode=${pet.char.mode}`);
  pet.ctx.lessons.safeDrop = 150;
  pet.mind.command(pet.ctx, 'getdown');
  let reachedFloor = false;
  petFor(25, pet, () => { if (pet.char.support === FLOOR && calm()) reachedFloor = true; });
  check('too high to jump: climbs down instead', up && reachedFloor, `support=${pet.char.support} mode=${pet.char.mode}`);
  pet = setup();
  pet.mind.command(pet.ctx, 'monkeybars');
  let highest = 0, hung = false, backDown = false;
  petFor(75, pet, () => {
    highest = Math.min(800, Math.max(highest, 860 - pet.char.body.j.hip.y));
    if (pet.char.mode === 'ceiling') hung = true;
    if (hung && ['ground', 'sit'].includes(pet.char.mode)) backDown = true;
  });
  check('monkey bars across the top of the screen', highest > 700 && hung && backDown, `highest=${highest.toFixed(0)} hung=${hung} down=${backDown}`);
  check('a window top with no headroom is not a platform', !pet.ctx.world.platforms.some((p) => p.win === 1));
}
{ // Mischief: he grabs the cursor and drags it; yanking it back frees it. Doodles get drawn.
  const pet = new Pet(bounds);
  const moves: { x: number; y: number }[] = [];
  pet.onMoveCursor = (x, y) => moves.push({ x, y });
  pet.paused = true; petFor(3, pet); pet.paused = false;
  pet.mind.command(pet.ctx, 'grabcursor');
  pet.paused = true; petFor(1, pet); pet.paused = false; // (don't let him wander off up a wall meanwhile)
  check('mischief off: no cursor grabbing', moves.length === 0);
  pet.config.mischief = true;
  petFor(0.1, pet);
  const j = pet.char.body.j;
  pet.cursor(pet.char.x + 120, j.neck.y, 0, 0);
  pet.mind.command(pet.ctx, 'grabcursor');
  petFor(4, pet);
  const dragged = moves.length > 20 && Math.abs(moves[moves.length - 1].x - moves[0].x) > 40;
  check('mischief on: grabs and drags the cursor', dragged, `moves=${moves.length}`);
  pet.mind.command(pet.ctx, 'grabcursor');
  petFor(2, pet);
  const last = moves[moves.length - 1];
  if (last) pet.cursor(last.x + 200, last.y + 100, 3000, 0);
  petFor(0.5, pet);
  check('yank the cursor back: he lets go', pet.mind.skill?.name !== 'grabcursor' || pet.ctx.cursorEscaped);
  const p2 = new Pet(bounds);
  petFor(3, p2);
  p2.mind.command(p2.ctx, 'doodle');
  petFor(12, p2);
  const d = p2.ctx.doodles[0];
  check('doodles a picture', !!d && d.done && d.strokes.flat().length > 8, `strokes=${d?.strokes.length}`);
}
function reactionTo(mood: Partial<import('../src/core/mood').MoodState>) {
  const names: string[] = [];
  for (let k = 0; k < 20; k++) {
    const pet = new Pet(bounds);
    petFor(3, pet);
    Object.assign(pet.mood.s, mood);
    const n = pet.char.body.j.neck;
    pet.cursor(n.x, n.y + 3);
    pet.pointerDown(n.x, n.y + 3, 0); pet.pointerUp(n.x, n.y);
    petFor(0.5, pet);
    names.push(pet.mind.skill?.name ?? 'none');
  }
  return names;
}
{ // The same poke, different moods.
  const sad = reactionTo({ happiness: 0.1, annoyance: 0, energy: 0.8 });
  const angry = reactionTo({ annoyance: 0.9, happiness: 0.5, energy: 0.8 });
  const playful = reactionTo({ happiness: 0.9, energy: 0.9, annoyance: 0, boredom: 0 });
  const retaliations = (a: string[]) => a.filter((n) => ['retaliate', 'hunt', 'tantrum'].includes(n)).length;
  check('sad: mostly ignores pokes', retaliations(sad) === 0 && sad.filter((n) => ['giggle', 'tag', 'boing', 'chase'].includes(n)).length === 0, sad.join(','));
  check('angry: fights back', retaliations(angry) >= 12, angry.join(','));
  check('playful: plays', playful.filter((n) => ['giggle', 'tag', 'boing', 'chase'].includes(n)).length >= 12, playful.join(','));
}

// ───── AI brain (milestone 4), with a fake AI: no network, no cost ─────
{
  const { splitSpeech } = await import('../src/core/brain');
  const parts = splitSpeech('Okay okay. I will climb that window, and then I am going to sit on top of it and judge everyone below me. Forever.');
  check('long replies split into bubble-sized pieces', parts.length >= 2 && parts.every((p) => p.length <= 70) && parts.join(' ').includes('Forever.'), JSON.stringify(parts));
}
type Req = import('../src/core/brain').BrainRequest;
async function brainPet(mode: 'offline' | 'chat' | 'full', answer: (req: Req) => object | string | Error) {
  const pet = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), mind: mode });
  const asked: Req[] = [];
  pet.brain.ask = async (req) => { asked.push(req); const r = answer(req); if (r instanceof Error) throw r; return typeof r === 'string' ? r : JSON.stringify(r); };
  pet.paused = true; petFor(3, pet); pet.paused = false;
  return { pet, asked };
}
async function live(pet: Pet, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) { pet.update(1 / 60); if (i % 5 === 0) await new Promise((r) => setImmediate(r)); }
}
{ // Chat: you ask him to dance, he answers and dances.
  const { pet, asked } = await brainPet('chat', () => ({ say: 'oh you want moves? watch this', do: 'dance' }));
  pet.command('hear:can you dance for me?');
  await live(pet, 1);
  const req = asked[0];
  const sawState = !!req && req.messages[req.messages.length - 1].text.includes('[state]') && req.messages[req.messages.length - 1].text.includes('can you dance');
  check('chat: he hears you, answers, and does it', asked.length === 1 && pet.mind.skill?.name === 'dance' && pet.brain.log.some((l) => l.who === 'him'), `asked=${asked.length} skill=${pet.mind.skill?.name}`);
  check('chat: the AI gets his persona and current state', sawState && req.system.includes(DEFAULT_CONFIG.persona.slice(0, 30)));
  pet.command('hear:what did I just ask?');
  await live(pet, 1);
  check('chat: remembers the conversation', asked.length === 2 && asked[1].messages.length === 3, `messages=${asked[1]?.messages.length}`);
  await live(pet, 60);
  check('chat: no AI calls unless you talk to him', asked.length === 2, `asked=${asked.length}`);
}
{ // Offline: he can't understand words, and never calls the AI.
  const { pet, asked } = await brainPet('offline', () => ({ say: 'hi', do: 'none' }));
  pet.command('hear:hello');
  await live(pet, 1);
  check('offline: talking to him makes no AI call', asked.length === 0 && pet.brain.log.some((l) => l.who === 'note'));
}
{ // Full: he decides for himself now and then, throttled; nonsense actions are ignored.
  let n = 0;
  const { pet, asked } = await brainPet('full', () => (++n % 2 ? { say: '', do: 'hop' } : { say: 'I can fly', do: 'fly' }));
  const seen = new Set<string>();
  for (let i = 0; i < 180 * 60; i++) {
    pet.update(1 / 60);
    if (pet.mind.skill) seen.add(pet.mind.skill.name);
    if (i % 5 === 0) await new Promise((r) => setImmediate(r));
  }
  check('full: AI picks what he does', seen.has('hop'), [...seen].join(','));
  const auto = asked.filter((r) => r.messages[r.messages.length - 1].text.includes('Nobody said anything')).length;
  check('full: thinks on his own at most about once every 40 s', auto >= 2 && auto <= 5 && asked.length <= 9, `own-idea calls=${auto}, all calls=${asked.length} in 3 min`);
}
{ // AI failing (no internet, bad key): he shrugs it off and instinct keeps running.
  const { pet } = await brainPet('full', () => new Error("Couldn't reach the internet."));
  pet.command('hear:hello?');
  const seen = new Set<string>();
  for (let i = 0; i < 90 * 60; i++) {
    pet.update(1 / 60);
    if (pet.mind.skill) seen.add(pet.mind.skill.name);
    if (i % 5 === 0) await new Promise((r) => setImmediate(r));
  }
  check('AI errors: shown in the chat, he carries on by instinct', pet.brain.log.some((l) => l.who === 'note' && l.text.includes('internet')) && seen.size >= 2, [...seen].join(','));
}

// ───── made-up moves (the AI moving his body directly) ─────
{
  const { parseReply } = await import('../src/core/brain');
  const handstand = [
    { t: 0.5, pose: { hip: [0, 28], neck: [16, 50], frontHand: [24, 2], backHand: [20, 2] } },
    { t: 0.7, pose: { frontHand: [4, 2], backHand: [-4, 2], neck: [0, 30], head: [0, 15], hip: [0, 60], frontFoot: [4, 98], backFoot: [-4, 98] } },
    { t: 1.4, pose: { frontFoot: [28, 88], backFoot: [-28, 88] } },
    { t: 0.8, pose: { hip: [0, 41], neck: [0, 71], head: [0, 87], frontHand: [3, 42], backHand: [-3, 42], frontFoot: [6, 2], backFoot: [-6, 2] } },
  ] as import('../src/core/character').Keyframe[];
  const c = new Character(bounds, 600);
  run(c, 1);
  c.puppet(handstand);
  let upsideDown = false;
  run(c, 2, () => { if (c.body.j.head.y > c.body.j.hip.y + 20) upsideDown = true; });
  run(c, 4);
  check('made-up move: handstand happens, then he ends up standing', upsideDown && upright(c), `mode=${c.mode}`);
  const f = new Character(bounds, 600);
  run(f, 1);
  f.puppet([{ t: 1.2, pose: { hip: [0, 200], neck: [0, 230], frontFoot: [5, 160], backFoot: [-5, 160] } }, { t: 1, pose: { hip: [0, 200] } }]);
  let highest = 0;
  run(f, 2.2, () => { highest = Math.max(highest, 800 - f.body.j.hip.y); });
  run(f, 6);
  check('made-up move: floating works, and he gets back up after', highest > 150 && upright(f), `hip rose ${highest.toFixed(0)}px, mode=${f.mode}`);
  const g = new Character(bounds, 600);
  run(g, 1);
  g.puppet([{ t: 0.2, pose: { head: [300, -20], hip: [-300, 400], frontHand: [9999, 0], backFoot: [0, 400] } }, { t: 0.1, pose: { head: [-300, 400], frontFoot: [300, 0] } }]);
  run(g, 10);
  check('made-up move: nonsense poses can\'t break him', upright(g) && g.x > 0 && g.x < 1400, `mode=${g.mode}`);
  const r = parseReply('Sure!\n```json\n{"say":"watch","do":"none","move":[{"t":0.5,"hip":[0,90]},{"t":"x","bogus":[1,2]},{"t":9,"neck":["a",3]}]}\n```');
  const mv = r?.plan[0] && 'move' in r.plan[0] ? r.plan[0].move : null;
  check('AI reply parsing: finds the JSON, keeps only valid poses', !!r && r.say === 'watch' && mv?.length === 1 && mv[0].pose.hip?.[1] === 90, JSON.stringify(r));
}
{ // Chat: you ask for something weird, the AI makes up a move, he does it.
  const { pet } = await brainPet('chat', () => ({ say: 'behold', do: 'none', move: [{ t: 1, pose: { hip: [0, 120], neck: [0, 150] } }, { t: 1, pose: { hip: [0, 41], neck: [0, 71] } }] }));
  pet.command('hear:float for me');
  let floated = false;
  for (let i = 0; i < 4 * 60; i++) { pet.update(1 / 60); if (pet.char.puppeting) floated = true; if (i % 5 === 0) await new Promise((r) => setImmediate(r)); }
  check('chat: AI-made move gets performed', floated, `skill=${pet.mind.skill?.name}`);
  pet.applyConfig({ ...pet.config, puppet: false });
  pet.command('hear:float again');
  let again = false;
  for (let i = 0; i < 4 * 60; i++) { pet.update(1 / 60); if (pet.char.puppeting) again = true; if (i % 5 === 0) await new Promise((r) => setImmediate(r)); }
  check('body control off: AI moves are ignored', !again);
}

{ // Plans: several things in a row, in order.
  const { pet } = await brainPet('chat', () => ({ say: 'easy', feel: { boredom: -0.1 }, plan: [{ do: 'hop' }, { do: 'hop' }, { do: 'hop' }, { say: 'ta-da' }] }));
  pet.command('hear:hop 3 times');
  let jumps = 0;
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { if (e.type === 'jumped' && pet.mind.why === 'you asked (AI)') jumps++; orig(c, e); }; // (not his own hops afterwards)
  for (let i = 0; i < 12 * 60; i++) { pet.update(1 / 60); if (i % 5 === 0) await new Promise((r) => setImmediate(r)); }
  const line = pet.brain.log.find((l) => l.who === 'him');
  check('plan: "hop 3 times" means three hops', jumps === 3, `jumps=${jumps}`);
  check('plan: chat log says what he did in words', line?.acts === 'hop ×3' && line.text.includes('ta-da'), JSON.stringify(line));
}
{ // Being mean to him hurts his feelings; nonsense steps are skipped.
  const { pet } = await brainPet('chat', () => ({ say: 'RUDE.', feel: { annoyance: 0.4, happiness: -0.2, trust: -0.1 }, plan: [{ do: 'fly away' }, { do: 'stomp' }] }));
  const before = { ...pet.mood.s };
  pet.command('hear:you smell');
  await live(pet, 3);
  check('feelings: mean words make him annoyed and less trusting', pet.mood.s.annoyance > before.annoyance + 0.2 && pet.mood.s.trust < before.trust, JSON.stringify(pet.mood.s));
}
{ // Drawing: the AI draws something, it ends up in his gallery.
  const { pet } = await brainPet('chat', () => ({ say: 'art', plan: [{ draw: [[[-40, -30], [0, 40], [40, -30], [-40, -30]], [[0, 0], [5, 5]]], title: 'triangle' }] }));
  const drawn: string[] = [];
  pet.ctx.onDrawn = (d) => drawn.push(d.title ?? '');
  pet.command('hear:draw me something');
  await live(pet, 12);
  check('drawing: the AI draws a picture of its own', drawn.includes('triangle') && pet.ctx.doodles.some((d) => d.title === 'triangle' && d.done), drawn.join(','));
}
{ // The prompt keeps him in character and tells him what he can do.
  const { pet, asked } = await brainPet('chat', () => ({ say: 'hi', plan: [] }));
  pet.command('hear:hi');
  await live(pet, 1);
  const sys = asked[0]?.system ?? '';
  check('prompt: in character, plans, moves, drawing, and the 988 exception', ['not an assistant', '"plan"', 'MAKING UP MOVES', 'DRAWING', '988'].every((k) => sys.includes(k)));
}

// ───── memories (milestone 5) ─────
function throwHim(pet: Pet) {
  const c = pet.char, n = c.body.j.neck;
  pet.pointerDown(n.x, n.y + 3, 0);
  pet.pointerMove(n.x, n.y - 100, 0, -900, 300);
  petFor(0.2, pet);
  pet.pointerMove(n.x + 60, n.y - 200, 1800, -900, 500);
  pet.pointerUp(n.x + 60, n.y - 200);
  petFor(5, pet);
}
{ // Offline: he counts what you do, writes notes about it, and brings it up later.
  const pet = new Pet(bounds);
  pet.paused = true; petFor(2, pet); pet.paused = false;
  throwHim(pet); throwHim(pet); throwHim(pet); throwHim(pet);
  const notes = pet.memory.notes.map((n) => n.text);
  check('memory: being thrown gets written down', pet.memory.tally.thrown === 4 && notes.some((t) => t.includes('threw me')) && notes.some((t) => t.includes('throw me a lot')), notes.join(' | '));
  const said: string[] = [];
  const origSay = pet.ctx.say;
  pet.ctx.say = (t, s) => { said.push(t); origSay(t, s); };
  for (let i = 0; i < 12; i++) {
    const n = pet.char.body.j.neck;
    pet.pointerDown(n.x, n.y + 3, 0); pet.pointerMove(n.x, n.y - 20, 0, -50, 300); petFor(0.3, pet);
    pet.pointerUp(n.x, n.y - 20); petFor(3, pet);
  }
  check('memory: offline, he remembers being thrown when you pick him up', said.some((t) => /throw|last time/.test(t)), said.join(' | '));
  const copy = new Pet(bounds);
  copy.memory.load(pet.memory.save());
  check('memory: saves and loads', copy.memory.notes.length === pet.memory.notes.length && copy.memory.tally.thrown === 4);
}
{ // AI: it can write notes, sees them in its prompt, and tidies them into a summary.
  let tidyAsked = 0;
  const { pet, asked } = await brainPet('chat', (req) => {
    if (req.system.includes('tidying the memory notes')) { tidyAsked++; return { summary: 'Sam likes cats. Sam throws me sometimes.', keep: [1] }; }
    return { say: 'Sam. noted.', feel: {}, plan: [], remember: ['the person\'s name is Sam'] };
  });
  pet.command('hear:my name is Sam');
  await live(pet, 1);
  check('memory: the AI writes notes', pet.memory.notes.some((n) => n.by === 'ai' && n.text.includes('Sam')), JSON.stringify(pet.memory.notes));
  pet.command('hear:what is my name?');
  await live(pet, 1);
  check('memory: notes go into his AI prompt', asked[asked.length - 1].system.includes("the person's name is Sam"));
  for (let i = 0; i < 20; i++) pet.memory.add(`little thing number ${i}`, 'event');
  await live(pet, 2);
  check('memory: the AI tidies notes into a summary', tidyAsked === 1 && pet.memory.summary.includes('Sam likes cats') && pet.memory.notes.length <= 3, `tidy=${tidyAsked} notes=${pet.memory.notes.length} summary=${pet.memory.summary}`);
  pet.command('memAdd:I like pizza');
  const mine = pet.memory.notes.find((n) => n.by === 'you');
  pet.command(`memEdit:${mine?.id}:I like pizza with pineapple`);
  pet.command(`memDel:${pet.memory.notes.find((n) => n.by !== 'you')?.id}`);
  check('memory: you can add, edit and delete notes', !!mine && mine.text.includes('pineapple') && pet.memory.notes.every((n) => n.by === 'you'), JSON.stringify(pet.memory.notes));
}
{ // Offline tidy-up: notes don't pile up forever.
  const pet = new Pet(bounds);
  for (let i = 0; i < 20; i++) { const n = pet.memory.add(`thing ${i}`, 'event'); if (n) n.at -= 2 * 3600 * 1000; }
  pet.memory.tally.thrown = 3;
  petFor(0.5, pet);
  check('memory: offline tidy-up sums things up', pet.memory.notes.length < 10 && pet.memory.summary.includes('thrown me 3 times'), `notes=${pet.memory.notes.length} ${pet.memory.summary}`);
}

console.log(failures ? `\n${failures} failing` : '\nall good');
process.exit(failures ? 1 : 0);
