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
