import assert from 'node:assert/strict';
import { bookModel, bookDepth, looseBookAxes, readerBookAxes } from '../src/core/book-model';
import {
  IDENTITY_AXES,
  modelBox,
  modelGrip,
  modelVector,
  modelVertices,
  poseAtGrip,
  projectModel,
  projectedDistance,
  type ModelPose,
  type PropModel,
} from '../src/core/prop-model';
import { cross3, dot3, dist3, len3, norm3, sub3 } from '../src/core/math';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { Item, itemParts } from '../src/core/items';
import { companionConfig } from '../src/core/config';
import { checkSanity } from '../src/core/sanity';
import { polygonDistance } from '../src/core/geometry';
let seed = 73;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const dt = 1 / 60;
function pets(n = 1) {
  const cfg = {
    ...structuredClone(DEFAULT_CONFIG),
    windows: false,
    dailyRhythm: false,
    destructible: false,
    inkLifetime: 0,
  };
  const b = { left: 0, right: 1400, top: 0, floor: 800 },
    first = new Pet(b, cfg, { identity: 'model-0' });
  const all = [
    first,
    ...Array.from(
      { length: n - 1 },
      (_, i) =>
        new Pet(b, companionConfig(cfg, i + 1), { props: first.props, identity: `model-${i + 1}` }),
    ),
  ];
  for (const [i, p] of all.entries()) {
    p.paused = true;
    p.mind.holdUntil = Infinity;
    p.char.placeHome(340 + i * 80);
  }
  run(all, 3);
  for (const p of all) p.others = all.filter((q) => q !== p);
  return all;
}
function run(all: Pet[], seconds: number) {
  for (let j = 0; j < seconds / dt; j++) for (const p of all) p.update(dt);
}
let passed = 0;
function test(name: string, fn: () => void) {
  seed = 73;
  fn();
  passed++;
  console.log('PASS', name);
}
test('a solid box has outward surfaces, culls rear faces and picks its projected shape', () => {
  const model: PropModel = {
    faces: modelBox({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, '#687c95', 'box'),
    grips: { corner: { x: 1, y: 1, z: 1 } },
  };
  const pose: ModelPose = { ...IDENTITY_AXES, at: { x: 200, y: 300, z: 0 }, scale: 4 };
  const front = projectModel(model, pose);
  assert.equal(front.length, 1);
  assert(front[0].normal.z > 0.99);
  assert.equal(projectedDistance(front, { x: 200, y: 300 }), 0);
  assert(projectedDistance(front, { x: 215, y: 300 }) > 10);
  const turned = projectModel(model, {
    ...readerBookAxes({ x: 0.6, y: 0, z: 0.8 }),
    at: pose.at,
    scale: 4,
  });
  assert.equal(turned.length, 3);
  assert(turned.every((f) => f.normal.z > 0));
  for (let i = 1; i < turned.length; i++) assert(turned[i].depth >= turned[i - 1].depth);
});
test('rotated grip attachment is exact at all hinge states, body facings and scales', () => {
  for (const open of [0, 0.1, 0.5, 1])
    for (const a of [0, 0.6, Math.PI - 0.6, Math.PI])
      for (const scale of [0.5, 1, 2]) {
        const model = bookModel(open),
          axes = readerBookAxes({ x: Math.cos(a), y: 0, z: Math.sin(a) }),
          hand = { x: 500, y: 600, z: 8 };
        for (const name of ['left', 'right'])
          assert(
            dist3(modelGrip(model, name, poseAtGrip(model, name, hand, axes, scale)), hand) < 1e-8,
          );
        assert(Math.abs(dot3(axes.right, axes.front)) < 1e-8);
        assert(Math.abs(len3(cross3(axes.right, axes.down)) - 1) < 1e-8);
      }
});
test('closed covers have thickness and separated page blocks; opening changes genuine depth', () => {
  const pose: ModelPose = { ...IDENTITY_AXES, at: { x: 0, y: 0, z: 0 }, scale: 1 };
  const closed = modelVertices(bookModel(0), pose),
    open = modelVertices(bookModel(1), pose);
  const span = (a: typeof closed, k: 'x' | 'y' | 'z') =>
    Math.max(...a.map((p) => p[k])) - Math.min(...a.map((p) => p[k]));
  assert(span(closed, 'x') > 3 && span(closed, 'x') < 4);
  assert.equal(span(closed, 'y'), 20);
  assert(Math.abs(span(closed, 'z') - bookDepth(0)) < 0.001);
  assert(span(open, 'x') > 22);
  assert(span(open, 'z') < 5);
  assert([...closed, ...open].every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
});
test('pages face the reader and their backs disappear naturally when the reader faces the viewer', () => {
  for (const a of [0.6, Math.PI - 0.6]) {
    const forward = { x: Math.cos(a), y: 0, z: Math.sin(a) },
      axes = readerBookAxes(forward),
      model = bookModel(1);
    const pages = model.faces.filter((f) => f.surface === 'page-surface');
    assert.equal(pages.length, 2);
    for (const face of pages) {
      const local = norm3(
        cross3(sub3(face.points[1], face.points[0]), sub3(face.points[2], face.points[0])),
      );
      const normal = modelVector(local, axes);
      assert(dot3(normal, axes.front) > 0.9);
    }
    const visible = projectModel(model, { ...axes, at: { x: 0, y: 0, z: 0 }, scale: 1 });
    assert(!visible.some((f) => f.surface === 'page-surface'));
    assert(visible.some((f) => f.surface === 'cover'));
  }
});
test('one page rotates through the hinge with its own grip and leaves the covers unchanged', () => {
  const cover = bookModel(1).faces.filter((f) => f.surface === 'cover');
  const first = bookModel(1, 0.01),
    mid = bookModel(1, 0.5),
    last = bookModel(1, 0.99);
  for (const model of [first, mid, last]) {
    assert.deepEqual(
      model.faces.filter((f) => f.surface === 'cover'),
      cover,
    );
    assert.equal(model.faces.filter((f) => f.surface === 'turning-page').length, 2);
  }
  assert(first.grips.turn.x > 9 && last.grips.turn.x < -9);
  assert(mid.grips.turn.z > first.grips.turn.z + 6);
});
test('all orientations have finite bounds and the loose collider contains the actual projected model', () => {
  const [p] = pets(),
    book = p.items.give('book', p.char)!;
  for (const dir of [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    norm3({ x: 1, y: 0.3, z: 0.6 }),
  ]) {
    book.where = 'world';
    book.bookOpen = 0;
    book.bookAxes = null;
    book.at = { x: 950, y: 700, z: 0 };
    book.dir = dir;
    book.loosen();
    const axes = looseBookAxes(dir);
    assert(Math.abs(len3(axes.right) - 1) < 1e-8);
    const points = modelVertices(book.model3D!, book.modelPose()),
      hull = book.collisionHull;
    for (const point of points) assert(polygonDistance(point, hull) < 1e-6);
    assert(hull.every((v) => [v.x, v.y].every(Number.isFinite)));
  }
});
test('spinning modeled books land on a platform as their projected hull changes topology', () => {
  const [p] = pets(), def = p.items.defs.get('book')!;
  const sizes = new Set<number>();
  for (let i = 0; i < 72; i++) {
    const angle = i * Math.PI / 36;
    const book = new Item(def, { x: 700, y: 520 }, 1);
    book.where = 'world'; book.bookOpen = 0.7;
    book.dir = norm3({ x: Math.cos(angle), y: Math.sin(angle), z: Math.sin(angle * 2) * 0.6 });
    book.loosen();
    const previous = norm3({ x: Math.cos(angle - 0.4), y: Math.sin(angle - 0.4), z: Math.sin((angle - 0.4) * 2) * 0.6 });
    const length = dist3(book.a, book.b);
    book.a.py -= 70;
    Object.assign(book.b, { px: book.a.px + previous.x * length,
      py: book.a.py + previous.y * length, pz: book.a.pz + previous.z * length });
    sizes.add(book.collisionHull.length);
    book.step(dt, { left: 0, right: 1400, top: 0, floor: 800 }, [{ id: 1, x1: 400, x2: 1000, y: 600 }]);
    assert(book.collisionHull.every(v => Number.isFinite(v.x) && Number.isFinite(v.y)));
    assert(Math.max(...book.collisionHull.map(v => v.y)) <= 600.001, `book penetrated platform at ${i}: ${Math.max(...book.collisionHull.map(v => v.y))}`);
  }
  assert(sizes.size > 1, 'exercise changing convex hull vertex counts');
});
test('both hands follow real model grips in three dimensions without stretching bones', () => {
  const all = pets(2);
  all[0].props.spawn('couch', 470, 740, 1);
  run(all, 3);
  for (const p of all) {
    p.items.give('book', p.char);
    p.paused = false;
    p.command('do:read');
  }
  run(all, 24);
  for (const p of all) {
    const book = p.items.list.find((i) => i.def.id === 'book')!;
    assert(book.bookAxes && book.bookReading);
    assert.equal(p.char.mode, 'sit');
    const model = book.model3D!,
      pose = book.modelPose(),
      main = book.hand === 'R' ? 'right' : 'left';
    assert(
      dist3(modelGrip(model, main, pose), p.char.body.j[book.hand === 'R' ? 'handR' : 'handL']) <
        1e-8,
    );
    const other = book.hand === 'R' ? 'L' : 'R',
      grip = model.grips.turn ? 'turn' : other === 'R' ? 'right' : 'left';
    assert(
      dist3(modelGrip(model, grip, pose), p.char.body.j[other === 'R' ? 'handR' : 'handL']) <
        2.5 * p.char.scale,
    );
    assert(
      p.char.body.sticks
        .filter((s) => !s.minOnly)
        .every((s) => Math.abs(dist3(s.a, s.b) - s.len) < 2 * p.char.scale),
    );
    assert(
      itemParts(book, p.char).length > 1,
      'faces must interleave with the arms, not be one foreground sprite',
    );
  }
  assert.deepEqual(checkSanity(all), []);
});
test('taking, canceling, gifting and restarting preserve the original progress and release model grips', () => {
  const [a, b] = pets(2),
    book = a.items.give('book', a.char)!;
  a.paused = false;
  a.command('do:read');
  run([a, b], 25);
  assert(book.bookmark > 0);
  const bookmark = book.bookmark;
  a.takeItem(book);
  run([a, b], 1);
  assert.equal(book.where, 'cursor');
  assert.equal(book.bookAxes, null);
  assert(!a.char.handsAt);
  assert.equal(book.bookmark, bookmark);
  a.giveBack(book);
  a.selectPeer(b.ctx.who);
  a.command('do:gift');
  b.paused = false;
  run([a, b], 25);
  const given = b.items.list.find((i) => i.uid === book.uid)!;
  assert(given && given.bookmark === bookmark && given.modeledBook);
  const [q] = pets();
  q.load(b.save());
  assert.equal(q.items.list.find((i) => i.def.id === 'book')!.bookmark, bookmark);
  assert.deepEqual(checkSanity([a, b]), []);
});
test('edited book artwork keeps its custom renderer, contour and progress', () => {
  const [p] = pets();
  const def = structuredClone(p.items.defs.get('book')!);
  def.shape[0].fill = '#b96565';
  const book = new Item(def, { x: 500, y: 600 }, 1);
  book.dir = { x: 1, y: 0, z: 0 };
  book.bookmark = 7;
  assert.equal(book.model3D, null);
  assert(!book.modeledBook);
  assert(book.distTo(510, 590) < 1);
  assert.equal(book.bookmark, 7);
});
console.log(`${passed} 3D prop/book checks passed`);
