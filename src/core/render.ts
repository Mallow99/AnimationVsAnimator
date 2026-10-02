// Drawing. Uses only the standard HTML canvas API, so it works in Electron,
// a normal browser, and (later) an Android WebView.

import type { Character } from './character';

export interface Style { color: string; lineWidth: number; showJoints: boolean }

export function drawCharacter(ctx: CanvasRenderingContext2D, c: Character, style: Style) {
  const j = c.body.j, sc = c.scale;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.lineWidth * sc;

  const path = (...pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  // Back limbs first, slightly darker, so the figure reads with depth.
  const back = c.facing > 0 ? 'L' : 'R', front = c.facing > 0 ? 'R' : 'L';
  ctx.globalAlpha = 0.85;
  path(j.hip, j[`knee${back}`], j[`foot${back}`]);
  path(j.neck, j[`elbow${back}`], j[`hand${back}`]);
  ctx.globalAlpha = 1;
  path(j.head, j.neck, j.hip);
  path(j.hip, j[`knee${front}`], j[`foot${front}`]);
  path(j.neck, j[`elbow${front}`], j[`hand${front}`]);

  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, c.d.headR, 0, Math.PI * 2);
  ctx.fill();

  if (style.showJoints) {
    ctx.fillStyle = '#fff';
    for (const p of c.body.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
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
