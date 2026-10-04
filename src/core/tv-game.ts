// His video game: a little guy hopping over blocks on the TV. Pure logic (no drawing), so the
// TV can show it and the skill can react to how he's doing. Sizes are fractions of the screen.

export interface Block { x: number; h: number; passed: boolean; jumpIn: number }
export type ArcadeEvent = 'point' | 'crash' | 'record';

/** Player and block half-widths (the TV draws them this size too). */
export const PLAYER_W = 0.07, BLOCK_W = 0.05;
const GRAVITY = 6, JUMP = 2, PLAYER_X = 0.2, HALF = (PLAYER_W + BLOCK_W) / 2;

export class Runner {
  time = 0;
  /** The player: fixed x, height above the ground, and vertical speed. */
  readonly x = PLAYER_X;
  y = 0;
  private vy = 0;
  blocks: Block[] = [];
  speed = 0.4;
  score = 0;
  best = 0;
  crashedAt = -1;
  private nextBlock = 0.6;
  private recorded = false;

  /**
   * @param skill 0..1: how well he times his jumps (1 = never misses).
   * @param random so tests can replay it.
   */
  constructor(private skill = 0.75, private random = Math.random) {}

  /** Jump, if he's on the ground. */
  press() { if (this.y <= 0) { this.vy = JUMP; return true; } return false; }

  /** One step. He presses jump himself when a block gets close (well-timed, mostly). Returns what happened. */
  step(dt: number): ArcadeEvent[] {
    const events: ArcadeEvent[] = [];
    this.time += dt;
    // A short pause after a crash, then a fresh run.
    if (this.crashedAt >= 0 && this.time - this.crashedAt < 0.8) return events;
    this.speed = Math.min(0.75, this.speed + dt * 0.01);
    this.nextBlock -= dt;
    if (this.nextBlock <= 0) {
      // The ideal moment to jump is ~1/3 s before a block reaches him. Now and then he fumbles it
      // (more often the worse he is), and the run is over.
      const fumble = this.random() < (1 - this.skill) * 0.15;
      const off = fumble ? (this.random() < 0.5 ? -1 : 1) * (0.2 + this.random() * 0.1) : (this.random() * 2 - 1) * 0.05;
      this.blocks.push({ x: 1.05, h: 0.08 + this.random() * 0.06, passed: false, jumpIn: 0.333 + off });
      this.nextBlock = 0.9 + this.random() * 1.1;
    }
    for (const b of this.blocks) b.x -= this.speed * dt;
    const ahead = this.blocks.find((b) => !b.passed && b.x > this.x);
    if (ahead && (ahead.x - this.x) / this.speed <= ahead.jumpIn) this.press();
    this.vy -= GRAVITY * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y <= 0) this.vy = 0;
    for (const b of this.blocks) {
      if (Math.abs(b.x - this.x) < HALF && this.y < b.h) {
        this.crashedAt = this.time; this.best = Math.max(this.best, this.score);
        this.score = 0; this.blocks = []; this.y = 0; this.vy = 0; this.speed = 0.4; this.recorded = false;
        events.push('crash');
        return events;
      }
      if (!b.passed && b.x < this.x - HALF) {
        b.passed = true; this.score++; events.push('point');
        if (!this.recorded && this.best > 0 && this.score > this.best) { this.recorded = true; events.push('record'); }
      }
    }
    this.blocks = this.blocks.filter((b) => b.x > -0.1);
    return events;
  }
}
