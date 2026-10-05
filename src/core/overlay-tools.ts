import type { Pet } from './pet';
import type { Item } from './items';
import type { Ball, Thing } from './props';
import type { Vec } from './math';

type HeldObject = { kind: 'item'; owner: Pet; object: Item }
  | { kind: 'thing'; owner: Pet; object: Thing }
  | { kind: 'ball'; owner: Pet; object: Ball };

/** Direct overlay transfers and one reversible trash slot. Only in-app objects enter this API. */
export class OverlayTools {
  held: HeldObject | null = null;
  private lastTrash: { entry: HeldObject; born: number; at: number } | null = null;
  constructor(private readonly pets: () => Pet[]) {}

  get dragging() { return this.held !== null; }
  get trashedName() {
    const e = this.lastTrash?.entry;
    return e?.kind === 'item' ? e.object.def.name : e?.kind === 'thing' ? (e.object.def?.name ?? e.object.kind) : e ? 'drawn ball' : null;
  }

  beginItem(owner: Pet, object: Item, at: Vec) {
    if (this.held || !owner.items.list.includes(object)) return false;
    if (this.pets().some(p => p.items.carried && p.items.carried !== object)) return false;
    owner.takeItem(object);
    object.cursorControlled = true;
    owner.userWeaponControlled = true; // Transport never swings/fires the weapon.
    this.held = { kind: 'item', owner, object };
    this.move(at, { x: 0, y: 0 });
    return true;
  }

  /** Pull a definition from the bag; custom definitions use the same path as built-ins. */
  pull(owner: Pet, kind: 'item' | 'prop', id: string, at: Vec) {
    if (this.held || this.pets().some(p => p.items.carried)) return false;
    if (kind === 'item') {
      const object = owner.items.spawn(id, at, owner.char.scale);
      return object ? this.beginItem(owner, object, at) : false;
    }
    const object = owner.props.spawn(id, at.x, at.y, owner.char.scale);
    if (!object) return false;
    object.grab(at.x, at.y);
    this.held = { kind: 'thing', owner, object };
    return true;
  }

  move(at: Vec, velocity: Vec) {
    const e = this.held;
    if (!e) return;
    if (e.kind === 'item') {
      e.object.at = { ...at, z: 30 };
      e.object.dir = { x: 0, y: 1, z: 0 };
      e.object.loosen();
      e.object.resetMotion();
    } else if (e.kind === 'thing' && e.object.held) Object.assign(e.object.held, at, { vx: velocity.x, vy: velocity.y });
    else if (e.kind === 'ball') e.object.moveHold(at.x, at.y, velocity.x, velocity.y);
  }

  /** Release a dragged item onto any figure, or drop the original object into the world. */
  release(at: Vec, velocity: Vec, recipient: Pet | null = null) {
    const e = this.held;
    this.move(at, velocity);
    this.held = null;
    if (!e) return false;
    if (e.kind === 'item') {
      e.owner.userWeaponControlled = false;
      e.object.cursorControlled = false;
      if (!e.owner.items.list.includes(e.object)) return true;
      if (recipient) {
        if (recipient !== e.owner) {
          e.owner.items.remove(e.object);
          recipient.items.list.push(e.object);
        }
        recipient.giveBack(e.object);
      } else {
        e.object.at = { ...at, z: 0 };
        const k = Math.min(1, 2400 / (Math.hypot(velocity.x, velocity.y) || 1));
        e.owner.items.drop(e.object, velocity.x * k, velocity.y * k);
        e.object.thrownBy = 'you';
        e.object.thrownAt = e.owner.ctx.world.time;
      }
    } else e.object.release();
    return true;
  }

  /** Catch an existing user-held prop/ball/item as well as a pull from the bag. */
  trashHeld() {
    let e = this.held;
    if (!e) {
      for (const owner of this.pets()) {
        const item = owner.items.carried;
        const thing = owner.props.things.find(t => t.held);
        const ball = owner.props.balls.find(b => b.heldBy === 'user');
        if (item) e = { kind: 'item', owner, object: item };
        else if (thing) e = { kind: 'thing', owner, object: thing };
        else if (ball) e = { kind: 'ball', owner, object: ball };
        if (e) break;
      }
    }
    if (!e) return false;
    const { owner } = e;
    const born = e.kind === 'item' ? 0 : e.object.doodle.born;
    if (e.kind === 'item') {
      if (!owner.items.list.includes(e.object)) return false;
      owner.userWeaponControlled = false;
      e.object.cursorControlled = false;
      e.object.pull = null;
      owner.items.remove(e.object);
    } else {
      if (e.kind === 'thing') {
        if (!owner.props.things.includes(e.object)) return false;
        const t = e.object;
        for (const p of this.pets()) {
          const who = p.ctx.who;
          if (t.sitters.has(who) || t.watchers.has(who) || t.players.includes(who) || t.platforms.some(pl => pl.id === p.char.support)) p.mind.reset(p.ctx);
        }
        t.sitters.clear(); t.watchers.clear(); t.players = [];
        t.on = false; t.arcade = null; t.arcade2 = null; t.board = null;
        owner.props.remove(t);
      } else {
        if (!owner.props.balls.includes(e.object)) return false;
        owner.props.balls = owner.props.balls.filter(b => b !== e!.object);
      }
      e.object.release();
    }
    this.held = null;
    this.lastTrash = { entry: e, born, at: owner.ctx.world.time };
    return true;
  }

  /** Restore the same identity, ammunition and artwork. Undo is available for this session. */
  undo(at: Vec) {
    const saved = this.lastTrash;
    if (!saved || this.dragging) return false;
    const e = saved.entry;
    // A removed companion's item comes back through a current owner instead of being stranded.
    const owner = this.pets().includes(e.owner) ? e.owner : this.pets()[0];
    if (!owner) return false;
    if (e.kind === 'item') {
      if (this.pets().some(p => p.items.list.includes(e.object))) return false;
      owner.items.list.push(e.object);
      e.object.at = { ...at, z: 0 };
      owner.items.drop(e.object, 0, 0);
      e.object.resetMotion();
    } else {
      e.object.doodle.born = owner.ctx.world.time - (saved.at - saved.born);
      if (e.kind === 'thing') {
        if (owner.props.things.includes(e.object)) return false;
        e.object.unstick(); // Retrieved drawings leave their old window anchors behind.
        const center = e.object.center;
        for (const p of e.object.points) { p.x += at.x - center.x; p.y += at.y - center.y; p.px = p.x; p.py = p.y; }
        owner.props.add(e.object);
      } else {
        if (owner.props.balls.includes(e.object)) return false;
        Object.assign(e.object.p, { x: at.x, y: at.y, px: at.x, py: at.y });
        owner.props.balls.push(e.object);
      }
    }
    this.lastTrash = null;
    return true;
  }
}
