// Drawing. Uses only the standard HTML canvas API, so it works in Electron,
// a normal browser, and (later) an Android WebView.

import type { Character } from './character';
import type { LooseLimb } from './limbs';
import { drawPixelText, FONT_HEIGHT, textWidth, wrapPixelText } from './pixelfont';

/** How he looks. Edited from the settings / presets. */
export interface Look {
  color: string;
  lineWidth: number;  // limb thickness (before scaling)
  headSize: number;   // 1 = normal
  pixel: number;      // 1 = smooth; 2+ = pixel-art with pixels this many screen points wide
  showJoints: boolean;
  /** A dark outline around him, like a sprite in a pixel-art game. */
  outline: boolean;
}

export const DEFAULT_LOOK: Look = { color: '#4450d6', lineWidth: 7, headSize: 1.25, pixel: 2, showJoints: false, outline: false };

/** Darken (amount < 0) or lighten a #rrggbb color. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawCharacter(ctx: Ctx2D, c: Character, look: Look) {
  // Smooth style with an outline: draw him once fatter and darker underneath.
  if (look.outline && look.pixel <= 1) drawCharacter(ctx, c, { ...look, outline: false, color: shade(look.color, -0.7), lineWidth: look.lineWidth + 3 });
  const j = c.body.j, sc = c.scale;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = look.lineWidth * sc;

  const path = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  // He's 3D: draw the parts furthest from you first, so nearer limbs pass in front.
  // Parts behind his body get a shade darker, so he reads with depth from any angle.
  const torsoZ = (j.neck.z + j.hip.z) / 2, depthRange = 5 * sc;
  const colorAt = (z: number) => shade(look.color, -0.22 * Math.min(1, Math.max(0, (torsoZ - z) / depthRange)));
  const parts: { z: number; draw: () => void }[] = [];
  const ghost = c.body.ghost;
  const limb = (pts: { x: number; y: number; z: number }[]) => {
    if (pts.some((p) => ghost.has(nameOf(c, p)))) return; // that limb came off
    const z = pts.slice(1).reduce((a, p) => a + p.z, 0) / (pts.length - 1);
    parts.push({ z, draw: () => { ctx.strokeStyle = colorAt(z); path(pts); } });
  };
  limb([j.hip, j.kneeL, j.footL]);
  limb([j.hip, j.kneeR, j.footR]);
  limb([j.neck, j.elbowL, j.handL]);
  limb([j.neck, j.elbowR, j.handR]);
  parts.push({ z: torsoZ, draw: () => { ctx.strokeStyle = look.color; path([j.head, j.neck, j.hip]); } });
  parts.push({ z: j.head.z + 0.01, draw: () => {
    ctx.fillStyle = colorAt(j.head.z);
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, c.d.headR, 0, Math.PI * 2);
    ctx.fill();
  } });
  parts.sort((a, b) => a.z - b.z);
  for (const p of parts) p.draw();

  if (look.showJoints) {
    ctx.fillStyle = '#fff';
    for (const p of c.body.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function nameOf(c: Character, p: object) {
  for (const [n, q] of Object.entries(c.body.j)) if (q === p) return n as keyof typeof c.body.j;
  return 'hip';
}

/** A limb that came off: drawn like the rest of him, shaded by how far back it is. */
export function drawLooseLimb(ctx: Ctx2D, piece: LooseLimb, look: Look, scale: number) {
  const [a, b, c] = piece.points;
  ctx.save();
  ctx.globalAlpha *= piece.fade;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = look.lineWidth * scale;
  ctx.strokeStyle = shade(look.color, -0.22 * Math.min(1, Math.max(0, -((a.z + b.z + c.z) / 3) / (5 * scale))));
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  ctx.restore();
}

/**
 * Pixel-art mode: draw him onto a tiny canvas (one pixel per "art pixel"),
 * snap every pixel to fully on or off, then blow it up without smoothing.
 * The physics stays smooth; only the drawing is chunky.
 */
export class PixelLayer {
  private cv: OffscreenCanvas | null = null;

  /** Draw him (and any limbs he's lost) as pixel art. */
  draw(ctx: CanvasRenderingContext2D, c: Character, look: Look) {
    const p = Math.max(2, Math.round(look.pixel));
    const thick = { ...look, lineWidth: Math.max(look.lineWidth, (1.5 * p) / c.scale) };
    this.paint(ctx, c.body.points, c.d.headR + look.lineWidth * c.scale + p * 3, look, (g) => drawCharacter(g, c, thick));
    for (const piece of c.loosePieces) this.paint(ctx, piece.points, look.lineWidth * c.scale + p * 3, look, (g) => drawLooseLimb(g, piece, thick, c.scale));
  }

