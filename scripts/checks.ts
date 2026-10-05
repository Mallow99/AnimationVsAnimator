// Focused regression checks for saves, AI failures, definitions and window attachments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pet, DEFAULT_CONFIG, friendConfig } from '../src/core/pet';
import type { Peer } from '../src/core/peer';
import { aimAngle, ARROW_SPEED } from '../src/core/skills/archery';
import { guardPose } from '../src/core/skills/swordplay';
import { mergeConfig } from '../src/core/config';
import { parseItemDef } from '../src/core/items';
import { parsePropDef, makeBridge } from '../src/core/props';
import { WindowAccess } from '../src/core/window-access';
import { writeAtomic } from '../src/electron/storage';
import { unchangedExample } from '../src/electron/builtin-files';
import { Item, BUILTIN_ITEMS } from '../src/core/items';
import { parseSprite } from '../src/core/pixel-art';
import { Runner } from '../src/core/tv-game';
import { BoardGame, chooseGameMove, gameResult, openingBoard, captures, legalMoves, type Disc } from '../src/core/board-game';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) { await fn(); passed++; console.log(`PASS ${name}`); }
const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
const pet = () => new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), mind: 'chat', destructible: false });
async function advance(p: Pet, seconds = 0.3) {
  for (let i = 0; i < seconds * 60; i++) { p.update(1 / 60); await new Promise<void>((done) => setImmediate(done)); }
}

