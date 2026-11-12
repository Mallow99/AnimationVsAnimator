// Turns the TypeScript in src/ into the plain JavaScript in dist/ that Electron and browsers run.
// Uses esbuild (fast, tiny).
//
//   node scripts/build.mjs            development edition: every feature and setting
//   node scripts/build.mjs release    the packaged edition people download ("Mallow Desk Buddies")
//   node scripts/build.mjs lab        the pose lab page      -> dist/lab/index.html
//   node scripts/build.mjs modellab   the 3D prop lab page   -> dist/lab/prop-model.html
//
// Both editions are written to the same dist/ folder: whichever was built last is the one that runs.
// (The test scripts in scripts/checks/ are built by scripts/check.mjs, not here.)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const what = process.argv[2];
const commercial = what === 'release' || process.env.PET_EDITION === 'commercial';
const common = {
  bundle: true,
  sourcemap: !commercial,
  logLevel: 'warning',
  target: 'es2022',
  // Code asks "is this the packaged edition?" through this constant (see src/shared/product.ts).
  define: { __COMMERCIAL__: commercial ? 'true' : 'false' },
};

if (what === 'lab' || what === 'modellab') {
  // One self-contained HTML file: the lab page with its script inlined.
  const entry = what === 'modellab' ? 'prop-model' : 'lab';
  const out = await build({
    ...common,
    sourcemap: false,
    minify: true,
    entryPoints: [`src/lab/${entry}.ts`],
    platform: 'browser',
    format: 'iife',
    write: false,
  });
  mkdirSync('dist/lab', { recursive: true });
  const html = readFileSync(`src/lab/${entry}.html`, 'utf8').replace('/*__LAB_SCRIPT__*/', () =>
    out.outputFiles[0].text.replace(/<\/script/g, '<\\/script'),
  );
  writeFileSync(what === 'modellab' ? 'dist/lab/prop-model.html' : 'dist/lab/index.html', html);
} else if (what && what !== 'release') {
  throw new Error(`Unknown build "${what}". Use no argument, release, lab or modellab. Tests: npm run check <name>.`);
} else {
  // Start clean, so nothing from the other edition (or a retired example item) lingers.
  for (const folder of ['app', 'electron', 'settings', 'items', 'extension'])
    rmSync(`dist/${folder}`, { recursive: true, force: true });
  const node = { ...common, platform: 'node', format: 'cjs', external: ['electron'] };
  const page = { ...common, platform: 'browser', format: 'iife' };
  await Promise.all([
    // The desktop shell: the transparent window, saving, the tray icon.
    build({ ...node, entryPoints: ['src/electron/main.ts'], outfile: 'dist/electron/main.js' }),
    // The small bridge (window.petShell) between the pages and the shell.
    build({ ...node, entryPoints: ['src/electron/preload.ts'], outfile: 'dist/electron/preload.js' }),
    // The overlay page the figures live in.
    build({ ...page, entryPoints: ['src/app/renderer.ts'], outfile: 'dist/app/renderer.js' }),
    // The Settings window: the simple one for the packaged edition, the full one for development.
    build({
      ...page,
      entryPoints: [commercial ? 'src/settings/product.ts' : 'src/settings/settings.ts'],
      outfile: 'dist/settings/settings.js',
    }),
  ]);
  cpSync(commercial ? 'src/settings/product.html' : 'src/settings/index.html', 'dist/settings/index.html');
  if (commercial) cpSync('src/settings/product.css', 'dist/settings/product.css');
  for (const file of ['index.html', 'game.css', 'tools.css', 'placement.css'])
    cpSync(`src/app/${file}`, `dist/app/${file}`);
  // The helpers that read window positions (Swift source for macOS, PowerShell for Windows).
  cpSync('src/electron/native', 'dist/electron/native', { recursive: true });
  // The Chrome extension is a development-only experiment.
  if (!commercial) cpSync('extension/chrome', 'dist/extension/chrome', { recursive: true });
  // Example item and prop files (and the how-to) that get copied into the user's items folder.
  cpSync('src/core/items', 'dist/items', { recursive: true });
  cpSync('src/core/props', 'dist/items', { recursive: true });
  cpSync('docs/MAKING-THINGS.md', 'dist/items/MAKING-THINGS.md');
}
