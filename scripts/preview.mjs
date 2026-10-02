// Opens the overlay page in your normal web browser (no Electron needed).
import { exec } from 'node:child_process';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'dist/app/index.html');
const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
exec(`${cmd} "${file}"`);
console.log('Opened', file);
