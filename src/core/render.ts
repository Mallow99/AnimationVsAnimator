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

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Something drawn as part of him, in depth order with his limbs (his belt, things in his hands). */
export interface DepthPart { z: number; draw: (g: Ctx2D) => void; pts?: { x: number; y: number }[] }

export function drawCharacter(ctx: Ctx2D, c: Character, look: Look, extras: DepthPart[] = []) {
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
  // Accessories can change stroke width, alpha or transforms. Isolate each one so
  // limbs drawn after it retain the figure's look in every pose/depth order.
  for (const e of extras) parts.push({ z: e.z, draw: () => {
    ctx.save();
    try { e.draw(ctx); } finally { ctx.restore(); }
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
  private smallFrames = 0;
  private outlineMask = new Uint8Array(0);

  /** Draw him (with his belt and anything in his hands, and any limbs he's lost) as pixel art. */
  draw(ctx: CanvasRenderingContext2D, c: Character, look: Look, extras: DepthPart[] = []) {
    const p = Math.max(2, Math.round(look.pixel));
    const thick = { ...look, lineWidth: Math.max(look.lineWidth, (1.5 * p) / c.scale) };
    const pts = [...c.body.points, ...extras.flatMap((e) => e.pts ?? [])];
    this.paint(ctx, pts, c.d.headR + look.lineWidth * c.scale + p * 3, look, (g) => drawCharacter(g, c, thick, extras));
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
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    // Offscreen limbs/throws must not allocate a desktop-sized pixel workspace. Respect the
    // caller's scale/translation (including Retina); keep one art pixel outside the viewport.
    const transform = ctx.getTransform();
    if (transform.a > 0 && transform.d > 0 && !transform.b && !transform.c) {
      minX = Math.max(minX, -transform.e / transform.a - p);
      minY = Math.max(minY, -transform.f / transform.d - p);
      maxX = Math.min(maxX, (ctx.canvas.width - transform.e) / transform.a + p);
      maxY = Math.min(maxY, (ctx.canvas.height - transform.f) / transform.d + p);
    }
    const x0 = Math.floor(minX / p) * p, y0 = Math.floor(minY / p) * p;
    const w = Math.ceil((maxX - x0) / p), h = Math.ceil((maxY - y0) / p);
    if (w <= 0 || h <= 0 || w > 4000 || h > 4000) return;
    const bucket = (n: number) => Math.max(64, Math.ceil(n / 64) * 64);
    if (this.cv && this.cv.width * this.cv.height > Math.max(4096, w * h) * 4) this.smallFrames++;
    else this.smallFrames = 0;
    if (!this.cv) this.cv = new OffscreenCanvas(bucket(w), bucket(h));
    else if (this.cv.width < w || this.cv.height < h || this.smallFrames > 120) {
      // Resize the existing object, rather than leaving successive backing stores to GC.
      this.cv.width = bucket(w); this.cv.height = bucket(h); this.smallFrames = 0;
      this.outlineMask = new Uint8Array(0);
    }
    const g = this.cv.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(1 / p, 0, 0, 1 / p, -x0 / p, -y0 / p);
    drawIt(g);
    const img = g.getImageData(0, 0, w, h), a = img.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 110 ? 255 : 0;
    if (look.outline) {
      // Any empty pixel touching him becomes outline.
      if (this.outlineMask.length < w * h) this.outlineMask = new Uint8Array(this.cv.width * this.cv.height);
      const n = parseInt(shade(look.color, -0.7).slice(1), 16), solid = this.outlineMask;
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

/** A game controller held in both hands (flat, like his furniture), in front of him. */
export function controllerPart(c: Character): DepthPart {
  const j = c.body.j, sc = c.scale, x = (j.handL.x + j.handR.x) / 2, y = (j.handL.y + j.handR.y) / 2;
  const w = 16 * sc, h = 8 * sc;
  return {
    z: Math.max(j.handL.z, j.handR.z) + 0.5,
    pts: [{ x: x - w, y: y - h }, { x: x + w, y: y + h }],
    draw: (g) => {
      g.save();
      g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fillStyle = '#3b3f4f'; g.fill();
      g.fillStyle = '#e46a5c'; g.beginPath(); g.arc(x + w * 0.24, y, 1.8 * sc, 0, 7); g.fill();
      g.fillStyle = '#b4bccc'; g.fillRect(x - w * 0.36, y - 1 * sc, 4.5 * sc, 2 * sc);
      g.restore();
    },
  };
}

/**
 * His belt: a band around his hips, square to his torso. Split into short pieces so the
 * part behind him is drawn behind his body and the front part in front.
 */
export function beltParts(c: Character, color: string): DepthPart[] {
  const j = c.body.j, sc = c.scale, r = 4.6 * sc;
  const ux = j.neck.x - j.hip.x, uy = j.neck.y - j.hip.y, uz = j.neck.z - j.hip.z, ul = Math.hypot(ux, uy, uz) || 1;
  const up = { x: ux / ul, y: uy / ul, z: uz / ul };
  const L = c.dirToWorld(0, 0, 1), k = L.x * up.x + L.y * up.y + L.z * up.z;
  let lx = L.x - up.x * k, ly = L.y - up.y * k, lz = L.z - up.z * k;
  const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
  // forward = left × up (so the ring is square to his torso)
  const fx = ly * up.z - lz * up.y, fy = lz * up.x - lx * up.z, fz = lx * up.y - ly * up.x;
  const N = 10, pts = Array.from({ length: N + 1 }, (_, i) => {
    const a = (i / N) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    return { x: j.hip.x + lx * ca + fx * sa - up.x * 1.5 * sc, y: j.hip.y + ly * ca + fy * sa - up.y * 1.5 * sc, z: j.hip.z + lz * ca + fz * sa - up.z * 1.5 * sc };
  });
  const out: DepthPart[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ z: (a.z + b.z) / 2, pts: [a, b], draw: (g) => {
      g.save(); g.strokeStyle = color; g.lineWidth = 2.4 * sc; g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
    } });
  }
  return out;
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

/** The right-click menu: a pixel box with one row per choice. Returns nothing; layout comes from `menuLayout`. */
export interface MenuLayout { x: number; y: number; w: number; rowH: number; rows: string[]; p: number }

export function menuLayout(rows: string[], at: { x: number; y: number }, b: { left: number; right: number; top: number; floor: number }, p: number): MenuLayout {
  const wText = Math.max(...rows.map(textWidth), 20);
  const w = (wText + 10) * p, rowH = (FONT_HEIGHT + 6) * p, h = rows.length * rowH + 4 * p;
  const x = Math.min(Math.max(at.x + 10, b.left + 4), b.right - w - 4);
  const y = Math.min(Math.max(at.y - h / 2, b.top + 4), b.floor - h - 4);
  return { x: Math.round(x / p) * p, y: Math.round(y / p) * p, w, rowH, rows, p };
}

export function drawMenu(ctx: CanvasRenderingContext2D, m: MenuLayout, hover: number, ink: string) {
  const { x, y, w, rowH, rows, p } = m, h = rows.length * rowH + 4 * p;
  ctx.save();
  // Stepped corners, like his speech bubble.
  const box = (inset: number, color: string) => {
    ctx.fillStyle = color;
    const i = inset * p;
    ctx.fillRect(x + i + p, y + i, w - 2 * i - 2 * p, h - 2 * i);
    ctx.fillRect(x + i, y + i + p, w - 2 * i, h - 2 * i - 2 * p);
  };
  box(0, ink);
  box(1, '#ffffff');
  rows.forEach((label, i) => {
    const ry = y + 2 * p + i * rowH;
    if (i === hover) { ctx.fillStyle = ink; ctx.fillRect(x + 2 * p, ry, w - 4 * p, rowH); }
    ctx.fillStyle = i === hover ? '#ffffff' : '#1b1d2e';
    drawPixelText(ctx, label, x + 5 * p, ry + 3 * p, p);
  });
  ctx.restore();
}
