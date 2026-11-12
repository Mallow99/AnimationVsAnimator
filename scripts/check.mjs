// One command for every automated check.
//
//   npm run check              lists every check and what it covers
//   npm run check core         runs one
//   npm run check sim soak     runs several, in order
//
// `npm run verify` runs the whole everyday set (the ones marked "verify" below).
//
// To add a check: put the file in scripts/checks/ and add one line to CHECKS.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

// [name, file inside scripts/, which app build it needs first, part of `npm run verify`?, what it covers]
//   Files ending .ts are bundled and run in plain Node (no window, no browser).
//   Files ending .mjs run in plain Node; the "browser" ones drive headless Chrome.
//   Files ending .electron.cjs run inside the real Electron app (under Xvfb on Linux).
//   Build: 'dev' = development edition, 'release' = the packaged edition, null = none.
export const CHECKS = [
  ['core', 'checks/core.ts', null, true, 'The main regression list: body, items, props, skills, saves'],
  ['roadmap', 'checks/roadmap.ts', null, true, 'Cursor weapons, drawn tools, several figures at once'],
  ['quality', 'checks/quality.ts', null, true, 'Handling, carrying and ownership rules'],
  ['living', 'checks/living.ts', null, true, 'Bags, books, everyday life, the built-in sanity audit'],
  ['quality-2', 'checks/quality-2.ts', null, true, 'Friendships, gifts, catch, handheld games, furniture'],
  ['polish', 'checks/polish.ts', null, true, 'Reading poses, seating, varied routines'],
  ['conversation', 'checks/conversation.ts', null, true, 'Built-in dialogue: facts, follow-ups, stories, requests'],
  ['model', 'checks/model.ts', null, true, '3D prop models and the hinged book'],
  ['release', 'checks/release.ts', null, true, 'Packaged-edition rules: quiet defaults, no cloud AI, save recovery'],
  ['bonus', 'checks/bonus.ts', null, true, 'The bonus buddy (Arnold): unlock, roster, tattoo, quill'],
  ['contact', 'checks/contact.ts', null, true, 'Hands really reach what they pick up, stow and give'],
  ['placement', 'checks/placement.ts', null, true, 'Placing furniture and snapping it to the floor'],
  ['activity-requests', 'checks/activity-requests.ts', null, true, 'Activity buttons: availability and answers'],
  ['local-ai', 'checks/local-ai.mjs', null, true, 'The Ollama connection, against a pretend local server'],
  ['sim', 'checks/sim.ts', null, true, 'Long scripted life of one figure (SIM_SEED picks the random seed)'],
  ['browser', 'checks/browser.mjs', 'dev', true, 'The overlay page in headless Chrome: mouse, keyboard, bags'],

  [
    'soak',
    'checks/soak.ts',
    null,
    false,
    'Figures left alone for minutes; reports anything odd (SOAK_SECONDS, SOAK_SEED)',
  ],
  [
    'living-soak',
    'checks/living-soak.ts',
    null,
    false,
    'Two simulated hours of every feature (LIVING_SOAK_SEED, LIVING_SOAK_SECONDS)',
  ],
  ['quality-profile', 'checks/quality-profile.ts', null, false, 'How long one physics step takes with 2 and 5 figures'],
  [
    'life-profile',
    'checks/life-profile.ts',
    null,
    false,
    'What figures spend their time on when left alone (LIFE_SEED)',
  ],
  [
    'conversation-ui',
    'checks/conversation-ui.mjs',
    'dev',
    false,
    'Chat windows in headless Chrome: typing, drafts, export',
  ],
  ['chrome-bridge', 'checks/chrome-bridge.mjs', null, false, 'Development-only link to the Chrome extension'],
  [
    'dev-app',
    'checks/dev-app.electron.cjs',
    'dev',
    false,
    'Development edition in real Electron: settings, items, chat',
  ],
  ['file-visits', 'checks/file-visits.electron.cjs', 'dev', false, 'Development-only visits to real folders and files'],
  [
    'release-app',
    'checks/release-app.electron.cjs',
    'release',
    false,
    'Packaged edition in real Electron, start to quit',
  ],
  [
    'bonus-app',
    'checks/bonus-app.electron.cjs',
    'release',
    false,
    'Packaged edition: unlocking and meeting the bonus buddy',
  ],
  [
    'placement-app',
    'checks/placement-app.electron.cjs',
    'release',
    false,
    'Packaged edition: placing furniture with the mouse',
  ],

  [
    'ram-profile',
    'tools/ram-profile.electron.cjs',
    'dev',
    false,
    'Tool, not a test: measures memory use (AVA_RAM_COUNT)',
  ],
  [
    'store-media',
    'tools/store-media.electron.cjs',
    'release',
    false,
    'Tool, not a test: retakes the store screenshots (needs ffmpeg)',
  ],
];

/** The packaged-edition checks that open the real app. CI runs these after `npm run verify`. */
export const APP_CHECKS = ['release-app', 'bonus-app', 'placement-app'];

/** A Chrome-family browser for the headless checks. Set CHROMIUM_BIN to choose one yourself. */
function findBrowser() {
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : process.platform === 'win32'
        ? [
            `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium'];
  return candidates.find((file) => existsSync(file));
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, { cwd: root, stdio: 'inherit', env }).status ?? 1;
}

/** Runs one check; returns its exit code (0 = passed). */
export async function runCheck(name) {
  const entry = CHECKS.find((check) => check[0] === name);
  if (!entry) {
    console.error(`No check called "${name}". Run "npm run check" to list them.`);
    return 1;
  }
  const [, file, needsBuild] = entry;
  const source = resolve(root, 'scripts', file);
  if (needsBuild) {
    const built = run(process.execPath, ['scripts/build.mjs', ...(needsBuild === 'release' ? ['release'] : [])]);
    if (built) return built;
  }
  if (file.endsWith('.ts')) {
    const outfile = resolve(root, '.build/checks', name + '.mjs');
    mkdirSync(resolve(root, '.build/checks'), { recursive: true });
    await build({
      entryPoints: [source],
      outfile,
      bundle: true,
      sourcemap: true,
      logLevel: 'warning',
      target: 'es2022',
      platform: 'node',
      format: 'esm',
      define: { __COMMERCIAL__: 'false' },
    });
    return run(process.execPath, ['--enable-source-maps', outfile]);
  }
  if (file.endsWith('.electron.cjs')) {
    const electron = createRequire(import.meta.url)('electron'); // the path of the Electron program
    const linux = process.platform === 'linux';
    const args = [...(linux ? ['--no-sandbox'] : []), source];
    // A Linux machine without a screen (the cloud, CI) needs a pretend one.
    return linux && !process.env.DISPLAY ? run('xvfb-run', ['-a', electron, ...args]) : run(electron, args);
  }
  const browser = findBrowser();
  return run(process.execPath, [source], browser ? { ...process.env, CHROMIUM_BIN: browser } : process.env);
}

// Run directly (not imported by verify.mjs): do what the command line asked.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.log('Usage: npm run check <name> [<name> ...]\n');
    for (const [name, , , inVerify, about] of CHECKS)
      console.log(`  ${name.padEnd(18)} ${inVerify ? 'verify  ' : '        '}${about}`);
    console.log('\n"verify" = part of npm run verify. Add --app to verify to also run: ' + APP_CHECKS.join(', '));
    process.exit(0);
  }
  for (const name of names) {
    const started = Date.now();
    const status = await runCheck(name);
    console.log(`${status ? 'FAIL' : 'PASS'} ${name} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    if (status) process.exit(status);
  }
}
