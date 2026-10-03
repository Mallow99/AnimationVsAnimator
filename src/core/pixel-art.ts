// Small, editable pixel sprites. A dot is transparent; palette keys are single characters.
import type { Ctx2D } from './render';

export interface PixelSprite {
  rows: string[];
  palette: Record<string, string>;
  pixel: number;
  x: number;
  y: number;
}

export function parseSprite(raw: unknown): PixelSprite | undefined {
  if (!raw || typeof raw !== 'object') return;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.rows) || !o.rows.length || o.rows.length > 128 ||
      !o.rows.every((r) => typeof r === 'string' && r.length > 0 && r.length <= 128 && r.length === (o.rows as string[])[0].length)) return;
  if (!o.palette || typeof o.palette !== 'object') return;
  const palette: Record<string, string> = Object.create(null);
  for (const [key, color] of Object.entries(o.palette)) {
    if (key.length === 1 && key !== '.' && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) palette[key] = color;
  }
  if (!(o.rows as string[]).every((row) => [...row].every((key) => key === '.' || Object.hasOwn(palette, key)))) return;
  const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return { rows: o.rows as string[], palette, pixel: num(o.pixel, 2, 0.5, 4), x: num(o.x, 0, -200, 400), y: num(o.y, 0, -200, 400) };
}

/** Paint in local coordinates; callers supply the object's frame. Horizontal runs keep it cheap. */
export function drawSprite(ctx: Ctx2D, sprite: PixelSprite) {
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const key = row[x], start = x++;
      while (x < row.length && row[x] === key) x++;
      if (key === '.') continue;
      ctx.fillStyle = sprite.palette[key];
      ctx.fillRect(sprite.x + start * sprite.pixel, sprite.y + y * sprite.pixel, (x - start) * sprite.pixel, sprite.pixel);
    }
  });
}
