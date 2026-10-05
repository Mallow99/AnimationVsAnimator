import { BUILTIN_ITEMS, drawItem, Item, type ItemDef } from '../items';
import type { Pet } from '../pet';
import type { FighterView, Peer } from '../peer';
import type { Vec } from '../math';
import type { JointName } from '../body';
import { viewHitTest } from '../fighting';
import { Projectiles } from './projectiles';

export type CursorWeaponKind = 'none' | 'sword' | 'mace' | 'gun';
export class CursorWeapon {
  kind: CursorWeaponKind = 'none';
  private at: Vec = { x: 0, y: 0 };
  private previous: Vec | null = null;
  private angle = -0.7;
  private held = false;
  private time = 0;
  private fireAt = 0;
  private painted: Item | null = null;
  private hitAt = new Map<Pet, number>();
  readonly projectiles = new Projectiles();
  equip(kind: CursorWeaponKind) {
    this.kind = kind;
    this.painted = this.def ? new Item(this.def, this.at, 1.35) : null;
    this.held = false;
    this.previous = null;
    this.hitAt.clear();
    this.projectiles.rounds.length = 0;
  }
  pointer(x: number, y: number) {
    if ([x, y].every(Number.isFinite)) this.at = { x, y };
  }
  press(on: boolean) {
    this.held = on;
    if (!on) this.previous = null;
  }
  private get def(): ItemDef | undefined {
    return BUILTIN_ITEMS.find((d) => d.id === this.kind);
  }
  update(dt: number, pets: Pet[]) {
    if (!pets.length || !Number.isFinite(dt) || dt <= 0) return;
    this.time += Math.min(dt, 0.1);
    const def = this.def,
      last = this.previous ?? this.at,
      dx = this.at.x - last.x,
      dy = this.at.y - last.y;
    const speed = Math.min(3500, Math.hypot(dx, dy) / Math.max(dt, 1 / 240));
    if (Math.hypot(dx, dy) > 1) this.angle = Math.atan2(dy, dx);
    const source: Peer = {
      view: () => ({
        ...pets[0].view(),
        id: 'cursor',
        name: 'your cursor',
        x: this.at.x,
        partner: null,
        joints: {},
        blade: null,
      }),
      receive: () => {},
    };
    if (def && this.held && this.kind === 'gun' && this.time >= this.fireAt) {
      const nearest = [...pets].sort(
        (a, b) =>
          Math.hypot(a.char.x - this.at.x, a.char.body.j.neck.y - this.at.y) -
          Math.hypot(b.char.x - this.at.x, b.char.body.j.neck.y - this.at.y),
      )[0];
      this.angle = Math.atan2(
        nearest.char.body.j.neck.y - this.at.y,
        nearest.char.x - this.at.x,
      );
      const x = Math.cos(this.angle),
        y = Math.sin(this.angle);
      this.projectiles.fire(
        this.at.x + x * 25,
        this.at.y + y * 25,
        x * 2200,
        y * 2200,
        pets[0].config.fightMode === 'play',
      );
      this.fireAt = this.time + 0.3;
      pets[0].ctx.sound?.('shot', 0.5);
    }
    if (def && this.held && this.kind !== 'gun' && speed > 350) {
      const length = def.length * 1.35;
      // Sweep the grip and tip between frames; fast swipes cannot skip a thin limb.
      const count = Math.min(512, Math.ceil(Math.hypot(dx, dy) / 5) + 1);
      for (let i = 0; i <= count; i++) {
        const grip = {
          x: last.x + (dx * i) / count,
          y: last.y + (dy * i) / count,
        };
        for (const p of pets) {
          if ((this.hitAt.get(p) ?? -1) > this.time) continue;
          const v = p.view();
          let joint: string | null = null,
            at = grip;
          for (let k = 0; k <= length; k += 4) {
            at = {
              x: grip.x + Math.cos(this.angle) * k,
              y: grip.y + Math.sin(this.angle) * k,
            };
            joint = viewHitTest(v, at.x, at.y, 6);
            if (joint) break;
          }
          if (!joint) continue;
          p.receive(
            {
              type: 'hit',
              joint: joint as JointName,
              vx: Math.max(
                -1400,
                Math.min(1400, (dx / Math.max(dt, 1 / 240)) * 0.4),
              ),
              vy: Math.max(
                -700,
                Math.min(700, (dy / Math.max(dt, 1 / 240)) * 0.2),
              ),
              power: Math.min(1.4, speed / 1400),
              weapon: { id: def.id, hit: def.hit, cuts: false },
              at,
              kind: this.kind === 'mace' ? 'heavy' : 'cut',
            },
            source,
          );
          this.hitAt.set(p, this.time + 0.35);
        }
      }
    }
    this.projectiles.update(
      dt,
      pets[0].ctx.world.bounds,
      pets[0].ctx.world.platforms,
      source,
      pets,
      (at) => pets[0].ctx.burst?.(at.x, at.y, 6),
    );
    this.previous = { ...this.at };
  }
  draw(g: CanvasRenderingContext2D) {
    const def = this.def;
    if (def && this.painted) {
      const it = this.painted;
      it.at = { ...this.at, z: 0 };
      it.dir = { x: Math.cos(this.angle), y: Math.sin(this.angle), z: 0 };
      drawItem(g, it);
    }
    this.projectiles.draw(g);
  }
}
