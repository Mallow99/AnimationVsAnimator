// Everything about Blurp you can change from the settings window, in one
// object that's saved to disk as pet.json. Also: the allowed range for each
// number (the settings sliders are built from this table) and a safe merge.

import { DEFAULT_BODY, type BodyStyle } from './character';
import { DEFAULT_LOOK, type Look } from './render';

export type MindMode = 'offline' | 'chat' | 'full';

export interface PetConfig {
  name: string;
  scale: number;   // overall size (1 ≈ 90 px tall)
  look: Look;
  body: BodyStyle;
  /** offline = instinct only. chat / full = LLM (milestone 4). */
  mind: MindMode;
  /** Swiping the cursor through him fast smacks him. Off by default so it doesn't happen by accident. */
  smacking: boolean;
}

export const DEFAULT_CONFIG: PetConfig = {
  name: 'Blurp',
  scale: 1.1,
  look: { ...DEFAULT_LOOK },
  body: { ...DEFAULT_BODY },
  mind: 'offline',
  smacking: false,
};

export interface Range { min: number; max: number; step: number; label: string; hint: string }

/** Every adjustable number: its limits, and how the settings window labels it. */
export const RANGES: Record<string, Range> = {
  'scale': { min: 0.6, max: 2.5, step: 0.05, label: 'Size', hint: 'How big he is on screen' },
  'look.lineWidth': { min: 2, max: 10, step: 0.5, label: 'Line thickness', hint: 'Limb thickness' },
  'look.headSize': { min: 0.6, max: 1.8, step: 0.05, label: 'Head size', hint: '1 = normal' },
  'look.pixel': { min: 1, max: 6, step: 1, label: 'Pixel size', hint: '1 = smooth, higher = chunkier pixel art' },
  'body.stand': { min: 0, max: 1, step: 0.05, label: 'Leg straightness', hint: '0 = knees bent, 1 = standing straight' },
  'body.armHang': { min: 0, max: 1, step: 0.05, label: 'Arm hang', hint: '0 = held out, 1 = hanging loose' },
  'body.armSwing': { min: 0, max: 2, step: 0.05, label: 'Arm swing', hint: 'How much arms swing while walking' },
  'body.stride': { min: 0.5, max: 2, step: 0.05, label: 'Stride', hint: 'Step length' },
  'body.lift': { min: 0, max: 2.5, step: 0.05, label: 'Foot lift', hint: 'How high feet lift' },
  'body.bob': { min: 0, max: 3, step: 0.05, label: 'Bounce', hint: 'Hip bounce per step' },
  'body.lean': { min: 0, max: 2, step: 0.05, label: 'Lean', hint: 'Leaning into his motion' },
};

const clamp = (v: number, r?: Range) => (r ? Math.min(r.max, Math.max(r.min, v)) : v);

/**
 * Merge a (possibly partial, possibly hand-edited) config onto a base.
 * Unknown keys are ignored, wrong types are ignored, numbers are clamped.
 */
export function mergeConfig(base: PetConfig, patch: unknown): PetConfig {
  const out: PetConfig = structuredClone(base);
  if (!patch || typeof patch !== 'object') return out;
  const p = patch as Record<string, unknown>;
  const merge = (target: Record<string, unknown>, src: unknown, prefix: string) => {
    if (!src || typeof src !== 'object') return;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in target)) continue;
      const cur = target[k], key = prefix + k;
      if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v)) target[k] = clamp(v, RANGES[key]);
      else if (typeof cur === 'string' && typeof v === 'string') target[k] = v.slice(0, 40);
      else if (typeof cur === 'boolean' && typeof v === 'boolean') target[k] = v;
    }
  };
  merge(out as unknown as Record<string, unknown>, p, '');
  merge(out.look as unknown as Record<string, unknown>, p.look, 'look.');
  merge(out.body as unknown as Record<string, unknown>, p.body, 'body.');
  if (!['offline', 'chat', 'full'].includes(out.mind)) out.mind = 'offline';
  if (!/^#[0-9a-f]{6}$/i.test(out.look.color)) out.look.color = base.look.color;
  if (!out.name.trim()) out.name = base.name;
  return out;
}
