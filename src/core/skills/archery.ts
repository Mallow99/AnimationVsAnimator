// Shooting his bow: out it comes (whatever's in his hands goes back on his belt), he turns side-on, aims
// with a real arc (fast arrows still drop a little), draws the string back to his cheek, holds a moment,
// and lets go. The arrows themselves fly in the pet (Pet.stepArrows): they stick in what they hit, a
// sword can knock them aside, and in a play fight they're suction cups.
import { Skill, type Ctx } from './context';
import type { Item } from '../items';
import { clamp, lerp, pick, rand, smooth, type Vec } from '../math';

/** How fast an arrow leaves the bow (px/s), and how hard it falls (px/s²; the pet flies them with this). */
export const ARROW_SPEED = 950, ARROW_GRAVITY = 900;

/**
 * The angle (radians, up from level) to hit something dx ahead and dy above (px), at this speed: the flat
 * arc if there is one, else 45° (as far as it'll go).
 */
export function aimAngle(dx: number, dy: number, v = ARROW_SPEED, g = ARROW_GRAVITY) {
  const x = Math.max(1, Math.abs(dx)), v2 = v * v, disc = v2 * v2 - g * (g * x * x + 2 * dy * v2);
  return disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * x));
}

export class ShootBow extends Skill {
  readonly name = 'shoot';
  private phase: 'ready' | 'draw' | 'hold' | 'loose' | 'done' = 'ready';
  private pt = 0;
  private fired = 0;
  private bow: Item | null = null;
  private drawTime = 0.5;
  /**
   * `target`: what to shoot at (your cursor, his friend's chest). `at`: which (what the arrows may hit).
   * `keepOut`: leave the bow in his hand afterwards (the fight decides what's next).
   */
  constructor(private shots: number, private target: () => Vec | null, private at: 'friend' | 'cursor', private keepOut = false, readonly why = '') { super(); }

  start(c: Ctx) {
    c.look = 'target';
    const ch = c.char, hand = ch.useHand;
    const bow = c.items.find('shoot');
    if (!bow || !hand || bow.where === 'cursor' || bow.where === 'world') return;
    // Hands free: whatever he's holding goes back on his belt (or down, if there's no room).
    for (const it of c.items.list) if (it.where === 'hand' && it !== bow && !c.items.stow(it)) c.items.drop(it, 0, -60);
    c.items.toHand(bow, hand);
    c.sound?.('pickup', 0.6);
    this.bow = bow;
    this.drawTime = rand(0.42, 0.6);
  }

  update(c: Ctx, dt: number) {
    const ch = c.char, bow = this.bow, tgt = this.target();
    if (!bow || bow.where !== 'hand' || !tgt) return true;
    if (ch.mode !== 'ground' || ch.hitstun > 0) { this.relax(c); return this.phase !== 'ready' || this.t > 3; }
    this.pt += dt;
    c.lookTarget = tgt;
    const sc = ch.scale, n = ch.body.j.neck, dir = (Math.sign(tgt.x - n.x) || ch.facing) as 1 | -1;
    ch.stop(); ch.facing = dir; ch.faceLock = dir;
    // Aim from his shoulder: the flat arc to the target.
    const a = aimAngle(tgt.x - n.x, n.y - tgt.y), armLen = (ch.d.upperArm + ch.d.foreArm) * 0.95;
    const fx = Math.cos(a), fy = Math.sin(a); // in his frame: forward, up
    const bowHand = { x: n.x + dir * fx * armLen, y: n.y - fy * armLen };
    const cheek = { x: n.x - dir * fx * 3 * sc, y: n.y - 4 * sc + fy * 3 * sc };
    const draw = this.phase === 'draw' ? smooth(this.pt / this.drawTime) : this.phase === 'hold' ? 1 : 0;
    const pull = { x: lerp(bowHand.x, cheek.x, draw), y: lerp(bowHand.y, cheek.y, draw) };
    const front: 'L' | 'R' = bow.hand, back: 'L' | 'R' = front === 'R' ? 'L' : 'R';
    ch.handsAt = { [front]: bowHand, [back]: pull };
    // The bow stands across the shot (its limbs up and down), its string pulled back to his hand.
    bow.aimLocal = [-fy, fx];
    bow.pull = draw > 0.05 ? { x: pull.x, y: pull.y, z: bow.at.z } : null;
    const left = this.phase === 'draw' ? this.drawTime - this.pt + 0.15 : this.phase === 'hold' ? 0.15 - this.pt : 0;
    ch.actionMove = this.phase === 'draw' || this.phase === 'hold' ? { name: 'shoot', u: draw * 0.6, windup: true, hitIn: Math.max(0, left) } : null;
    switch (this.phase) {
      case 'ready': if (this.pt > 0.25) { this.phase = 'draw'; this.pt = 0; c.sound?.('step', 0.6); } break;
      case 'draw': if (this.pt >= this.drawTime) { this.phase = 'hold'; this.pt = 0; } break;
      case 'hold': {
        if (this.pt < 0.15) break;
        // Loose: the arrow leaves from the bow, along the aim.
        c.shoot?.(bowHand.x + dir * fx * 4 * sc, bowHand.y - fy * 4 * sc, dir * fx * ARROW_SPEED, -fy * ARROW_SPEED, this.at);
        c.sound?.('whoosh', 0.5);
        bow.pull = null; this.fired++;
        this.phase = 'loose'; this.pt = 0;
        if (this.fired === 1 && this.at === 'cursor' && Math.random() < 0.4) c.say(pick(['pew', 'bullseye?', 'hold still']), 1.2);
        break;
      }
      case 'loose':
        if (this.pt > 0.3) {
          if (this.fired < this.shots) { this.phase = 'draw'; this.pt = 0; this.drawTime = rand(0.35, 0.5); }
          else { this.phase = 'done'; this.pt = 0; this.relax(c); }
        }
        break;
      case 'done':
        if (this.keepOut) return true;
        if (this.pt > 0.2) { c.items.stow(bow); c.sound?.('pickup', 0.4); return true; }
        break;
    }
    return this.t > 12;
  }

  private relax(c: Ctx) {
    const ch = c.char;
    ch.handsAt = null; ch.actionMove = null; ch.faceLock = null;
    if (this.bow) { this.bow.pull = null; this.bow.aimLocal = null; }
  }

  stop(c: Ctx) {
    this.relax(c);
    if (this.bow?.where === 'hand' && !this.keepOut) c.items.stow(this.bow);
  }
}

/** Clamp an aim point to the screen (shooting at something off the edge is pointless). */
export const onScreen = (c: Ctx, p: Vec) => ({ x: clamp(p.x, c.world.bounds.left, c.world.bounds.right), y: clamp(p.y, c.world.bounds.top, c.world.bounds.floor) });
