import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const directory = '.build/verification'; mkdirSync(directory, { recursive: true });
const commands = ['typecheck', 'checks', 'roadmapcheck', 'qualitycheck', 'sanitycheck', 'quality2check', 'polishcheck', 'conversationcheck', 'modelcheck', 'releasecheck', 'bonuscheck', 'contactcheck', 'placementcheck', 'activityrequestcheck', 'sim', 'browsercheck'];
const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), platform: process.platform, steps: [] };
for (const command of commands) {
  console.log('Checking ' + command + '…');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: process.env });
  writeFileSync(`${directory}/${command}.log`, (result.stdout ?? '') + (result.stderr ?? ''));
  report.steps.push({ command, passed: result.status === 0 });
  writeFileSync(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  if (result.status !== 0) { console.error(result.stderr, result.stdout); process.exit(result.status ?? 1); }
  console.log('PASS ' + command);
}
console.log('All automated core and browser checks passed. Native release acceptance is separate.');
