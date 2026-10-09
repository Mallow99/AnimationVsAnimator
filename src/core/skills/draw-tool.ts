import { Skill, type Ctx } from "./context";
import { DoodleSkill } from "../skills";
import { type Item } from "../items";
import type { Doodle } from "../doodles";

/** Draw a working version of a built-in tool, preserving its use and combat properties. */
export class DrawTool extends Skill {
  readonly name = "drawtool";
  item: Item | null = null;
  private drawing: DoodleSkill | null = null;
  private context: Ctx | null = null;
  constructor(
    readonly id = "foam-sword",
  ) {
    super();
  }
  start(c: Ctx) {
    const base = c.items.defs.get(this.id),
      pen = c.items.find("draw");
    if (
      !base ||
      base.drawable === false ||
      !pen ||
      pen.where === "cursor" ||
      !c.char.useHand
    )
      return;
    const span = base.length + base.grip + 10;
    const sprite = base.sprite;
    const strokes = base.shape.length
      ? base.shape
      : sprite
        ? [
            {
              pts: [
                [sprite.x, sprite.y],
                [sprite.x + sprite.rows[0].length * sprite.pixel, sprite.y],
                [
                  sprite.x + sprite.rows[0].length * sprite.pixel,
                  sprite.y + sprite.rows.length * sprite.pixel,
                ],
                [sprite.x, sprite.y + sprite.rows.length * sprite.pixel],
                [sprite.x, sprite.y],
              ] as [number, number][],
            },
          ]
        : [];
    const shape = strokes
      .map((st) =>
        st.pts.map(([along, across]) => ({
          x: across / span,
          y: (base.length / 2 - along) / span,
        })),
      )
      .filter((st) => st.length >= 2);
    const onBecome = (d: Doodle) => {
      if (this.item) return;
      const def = {
        ...structuredClone(base),
        id: `ink-${base.id}`.slice(0, 30),
        name: `Drawn ${base.name}`,
        drawn: true,
        sprite: base.sprite
          ? {
              ...structuredClone(base.sprite),
              palette: Object.fromEntries(
                Object.keys(base.sprite.palette).map((key) => [
                  key,
                  c.inkColor,
                ]),
              ),
            }
          : undefined,
        about: "Made with his pen. It works like the original.",
        shape: base.shape.map((st) => ({
          ...st,
          color: c.inkColor,
          fill: undefined,
          width: Math.max(1.7, st.width),
        })),
      };
      c.items.defs.set(def.id, def);
      // Drawing makes a new original. Even a combat replacement must not consume an owned tool
      // or unfinished project; the missing/disarmed tool can still be recovered later.
      this.item = c.items.give(def, c.char);
      if (this.item)
        this.item.ink = {
          source: base.id,
          progress: 0,
          remaining: c.inkLifetime === 0 ? -1 : (c.inkLifetime ?? 300),
        };
      if (this.item && c.char.useHand)
        c.items.toHand(this.item, c.char.useHand);
      d.alive = true;
      c.burst?.(d.cx ?? c.char.x, d.cy ?? c.char.body.j.neck.y, 12);
      c.sound?.("poof", 0.7);
    };
    this.context = { ...c, onBecome };
    this.drawing = new DoodleSkill(shape, base.name, { becomes: "item" });
    this.drawing.start(this.context);
    c.say("I can make one.", 1.3);
  }
  update(c: Ctx, dt: number) {
    if (!this.drawing || !this.context) return true;
    this.drawing.t += dt;
    return this.drawing.update(this.context, dt) || this.t > 25;
  }
  stop(c: Ctx) {
    if (this.drawing && this.context) this.drawing.stop(this.context);
    if (this.item?.where === "hand") c.items.stow(this.item);
  }
}
