// Headless physics checks: run the character with no screen, many times faster
// than real time, and make sure he behaves. `npm run sim`
import { Character as BaseCharacter } from '../src/core/character';
/** Characters in these tests don't break unless a test says so (limbs snapping off is tested on its own). */
class Character extends BaseCharacter { constructor(...a: ConstructorParameters<typeof BaseCharacter>) { super(...a); this.destructible = false; } }
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
  for (let i = 0; i < 120; i++) { pet.cursor(hx + Math.sin(i / 3) * 12, hy, Math.cos(i / 3) * 240, 0); pet.update(1 / 60); }
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
  pet.setWindows([{ id: 1, x: 500, y: 165, w: 400, h: 600 }]); // ~635px drop: too much even to roll out of
  petFor(1, pet);
  pet.paused = true;
  const c = pet.char;
  c.grab('neck', c.body.j.neck.x, c.body.j.neck.y);
  for (let i = 0; i < 40; i++) { c.moveHold(700, 700 - i * 15, 0, -900); pet.update(1 / 60); }
  c.moveHold(700, 75, 0, 0); petFor(0.5, pet);
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

// ───── 3D body ─────
{ // Limbs have depth: the hand on your side is in front.
  const c = new Character(bounds, 600);
  run(c, 2);
  const j = c.body.j;
  const rightNear = j.handR.z > j.handL.z + 2 && j.footR.z > j.footL.z;
  c.facing = -1; c.walkTo(560);
  run(c, 2);
  const leftNear = j.handL.z > j.handR.z + 2;
  check('3D: the near hand and foot are in front, and swap when he turns', rightNear && leftNear, `R ${j.handR.z.toFixed(1)} L ${j.handL.z.toFixed(1)}`);
}
{ // Turning around is a real spin through facing you.
  const c = new Character(bounds, 600);
  run(c, 1);
  let faced = 0;
  c.facing = -1;
  run(c, 0.6, () => { faced = Math.max(faced, c.turnS); });
  check('3D: turning around spins through facing you', faced > 0.9 && Math.abs(c.turnF + 1) < 0.01, `max facing-you ${faced.toFixed(2)}`);
}
{ // A made-up backflip turns him upside down for real, and he lands it (or at least gets up after).
  const c = new Character(bounds, 600);
  run(c, 1);
  c.puppet([{ t: 0.3, pose: { hip: [0, 30], neck: [4, 58] } }, { t: 0.8, flip: -360, pose: { hip: [0, 140], neck: [0, 170], frontFoot: [6, 110], backFoot: [-6, 110] } }, { t: 0.5, pose: { hip: [0, 41], neck: [0, 71], frontFoot: [6, 2], backFoot: [-6, 2] } }]);
  let flipped = false;
  run(c, 1.6, () => { if (c.body.j.head.y > c.body.j.hip.y + 10) flipped = true; });
  run(c, 5);
  check('3D: a backflip goes upside down and ends standing', flipped && upright(c), `mode=${c.mode}`);
}
{ // Knocked sideways in depth: he stays inside his thin band and gets back up.
  const c = new Character(bounds, 600);
  run(c, 1);
  c.poke('neck', 300, -200, 3000); c.poke('hip', -200, 0, -3000);
  let deepest = 0;
  run(c, 6, () => { for (const p of c.body.points) deepest = Math.max(deepest, Math.abs(p.z)); });
  check('3D: shoved in depth, stays in his depth band, gets up', deepest <= 40.01 && upright(c), `deepest z ${deepest.toFixed(1)} mode=${c.mode}`);
}
{
  const { parseMove } = await import('../src/core/brain');
  const m = parseMove([{ t: 0.5, hip: [0, 50, 10] }, { t: 1, flip: 360 }, { t: 1, roll: 'x', turn: 90 }]);
  check('3D moves: side coordinates, flips and turns are read', m?.length === 3 && m[0].pose.hip?.[2] === 10 && m[1].flip === 360 && m[2].turn === 90 && !m[2].roll, JSON.stringify(m));
}

