// Focused regression checks for saves, AI failures, definitions and window attachments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { mergeConfig } from '../src/core/config';
import { parseItemDef } from '../src/core/items';
import { parsePropDef, makeBridge } from '../src/core/props';
import { WindowAccess } from '../src/core/window-access';
import { writeAtomic } from '../src/electron/storage';

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
console.log(`${passed} regression checks passed`);
