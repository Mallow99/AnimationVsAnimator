import { ReadingLight } from './domestic';
import { Skill, arrive, type Ctx } from "./context";
import { DoodleSkill } from "../skills";
import { DrawTool } from "./draw-tool";
import { parseItemDef, type Item } from "../items";
import type { Thing, PropDef } from "../props";
import type { Vec } from "../math";
import { propActions } from "../capabilities";
import { propsOf } from "./props";

export function propBlueprint(def: PropDef): { shape: Vec[][]; size: number } {
  const b = def.bounds!,
    size = Math.max(b[2] - b[0], b[3] - b[1]);
  const strokes = def.shape.flatMap((st) =>
    st.rect
      ? ([
          [
            [st.rect[0], st.rect[1]],
            [st.rect[0] + st.rect[2], st.rect[1]],
            [st.rect[0] + st.rect[2], st.rect[1] + st.rect[3]],
            [st.rect[0], st.rect[1] + st.rect[3]],
            [st.rect[0], st.rect[1]],
          ],
        ] as [number, number][][])
      : [st.fill ? [...st.pts, st.pts[0]] : st.pts],
  );
  if (!strokes.length) strokes.push([...def.outline, def.outline[0]]);
  return {
    size,
    shape: strokes.map((st) =>
      st.map(([x, y]) => ({
        x: (x - (b[0] + b[2]) / 2) / size,
        y: (y - (b[1] + b[3]) / 2) / size,
      })),
    ),
  };
}
export class DrawFurniture extends Skill {
  readonly name = "drawfurniture";
  private drawing: DoodleSkill | null = null;
  private context: Ctx | null = null;
  object: Thing | null = null;
  constructor(readonly id: string) {
    super();
  }
  start(c: Ctx) {
    const def = c.props?.defs.get(this.id);
    if (!def || def.drawable === false || !c.items.find("draw")) return;
    const blueprint = propBlueprint(def);
    this.context = {
      ...c,
      onBecome: (d) => {
        if (this.object || !d.done) return;
        const inkDef = {
          ...structuredClone(def),
          id: `ink-${def.id}`.slice(0, 30),
          name: `Drawn ${def.name}`,
          sprite: undefined,
          shape: def.shape.length
            ? def.shape.map((st) => ({
                ...st,
                fill: undefined,
                color: c.inkColor,
                width: 1.8,
              }))
            : [
                {
                  pts: [...def.outline, def.outline[0]],
                  color: c.inkColor,
                  width: 1.8,
                },
              ],
        };
        c.props!.defs.set(inkDef.id, inkDef);
        this.object = c.props!.spawn(
          inkDef.id,
          d.cx!,
          d.cy! - (blueprint.size * c.char.scale) / 2,
          c.char.scale,
        );
        if (this.object) {
          this.object.ink = {
            source: def.id,
            progress: 0,
            remaining: c.inkLifetime === 0 ? -1 : (c.inkLifetime ?? 300),
          };
          d.alive = true;
          c.burst?.(d.cx!, d.cy!, 12);
          c.sound?.("poof", 0.6);
        }
      },
    };
    this.drawing = new DoodleSkill(blueprint.shape, def.name, {
      becomes: "item",
      size: blueprint.size * c.char.scale,
    });
    this.drawing.start(this.context);
    c.say(`Drawing a ${def.name.toLowerCase()}.`, 1.5);
  }
  update(_c: Ctx, dt: number) {
    if (!this.drawing || !this.context) return true;
    this.drawing.t += dt;
    return this.drawing.update(this.context, dt);
  }
  stop(_c: Ctx) {
    if (this.drawing && this.context) this.drawing.stop(this.context);
  }
}

