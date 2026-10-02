// Bundles the TypeScript into plain JavaScript with esbuild (fast, tiny).
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };
const what = process.argv[2];

if (what === 'lab') {
  // One self-contained HTML file: the lab page with its script inlined.
  const { readFileSync, writeFileSync } = await import('node:fs');
  const out = await build({ ...common, sourcemap: false, minify: true, entryPoints: ['src/lab/lab.ts'], platform: 'browser', format: 'iife', write: false });
  mkdirSync('dist/lab', { recursive: true });
  const html = readFileSync('src/lab/lab.html', 'utf8').replace('/*__LAB_SCRIPT__*/', () => out.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));
  writeFileSync('dist/lab/index.html', html);
} else if (what === 'sim') {
  await build({ ...common, entryPoints: ['scripts/sim.ts'], outfile: '.build/sim.mjs', platform: 'node', format: 'esm' });
} else {
  await Promise.all([
    build({ ...common, entryPoints: ['src/electron/main.ts'], outfile: 'dist/electron/main.js', platform: 'node', format: 'cjs', external: ['electron'] }),
    build({ ...common, entryPoints: ['src/electron/preload.ts'], outfile: 'dist/electron/preload.js', platform: 'node', format: 'cjs', external: ['electron'] }),
    build({ ...common, entryPoints: ['src/app/renderer.ts'], outfile: 'dist/app/renderer.js', platform: 'browser', format: 'iife' }),
  ]);
  mkdirSync('dist/app', { recursive: true });
  cpSync('src/app/index.html', 'dist/app/index.html');
}