await test('malformed AI response is reported and the next conversation still works', async () => {
  const p = pet(); let asks = 0;
  p.brain.ask = async () => ++asks === 1 ? '{bad JSON}' : '{"say":"hi","plan":[]}';
  p.command('hear:hello'); await advance(p);
  assert.match(p.brain.status, /couldn't read/);
  assert(p.brain.log.some((l) => l.who === 'note'));
  p.command('hear:hello again'); await advance(p);
  assert.equal(asks, 2); assert(p.brain.log.some((l) => l.who === 'him' && l.text === 'hi'));
});

await test('a delayed reply cannot act after changing to Offline', async () => {
  const p = pet(); let answer!: (text: string) => void;
  p.brain.ask = () => new Promise((resolve) => { answer = resolve; });
  p.command('hear:dance'); await advance(p);
  p.applyConfig({ ...p.config, mind: 'offline' });
  answer('{"say":"late reply","plan":[{"do":"dance"}]}'); await advance(p);
  assert(!p.brain.log.some((l) => l.text === 'late reply'));
  assert.notEqual(p.mind.why, 'you asked (AI)');
});

await test('small chat prompts keep the persona but omit detailed body/drawing guides', () => {
  const p = pet();
  const chat = p.brain.systemPrompt(p.memory, 'hello');
  assert(chat.includes(DEFAULT_CONFIG.persona));
  assert(!chat.includes('Example backflip:'));
  const body = p.brain.systemPrompt(p.memory, 'invent a handstand');
  const art = p.brain.systemPrompt(p.memory, 'draw a picture');
  assert(body.includes('Example backflip:'));
  assert(art.length > chat.length);
});

await test('AI interval survives old saves and clamps invalid settings', () => {
  assert.equal(mergeConfig(DEFAULT_CONFIG, {}).aiInterval, 40);
  assert.equal(mergeConfig(DEFAULT_CONFIG, { aiInterval: 2 }).aiInterval, 40);
  assert.equal(mergeConfig(DEFAULT_CONFIG, { aiInterval: 999 }).aiInterval, 300);
  assert.equal(mergeConfig(DEFAULT_CONFIG, { provider: 'toString' }).provider, 'gemini');
});

await test('refusing one window preserves the others and expires after a minute', () => {
  const a = new WindowAccess(); a.refuse(1, 10);
  assert(!a.canMove(1, 11)); assert(a.canMove(2, 11)); assert(a.anyAvailable([1, 2], 11));
  assert(!a.anyAvailable([1], 11)); assert(a.canMove(1, 71));
});

await test('bridges follow their windows and release a missing endpoint', () => {
  const a = { id: 1, x: 100, y: 300, w: 200, h: 300 }, b = { id: 2, x: 500, y: 300, w: 200, h: 300 };
  const bridge = makeBridge({ strokes: [], color: '#000000', born: 0, done: true }, 300, 300, 500, 300);
  bridge.attachWindow(0, a); bridge.attachWindow(bridge.points.length - 1, b);
  bridge.followWindows([{ ...a, x: 120, y: 320 }, { ...b, x: 520, y: 320 }]);
  assert.equal(bridge.points[0].x, 320); assert.equal(bridge.points[0].y, 320);
  assert.equal(bridge.points.at(-1)!.x, 520);
  bridge.followWindows([{ ...b, x: 520, y: 320 }]);
  assert.equal(bridge.points[0].invMass, 1); assert.equal(bridge.points.at(-1)!.invMass, 0);
});

await test('malformed custom drawings cannot introduce NaN coordinates', () => {
  const d = parseItemDef({ id: 'bad', shape: [{ pts: [[NaN, 0], [0, Infinity]] }] })!;
  assert(d.shape.flatMap((s) => s.pts.flat()).every(Number.isFinite));
  const p = parsePropDef({ type: 'prop', id: 'bad', outline: [[0, 0], [20, 0], [20, 20]], screen: [0, 0, Infinity, 2], shape: [{ pts: [[0, 0], [2, 2]], width: NaN }] })!;
  assert.equal(p.screen, undefined); assert(Number.isFinite(p.shape[0].width));
});

await test('repeated atomic saves preserve the last complete file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-save-'));
  try {
    const file = path.join(dir, 'memory.json');
    for (let i = 0; i < 100; i++) writeAtomic(file, JSON.stringify({ i, notes: ['kept'] }));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { i: 99, notes: ['kept'] });
    assert(!fs.existsSync(file + '.tmp'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
const tvAt = (p: Pet, x: number) => p.props.spawn('tv', x, bounds.floor - 70 * p.char.scale - 2, p.char.scale)!;
await test('Othello opens correctly, flips trapped discs in all eight directions and never wraps a row', () => {
  const b = openingBoard();
  assert.deepEqual(legalMoves(b, 'black'), [19, 26, 37, 44]);
  assert.deepEqual(legalMoves(b, 'white'), [20, 29, 34, 43]);
  assert.deepEqual(captures(b, 19, 'black'), [27]);
  const all = Array<Disc>(64).fill('');
  for (const i of [18, 19, 20, 26, 28, 34, 35, 36]) all[i] = 'white';
  for (const i of [9, 11, 13, 25, 29, 41, 43, 45]) all[i] = 'black';
  assert.deepEqual(captures(all, 27, 'black').sort((a,b) => a-b), [18, 19, 20, 26, 28, 34, 35, 36]);
  const edge = Array<Disc>(64).fill(''); edge[6] = 'black'; edge[7] = 'white';
  assert.deepEqual(captures(edge, 8, 'black'), []);
  assert.equal(b.filter(Boolean).length, 4);
});
await test('Othello rejects illegal/double moves, waits for him and scores completed games', () => {
  const g = new BoardGame(); g.invite(); g.accept();
  assert(!g.play(0, 1)); assert(!g.play(27, 1)); assert(!g.play(-1, 1)); assert(!g.play(19, NaN));
  assert(g.play(19, 1)); assert.equal(g.board[27], 'black'); assert(!g.play(26, 1));
  g.update(1.5); assert.equal(g.board.filter(Boolean).length, 5);
  g.update(1.9); assert.equal(g.board.filter(Boolean).length, 6); assert.equal(g.turn, 'you');
  g.close(); assert(!g.play(26, 2));
  assert.equal(gameResult(Array<Disc>(64).fill('black')), 'you');
  assert.equal(gameResult(Array.from({length:64}, (_,i) => i%2 ? 'white' : 'black')), 'draw');
  const corner = Array<Disc>(64).fill('black'); corner[0] = ''; corner[2] = 'white';
  const snapshot = [...corner]; assert.equal(chooseGameMove(corner), 0); assert.deepEqual(corner, snapshot);
});
await test('complete offline Othello matches terminate with valid scores and automatic passes', () => {
  let passed = false;
  for (let seed = 1; seed <= 20; seed++) {
    const g = new BoardGame(() => (seed*13 % 97)/97); g.invite(); g.accept(); let now = 0, moves = 0;
    while (g.state === 'playing' && moves < 65) {
      const count = g.board.filter(Boolean).length;
      if (g.turn === 'you') { const legal = g.moves; assert(legal.length); assert(g.play(legal[(seed + moves*7) % legal.length], now)); }
      else g.update(now += 1);
      assert.equal(g.board.filter(Boolean).length, count + 1);
      if (g.notice) passed = true;
      moves++; now += 1;
    }
    assert.equal(g.state, 'finished'); assert(g.result); assert.equal(g.result, gameResult(g.board));
    assert.equal(g.score.you + g.score.him, g.board.filter(Boolean).length);
    g.accept(); assert.equal(g.board.filter(Boolean).length, 4); assert.equal(g.turn, 'you');
  }
  assert(passed, 'no match exercised a passed turn');
});
await test('he can offer Othello on the TV and removing the TV cancels it', () => {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  p.paused = true; for (let i = 0; i < 360; i++) p.update(1 / 120);
  p.mind.reset(p.ctx);
  const tv = tvAt(p, p.char.x + 160 * p.char.scale);
  for (let i = 0; i < 240; i++) p.update(1 / 120);
  p.paused = false; p.command('do:playgame');
  for (let i = 0; i < 1800 && p.game.state === 'closed'; i++) p.update(1 / 120);
  assert.equal(p.game.state, 'invite'); assert.equal(p.char.mode, 'sit'); assert(p.char.gamepad);
  assert(tv.on); assert.equal(tv.board, p.game.board);
  p.game.accept(); p.props.remove(tv); p.update(1 / 60);
  assert.equal(p.game.state, 'closed'); assert(!p.char.gamepad);
});
await test('he takes the couch near the TV from either side and faces it to play', () => {
  for (const side of [-1, 1]) {
    const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
    p.paused = true; for (let i = 0; i < 600; i++) p.update(1/120); p.mind.reset(p.ctx);
    const couch = p.props.spawn('couch', p.char.x + side * 120, bounds.floor - 56 * p.char.scale - 2, p.char.scale)!;
    const tv = tvAt(p, p.char.x + side * 300);
    for (let i = 0; i < 240; i++) p.update(1/120);
    p.paused = false; p.command('do:videogame');
    for (let i = 0; i < 1800 && !tv.arcade; i++) p.update(1/120);
    assert(tv.arcade); assert.equal(p.char.mode, 'sit');
    assert(Math.abs(p.char.x - couch.seatAt!.x) < 6 * p.char.scale, 'not on the couch');
    assert.equal(p.char.facing, Math.sign(tv.center.x - couch.center.x));
    assert(p.char.gamepad);
    p.command('do:playgame');
    for (let i = 0; i < 1800 && p.game.state === 'closed'; i++) p.update(1/120);
    assert.equal(p.game.state, 'invite'); p.game.accept(); for (let i = 0; i < 240; i++) p.update(1/120);
    assert.equal(tv.board, p.game.board, 'the board is not on the TV');
  }
});
await test('video games: controller in hand, his game on the TV, and it all switches off when he stops', () => {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  p.paused = true; for (let i = 0; i < 600; i++) p.update(1/120); p.mind.reset(p.ctx);
  const tv = tvAt(p, p.char.x + 200 * p.char.scale);
  for (let i = 0; i < 240; i++) p.update(1/120);
  p.paused = false; p.command('do:videogame');
  for (let i = 0; i < 1800 && !tv.arcade; i++) p.update(1/120);
  assert(tv.arcade, 'his game never came on'); assert(tv.on); assert(p.char.gamepad); assert.equal(p.char.mode, 'sit');
  assert.equal(p.char.facing, Math.sign(tv.center.x - p.char.x));
  const start = tv.arcade.time; for (let i = 0; i < 600; i++) p.update(1/120);
  assert(tv.arcade.time > start, 'the game is not running');
  p.mind.reset(p.ctx);
  assert(!tv.on); assert.equal(tv.arcade, null); assert(!p.char.gamepad);
});
await test('his runner game: good timing clears blocks, bad timing crashes, and beating his best is a record', () => {
  const run = (skill: number, seed: number) => {
    let s = seed; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const g = new Runner(skill, random), seen = { point: 0, crash: 0, record: 0 };
    for (let i = 0; i < 120 * 180; i++) for (const e of g.step(1 / 120)) seen[e]++;
    return seen;
  };
  const pro = run(1, 7); assert.equal(pro.crash, 0); assert(pro.point > 60);
  const rookie = run(0.2, 7); assert(rookie.crash >= 3, `only ${rookie.crash} crashes`); assert(rookie.record >= 1);
});
await test('flat prop art: filled boxes and shapes parse, bad colors are refused, and the drawing has bounds', () => {
  const def = parsePropDef({ type: 'prop', id: 'box', outline: [[0, 0], [20, 0], [20, 10], [0, 10]], shape: [
    { rect: [0, -6, 20, 16], radius: 4, fill: '#aabbcc' },
    { pts: [[0, 0], [10, -9], [20, 0]], fill: '#112233' },
    { rect: [0, 0, 5, 5], fill: 'red' },
    { pts: [[0, 0], [5, 5]], color: '#000000', width: 2 },
  ] })!;
  assert.equal(def.shape.length, 3);
  assert.deepEqual(def.shape[0].rect, [0, -6, 20, 16]); assert.equal(def.shape[0].width, 0);
  assert.equal(def.shape[1].fill, '#112233'); assert.equal(def.shape[2].width, 2);
  assert.deepEqual(def.bounds!.map((v) => Math.round(v)), [-2, -9, 20, 10]);
  const tv = parsePropDef(JSON.parse(fs.readFileSync('src/core/props/tv.json', 'utf8')))!;
  assert(!tv.sprite && tv.shape.every((st) => st.fill || st.width));
});
await test('on the couch he can sit up, lean back, face you, or lie along it with his feet toward the TV', () => {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  p.paused = true; for (let i = 0; i < 600; i++) p.update(1/120); p.mind.reset(p.ctx);
  const couch = p.props.spawn('couch', p.char.x, bounds.floor - 56 * p.char.scale - 2, p.char.scale)!;
  for (let i = 0; i < 240; i++) p.update(1/120);
  const at = couch.seatAt!, j = p.char.body.j;
  p.char.walkTo(at.x); for (let i = 0; i < 600 && Math.abs(p.char.x - at.x) > 4; i++) p.update(1/120);
  assert(p.char.sitOn(at, 1, 'lie')); for (let i = 0; i < 360; i++) p.update(1/120);
  assert.equal(p.char.mode, 'sit');
  assert(j.head.x < j.hip.x && j.footL.x > j.hip.x && j.footR.x > j.hip.x, 'not lying feet-first toward the way he faces');
  assert(Math.abs(j.hip.y - at.y) < 10 * p.char.scale && j.head.y < j.hip.y, 'not lying on the seat with his head propped up');
  p.char.standUp(); for (let i = 0; i < 240; i++) p.update(1/120);
  p.char.walkTo(at.x); for (let i = 0; i < 600 && Math.abs(p.char.x - at.x) > 4; i++) p.update(1/120);
  assert(p.char.sitOn(at, -1, 'front')); for (let i = 0; i < 240; i++) p.update(1/120);
  assert(Math.abs(Math.sin(p.char.yaw)) > 0.7, 'not turned out to face you');
  p.char.standUp(); for (let i = 0; i < 120; i++) p.update(1/120);
  assert.equal(p.char.seatStyle, 'up');
});
await test('items can be flat filled shapes, and boots mirror with his feet', () => {
  const def = parseItemDef({ id: 'cap', wear: 'head', shape: [{ pts: [[-5, 0], [0, -5], [5, 0]], fill: '#aabbcc' }, { pts: [[0, 0], [1, 1], [2, 0]], fill: 'blue' }, { pts: [[0, 0], [5, 0]] }] })!;
  assert.equal(def.shape.length, 2); assert.equal(def.shape[0].fill, '#aabbcc'); assert.equal(def.shape[0].width, 0);
  for (const id of ['helmet', 'boots', 'mace']) {
    const d = parseItemDef(JSON.parse(fs.readFileSync(`src/core/items/${id}.json`, 'utf8')))!;
    assert(!d.sprite && d.shape.some((st) => st.fill), `${id} isn't flat art`);
  }
});
await test('asymmetric furniture keeps its position through repeated save/load cycles', () => {
  let p = pet(); p.props.spawn('chair', 700, 700, p.char.scale);
  for (let i = 0; i < 10; i++) { const next = pet(); next.load(p.save()); p = next; }
  assert.equal(Math.round(p.props.placed[0].center.x), 700);
});
await test('chat and incidental AI plans leave the seated match running; an explicit activity interrupts', async () => {
  const p = pet(); p.paused = true; for (let i = 0; i < 600; i++) p.update(1/120); p.mind.reset(p.ctx);
  tvAt(p, p.char.x + 160 * p.char.scale);
  for (let i = 0; i < 240; i++) p.update(1/120);
  p.paused = false; p.command('do:playgame');
  for (let i = 0; i < 1800 && p.game.state === 'closed'; i++) p.update(1/120);
  assert.equal(p.game.state, 'invite'); p.game.accept();
  let request = '';
  p.brain.ask = async (req) => { request = req.messages.at(-1)!.text; return '{"say":"hi","plan":[{"do":"wave"}]}'; };
  p.command('hear:hello'); await advance(p);
  assert.equal(p.game.state, 'playing'); assert.equal(p.char.mode, 'sit'); assert.match(request, /game: Othello/);
  assert(p.brain.log.some((l) => l.who === 'him' && l.text === 'hi'));
  p.command('hear:please dance'); await advance(p);
  assert.equal(p.game.state, 'closed');
});
await test('helmet and boots equip, replace, drop and restore without using hands or belt slots', () => {
  const p = pet(); const slots = [...p.items.belt];
  const helmet = p.items.give('helmet', p.char)!, boots = p.items.give('boots', p.char)!;
  p.update(1/60);
  assert.equal(helmet.where, 'worn'); assert.equal(boots.where, 'worn'); assert.equal(boots.poses.length, 2);
  assert.deepEqual(p.items.belt, slots); assert.equal(p.items.inHand('R'), null);
  p.char.facing = -1; p.update(1/60); assert(boots.poses.every((pose) => pose.mirror));
  assert.equal(p.items.give('helmet', p.char), helmet);
  const alternative = {...helmet.def, id:'other-helmet'}; p.items.addDefs([alternative]);
  const replacement = p.items.give('other-helmet', p.char)!; assert.equal(helmet.where, 'world'); assert.equal(replacement.where, 'worn');
  p.command(`item:take:${boots.uid}`); assert.equal(boots.where, 'cursor');
  p.command(`item:return:${boots.uid}`); assert.equal(boots.where, 'worn');
  p.items.drop(boots, 0, 0);
  const restored = pet(); restored.items.addDefs([alternative]); restored.load(p.save());
  assert.equal(restored.items.list.find((i) => i.def.id === 'boots')?.where, 'world');
  assert.equal(restored.items.list.filter((i) => i.def.wear === 'head' && i.where === 'worn').length, 1);
});
await test('gear dropped from inventory is fetched and worn', () => {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  p.paused = true; for (let i = 0; i < 600; i++) p.update(1/120); p.mind.reset(p.ctx); p.paused = false;
  for (const id of ['helmet', 'boots']) {
    p.command(`item:spawn:${id}`);
    for (let i = 0; i < 3600 && !p.items.list.some((it) => it.def.id === id && it.where === 'worn'); i++) p.update(1/120);
    assert(p.items.list.some((it) => it.def.id === id && it.where === 'worn'), `${id} was not put on`);
  }
});
await test('custom sprites reject bad rows, palette colors and unbounded dimensions', () => {
  assert.equal(parseSprite({rows:['xx','x'],palette:{x:'#112233'}}), undefined);
  assert.equal(parseSprite({rows:['z'],palette:{x:'#112233'}}), undefined);
  assert.equal(parseSprite({rows:['x'],palette:{x:'red'}}), undefined);
  assert.equal(parseSprite({rows:['x'.repeat(129)],palette:{x:'#112233'}}), undefined);
  const s = parseSprite({rows:['x.'],palette:{x:'#112233'},x:Infinity,pixel:NaN})!;
  assert.equal(s.x, 0); assert.equal(s.pixel, 2);
});
await test('he paints with the pen, and the canvas picture survives saving', () => {
  const p = new Pet(bounds, { ...structuredClone(DEFAULT_CONFIG), destructible: false });
  p.paused = true; for (let i = 0; i < 360; i++) p.update(1 / 120);
  p.mind.reset(p.ctx);
  const canvas = p.props.spawn('canvas', p.char.x + 40 * p.char.scale, bounds.floor - 68 * p.char.scale - 2, p.char.scale)!;
  for (let i = 0; i < 240; i++) p.update(1 / 120);
  p.paused = false; p.command('do:paint');
  for (let i = 0; i < 3600 && !canvas.art; i++) p.update(1 / 120);
  assert(canvas.art, `painting never completed: ${p.mind.skill?.name}, ${p.char.mode}`);
  const save = p.save(), restored = new Pet(bounds); restored.load(save);
  assert.deepEqual(restored.props.placed.find((t) => t.def?.id === 'canvas')?.art, canvas.art);
});
await test('an untouched shipped example upgrades while a custom one is preserved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-example-'));
  try {
    const file = path.join(dir, 'pen.json'), original = { id: 'pen', length: 13 };
    fs.writeFileSync(file, JSON.stringify(original, null, 2)); assert(unchangedExample(file, [original]));
    fs.writeFileSync(file, JSON.stringify({ ...original, length: 25 })); assert(!unchangedExample(file, [original]));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
await test('standing in front of tall furniture never trips him (his neck used to land on the top edge)', () => {
  for (const id of ['canvas', 'tv']) {
    const p = pet(); p.paused = true; for (let i = 0; i < 240; i++) p.update(1/120);
    const t = p.props.spawn(id, 900, bounds.floor - 100, p.char.scale)!; for (let i = 0; i < 240; i++) p.update(1/120);
    let rag = 0, prev = p.char.mode;
    for (let k = 0; k < 4; k++) {
      p.char.walkTo(t.center.x + (k % 3 - 1) * 12);
      for (let i = 0; i < 600; i++) { p.update(1/120); if (p.char.mode === 'ragdoll' && prev !== 'ragdoll') rag++; prev = p.char.mode; }
    }
    assert.equal(rag, 0, `${id}: tripped ${rag} times`);
  }
});
await test('throwing one of his things never knocks your own cursor away', () => {
  for (const id of ['sword', 'mace', 'bouncy-ball', 'pen']) {
    const p = pet(); p.paused = true; for (let i = 0; i < 240; i++) p.update(1/120); p.paused = false;
    const it = p.items.give(id, p.char)!; const hits: string[] = [];
    const orig = p.mind.onEvent.bind(p.mind); p.mind.onEvent = (c, e) => { if (e.type === 'hitCursor') hits.push(e.type); orig(c, e); };
    const x = p.char.x + 300, y = bounds.floor - 200;
    p.cursor(x, y); p.command(`item:take:${it.uid}`); assert.equal(it.where, 'cursor');
    p.pointerDown(x, y, 0);
    for (let i = 0; i < 6; i++) { p.cursor(x + i * 15, y - i * 4, 1800, -500); p.update(1/120); }
    p.pointerUp(x + 90, y - 24);
    for (let i = 0; i < 240; i++) { p.cursor(x + 90 + i, y - 24, 120, 0); p.update(1/120); }
    assert.equal(it.where === 'cursor', false); assert.deepEqual(hits, [], `${id} knocked the cursor`);
  }
});
/** Him and his friend, standing a little apart on the floor. Fights are random: seed it so a test is repeatable. */
function duo(fightMode: 'play' | 'real' = 'play', seed = 7) {
  let st = seed >>> 0;
  Math.random = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cfg = { ...structuredClone(DEFAULT_CONFIG), destructible: true, fightMode };
  const a = new Pet(bounds, cfg), b = new Pet(bounds, friendConfig(cfg), { props: a.props });
  a.others = [b]; b.others = [a];
  b.char.body.translate(160, 0);
  a.paused = b.paused = true;
  for (let i = 0; i < 360; i++) { a.update(1/120); b.update(1/120); }
  a.mind.reset(a.ctx); b.mind.reset(b.ctx); a.paused = b.paused = false;
  const seen = { a: [] as string[], b: [] as string[] };
  for (const [p, list] of [[a, seen.a], [b, seen.b]] as const) {
    const orig = p.mind.onEvent.bind(p.mind);
    p.mind.onEvent = (c, e) => { if (e.type === 'hitByFriend') list.push(e.cut ? 'cut' : e.stabbed ? 'stab' : e.ko ? 'ko' : 'hit'); if (e.type === 'limbOff') list.push('limbOff'); if (e.type === 'tripped') list.push('down'); orig(c, e); };
  }
  const run = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 120 && !until?.(); i++) { a.update(1/120); b.update(1/120); } };
  return { a, b, seen, run };
}
const realRandom = Math.random;
await test('the second stick figure: own name and color, same mind mode; shares the furniture without saving it twice', () => {
  const { a, b } = duo();
  assert.equal(b.config.name, DEFAULT_CONFIG.friend.name); assert.equal(b.config.look.color, DEFAULT_CONFIG.friend.color); assert.equal(b.config.mind, a.config.mind);
  assert.equal(b.props, a.props); assert(!b.ownsProps);
  const odd = mergeConfig(DEFAULT_CONFIG, { friend: { color: 'red', name: '  ' }, fightMode: 'nuke' });
  assert.deepEqual(odd.friend, DEFAULT_CONFIG.friend); assert.equal(odd.fightMode, 'play');
  assert.equal(mergeConfig(DEFAULT_CONFIG, { friend: { on: false } }).friend.name, DEFAULT_CONFIG.friend.name);
  Math.random = realRandom;
  a.props.spawn('chair', 500, 600, a.char.scale);
  assert.equal(JSON.parse(a.save()).props.length, 1); assert.equal(JSON.parse(b.save()).props, undefined);
});
await test('a play fight: foam swords out the whole time, real moves, blocks and clashes, hits push them apart, and it ends in a knockout', () => {
  const { a, b, seen, run } = duo('play');
  a.command('do:duel'); run(0.5);
  assert.equal(a.mind.skill?.name, 'duel'); assert.equal(b.mind.skill?.name, 'duel', 'his friend never squared up');
  let pushedAway = 0, pushedToward = 0, faced = 0, backedOff = 0, frame = 0, armed = 0, fighting = 0, clashes = 0, blocks = 0;
  const moves = new Set<string>(), pending: { victim: Pet; before: number; away: number; at: number; hp: number }[] = [];
  for (const [victim, hitter] of [[a, b], [b, a]] as const) {
    const rc = victim.receive.bind(victim);
    victim.receive = (m, from) => {
      if (m.type === 'hit') pending.push({ victim, before: victim.char.x, away: Math.sign(victim.char.x - hitter.char.x), at: frame + 18, hp: victim.char.hp });
      if (m.type === 'clash') clashes++;
      if (m.type === 'blocked') blocks++;
      rc(m, from);
    };
  }
  const xs: number[] = [];
  run(120, () => {
    frame++;
    for (const h of pending.filter((q) => q.at === frame)) {
      if (h.victim.char.hp >= h.hp) continue; // blocked or parried: no knockback to judge
      const moved = h.victim.char.x - h.before;
      if (Math.sign(moved) === h.away) pushedAway++; else if (Math.abs(moved) > 2) pushedToward++;
    }
    xs.push(a.char.x);
    const m = a.char.attack?.name; if (m) moves.add(m);
    if (a.mind.skill?.name === 'duel' && frame > 240) { fighting++; if (a.items.list.some((it) => it.where === 'hand' && it.def.use === 'swing')) armed++; }
    // Stepping back mid-fight, he keeps facing his opponent.
    if (a.char.mode === 'ground' && a.mind.skill?.name === 'duel' && Math.abs((a.char as unknown as { rootVX: number }).rootVX) > 30) {
      const toward = Math.sign(b.char.x - a.char.x), moving = Math.sign((a.char as unknown as { rootVX: number }).rootVX);
      if (moving === -toward) { backedOff++; if (a.char.facing === toward) faced++; }
    }
    return a.mind.skill?.name !== 'duel' && b.mind.skill?.name !== 'duel';
  });
  assert(a.mind.skill?.name !== 'duel', 'the fight never ended');
  assert(seen.b.includes('hit') && seen.a.includes('hit'), `hits didn't land both ways: ${seen.a.join(',')} / ${seen.b.join(',')}`);
  assert([...seen.a, ...seen.b].includes('ko'), 'nobody got knocked out');
  const downs = [...seen.a, ...seen.b].filter((x) => x === 'down').length;
  assert(downs <= 5, `knocked over ${downs} times: they should mostly stay on their feet`);
  assert(armed / fighting > 0.85, `sword in hand only ${Math.round(armed / fighting * 100)}% of the fight`);
  assert(moves.size >= 3, `only these moves: ${[...moves].join(', ')}`);
  assert(clashes + blocks > 0, 'no blade ever met a blade');
  assert(pushedAway > pushedToward * 3, `hits pushed them the wrong way (${pushedAway} away, ${pushedToward} toward)`);
  assert(Math.max(...xs) - Math.min(...xs) > 120 * a.char.scale, 'they barely moved');
  if (backedOff > 10) assert(faced / backedOff > 0.9, `turned his back while backing off (${faced}/${backedOff})`);
  assert(![...seen.a, ...seen.b].some((x) => x === 'cut' || x === 'stab' || x === 'limbOff'), 'a play fight hurt someone');
  assert(![...a.items.list, ...b.items.list].some((it) => it.def.id === 'katana'), 'a katana came out in a play fight');
  assert.equal(a.char.fightPose, null); assert.equal(a.char.hp, 1, 'health not reset after the fight');
  Math.random = realRandom;
});
await test('a real fight: katanas in both hands, and it ends in a knockout, a lost limb or someone run through', () => {
  const { a, b, seen, run } = duo('real');
  a.command('do:duel');
  let twoHanded = false;
  // A rematch whenever a fight ends without anything serious (and both are on their feet, whole).
  run(150, () => {
    if (a.char.fightPose?.off === 'hilt') twoHanded = true;
    if (a.mind.skill?.name !== 'duel' && b.mind.skill?.name !== 'duel' && a.char.ready && b.char.ready && a.char.whole && b.char.whole) a.command('do:duel');
    return [...seen.a, ...seen.b].some((x) => x === 'cut' || x === 'stab' || x === 'ko');
  });
  assert(a.items.list.some((it) => it.def.id === 'katana'), 'he never drew a katana');
  assert(twoHanded, 'he never held the katana with both hands');
  assert([...seen.a, ...seen.b].some((x) => x === 'cut' || x === 'stab' || x === 'ko'), `nothing decided it: ${seen.a.join(',')} / ${seen.b.join(',')}`);
  Math.random = realRandom;
});
await test('figures only see each other through plain data: a fight works when every snapshot and message goes through JSON', () => {
  const { a, b, seen, run } = duo('play', 11);
  // Pretend each one is a separate app: the other end only ever gets JSON copies.
  const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const remote = (p: Pet): Peer => ({ view: () => wire(p.view()), receive: (m, from) => p.receive(wire(m), from) });
  const ra = remote(a), rb = remote(b);
  a.others = [rb]; b.others = [ra];
  const rcA = a.receive.bind(a), rcB = b.receive.bind(b);
  a.receive = (m, from) => rcA(m, from === a ? ra : rb); b.receive = (m, from) => rcB(m, from === b ? rb : ra);
  assert.deepEqual(wire(a.view()), a.view(), 'a snapshot changed going through JSON');
  a.command('do:duel');
  run(60, () => seen.a.includes('hit') && seen.b.includes('hit'));
  assert.equal(b.mind.skill?.name === 'duel' || seen.b.length > 0, true, 'the challenge never arrived');
  assert(seen.a.includes('hit') && seen.b.includes('hit'), `hits didn't cross: ${seen.a.join(',')} / ${seen.b.join(',')}`);
  Math.random = realRandom;
});
await test('furniture stays rigid when shaken hard, never sinks into the floor, and you can pick it up from the middle', () => {
  const p = pet(); p.paused = true;
  const tv = p.props.spawn('tv', 700, 600, p.char.scale)!;
  for (let i = 0; i < 240; i++) p.update(1 / 120);
  const rest = tv.sticks.map((st) => st.len), c = tv.center;
  p.cursor(c.x, c.y, 0, 0);
  assert(p.pointerDown(c.x, c.y, 0), 'pressing the middle of the TV did nothing');
  let worst = 0, sunk = 0;
  for (let i = 0; i < 360; i++) {
    const k = (i / 120) * 14, x = c.x + Math.cos(k) * 160, y = c.y - 140 + Math.sin(k * 1.3) * 120;
    p.cursor(x, y, -Math.sin(k) * 2240, Math.cos(k * 1.3) * 2000); p.pointerMove(x, y, -Math.sin(k) * 2240, Math.cos(k * 1.3) * 2000, i * 8); p.update(1 / 120);
    tv.sticks.forEach((st, n) => { worst = Math.max(worst, Math.abs(Math.hypot(st.a.x - st.b.x, st.a.y - st.b.y) - rest[n]) / rest[n]); });
    if (tv.points.some((q) => q.y > bounds.floor + 1)) sunk++;
  }
  // Held still: it hangs from where you grabbed it, so your cursor is still on it.
  const hold = { x: c.x, y: c.y - 150 };
  for (let i = 0; i < 240; i++) { p.cursor(hold.x, hold.y, 0, 0); p.pointerMove(hold.x, hold.y, 0, 0, 3000 + i * 8); p.update(1 / 120); }
  const still = tv.contains(hold.x, hold.y, 6);
  p.pointerUp(hold.x, hold.y);
  for (let i = 0; i < 360; i++) p.update(1 / 120);
  assert(worst < 0.02, `it stretched ${Math.round(worst * 100)}% while shaken`);
  assert.equal(sunk, 0, 'it went into the floor');
  assert(still, 'it slipped out from under the cursor');
  assert(tv.points.every((q) => q.y <= bounds.floor + 0.5), 'it ended up in the floor');
});
await test('walking toward each other, they step aside and pass instead of getting stuck', () => {
  const { a, b, run } = duo('play', 3);
  a.paused = b.paused = true;
  const ax = a.char.x, bx = b.char.x;
  a.char.walkTo(bx + 140); b.char.walkTo(ax - 140);
  run(10, () => !a.char.walking && !b.char.walking);
  assert(a.char.x > bx + 80 && b.char.x < ax - 80, `stuck: ${a.char.x.toFixed(0)} (from ${ax.toFixed(0)}), ${b.char.x.toFixed(0)} (from ${bx.toFixed(0)})`);
  Math.random = realRandom;
});
await test('two on the couch: side by side, and the TV stays on for whoever is still watching', () => {
  const { a, b, run } = duo('play', 5);
  a.props.spawn('couch', 560, 600, a.char.scale);
  const tv = a.props.spawn('tv', 560 + 240 * a.char.scale, 600, a.char.scale)!;
  run(2);
  a.command('do:watchtv'); run(7);
  b.command('do:watchtv'); run(9, () => !!a.char.seat && !!b.char.seat && Math.abs(a.char.seat.x - b.char.seat.x) > 15);
  assert(a.char.seat && b.char.seat, `not both on the couch: ${a.char.mode}/${a.mind.skill?.name} ${b.char.mode}/${b.mind.skill?.name}`);
  assert(Math.abs(a.char.seat.x - b.char.seat.x) > 15 * a.char.scale, 'they sat in the same spot');
  assert(tv.on, 'the TV is off');
  a.command('do:wander'); run(1.5);
  assert(tv.on, 'the TV went off while his friend was still watching');
  Math.random = realRandom;
});
await test('a high five: one asks, the other says yes, they meet in the middle, hands meet, and they like each other a bit more', () => {
  const { a, b, run } = duo('play', 3);
  a.ctx.feel.bond = b.ctx.feel.bond = 0.6;
  let met = Infinity;
  a.command('do:highfive');
  run(8, () => {
    const ta = a.mind.skill as { phase?: string } | null, tb = b.mind.skill as { phase?: string } | null;
    if (ta?.phase === 'do' && tb?.phase === 'do') {
      const ja = a.char.body.j, jb = b.char.body.j;
      for (const h of [ja.handL, ja.handR]) for (const k of [jb.handL, jb.handR]) met = Math.min(met, Math.hypot(h.x - k.x, h.y - k.y));
    }
    return a.mind.skill?.name !== 'together' && met < Infinity;
  });
  assert(met < 9 * a.char.scale, `their hands never met (closest ${met.toFixed(1)}px)`);
  assert(a.ctx.feel.bond > 0.6 && b.ctx.feel.bond > 0.6, `bond ${a.ctx.feel.bond} / ${b.ctx.feel.bond}`);
  Math.random = realRandom;
});
await test('a shoulder bump on purpose: he stumbles, takes it personally, and they like each other less', () => {
  const { a, b, run } = duo('play', 3);
  const before = b.ctx.feel.bond;
  let bumped = false;
  const orig = b.mind.onEvent.bind(b.mind); b.mind.onEvent = (c, e) => { if (e.type === 'bumped') bumped = true; orig(c, e); };
  a.command('do:bump');
  run(6, () => bumped);
  assert(bumped, 'never bumped him'); assert(b.ctx.feel.bond < before, 'he didn\'t mind');
  Math.random = realRandom;
});
await test('sleepy, he curls up next to his sleeping friend', () => {
  const { a, b, run } = duo('play', 3);
  b.command('do:sleep'); run(2);
  a.mood.s.energy = 0.2; a.command('do:naptogether'); run(8, () => a.char.mode === 'lie');
  assert.equal(a.char.mode, 'lie'); assert(Math.abs(a.char.x - b.char.x) < 45 * a.char.scale, `slept ${Math.abs(a.char.x - b.char.x).toFixed(0)}px away`);
  Math.random = realRandom;
});
await test('two-player video games: his friend grabs the other controller and the TV goes split screen', () => {
  const { a, b, run } = duo('play', 5);
  a.props.spawn('couch', 560, 600, a.char.scale);
  const tv = a.props.spawn('tv', 560 + 240 * a.char.scale, 600, a.char.scale)!;
  run(2);
  a.command('do:videogame'); run(8);
  b.command('do:jointv'); run(12, () => !!tv.arcade2);
  assert(tv.arcade && tv.arcade2, 'no second game'); assert.equal(tv.players.length, 2);
  Math.random = realRandom;
});
await test('arrows: shot at his friend they arc over and hit him; a sword held up to block knocks them aside', () => {
  const { a, b, seen, run } = duo('play', 3);
  a.paused = b.paused = true;
  b.char.body.translate(380, -10); b.char.mode = 'air'; run(1.5);
  const shootAt = () => {
    const n = a.char.body.j.neck, jb = b.char.body.j, t = { x: (jb.neck.x + jb.hip.x) / 2, y: (jb.neck.y + jb.hip.y) / 2 };
    const ang = aimAngle(t.x - n.x, n.y - t.y);
    a.ctx.shoot!(n.x + 20, n.y, Math.cos(ang) * ARROW_SPEED, -Math.sin(ang) * ARROW_SPEED, 'friend');
  };
  shootAt(); run(1.5);
  assert(seen.b.includes('hit'), `the arrow missed: ${seen.b.join(',')}`);
  // Now with his sword up across his chest.
  const sword = b.items.give('foam-sword', b.char)!; b.items.toHand(sword, b.char.facing > 0 ? 'R' : 'L');
  b.char.facing = -1; b.char.faceLock = -1;
  const hits = seen.b.length;
  for (let i = 0; i < 60; i++) { guardPose(b.ctx, sword, 'mid', true, false); b.update(1 / 120); a.update(1 / 120); }
  shootAt();
  run(1.5, () => { guardPose(b.ctx, sword, 'mid', true, false); return false; });
  assert.equal(seen.b.length, hits, 'the arrow went through his block');
  Math.random = realRandom;
});
await test('squaring up to your cursor: his friend comes to back him up', () => {
  const { a, b, run } = duo('play');
  a.cursor(a.char.x + 120, bounds.floor - 60);
  a.command('do:spar'); b.cursor(a.char.x + 120, bounds.floor - 60);
  run(0.5);
  assert(['spar', 'brawl'].includes(b.mind.skill?.name ?? ''), `friend is doing ${b.mind.skill?.name}`);
  Math.random = realRandom;
});
await test('a fast weapon swing registers the cursor between frames', () => {
  const item = new Item(BUILTIN_ITEMS.find((d) => d.id === 'sword')!);
  item.at = { x: 0, y: 0, z: 0 }; item.dir = { x: 1, y: 0, z: 0 }; item.measure(1 / 30);
  item.dir = { x: 0, y: 1, z: 0 }; item.measure(1 / 30);
  assert(item.distTo(15, 15) > 10); assert(item.sweptDistTo(15, 15) < 1);
});
await test('bad saved moves, pictures, positions and frame times cannot poison the pet', () => {
  const p = pet();
  p.load('{"moves":[null,{"name":"broken"}],"gallery":[null,{"shape":[null]}],"props":[{"id":"canvas","x":1e999}],"lessons":{"safeDrop":1e999}}');
  assert.equal(p.brain.savedMoves.length, 0); assert.equal(p.gallery.length, 0); assert.equal(p.props.placed.length, 0);
  const time = p.ctx.world.time; p.update(NaN); p.update(-1); assert.equal(p.ctx.world.time, time);
  p.update(1/60); assert(Number.isFinite(p.char.x));
});
console.log(`${passed} regression checks passed`);
