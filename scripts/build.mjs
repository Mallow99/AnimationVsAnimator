// Bundles the TypeScript into plain JavaScript with esbuild (fast, tiny).
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };
const what = process.argv[2];

if (what === 'sim') {
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
