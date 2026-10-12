// Repeatable unattended observation, separate from scripted feature acceptance.
import { writeFileSync } from 'node:fs';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
import { checkSanity } from '../src/core/sanity';

const inputSeed = Number(process.env.LIFE_SEED ?? 32);
const seconds = Number(process.env.LIFE_SECONDS ?? 900);
if (!Number.isInteger(inputSeed) || !Number.isFinite(seconds) || seconds < 60 || seconds > 7200)
  throw new Error('Use an integer LIFE_SEED and LIFE_SECONDS from 60 to 7200.');
let random = inputSeed;
Math.random = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0) / 4294967296;
const cfg = {
  ...structuredClone(DEFAULT_CONFIG),
  windows: false,
  dailyRhythm: false,
  destructible: false,
  inkLifetime: 0,
};
const bounds = { left: 0, right: 1500, top: 0, floor: 800 };
const first = new Pet(bounds, cfg, { identity: 'pet-0' });
const pets = [
  first,
  ...[1, 2, 3, 4].map(
    (id) =>
      new Pet(bounds, companionConfig(cfg, id), { props: first.props, identity: `pet-${id}` }),
  ),
];
const samples = pets.map((p) => ({
  name: p.config.name,
  counts: {} as Record<string, number>,
  modes: {} as Record<string, number>,
  activityChanges: 0,
  movingSeconds: 0,
  speech: 0,
  maxSeatedIdleSeconds: 0,
}));
const stalled = pets.map(() => 0),
  previous = pets.map(() => ''),
  issues = new Set<string>();
for (const [i, p] of pets.entries()) {
  p.char.placeHome(220 + i * 230);
  p.others = pets.filter((q) => q !== p);
  for (const id of ['book', 'cup', 'dumbbell', 'handheld', 'bouncy-ball']) p.items.give(id, p.char);
  const say = p.ctx.say;
  p.ctx.say = (text, secs) => {
    samples[i].speech++;
    say(text, secs);
  };
}
for (const [id, x] of [
  ['couch', 600],
  ['tv', 1000],
  ['bookshelf', 1250],
  ['desk', 250],
  ['canvas', 120],
  ['scooter', 1400],
] as const)
  first.props.spawn(id, x, 740, 1);
let audits = 0;
for (let frame = 0; frame < seconds * 30; frame++) {
  for (const p of pets) p.update(1 / 30);
  if (frame % 30 !== 0) continue;
  for (const [i, p] of pets.entries()) {
    const sample = samples[i],
      doing = p.mind.activeSkill?.name ?? 'none';
    sample.counts[doing] = (sample.counts[doing] ?? 0) + 1;
    sample.modes[p.char.mode] = (sample.modes[p.char.mode] ?? 0) + 1;
    if (previous[i] !== doing) sample.activityChanges++;
    previous[i] = doing;
    if (p.char.walking) sample.movingSeconds++;
    const quiet = p.char.mode === 'sit' && p.mind.idle && !p.mood.asleep;
    stalled[i] = quiet ? stalled[i] + 1 : 0;
    sample.maxSeatedIdleSeconds = Math.max(sample.maxSeatedIdleSeconds, stalled[i]);
  }
  for (const issue of checkSanity(pets)) issues.add(issue);
  audits++;
}
const report = {
  seed: inputSeed,
  seconds,
  fps: 30,
  fixture:
    '5 preset figures; couch, TV, bookshelf, desk, canvas, scooter; owned books/cups/dumbbells/handhelds/balls; offline, cursor absent',
  audits,
  counts: samples,
  sanity: [...issues],
};
const path = `.build/pet-life-${inputSeed}.json`;
writeFileSync(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Unattended observation: ' + path);
if (issues.size) process.exitCode = 1;
