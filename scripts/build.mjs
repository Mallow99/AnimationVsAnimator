// Bundles the TypeScript into plain JavaScript with esbuild (fast, tiny).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };
const what = process.argv[2];

if (what === 'lab') {
  // One self-contained HTML file: the lab page with its script inlined.
  const { readFileSync, writeFileSync } = await import('node:fs');
  const out = await build({ ...common, sourcemap: false, minify: true, entryPoints: ['src/lab/lab.ts'], platform: 'browser', format: 'iife', write: false });
  mkdirSync('dist/lab', { recursive: true });
  const html = readFileSync('src/lab/lab.html', 'utf8').replace('/*__LAB_SCRIPT__*/', () => out.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));
  writeFileSync('dist/lab/index.html', html);
} else if (what === 'sim' || what === 'checks' || what === 'roadmap-checks' || what === 'quality-checks' || what === 'quality-profile' || what === 'living-checks' || what === 'living-soak' || what === 'soak') {
  await build({ ...common, entryPoints: [`scripts/${what}.ts`], outfile: `.build/${what}.mjs`, platform: 'node', format: 'esm' });
} else {
  await Promise.all([
    build({ ...common, entryPoints: ['src/electron/main.ts'], outfile: 'dist/electron/main.js', platform: 'node', format: 'cjs', external: ['electron'] }),
    build({ ...common, entryPoints: ['src/electron/preload.ts'], outfile: 'dist/electron/preload.js', platform: 'node', format: 'cjs', external: ['electron'] }),
    build({ ...common, entryPoints: ['src/app/renderer.ts'], outfile: 'dist/app/renderer.js', platform: 'browser', format: 'iife' }),
    build({ ...common, entryPoints: ['src/settings/settings.ts'], outfile: 'dist/settings/settings.js', platform: 'browser', format: 'iife' }),
  ]);
  mkdirSync('dist/settings', { recursive: true });
  rmSync('dist/extension', {recursive:true,force:true});
  cpSync('extension/chrome','dist/extension/chrome',{recursive:true});
  cpSync('src/electron/native', 'dist/electron/native', { recursive: true });
  cpSync('src/settings/index.html', 'dist/settings/index.html');
  mkdirSync('dist/app', { recursive: true });
  cpSync('src/app/index.html', 'dist/app/index.html');
  cpSync('src/app/game.css', 'dist/app/game.css');
  cpSync('src/app/tools.css', 'dist/app/tools.css');
  // Example item and prop files (and the how-to) for your items folder. Start clean, so an example
  // that was retired (the Othello table, the mallet) doesn't linger from an older build.
  rmSync('dist/items', { recursive: true, force: true });
  cpSync('src/core/items', 'dist/items', { recursive: true });
  cpSync('src/core/props', 'dist/items', { recursive: true });
  cpSync('docs/MAKING-THINGS.md', 'dist/items/MAKING-THINGS.md');
}
