// Ready-made looks. Rows are mix-and-match (pick one per row); bundles set everything at once.
// Shared by the design lab and the settings window.

import type { BodyStyle } from './character';
import type { Look } from './render';

export interface Variant { id: string; name: string; detail: string; body?: Partial<BodyStyle>; look?: Partial<Look> }
export interface PresetRow { key: string; title: string; blurb: string; split?: boolean; variants: Variant[] }

export const PRESET_ROWS: PresetRow[] = [
  {
    key: 'stance', title: 'Stance', blurb: 'How he stands: knee bend and where his arms rest.',
    variants: [
      { id: 'A', name: 'Bent & ready', detail: 'knees 0.3 · arms 0.45', body: { stand: 0.3, armHang: 0.45 } },
      { id: 'B', name: 'Relaxed', detail: 'knees 0.75 · arms 0.85', body: { stand: 0.75, armHang: 0.85 } },
      { id: 'C', name: 'Straight', detail: 'knees 1.0 · arms 1.0', body: { stand: 1, armHang: 1 } },
      { id: 'D', name: 'Athletic', detail: 'knees 0.55 · arms 0.25', body: { stand: 0.55, armHang: 0.25 } },
    ],
  },
  {
    key: 'walk', title: 'Walk', blurb: 'Stride length, foot lift, bounce and lean.',
    variants: [
      { id: '1', name: 'Quick steps', detail: 'stride 0.8 · bob 1.0', body: { stride: 0.8, lift: 1.1, bob: 1, lean: 0.4, armSwing: 1 } },
      { id: '2', name: 'Stroll', detail: 'stride 1.2 · bob 1.0', body: { stride: 1.2, lift: 1, bob: 1, lean: 0.6, armSwing: 1 } },
      { id: '3', name: 'Bouncy', detail: 'stride 1.15 · bob 2.4', body: { stride: 1.15, lift: 1.7, bob: 2.4, lean: 0.5, armSwing: 1.4 } },
      { id: '4', name: 'Glide', detail: 'stride 1.45 · bob 0.3', body: { stride: 1.45, lift: 0.6, bob: 0.3, lean: 0.3, armSwing: 0.6 } },
    ],
  },
  {
    key: 'color', title: 'Color', blurb: 'Shown over a dark and a light desktop, since he lives on both.', split: true,
    variants: [
      { id: 'blurple', name: 'Blurple', detail: '#5865F2', look: { color: '#5865f2' } },
      { id: 'violet', name: 'Violet', detail: '#7A6FF0', look: { color: '#7a6ff0' } },
      { id: 'deep', name: 'Deep blurple', detail: '#4450D6', look: { color: '#4450d6' } },
      { id: 'periwinkle', name: 'Periwinkle', detail: '#8C9EFF', look: { color: '#8c9eff' } },
    ],
  },
  {
    key: 'line', title: 'Line & head', blurb: 'Limb thickness and head size.',
    variants: [
      { id: 'fine', name: 'Fine', detail: 'line 3.5 · head 0.9', look: { lineWidth: 3.5, headSize: 0.9 } },
      { id: 'classic', name: 'Classic', detail: 'line 4.5 · head 1.0', look: { lineWidth: 4.5, headSize: 1 } },
      { id: 'bold', name: 'Bold', detail: 'line 6 · head 1.1', look: { lineWidth: 6, headSize: 1.1 } },
      { id: 'chunky', name: 'Chunky', detail: 'line 7 · head 1.25', look: { lineWidth: 7, headSize: 1.25 } },
    ],
  },
  {
    key: 'render', title: 'Rendering', blurb: 'Smooth lines, or pixel art at three pixel sizes. Physics is identical.',
    variants: [
      { id: 'smooth', name: 'Smooth', detail: 'pixel 1', look: { pixel: 1 } },
      { id: 'px2', name: 'Pixel S', detail: 'pixel 2', look: { pixel: 2 } },
      { id: 'px3', name: 'Pixel M', detail: 'pixel 3', look: { pixel: 3 } },
      { id: 'px4', name: 'Pixel L', detail: 'pixel 4', look: { pixel: 4 } },
    ],
  },
];

/** Whole-look bundles. */
export const BUNDLES: { name: string; detail: string; look: Partial<Look>; body: Partial<BodyStyle> }[] = [
  { name: 'Blurp', detail: 'Your picks: deep blurple, chunky, pixel S, straight, quick steps',
    look: { color: '#4450d6', lineWidth: 7, headSize: 1.25, pixel: 2 }, body: { stand: 1, armHang: 1, stride: 0.8, lift: 1.1, bob: 1, lean: 0.4, armSwing: 1 } },
  { name: 'Classic', detail: 'The original orange, smooth lines, relaxed',
    look: { color: '#f7931e', lineWidth: 4.5, headSize: 1, pixel: 1 }, body: { stand: 0.75, armHang: 0.85, stride: 1.2, lift: 1, bob: 1, lean: 0.6, armSwing: 1 } },
  { name: 'Retro', detail: 'Big pixels, bold lines, bouncy',
    look: { color: '#5865f2', lineWidth: 6, headSize: 1.1, pixel: 4 }, body: { stand: 0.9, armHang: 0.9, stride: 1.15, lift: 1.7, bob: 2.4, lean: 0.5, armSwing: 1.4 } },
  { name: 'Ghost', detail: 'Periwinkle, fine lines, gliding walk',
    look: { color: '#8c9eff', lineWidth: 3.5, headSize: 0.9, pixel: 1 }, body: { stand: 1, armHang: 1, stride: 1.45, lift: 0.6, bob: 0.3, lean: 0.3, armSwing: 0.6 } },
];
