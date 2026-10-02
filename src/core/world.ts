// Turning the windows on your screen into things he can stand on.
//
// The desktop shell reports every window's rectangle, front-most first.
// A window's top edge is a platform — but only the parts of it you can actually
// see. If another window in front covers part of that edge, he can't stand there.

import type { Bounds, Platform } from './physics';

export interface WinRect { id: number; x: number; y: number; w: number; h: number }

/** Visible top edges of the windows (front-most first), as platforms. */
/** `headroom`: how tall he is — a window top closer than that to the top of the screen has no room to stand on. */
export function windowPlatforms(wins: WinRect[], bounds: Bounds, minWidth = 40, headroom = 30): Platform[] {
  const out: Platform[] = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const y = w.y;
    // Ignore tops that are off-screen, glued to the very top (maximized windows), or at the floor.
    if (y < bounds.top + headroom || y > bounds.floor - 20) continue;
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

/**
 * A vertical surface he can climb: a window's side, or the edge of the screen.
 * `face` is the way he faces while climbing it (toward the wall).
 * `top` says what's at the top: a window top to pull himself onto, or the ceiling (top of the screen).
 */
export interface Wall { id: number; x: number; y1: number; y2: number; face: 1 | -1; top: 'platform' | 'ceiling'; win?: number }

/** Climbable walls: the two screen edges, plus the visible sides of each window. */
export function windowWalls(wins: WinRect[], bounds: Bounds, headroom = 30): Wall[] {
  const out: Wall[] = [
    { id: -10, x: bounds.left, y1: bounds.top, y2: bounds.floor, face: -1, top: 'ceiling' },
    { id: -11, x: bounds.right, y1: bounds.top, y2: bounds.floor, face: 1, top: 'ceiling' },
  ];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    if (w.y < bounds.top + headroom) continue; // no room to stand on top
    for (const [x, face, n] of [[w.x, 1, 0], [w.x + w.w, -1, 1]] as const) {
      if (x <= bounds.left + 4 || x >= bounds.right - 4) continue;
      let segs: [number, number][] = [[w.y, Math.min(w.y + w.h, bounds.floor)]];
      // Parts of this side hidden behind windows in front can't be climbed.
      for (let k = 0; k < i && segs.length; k++) {
        const f = wins[k];
        if (x < f.x || x > f.x + f.w) continue;
        segs = segs.flatMap(([a, b]): [number, number][] => {
          if (f.y + f.h <= a || f.y >= b) return [[a, b]];
          const parts: [number, number][] = [];
          if (f.y > a) parts.push([a, f.y]);
          if (f.y + f.h < b) parts.push([f.y + f.h, b]);
          return parts;
        });
      }
      // Only the piece that reaches the window's top lets him pull himself up.
      const s = segs.find(([a]) => a <= w.y + 1);
      if (s && s[1] - s[0] > 40) out.push({ id: w.id * 8 + 4 + n, x, y1: s[0], y2: s[1], face, top: 'platform', win: w.id });
    }
  }
  return out;
}

/**
 * Every visible side of every window, at any height (for pushing, kicking and knocking on them).
 * Unlike `windowWalls` (for climbing), big windows right under the menu bar count too, and a side
 * doesn't need to reach the window's top.
 */
export function windowSides(wins: WinRect[], bounds: Bounds): Wall[] {
  const out: Wall[] = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    for (const [x, face, n] of [[w.x, 1, 0], [w.x + w.w, -1, 1]] as const) {
      if (x <= bounds.left + 4 || x >= bounds.right - 4) continue;
      let segs: [number, number][] = [[Math.max(w.y, bounds.top), Math.min(w.y + w.h, bounds.floor)]];
      for (let k = 0; k < i && segs.length; k++) {
        const f = wins[k];
        if (x < f.x || x > f.x + f.w) continue;
        segs = segs.flatMap(([a, b]): [number, number][] => {
          if (f.y + f.h <= a || f.y >= b) return [[a, b]];
          const parts: [number, number][] = [];
          if (f.y > a) parts.push([a, f.y]);
          if (f.y + f.h < b) parts.push([f.y + f.h, b]);
          return parts;
        });
      }
      segs.forEach(([a, b], m) => { if (b - a > 20) out.push({ id: w.id * 64 + 32 + n * 8 + m, x, y1: a, y2: b, face, top: 'platform', win: w.id }); });
    }
  }
  return out;
}
