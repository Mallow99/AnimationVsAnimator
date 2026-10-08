import assert from 'node:assert/strict';
import { PixelLayer, DEFAULT_LOOK } from '../src/core/render';
import { Props, makeBox, BUILTIN_PROPS, parsePropDef } from '../src/core/props';
import { sweepConvex } from '../src/core/geometry';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
import { ReadBook } from '../src/core/skills/read-book';
import { groupPlan, GroupActivity, availableForGroup } from '../src/core/skills/group';
import { checkSanity } from '../src/core/sanity';
import { activitiesFor } from '../src/app/activities';
import { offlineReply } from '../src/core/brains/offline';
import { parseRelationship } from '../src/core/relationships';
const dt = 1 / 120,
  bounds = { left: 0, right: 1400, top: 0, floor: 800 };
function pets(n = 1) {
  const cfg = {
    ...structuredClone(DEFAULT_CONFIG),
    windows: false,
    dailyRhythm: false,
    destructible: false,
  };
  const a = new Pet(bounds, cfg, { identity: 'q2-0' }),
    all = [a];
  for (let i = 1; i < n; i++)
    all.push(new Pet(bounds, companionConfig(cfg, i), { props: a.props, identity: `q2-${i}` }));
  for (const [i, p] of all.entries()) {
    p.paused = true;
    p.char.placeHome(300 + i * 75);
    p.setWindows([]);
    p.mind.reset(p.ctx);
    p.mind.holdUntil = Infinity;
  }
  for (let i = 0; i < 500; i++) for (const p of all) p.update(dt);
  for (const p of all) p.others = all.filter((q) => q !== p);
  return all;
}
function run(all: Pet[], seconds: number) {
  for (let i = 0; i < seconds / dt; i++) for (const p of all) p.update(dt);
}
let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed++;
  console.log('PASS', name);
}
test('pixel workspaces clip huge throws to the Retina viewport and reuse/shrink their backing store', () => {
  let created = 0;
  const original = globalThis.OffscreenCanvas;
  class Canvas {
    constructor(
      public width: number,
      public height: number,
    ) {
      created++;
    }
    getContext() {
      return {
        setTransform() {},
        clearRect() {},
        getImageData(_x: number, _y: number, w: number, h: number) {
          return { data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData() {},
      };
    }
  }
  (globalThis as any).OffscreenCanvas = Canvas;
  try {
    const ctx = {
      canvas: { width: 800, height: 600 },
      getTransform: () => ({ a: 2, d: 2, b: 0, c: 0, e: 0, f: 0 }),
      save() {},
      restore() {},
      drawImage() {},
    } as any;
    const layer = new PixelLayer();
    layer.paint(
      ctx,
      [
        { x: -10000, y: -10000 },
        { x: 10000, y: 10000 },
      ],
      8,
      DEFAULT_LOOK,
      () => {},
    );
    const cv = (layer as any).cv;
    assert(cv.width <= 256 && cv.height <= 192);
    for (let i = 0; i < 130; i++)
      layer.paint(
        ctx,
        [
          { x: 20, y: 20 },
          { x: 40, y: 50 },
        ],
        4,
        DEFAULT_LOOK,
        () => {},
      );
    assert.equal((layer as any).cv, cv);
    assert.equal(created, 1);
    assert.equal(cv.width, 64);
    assert.equal(cv.height, 64);
    layer.paint(
      ctx,
      [
        { x: 10000, y: 10000 },
        { x: 10001, y: 10001 },
      ],
      4,
      DEFAULT_LOOK,
      () => {},
    );
    assert.equal(created, 1);
  } finally {
    (globalThis as any).OffscreenCanvas = original;
  }
});
test('compound chair contact leaves the visible gap between its legs open', () => {
  const props = new Props(),
    chair = props.spawn('chair', 400, 600, 1)!;
  const at = chair.toWorld(11, 28),
    rect = [
      { x: at.x, y: at.y },
      { x: at.x + 8, y: at.y },
      { x: at.x + 8, y: at.y + 4 },
      { x: at.x, y: at.y + 4 },
    ];
  assert.equal(chair.contactOffset(rect), null);
  assert(chair.collisionHulls.length > 1);
  assert(chair.contactOffset(rect.map((p) => ({ ...p, x: p.x - 10 }))));
  assert.equal(BUILTIN_PROPS.find((p) => p.id === 'desk')!.collision!.length, 3);
});
test('a 3000px/s rigid throw cannot translate through a thin fixed obstacle', () => {
  const props = new Props(),
    d = { strokes: [], color: '#ffffff', born: 0, done: true, title: 'test' };
  const a = makeBox(d, 970, 500, 980, 510),
    b = makeBox(d, 985, 450, 989, 550, true);
  a.forever = b.forever = true;
  for (const p of a.points) p.px = p.x - 3000 / 120;
  props.add(a);
  props.add(b);
  props.update(1 / 120, 0, { left: 0, right: 1400, top: 0, floor: 900 }, []);
  assert(Math.max(...a.points.map((p) => p.x)) <= 985.05);
  assert.equal(b.points[0].x, 985);
  assert(a.points.every((p) => p.invMass === 1));
});
test('swept SAT reports the first obstacle contact and rejects separated parallel motion', () => {
  const square = (x: number, y: number) => [
    { x, y },
    { x: x + 4, y },
    { x: x + 4, y: y + 4 },
    { x, y: y + 4 },
  ];
  const hit = sweepConvex(square(0, 0), square(12, 0), { x: 20, y: 0 })!;
  assert(Math.abs(hit.time - 0.4) < 1e-8);
  assert.equal(hit.normal.x, -1);
  assert.equal(sweepConvex(square(0, 0), square(12, 10), { x: 20, y: 0 }), null);
});
test('bookmarks belong to the original book and survive interrupted reading and restart', () => {
  const [p] = pets();
  const book = p.items.give('book', p.char)!,
    read = new ReadBook();
  read.start(p.ctx);
  for (let i = 0; i < 40 / dt; i++) {
    read.t += dt;
    read.update(p.ctx, dt);
    p.update(dt);
  }
  assert(book.bookmark > 0);
  read.stop(p.ctx);
  const [q] = pets();
  q.load(p.save());
  assert.equal(q.items.list.find((i) => i.def.id === 'book')!.bookmark, book.bookmark);
  assert.equal(p.items.list.filter((i) => i.def.id === 'book').length, 1);
});
test('a brief reaction resumes the same reading progress; Stop and taking its original invalidate it', () => {
  const [p] = pets();
  p.items.give('book', p.char);
  p.paused = false;
  p.command('do:read');
  run([p], 8);
  assert.equal(p.mind.activeSkill?.name, 'read');
  const original = p.items.list.find((i) => i.def.id === 'book')!;
  const clock = (p.mind.activeSkill as any).clock.elapsed;
  p.mind.onEvent(p.ctx, { type: 'itemTaken', name: 'spare pen' });
  run([p], 5);
  assert.equal(p.mind.activeSkill?.name, 'read');
  assert((p.mind.activeSkill as any).clock.elapsed >= clock);
  assert.equal((p.mind.activeSkill as any).book, original);
  p.mind.onEvent(p.ctx, { type: 'itemTaken', name: 'spare pen' });
  p.mind.reset(p.ctx);
  run([p], 5);
  assert.equal(p.mind.activeSkill, null);
  p.command('do:read');
  run([p], 3);
  p.takeItem(original);
  run([p], 5);
  assert.notEqual((p.mind.activeSkill as any)?.name, 'read');
  assert.equal(p.items.list.filter((i) => i.def.id === 'book').length, 1);
});
test('shared chat uses directed varied turns, saved history and survives one departing member', () => {
  const all = pets(3),
    a = all[0];
  a.ctx.recordActivity!(all[1].ctx.who, 'pong', true);
  const plan = groupPlan(a.ctx, 'chat')!;
  assert(plan.turns!.some((t) => t.text.includes('rematch')));
  assert(new Set(plan.turns!.map((t) => t.seconds)).size > 1);
  assert(plan.turns!.every((t) => t.listener !== t.speaker));
  for (const p of all) p.paused = false;
  a.command('do:group:chat');
  run(all, 12);
  assert(all.every((p) => p.mind.activeSkill instanceof GroupActivity));
  all[2].leaveWorld();
  for (const p of all.slice(0, 2)) p.others = all.slice(0, 2).filter((q) => q !== p);
  run(all.slice(0, 2), 4);
  assert(all.slice(0, 2).every((p) => p.mind.activeSkill instanceof GroupActivity));
  run(all.slice(0, 2), 45);
  assert(all.slice(0, 2).every((p) => !p.mind.activeSkill));
  const saved = a.save(),
    [q] = pets();
  q.load(saved);
  assert(q.ctx.relationship!(all[1].ctx.who).recent.includes('pong'));
  const legacy = parseRelationship({ bond: 0.4 })!;
  assert.deepEqual(legacy.recent, []);
});
test('blanket and snack finish, clean poses, retain originals and permit passive taking', () => {
  for (const [id, command, duration] of [
    ['blanket', 'blanket', 90],
    ['snack-box', 'snack', 40],
  ] as const) {
    const [p] = pets(),
      it = p.items.give(id, p.char)!;
    p.paused = false;
    p.command(`do:${command}`);
    let used = false;
    for (let i = 0; i < duration / dt; i++) {
      p.update(dt);
      used ||= it.blanketSpread > 0.5 || it.snackOpen > 0.5;
    }
    assert(used, `${command} never opened`);
    assert(!p.mind.activeSkill, `${command} never finished`);
    assert.equal(it.working, false);
    assert.equal(it.blanketSpread, 0);
    assert.equal(it.snackOpen, 0);
    assert.equal(p.char.handsAt, null);
    assert(p.items.list.includes(it));
    assert.notEqual(it.where, 'hand');
    assert.deepEqual(checkSanity([p]), []);
    p.command(`do:${command}`);
    run([p], 4);
    p.takeItem(it);
    run([p], 3);
    assert.equal(it.where, 'cursor');
    assert(!it.cursorControlled);
    assert(!it.working);
    p.giveBack(it);
    assert.notEqual(it.where, 'cursor');
    assert.deepEqual(checkSanity([p]), []);
    const [q] = pets();
    q.load(p.save());
    assert.equal(q.items.list.filter((i) => i.def.id === id).length, 1);
  }
});
test('reading light claims clear on cancellation and departure, while manual choice survives restart', () => {
  const all = pets(2),
    p = all[0],
    lamp = p.props.spawn('lamp', p.char.x + 65, 740, 1)!;
  run(all, 3);
  p.paused = false;
  p.command('do:read');
  run(all, 12);
  assert(lamp.on);
  assert(lamp.lightUsers.has(p.ctx.who));
  p.mind.reset(p.ctx);
  assert(!lamp.on);
  assert.equal(lamp.lightUsers.size, 0);
  p.command('do:lamp');
  run(all, 8);
  assert.equal(lamp.manualLight, true);
  assert(lamp.on);
  const [q] = pets();
  q.load(p.save());
  const restored = q.props.placed.find((t) => t.def?.id === 'lamp')!;
  assert.equal(restored.manualLight, true);
  assert(restored.on);
  p.command('do:lamp');
  run(all, 8);
  assert.equal(lamp.manualLight, false);
  assert(!lamp.on);
  p.command('do:read');
  run(all, 10);
  assert(!lamp.on);
  p.leaveWorld();
  assert.equal(lamp.lightUsers.size, 0);
  assert.deepEqual(checkSanity(all, all.slice(1)), []);
});
test('two friends play catch with one real original and three safe spectators; taking cancels it', () => {
  const all = pets(5),
    p = all[0],
    ball =
      p.items.list.find((i) => i.def.id === 'bouncy-ball') ?? p.items.give('bouncy-ball', p.char)!;
  const originals = all.flatMap((p) => p.items.list.map((i) => i.uid));
  for (const p of all) p.paused = false;
  p.command('do:catch');
  let catches = 0,
    flight = false;
  const positions: number[] = [];
  for (let i = 0; i < 30 / dt; i++) {
    run(all, dt);
    if (process.env.PQ2_DEBUG && i % 120 === 0)
      console.log(
        'catch',
        i / 120,
        all.slice(0, 2).map((q) => ({
          x: q.char.x,
          mode: q.char.mode,
          skill: q.mind.activeSkill?.name,
          group: q.view().group,
          why: q.mind.why,
        })),
        { where: ball.where, at: ball.at },
      );
    const b = p.view().group?.ball;
    if (b) {
      catches = Math.max(catches, b.catches);
      flight ||= b.holder === null;
      positions.push(b.at.x);
    }
  }
  assert(catches >= 4, `only ${catches} catches`);
  assert(flight);
  assert(Math.max(...positions) - Math.min(...positions) > 80);
  assert(p.items.list.includes(ball));
  assert.deepEqual(
    all.flatMap((p) => p.items.list.map((i) => i.uid)),
    originals,
  );
  assert(all.every((p) => p.char.hp === 1));
  assert(!ball.working);
  assert.deepEqual(checkSanity(all), []);
  p.command('do:catch');
  run(all, 6);
  p.takeItem(ball);
  run(all, 3);
  assert(!all.some((p) => p.view().group));
  assert.equal(ball.where, 'cursor');
  assert(!ball.cursorControlled);
  assert(!ball.working);
});
test('new supplies share visible requirements and offline/optional AI action vocabulary', () => {
  const [p] = pets();
  const actions = activitiesFor(p);
  for (const [text, command] of [
    ['rest under a blanket', 'blanket'],
    ['have a snack', 'snack'],
    ['switch the lamp', 'lamp'],
    ['play catch', 'catch'],
  ]) {
    assert.equal((offlineReply(p.ctx, text).plan[0] as { do: string }).do, command);
    assert(actions.some((a) => a.command === command));
    assert(p.mind.makeSkill(p.ctx, command) !== null || command === 'catch');
  }
  assert(actions.find((a) => a.command === 'blanket')!.needs);
  p.items.give('blanket', p.char);
  assert(!activitiesFor(p).find((a) => a.command === 'blanket')!.needs);
});
test('mixed density changes contact response and fast original items respect a thin solid', () => {
  const props = new Props();
  for (const [id, density] of [
    ['light', 1],
    ['heavy', 4],
  ] as const) {
    const def = parsePropDef({
      type: 'prop',
      id,
      name: id,
      use: 'none',
      density,
      outline: [
        [0, 0],
        [60, 0],
        [60, 60],
        [0, 60],
      ],
      shape: [],
    })!;
    props.defs.set(id, def);
  }
  const light = props.spawn('light', 600, 500, 1)!,
    heavy = props.spawn('heavy', 655, 500, 1)!;
  const before = [light.center.x, heavy.center.x];
  props.update(dt, 0, bounds, []);
  const displacement = [Math.abs(light.center.x - before[0]), Math.abs(heavy.center.x - before[1])];
  assert(displacement[0] > displacement[1] * 3, `mass response ${displacement}`);
  const [p] = pets(),
    book = p.items.spawn('book', { x: 963, y: 500 }, p.char.scale)!,
    wall = makeBox({ strokes: [], color: '#555', born: 0, done: true }, 985, 450, 989, 550, true);
  p.props.add(wall);
  book.dir = { x: 1, y: 0, z: 0 };
  book.loosen(3000, 0);
  assert(Math.max(...book.collisionHull.map((v) => v.x)) < 985);
  p.update(dt);
  assert(Math.max(...book.collisionHull.map((v) => v.x)) <= 985.1);
  assert(p.items.list.includes(book));
});
test('blanket and snack resume their original after a brief reaction and Stop clears the continuation', () => {
  for (const [id, cmd] of [
    ['blanket', 'blanket'],
    ['snack-box', 'snack'],
  ] as const) {
    const [p] = pets(),
      item = p.items.give(id, p.char)!;
    p.paused = false;
    p.command(`do:${cmd}`);
    run([p], 5);
    const elapsed = (p.mind.activeSkill as any).elapsed;
    assert(elapsed > 1);
    p.mind.onEvent(p.ctx, { type: 'itemTaken', name: 'spare pen' });
    run([p], 5);
    assert.equal(p.mind.activeSkill?.name, cmd);
    assert.equal((p.mind.activeSkill as any).item, item);
    assert((p.mind.activeSkill as any).elapsed >= elapsed);
    p.mind.onEvent(p.ctx, { type: 'itemTaken', name: 'spare pen' });
    p.command('do:wake');
    run([p], 5);
    assert.equal(item.working, false);
    assert.equal(p.mind.activeSkill, null);
    assert.deepEqual(checkSanity([p]), []);
  }
});
test('a blocked ball pass ends cleanly instead of teleporting through furniture or forcing a catch', () => {
  const all = pets(2),
    p = all[0],
    ball = p.items.give('bouncy-ball', p.char)!;
  for (const p of all) p.paused = false;
  p.command('do:catch');
  for (let i = 0; i < 20 / dt && p.view().group?.phase !== 'do'; i++) run(all, dt);
  assert.equal(p.view().group?.phase, 'do');
  const mid = (all[0].char.x + all[1].char.x) / 2,
    wall = makeBox(
      { strokes: [], color: '#555', born: 0, done: true },
      mid - 5,
      600,
      mid + 5,
      795,
      true,
    );
  p.props.add(wall);
  run(all, 8);
  assert(!all.some((p) => p.view().group));
  assert(p.items.list.includes(ball));
  assert.equal(ball.where, 'world');
  assert(!ball.working);
  assert.deepEqual(checkSanity(all), []);
});
test('tired companions are excluded consistently from catch plans and visible requirements', () => {
  const all = pets(3),
    p = all[0];
  p.items.give('bouncy-ball', p.char);
  all[1].mood.s.energy = 0.05;
  assert(!availableForGroup(all[1].view()));
  const plan = groupPlan(p.ctx, 'catch')!;
  assert.equal(plan.members[1], all[2].ctx.who);
  all[2].mood.s.energy = 0.05;
  assert.equal(groupPlan(p.ctx, 'catch'), null);
  assert(activitiesFor(p).find((a) => a.command === 'catch')!.needs);
});
test('interrupted removal/transfer cannot resurrect an item in its old bag or overwrite its new owner', () => {
  const [a, b] = pets(2),
    book = a.items.give('book', a.char)!;
  a.paused = false;
  a.command('do:read');
  run([a, b], 5);
  assert.equal(book.where, 'hand');
  a.items.remove(book);
  b.items.list.push(book);
  b.items.toHand(book, 'R');
  book.bookTarget = 1;
  book.bookReading = true;
  a.mind.reset(a.ctx);
  assert.equal(book.bookTarget, 1);
  assert.equal(book.bookReading, true);
  assert(!a.items.belt.includes(book));
  assert(!a.items.stow(book));
  a.items.toCursor(book, { x: 0, y: 0 });
  assert.equal(book.where, 'hand');
  b.items.stow(book);
  a.items.remove(book);
  assert.equal(book.slot, b.items.belt.indexOf(book));
  assert.deepEqual(checkSanity([a, b]), []);
  for (const [id, cmd] of [
    ['blanket', 'blanket'],
    ['snack-box', 'snack'],
  ] as const) {
    const item = a.items.give(id, a.char)!;
    a.command(`do:${cmd}`);
    run([a, b], 5);
    a.items.remove(item);
    a.mind.reset(a.ctx);
    assert(!a.items.belt.includes(item));
    assert.deepEqual(checkSanity([a, b]), []);
  }
});
test('visible blanket hems and reader-facing pages are selectable in both facings', () => {
  const [p] = pets();
  for (const f of [-1, 1]) {
    const blanket = p.items.give('blanket', p.char)!;
    p.items.toHand(blanket, 'R');
    blanket.working = true;
    blanket.blanketSpread = 1;
    blanket.at = { x: 500, y: 600, z: 0 };
    blanket.dir = { x: f, y: 0, z: 0 };
    assert(blanket.distTo(500 + f * 35 * blanket.scale, 600 + 25 * blanket.scale) < 1);
    assert(blanket.distTo(500 + f * 35 * blanket.scale, 600 - 25 * blanket.scale) > 10);
    p.items.remove(blanket);
    const book = p.items.give('book', p.char)!;
    p.items.toHand(book, 'R');
    book.bookOpen = 1;
    book.bookReading = true;
    book.at = { x: 500, y: 600, z: 0 };
    book.dir = { x: f, y: 0, z: 0 };
    assert(book.distTo(500 + f * 12 * book.scale, 600 - 4 * book.scale) < 1);
    assert(book.distTo(500 + f * 12 * book.scale, 600 - 20 * book.scale) > 5);
    p.items.remove(book);
  }
});
test('a shared automatic lamp stays lit and pauses ink expiry until its last real reader leaves', () => {
  const all = pets(2),
    a = all[0],
    b = all[1],
    lamp = a.props.spawn('lamp', 370, 740, 1)!;
  run(all, 3);
  for (const p of all) {
    p.paused = false;
    p.command('do:read');
  }
  run(all, 12);
  assert.equal(lamp.lightUsers.size, 2);
  assert(lamp.on);
  lamp.ink = { source: 'lamp', progress: 0, remaining: 0.01 };
  run(all, 2);
  assert(a.props.things.includes(lamp));
  a.mind.reset(a.ctx);
  assert(lamp.on);
  assert.equal(lamp.lightUsers.size, 1);
  b.mind.reset(b.ctx);
  assert(!lamp.on);
  assert.equal(lamp.lightUsers.size, 0);
  run(all, 1);
  assert(!a.props.things.includes(lamp));
  assert.deepEqual(checkSanity(all), []);
});
test('switch-off intent survives interrupting the reader that was lighting the lamp', () => {
  const [p]=pets(), lamp=p.props.spawn('lamp',370,740,1)!;
  run([p],3);p.paused=false;p.command('do:read');run([p],12);
  assert(lamp.on);p.command('do:lamp');run([p],8);
  assert.equal(lamp.manualLight,false);assert(!lamp.on);
  assert.deepEqual(checkSanity([p]),[]);
});
console.log(`${passed} Pet Quality 2 checks passed`);