  /**
   * Draw anything (around `pts`) onto a tiny canvas (one pixel per "art pixel"),
   * snap every pixel to fully on or off, then blow it up without smoothing.
   */
  paint(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], pad: number, look: Look, drawIt: (g: OffscreenCanvasRenderingContext2D) => void) {
    const p = Math.max(2, Math.round(look.pixel));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pts) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
    // Snap to the pixel grid so the pixels don't shimmer as he moves.
    const x0 = Math.floor((minX - pad) / p) * p, y0 = Math.floor((minY - pad) / p) * p;
    const w = Math.ceil((maxX + pad - x0) / p), h = Math.ceil((maxY + pad - y0) / p);
    if (w <= 0 || h <= 0 || w > 4000 || h > 4000) return;
    if (!this.cv || this.cv.width < w || this.cv.height < h) this.cv = new OffscreenCanvas(Math.max(w, 64, this.cv?.width ?? 0), Math.max(h, 64, this.cv?.height ?? 0));
    const g = this.cv.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(1 / p, 0, 0, 1 / p, -x0 / p, -y0 / p);
    drawIt(g);
    const img = g.getImageData(0, 0, w, h), a = img.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 110 ? 255 : 0;
    if (look.outline) {
      // Any empty pixel touching him becomes outline.
      const n = parseInt(shade(look.color, -0.7).slice(1), 16), solid = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) solid[i] = a[i * 4 + 3] ? 1 : 0;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const i = yy * w + xx;
        if (solid[i]) continue;
        if ((xx > 0 && solid[i - 1]) || (xx < w - 1 && solid[i + 1]) || (yy > 0 && solid[i - w]) || (yy < h - 1 && solid[i + w])) {
          a[i * 4] = n >> 16; a[i * 4 + 1] = (n >> 8) & 255; a[i * 4 + 2] = n & 255; a[i * 4 + 3] = 255;
        }
      }
    }
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

/**
 * The indie version of his speech bubble: chunky pixels, a pixel font, stepped
 * corners and a stepped tail. `shown` = how many letters have appeared so far
 * (they type out one by one). `p` = screen size of one pixel.
 */
export function drawPixelBubble(ctx: CanvasRenderingContext2D, c: Character, text: string, shown: number, alpha: number, b: { left: number; right: number; top: number }, p: number, ink: string) {
  const head = c.body.j.head, sc = c.scale;
  const lines = wrapPixelText(text, 100);
  // Lay out the full text so the bubble doesn't grow while typing.
  const wText = Math.max(...lines.map(textWidth), 7);
  const lineH = FONT_HEIGHT + 4;
  const padX = 4, padY = 3;
  const wPx = wText + padX * 2, hPx = lines.length * lineH - 3 + padY * 2;
  const W = wPx * p, H = hPx * p;
  const snap = (v: number) => Math.round(v / p) * p;
  const tipX = head.x, tipY = head.y - c.d.headR - 5 * sc;
  const x = snap(Math.min(Math.max(tipX - W / 2, b.left + 4), b.right - W - 4));
  const y = snap(Math.max(tipY - 4 * p - H, b.top + 4));
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  // Outline, then fill, with the corner pixels knocked out.
  const box = (inset: number, color: string) => {
    ctx.fillStyle = color;
    const i = inset * p;
    ctx.fillRect(x + i + p, y + i, W - 2 * i - 2 * p, H - 2 * i);
    ctx.fillRect(x + i, y + i + p, W - 2 * i, H - 2 * i - 2 * p);
  };
  box(0, ink);
  box(1, '#ffffff');
  // Stepped tail pointing at his head.
  const tx = snap(Math.min(Math.max(tipX, x + 4 * p), x + W - 5 * p));
  ctx.fillStyle = ink;
  ctx.fillRect(tx - 2 * p, y + H - p, 5 * p, p);
  ctx.fillRect(tx - p, y + H, 3 * p, p);
  ctx.fillRect(tx, y + H + p, p, p);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tx - p, y + H - p, 3 * p, p);
  ctx.fillRect(tx, y + H, p, p);
  // The letters typed so far.
  ctx.fillStyle = '#1b1d2e';
  let left = Math.floor(shown);
  lines.forEach((line, i) => {
    if (left <= 0) return;
    const part = line.slice(0, left);
    left -= line.length + 1;
    drawPixelText(ctx, part, x + padX * p, y + (padY + i * lineH) * p, p);
  });
  ctx.restore();
}

/** Sparks when a limb snaps off or clicks back on: bright pixel squares that fly out and fall. */
export interface Spark { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string }

export function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], p: number) {
  ctx.save();
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, 1 - s.t / s.life);
    ctx.fillStyle = s.color;
    const size = Math.max(p, 2);
    ctx.fillRect(Math.round(s.x / p) * p - size / 2, Math.round(s.y / p) * p - size / 2, size, size);
  }
  ctx.restore();
}

/** Little puffs of dust (landings, crashes): pixel squares that drift and fade. */
export interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number }

export function drawPuffs(ctx: CanvasRenderingContext2D, puffs: Puff[], p: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  for (const f of puffs) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life) * 0.8;
    const s = Math.max(p, Math.round((f.size * (1 - f.t / f.life * 0.5)) / p) * p);
    ctx.fillRect(Math.round(f.x / p) * p - s / 2, Math.round(f.y / p) * p - s / 2, s, s);
  }
  ctx.restore();
}
