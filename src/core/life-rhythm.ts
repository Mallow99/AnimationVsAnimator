import type { Ctx } from "./skills/context";
export interface LifeSample {
  hour: number;
  idleSeconds: number;
}
export class LifeRhythm {
  night = false;
  private initialized = false;
  private morningWake = false;
  private idle = 0;
  private welcomedAt = -Infinity;
  receive(c: Ctx, sample: LifeSample) {
    if (!Number.isFinite(sample.hour) || !Number.isFinite(sample.idleSeconds))
      return;
    const night = sample.hour >= 22 || sample.hour < 7;
    this.morningWake = this.initialized && this.night && !night;
    this.night = night;
    this.initialized = true;
    if (
      this.idle >= 120 &&
      sample.idleSeconds < 10 &&
      c.world.time - this.welcomedAt > 120
    ) {
      this.welcomedAt = c.world.time;
      c.say(this.night ? "Welcome back. Late night?" : "You’re back! Hi.", 1.8);
      c.mood.nudge({ happiness: 0.05, trust: 0.01 });
      if (!this.night && c.mood.asleep) {
        c.mood.asleep = false;
        c.char.standUp();
      }
    }
    this.idle = Math.max(0, sample.idleSeconds);
  }
  step(c: Ctx, dt: number) {
    if (!this.initialized) return;
    if (this.night && !c.mood.asleep)
      c.mood.s.energy = Math.max(0, c.mood.s.energy - dt / 900);
    else if (this.morningWake && c.mood.asleep && c.mood.s.energy > 0.8) {
      c.mood.asleep = false;
      c.char.standUp();
      c.say("Morning.", 1.4);
      this.morningWake = false;
    }
  }
}
