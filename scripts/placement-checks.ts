import assert from 'node:assert/strict';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { OverlayTools } from '../src/core/overlay-tools';
import type { Thing } from '../src/core/props';
const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
const pet = () => { const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), windows: false, dailyRhythm: false, destructible: false }, { identity: 'placement-0' }); p.char.placeHome(200); return p; };
function atFloor(object: Thing, gap = 10, x = 650, angle = 0) {
  object.place({ x, y: 500 }, angle);
  const bottom = Math.max(...object.collisionHull.map(p => p.y));
  object.place({ x, y: object.center.y + bounds.floor - 1.5 - bottom - gap }, angle);
}
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log('PASS', name); }

test('new furniture guide preserves actual scaled/tilted contours and snaps only near the floor', () => {
  for (const scale of [.6, 1, 2.5]) for (const angle of [-.28, 0, .23]) {
    const p = pet(), tools = new OverlayTools(() => [p]); p.applyConfig({ ...p.config, scale });
    assert(tools.pull(p, 'prop', 'chair', { x: 650, y: 500 }));
    const t = (tools.held as { object: Thing }).object;
    atFloor(t, 8, 650, angle);
    const before = t.collisionHull, preview = tools.placementPreview!;
    assert(preview.snap && !preview.blocked && preview.nearFloor);
    assert.deepEqual(preview.hull, before);
    const dy = preview.floorHull[0].y - before[0].y;
    for (let i = 0; i < before.length; i++) {
      assert.equal(preview.floorHull[i].x, before[i].x);
      assert(Math.abs(preview.floorHull[i].y - before[i].y - dy) < 1e-8);
    }
    assert(tools.release({ x: 650, y: 500 }, { x: 350, y: 100 }));
    assert.equal(t.held, null); assert.equal(tools.placementPreview, null);
    assert(Math.abs(Math.max(...t.collisionHull.map(p => p.y)) - (bounds.floor - 1.5)) < 1e-7);
    assert(Math.abs(t.tilt - angle) < 1e-7);
    assert(t.points.every(p => p.invMass > 0));
  }
});

test('free placement and distant placement retain physical drop behavior', () => {
  for (const snapToFloor of [false, true]) {
    const p = pet(), tools = new OverlayTools(() => [p]); tools.snapToFloor = snapToFloor;
    tools.pull(p, 'prop', 'lamp', { x: 600, y: 200 });
    const t = (tools.held as { object: Thing }).object;
    atFloor(t, snapToFloor ? 100 : 8, 600);
    const before = t.center;
    assert(!tools.placementPreview!.snap);
    tools.release({ x: 600, y: 200 }, { x: 0, y: 0 });
    assert.deepEqual(t.center, before);
    for (let step = 0; step < 40; step++) p.props.update(1 / 120, step / 120, bounds, []);
    assert(t.center.y > before.y + 1, 'released furniture remained frozen');
  }
});

test('floor snapping is withheld at screen edges and occupied destinations', () => {
  const p = pet(), tools = new OverlayTools(() => [p]);
  tools.pull(p, 'prop', 'couch', { x: 650, y: 400 });
  const t = (tools.held as { object: Thing }).object;
  atFloor(t, 8, 2);
  assert(tools.placementPreview!.blocked && !tools.placementPreview!.snap);
  atFloor(t, 8, 650);
  const obstacle = p.props.spawn('chair', 650, 500, 1)!; atFloor(obstacle, 0, 650);
  assert(tools.placementPreview!.blocked && !tools.placementPreview!.snap);
  const before = t.center;
  tools.release({ x: 650, y: 500 }, { x: 0, y: 0 });
  assert.deepEqual(t.center, before, 'blocked floor guide forced an overlapping snap');
});

test('loose belongings and nearby figures withhold automatic snapping', () => {
  const p = pet(), tools = new OverlayTools(() => [p]);
  tools.pull(p, 'prop', 'couch', { x: 800, y: 400 });
  const t = (tools.held as { object: Thing }).object; atFloor(t, 8, 800);
  assert(tools.placementPreview!.snap);
  const part = t.collisionHulls[0], dy = tools.placementPreview!.floorHull[0].y - t.collisionHull[0].y;
  const at = { x: part.reduce((n,v)=>n+v.x,0)/part.length, y: part.reduce((n,v)=>n+v.y,0)/part.length + dy };
  const book = p.items.spawn('book', at, 1)!;
  assert(tools.placementPreview!.blocked && !tools.placementPreview!.snap);
  p.items.remove(book);
  assert(tools.placementPreview!.snap);
  const point = p.char.body.j.footL; point.x = at.x; point.y = at.y;
  assert(tools.placementPreview!.blocked && !tools.placementPreview!.snap);
});

test('cancel removes an unplaced supply and trash undo restores its original identity', () => {
  const p = pet(), tools = new OverlayTools(() => [p]), count = p.props.placed.length;
  tools.pull(p, 'prop', 'chair', { x: 500, y: 300 });
  const canceled = tools.held!.object;
  assert(tools.cancel()); assert(!p.props.things.includes(canceled as Thing));
  assert.equal(p.props.placed.length, count); assert.equal(tools.placementPreview, null);
  tools.pull(p, 'prop', 'chair', { x: 500, y: 300 });
  const original = tools.held!.object;
  assert(tools.trashHeld()); assert.equal(tools.placementPreview, null);
  assert(tools.undo({ x: 700, y: 400 }));
  assert(p.props.things.includes(original as Thing)); assert.equal(p.props.placed.length, count + 1);
});

test('floor aids never apply to transported items or modify ownership', () => {
  const p = pet(), tools = new OverlayTools(() => [p]);
  const item = p.items.give('book', p.char)!;
  assert(tools.beginItem(p, item, { x: 600, y: bounds.floor - 5 }));
  assert.equal(tools.placementPreview, null); assert(tools.cancel());
  assert(p.items.list.includes(item)); assert(item.where !== 'cursor');
});
console.log(`${passed} furniture placement checks passed`);
