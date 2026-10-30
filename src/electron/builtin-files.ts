import fs from 'node:fs';

/** Upgrade shipped examples only when the owner has not edited their contents. */
export function unchangedExample(file: string, history: unknown[]): boolean {
  try {
    const value = JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')));
    return history.some((old) => JSON.stringify(old) === value);
  } catch { return false; }
}
