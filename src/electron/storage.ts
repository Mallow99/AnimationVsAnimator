// Small, serialized local saves. Never let two async writes share the same temporary file.
import fs from 'node:fs';
import path from 'node:path';

function validJson(text: string): boolean {
  try { const value = JSON.parse(text); return !!value && typeof value === 'object' && !Array.isArray(value); }
  catch { return false; }
}

export function readStoredJson(file: string): { text: string | null; recovered: boolean } {
  let original: string | undefined;
  try { original = fs.readFileSync(file, 'utf8'); if (validJson(original)) return { text: original, recovered: false }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  try {
    const text = fs.readFileSync(file + '.bak', 'utf8');
    if (!validJson(text)) throw new Error('The backup is damaged.');
    if (original !== undefined && !fs.existsSync(file + '.corrupt')) fs.copyFileSync(file, file + '.corrupt');
    // Restore without rotating the damaged primary over the last-good backup.
    writeAtomic(file, text);
    return { text, recovered: true };
  } catch (error) {
    if (original === undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') return { text: null, recovered: false };
    throw new Error('Saved data could not be read. The original files have been kept for recovery.');
  }
}

export function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    if (fs.existsSync(file)) {
      const old = fs.readFileSync(file, 'utf8');
      if (validJson(old)) fs.copyFileSync(file, file + '.bak');
    }
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
