import assert from 'node:assert/strict';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
import { ReadBook } from '../src/core/skills/read-book';
import { PlayVideoGame, WatchTV } from '../src/core/skills/props';
import { checkSanity } from '../src/core/sanity';
import { bookProgress, parseItemDef } from '../src/core/items';

const dt = 1 / 60;
let seed = 42;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function pets(n = 1) {
  const cfg = {
    ...structuredClone(DEFAULT_CONFIG),
    windows: false,
    dailyRhythm: false,
    destructible: false,
    inkLifetime: 0,
  };
  const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
  const first = new Pet(bounds, cfg, { identity: 'polish-0' });
  const all = [
    first,
    ...Array.from(
      { length: n - 1 },
      (_, i) =>
        new Pet(bounds, companionConfig(cfg, i + 1), {
          props: first.props,
          identity: `polish-${i + 1}`,
        }),
    ),
  ];
  for (const [i, p] of all.entries()) {
    p.paused = true;
    p.mind.reset(p.ctx);
    p.mind.holdUntil = Infinity;
    p.char.placeHome(360 + i * 85);
    p.setWindows([]);
  }
  run(all, 3);
  for (const p of all) p.others = all.filter((q) => q !== p);
  return all;
}
function run(all: Pet[], seconds: number, sample?: () => void) {
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
    for (const p of all) p.update(dt);
    sample?.();
  }
}
let passed = 0;
function test(name: string, work: () => void) {
  seed = 42;
  work();
  passed++;
  console.log('PASS', name);
}

