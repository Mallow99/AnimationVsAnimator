// A long, messy life for both stick figures, looking for bugs: furniture, windows, your cursor wandering
// around, you shaking furniture and throwing them about. It doesn't pass or fail on any one thing; it
// watches for trouble and reports it (with when, and the seed, so it can be replayed):
//   NaN anywhere; someone off screen; stuck in a mode (getting up forever, ragdoll for ages);
//   the same skill for minutes; walking but not getting anywhere (stalemates); standing inside each
//   other; sitting but not on the seat; furniture losing its shape, sinking into the floor, or off screen.
// Run: npm run soak            (5 minutes, seed 1)
//      SOAK_SECONDS=120 SOAK_SEED=4 npm run soak
import {companionConfig} from '../src/core/config';
import { Pet, DEFAULT_CONFIG, friendConfig } from '../src/core/pet';

const seconds = Number(process.env.SOAK_SECONDS ?? 300), seed = Number(process.env.SOAK_SEED ?? 1);
let st = seed * 2654435761 >>> 0;
Math.random = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const bounds = { left: 0, right: 1400, top: 0, floor: 800 };
const cfg = { ...structuredClone(DEFAULT_CONFIG), destructible: true };
const a = new Pet(bounds, cfg), b = new Pet(bounds, friendConfig(cfg), { props: a.props });
const count=Math.max(2,Math.min(5,Number(process.env.SOAK_FIGURES??2)));
const pets=[a,b];for(let id=2;id<count;id++)pets.push(new Pet(bounds,companionConfig(cfg,id),{props:a.props}));
for(const p of pets)p.others=pets.filter(other=>other!==p);
const wins = [{ id: 1, x: 120, y: 520, w: 360, h: 280 }, { id: 2, x: 900, y: 380, w: 420, h: 420 }];
for (const p of pets) p.setWindows(wins.map((w) => ({ ...w })));
for (const p of pets) p.onMoveWindow = (id, x, y) => { const w = wins.find((v) => v.id === id); if (w) { w.x = x; w.y = y; } for (const q of pets) q.setWindows(wins.map((v) => ({ ...v }))); };
a.props.spawn('couch', 640, 600, a.char.scale);
a.props.spawn('tv', 640 + 230 * a.char.scale, 600, a.char.scale);
a.props.spawn('chair', 300, 300, a.char.scale);
b.char.body.translate(200,0);for(let id=2;id<count;id++)pets[id].char.body.translate(100+id*190-pets[id].char.x,0);

const overlaps=new Map<string,number>();
const issues = new Map<string, { n: number; first: number; note: string }>();
const report = (key: string, t: number, note: string) => {
  const i = issues.get(key);
  if (i) i.n++; else issues.set(key, { n: 1, first: t, note });
};
const DT = 1 / 120;
let t = 0;
const track = pets.map(() => ({ mode: '', modeT: 0, skill: '', skillT: 0, walkFrom: 0, walkT: 0, overlapT: 0, offSeat: 0 }));
const rest = new Map<object, number[]>();
let shake: { thing: ReturnType<typeof a.props.thingAt>; until: number; x: number; y: number } | null = null;
const seenSkills = new Set<string>();
const starts = new Map<string, number>();
const socialWhy = new Map<string, number>();

