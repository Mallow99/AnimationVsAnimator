// Turning the windows on your screen into things he can stand on.
//
// The desktop shell reports every window's rectangle, front-most first.
// A window's top edge is a platform — but only the parts of it you can actually
// see. If another window in front covers part of that edge, he can't stand there.

import type { Bounds, Platform } from './physics';

export interface WinRect { id: number; x: number; y: number; w: number; h: number }

/** Visible top edges of the windows (front-most first), as platforms. */
export function windowPlatforms(wins: WinRect[], bounds: Bounds, minWidth = 40): Platform[] {
  const out: Platform[] = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const y = w.y;
    // Ignore tops that are off-screen, glued to the very top (maximized windows), or at the floor.
    if (y < bounds.top + 30 || y > bounds.floor - 20) continue;
    let segs: [number, number][] = [[Math.max(w.x, bounds.left), Math.min(w.x + w.w, bounds.right)]];
    // Cut out the parts covered by windows in front of this one.
    for (let k = 0; k < i && segs.length; k++) {
      const f = wins[k];
      if (y < f.y - 2 || y > f.y + f.h) continue; // the front window doesn't cover this height
      const a = f.x, b = f.x + f.w;
      segs = segs.flatMap(([s, e]): [number, number][] => {
        if (b <= s || a >= e) return [[s, e]];
        const parts: [number, number][] = [];
        if (a > s) parts.push([s, a]);
        if (b < e) parts.push([b, e]);
        return parts;
      });
    }
    // Give each visible piece a stable id: window id * 8 + piece number.
    segs.forEach(([s, e], n) => { if (e - s >= minWidth) out.push({ id: w.id * 8 + n, x1: s, x2: e, y, win: w.id, wx: w.x }); });
  }
  return out;
}

/** The highest surface directly below (x, y): a platform's y, or the floor. */
export function surfaceBelow(x: number, y: number, platforms: Platform[], floor: number): { y: number; id: number } {
  let best = { y: floor, id: -1 };
  for (const p of platforms) if (x >= p.x1 && x <= p.x2 && p.y >= y && p.y < best.y) best = { y: p.y, id: p.id };
  return best;
}
