import type { Doodle } from "./doodles";
import type { Vec } from "./math";

/** Clip each line segment against a local circular eraser, preserving both sides of crossing strokes. */
export function eraseStrokes(
  strokes: Vec[][],
  at: Vec,
  radius: number,
): Vec[][] {
  const out: Vec[][] = [];
  for (const stroke of strokes) {
    let run: Vec[] = [];
    const flush = () => {
      if (run.length > 1) out.push(run);
      run = [];
    };
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1],
        b = stroke[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const A = dx * dx + dy * dy,
        B = 2 * ((a.x - at.x) * dx + (a.y - at.y) * dy);
      const C = (a.x - at.x) ** 2 + (a.y - at.y) ** 2 - radius ** 2;
      const disc = B * B - 4 * A * C;
      const cuts = [0, 1];
      if (A > 0 && disc >= 0)
        for (const t of [
          (-B - Math.sqrt(disc)) / (2 * A),
          (-B + Math.sqrt(disc)) / (2 * A),
        ])
          if (t > 0 && t < 1) cuts.push(t);
      cuts.sort((x, y) => x - y);
      const point = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t });
      for (let j = 1; j < cuts.length; j++) {
        const mid = point((cuts[j - 1] + cuts[j]) / 2);
        if (Math.hypot(mid.x - at.x, mid.y - at.y) < radius) {
          flush();
          continue;
        }
        const start = point(cuts[j - 1]),
          end = point(cuts[j]);
        if (!run.length) run.push(start);
        run.push(end);
      }
    }
    flush();
  }
  return out;
}
export function wipeDoodles(
  doodles: Doodle[],
  from: Vec,
  to: Vec,
  radius = 14,
) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius / 2)),
  );
  for (let i = 0; i <= steps; i++) {
    const at = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    };
    for (const d of doodles)
      if (!d.alive) d.strokes = eraseStrokes(d.strokes, at, radius);
  }
}