for (let i = 0; i < seconds * 120; i++) {
  t += DT;
  // You: the cursor wanders now and then; sometimes you grab furniture and shake it hard, or poke one of them.
  if (i % 600 === 0) { const x = 100 + Math.random() * 1200, y = 250 + Math.random() * 500; for (const p of pets) p.cursor(x, y, 300, 0); }
  if (i % 2400 === 1200 && !shake) {
    const th = a.props.placed[Math.floor(Math.random() * a.props.placed.length)];
    if (th) {
      // Grab it somewhere in the middle, not at a corner.
      const c = th.center;
      a.cursor(c.x, c.y, 0, 0); a.pointerDown(c.x, c.y, 0);
      shake = { thing: th, until: t + 2.5, x: c.x, y: c.y };
    }
  }
  if (shake) {
    const k = t * 14, x = Math.max(20, Math.min(bounds.right - 20, shake.x + Math.cos(k) * 160)), y = shake.y - 120 + Math.sin(k * 1.3) * 110;
    a.cursor(x, y, -Math.sin(k) * 160 * 14, Math.cos(k * 1.3) * 110 * 18);
    a.pointerMove(x, y, -Math.sin(k) * 160 * 14, Math.cos(k * 1.3) * 110 * 18, t * 1000);
    if (t > shake.until) { a.pointerUp(x, y); shake = null; }
  }
  if (process.env.SOAK_PROBE && Math.abs(t - Number(process.env.SOAK_PROBE)) < DT / 2) {
    for (const p of pets) {
      const ch = p.char as unknown as Record<string, unknown>;
      console.log(p.config.name, 'legs', p.char.legCount, 'ghost', [...p.char.body.ghost].join(','), 'missing', [...p.char.missing.keys()].join(','), ['rootX','rootVX','goalX','crouch','slide','windup','fightVX','jumpPrep','gesture','support','handTarget','stoopNow'].map((k) => `${k}=${JSON.stringify(ch[k])}`).join(' '));
      console.log(p.config.name, p.mind.skill?.name, p.char.mode, 'hip', p.char.body.j.hip.x.toFixed(0), p.char.body.j.hip.y.toFixed(0), 'seat', JSON.stringify(ch.seat), 'support', p.char.support, 'why', p.mind.why);
    }
    for (const p of pets) for (const [l, piece] of p.char.missing) console.log(' ', p.config.name, 'missing', l, 'at', piece.points.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(' '), 'held', piece.heldBy, 'reattach phase', (p.mind.skill as unknown as { phase?: string })?.phase);
    for (const th of a.props.placed) console.log(' ', th.def!.id, 'center', th.center.x.toFixed(0), th.center.y.toFixed(0), 'tilt', th.tilt.toFixed(2), 'held', !!th.held, 'sitters', JSON.stringify([...th.sitters]), 'seat', JSON.stringify(th.seatAt));
  }
  if (process.env.SOAK_SOCIAL && i % 240 === 0) {
    const f = b.view(), fh = f.joints.hip!, hip = a.char.body.j.hip;
    const k = [Math.abs(fh.y - hip.y) < 40 * a.char.scale ? '' : 'level', f.mode === 'ground' ? '' : 'fmode:' + f.mode, f.busy ? 'busy:' + f.doing : '', a.char.mode !== 'ground' ? 'mymode:' + a.char.mode : '', a.mind.skill ? 'doing:' + a.mind.skill.name : ''].filter(Boolean).join(' ') || 'FREE';
    socialWhy.set(k.split(' ')[0], (socialWhy.get(k.split(' ')[0]) ?? 0) + 1);
  }
  try { for (const p of pets) p.update(DT); }
  catch (err) { report('exception', t, String((err as Error).stack ?? err).split('\n').slice(0, 3).join(' | ')); break; }

  pets.forEach((p, k) => {
    const ch = p.char, j = ch.body.j, tr = track[k], name = p.config.name;
    const other=pets.filter(other=>other!==p).sort((a,b)=>Math.abs(a.char.x-ch.x)-Math.abs(b.char.x-ch.x))[0];
    const sk = p.mind.skill?.name ?? '-';
    seenSkills.add(sk);
    if (sk !== tr.skill) starts.set(sk, (starts.get(sk) ?? 0) + 1);
    if (Object.values(j).some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) report(`${name}: NaN joint`, t, `mode=${ch.mode} skill=${sk}`);
    if (j.hip.x < bounds.left - 10 || j.hip.x > bounds.right + 10 || j.hip.y > bounds.floor + 10 || j.hip.y < -200) report(`${name}: off screen`, t, `hip=${j.hip.x.toFixed(0)},${j.hip.y.toFixed(0)} mode=${ch.mode}`);
    if (ch.mode !== tr.mode) { tr.mode = ch.mode; tr.modeT = t; }
    const inMode = t - tr.modeT;
    if (ch.mode === 'getup' && inMode > 4) report(`${name}: stuck getting up`, t, `skill=${sk}`);
    if (ch.mode === 'ragdoll' && inMode > 14 && !ch.stayDown) report(`${name}: ragdoll for ages`, t, `skill=${sk}`);
    if (ch.mode === 'air' && inMode > 6) report(`${name}: in the air for ages`, t, `hip=${j.hip.x.toFixed(0)},${j.hip.y.toFixed(0)} skill=${sk}`);
    if (sk !== tr.skill) { tr.skill = sk; tr.skillT = t; }
    const long = ['watchtv', 'sitdown', 'read', 'videogame'].includes(sk) ? 2400 : ['sleep', 'watch', 'videogame', 'playgame', 'sit', 'lounge', 'paint', 'duel'].includes(sk) ? 150 : 70;
    if (sk !== '-' && t - tr.skillT > long) report(`${name}: same skill for ${long}s+ (${sk})`, t, `mode=${ch.mode}`);
    // Walking without getting anywhere.
    if (ch.walking && ch.mode === 'ground') {
      if (tr.walkT === 0) { tr.walkT = t; tr.walkFrom = ch.x; }
      else if (t - tr.walkT > 3) { if (Math.abs(ch.x - tr.walkFrom) < 6) report(`${name}: walking but stuck${Math.abs(ch.x - other.char.x) < 30 * ch.scale ? ' (blocked by the other one)' : ''}`, t, `x=${ch.x.toFixed(0)} goal=${(ch as unknown as { goalX: number }).goalX?.toFixed(0)} skill=${sk} other at ${other.char.x.toFixed(0)} (${other.mind.skill?.name})`); tr.walkT = t; tr.walkFrom = ch.x; }
    } else tr.walkT = 0;
    // Sitting, but not on the seat.
    const seat = (ch as unknown as { seat: { x: number; y: number } | null }).seat;
    // (For more than half a second: sitting down, his hips take a moment to get there.)
    tr.offSeat = ch.mode === 'sit' && seat && Math.hypot(j.hip.x - seat.x, j.hip.y - seat.y) > 18 * ch.scale ? tr.offSeat + DT : 0;
    if (seat && tr.offSeat > 0.5) report(`${name}: sitting off the seat`, t, `off=${Math.hypot(j.hip.x - seat.x, j.hip.y - seat.y).toFixed(0)} skill=${sk} hip=${j.hip.x.toFixed(0)},${j.hip.y.toFixed(0)} seat=${seat.x.toFixed(0)},${seat.y.toFixed(0)} other=${other.char.mode}/${other.mind.skill?.name}`);
  });
  // Check every pair for sustained overlap, including the additional figures.
  for(let ai=0;ai<pets.length;ai++)for(let bi=ai+1;bi<pets.length;bi++){
    const a=pets[ai],b=pets[bi],ha=a.char.body.j.hip,hb=b.char.body.j.hip;
    const close=Math.abs(ha.x-hb.x)<10*a.char.scale && Math.abs(ha.y-hb.y)<20 && Math.abs(ha.z-hb.z)<12 && a.char.mode==='ground' && b.char.mode==='ground';
    const key=`${ai}-${bi}`,value=close?(overlaps.get(key)??0)+DT:0;overlaps.set(key,value);
    if(value>2){report(`standing inside each other (${a.config.name}/${b.config.name})`,t,`${a.mind.skill?.name}/${b.mind.skill?.name}`);overlaps.set(key,0);}
  }
  // Furniture keeps its shape, stays out of the floor and on screen.
  for (const th of a.props.things) {
    if (th.kind === 'bridge') continue;
    const base = rest.get(th) ?? (rest.set(th, th.sticks.map((s) => s.len)), rest.get(th)!);
    let worst = 0;
    th.sticks.forEach((s, n) => { const l = Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y); worst = Math.max(worst, Math.abs(l - base[n]) / (base[n] || 1)); });
    const name = th.def?.id ?? th.kind;
    if (worst > 0.08) report(`${name}: lost its shape`, t, `${Math.round(worst * 100)}% stretched${shake?.thing === th ? ' (being shaken)' : ''}`);
    if (th.points.some((q) => q.y > bounds.floor + 3)) report(`${name}: into the floor`, t, shake?.thing === th ? 'being shaken' : '');
    if (th.points.some((q) => q.x < bounds.left - 40 || q.x > bounds.right + 40 || q.y < -300)) report(`${name}: off screen`, t, '');
    if (th.points.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) report(`${name}: NaN`, t, '');
  }
}

console.log(`soak: ${seconds}s, seed ${seed}, ${count} figures. They did: ${[...starts].filter(([s]) => s !== '-').sort((x, y) => y[1] - x[1]).map(([s, n]) => `${s}×${n}`).join(', ')}. Bond: ${a.ctx.feel.bond.toFixed(2)} / ${b.ctx.feel.bond.toFixed(2)}`);
if (process.env.SOAK_SOCIAL) console.log('social blockers:', JSON.stringify([...socialWhy].sort((x, y) => y[1] - x[1])));
if (!issues.size) console.log('no trouble seen');
for (const [k, i] of [...issues].sort((x, y) => y[1].n - x[1].n)) console.log(`  ${k}: ${i.n}x, first at ${i.first.toFixed(1)}s  ${i.note}`);

if(issues.size)process.exitCode=1;
