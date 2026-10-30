import assert from 'node:assert/strict';
import { Pet } from '../src/core/pet';
import { DEFAULT_CONFIG, companionConfig } from '../src/core/config';
import { QUICK_ACTIVITY_IDS } from '../src/shared/activity';
import { activitySnapshot, requestActivity } from '../src/app/activity-requests';
import { activitiesFor } from '../src/app/activities';

let seed = 89;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const dt = 1 / 120;
const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
function pets(count = 1) {
  const config = { ...structuredClone(DEFAULT_CONFIG), windows: false, dailyRhythm: false, destructible: false, mind: 'offline' as const };
  const first = new Pet(bounds, config, { identity: 'activity-0' });
  const all = [first, ...Array.from({ length: count - 1 }, (_, i) => new Pet(bounds, companionConfig(config, i + 1), { props: first.props, identity: `activity-${i + 1}` }))];
  for (const [i, p] of all.entries()) {
    p.paused = true;
    p.mood.asleep = false;
    p.mind.holdUntil = Infinity;
    p.char.placeHome(330 + i * 220);
  }
  for (let i = 0; i < 600; i++) for (const p of all) p.update(dt);
  for (const p of all) { p.paused = false; p.others = all.filter(q => q !== p); }
  return all;
}
const choice = (p: Pet, id: string) => activitySnapshot(p).choices.find(c => c.id === id)!;
let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log('PASS ' + name); }

test('quick controls share all eight labels and requirements with the full catalog, without simulation randomness', () => {
  const [p] = pets();
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('Availability consumed simulation randomness'); };
    const snapshot = activitySnapshot(p), catalog = activitiesFor(p);
    assert.deepEqual(snapshot.choices.map(c => c.id), [...QUICK_ACTIVITY_IDS]);
    for (const c of snapshot.choices) {
      const full = catalog.find(a => a.command === c.id)!;
      assert.equal(c.label, full.label); assert.equal(c.needs, full.needs);
    }
  } finally { Math.random = random; }
});

test('missing supplies and stale requirements reject without replacing the current activity or creating objects', () => {
  const [p] = pets();
  assert.match(choice(p, 'handheld').needs!, /handheld/i);
  const active = p.mind.activeSkill, before = p.items.list.map(i => i.uid);
  assert.equal(requestActivity(p, 'handheld').accepted, false);
  assert.deepEqual(p.items.list.map(i => i.uid), before); assert.equal(p.mind.activeSkill, active);
  const handheld = p.items.give('handheld', p.char)!;
  assert.equal(choice(p, 'handheld').needs, undefined);
  p.takeItem(handheld);
  assert.equal(requestActivity(p, 'handheld').accepted, false);
  assert.equal(p.items.list.filter(i => i.def.id === 'handheld').length, 1);
  assert.equal(p.items.list.find(i => i.uid === handheld.uid), handheld);
});

test('explicit reading can supply the first book, while a cursor-carried original prevents cloning', () => {
  const [p] = pets();
  for (const item of [...p.items.list]) if (item.def.id === 'book') p.items.remove(item);
  assert.equal(choice(p, 'read').needs, undefined);
  assert.equal(requestActivity(p, 'read').accepted, true);
  assert.equal(activitySnapshot(p).current.state, 'starting');
  p.update(dt);
  const book = p.items.list.find(i => i.def.id === 'book')!;
  assert(book);
  book.bookmark = 17;
  p.takeItem(book);
  assert.match(choice(p, 'read').needs!, /book/i);
  const response = requestActivity(p, 'read');
  assert.equal(response.accepted, false);
  assert.equal(book.bookmark, 17);
  assert.deepEqual(p.items.list.filter(i => i.def.id === 'book').map(i => i.uid), [book.uid]);
});

test('sleeping, held and airborne buddies expose their actual blocker and keep requests inert', () => {
  const [p] = pets();
  p.mood.asleep = true;
  assert.match(choice(p, 'dance').needs!, /wake/i);
  assert.equal(requestActivity(p, 'dance').accepted, false);
  assert.equal(p.mood.asleep, true);
  p.mood.asleep = false;
  p.char.grab('neck', p.char.body.j.neck.x, p.char.body.j.neck.y);
  assert.match(choice(p, 'dance').needs!, /put.*down/i);
  assert.equal(requestActivity(p, 'dance').accepted, false);
  p.char.release(); p.char.mode = 'air';
  assert.match(choice(p, 'dance').needs!, /stand or sit/i);
  assert.equal(requestActivity(p, 'dance').accepted, false);
});

test('TV and peer availability update the same catalog used by Settings and actual requests', () => {
  const [p, friend] = pets(2);
  assert.match(choice(p, 'watchtv').needs!, /TV/);
  p.props.spawn('tv', 900, 650, 1);
  assert.equal(choice(p, 'watchtv').needs, undefined);
  assert.equal(choice(p, 'duel').needs, undefined);
  friend.mood.asleep = true;
  assert.match(choice(p, 'duel').needs!, /free and awake/);
  assert.equal(requestActivity(p, 'duel').accepted, false);
  friend.mood.asleep = false;
  assert.equal(requestActivity(p, 'duel').accepted, true);
});

test('acceptance says requested and queued, then the current activity follows the actual running skill', () => {
  const [p] = pets();
  const result = requestActivity(p, 'dance');
  assert.equal(result.accepted, true); assert.match(result.message, /requested/);
  assert.equal(activitySnapshot(p).current.state, 'starting');
  p.update(dt);
  assert.equal(activitySnapshot(p).current.state, 'running');
  assert.equal(activitySnapshot(p).current.label, 'Dancing');
  p.mind.reset(p.ctx);
  assert.equal(activitySnapshot(p).current.state, 'resting');
});

test('an actual command refusal remains rejected even when preflight requirements were satisfied', () => {
  const [p] = pets();
  assert.equal(choice(p, 'dance').needs, undefined);
  const command = p.mind.command;
  let attempts = 0;
  p.mind.command = () => { attempts++; return false; };
  try {
    const result = requestActivity(p, 'dance');
    assert.equal(attempts, 1); assert.equal(result.accepted, false);
    assert.match(result.message, /cannot start/); assert(!result.message.includes('requested'));
  } finally { p.mind.command = command; }
});

test('unknown commands and paused figures are rejected without command or inventory side effects', () => {
  const [p] = pets();
  const before = p.items.list.map(i => i.uid);
  assert.deepEqual(requestActivity(p, 'item:give:book'), { accepted: false, message: 'That activity is unavailable.' });
  p.paused = true;
  assert.equal(requestActivity(p, 'read').accepted, false);
  assert.equal(p.mind.activeSkill, null);
  assert.deepEqual(p.items.list.map(i => i.uid), before);
});
console.log(`All ${passed} activity request checks passed.`);
