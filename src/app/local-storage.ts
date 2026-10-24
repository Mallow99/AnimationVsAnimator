import type { SaveResult } from '../shared/product';

export interface LoadedSave { text: string | null; recovered: boolean; error?: string }
function valid(text: string | null): text is string {
  if (text === null) return false;
  try { const value = JSON.parse(text); return !!value && typeof value === 'object' && !Array.isArray(value); }
  catch { return false; }
}

/** Keep a last-good copy; a corrupt primary must never replace a good backup. */
export function readLocalSave(storage: Storage, key: string): LoadedSave {
  try {
    const text = storage.getItem(key);
    if (valid(text)) return { text, recovered: false };
    const backup = storage.getItem(key + '.backup');
    if (valid(backup)) {
      if (text !== null && storage.getItem(key + '.corrupt') === null) storage.setItem(key + '.corrupt', text);
      storage.setItem(key, backup);
      return { text: backup, recovered: true };
    }
    return text === null && backup === null ? { text: null, recovered: false }
      : { text: null, recovered: false, error: 'The saved data is damaged. Its original has been kept; restore a backup before saving over it.' };
  } catch { return { text: null, recovered: false, error: 'Local storage is unavailable. Your changes have not been saved.' }; }
}

export function writeLocalSave(storage: Storage, key: string, text: string): SaveResult {
  if (!valid(text)) return { ok: false, message: 'The save is incomplete. The previous save has been kept.' };
  try {
    const old = storage.getItem(key);
    if (old === text) return { ok: true };
    if (valid(old)) storage.setItem(key + '.backup', old);
    // If this throws (for example, a full disk), both the old primary and backup remain usable.
    storage.setItem(key, text);
    return { ok: true };
  } catch { return { ok: false, message: 'Local storage could not be written. Free some disk space, then retry.' }; }
}
