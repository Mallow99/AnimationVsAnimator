// Portable Windows app: no installer, no Node on the recipient's computer.
import { packager } from '@electron/packager';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'));
const arch = process.argv[2] ?? 'x64';
if (!['x64', 'arm64'].includes(arch)) throw new Error('Use x64 (most PCs) or arm64.');
const out = join(root, 'out');
const destination = join(out, `AnimationVsAnimator-win32-${arch}`);
if (existsSync(destination)) throw new Error(`Output already exists: ${destination}. Move it away before making a new release.`);
const folders = await packager({
  dir: root, out, name: 'AnimationVsAnimator', platform: 'win32', arch,
  electronVersion: pkg.version, asar: false, prune: true,
  // Keep the PowerShell helper as a real file. Never ship local saves, keys, tests, or source.
  ignore: [/^\/(?!dist(?:\/|$)|assets(?:\/|$)|package\.json$|node_modules(?:\/|$)).+/, /\.map$/],
  download: { cacheRoot: resolve(root, '../.electron-cache') },
});
for (const folder of folders) copyFileSync(join(root, 'docs/WINDOWS.md'), join(folder, 'START-HERE.md'));
console.log(`Portable app built: ${folders.join(', ')}. Zip the whole folder to share it.`);