// ───── destructible: limbs come off and go back on ─────
function yankHand(pet: Pet, speed = 3200) {
  const c = pet.char, h = c.frontHand, events: string[] = [];
  pet.pointerDown(h.x, h.y, 0);
  pet.pointerMove(h.x + 3, h.y + 3, 0, 0, 200);
  petFor(0.2, pet);
  let x = h.x, y = h.y;
  for (let i = 0; i < 8; i++) {
    x -= c.facing * speed / 60; y -= 10;
    pet.pointerMove(x, y, -c.facing * speed, -600, 400 + i * 16);
    pet.update(1 / 60);
  }
  return { x, y, events };
}
{ // Yank his hand hard: the arm comes off and you're left holding it. Let go: he fetches it and puts it back on.
  const pet = new Pet(bounds);
  pet.paused = true; petFor(3, pet); pet.paused = false;
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { got.push(e.type); orig(c, e); };
  const { x, y } = yankHand(pet);
  const piece = [...pet.char.missing.values()][0];
  check('yank a hand hard: the arm comes off in your hand', got.includes('limbOff') && !!piece && piece.heldBy === 'user', got.join(','));
  // Hold it a moment, then drop it a little way from him.
  for (let i = 0; i < 30; i++) { pet.pointerMove(x, y, 0, 0, 600 + i * 16); pet.update(1 / 60); }
  pet.pointerUp(x, y);
  let stared = false, picked = false;
  petFor(30, pet, () => { if (pet.char.stare > 0.5) stared = true; if (pet.char.holdingLimb) picked = true; });
  check('he stares at the stump, picks his arm up and puts it back on', stared && picked && pet.char.whole && got.includes('limbOn'), `stared=${stared} picked=${picked} whole=${pet.char.whole} skill=${pet.mind.skill?.name}`);
  check('losing a limb goes in his memory', pet.memory.tally.ripped === 1 && pet.memory.notes.some((n) => n.text.includes('ripped')));
}
{ // Breakable off: yanking does nothing.
  const pet = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  pet.paused = true; petFor(3, pet);
  const { x, y } = yankHand(pet);
  pet.pointerUp(x, y); petFor(3, pet);
  check('breakable off: limbs stay on', pet.char.whole);
}
{ // Lose a leg: he falls, then hops over on one leg to get it.
  const pet = new Pet(bounds);
  pet.paused = true; petFor(3, pet); pet.paused = false;
  const c = pet.char;
  const leg = c.detach('legL', { x: 500, y: -400, z: 0 })!;
  let hopped = false;
  petFor(1.5, pet);
  const startX = c.x;
  petFor(40, pet, () => { if (c.mode === 'ground' && c.legCount === 1 && Math.abs(c.x - startX) > 30) hopped = true; });
  check('loses a leg: hops over on one leg and puts it back', hopped && c.whole && ['ground', 'sit'].includes(c.mode), `hopped=${hopped} whole=${c.whole} legX=${leg.root.x.toFixed(0)} x=${c.x.toFixed(0)} mode=${c.mode}`);
}
{ // Both legs gone: he crawls.
  const c = new Character(bounds, 600);
  c.destructible = true;
  run(c, 1);
  c.detach('legL'); c.detach('legR');
  run(c, 4);
  c.walkTo(450);
  const x0 = c.x;
  run(c, 6);
  check('no legs: drags himself along on his arms', c.mode === 'ground' && c.x < x0 - 30 && c.body.j.neck.y < c.body.j.hip.y, `x ${x0.toFixed(0)} → ${c.x.toFixed(0)} mode=${c.mode}`);
}
{ // You hold the limb up to his stump: it clicks back on.
  const pet = new Pet(bounds);
  pet.paused = true; petFor(3, pet);
  const c = pet.char;
  const arm = c.detach('armR', { x: 300, y: -100, z: 0 })!;
  petFor(1.5, pet);
  const r = arm.root;
  pet.pointerDown(r.x, r.y, 0); pet.pointerMove(r.x + 4, r.y, 0, 0, 200); petFor(0.2, pet);
  const st = c.stumpOf('armR');
  for (let i = 0; i < 40; i++) { pet.pointerMove(st.x, st.y, 0, 0, 400 + i * 16); pet.update(1 / 60); }
  pet.pointerUp(st.x, st.y);
  check('you hold his arm to the stump: it goes back on', c.whole, `missing=${[...c.missing.keys()]}`);
}
{ // Out of reach (up on a window he can't climb without it): he draws a new one.
  const pet = new Pet(bounds);
  pet.setWindows([{ id: 1, x: 900, y: 300, w: 300, h: 500 }]);
  pet.paused = true; petFor(3, pet); pet.paused = false;
  const c = pet.char;
  const arm = c.detach('armL')!;
  for (const p of arm.points) { p.x = p.px = 1000 + Math.random() * 10; p.y = p.py = 280; }
  petFor(50, pet);
  check('limb out of reach: he draws himself a new one', c.whole && arm.fading, `whole=${c.whole} skill=${pet.mind.skill?.name}`);
}
{ // Really big crash (thrown down hard): a limb can snap off.
  const c = new Character(bounds, 600);
  c.destructible = true;
  let off = 0;
  for (let k = 0; k < 12 && !off; k++) {
    c.grab('neck', c.body.j.neck.x, c.body.j.neck.y);
    run(c, 0.5, () => c.moveHold(600, 150, 0, 0));
    run(c, 0.12, (t) => c.moveHold(600, 150 + 2600 * t, 0, 2600)); // a hard throw straight down
    c.release();
    off += run(c, 2).filter((e) => e === 'limbOff').length;
    for (const l of [...c.missing.keys()]) c.regrow(l);
    run(c, 4);
  }
  check('a huge crash can snap a limb off', off > 0);
}

