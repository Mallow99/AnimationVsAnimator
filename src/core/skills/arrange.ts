import { Skill, arrive, type Ctx } from "./context";
import { propActions } from "../capabilities";
import type { Thing } from "../props";
import { GroupActivity, groupPlan } from "./group";

/** Find a floor destination with furniture clearance. No route through other solid furniture. */
export function arrangement(c: Ctx, object: Thing, near: Thing): number | null {
  const width =
    (object.def!.bounds![2] - object.def!.bounds![0]) * object.scale;
  const nw = (near.def!.bounds![2] - near.def!.bounds![0]) * near.scale;
  const candidates = [
    near.center.x + nw / 2 + width / 2 + 32,
    near.center.x - nw / 2 - width / 2 - 32,
  ];
  for (const x of candidates.sort(
    (a, b) => Math.abs(a - object.center.x) - Math.abs(b - object.center.x),
  )) {
    if (
      x - width / 2 < c.world.bounds.left + 8 ||
      x + width / 2 > c.world.bounds.right - 8
    )
      continue;
    const lo = Math.min(x, object.center.x) - width / 2 - 5,
      hi = Math.max(x, object.center.x) + width / 2 + 5;
    if (
      c.props!.things.some(
        (t) =>
          t !== object &&
          t !== near &&
          t.collisionHull.some(
            (p) =>
              p.x > lo &&
              p.x < hi &&
              p.y > c.world.bounds.floor - 90 * c.char.scale,
          ),
      )
    )
      continue;
    // A target on the opposite side of the couch would require crossing it.
    if (
      (object.center.x - near.center.x) * (x - near.center.x) < 0 &&
      Math.abs(object.center.x - near.center.x) > nw / 2
    )
      continue;
    return x;
  }
  return null;
}
export class MoveFurniture extends Skill {
  readonly name = "arrange";
  private object: Thing | null = null;
  private near: Thing | null = null;
  private destination: number | null = null;
  private phase: "go" | "move" = "go";
  private wait = 0;
  private asked = false;
  private baseY = 0;
  private carrying = false;
  constructor(
    private id = "tv",
    private nearId = "couch",
  ) {
    super();
  }
  start(c: Ctx) {
    this.object =
      c.props?.placed.find(
        (t) => t.def?.id === this.id || t.ink?.source === this.id,
      ) ?? null;
    this.near =
      c.props?.placed.find(
        (t) =>
          t !== this.object &&
          (t.def?.id === this.nearId || t.ink?.source === this.nearId),
      ) ?? null;
    if (!this.object || !this.near)
      c.say(`I need a ${this.id} and ${this.nearId}.`, 1.6);
    else this.destination = arrangement(c, this.object, this.near);
    if (this.object && this.near && this.destination === null)
      c.say("There isn’t a clear route.", 1.5);
  }
  update(c: Ctx, dt: number) {
    const o = this.object,
      near = this.near,
      ch = c.char;
    if (
      !o ||
      !near ||
      this.destination === null ||
      !c.props?.things.includes(o) ||
      !c.props.things.includes(near) ||
      o.def?.movable === false ||
      o.held ||
      Math.abs(o.tilt) > 0.4 ||
      !ch.whole ||
      ch.mode !== "ground" ||
      this.t > 35
    )
      return true;
    if (o.movingBy && o.movingBy !== c.who) return true;
    if (o.sitters.size || o.watchers.size || o.players.length || o.load.size) {
      if (!this.asked) {
        this.asked = true;
        c.say("Can I move this when you’re done?", 1.8);
      }
      this.wait += dt;
      return this.wait > 5;
    }
    const width = (o.def!.bounds![2] - o.def!.bounds![0]) * o.scale,
      dir = Math.sign(this.destination - o.center.x) || 1;
    if (this.phase === "go") {
      if (!arrive(c, o.center.x - dir * (width / 2 + 18 * ch.scale), 10))
        return false;
      this.phase = "move";
      o.movingBy = c.who;
      ch.stop();
      this.baseY = o.center.y;
      this.carrying =
        o.def!.move === "carry" || (!o.def!.move && width < 65 * ch.scale);
      c.say(
        width < 65 * ch.scale
          ? "I’ll carry this."
          : width < 100 * ch.scale
            ? "Let’s drag it over."
            : "A little push…",
        1.4,
      );
    }
    if (
      this.t > 1 &&
      Math.abs(ch.x - (o.center.x - dir * (width / 2 + 18 * ch.scale))) >
        70 * ch.scale
    )
      return true;
    // Recheck clearances as the user or another figure changes the room.
    const dx = this.destination - o.center.x;
    if (Math.abs(dx) < 3) {
      o.facing = near.center.x < o.center.x ? -1 : 1;
      c.say("That’s better.", 1.4);
      return true;
    }
    const step =
      Math.sign(dx) *
      Math.min(
        Math.abs(dx),
        dt *
          (width < 65 * ch.scale ? 60 : width < 100 * ch.scale ? 42 : 28) *
          ch.scale,
      );
    const next = o.center.x + step;
    if (
      c.props.things.some(
        (t) =>
          t !== o &&
          t !== near &&
          t.collisionHull.some(
            (p) =>
              Math.abs(p.x - next) < width / 2 + 4 &&
              p.y > c.world.bounds.floor - 60 * ch.scale,
          ),
      )
    ) {
      c.say("Something’s in the way.", 1.5);
      return true;
    }
    // Moving via the rigid frame retains collision/platform identities. Light props lift slightly.
    o.place(
      { x: next, y: this.baseY - (this.carrying ? 10 * ch.scale : 0) },
      0,
    );
    ch.walkTo(next - dir * (width / 2 + 18 * ch.scale));
    ch.handTarget = o.toWorld(dir > 0 ? 0 : o.def!.bounds![2], 5);
    ch.posture.hunch = width > 90 * ch.scale ? 0.6 : 0.25;
    ch.posture.tension = 0.6;
    return false;
  }
  stop(c: Ctx) {
    if (this.object?.movingBy === c.who) {
      if (this.carrying && !this.object.held)
        this.object.place({ x: this.object.center.x, y: this.baseY }, 0);
      this.object.movingBy = null;
    }
    c.char.handTarget = null;
    c.char.stop();
  }
}
export function arrangingSkill(c: Ctx, name: string): Skill | null {
  if (name === "arrange") return new MoveFurniture();
  if (name === "readingcorner") return new MoveFurniture("chair", "storage");
  if (name === "workcorner") return new MoveFurniture("workbench", "desk");
  if (name === "carrytogether") {
    const object = c.props?.placed.find(
        (t) =>
          !!t.def &&
          propActions(t.def).includes("watch") &&
          !t.held &&
          !t.movingBy &&
          !t.watchers.size,
      ),
      near = c.props?.placed.find(
        (t) => !!t.def && propActions(t.def).includes("sit") && t.seatRoom > 1,
      );
    if (!object || !near) return null;
    const dest = arrangement(c, object, near);
    if (dest === null) return null;
    const plan = groupPlan(c, "carry", object, dest);
    return plan ? new GroupActivity(plan) : null;
  }
  return null;
}
