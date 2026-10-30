// A figure visits an existing file/folder's actual native window, clipped to its contents.
// The desktop body is parked while its visiting body uses the same identity and saved state.
import { Pet } from '../core/pet';
import type { FileWindow, FileVisitStatus } from '../shared/desktop';

interface Visit {
  path: string;
  pet: Pet;
  home: Pet;
  frame: FileWindow | null;
  kind: 'folder' | 'file';
  paused: boolean;
  placed: boolean;
}
function figureSave(pet: Pet, items = true) {
  const data = JSON.parse(pet.save());
  delete data.props;
  if (!items) delete data.items;
  return JSON.stringify(data);
}
export class FileHabitats {
  private visits = new Map<number, Visit>();
  private windows: FileWindow[] = [];
  private lastStatus = '';
  constructor(
    private changed: (homes: FileVisitStatus[]) => void,
    private configure: (id: number, pet: Pet) => void = () => {},
  ) {}
  petFor(id: number) {
    return this.visits.get(id)?.pet ?? null;
  }
  isAway(id: number) {
    return this.visits.has(id);
  }
  get activePets() {
    return [...this.visits.values()].filter((v) => v.frame).map((v) => v.pet);
  }
  get allPets() {
    return [...this.visits.values()].map((v) => v.pet);
  }
  private frame(path: string) {
    return this.windows.find((w) => w.path === path) ?? null;
  }
  enter(id: number, home: Pet, path: string, kind: 'folder' | 'file' = 'folder') {
    // Transport must finish before changing worlds; no controller may retain an old owner.
    if (home.items.carried || home.userWeaponControlled) return false;
    if (this.visits.has(id)) this.returnHome(id);
    const paused = home.paused;
    home.leaveWorld();
    home.char.cancelGesture();
    home.pointerUp(0, 0);
    const pet = new Pet(
      { left: 0, right: 600, top: 0, floor: 400 },
      {
        ...home.config,
        windows: false,
        moveWindows: false,
        mischief: false,
        knockCursor: false,
      },
      { identity: home.ctx.who },
    );
    pet.items.defs = new Map(home.items.defs);
    pet.props.defs = new Map(home.props.defs);
    pet.load(figureSave(home, false));
    // Move the originals, including bookmarks, ink and reload clocks. Never clone inventory.
    pet.items.list = home.items.list;
    pet.items.belt = home.items.belt;
    pet.items.known = new Set(home.items.known);
    home.items.list = [];
    home.items.belt = home.items.belt.map(() => null);
    const old = home.ctx.world.bounds;
    for (const item of pet.items.list)
      if (item.where === 'world') item.translate(300 - (old.left + old.right) / 2, 400 - old.floor);
    pet.memory.load(home.memory.save());
    pet.onDesktopAction = home.onDesktopAction;
    pet.brain.ask = home.brain.ask;
    pet.onBlip = home.onBlip;
    pet.onSound = home.onSound;
    this.configure(id, pet);
    this.visits.set(id, { path, pet, home, frame: null, kind, paused, placed: false });
    home.paused = true;
    home.others = [];
    this.refresh(this.windows);
    this.notify();
    return true;
  }
  refresh(windows: FileWindow[]) {
    this.windows = windows.filter(
      (w) =>
        w &&
        typeof w.path === 'string' &&
        [w.id, w.x, w.y, w.width, w.height].every(Number.isFinite) &&
        w.width > 100 &&
        w.height > 150,
    );
    for (const visit of this.visits.values()) {
      const frame = this.frame(visit.path),
        before = visit.frame;
      visit.frame = frame;
      if (!frame) {
        if (before) {
          const cursor = visit.pet.ctx.world.cursor;
          visit.pet.pointerUp(
            cursor?.x ?? visit.pet.char.x,
            cursor?.y ?? visit.pet.char.body.j.neck.y,
          );
        }
        continue;
      }
      const b = {
        left: frame.x + 12,
        right: frame.x + frame.width - 12,
        top: frame.y + 70,
        floor: frame.y + frame.height - 22,
      };
      const old = visit.pet.ctx.world.bounds;
      const dx = before ? frame.x - before.x : (b.left + b.right - old.left - old.right) / 2;
      const dy = before ? frame.y - before.y : b.floor - old.floor;
      visit.pet.char.translateWorld(dx, dy);
      visit.pet.setBounds(b);
      if (!visit.placed) {
        const roommates = [...this.visits.values()].filter((v) => v.path === visit.path);
        visit.pet.char.placeHome(
          b.left + ((b.right - b.left) * (roommates.indexOf(visit) + 1)) / (roommates.length + 1),
        );
        visit.placed = true;
      }
      for (const item of visit.pet.items.list) if (item.where === 'world') item.translate(dx, dy);
      for (const thing of visit.pet.props.things)
        for (const point of thing.points) {
          point.x += dx;
          point.px += dx;
          point.y += dy;
          point.py += dy;
        }
      visit.pet.setWindows(
        (frame.tops ?? []).map(([x, y, width], i) => ({
          id: 700000000 + i,
          x,
          y,
          w: width,
          h: 5,
        })),
      );
    }
    for (const visit of this.visits.values())
      visit.pet.others = [...this.visits.values()]
        .filter((v) => v !== visit && v.path === visit.path && v.frame)
        .map((v) => v.pet);
    this.notify();
  }
  update(dt: number) {
    for (const visit of this.visits.values()) if (visit.frame) visit.pet.update(dt);
  }
  draw(
    g: CanvasRenderingContext2D,
    nativeWindows: { id: number; x: number; y: number; w: number; h: number }[],
  ) {
    for (const visit of this.visits.values()) {
      const f = visit.frame;
      if (!f || !nativeWindows.some((w) => w.id === f.id)) continue;
      g.save();
      g.beginPath();
      g.rect(f.x + 8, f.y + 64, f.width - 16, f.height - 76);
      const index = nativeWindows.findIndex((w) => w.id === f.id);
      // Subtract windows in front so he cannot show through another app.
      g.clip();
      for (const w of nativeWindows.slice(0, Math.max(0, index))) {
        g.beginPath();
        g.rect(f.x + 8, f.y + 64, f.width - 16, f.height - 76);
        g.rect(w.x, w.y, w.w, w.h);
        g.clip('evenodd');
      }
      visit.pet.drawProps(g);
      visit.pet.draw(g);
      g.restore();
    }
  }
  hit(
    x: number,
    y: number,
    nativeWindows: { id: number; x: number; y: number; w: number; h: number }[],
  ) {
    for (const visit of [...this.visits.values()].reverse()) {
      const f = visit.frame;
      if (!f || x < f.x + 8 || x > f.x + f.width - 8 || y < f.y + 64 || y > f.y + f.height - 12)
        continue;
      const index = nativeWindows.findIndex((w) => w.id === f.id);
      if (
        index < 0 ||
        nativeWindows
          .slice(0, index)
          .some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h)
      )
        continue;
      if (visit.pet.hit(x, y) || visit.pet.uiHit(x, y) || visit.pet.carrying) return visit.pet;
    }
    return null;
  }
  returnHome(id: number) {
    const visit = this.visits.get(id);
    if (!visit) return;
    visit.pet.leaveWorld();
    visit.home.load(figureSave(visit.pet, false));
    visit.home.items.list = visit.pet.items.list;
    visit.home.items.belt = visit.pet.items.belt;
    visit.home.items.known = new Set(visit.pet.items.known);
    const b = visit.home.ctx.world.bounds;
    for (const item of visit.home.items.list)
      if (item.where === 'world') {
        item.at = {
          x: Math.max(b.left, Math.min(b.right, item.at.x)),
          y: Math.max(b.top, Math.min(b.floor, item.at.y)),
          z: item.at.z,
        };
        item.loosen();
      }
    visit.pet.items.list = [];
    visit.pet.items.belt = visit.pet.items.belt.map(() => null);
    visit.home.memory.load(visit.pet.memory.save());
    visit.home.paused = visit.paused;
    visit.home.enterWorld();
    visit.home.char.standUp();
    this.visits.delete(id);
    visit.home.onCollections?.();
    this.refresh(this.windows);
    this.notify();
  }
  save() {
    return [...this.visits].map(([id, v]) => ({
      id,
      path: v.path,
      kind: v.kind,
      bounds: { ...v.pet.ctx.world.bounds },
      save: figureSave(v.pet),
      memory: v.pet.memory.save(),
    }));
  }
  restore(saved: unknown, pets: Pet[], activeIds = pets.map((_, id) => id)) {
    if (!Array.isArray(saved)) return;
    for (const v of saved.slice(0, 5))
      if (
        v &&
        Number.isInteger(v.id) &&
        activeIds.includes(v.id) &&
        pets[v.id] &&
        typeof v.path === 'string' &&
        v.path.length > 0 &&
        v.path.length < 4096
      ) {
        if (!this.enter(v.id, pets[v.id], v.path, v.kind === 'file' ? 'file' : 'folder')) continue;
        const visit = this.visits.get(v.id)!;
        const b = v.bounds;
        if (
          b &&
          [b.left, b.right, b.top, b.floor].every(Number.isFinite) &&
          b.right > b.left + 50 &&
          b.floor > b.top + 50 &&
          [b.left, b.right, b.top, b.floor].every((n) => Math.abs(n) < 100000)
        ) {
          visit.pet.setBounds(b);
          visit.frame = null;
        }
        if (typeof v.save === 'string') visit.pet.load(v.save);
        if (typeof v.memory === 'string') visit.pet.memory.load(v.memory);
      }
    this.refresh(this.windows);
  }
  sync(pets: Pet[]) {
    for (const [id, visit] of this.visits)
      if (pets[id] !== visit.home) this.returnHome(id);
      else
        visit.pet.applyConfig({
          ...pets[id].config,
          windows: false,
          moveWindows: false,
          mischief: false,
          knockCursor: false,
        });
  }
  private notify() {
    const status = [...this.visits].map(([id, v]) => ({
      id,
      path: v.path,
      kind: v.kind,
      visible: !!v.frame,
    }));
    const signature = JSON.stringify(status);
    if (signature === this.lastStatus) return;
    this.lastStatus = signature;
    this.changed(status);
  }
}
