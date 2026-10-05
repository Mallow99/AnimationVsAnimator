// A figure visits an existing file/folder's actual native window, clipped to its contents.
// The desktop body is parked while its visiting body uses the same identity and saved state.
import { Pet } from "../core/pet";
import type { FileWindow } from "../shared/desktop";
import type { Bounds } from "../core/physics";

interface Visit {
  path: string;
  pet: Pet;
  home: Pet;
  frame: FileWindow | null;
}
function figureSave(pet: Pet) {
  const data = JSON.parse(pet.save());
  delete data.props;
  return JSON.stringify(data);
}
export class FileHabitats {
  private visits = new Map<number, Visit>();
  private windows: FileWindow[] = [];
  constructor(
    private changed: (homes: { id: number; path: string }[]) => void,
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
  private frame(path: string) {
    return this.windows.find((w) => w.path === path) ?? null;
  }
  enter(id: number, home: Pet, path: string) {
    if (this.visits.has(id)) this.returnHome(id);
    home.mind.reset(home.ctx);
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
    pet.load(figureSave(home));
    pet.memory.load(home.memory.save());
    pet.onDesktopAction = home.onDesktopAction;
    pet.brain.ask = home.brain.ask;
    pet.onBlip = home.onBlip;
    pet.onSound = home.onSound;
    this.visits.set(id, { path, pet, home, frame: null });
    home.paused = true;
    home.others = [];
    this.refresh(this.windows);
    this.notify();
  }
  refresh(windows: FileWindow[]) {
    this.windows = windows;
    for (const visit of this.visits.values()) {
      const frame = this.frame(visit.path),
        before = visit.frame;
      visit.frame = frame;
      if (!frame) continue;
      const b = {
        left: frame.x + 12,
        right: frame.x + frame.width - 12,
        top: frame.y + 70,
        floor: frame.y + frame.height - 22,
      };
      visit.pet.setBounds(b);
      if (!before)
        visit.pet.char.body.translate(
          (b.left + b.right) / 2 - visit.pet.char.x,
          b.floor - visit.pet.char.body.j.footR.y,
        );
      else
        visit.pet.char.body.translate(frame.x - before.x, frame.y - before.y);
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
  }
  update(dt: number) {
    for (const visit of this.visits.values())
      if (visit.frame) visit.pet.update(dt);
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
        g.clip("evenodd");
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
      if (
        !f ||
        x < f.x + 8 ||
        x > f.x + f.width - 8 ||
        y < f.y + 64 ||
        y > f.y + f.height - 12
      )
        continue;
      const index = nativeWindows.findIndex((w) => w.id === f.id);
      if (
        index < 0 ||
        nativeWindows
          .slice(0, index)
          .some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h)
      )
        continue;
      if (visit.pet.hit(x, y) || visit.pet.uiHit(x, y) || visit.pet.carrying)
        return visit.pet;
    }
    return null;
  }
  returnHome(id: number) {
    const visit = this.visits.get(id);
    if (!visit) return;
    visit.pet.mind.reset(visit.pet.ctx);
    visit.home.load(figureSave(visit.pet));
    visit.home.memory.load(visit.pet.memory.save());
    visit.home.paused = false;
    visit.pet.leaveWorld();
    this.visits.delete(id);
    this.notify();
  }
  save() {
    return [...this.visits].map(([id, v]) => ({
      id,
      path: v.path,
      save: figureSave(v.pet),
      memory: v.pet.memory.save(),
    }));
  }
  restore(saved: unknown, pets: Pet[]) {
    if (!Array.isArray(saved)) return;
    for (const v of saved.slice(0, 5))
      if (
        v &&
        Number.isInteger(v.id) &&
        pets[v.id] &&
        typeof v.path === "string" &&
        v.path.length < 4096
      ) {
        this.enter(v.id, pets[v.id], v.path);
        const visit = this.visits.get(v.id)!;
        if (typeof v.save === "string") visit.pet.load(v.save);
        if (typeof v.memory === "string") visit.pet.memory.load(v.memory);
      }
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
    this.changed([...this.visits].map(([id, v]) => ({ id, path: v.path })));
  }
}
