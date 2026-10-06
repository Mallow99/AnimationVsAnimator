import { Skill, arrive, type Ctx } from "./context";
export class FriendlyMoment extends Skill {
  readonly name = "moment";
  private peer: string | null = null;
  private sent = false;
  constructor(private kind: "pass" | "compare" | "check") {
    super();
  }
  start(c: Ctx) {
    const peers = c.peers?.() ?? [];
    const target = peers
      .filter(
        (v) =>
          v.id &&
          !v.asleep &&
          !v.group &&
          (this.kind === "check"
            ? v.hp < 0.5 || ["ragdoll", "getup"].includes(v.mode)
            : !v.busy),
      )
      .sort(
        (a, b) =>
          (this.kind === "compare"
            ? Number(b.talent === "drawing") - Number(a.talent === "drawing")
            : 0) || Math.abs(a.x - c.char.x) - Math.abs(b.x - c.char.x),
      )[0];
    this.peer = target?.id ?? null;
  }
  update(c: Ctx) {
    const v = c.peers?.().find((v) => v.id === this.peer);
    if (!v || this.t > 10) return true;
    if (!arrive(c, v.x + (c.char.x < v.x ? -30 : 30) * c.char.scale, 10))
      return false;
    c.look = "target";
    c.lookTarget = v.joints.neck ?? null;
    if (!this.sent) {
      this.sent = true;
      if (this.kind === "pass") {
        const pens = c.items.onHim.filter((i) => i.def.use === "draw").length;
        const item = c.items.onHim.find(
          (i) =>
            !i.def.wear &&
            i.where === "belt" &&
            (i.def.use !== "draw" || pens > 1),
        );
        if (!item) {
          c.say("I don’t have a spare tool.", 1.5);
          return true;
        }
        c.items.remove(item);
        c.tellTo?.(this.peer!, {
          type: "toolGift",
          token: `${c.who}:${item.uid}:${c.world.time}`,
          def: structuredClone(item.def),
          ammo: item.ammo,
          reloadRemaining: item.reloadRemaining,
          ink: item.ink,
        });
        c.say("Here, have a look.", 1.4);
      } else {
        if (this.kind === "compare")
          c.say(
            v.talent === "drawing"
              ? "What would you change?"
              : "Want to compare?",
            1.4,
          );
        c.tellTo?.(this.peer!, { type: "moment", kind: this.kind });
      }
      c.recordActivity?.(this.peer!, this.kind, true);
    }
    const hand = v.joints.handL ?? v.joints.neck;
    if (hand) c.char.handTarget = hand;
    return this.t > 3;
  }
  stop(c: Ctx) {
    c.char.handTarget = null;
  }
}
