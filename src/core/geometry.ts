import type { Vec } from './math';

export function segmentDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const u = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - dx * u, p.y - a.y - dy * u);
}

export function polygonDistance(p: Vec, polygon: Vec[]) {
  let inside = false,
    distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
    distance = Math.min(distance, segmentDistance(p, a, b));
  }
  return inside ? 0 : distance;
}

export function convexHull(points: Vec[]) {
  const sorted = points
    .filter((p) => Number.isFinite(p.x + p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (p, i) => !i || p.x !== sorted[i - 1].x || p.y !== sorted[i - 1].y,
  );
  if (unique.length < 3) return unique;
  const cross = (a: Vec, b: Vec, c: Vec) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (ps: Vec[]) => {
    const out: Vec[] = [];
    for (const p of ps) {
      while (
        out.length > 1 &&
        cross(out[out.length - 2], out[out.length - 1], p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(unique), ...half([...unique].reverse())];
}

/** Smallest translation that separates convex A from B, including fully contained shapes. */
export function overlapOffset(a: Vec[], b: Vec[]): Vec | null {
  if (a.length < 3 || b.length < 3) return null;
  const bounds = (ps: Vec[]) => ({
    left: Math.min(...ps.map((p) => p.x)),
    right: Math.max(...ps.map((p) => p.x)),
    top: Math.min(...ps.map((p) => p.y)),
    bottom: Math.max(...ps.map((p) => p.y)),
  });
  const ab = bounds(a),
    bb = bounds(b);
  if (
    ab.right <= bb.left ||
    ab.left >= bb.right ||
    ab.bottom <= bb.top ||
    ab.top >= bb.bottom
  )
    return null;
  let best: Vec | null = null,
    minimum = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        dx = q.x - p.x,
        dy = q.y - p.y,
        len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = -dy / len,
        ny = dx / len;
      const ap = a.map((v) => v.x * nx + v.y * ny),
        bp = b.map((v) => v.x * nx + v.y * ny);
      const positive = Math.max(...bp) - Math.min(...ap),
        negative = Math.max(...ap) - Math.min(...bp);
      if (positive <= 0 || negative <= 0) return null;
      const move = positive < negative ? positive : -negative;
      if (Math.abs(move) < minimum) {
        minimum = Math.abs(move);
        best = { x: nx * move, y: ny * move };
      }
    }
  return best;
}

/** Add stroke thickness to a collision contour without changing the drawing. */
export function paddedVertices(points: [number, number][], width = 0): Vec[] {
  const r = width / 2;
  return points.flatMap(([x, y]) =>
    r > 0
      ? [
          { x: x - r, y: y - r },
          { x: x + r, y: y - r },
          { x: x + r, y: y + r },
          { x: x - r, y: y + r },
        ]
      : [{ x, y }],
  );
}