/** Desk paper is an actual traced blueprint; the pen remains the existing tool controller. */
export class DeskWork extends Skill {
  readonly name = "deskwork";
  private drawing: DoodleSkill | null = null;
  private chair: Thing | null = null;
  private savedBlueprint = false;
  private light=new ReadingLight();
  constructor(
    private desk: Thing,
    private id = "katana",
  ) {
    super();
  }
  update(c: Ctx, dt: number) {
    if (
      !c.props?.things.includes(this.desk) ||
      this.desk.held ||
      this.desk.movingBy ||
      Math.abs(this.desk.tilt) > 0.35
    )
      return true;
    if (!this.drawing) {
      if (this.t > 25 || !c.char.useHand) return true;
      if(!this.light.prepare(c,dt))return false;
      const paper = this.desk.toWorld(28, -3);
      const chair = propsOf(c, "seat").find(
        (t) =>
          !t.sitters.size && Math.abs(t.center.x - paper.x) < 65 * c.char.scale,
      );
      if (!arrive(c, chair?.seatAt?.x ?? paper.x - 20 * c.char.scale, 8))
        return false;
      if (chair?.claimSeat(c.who, c.char.x)) {
        this.chair = chair;
        c.char.sitOn(chair.seatFor(c.who)!, 1, "up");
      }
      c.char.facing = 1;
      const def = c.items.defs.get(this.id),
        span = def ? def.length + def.grip : 46;
      const shape = def?.shape.map((st) =>
        st.pts.map(([x, y]) => ({
          x: y / span,
          y: (def.length / 2 - x) / span,
        })),
      );
      this.drawing = new DoodleSkill(shape, `${this.id} blueprint`, {
        surface: this.desk,
      });
      this.drawing.start(c);
      c.say("Making a blueprint.", 1.5);
    }
    this.drawing.t += dt;
    const done = this.drawing.update(c, dt);
    if (
      done &&
      !this.savedBlueprint &&
      this.desk.art?.title === `${this.id} blueprint`
    ) {
      this.savedBlueprint = true;
      const def = parseItemDef({
        id: `blueprint-${this.id}`,
        name: `${this.id} blueprint`,
        about: "A traced plan from the desk, kept in the satchel.",
        blueprint: this.id,
        use: "none",
        belt: "pocket",
        length: 18,
        grip: 2,
        shape: [
          {
            pts: [
              [-2, -8],
              [18, -8],
              [18, 8],
              [-2, 8],
            ],
            fill: "#e7dfc5",
            width: 1,
            color: "#9c967e",
          },
          ...this.desk.art.shape.map((st) => ({
            pts: st.map((p) => [8 - p.y * 16, p.x * 16]),
            color: c.inkColor,
            width: 1,
          })),
        ],
      });
      if (def) {
        c.items.defs.set(def.id, def);
        c.items.give(def, c.char);
      }
    }
    return done;
  }
  stop(c: Ctx) {
    this.light.stop(c);
    this.drawing?.stop(c);
    if (this.chair) {
      this.chair.leaveSeat(c.who);
      c.char.standUp();
    }
  }
}

/** Work progresses only at the bench. State lives on the same object; no replacements or duplicates. */
export class RefineProject extends Skill {
  readonly name = "refine";
  private object: Item | Thing | null = null;
  private bench: Thing | null = null;
  private working = false;
  private announced = -1;
  private source: Item["def"] | PropDef | null = null;
  constructor(private selectedBench?: Thing) { super(); }
  start(c: Ctx) {
    this.bench =
      this.selectedBench ?? propsOf(c, "work").find((t) => propActions(t.def!).includes("refine")) ??
      null;
    this.object =
      c.items.list.find((i) => i.ink && i.where !== "cursor") ??
      c.props?.placed.find(
        (t) => t.ink && !t.held && !t.sitters.size && !t.movingBy,
      ) ??
      null;
    if (this.object?.ink)
      this.source =
        "where" in this.object
          ? (c.items.defs.get(this.object.ink.source) ?? null)
          : (c.props?.defs.get(this.object.ink.source) ?? null);
    if (!this.bench) c.say("I need a workbench.", 1.5);
    else if (!this.object || !this.source || this.source.refinable === false)
      c.say("No project I can refine.", 1.5);
  }
  update(c: Ctx, dt: number) {
    const o = this.object,
      bench = this.bench;
    if (
      !o?.ink ||
      !bench ||
      !this.source ||
      this.source.refinable === false ||
      !c.props?.things.includes(bench) ||
      bench.held ||
      Math.abs(bench.tilt) > 0.35 ||
      !c.char.useHand
    )
      return true;
    if (
      "where" in o
        ? !c.items.list.includes(o) || o.where === "cursor"
        : !c.props.things.includes(o) || !!o.held || !!o.sitters.size
    )
      return true;
    const at = bench.toWorld(27, -13);
    if (!this.working) {
      if (this.t > 18) return true;
      if (!arrive(c, at.x - 20 * c.char.scale, 8)) return false;
      if ("where" in o) {
        o.working = true;
        c.items.toHand(o, c.char.useHand);
        o.aim = { x: 1, y: 0, z: 0 };
      } else {
        o.movingBy = c.who;
        o.place(
          {
            x: at.x,
            y: at.y - ((o.def!.bounds![3] - o.def!.bounds![1]) * o.scale) / 2,
          },
          0,
        );
      }
      this.working = true;
      c.char.stop();
    }
    if (
      c.char.mode !== "ground" ||
      Math.abs(c.char.x - (at.x - 20 * c.char.scale)) > 45 * c.char.scale
    )
      return true;
    o.ink.progress = Math.min(
      1,
      o.ink.progress + dt / (c.talent === "building" ? 6 : 8),
    );
    const phase = o.ink.progress < 0.6 ? 0 : 1;
    if (phase !== this.announced) {
      this.announced = phase;
      c.say(phase === 0 ? "Coloring it in…" : "Polishing…", 1.5);
    }
    c.char.handTarget = {
      x: at.x + Math.sin(this.t * 12) * 6 * c.char.scale,
      y: at.y,
    };
    // Color appears one shape at a time; polish sparkles precede completion.
    const count = Math.ceil(
      this.source.shape.length * Math.min(1, o.ink.progress / 0.6),
    );
    o.def = {
      ...o.def!,
      sprite: o.ink.progress >= 0.6 ? this.source.sprite : undefined,
      shape: this.source.shape.length
        ? this.source.shape.map((st, i) =>
            i < count
              ? structuredClone(st)
              : { ...st, fill: undefined, color: c.inkColor, width: 1.8 },
          )
        : o.def!.shape,
    } as typeof o.def;
    if (phase && Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8))
      c.burst?.(at.x, at.y, 2);
    if (o.ink.progress < 1) return false;
    o.def = structuredClone(this.source) as typeof o.def;
    o.ink = undefined;
    if ("where" in o) {
      o.working = false;
      o.resetMotion();
      o.aim = null;
      c.items.stow(o);
    } else {
      o.movingBy = null;
      o.forever = true;
    }
    c.say("Finished!", 1.5);
    c.sound?.("poof", 0.7);
    return true;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
    const o = this.object;
    if (!o) return;
    if ("where" in o) {
      o.working = false;
      o.resetMotion();
      o.aim = null;
      if (o.where === "hand") c.items.stow(o);
    } else if (o.movingBy === c.who) o.movingBy = null;
  }
}

