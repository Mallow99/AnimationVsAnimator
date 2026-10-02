// Everything about Blurp you can change from the settings window, in one
// object that's saved to disk as pet.json. Also: the allowed range for each
// number (the settings sliders are built from this table) and a safe merge.

import { DEFAULT_BODY, type BodyStyle } from './character';
import { DEFAULT_LOOK, type Look } from './render';

export type MindMode = 'offline' | 'chat' | 'full';

/** Where his AI brain runs. The free ones just need a key from their website (no credit card). */
export type ProviderId = 'gemini' | 'groq' | 'openrouter';
export const PROVIDERS: Record<ProviderId, { label: string; free: boolean; model: string; keyUrl: string; base: string }> = {
  gemini: { label: 'Google Gemini', free: true, model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  groq: { label: 'Groq', free: true, model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', base: 'https://api.groq.com/openai/v1' },
  openrouter: { label: 'OpenRouter (free models)', free: true, model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', base: 'https://openrouter.ai/api/v1' },
};

export interface PetConfig {
  name: string;
  scale: number;   // overall size (1 ≈ 90 px tall)
  look: Look;
  body: BodyStyle;
  /** offline = instinct only. chat = AI for talking. full = AI also picks what he does. */
  mind: MindMode;
  /** Who he is, in plain words. The AI brain plays this character. */
  persona: string;
  /** Which AI service his brain uses, and which of its models. */
  provider: ProviderId;
  model: string;
  /** Let the AI move his body directly (make up its own poses and moves), not just pick from his skills. */
  puppet: boolean;
  /** Swiping the cursor through him fast smacks him. Off by default so it doesn't happen by accident. */
  smacking: boolean;
  /** Stand on, climb and get carried by the windows on screen. */
  windows: boolean;
  /** Desktop Goose mode: he may grab your cursor and drag it around for a moment. */
  mischief: boolean;
}

export const DEFAULT_CONFIG: PetConfig = {
  name: 'Blurp',
  scale: 1.1,
  look: { ...DEFAULT_LOOK },
  body: { ...DEFAULT_BODY },
  mind: 'offline',
  persona: `A small stick figure who lives on top of your screen. Curious, a bit cheeky, easily bored, and very proud of his climbing. He knows he is made of lines and thinks that's cool. Talks in short, casual bursts like a kid texting. Likes you, mostly. Hates being thrown.`,
  provider: 'gemini',
  model: PROVIDERS.gemini.model,
  puppet: true,
  smacking: false,
  windows: true,
  mischief: false,
};

export interface Range { min: number; max: number; step: number; label: string; hint: string }

/** Longest allowed text per field (anything not listed: 40 characters). */
const TEXT_LIMITS: Record<string, number> = { persona: 1500, model: 80, provider: 20 };

/** Every adjustable number: its limits, and how the settings window labels it. */
export const RANGES: Record<string, Range> = {
  'scale': { min: 0.6, max: 2.5, step: 0.05, label: 'Size', hint: 'How big he is on screen' },
  'look.lineWidth': { min: 2, max: 10, step: 0.5, label: 'Line thickness', hint: 'Limb thickness' },
  'look.headSize': { min: 0.6, max: 1.8, step: 0.05, label: 'Head size', hint: '1 = normal' },
  'look.pixel': { min: 1, max: 6, step: 1, label: 'Pixel size', hint: '1 = smooth, higher = chunkier pixel art' },
  'body.spread': { min: 0, max: 1, step: 0.05, label: 'Stance width', hint: '0 = feet together, 1 = wide upside-down V' },
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
      else if (typeof cur === 'string' && typeof v === 'string') target[k] = v.slice(0, TEXT_LIMITS[key] ?? 40);
      else if (typeof cur === 'boolean' && typeof v === 'boolean') target[k] = v;
    }
  };
  merge(out as unknown as Record<string, unknown>, p, '');
  merge(out.look as unknown as Record<string, unknown>, p.look, 'look.');
  merge(out.body as unknown as Record<string, unknown>, p.body, 'body.');
  if (!['offline', 'chat', 'full'].includes(out.mind)) out.mind = 'offline';
  if (!/^#[0-9a-f]{6}$/i.test(out.look.color)) out.look.color = base.look.color;
  if (!out.name.trim()) out.name = base.name;
  if (!(out.provider in PROVIDERS)) out.provider = base.provider;
  // A bad model name, or one left over from before he had a choice of services: use the service's default.
  if (!/^[a-z0-9._:/-]+$/i.test(out.model) || /^claude-/.test(out.model)) out.model = PROVIDERS[out.provider].model;
  return out;
}
