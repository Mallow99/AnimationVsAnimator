import { Skill, type Ctx } from "./context";
import { Tool } from "../skills";
import { Runner } from "../tv-game";
import type { Item } from "../items";
export class PlayHandheld extends Skill {
  readonly name = "handheld";
  private tool = new Tool("game");
  private item: Item | null = null;
  private nextComment = 10;
  update(c: Ctx, dt: number) {
    if (!this.item) {
      const result = this.tool.fetch(c, dt);
      if (result === "none") {
        c.say("I need a handheld.", 1.5);
        return true;
      }
      if (result !== "ready") return this.t > 12;
      this.item = this.tool.item!;
      this.item.arcade = new Runner(c.talent === "games" ? 0.9 : 0.65);
    }
    if (this.item.where !== "hand" || !c.char.useHand) return true;
    const neck = c.char.body.j.neck;
    c.char.handsAt = {
      [this.item.hand]: { x: c.char.x - 8 * c.char.scale, y: neck.y + 22 * c.char.scale },
      [this.item.hand === "L" ? "R" : "L"]: { x: c.char.x + 13 * c.char.scale, y: neck.y + 22 * c.char.scale },
    };
    this.item.aim = { x: 1, y: 0, z: 0 };
    const events = this.item.arcade!.step(dt);
    if (this.t > this.nextComment) {
      this.nextComment = this.t + 30;
      c.say(
        this.item.arcade!.score > 3 ? "New high score?" : "One more try.",
        1.4,
      );
    }
    c.mood.s.boredom = Math.max(0, c.mood.s.boredom - dt / 100);
    return this.t > 90 && events.includes('crash') || this.t > 150;
  }
  stop(c: Ctx) {
    c.char.handsAt = null;
    if (this.item) {
      this.item.arcade = null;
      this.item.aim = null;
      if (this.item.where === "hand") c.items.stow(this.item);
    }
  }
}
