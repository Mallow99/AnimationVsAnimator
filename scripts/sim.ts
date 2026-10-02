// Headless physics checks: run the character with no screen, many times faster
// than real time, and make sure he behaves. `npm run sim`
import { Character } from '../src/core/character';
import type { Bounds } from '../src/core/physics';
import { Pet } from '../src/core/pet';
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
  const setup = () => { const p = new Pet(B); p.setWindows(wins); petFor(3, p); return p; };
  let pet = setup();
  pet.mind.command(pet.ctx, 'climb');
  petFor(30, pet);
  const calm = () => ['ground', 'sit'].includes(pet.char.mode);
  const up = pet.char.support >= 0 && calm();
  check('climbs the side of a tall window onto it', up, `support=${pet.char.support} mode=${pet.char.mode}`);
  pet.ctx.lessons.safeDrop = 150;
  pet.mind.command(pet.ctx, 'getdown');
  petFor(25, pet);
  check('too high to jump: climbs down instead', up && pet.char.support === FLOOR && calm(), `support=${pet.char.support} mode=${pet.char.mode}`);
  pet = setup();
  pet.mind.command(pet.ctx, 'monkeybars');
  let highest = 0;
  petFor(45, pet, () => { highest = Math.min(800, Math.max(highest, 860 - pet.char.body.j.hip.y)); });
  check('monkey bars across the top of the screen', highest > 700 && pet.char.mode !== 'ceiling' && pet.char.mode !== 'climb', `highest=${highest.toFixed(0)} mode=${pet.char.mode}`);
  check('a window top with no headroom is not a platform', !pet.ctx.world.platforms.some((p) => p.win === 1));
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

console.log(failures ? `\n${failures} failing` : '\nall good');
process.exit(failures ? 1 : 0);
