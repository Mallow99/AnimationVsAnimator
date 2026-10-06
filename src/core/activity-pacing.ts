import { clamp, rand } from './math';
import type { Ctx } from './skills/context';

export type LongActivity = 'watchtv' | 'videogame' | 'read' | 'sitdown';
export function restlessness(c: Ctx) {
  const s = c.mood.s,
    label = c.mood.label;
  return clamp(
    (c.hyperactivity ?? 0.25) * 0.85 +
      (s.energy - 0.5) * 0.18 +
      (c.mood.emotion === 'excited' ? 0.08 : 0) +
      s.annoyance * 0.12 -
      (label === 'sleepy' || label === 'sad' ? 0.12 : 0),
    0,
    1,
  );
}

/** All values are seconds. Even restless figures commit to a game for several minutes. */
export function activitySeconds(c: Ctx, activity: LongActivity, variation = 1) {
  const calm = (1 - restlessness(c)) ** 2;
  const [minimum, extra] =
    activity === 'watchtv'
      ? [120, 1800]
      : activity === 'videogame'
        ? [180, 1200]
        : activity === 'read'
          ? [240, 1800]
          : [90, 600];
  return minimum + extra * calm * variation;
}

export class ActivityClock {
  elapsed = 0;
  private variation = rand(0.9, 1.1);
  constructor(readonly activity: LongActivity) {}
  tick(c: Ctx, dt: number) {
    this.elapsed += dt;
    // Re-read the setting: changing the slider affects an existing activity at its next natural break.
    return this.elapsed >= activitySeconds(c, this.activity, this.variation);
  }
}

export const isSettledActivity = (name: string | undefined) =>
  ['watchtv', 'videogame', 'playgame', 'read', 'sitdown', 'sip', 'exercise', 'yoyo', 'handheld'].includes(name ?? '');
