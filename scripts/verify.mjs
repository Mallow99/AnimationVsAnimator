// Runs the whole everyday test set and stops at the first failure.
//
//   npm run verify            type check + every check marked "verify" in scripts/check.mjs
//   npm run verify -- --app   the same, then the packaged edition in real Electron (what CI runs)
//
// Each check's full output is saved in .build/verification/<name>.log.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CHECKS, APP_CHECKS } from './check.mjs';

const directory = '.build/verification';
mkdirSync(directory, { recursive: true });
const names = CHECKS.filter((check) => check[3]).map((check) => check[0]);
if (process.argv.includes('--app')) names.push(...APP_CHECKS);
const steps = [
  { name: 'typecheck', command: ['node_modules/typescript/bin/tsc', '--noEmit'] },
  ...names.map((name) => ({ name, command: ['scripts/check.mjs', name] })),
];
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  platform: process.platform,
  steps: [],
};
for (const { name, command } of steps) {
  console.log('Checking ' + name + '…');
  const result = spawnSync(process.execPath, command, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  writeFileSync(`${directory}/${name}.log`, (result.stdout ?? '') + (result.stderr ?? ''));
  report.steps.push({ command: name, passed: result.status === 0 });
  writeFileSync(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  if (result.status !== 0) {
    console.error(result.stderr, result.stdout);
    console.error(`FAIL ${name}. Run it alone with: npm run check ${name}`);
    process.exit(result.status ?? 1);
  }
  console.log('PASS ' + name);
}
console.log('All checks passed. (Behaviour on a real Mac or Windows desktop is still checked by hand.)');