// ───── parkour ─────
{ // A big drop he's in control of: he rolls out of it instead of crashing.
  const c = new Character(bounds, 600);
  run(c, 1);
  c.body.translate(0, -320); c.body.launch(80, 0, DT); c.mode = 'air';
  const ev = run(c, 3);
  check('parkour: rolls out of a big landing', ev.includes('rolled') && !ev.includes('crashed') && upright(c), ev.filter((e) => e !== 'step').join(','));
}
{ // Flips in place: he goes over and lands it.
  for (const turns of [-1, 1] as const) {
    const c = new Character(bounds, 600);
    run(c, 1);
    c.flipJump(turns);
    let over = false;
    const ev = run(c, 3, () => { if (c.body.j.head.y > c.body.j.hip.y) over = true; });
    check(`parkour: ${turns < 0 ? 'backflip' : 'front flip'} lands on his feet`, over && ev.includes('flipped') && !ev.includes('crashed') && upright(c), ev.filter((e) => e !== 'step').join(','));
  }
}
{ // Wall jump: run at the screen edge, catch it, kick off with a backflip, land.
  const pet = calmPet();
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { if (e.type !== 'step') got.push(e.type); orig(c, e); };
  pet.mind.command(pet.ctx, 'walljump');
  petFor(8, pet);
  check('parkour: wall jump off the screen edge', got.includes('wallJump') && !got.includes('crashed') && ['ground', 'sit'].includes(pet.char.mode), got.join(','));
}
{ // Vault onto a low ledge.
  const c = new Character(bounds, 500);
  const sc = c.scale;
  c.setPlatforms([{ id: 8, x1: 560, x2: 800, y: 800 - 58 * sc }]);
  run(c, 1);
  c.walkTo(530); run(c, 2);
  const ok = c.vault(560, 800 - 58 * sc);
  const ev = run(c, 3);
  check('parkour: vaults onto a low ledge', ok && c.support === 8 && ev.includes('vaulted') && upright(c), `ok=${ok} support=${c.support} ${ev.filter((e) => e !== 'step').join(',')}`);
}

