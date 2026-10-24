import { packager } from '@electron/packager';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..'); process.chdir(root);
const platform = process.argv[2] ?? process.platform;
if (!['darwin', 'win32'].includes(platform)) throw new Error('Use package:release -- darwin or win32. Linux is for QA only.');
const arch = platform === 'darwin' ? 'arm64' : 'x64';
const meta = JSON.parse(readFileSync('product.json', 'utf8'));
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty && !process.argv.includes('--allow-dirty')) throw new Error('Commit the reviewed source before packaging. --allow-dirty is for local QA candidates only.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (platform === 'darwin') {
  if (process.platform !== 'darwin') throw new Error('Mac distribution must be built on macOS to compile and validate the real native helper.');
  execFileSync(process.execPath, ['scripts/build-native-mac.mjs'], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['scripts/build.mjs', 'release'], { stdio: 'inherit' });
if (platform === 'darwin') copyFileSync('.build/native/windows-mac-arm64', 'dist/electron/native/windows-mac-arm64');
const destination = resolve('out', `Mallow-Desk-Buddies-${platform}-${arch}`);
if (existsSync(destination)) throw new Error('Candidate already exists: ' + destination + '. Move it aside before producing another version.');
const stage = resolve('.build/release-stage', platform); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
cpSync('dist', join(stage, 'dist'), { recursive: true, filter: file => !file.endsWith('.map') && !/\/(?:lab|extension)(?:\/|$)/.test(file.replaceAll('\\', '/')) });
mkdirSync(join(stage, 'assets')); for (const file of ['trayTemplate.png', 'trayTemplate@2x.png', 'builtin-history.json']) copyFileSync(join('assets', file), join(stage, 'assets', file));
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'mallow-desk-buddies', productName: meta.name, version: meta.version, description: 'Expressive offline desktop companions.', main: 'dist/electron/main.js', private: true }, null, 2));
copyFileSync('product.json', join(stage, 'product.json'));
writeFileSync(join(stage, 'release-source.json'), JSON.stringify({ commit, dirty: !!dirty, platform, arch, version: meta.version, nativeAcceptance: 'pending', status: 'release candidate; not approved for sale' }, null, 2));
let icon = resolve('assets/mallow.ico');
if (platform === 'darwin') {
  const iconset = resolve('.build/Mallow.iconset'); mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) for (const retina of [false, true]) {
    const pixels = size * (retina ? 2 : 1), file = join(iconset, `icon_${size}x${size}${retina ? '@2x' : ''}.png`);
    execFileSync('sips', ['-z', String(pixels), String(pixels), resolve('assets/mallow.png'), '--out', file], { stdio: 'ignore' });
  }
  icon = resolve('.build/mallow.icns'); execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icon], { stdio: 'inherit' });
}
const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
const folders = await packager({ dir: stage, out: resolve('out'), name: 'Mallow-Desk-Buddies', platform, arch,
  electronVersion, appVersion: meta.version, appBundleId: meta.appId, icon, asar: false, prune: true,
  appCopyright: 'Mallow99. Developed with AI assistance.', osxSign: false, osxNotarize: false,
  ...(platform === 'darwin' ? { darwinDarkModeSupport: true } : {}),
  ...(platform === 'darwin' ? { extendInfo: { LSUIElement: true, LSMinimumSystemVersion: '13.0' } } : { win32metadata: { CompanyName: 'Mallow99', FileDescription: meta.name, ProductName: meta.name } }),
  download: { cacheRoot: resolve('../.electron-cache') },
});
const folder = folders[0];
if (platform === 'darwin') {
  const bundle = join(folder, 'Mallow-Desk-Buddies.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
}
for (const file of ['INSTALL.md', 'FEATURES.md', 'PRIVACY.md', 'LICENSE.txt', 'RECOVERY.md', 'THIRD-PARTY-NOTICES.md']) copyFileSync(join('docs/release', file), join(folder, file));
copyFileSync(join(stage, 'release-source.json'), join(folder, 'release-source.json'));
// Audit the actual packaged tree before archiving it.
function walk(dir) { return readdirSync(dir).flatMap(name => { const file = join(dir, name); return statSync(file).isDirectory() ? walk(file) : [file]; }); }
const files = walk(folder);
for (const file of files) {
  const name = relative(folder, file).replaceAll('\\', '/');
  if (/\.map$|(?:^|\/)(?:memory(?:-\d+)?\.json|pet(?:-\d+)?\.json|ai-keys\.bin|desktop-bridge\.json|\.git)(?:\/|$)/.test(name)) throw new Error('Unexpected private/development file in package: ' + name);
}
if (platform === 'win32' && !files.some(f => f.endsWith('windows-win.ps1'))) throw new Error('Missing Windows helper.');
if (platform === 'darwin' && !files.some(f => f.endsWith('windows-mac-arm64'))) throw new Error('Missing Mac helper.');
const archive = resolve('out', `Mallow-Desk-Buddies-${meta.version}-${platform}-${arch}.zip`);
if (existsSync(archive)) throw new Error('Archive already exists: ' + archive);
if (process.platform === 'win32') {
  const script = resolve('.build/archive-release.ps1');
  writeFileSync(script, "param([string]$Source, [string]$Destination)\n$ErrorActionPreference = 'Stop'\nCompress-Archive -LiteralPath $Source -DestinationPath $Destination\n");
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Source', folder, '-Destination', archive], { stdio: 'inherit' });
}
else if (platform === 'darwin') execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', folder, archive], { stdio: 'inherit' });
else execFileSync('zip', ['-q', '-r', archive, relative(resolve('out'), folder)], { cwd: resolve('out'), stdio: 'inherit' });
const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(archive + '.sha256', `${hash}  ${archive.split(/[\\/]/).at(-1)}\n`);
console.log(JSON.stringify({ archive, bytes: statSync(archive).size, sha256: hash, commit, dirty: !!dirty, files: files.length, nativeAcceptance: 'pending' }, null, 2));
