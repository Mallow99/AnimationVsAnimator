// Doodles: little drawings he makes on your screen with his own pen.
// Each shape is a few strokes in a box from -0.5 to 0.5 (y points down).

import type { Vec } from './math';

/** What a drawing turns into when it comes to life (Animator vs. Animation style). */
export type Becomes = 'ball' | 'box' | 'platform' | 'item';

export interface Doodle {
  strokes: Vec[][]; color: string; born: number; done: boolean;
  /** The whole picture (box -0.5..0.5) and what it's of, for his gallery. */
  shape?: Vec[][]; title?: string;
  /** It comes to life when it's finished. */
  becomes?: Becomes;
  /** Where it was drawn: center and size in pixels (so it can turn into a real thing right there). */
  cx?: number; cy?: number; size?: number;
  /** It came to life: the drawing is now part of a real object (drawn by that object, not here). */
  alive?: boolean;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 18): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });

export const SHAPES: Record<string, Vec[][]> = {
  heart: [Array.from({ length: 33 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    return { x: (16 * Math.sin(t) ** 3) / 34, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34 };
  })],
  smiley: [arc(0, 0, 0.45, 0, Math.PI * 2, 24), [{ x: -0.15, y: -0.15 }, { x: -0.15, y: -0.05 }], [{ x: 0.15, y: -0.15 }, { x: 0.15, y: -0.05 }], arc(0, 0.02, 0.25, 0.3, Math.PI - 0.3, 10)],
  star: [Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI * 4) / 5; return { x: Math.cos(a) * 0.48, y: Math.sin(a) * 0.48 }; })],
  stickman: [arc(0, -0.33, 0.12, 0, Math.PI * 2, 12), [{ x: 0, y: -0.21 }, { x: 0, y: 0.15 }], [{ x: -0.22, y: -0.02 }, { x: 0, y: -0.12 }, { x: 0.22, y: -0.02 }], [{ x: -0.18, y: 0.48 }, { x: 0, y: 0.15 }, { x: 0.18, y: 0.48 }]],
  house: [[{ x: -0.35, y: 0.45 }, { x: -0.35, y: -0.05 }, { x: 0.35, y: -0.05 }, { x: 0.35, y: 0.45 }, { x: -0.35, y: 0.45 }], [{ x: -0.45, y: 0 }, { x: 0, y: -0.45 }, { x: 0.45, y: 0 }], [{ x: -0.08, y: 0.45 }, { x: -0.08, y: 0.2 }, { x: 0.08, y: 0.2 }, { x: 0.08, y: 0.45 }]],
  hi: [[{ x: -0.3, y: -0.4 }, { x: -0.3, y: 0.4 }], [{ x: -0.3, y: 0.05 }, { x: -0.05, y: 0.0 }, { x: -0.05, y: 0.4 }], [{ x: 0.25, y: -0.05 }, { x: 0.25, y: 0.4 }], [{ x: 0.25, y: -0.3 }, { x: 0.25, y: -0.24 }]],
  sun: [arc(0, 0, 0.22, 0, Math.PI * 2, 16), ...Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return [{ x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3 }, { x: Math.cos(a) * 0.48, y: Math.sin(a) * 0.48 }]; })],
};

/** Things he draws to bring to life (not part of his random doodles). */
export const LIVE_SHAPES: Record<string, Vec[][]> = {
  ball: [arc(0, 0, 0.45, 0, Math.PI * 2, 24), arc(0, 0.9, 0.75, -Math.PI * 0.68, -Math.PI * 0.32, 8)],
  box: [[{ x: -0.45, y: -0.45 }, { x: 0.45, y: -0.45 }, { x: 0.45, y: 0.45 }, { x: -0.45, y: 0.45 }, { x: -0.45, y: -0.45 }], [{ x: -0.45, y: -0.45 }, { x: 0.45, y: 0.45 }], [{ x: 0.45, y: -0.45 }, { x: -0.45, y: 0.45 }]],
  platform: [[{ x: -0.5, y: -0.05 }, { x: 0.5, y: -0.05 }, { x: 0.5, y: 0.06 }, { x: -0.5, y: 0.06 }, { x: -0.5, y: -0.05 }], [{ x: -0.3, y: -0.05 }, { x: -0.3, y: 0.06 }], [{ x: 0.1, y: -0.05 }, { x: 0.1, y: 0.06 }]],
  sword: [[{ x: 0, y: 0.5 }, { x: 0, y: 0.28 }], [{ x: -0.13, y: 0.28 }, { x: 0.13, y: 0.28 }], [{ x: -0.05, y: 0.28 }, { x: -0.05, y: -0.4 }, { x: 0, y: -0.5 }, { x: 0.05, y: -0.4 }, { x: 0.05, y: 0.28 }]],
};

/** Doodles fade out after this many seconds. */
export const DOODLE_LIFE = 150;

export function drawDoodles(ctx: CanvasRenderingContext2D, doodles: Doodle[], now: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  for (const d of doodles) {
    if (d.alive) continue;
    const age = now - d.born;
    ctx.globalAlpha = Math.max(0, Math.min(1, (DOODLE_LIFE - age) / 10));
    ctx.strokeStyle = d.color;
    for (const s of d.strokes) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