// ───── items and his belt ─────
function calmPet() { const pet = new Pet(bounds); pet.paused = true; petFor(3, pet); pet.paused = false; return pet; }
{ // He starts with his pen and his sword on his belt; drawing takes the pen out and puts it back.
  const pet = calmPet();
  const pen = pet.items.find('draw')!, sword = pet.items.find('swing')!;
  check('belt: pen on his hip, sword on his back', pen.where === 'belt' && pen.slot === 1 && sword.where === 'belt' && sword.slot === 2, `${pen.where}/${pen.slot} ${sword.where}/${sword.slot}`);
  pet.mind.command(pet.ctx, 'doodle');
  let inHand = false, tipOnPaper = Infinity;
  petFor(14, pet, () => {
    if (pen.where === 'hand') {
      inHand = true;
      const d = pet.ctx.doodles[pet.ctx.doodles.length - 1], st = d?.strokes[d.strokes.length - 1];
      if (st?.length) { const p = st[st.length - 1], tip = pen.tip; tipOnPaper = Math.min(tipOnPaper, Math.hypot(tip.x - p.x, tip.y - p.y)); }
    }
  });
  const d = pet.ctx.doodles[0];
  check('doodling: pen out of the belt, its tip does the drawing, back on the belt after', inHand && tipOnPaper < 6 && !!d?.done && pen.where === 'belt', `inHand=${inHand} tipGap=${tipOnPaper.toFixed(1)} done=${d?.done} pen=${pen.where}`);
}
{ // Right-click him: a menu with "Take pen". Take it, and he can't draw; he asks for it back and snatches it.
  const pet = calmPet();
  const n = pet.char.body.j.neck;
  pet.cursor(n.x, n.y + 5, 0, 0);
  const opened = pet.contextMenu(n.x, n.y + 5);
  const rows = (pet as any).menu?.rows.map((r: { label: string }) => r.label) as string[];
  const pen = pet.items.find('draw')!;
  (pet as any).menu.rows.find((r: { label: string }) => r.label === 'Take pen').act();
  (pet as any).menu = null;
  check('right-click menu: talk, take his things', opened && rows[0].startsWith('Talk') && rows.includes('Take pen') && rows.includes('Take wooden sword') && pen.where === 'cursor', rows?.join(' | '));
  const said: string[] = [];
  const origSay = pet.ctx.say; pet.ctx.say = (t, x) => { said.push(t); origSay(t, x); };
  petFor(1, pet);
  pet.mind.command(pet.ctx, 'doodle');
  petFor(2, pet);
  check('pen taken: he can\'t draw, and says so', pet.ctx.doodles.length === 0 && said.some((t) => /pen/.test(t)), said.join(' | '));
  // Wait for him to ask for it back, holding it near him. (Calm, so he isn't off on the monkey bars.)
  let snatched = false;
  pet.command('mood:calm');
  petFor(40, pet, () => {
    const h = pet.char.frontHand, cur = pet.ctx.world.cursor!;
    if (pen.where === 'cursor') pet.cursor(cur.x + (h.x - cur.x) * 0.02, cur.y + (h.y - cur.y) * 0.02, 0, 0);
    if (pen.where !== 'cursor') snatched = true;
  });
  check('he asks for his pen back and grabs it', snatched && (pen.where === 'belt' || pen.where === 'hand'), `pen=${pen.where} said=${said.slice(-3).join(' | ')}`);
}
{ // Drop his sword on the floor: he picks it up and puts it back on his belt.
  const pet = calmPet();
  const sword = pet.items.find('swing')!;
  pet.items.toCursor(sword, { x: pet.char.x + 150, y: 700 });
  petFor(0.2, pet);
  pet.pointerDown(pet.char.x + 150, 700, 0);
  petFor(1, pet);
  const dropped = sword.where === 'world';
  petFor(20, pet);
  check('dropped sword: he picks it up and puts it back on', dropped && sword.where === 'belt', `dropped=${dropped} now=${sword.where} skill=${pet.mind.skill?.name}`);
}
{ // Take his sword and swing it at him: it hits like a smack.
  const pet = calmPet();
  pet.paused = true;
  const sword = pet.items.find('swing')!;
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { got.push(e.type); orig(c, e); };
  const y = pet.char.body.j.neck.y - 40, x0 = pet.char.x - 200;
  pet.cursor(x0, y, 0, 0);
  pet.items.toCursor(sword, { x: x0, y });
  petFor(1, pet, () => pet.cursor(x0, y, 0, 0));
  for (let i = 0; i < 30; i++) { pet.cursor(x0 + i * 16, y, 960, 0); pet.update(1 / 60); }
  check('swing his sword at him: it hits', got.includes('smacked'), got.join(','));
}
{ // Angry, cursor close: he draws his sword and slashes at it.
  const pet = calmPet();
  let hits = 0;
  const orig = pet.ctx.hitCursor!;
  pet.ctx.hitCursor = (x, y, d) => { hits++; orig(x, y, d); };
  const j = pet.char.body.j;
  pet.cursor(pet.char.x + 45, j.neck.y - 5, 0, 0);
  pet.mind.command(pet.ctx, 'slash');
  let swordOut = false;
  petFor(5, pet, () => { pet.cursor(pet.char.x + pet.char.facing * 45, j.neck.y - 5, 0, 0); if (pet.items.find('swing')!.where === 'hand') swordOut = true; });
  check('slash: draws his sword and hits the cursor', swordOut && hits > 0 && pet.items.find('swing')!.where === 'belt', `out=${swordOut} hits=${hits}`);
}
{ // Double-click: talk box (no poke). Offline, he still understands simple words.
  const pet = calmPet();
  let talked = 0;
  pet.onTalk = () => talked++;
  const got: string[] = [];
  const orig = pet.mind.onEvent.bind(pet.mind);
  pet.mind.onEvent = (c, e) => { got.push(e.type); orig(c, e); };
  const n = pet.char.body.j.neck;
  pet.pointerDown(n.x, n.y + 3, 0); pet.pointerUp(n.x, n.y + 3); pet.update(0.1);
  pet.pointerDown(n.x, n.y + 3, 100); pet.pointerUp(n.x, n.y + 3);
  petFor(0.6, pet);
  check('double-click: opens the talk box, no poke', talked === 1 && !got.includes('poked'), `talked=${talked} ${got.join(',')}`);
  pet.command('hear:can you dance?');
  petFor(0.5, pet);
  check('offline: he understands "dance"', pet.mind.skill?.name === 'dance' || pet.mind.skill?.name === 'plan', `skill=${pet.mind.skill?.name}`);
  pet.command('hear:my name is Robin');
  petFor(0.5, pet);
  check('offline: he remembers your name', pet.memory.notes.some((x) => x.text.includes('Robin')));
}
{ // His things are saved: what he has and where.
  const pet = calmPet();
  pet.items.give('pen', pet.char);
  const copy = new Pet(bounds);
  copy.load(pet.save());
  check('items are saved', copy.items.list.length === 3 && copy.items.list.filter((x) => x.def.id === 'pen').length === 2, copy.items.list.map((x) => x.def.id + '@' + x.where).join(','));
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
