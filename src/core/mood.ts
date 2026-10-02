// Mood: a handful of "dials" between 0 and 1 that drift over time and get
// bumped by what happens to him. Everything else (posture, walking speed,
// which behavior he picks, how he reacts to a poke) reads from these.

import type { Posture } from './character';
import { clamp } from './math';

export interface MoodState {
  energy: number;    // 0 exhausted … 1 wired. Drains while awake, refills asleep.
  happiness: number; // 0 miserable … 1 delighted
  boredom: number;   // rises when nothing happens
  annoyance: number; // at YOU. Spikes on pokes/throws, cools off in a minute or so.
  fear: number;      // spikes on big throws/crashes, fades fast
  trust: number;     // long-term: how he feels about you. Moves slowly, persists.
}

/** One-click moods for testing (settings → Mood). */
export const MOOD_PRESETS: Record<string, Partial<MoodState>> = {
  happy: { happiness: 0.9, energy: 0.85, annoyance: 0, fear: 0, boredom: 0.1 },
  cheerful: { happiness: 0.72, energy: 0.35, annoyance: 0, fear: 0, boredom: 0.2 },
  annoyed: { annoyance: 0.45, fear: 0 },
  lonely: { happiness: 0.15, boredom: 0.85, annoyance: 0, fear: 0, energy: 0.6 },
  nervous: { fear: 0.35, annoyance: 0, happiness: 0.55, boredom: 0.2, energy: 0.7 },
  sad: { happiness: 0.1, annoyance: 0, fear: 0, energy: 0.6 },
  angry: { annoyance: 0.9, happiness: 0.4, fear: 0 },
  sleepy: { energy: 0.08, annoyance: 0, fear: 0 },
  scared: { fear: 0.9, annoyance: 0 },
  bored: { boredom: 0.95, happiness: 0.5, annoyance: 0, fear: 0, energy: 0.7 },
  calm: { happiness: 0.6, energy: 0.7, boredom: 0.2, annoyance: 0, fear: 0 },
};

/** The broad mood family: what his instincts go by when picking what to do. */
export type MoodLabel = 'sleepy' | 'sad' | 'angry' | 'scared' | 'playful' | 'bored' | 'content';

/**
 * The finer emotion inside that family: what his body language, voice and lines show.
 * Annoyed isn't angry yet (crossed arms, foot tapping, "hmph"); happy isn't playful (humming,
 * hands behind his back); excited is playful turned up; lonely is sad because you're gone;
 * nervous is scared turned down. Proud and embarrassed are flashes that last a few seconds.
 */
export type Emotion = 'sleepy' | 'sad' | 'lonely' | 'angry' | 'annoyed' | 'scared' | 'nervous' | 'excited' | 'playful' | 'happy'
  | 'bored' | 'content' | 'proud' | 'embarrassed';

export class Mood {
  s: MoodState = { energy: 0.85, happiness: 0.6, boredom: 0.2, annoyance: 0, fear: 0, trust: 0.5 };
  asleep = false;
  /** A short burst of feeling (proud after nailing something, embarrassed after a faceplant), and how long it lasts. */
  flash: { kind: 'proud' | 'embarrassed'; left: number } | null = null;

  tick(dt: number) {
    const s = this.s;
    if (this.asleep) {
      s.energy += dt / 180;   // a full recharge in ~3 minutes of napping
      s.boredom -= dt / 60;
    } else {
      s.energy -= dt / (40 * 60); // ~40 minutes awake to run flat
      s.boredom += dt / 150;      // ~2.5 minutes of nothing to get fully bored
    }
    if (this.flash && (this.flash.left -= dt) <= 0) this.flash = null;
    s.annoyance -= dt / 45;
    s.fear -= dt / 6;
    // Happiness drifts toward a resting point that depends on how much he trusts you.
    const rest = 0.5 + (s.trust - 0.5) * 0.4 - (s.boredom > 0.8 ? 0.15 : 0);
    s.happiness += (rest - s.happiness) * (dt / 240);
    this.clampAll();
  }

  nudge(d: Partial<MoodState>) {
    for (const k of Object.keys(d) as (keyof MoodState)[]) this.s[k] += d[k]!;
    this.clampAll();
  }

  get label(): MoodLabel {
    const s = this.s;
    if (s.fear > 0.5) return 'scared';
    if (s.annoyance > 0.6) return 'angry';
    if (s.energy < 0.2) return 'sleepy';
    if (s.happiness < 0.3) return 'sad';
    if (s.boredom > 0.7) return 'bored';
    if (s.happiness > 0.65 && s.energy > 0.45 && s.annoyance < 0.3) return 'playful';
    return 'content';
  }

  /** The finer emotion (see `Emotion`). Always inside the family `label` gives. */
  get emotion(): Emotion {
    const s = this.s, L = this.label;
    if (L === 'scared' || L === 'angry' || L === 'sleepy') return L;
    if (this.flash) return this.flash.kind;
    if (L === 'sad') return s.boredom > 0.6 ? 'lonely' : 'sad';
    if (s.annoyance > 0.3) return 'annoyed';
    if (s.fear > 0.22) return 'nervous';
    if (L === 'bored') return 'bored';
    if (L === 'playful') return s.happiness > 0.8 && s.energy > 0.72 && s.boredom < 0.35 ? 'excited' : 'playful';
    return s.happiness > 0.62 ? 'happy' : 'content';
  }

  /** A quick flash of pride or embarrassment (a few seconds). */
  feel(kind: 'proud' | 'embarrassed', secs = 5) { if (!this.asleep) this.flash = { kind, left: secs }; }

  /** Body language for the current mood. */
  posture(): Posture {
    const s = this.s;
    const sadness = clamp((0.45 - s.happiness) * 2.5, 0, 1);
    const tired = clamp((0.3 - s.energy) * 3, 0, 1);
    return {
      // Kept subtle: he stands tall unless he's properly down.
      hunch: clamp(sadness * 0.6 + tired * 0.45 + s.fear * 0.25, 0, 1),
      bounce: clamp((s.happiness - 0.55) * 2.5, 0, 1) * clamp(s.energy * 1.5, 0, 1),
      tension: clamp((s.annoyance - 0.3) * 2, 0, 1),
      speed: 0.6 + s.energy * 0.5 + s.annoyance * 0.3 - sadness * 0.15,
    };
  }

  private clampAll() {
    for (const k of Object.keys(this.s) as (keyof MoodState)[]) this.s[k] = clamp(this.s[k], 0, 1);
  }

  save() { return { ...this.s, asleep: this.asleep, savedAt: Date.now() }; }

  /** Restore from a save. Time away counts: he rested, calmed down, and got a bit bored. */
  load(data: unknown) {
    if (!data || typeof data !== 'object') return;
    const d = data as Partial<MoodState> & { savedAt?: number };
    for (const k of Object.keys(this.s) as (keyof MoodState)[]) if (typeof d[k] === 'number') this.s[k] = d[k]!;
    const away = d.savedAt ? (Date.now() - d.savedAt) / 1000 : 0;
    if (away > 60) {
      this.s.annoyance = 0; this.s.fear = 0;
      this.s.energy = clamp(this.s.energy + away / 1800, 0, 1);
      this.s.boredom = clamp(this.s.boredom + away / 3600, 0, 0.6);
    }
    this.clampAll();
  }
}
