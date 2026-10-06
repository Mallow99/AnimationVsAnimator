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
  groq: { label: 'Groq', free: true, model: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys', base: 'https://api.groq.com/openai/v1' },
  openrouter: { label: 'OpenRouter (free models)', free: true, model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', base: 'https://openrouter.ai/api/v1' },
};

export type Personality = 'inventive' | 'competitive' | 'gentle' | 'mischievous' | 'adventurous';

export interface PetConfig {
  name: string;
  personality: Personality;
  figureCount: number;
  debugCombat: boolean;
  closeWindows: boolean;
  fileHomes: boolean;
  browserPlay: boolean;
  drawTools: boolean;
  inkLifetime: number;
  consoleRequired: boolean;
  dailyRhythm: boolean;
  showBag: boolean;
  showTrash: boolean;
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
  /** Seconds between unsolicited AI thoughts. Direct conversation is always immediate. */
  aiInterval: number;
  /** 0 = calm and settled, 1 = restless. Independent of AI call frequency. */
  hyperactivity: number;
  /** Swiping the cursor through him fast smacks him. Off by default so it doesn't happen by accident. */
  smacking: boolean;
  /** Stand on, climb and get carried by the windows on screen. */
  windows: boolean;
  /** Desktop Goose mode: he may grab your cursor and drag it around for a moment. */
  mischief: boolean;
  /** His punches, kicks and sword hits knock your real cursor flying (move the mouse to take it back). */
  knockCursor: boolean;
  /** He can push, kick and surf on your windows (moves them for real; macOS asks for Accessibility permission). */
  moveWindows: boolean;
  /**
   * He can see what you're doing: which app you're in and its window title (he comments on it), and where
   * the text and buttons in it are (he sits on them). Stays on your computer, except that with an AI brain
   * on, the app name and title go into what he tells the AI.
   */
  screenAware: boolean;
  /** Little blips when he talks, like characters in indie games. */
  sound: boolean;
  /** Limbs can come off: big crashes, hard smacks, or yanking a hand or foot. He puts them back on. */
  destructible: boolean;
  /** Sound effects: footsteps, thuds, snaps, whooshes (made in code, like his voice). */
  sfx: boolean;
  /** How loud his sounds are (voice and effects), 0..1. */
  volume: number;
  /**
   * His preferences, set by dragging neurons in his head (Mind tab): how much more (or less)
   * he wants each thing than his mood alone would say. 1 = normal, 3 = loves it, 0.2 = hardly ever.
   */
  biases: Record<string, number>;
  /** How the Mind tab draws his thinking: a 3D model of his head (clearer), or a circuit board (cooler). */
  mindLook: 'head' | 'circuit';
  /** His friend: a second stick figure in the same app, with its own mind, who he plays and spars with. */
  friend: { on: boolean; name: string; color: string };
  /**
   * How they fight each other: 'play' = foam and wooden swords, nobody gets hurt; 'real' = katanas
   * that can cut a limb off (he puts it back on) or run him through (he goes down for a bit).
   */
  fightMode: 'play' | 'real';
}

export const DEFAULT_CONFIG: PetConfig = {
  name: 'Blurp',
  personality: 'inventive', figureCount: 2, debugCombat: false,
  closeWindows: false, fileHomes:false, browserPlay: false, drawTools: true, inkLifetime: 300, consoleRequired: false, dailyRhythm: true,
  showBag: false, showTrash: false,
  scale: 1.1,
  look: { ...DEFAULT_LOOK },
  body: { ...DEFAULT_BODY },
  mind: 'offline',
  persona: `A small stick figure who lives on top of your screen. Curious, a bit cheeky, easily bored, and very proud of his climbing. He knows he is made of lines and thinks that's cool. Talks in short, casual bursts like a kid texting. Likes you, mostly. Hates being thrown.`,
  provider: 'gemini',
  model: PROVIDERS.gemini.model,
  puppet: true,
  aiInterval: 40,
  hyperactivity: 0.25,
  smacking: false,
  windows: true,
  mischief: false,
  knockCursor: true,
  moveWindows: true,
  screenAware: true,
  sound: true,
  destructible: true,
  sfx: true,
  volume: 0.6,
  biases: {},
  mindLook: 'head',
  friend: { on: true, name: 'Leonard', color: '#f7931e' },
  fightMode: 'play',
};

/**
 * The second stick figure's starting settings: the same as his (size, look, how they move, sounds,
 * mind mode), with their own name, color and persona, and no tweaked preferences. (After that they
 * have their own settings file and window, and you change them like his.)
 */
export function friendConfig(main: PetConfig): PetConfig {
  const c = structuredClone(main);
  c.name = main.friend.name;
  c.look.color = main.friend.color;
  c.persona = `${main.friend.name}, ${main.name}'s best friend and sparring partner. Competitive, loud, always up for a fight, terrible loser.`;
  c.biases = {};
  c.personality = 'competitive';
  return c;
}

export interface Range { min: number; max: number; step: number; label: string; hint: string }

/** Longest allowed text per field (anything not listed: 40 characters). */
const TEXT_LIMITS: Record<string, number> = { persona: 1500, model: 80, provider: 20 };

/** Every adjustable number: its limits, and how the settings window labels it. */
export const RANGES: Record<string, Range> = {
  'inkLifetime': {min:0,max:1800,step:30,label:'Ink lifetime',hint:'Seconds of unused ink life. 0 disables expiry; holding and supporting pause it.'},
  'figureCount': { min: 2, max: 5, step: 1, label: 'Figures', hint: 'A small group, each with their own settings' },
  'hyperactivity': { min: 0, max: 1, step: 0.05, label: 'Hyperactivity', hint: 'Calm ← → restless. Mood also changes how long he settles into activities.' },
  'aiInterval': { min: 40, max: 300, step: 10, label: 'AI thinking interval', hint: 'Full mode: seconds between his own ideas (higher uses fewer calls)' },
  'scale': { min: 0.6, max: 2.5, step: 0.05, label: 'Size', hint: 'How big he is on screen' },
  'volume': { min: 0, max: 1, step: 0.05, label: 'Volume', hint: 'His voice and sound effects' },
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
      if (!Object.hasOwn(target, k)) continue;
      const cur = target[k], key = prefix + k;
      if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v)) target[k] = clamp(v, RANGES[key]);
      else if (typeof cur === 'string' && typeof v === 'string') target[k] = v.slice(0, TEXT_LIMITS[key] ?? 40);
      else if (typeof cur === 'boolean' && typeof v === 'boolean') target[k] = v;
    }
  };
  merge(out as unknown as Record<string, unknown>, p, '');
  if (p.biases && typeof p.biases === 'object') {
    // A whole new set of preferences (the Mind tab always sends all of them).
    out.biases = {};
    for (const [k, v] of Object.entries(p.biases as Record<string, unknown>).slice(0, 80)) {
      if (/^[a-z-]{1,30}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && Math.abs(v - 1) > 0.01) out.biases[k] = Math.min(3, Math.max(0.2, v));
    }
  }
  merge(out.look as unknown as Record<string, unknown>, p.look, 'look.');
  merge(out.friend as unknown as Record<string, unknown>, p.friend, 'friend.');
  if (!/^#[0-9a-f]{6}$/i.test(out.friend.color)) out.friend.color = base.friend.color;
  if (!out.friend.name.trim()) out.friend.name = base.friend.name;
  out.figureCount = Math.round(out.figureCount);
  if (!['inventive', 'competitive', 'gentle', 'mischievous', 'adventurous'].includes(out.personality)) out.personality = base.personality;
  if (out.fightMode !== 'play' && out.fightMode !== 'real') out.fightMode = base.fightMode;
  merge(out.body as unknown as Record<string, unknown>, p.body, 'body.');
  if (!['offline', 'chat', 'full'].includes(out.mind)) out.mind = 'offline';
  if (out.mindLook !== 'head' && out.mindLook !== 'circuit') out.mindLook = base.mindLook;
  if (!/^#[0-9a-f]{6}$/i.test(out.look.color)) out.look.color = base.look.color;
  if (!out.name.trim()) out.name = base.name;
  if (!Object.hasOwn(PROVIDERS, out.provider)) out.provider = base.provider;
  // A bad model name, or one left over from before he had a choice of services: use the service's default.
  if (!/^[a-z0-9._:/-]+$/i.test(out.model) || /^claude-/.test(out.model)) out.model = PROVIDERS[out.provider].model;
  out.inkLifetime = Number.isFinite(out.inkLifetime) ? Math.max(0, Math.min(86400, out.inkLifetime)) : base.inkLifetime;
  return out;
}

/** Optional companions; this is the same app, not exported characters. */
export function companionConfig(main: PetConfig, id: number): PetConfig {
  if (id === 0) return structuredClone(main);
  if (id === 1) return friendConfig(main);
  const c = structuredClone(main);
  const profiles = [
    { name: 'Moss', color: '#48a879', personality: 'gentle' as const, persona: 'Patient, warm, and quietly funny. Likes keeping the peace, shared games and comforting friends. Can defend himself without picking fights.' },
    { name: 'Violet', color: '#ad72d3', personality: 'mischievous' as const, persona: 'A quick-witted prankster. Makes things with a pen, teases friends affectionately, and knows when to stop.' },
    { name: 'Ruby', color: '#e46d67', personality: 'adventurous' as const, persona: 'An energetic explorer. Loves parkour, challenges, and inviting friends along. Encourages others rather than showing them up.' },
  ];
  const p = profiles[Math.max(0, Math.min(2, id - 2))];
  c.name = p.name; c.look.color = p.color; c.personality = p.personality; c.persona = p.persona; c.biases = {};
  return c;
}
