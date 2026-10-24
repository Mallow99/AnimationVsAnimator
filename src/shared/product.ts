import { mergeConfig, type PetConfig } from '../core/config';
import metadata from '../../product.json';

declare const __COMMERCIAL__: boolean;
export const COMMERCIAL = typeof __COMMERCIAL__ !== 'undefined' && __COMMERCIAL__;
export const PRODUCT_NAME = metadata.name;
export const PRODUCT_VERSION = metadata.version;
// Keep this independent of the displayed product name: renaming must not lose old saves.
export const LEGACY_DATA_NAME = metadata.legacyDataName;

export function productDefaults(base: PetConfig): PetConfig {
  return mergeConfig(base, {
    mind: 'offline', puppet: false, windows: false, sound: false, sfx: false,
    mischief: false, knockCursor: false, moveWindows: false, screenAware: false,
    fileHomes: false, browserPlay: false, closeWindows: false, debugCombat: false,
    showBag: true, volume: 0.35,
  });
}

/** Applied at the shell boundary, including old configs and hand-edited patches. */
export function offlineEdition(config: PetConfig): PetConfig {
  return mergeConfig(config, {
    mind: 'offline', puppet: false, fileHomes: false, browserPlay: false,
    closeWindows: false, debugCombat: false,
  });
}

export interface SaveIssue { key: string; message: string }
export interface SaveHealth { issues: SaveIssue[] }
export type SaveResult = { ok: true } | { ok: false; message: string };
export interface ProductState { introDone: boolean; sceneReady: boolean }
export interface SessionState { paused: boolean; hidden: boolean }
