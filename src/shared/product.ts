import { mergeConfig, PROVIDERS, type PetConfig } from '../core/config';
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

/**
 * Applied at the shell boundary, including old configs and hand-edited patches.
 * The packaged app never talks to the internet. The only AI it may use is Ollama running on this
 * same computer (an opt-in setting), so the service is always 'ollama', and an AI mode saved for a
 * cloud service falls back to built-in dialogue.
 */
export function offlineEdition(config: PetConfig): PetConfig {
  const local = config.provider === 'ollama';
  return mergeConfig(config, {
    mind: local ? config.mind : 'offline',
    ...(local ? {} : { provider: 'ollama', model: PROVIDERS.ollama.model }),
    puppet: false, fileHomes: false, browserPlay: false,
    closeWindows: false, debugCombat: false,
  });
}

export interface SaveIssue { key: string; message: string }
export interface SaveHealth { issues: SaveIssue[] }
export type SaveResult = { ok: true } | { ok: false; message: string };
export interface ProductState { introDone: boolean; sceneReady: boolean; unlockedCharacters?: string[] }
export type RedeemResult = { ok: true; alreadyUnlocked: boolean; characterId: number; configs: PetConfig[] } | { ok: false; message: string };
export interface SessionState { paused: boolean; hidden: boolean }
