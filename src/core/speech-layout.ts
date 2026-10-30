export interface SpeechRect { x: number; y: number; w: number; h: number }
export function overlaps(a: SpeechRect, b: SpeechRect, gap = 8): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Stable priority, bounded search, and no moving the figures to make room for text. */
export function placeSpeech(rects: SpeechRect[], width: number, height: number): SpeechRect[] {
  const placed: SpeechRect[] = [];
  for (const preferred of rects) {
    const w = Math.min(preferred.w, Math.max(1, width - 16)), h = Math.min(preferred.h, Math.max(1, height - 16));
    let best: SpeechRect | undefined, bestCost = Infinity;
    for (let row = 0; row < 10; row++) for (const shift of [0, -1, 1, -2, 2]) {
      const candidate = { x: Math.max(8, Math.min(width - w - 8, preferred.x + shift * (w + 10))), y: Math.max(8, Math.min(height - h - 8, preferred.y - row * (h + 12))), w, h };
      const collisions = placed.filter(other => overlaps(candidate, other)).length;
      const cost = collisions * 1e7 + Math.abs(candidate.x - preferred.x) + Math.abs(candidate.y - preferred.y) * 1.5;
      if (cost < bestCost) { bestCost = cost; best = candidate; }
      if (collisions === 0 && row === 0 && shift === 0) break;
    }
    placed.push(best!);
  }
  return placed;
}