test('a quiet seated figure can choose its next activity, while a sleeper keeps resting', () => {
  for (const asleep of [false, true]) {
    const [p] = pets();
    p.char.sit();
    run([p], 2);
    p.mood.asleep = asleep;
    p.mood.s.energy = 0.6;
    p.paused = false;
    p.mind.holdUntil = 0;
    for (const option of p.mind.weigh(p.ctx))
      p.mind.biases[option.name] = option.name === 'wander' ? 1 : 0;
    run([p], 1);
    if (asleep) {
      assert.equal(p.char.mode, 'sit');
      assert.equal(p.mind.activeSkill, null);
    } else {
      assert.equal(p.mind.activeSkill?.name, 'wander');
      assert.equal(p.char.mode, 'ground');
      assert(p.char.walking);
    }
  }
});
test('autonomous reading finishes a section at a completed page turn; a requested session continues', () => {
  for (const autonomous of [true, false]) {
    const [p] = pets(),
      book = p.items.give('book', p.char)!;
    p.paused = false;
    p.mind.startActivity(p.ctx, new ReadBook(book, 0, autonomous));
    run([p], 225);
    assert(book.bookmark > 0);
    assert.equal(p.items.list.filter((i) => i.def.id === 'book').length, 1);
    if (autonomous) {
      assert.equal(p.mind.activeSkill, null);
      assert.equal(book.where, 'belt');
      assert.equal(book.bookOpen, 0);
      assert.equal(book.bookPage, 0);
    } else assert.equal(p.mind.activeSkill?.name, 'read');
    assert.deepEqual(checkSanity([p]), []);
  }
});
test('self-chosen reading uses an owned unfinished book and never creates an unsolicited supply', () => {
  const [p] = pets();
  assert(!p.mind.weigh(p.ctx).some((o) => o.name === 'read'));
  const book = p.items.give('book', p.char)!;
  assert(p.mind.weigh(p.ctx).some((o) => o.name === 'read'));
  book.bookmark = book.bookPages;
  assert(!p.mind.weigh(p.ctx).some((o) => o.name === 'read'));
  p.takeItem(book);
  assert(!p.mind.weigh(p.ctx).some((o) => o.name === 'read'));
});
test('the final page is counted once, survives restart and delivery, and explicit rereading resets progress', () => {
  const [a, b] = pets(2),
    book = a.items.give('book', a.char)!;
  book.bookPages = 8;
  book.bookmark = 7;
  a.paused = false;
  a.mind.startActivity(a.ctx, new ReadBook(book));
  let turning = false;
  run([a, b], 30, () => {
    if (book.bookPage > 0.05 && book.bookPage < 0.95) {
      turning = true;
      assert.equal(book.bookmark, 7);
    }
  });
  assert(turning);
  assert.equal(book.bookmark, 8);
  assert.equal(book.bookReadThroughs, 1);
  assert.equal(a.mind.activeSkill, null);
  assert.equal(book.bookOpen, 0);
  assert.equal(bookProgress(book), 'Finished · 8/8 pages');
  const [restored] = pets();
  restored.load(a.save());
  const saved = restored.items.list.find((i) => i.def.id === 'book')!;
  assert.deepEqual([saved.bookmark, saved.bookPages, saved.bookReadThroughs], [8, 8, 1]);
  const message = {
    type: 'toolGift' as const,
    token: 'finished-book',
    uid: book.uid,
    def: book.def,
    ammo: book.ammo,
    bookmark: book.bookmark,
    bookPages: book.bookPages,
    bookReadThroughs: book.bookReadThroughs,
  };
  let accepted = false;
  a.ctx.deliverGift!(b.ctx.who, message, (yes) => {
    accepted = yes;
    if (yes) a.items.remove(book);
  });
  assert(accepted);
  run([a, b], 4);
  const gift = b.items.list.find((i) => i.uid === book.uid)!;
  assert.deepEqual([gift.bookmark, gift.bookPages, gift.bookReadThroughs], [8, 8, 1]);
  b.paused = false;
  b.mind.startActivity(b.ctx, new ReadBook(gift));
  run([a, b], 3);
  assert.equal(gift.bookmark, 0);
  assert.equal(gift.bookReadThroughs, 1);
  assert.equal(b.mind.activeSkill?.name, 'read');
  assert.deepEqual(checkSanity([a, b]), []);
});
test('legacy bookmarks remain usable and malformed book metadata is bounded', () => {
  const [p] = pets();
  p.items.load(
    [
      { id: 'book', slot: 1, bookmark: 120 },
      { id: 'book', slot: 2, bookmark: 9000, bookPages: -5, bookReadThroughs: 2000 },
    ],
    p.char,
  );
  const books = p.items.list.filter((i) => i.def.id === 'book');
  assert.equal(books[0].bookmark, 120);
  assert(books[0].bookPages > 120);
  assert.equal(books[1].bookmark, 8);
  assert.equal(books[1].bookPages, 8);
  assert.equal(books[1].bookReadThroughs, 1000);
  const custom = parseItemDef({ ...books[0].def, id: 'short-book', pages: 16 })!;
  assert.equal(custom.pages, 16);
  assert.deepEqual(checkSanity([p]), []);
  books[0].bookmark = books[0].bookPages + 1;
  assert(checkSanity([p]).some((s) => s.includes('saved item progress')));
});
test('a custom short book keeps its page count and shelf through restart, and its actual gift carries progress', () => {
  const [a, b] = pets(2),
    custom = parseItemDef({
      ...a.items.defs.get('book'),
      id: 'short-book',
      name: 'A short story',
      pages: 16,
    })!;
  a.items.defs.set(custom.id, custom);
  const book = a.items.give(custom.id, a.char)!;
  book.bookmark = 9;
  book.bookReadThroughs = 2;
  const shelf = a.props.spawn('bookshelf', 950, 740, 1)!;
  run([a, b], 3);
  book.at = { ...shelf.toWorld(10, 35), z: 6 };
  a.items.drop(book, 0, 0);
  book.shelf = { key: shelf.storageKey, slot: 0 };
  const [q] = pets();
  q.load(a.save());
  run([q], 2);
  const copy = q.items.list.find((i) => i.def.id === custom.id)!;
  assert.deepEqual([copy.bookmark, copy.bookPages, copy.bookReadThroughs], [9, 16, 2]);
  assert(copy.shelf && copy.where === 'world');
  a.giveBack(book);
  a.paused = false;
  a.selectPeer(b.ctx.who);
  a.command('do:gift');
  run([a, b], 25);
  const received = b.items.list.find((i) => i.uid === book.uid)!;
  assert(received);
  assert(!a.items.list.includes(book));
  assert.deepEqual([received.bookmark, received.bookPages, received.bookReadThroughs], [9, 16, 2]);
  assert.deepEqual(checkSanity([a, b]), []);
});
test('both readers hold their original books toward their faces with normal reachable arms', () => {
  const all = pets(2);
  const couch = all[0].props.spawn('couch', 500, 740, 1)!;
  run(all, 3);
  for (const [i, p] of all.entries()) {
    p.char.facing = i === 0 ? -1 : 1;
    p.items.give('book', p.char);
    p.paused = false;
    p.command('do:read');
  }
  const said: string[][] = all.map(() => []);
  for (const [i, p] of all.entries()) p.ctx.say = (text) => said[i].push(text);
  run(all, 25);
  for (const p of all) {
    const book = p.items.list.find((i) => i.def.id === 'book')!;
    assert.equal(p.mind.activeSkill?.name, 'read');
    assert.equal(p.char.mode, 'sit');
    assert(couch.sitters.has(p.ctx.who));
    assert(book.bookOpen > 0.9 && book.bookmark > 0 && book.bookReading);
    const neck = p.char.body.j.neck,
      hand = p.char.body.j[book.hand === 'L' ? 'handL' : 'handR'];
    assert(hand.y < neck.y + 14 * p.char.scale, JSON.stringify({name:p.config.name,neck:{x:neck.x,y:neck.y,z:neck.z},hand:{x:hand.x,y:hand.y,z:hand.z},target:p.char.handsAt,mode:p.char.mode,style:p.char.seatStyle,axes:book.bookAxes}));
    assert(book.dir.y < -0.3, 'pages should tip toward the reader');
    assert(p.ctx.lookTarget && p.ctx.lookTarget.y < neck.y + 10 * p.char.scale);
    assert(
      p.char.body.sticks
        .filter((b) => !b.minOnly)
        .every(
          (b) =>
            Math.abs(Math.hypot(b.a.x - b.b.x, b.a.y - b.b.y, b.a.z - b.b.z) - b.len) <
            4 * p.char.scale,
        ),
      'unreachable hand pose stretched a bone',
    );
  }
  assert(
    said.every((lines) => lines.length <= 1),
    JSON.stringify(said),
  );
  assert.deepEqual(checkSanity(all), []);
});
test('an idle spectator walks clear of seated readers without disturbing either book or seat', () => {
  const all = pets(3),
    [a, b, spectator] = all;
  const couch = a.props.spawn('couch', 500, 740, 1)!;
  run(all, 3);
  spectator.char.placeHome(1000);
  for (const p of [a, b]) {
    p.items.give('book', p.char);
    p.paused = false;
    p.command('do:read');
  }
  run(all, 10);
  assert.equal(couch.sitters.size, 2);
  spectator.char.placeHome(a.char.body.j.head.x);
  run(all, 10);
  assert(!spectator.char.walking);
  assert.equal(spectator.char.mode, 'ground');
  for (const p of [a, b]) {
    assert.equal(p.mind.activeSkill?.name, 'read');
    assert(couch.sitters.has(p.ctx.who));
    assert(
      Math.abs(spectator.char.body.j.head.x - p.char.body.j.head.x) >
        spectator.char.d.headR + p.char.d.headR,
    );
  }
  assert.deepEqual(checkSanity(all), []);
});
test('five readers fit, keep their originals, and a departing reader clears the remaining row', () => {
  const all = pets(5),
    couch = all[0].props.spawn('couch', 550, 740, 1)!;
  run(all, 3);
  const books = all.map((p) => p.items.give('book', p.char)!);
  for (const p of all) {
    p.paused = false;
    p.command('do:read');
  }
  run(all, 14);
  assert.equal(
    couch.sitters.size,
    5,
    all.map((p) => p.char.mode + ':' + p.mind.activeSkill?.name).join(','),
  );
  for (const [i, p] of all.entries()) {
    assert.equal(p.char.mode, 'sit');
    assert(p.items.list.includes(books[i]));
    p.char.look = null;
    p.char.facing = 1;
  }
  run(all, 1);
  const ordered = all
    .map((p, i) => ({ p, book: books[i] }))
    .sort((a, b) => a.p.char.body.j.head.x - b.p.char.body.j.head.x);
  for (let i = 0; i < ordered.length - 1; i++) {
    const next = ordered[i + 1].p.char.body.j.head;
    assert(
      ordered[i].book.distTo(next.x, next.y) > ordered[i + 1].p.char.d.headR,
      JSON.stringify({
        reader: ordered[i].p.config.name,
        book: ordered[i].book.at,
        dir: ordered[i].book.dir,
        next: { x: next.x, y: next.y, r: ordered[i + 1].p.char.d.headR },
        distance: ordered[i].book.distTo(next.x, next.y),
      }),
    );
  }
  const leaving = all[2];
  leaving.command('do:wake');
  run(all, 9);
  assert.equal(couch.sitters.size, 4);
  assert.equal(leaving.char.mode, 'ground');
  for (const p of all.filter((p) => p !== leaving))
    assert(
      Math.abs(leaving.char.body.j.head.x - p.char.body.j.head.x) >
        leaving.char.d.headR + p.char.d.headR,
    );
  assert.deepEqual(checkSanity(all), []);
});
test('autonomous TV games finish naturally and crash speech is bounded while the game still runs', () => {
  for (const game of [false, true]) {
    const [p] = pets(),
      tv = p.props.spawn('tv', 650, 740, 1)!;
    run([p], 3);
    const speech: string[] = [];
    p.ctx.say = (text) => speech.push(text);
    p.paused = false;
    p.mind.startActivity(p.ctx, game ? new PlayVideoGame(tv, true) : new WatchTV(tv, true));
    let presses = 0;
    run([p], 300, () => {
      presses = Math.max(presses, tv.arcade?.presses ?? 0);
    });
    assert.equal(p.mind.activeSkill, null);
    assert.equal(tv.watchers.size, 0);
    assert.equal(tv.players.length, 0);
    if (game) {
      assert(presses > 0);
      assert(speech.length <= 22, JSON.stringify(speech));
    }
    assert.deepEqual(checkSanity([p]), []);
  }
});
test('a furniture request replaces an opposite walking destination and reaches the selected activity', () => {
  const [p] = pets(),
    couch = p.props.spawn('couch', 650, 740, 1)!,
    tv = p.props.spawn('tv', 900, 740, 1)!;
  run([p], 3);
  p.char.placeHome(753);
  p.char.walkTo(1300);
  run([p], 0.5);
  p.paused = false;
  p.command('do:watchtv');
  run([p], 10);
  assert.equal(p.mind.activeSkill?.name, 'watchtv');
  assert.equal(p.char.mode, 'sit');
  assert(couch.sitters.has(p.ctx.who));
  assert(tv.on);
  assert(Math.abs(p.char.x - couch.center.x) < 30 * p.char.scale);
  assert.deepEqual(checkSanity([p]), []);
});
console.log(`${passed} Pet polish checks passed`);
