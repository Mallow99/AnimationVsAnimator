import type { Personality } from './config';
import type { IdleStyle } from './character';

/** Procedural accents, layered on the chosen body preset. Never changes bones or line thickness. */
export interface CharacterTemplate {
  name: string;
  walk: { stride: number; lift: number; swing: number; bob: number };
  sit: {
    lean: number;
    spread: number;
    feet: number;
    swing: number;
    hands: 'knees' | 'lap' | 'edge';
  };
  voice: {
    rate: number;
    pitch: number;
    pause: number;
    gesture: 'scratch' | 'present' | 'wave' | 'shrug';
  };
  idle: IdleStyle;
  bag: { body: string; flap: string; clip: string; sticker: Sticker };
  gifts: string[];
}
export type Sticker = 'pencil' | 'star' | 'leaf' | 'heart' | 'bolt';
export const NEUTRAL_MOTION: Pick<CharacterTemplate, 'walk' | 'sit'> = {
  walk: { stride: 1, lift: 1, swing: 1, bob: 1 },
  sit: { lean: 0, spread: 0, feet: 0, swing: 1, hands: 'knees' as const },
};
export const CHARACTER_TEMPLATES: Record<Personality, CharacterTemplate> = {
  inventive: {
    name: 'Cobalt',
    walk: { stride: 0.97, lift: 1, swing: 0.88, bob: 0.95 },
    sit: { lean: 2, spread: -0.5, feet: -2, swing: 0.4, hands: 'lap' },
    voice: { rate: 29, pitch: 0.96, pause: 0.1, gesture: 'scratch' },
    idle: 'behind',
    bag: { body: '#57647e', flap: '#8c9bb6', clip: '#c8b278', sticker: 'pencil' },
    gifts: ['book', 'pen', 'handheld'],
  },
  competitive: {
    name: 'Amber',
    walk: { stride: 1.1, lift: 1.08, swing: 1.12, bob: 0.85 },
    sit: { lean: 0, spread: 1.5, feet: 3, swing: 0.25, hands: 'knees' },
    voice: { rate: 37, pitch: 0.89, pause: 0.04, gesture: 'present' },
    idle: 'hips',
    bag: { body: '#795946', flap: '#bb8a62', clip: '#e6bc66', sticker: 'star' },
    gifts: ['dumbbell', 'bouncy-ball', 'handheld', 'foam-sword'],
  },
  gentle: {
    name: 'Moss',
    walk: { stride: 0.9, lift: 0.86, swing: 0.75, bob: 0.7 },
    sit: { lean: -2, spread: -0.8, feet: -3, swing: 0.2, hands: 'lap' },
    voice: { rate: 25, pitch: 0.92, pause: 0.15, gesture: 'wave' },
    idle: 'behind',
    bag: { body: '#4d6b5b', flap: '#91ad90', clip: '#c8cfad', sticker: 'leaf' },
    gifts: ['flowers', 'book', 'cup', 'blanket', 'snack-box'],
  },
  mischievous: {
    name: 'Violet',
    walk: { stride: 0.96, lift: 1.12, swing: 1.08, bob: 1.12 },
    sit: { lean: -1, spread: 0.6, feet: -2, swing: 1.5, hands: 'edge' },
    voice: { rate: 35, pitch: 1.08, pause: 0.08, gesture: 'shrug' },
    idle: 'hips',
    bag: { body: '#695779', flap: '#a792b7', clip: '#ce99aa', sticker: 'heart' },
    gifts: ['yo-yo', 'pen', 'bouncy-ball', 'handheld'],
  },
  adventurous: {
    name: 'Ruby',
    walk: { stride: 1.08, lift: 1.15, swing: 1.1, bob: 1.1 },
    sit: { lean: 1, spread: 1, feet: 4, swing: 1.25, hands: 'edge' },
    voice: { rate: 34, pitch: 1.04, pause: 0.05, gesture: 'present' },
    idle: 'hips',
    bag: { body: '#82544e', flap: '#bd8a76', clip: '#a6c1ce', sticker: 'bolt' },
    gifts: ['bouncy-ball', 'handheld', 'yo-yo', 'snack-box'],
  },
};
export function characterTemplate(p: Personality = 'inventive') {
  return CHARACTER_TEMPLATES[p];
}

/** A gift is considerate, not a requirement to keep a friendship alive. */
export function giftPreference(p: Personality | undefined, id: string) {
  const rank = characterTemplate(p).gifts.indexOf(id);
  return rank < 0
    ? ['book', 'flowers'].includes(id)
      ? 0.6
      : 0.45
    : Math.max(0.65, 1 - rank * 0.08);
}
