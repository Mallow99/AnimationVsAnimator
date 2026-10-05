import { Skill, arrive, type Ctx } from "./context";
import type { DesktopAction } from "../../shared/desktop";

/** Reach toward a connected page / window before asking the native shell to act. */
export class DesktopInteraction extends Skill {
  readonly name: DesktopAction;
  private requested = false;
  private finished = false;
  private cancelled = false;
  constructor(action: DesktopAction) {
    super();
    this.name = action;
  }
  update(c: Ctx, dt: number) {
    if (this.finished || this.t > 14 || !c.desktopAction) return true;
    const page = c.desktopState?.().browser;
    const target =
      this.name === "pluck" && page
        ? Math.max(
            c.world.bounds.left + 20,
            Math.min(c.world.bounds.right - 20, page.x + page.width / 2),
          )
        : c.char.x;
    if (!this.requested && this.t < 4 && !arrive(c, target, 25)) return false;
    if (!this.requested) {
      this.requested = true;
      if (c.char.ready) c.char.doGesture("wave");
      void c.desktopAction(this.name).then(
        (result) => {
          if (!this.cancelled) {
            c.say(result.message, 3);
            this.finished = true;
          }
        },
        () => {
          if (!this.cancelled) {
            c.say("That did not respond.", 2);
            this.finished = true;
          }
        },
      );
    }
    return false;
  }
  stop(c: Ctx) {
    this.cancelled = true;
    c.char.cancelGesture();
  }
}
