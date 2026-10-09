import { BUILTIN_ITEMS, drawItem, Item, type ItemDef } from '../items';
import type { Pet } from '../pet';
import type { Peer } from '../peer';
import type { Vec } from '../math';
import type { JointName } from '../body';
import { viewHitTest } from '../fighting';
import { Projectiles } from './projectiles';

export type CursorWeaponKind = 'none' | 'sword' | 'mace' | 'gun' | 'bow';
/** The same controller serves a practice tool and an actual item taken from a figure. */
export class CursorWeapon {
  kind: CursorWeaponKind = 'none';
  item: Item | null = null;
  owner: Pet | null = null;
  private at: Vec = { x: 0, y: 0 };
  private grip: Vec | null = null;
  private previous: Vec | null = null;
  private previousAngle = -0.7;
  private angle = -0.7;
  private held = false;
  private releaseBow = false;
  private charge = 0;
  private time = 0;
  private fireAt = 0;

  private hitAt = new Map<Pet, number>();
  readonly projectiles = new Projectiles();
  get active() {
    return this.kind !== 'none';
  }
  get aiming() {
    return this.held && (this.kind === 'gun' || this.kind === 'bow');
  }
  get status() {
    return this.item?.def.use === 'gun'
      ? `${this.item.def.name} · ${this.item.reloadRemaining > 0 ? "Reloading…" : `${this.item.ammo}/6`}`
      : (this.item?.def.name ?? '');
  }
  equip(kind: CursorWeaponKind) {
    this.detach();
    const def = BUILTIN_ITEMS.find((d) => d.id === kind);
    this.kind = def ? kind : 'none';
    this.item = def ? new Item(def, this.at, 1.35) : null;
    this.reset();
  }
  attach(item: Item, owner: Pet) {
    if (this.item === item && this.owner === owner) return;
    this.detach();
    this.item = item;
    this.owner = owner;
    this.kind =
      item.def.use === 'gun'
        ? 'gun'
        : item.def.use === 'shoot'
          ? 'bow'
          : item.def.use === 'smash'
            ? 'mace'
            : 'sword';
    item.cursorControlled = true;
    owner.userWeaponControlled = true;
    this.reset();
  }
  /** Leave inventory decisions to the caller (drop, return or trash). */
  detach() {
    if (this.item) {
      this.item.cursorControlled = false;
      this.item.pull = null;
    }
    if (this.owner) this.owner.userWeaponControlled = false;
    this.owner = null;
    this.item = null;
    this.kind = 'none';
    this.reset();
  }
  private reset() {
    this.held = false;
    this.grip = null;
    this.previous = null;
    this.charge = 0;
    this.releaseBow = false;

    this.fireAt = this.time;
    this.hitAt.clear();
  }
  pointer(x: number, y: number) {
    if ([x, y].every(Number.isFinite)) this.at = { x, y };
  }
  press(on: boolean) {
    if (on === this.held) return;
    if (on) {
      this.grip = { ...this.at };
      this.charge = 0;
    } else {
      this.releaseBow = this.kind === 'bow' && this.charge >= 0.12;
      if (!this.releaseBow) this.grip = null;
    }
    this.held = on;
  }
  cancel() {
    this.held = false;
    this.releaseBow = false;
    this.grip = null;
    this.charge = 0;
  }
  reload() {
    if (this.kind === 'gun') this.item?.beginReload();
  }
  update(dt: number, pets: Pet[]) {
    if (!pets.length || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (
      this.owner &&
      (this.item?.where !== 'cursor' ||
        !this.owner.items.list.includes(this.item))
    )
      this.detach();
    const item = this.item,
      def = item?.def;
    const at =
      this.aiming || this.releaseBow ? (this.grip ?? this.at) : this.at;
    const last = this.previous ?? at,
      dx = at.x - last.x,
      dy = at.y - last.y;
    const pointerDistance = Math.hypot(this.at.x - at.x, this.at.y - at.y);
    if ((this.aiming || this.releaseBow) && pointerDistance > 3)
      this.angle = Math.atan2(this.at.y - at.y, this.at.x - at.x);
    else if (!this.aiming && !this.releaseBow && Math.hypot(dx, dy) > 1)
      this.angle = Math.atan2(dy, dx);
    const fx = Math.cos(this.angle),
      fy = Math.sin(this.angle);
    const source: Peer = {
      view: () => ({
        ...pets[0].view(),
        id: 'cursor',
        name: 'your cursor',
        x: at.x,
        partner: null,
        joints: {},
        blade: null,
        looseWeapons: [],
      }),
      receive: () => {},
    };
    // Owned guns advance on their owner's inventory clock in every location.
    // Practice guns have no owner and use this controller's clock.
    if (!this.owner) item?.tickReload(dt);
    if (
      def &&
      item &&
      this.held &&
      this.kind === 'gun' &&
      !item.reloadRemaining &&
      this.time >= this.fireAt &&
      item.ammo > 0
    ) {
      this.projectiles.fire(
        at.x + fx * (def.length * item.scale + 3),
        at.y + fy * (def.length * item.scale + 3),
        fx * 2200,
        fy * 2200,
        pets[0].config.fightMode === 'play',
      );
      item.ammo--;
      this.fireAt = this.time + 0.3;
      pets[0].ctx.sound?.('shot', 0.5);
    }
    if (this.held && this.kind === 'bow')
      this.charge = Math.min(1, this.charge + dt / 0.7);
    if (def && item && this.releaseBow) {
      const speed = 950 * (0.35 + 0.65 * this.charge);
      this.projectiles.fire(
        at.x + fx * 10,
        at.y + fy * 10,
        fx * speed,
        fy * speed,
        pets[0].config.fightMode === 'play',
        false,
        'arrow',
      );
      pets[0].ctx.sound?.('whoosh', 0.5);
      this.releaseBow = false;
      this.charge = 0;
      this.grip = null;
    }
    if (def && item) {
      const angle = this.kind === 'bow' ? this.angle - Math.PI / 2 : this.angle;
      item.at = { ...at, z: 30 };
      item.dir = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
      item.pull =
        this.kind === 'bow' && this.held
          ? {
              x: at.x - fx * 24 * this.charge,
              y: at.y - fy * 24 * this.charge,
              z: 30,
            }
          : null;
      item.loosen();
    }
    const speed = Math.min(3500, Math.hypot(dx, dy) / Math.max(dt, 1 / 240));
    if (
      def &&
      item &&
      this.held &&
      !['gun', 'bow'].includes(this.kind) &&
      this.previous &&
      speed > 350
    )
      this.swing(pets, source, def, item.scale, last, dx, dy, speed, dt);
    this.projectiles.update(
      dt,
      pets[0].ctx.world.bounds,
      pets[0].ctx.world.platforms,
      source,
      pets,
      (impact) => pets[0].ctx.burst?.(impact.x, impact.y, 6),
    );
    this.previous = { ...at };
    this.previousAngle = this.angle;
  }
  private swing(
    pets: Pet[],
    source: Peer,
    def: ItemDef,
    scale: number,
    last: Vec,
    dx: number,
    dy: number,
    speed: number,
    dt: number,
  ) {
    let turn = this.angle - this.previousAngle;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const length = def.length * scale;
    const count = Math.min(
      512,
      Math.ceil((Math.hypot(dx, dy) + Math.abs(turn) * length) / 4) + 1,
    );
    for (let i = 0; i <= count; i++) {
      const grip = {
          x: last.x + (dx * i) / count,
          y: last.y + (dy * i) / count,
        },
        angle = this.previousAngle + (turn * i) / count;
      for (const p of pets) {
        if ((this.hitAt.get(p) ?? -1) > this.time) continue;
        const v = p.view();
        let joint: string | null = null,
          hit = grip;
        for (let k = -def.grip * scale; k <= length; k += 4) {
          hit = {
            x: grip.x + Math.cos(angle) * k,
            y: grip.y + Math.sin(angle) * k,
          };
          joint = viewHitTest(v, hit.x, hit.y, 6);
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
            weapon: { id: def.id, hit: def.hit, cuts: !!def.cuts },
            at: hit,
            kind: this.kind === 'mace' ? 'heavy' : 'cut',
          },
          source,
        );
        this.hitAt.set(p, this.time + 0.35);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    if (this.item && !this.owner) drawItem(g, this.item);
    if (this.aiming && this.grip) {
      g.save();
      g.strokeStyle = '#e8c86d';
      g.lineWidth = 1.5;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(this.grip.x, this.grip.y);
      g.lineTo(this.at.x, this.at.y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(this.at.x, this.at.y, 6, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    this.projectiles.draw(g);
  }
}
