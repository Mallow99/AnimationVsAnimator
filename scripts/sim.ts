// Headless physics checks: run the character with no screen, many times faster
// than real time, and make sure he behaves. `npm run sim`
import { Character } from '../src/core/character';
import type { Bounds } from '../src/core/physics';

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
{ // Sit, lie, get up; every gesture finishes standing.
  const c = new Character(bounds, 600);
  run(c, 1); c.sit(); run(c, 2);
  const sat = c.mode === 'sit' && c.body.j.hip.y > 780;
  c.standUp(); run(c, 2);
  check('sit and stand', sat && upright(c), `hipY=${c.body.j.hip.y.toFixed(0)}`);
  c.lieDown(); run(c, 3);
  const lying = c.mode === 'lie' && c.body.j.head.y > 760;
  c.standUp(); run(c, 3);
  check('lie down and get up', lying && upright(c), `mode=${c.mode}`);
  for (const g of ['stomp', 'wave', 'shrug', 'laugh', 'flail', 'pokeBack', 'stretch', 'lookAround', 'cower'] as const) {
    c.doGesture(g, { x: 700, y: 650 }); run(c, 3);
    if (!upright(c)) check(`gesture ${g}`, false);
  }
  check('all gestures end upright', upright(c));
}

console.log(failures ? `\n${failures} failing` : '\nall good');
process.exit(failures ? 1 : 0);