/** Put tools on the shelf with an observable pick/place cycle; ownership stays local. */
export class SortTools extends Skill {
  readonly name = "sorttools";
  private shelf: Thing | null = null;
  private item: Item | null = null;
  private index = 0;
  private phase: "fetch" | "place" = "fetch";
  constructor(private selectedShelf?: Thing) { super(); }
  start(c: Ctx) {
    this.shelf = this.selectedShelf ?? propsOf(c, "storage")[0] ?? null;
    if (!this.shelf) c.say("I need a tool shelf.", 1.5);
  }
  update(c: Ctx) {
    const shelf = this.shelf;
    if (
      !shelf ||
      shelf.held ||
      !c.props?.things.includes(shelf) ||
      this.t > 50 ||
      !c.char.useHand ||
      Math.abs(shelf.tilt) > 0.35
    )
      return true;
    const spot = shelf.toWorld(12 + this.index * 15, -5);
    if (this.phase === "fetch") {
      this.item ??=
        c.items.list.find(
          (i) =>
            i.where === "world" &&
            Math.abs(i.at.x - shelf.center.x) > 65 * shelf.scale,
        ) ?? null;
      if (!this.item || this.index >= 6) return true;
      if (this.item.where !== "world") return true;
      if (!arrive(c, this.item.at.x, 10)) return false;
      c.char.handTarget = this.item.at;
      c.items.toHand(this.item, c.char.useHand);
      this.phase = "place";
      return false;
    }
    if (this.item?.where !== "hand") return true;
    if (!arrive(c, spot.x - 10 * c.char.scale, 10)) return false;
    c.char.handTarget = spot;
    this.item.at = { ...spot, z: 0 };
    this.item.dir = { x: 1, y: 0, z: 0 };
    c.items.drop(this.item, 0, 0);
    this.item = null;
    this.index++;
    this.phase = "fetch";
    return false;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
    if (this.item?.where === "hand") c.items.stow(this.item);
  }
}

export function workshopSkill(c: Ctx, name: string): Skill | null {
  if (name.startsWith("drawitem:")) {
    const id = name.slice(9);
    return c.items.defs.get(id)?.drawable !== false &&
      c.items.defs.has(id) &&
      c.items.find("draw")
      ? new DrawTool(id)
      : null;
  }
  if (name.startsWith("drawprop:")) {
    const id = name.slice(9);
    return c.props?.defs.get(id)?.drawable !== false &&
      c.props?.defs.has(id) &&
      c.items.find("draw")
      ? new DrawFurniture(id)
      : null;
  }
  if (name === "refine") return new RefineProject();
  if (name === "sorttools") return new SortTools();
  if (name === "deskwork") {
    const desk = propsOf(c, "work").find(
      (t) => !propActions(t.def!).includes("refine"),
    );
    return desk && c.items.find("draw") ? new DeskWork(desk) : null;
  }
  return null;
}
