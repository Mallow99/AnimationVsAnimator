import { Skill, type Ctx } from './context';
import { DoodleSkill } from '../skills';
import { BUILTIN_ITEMS, type Item } from '../items';
import type { Doodle } from '../doodles';

/** Draw a working version of a built-in tool, preserving its use and combat properties. */
export class DrawTool extends Skill {
  readonly name = 'drawtool';
  item: Item | null = null;
  private drawing: DoodleSkill | null = null;
  private context: Ctx | null = null;
  constructor(
    readonly id = 'foam-sword',
    private replace = false,
  ) {
    super();
  }
  start(c: Ctx) {
    const base = BUILTIN_ITEMS.find((d) => d.id === this.id),
      pen = c.items.find('draw');
    if (!base || !pen || pen.where === 'cursor' || !c.char.useHand) return;
    const span = base.length + base.grip + 10;
    const shape = base.shape
      .map((st) =>
        st.pts.map(([along, across]) => ({
          x: across / span,
          y: (base.length / 2 - along) / span,
        })),
      )
      .filter((st) => st.length >= 2);
    const onBecome = (d: Doodle) => {
      if (this.item) return;
      for (const it of [...c.items.list])
        if (
          it.def.id === `ink-${base.id}` &&
          ['belt', 'hand'].includes(it.where)
        )
          c.items.remove(it);
      const def = {
        ...structuredClone(base),
        id: `ink-${base.id}`,
        name: `Drawn ${base.name}`,
        drawn: true,
        about: 'Made with his pen. It works like the original.',
        shape: base.shape.map((st) => ({
          ...st,
          color: c.inkColor,
          fill: undefined,
          width: Math.max(1.7, st.width),
        })),
      };
      c.items.defs.set(def.id, def);
      if (this.replace)
        for (const it of [...c.items.list])
          if (it.def.id === base.id && ['belt', 'hand'].includes(it.where))
            c.items.remove(it);
      this.item = c.items.give(def, c.char);
      if (this.item && c.char.useHand)
        c.items.toHand(this.item, c.char.useHand);
      d.alive = true;
      c.burst?.(d.cx ?? c.char.x, d.cy ?? c.char.body.j.neck.y, 12);
      c.sound?.('poof', 0.7);
    };
    this.context = { ...c, onBecome };
    this.drawing = new DoodleSkill(shape, base.name, { becomes: 'item' });
    this.drawing.start(this.context);
    c.say('I can make one.', 1.3);
  }
  update(c: Ctx, dt: number) {
    if (!this.drawing || !this.context) return true;
    this.drawing.t += dt;
    return this.drawing.update(this.context, dt) || this.t > 25;
  }
  stop(c: Ctx) {
    if (this.drawing && this.context) this.drawing.stop(this.context);
    if (this.item?.where === 'hand') c.items.stow(this.item);
  }
}
