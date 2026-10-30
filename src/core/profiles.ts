/** Stable save identities are independent of the number allowed on the desktop. */
export const BASE_PROFILE_IDS = [0, 1, 2, 3, 4] as const;
export const ARNOLD_ID = 5;
export const MAX_ACTIVE_FIGURES = 5;
export const ALL_PROFILE_IDS = [...BASE_PROFILE_IDS, ARNOLD_ID] as const;
export function availableProfileIds(unlocked: readonly string[] = []): number[] {
  return unlocked.includes('arnold') ? [...ALL_PROFILE_IDS] : [...BASE_PROFILE_IDS];
}
export function knownUnlocks(value: unknown): string[] {
  return Array.isArray(value) && value.includes('arnold') ? ['arnold'] : [];
}
export function isArnoldCode(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 80 && value.trim().toUpperCase() === 'ARNOLD';
}
