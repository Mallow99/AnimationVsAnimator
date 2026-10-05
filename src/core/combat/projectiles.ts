// Platform-free swept projectiles. Guns and cursor weapons use the same collision rules.
import type { Bounds, Platform } from '../physics';
import { platY } from '../physics';
import { segDist, viewHitTest } from '../fighting';
import type { JointName } from '../body';
import type { FighterView, Peer } from '../peer';
import type { Vec } from '../math';

export interface Round extends Vec {
  vx: number;
  vy: number;
  life: number;
  toy: boolean;
  cursor: boolean;
  kind: 'round' | 'arrow';
}
export class Projectiles {
  readonly rounds: Round[] = [];
  fire(
    x: number,
    y: number,
    vx: number,
    vy: number,
    toy: boolean,
    cursor = false,
    kind: 'round' | 'arrow' = 'round',
  ) {
    if (![x, y, vx, vy].every(Number.isFinite)) return;
    const speed = Math.hypot(vx, vy);
    if (speed > 5000) {
      vx = (vx / speed) * 5000;
      vy = (vy / speed) * 5000;
    }
    if (this.rounds.length >= 32) this.rounds.shift();
    this.rounds.push({ x, y, vx, vy, toy, cursor, kind, life: 0 });
  }
  update(
    dt: number,
    bounds: Bounds,
    platforms: Platform[],
    source: Peer,
    targets: Peer[],
    impact: (at: Vec) => void,
    cursor?: Vec | null,
    hitCursor?: (at: Vec, vx: number, vy: number) => void,
  ) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const views = targets.map((p) => ({ p, v: p.view() }));
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i],
        from = { x: r.x, y: r.y };
      r.life += dt;
      r.vy += (r.kind === 'arrow' ? 900 : r.toy ? 120 : 0) * dt;
      const to = { x: r.x + r.vx * dt, y: r.y + r.vy * dt };
      let landed = false;
      // Sample in travel order, never farther apart than a limb's collision padding.
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4),
      );
      for (let k = 1; k <= steps && !landed; k++) {
        const at = {
          x: from.x + ((to.x - from.x) * k) / steps,
          y: from.y + ((to.y - from.y) * k) / steps,
        };
        if (
          at.x < bounds.left ||
          at.x > bounds.right ||
          at.y > bounds.floor ||
          at.y < bounds.top - 100
        ) {
          landed = true;
          break;
        }
        for (const pl of platforms)
          if (
            r.vy > 0 &&
            at.x >= pl.x1 &&
            at.x <= pl.x2 &&
            from.y <= platY(pl, at.x) &&
            at.y >= platY(pl, at.x)
          ) {
            landed = true;
            break;
          }
        if (landed) {
          impact(at);
          break;
        }
        if (
          r.cursor &&
          cursor &&
          Math.hypot(at.x - cursor.x, at.y - cursor.y) < 10
        ) {
          hitCursor?.(at, r.vx, r.vy);
          landed = true;
          impact(at);
          break;
        }
        for (const { p, v } of views) {
          if (v.hp <= 0) continue;
          if (blocksRound(v, from, at)) {
            p.receive(
              {
                type: 'hit',
                joint: 'handR',
                vx: r.vx * 0.3,
                vy: r.vy * 0.3,
                power: r.toy ? 0.65 : 1,
                weapon: {
                  id: r.kind === 'arrow' ? (r.toy ? 'suction-arrow' : 'arrow') : r.toy ? 'foam-round' : 'round',
                  hit: r.toy ? 0.3 : 0.8,
                  cuts: false,
                },
                at,
                kind: r.kind === 'arrow' ? 'arrow' : 'bullet',
                ranged: true,
                onBlade: true,
              },
              source,
            );
            impact(at);
            landed = true;
            break;
          }
          const joint = viewHitTest(v, at.x, at.y, 5 * v.scale);
          if (!joint) continue;
          p.receive(
            {
              type: 'hit',
              joint: joint as JointName,
              vx: r.vx * 0.3,
              vy: r.vy * 0.3,
              power: r.toy ? 0.65 : 1,
              weapon: {
                id: r.kind === 'arrow' ? (r.toy ? 'suction-arrow' : 'arrow') : r.toy ? 'foam-round' : 'round',
                hit: r.toy ? 0.3 : 0.8,
                cuts: false,
              },
              at,
              kind: r.kind === 'arrow' ? 'arrow' : 'bullet',
              ranged: true,
            },
            source,
          );
          impact(at);
          landed = true;
          break;
        }
      }
      r.x = to.x;
      r.y = to.y;
      if (landed || r.life > 2) this.rounds.splice(i, 1);
    }
  }
  draw(g: CanvasRenderingContext2D) {
    g.save();
    g.lineCap = 'round';
    for (const r of this.rounds) {
      const speed = Math.hypot(r.vx, r.vy) || 1;
      g.strokeStyle = r.toy ? '#ffbe62' : '#fff0ad';
      g.lineWidth = r.toy ? 4 : 2;
      g.beginPath();
      g.moveTo(r.x - (r.vx / speed) * 12, r.y - (r.vy / speed) * 12);
      g.lineTo(r.x, r.y);
      g.stroke();
    }
    g.restore();
  }
}
function blocksRound(v: FighterView, from: Vec, to: Vec) {
  return (
    !!v.blade &&
    !!(v.block || v.parrying) &&
    segDist(from, to, v.blade.a, v.blade.b) < 5 * v.scale
  );
}
