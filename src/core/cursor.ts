// Your cursor, as a thing he can hit. When he punches, kicks, swats or slashes it, it
// goes flying: a little physics object with (light) gravity that bounces off the edges
// of the screen and lands on window tops and the floor. On the desktop the real mouse
// pointer follows it; move your mouse and you take it back straight away.
//
// The tricky part is telling OUR moves of the pointer from YOURS: the desktop reports
// every pointer position, including the ones we just put it at. So we keep a short trail
// of where we put it; a reported position near that trail is an echo of our own move.

import { GRAVITY, platY, type Bounds, type Platform } from './physics';
import type { Vec } from './math';

export interface Flight { x: number; y: number; vx: number; vy: number; t: number; bounces: number; spin: number }

/** How long a knocked cursor can fly before it's yours again, at most (s). */
const MAX_FLIGHT = 2.2;

export class CursorBody {
  flight: Flight | null = null;
  /** Where we put the pointer lately (to tell our own moves from yours). */
  private trail: { x: number; y: number; t: number }[] = [];
  /** Recent positions, for the speed lines drawn behind it. */
  streak: { x: number; y: number; t: number }[] = [];
  /** How far it went on its last flight (px), for bragging. */
  distance = 0;
  private start: Vec = { x: 0, y: 0 };

  /** Knock it from `at` with this velocity (px/s). Hitting it mid-flight adds to how it's moving. */
  hit(at: Vec, vx: number, vy: number, now: number) {
    const f = this.flight;
    if (f) {
      f.vx = f.vx * 0.25 + vx; f.vy = f.vy * 0.25 + vy; f.t = Math.min(f.t, 0.6);
      f.spin += Math.sign(vx || 1) * 9;
    } else {
      this.flight = { x: at.x, y: at.y, vx, vy, t: 0, bounces: 0, spin: Math.sign(vx || 1) * 9 };
      this.start = { x: at.x, y: at.y };
      this.distance = 0;
      this.streak = [];
    }
    this.mark(at.x, at.y, now);
  }

  get flying() { return this.flight !== null; }

  /**
   * Move it along. Returns where the pointer should be now (null when it isn't flying).
   * Light gravity, a little air drag, bouncy edges; it stops when it comes to rest.
   */
  step(dt: number, bounds: Bounds, platforms: Platform[], now: number): Vec | null {
    const f = this.flight;
    this.streak = this.streak.filter((p) => now - p.t < 0.16);
    if (!f) return null;
    f.t += dt;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    let onGround = false;
    for (let i = 0; i < n; i++) {
      f.vy += GRAVITY * 0.55 * h;
      const drag = Math.exp(-h * 1.1);
      f.vx *= drag; f.vy *= drag;
      const py = f.y;
      f.x += f.vx * h; f.y += f.vy * h;
      if (f.x < bounds.left + 2) { f.x = bounds.left + 2; f.vx = Math.abs(f.vx) * 0.6; f.bounces++; }
      if (f.x > bounds.right - 2) { f.x = bounds.right - 2; f.vx = -Math.abs(f.vx) * 0.6; f.bounces++; }
      if (f.y < bounds.top + 2) { f.y = bounds.top + 2; f.vy = Math.abs(f.vy) * 0.5; f.bounces++; }
      // Window tops catch it (only from above, like they catch him) and so does the floor.
      let ground = bounds.floor - 3;
      for (const p of platforms) { const top = platY(p, f.x); if (f.x >= p.x1 && f.x <= p.x2 && py <= top && f.y >= top) ground = Math.min(ground, top - 1); }
      if (f.y >= ground) {
        f.y = ground;
        onGround = true;
        if (f.vy > 160) { f.vy = -f.vy * 0.42; f.bounces++; } else f.vy = 0;
        f.vx *= Math.pow(0.02, h); // it skids to a stop
      }
    }
    f.spin *= Math.exp(-dt * 2.5);
    this.mark(f.x, f.y, now);
    this.streak.push({ x: f.x, y: f.y, t: now });
    this.distance = Math.max(this.distance, Math.hypot(f.x - this.start.x, f.y - this.start.y));
    const at = { x: f.x, y: f.y };
    if ((onGround && Math.hypot(f.vx, f.vy) < 45) || f.t > MAX_FLIGHT) this.flight = null;
    return at;
  }

  private mark(x: number, y: number, now: number) {
    this.trail.push({ x, y, t: now });
    this.trail = this.trail.filter((p) => now - p.t < 0.35);
  }

  /**
   * The desktop says the pointer is at (x, y): is that just our own move echoing back?
   * (Only while flying, or for a moment after.)
   */
  ours(x: number, y: number, now: number) {
    // Mid-flight the reports lag behind a little; after it lands, only an exact echo is ours
    // (so your first small nudge of the mouse counts straight away).
    const tol = this.flight ? 34 : 3;
    return this.trail.some((p) => now - p.t < 0.35 && Math.hypot(p.x - x, p.y - y) < tol);
  }

  /** Did we move the pointer in the last moment? */
  busy(now: number) { return this.flight !== null || this.trail.some((p) => now - p.t < 0.35); }

  /** You moved the mouse yourself: it's yours again. (The trail stays a moment, to ignore late echoes.) */
  cancel() { this.flight = null; }
}

/** A little arrow pointer (for preview mode, where we can't move the real one), plus speed lines. */
export function drawCursorFlight(ctx: CanvasRenderingContext2D, cb: CursorBody, now: number, ghost: boolean) {
  const s = cb.streak;
  if (s.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], k = 1 - (now - b.t) / 0.16;
      if (k <= 0) continue;
      ctx.globalAlpha = 0.55 * k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = '#2a2c44';
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }
  const f = cb.flight;
  if (!ghost || !f) return;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.spin * f.t * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.5, 13); ctx.lineTo(7.5, 19.5); ctx.lineTo(10, 18.5); ctx.lineTo(7, 12); ctx.lineTo(12.5, 12); ctx.closePath();
  ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
