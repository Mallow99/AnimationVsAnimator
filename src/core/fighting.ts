// What each kind of hit does to whoever it lands on. Shared by both figures (and, later, by figures in
// different apps), so a hit means the same thing whoever throws it.
import type { AttackKind } from './character';

/** Sword moves (see skills/swordplay.ts). */
export type SwordKind = 'cut' | 'thrust' | 'rising' | 'heavy' | 'spin' | 'flurry' | 'dash' | 'aircut';
/** What kind of hit landed: a fist or a foot, a sword move, any swung thing, something thrown. */
export type HitKind = AttackKind | SwordKind | 'slash' | 'thrown' | 'arrow' | 'bullet';

/**
 * push: px/s away from the hitter. up: px/s (negative = up). launch: the whole body flies (he recovers in
 * the air and lands on his feet unless `down`). down: knocked off his feet. stun: seconds before he can
 * act. dmg: health it takes (a fight starts at 1). poise: balance it takes (at 0 he staggers, wide open).
 * Blocked, a hit takes no health but some poise (more for heavy ones), so a turtle eventually cracks.
 */
export const HITS: Record<HitKind, { push: number; up: number; launch: boolean; down: boolean; stun: number; dmg: number; poise: number }> = {
  jab: { push: 220, up: 0, launch: false, down: false, stun: 0.2, dmg: 0.03, poise: 0.08 },
  cross: { push: 380, up: 0, launch: false, down: false, stun: 0.3, dmg: 0.05, poise: 0.14 },
  swat: { push: 300, up: 0, launch: false, down: false, stun: 0.26, dmg: 0.03, poise: 0.1 },
  kick: { push: 360, up: 0, launch: false, down: false, stun: 0.28, dmg: 0.05, poise: 0.14 },
  frontkick: { push: 720, up: -60, launch: false, down: false, stun: 0.42, dmg: 0.06, poise: 0.3 },
  roundhouse: { push: 520, up: -300, launch: true, down: false, stun: 0.55, dmg: 0.08, poise: 0.3 },
  uppercut: { push: 160, up: -700, launch: true, down: false, stun: 0.6, dmg: 0.08, poise: 0.3 },
  sweep: { push: 120, up: -240, launch: true, down: true, stun: 0.9, dmg: 0.05, poise: 0.2 },
  air: { push: 420, up: -200, launch: true, down: false, stun: 0.5, dmg: 0.06, poise: 0.2 },
  cut: { push: 380, up: -40, launch: false, down: false, stun: 0.34, dmg: 0.11, poise: 0.2 },
  thrust: { push: 560, up: 0, launch: false, down: false, stun: 0.36, dmg: 0.13, poise: 0.22 },
  rising: { push: 260, up: -640, launch: true, down: false, stun: 0.6, dmg: 0.12, poise: 0.3 },
  heavy: { push: 600, up: -120, launch: false, down: false, stun: 0.5, dmg: 0.18, poise: 0.55 },
  spin: { push: 640, up: -260, launch: true, down: false, stun: 0.5, dmg: 0.14, poise: 0.35 },
  flurry: { push: 180, up: 0, launch: false, down: false, stun: 0.22, dmg: 0.05, poise: 0.1 },
  dash: { push: 300, up: -80, launch: false, down: false, stun: 0.55, dmg: 0.16, poise: 0.35 },
  aircut: { push: 380, up: 120, launch: false, down: false, stun: 0.45, dmg: 0.15, poise: 0.4 },
  slash: { push: 440, up: -60, launch: false, down: false, stun: 0.36, dmg: 0.1, poise: 0.2 },
  thrown: { push: 300, up: -80, launch: false, down: false, stun: 0.3, dmg: 0.05, poise: 0.12 },
  bullet: { push: 330, up: -80, launch: false, down: false, stun: 0.26, dmg: 0.09, poise: 0.18 },
  arrow: { push: 240, up: -40, launch: false, down: false, stun: 0.3, dmg: 0.1, poise: 0.12 },
};

/** Where each attack comes in (what height a block has to be at to stop it). */
export const HIT_HEIGHT: Record<string, 'high' | 'mid' | 'low'> = {
  cut: 'mid', thrust: 'mid', flurry: 'mid', spin: 'mid', dash: 'mid', slash: 'mid', heavy: 'high', aircut: 'high', rising: 'low', sweep: 'low',
  jab: 'mid', punch: 'mid', cross: 'mid', swat: 'mid', kick: 'mid', uppercut: 'mid', frontkick: 'mid', highkick: 'high', roundhouse: 'high', air: 'high', thrown: 'mid', arrow: 'mid', bullet: 'mid', gun: 'mid', shoot: 'mid',
};

/** Closest distance between segments ab and cd (in x, y): do two blades cross? */
export function segDist(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const cross = (o: typeof a, p: typeof a, q: typeof a) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const pt = (p: typeof a, s: typeof a, e: typeof a) => {
    const dx = e.x - s.x, dy = e.y - s.y, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / l));
    return Math.hypot(p.x - s.x - dx * t, p.y - s.y - dy * t);
  };
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

/** Which of his joints (bones, really) is at x, y, within `pad`, in a snapshot of him. Null = a miss. */
export function viewHitTest(v: { joints: Partial<Record<string, { x: number; y: number }>>; headR: number }, x: number, y: number, pad: number): string | null {
  const j = v.joints, h = j.head;
  if (h && Math.hypot(x - h.x, y - h.y) < v.headR + pad) return 'head';
  const bones: [string, string][] = [
    ['neck', 'hip'], ['neck', 'elbowL'], ['elbowL', 'handL'], ['neck', 'elbowR'], ['elbowR', 'handR'],
    ['hip', 'kneeL'], ['kneeL', 'footL'], ['hip', 'kneeR'], ['kneeR', 'footR'], ['head', 'neck'],
  ];
  let best: string | null = null, bestD = pad;
  for (const [a, b] of bones) {
    const p = j[a], q = j[b];
    if (!p || !q) continue;
    const dx = q.x - p.x, dy = q.y - p.y, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l));
    const d = Math.hypot(x - p.x - dx * t, y - p.y - dy * t);
    if (d < bestD) { bestD = d; best = t > 0.5 ? b : a; }
  }
  return best;
}
