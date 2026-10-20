import type { Pet } from './pet';
import type { Item } from './items';
import type { Ball, Thing } from './props';
import type { Vec } from './math';
import { wipeDoodles } from './sponge';

type HeldObject = { kind: 'item'; owner: Pet; object: Item }
  | { kind: 'thing'; owner: Pet; object: Thing }
  | { kind: 'ball'; owner: Pet; object: Ball };

/** Direct overlay transfers and one reversible trash slot. Only in-app objects enter this API. */
export class OverlayTools {
  held: HeldObject | null = null;
  using = false;
  private origin: { created: boolean; state?: Pick<Item, 'where' | 'slot' | 'hand' | 'at' | 'dir' | 'shelf'> } | null = null;
  private wipeFrom: Vec | null = null;
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
    this.using = false;
    this.origin = { created: false, state: { where: object.where, slot: object.slot, hand: object.hand, at: { ...object.at }, dir: { ...object.dir }, shelf: object.shelf ? {...object.shelf} : null } };
    owner.takeItem(object);
    object.cursorControlled = true;
    owner.userWeaponControlled = true; // Transport never swings/fires the weapon.
    this.wipeFrom = { ...at };
    this.held = { kind: 'item', owner, object };
    this.move(at, { x: 0, y: 0 });
    return true;
  }

  /** Pull a definition from the bag; custom definitions use the same path as built-ins. */
  pull(owner: Pet, kind: 'item' | 'prop', id: string, at: Vec) {
    if (this.held || this.pets().some(p => p.items.carried)) return false;
    if (kind === 'item') {
      const object = owner.items.spawn(id, at, owner.char.scale);
      if (!object) return false;
      if (!this.beginItem(owner, object, at)) { owner.items.remove(object); return false; }
      this.origin!.created = true;
      return true;
    }
    const object = owner.props.spawn(id, at.x, at.y, owner.char.scale);
    if (!object) return false;
    object.grab(at.x, at.y);
    this.held = { kind: 'thing', owner, object };
    this.origin = { created: true };
    return true;
  }

  move(at: Vec, velocity: Vec, applyUse = true) {
    const e = this.held;
    if (!e) return;
    if (e.kind === 'item') {
      if (!applyUse) this.wipeFrom = null;
      if (applyUse && this.using && (e.object.def.use === 'erase' || e.object.def.use === 'color')) this.animateInk(e.object.def.use, at);
      if (applyUse && this.using && e.object.def.use === 'wipe') {
        const sets = new Set(this.pets().map(p => p.ctx.doodles));
        for (const doodles of sets) wipeDoodles(doodles, this.wipeFrom ?? at, at, 14 * e.object.scale);
        this.wipeFrom = { ...at };
      }
      e.object.at = { ...at, z: 30 };
      e.object.dir = { x: 0, y: 1, z: 0 };
      e.object.loosen();
      e.object.resetMotion();
    } else if (e.kind === 'thing' && e.object.held) Object.assign(e.object.held, at, { vx: velocity.x, vy: velocity.y });
    else if (e.kind === 'ball') e.object.moveHold(at.x, at.y, velocity.x, velocity.y);
  }

  setUsing(on: boolean) {
    this.using = on && this.held?.kind === 'item';
    // Activation starts at the current cursor, never across the passive carrying path.
    this.wipeFrom = null;
  }

  private animateInk(use: 'erase' | 'color', at: Vec) {
    for (const owner of this.pets()) {
      const item = owner.items.list.find(i => i.ink && i.where === 'world' && i.distTo(at.x, at.y) < 14);
      const prop = owner.props.things.find(t => t.ink && !t.held && !t.movingBy && !t.sitters.size && !t.watchers.size && t.contains(at.x, at.y));
      const object = item ?? prop; if (!object?.ink) continue;
      if (use === 'erase') {
        if (item) owner.items.remove(item); else if (prop) {
          for (const p of this.pets()) if (prop.platforms.some(pl => pl.id === p.char.support)) p.mind.reset(p.ctx);
          owner.props.remove(prop);
        }
        owner.ctx.say(owner.config.personality === 'competitive' ? 'Hey! I made that!' : 'My drawing…', 1.6);
        if (owner.char.ready && Math.abs(owner.char.x - at.x) < 55) owner.char.walkTo(owner.char.x + (owner.char.x < at.x ? -30 : 30));
      } else if (object.ink.progress < 0.6) {
        const source = item ? owner.items.defs.get(object.ink.source) : owner.props.defs.get(object.ink.source);
        if (!source || source.refinable === false) continue;
        object.ink.progress = 0.6;
        object.def = { ...object.def!, shape: structuredClone(source.shape), sprite: structuredClone(source.sprite) } as typeof object.def;
        owner.ctx.say('Thanks! I’ll polish it.', 1.5);
      }
      return;
    }
  }

  /** Release a dragged item onto any figure, or drop the original object into the world. */
  release(at: Vec, velocity: Vec, recipient: Pet | null = null) {
    const e = this.held;
    this.using = false;
    this.move(at, velocity);
    this.held = null;
    this.origin = null;
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
    if(e.kind==='item'&&e.object.def.use==='connect'&&!recipient){
      const tv=e.owner.props.placed.find(t=>t.def?.use==='tv'&&Math.abs(t.center.x-at.x)<100*e.object.scale);
      if(tv){tv.consoleConnected=true;e.owner.ctx.say('Console connected.',1.4);}
    }
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
    return this.trash(e);
  }

  trashObject(owner: Pet, object: Item | Thing) {
    if (this.held?.object === object) return this.trashHeld();
    if (this.dragging) return false;
    return this.trash('where' in object ? { kind: 'item', owner, object } : { kind: 'thing', owner, object });
  }

  private trash(e: HeldObject) {
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
    this.using = false;
    this.origin = null;
    this.lastTrash = { entry: e, born, at: owner.ctx.world.time };
    return true;
  }

  /** Cancel puts an existing item back; an unused supply is never left on the desktop. */
  cancel() {
    const e = this.held, origin = this.origin;
    if (!e) return false;
    this.held = null;
    this.using = false; this.origin = null; this.wipeFrom = null;
    if (e.kind === 'item') {
      e.owner.userWeaponControlled = false; e.object.cursorControlled = false;
      if (!e.owner.items.list.includes(e.object)) return true;
      if (origin?.created) e.owner.items.remove(e.object);
      else if (!this.pets().includes(e.owner) && this.pets()[0]) {
        const owner = this.pets()[0];
        e.owner.items.remove(e.object); owner.items.list.push(e.object); owner.giveBack(e.object);
      }
      else if (origin?.state) {
        const s = origin.state;
        if (s.where === 'hand') e.owner.items.toHand(e.object, s.hand);
        else if (s.where === 'cursor') e.owner.giveBack(e.object);
        else if (s.where === 'belt' || s.where === 'worn') {
          if (!e.owner.items.stow(e.object)) e.owner.items.drop(e.object, 0, 0);
          // Keep the original slot when it is still free.
          if (s.where === 'belt' && s.slot >= 0 && !e.owner.items.belt[s.slot]) {
            e.owner.items.belt[e.object.slot] = null;
            e.object.slot = s.slot; e.owner.items.belt[s.slot] = e.object;
          }
        } else {
          e.object.at = { ...s.at }; e.object.dir = { ...s.dir };
          e.owner.items.drop(e.object, 0, 0); e.object.shelf = s.shelf; e.object.resetMotion();
        }
      }
    } else {
      e.object.release();
      if (origin?.created && e.kind === 'thing') e.owner.props.remove(e.object);
    }
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
