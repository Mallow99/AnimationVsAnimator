// Run by GitHub (see .github/workflows/build.yml) after every check passed: puts the freshly
// built ZIPs in out/built on the project's Releases page as a public test release.
// The tag is "v" + the version in product.json. Files in a release that is already public are
// never replaced, so people who downloaded it keep getting the same file: change the version instead.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const product = JSON.parse(readFileSync('product.json', 'utf8'));
const tag = 'v' + product.version;
const folder = resolve('out/built');
const files = existsSync(folder)
  ? readdirSync(folder)
      .filter((name) => name.endsWith('.zip') || name.endsWith('.sha256'))
      .map((name) => join(folder, name))
  : [];
const zips = files.filter((file) => file.endsWith('.zip'));
// The Mac app is optional here (the hosted Mac machines are sometimes unavailable); Windows is not.
if (!zips.some((zip) => zip.includes('win32')))
  throw new Error('The Windows app was not built, so nothing is released.');
if (!zips.every((zip) => files.includes(zip + '.sha256'))) throw new Error('A ZIP is missing its checksum file.');

const gh = (...args) => execFileSync('gh', args, { stdio: 'inherit' });
const existing = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft,assets'], { encoding: 'utf8' });
const release = existing.status === 0 ? JSON.parse(existing.stdout) : null;
if (release && !release.isDraft) {
  // Already public: files people may have downloaded are never replaced. An app that was missing
  // (say the Mac machines were unavailable last time) is added.
  const have = new Set(release.assets.map((asset) => asset.name));
  const missing = files.filter((file) => !have.has(file.split(/[\\/]/).at(-1)));
  if (missing.length) gh('release', 'upload', tag, ...missing);
  console.log(
    missing.length
      ? `${tag} was already public. Added what it was missing: ${missing.map((file) => file.split(/[\\/]/).at(-1)).join(', ')}`
      : `${tag} is already public and was left as it is. To ship this build, change "version" in product.json.`,
  );
  process.exit(0);
}
const title = `${product.name} ${product.version} (test build)`;
const notes = resolve('docs/release/RELEASE-NOTES.md');
if (!release)
  gh(
    'release',
    'create',
    tag,
    '--draft',
    '--prerelease',
    '--target',
    process.env.GITHUB_SHA,
    '--title',
    title,
    '--notes-file',
    notes,
  );
gh('release', 'upload', tag, ...files, '--clobber');
// Made public only now, with every file in place.
gh(
  'release',
  'edit',
  tag,
  '--draft=false',
  '--prerelease',
  '--target',
  process.env.GITHUB_SHA,
  '--title',
  title,
  '--notes-file',
  notes,
);
console.log(`Published ${tag} with: ${zips.map((zip) => zip.split(/[\\/]/).at(-1)).join(', ')}`);
