// Drawing. Uses only the standard HTML canvas API, so it works in Electron,
// a normal browser, and (later) an Android WebView.

import type { Character } from './character';

/** How he looks. Edited from the settings / presets. */
export interface Look {
  color: string;
  lineWidth: number;  // limb thickness (before scaling)
  headSize: number;   // 1 = normal
  pixel: number;      // 1 = smooth; 2+ = pixel-art with pixels this many screen points wide
  showJoints: boolean;
}

export const DEFAULT_LOOK: Look = { color: '#4450d6', lineWidth: 7, headSize: 1.25, pixel: 2, showJoints: false };

/** Darken (amount < 0) or lighten a #rrggbb color. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawCharacter(ctx: Ctx2D, c: Character, look: Look) {
  const j = c.body.j, sc = c.scale;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = look.lineWidth * sc;

  const path = (...pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  // Back limbs first, a shade darker, so the figure reads with depth.
  const back = c.turnF > 0 ? 'L' : 'R', front = c.turnF > 0 ? 'R' : 'L';
  ctx.strokeStyle = shade(look.color, -0.22);
  path(j.hip, j[`knee${back}`], j[`foot${back}`]);
  path(j.neck, j[`elbow${back}`], j[`hand${back}`]);
  ctx.strokeStyle = look.color;
  ctx.fillStyle = look.color;
  path(j.head, j.neck, j.hip);
  path(j.hip, j[`knee${front}`], j[`foot${front}`]);
  path(j.neck, j[`elbow${front}`], j[`hand${front}`]);

  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, c.d.headR, 0, Math.PI * 2);
  ctx.fill();

  if (look.showJoints) {
    ctx.fillStyle = '#fff';
    for (const p of c.body.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/**
 * Pixel-art mode: draw him onto a tiny canvas (one pixel per "art pixel"),
 * snap every pixel to fully on or off, then blow it up without smoothing.
 * The physics stays smooth; only the drawing is chunky.
 */
export class PixelLayer {
  private cv: OffscreenCanvas | null = null;

  draw(ctx: CanvasRenderingContext2D, c: Character, look: Look) {
    const p = Math.max(2, Math.round(look.pixel));
    const pad = c.d.headR + look.lineWidth * c.scale + p * 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of c.body.points) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
    // Snap to the pixel grid so the pixels don't shimmer as he moves.
    const x0 = Math.floor((minX - pad) / p) * p, y0 = Math.floor((minY - pad) / p) * p;
    const w = Math.ceil((maxX + pad - x0) / p), h = Math.ceil((maxY + pad - y0) / p);
    if (!this.cv || this.cv.width < w || this.cv.height < h) this.cv = new OffscreenCanvas(Math.max(w, 64), Math.max(h, 64));
    const g = this.cv.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(1 / p, 0, 0, 1 / p, -x0 / p, -y0 / p);
    // Keep limbs at least ~1.5 art-pixels thick so they don't break up.
    drawCharacter(g, c, { ...look, lineWidth: Math.max(look.lineWidth, (1.5 * p) / c.scale) });
    const img = g.getImageData(0, 0, w, h), a = img.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 110 ? 255 : 0;
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cv, 0, 0, w, h, x0, y0, w * p, h * p);
    ctx.restore();
  }
}

/** A speech bubble above his head, kept on screen. */
export function drawBubble(ctx: CanvasRenderingContext2D, c: Character, text: string, alpha: number, b: { left: number; right: number; top: number }) {
  const head = c.body.j.head, sc = c.scale;
  const short = text.length <= 3; // emotes like "!" or "♥" get a smaller bubble
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = `${short ? 600 : 500} ${short ? 15 : 13}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padX = short ? 7 : 9, h = short ? 24 : 26;
  const w = Math.max(ctx.measureText(text).width + padX * 2, h);
  const tipX = head.x, tipY = head.y - c.d.headR - 5 * sc;
  const x = Math.min(Math.max(tipX - w / 2, b.left + 4), b.right - w - 4);
  const y = Math.max(tipY - 8 - h, b.top + 4);

  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  // little tail pointing at his head
  const tx = Math.min(Math.max(tipX, x + 10), x + w - 10);
  ctx.beginPath();
  ctx.moveTo(tx - 5, y + h - 0.5); ctx.lineTo(tx, y + h + 7); ctx.lineTo(tx + 5, y + h - 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}
