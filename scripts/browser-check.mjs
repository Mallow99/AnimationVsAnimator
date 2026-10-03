// Actual browser smoke check using Chromium's DevTools protocol and Node's built-in WebSocket.
// No browser library or downloaded browser. CHROMIUM_BIN can select a local Chromium executable.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const server = createServer((req, res) => {
  const file = resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(dist + '/') || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const pageUrl = `http://127.0.0.1:${server.address().port}/app/index.html`;
const profile = mkdtempSync(join(tmpdir(), 'ava-browser-'));
const browser = spawn(process.env.CHROMIUM_BIN ?? 'chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--window-size=1280,800', `--user-data-dir=${profile}`,
  '--no-proxy-server', pageUrl], { env: { ...process.env, XDG_CACHE_HOME: join(profile, 'cache') }, stdio: 'ignore' });
let launchError, socket;
browser.on('error', (err) => { launchError = err; });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 200; i++) { if (launchError) throw launchError; if (await fn()) return; await pause(50); }
  throw new Error('Browser readiness timed out');
}
try {
  await until(() => existsSync(join(profile, 'DevToolsActivePort')));
  const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = tabs.find((t) => t.type === 'page'); assert(page);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });
  let seq = 0; const pending = new Map(), errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.id) {
      const cb = pending.get(message.id); pending.delete(message.id);
      if (message.error) cb.reject(new Error(message.error.message)); else cb.resolve(message.result);
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: pageUrl });
  try { await until(() => evaluate('!!window.pet')); }
  catch (err) { throw new Error(`${err.message}: ${errors.join('; ')}; page=${await evaluate('location.href')}`); }
  await evaluate(`(() => {
    const p = window.pet; p.paused = true; p.setWindows([]); p.mind.reset(p.ctx); p.command('respawn');
    for (let i = 0; i < 600; i++) p.update(1/120);
    const floor = p.ctx.world.bounds.floor, sc = p.char.scale;
    const canvas = p.props.spawn('canvas', p.char.x + 40*sc, floor - 68*sc - 2, sc);
    p.props.spawn('tv', 180, floor - 46*sc - 2, sc);
    p.props.spawn('desk', 320, floor - 44*sc - 2, sc);
    p.props.spawn('scooter', 900, floor - 38*sc - 2, sc);
    for (let i = 0; i < 240; i++) p.update(1/120);
    p.paused = false; p.command('do:paint');
    for (let i = 0; i < 3600 && !canvas.art; i++) p.update(1/120);
    if (!canvas.art) throw new Error('Canvas painting did not finish');
    p.mind.reset(p.ctx); p.paused = true;
    p.props.spawn('board-game', p.char.x + 38*sc, floor - 18*sc - 2, sc);
    for (let i = 0; i < 240; i++) p.update(1/120);
    p.paused = false; p.command('do:playgame');
    for (let i = 0; i < 1800 && p.game.state === 'closed'; i++) p.update(1/120);
    if (p.game.state !== 'invite') throw new Error('Game invitation did not appear');
  })()`);
  await until(() => evaluate('!document.querySelector("#gamePanel").hidden'));
  await evaluate('document.querySelector("#gamePanel .game-actions button").click()');
  await until(() => evaluate('!document.querySelector(".game-grid").hidden'));
  await evaluate('document.querySelector(".game-grid button").click()');
  assert.equal(await evaluate('window.pet.game.board[0]'), 'X');
  await until(() => evaluate('window.pet.game.turn === "you"'));
  assert.equal(await evaluate('window.pet.game.board.filter(Boolean).length'), 2);
  assert.equal(await evaluate('document.querySelectorAll(".game-grid button[aria-label]").length'), 9);
  const rectangle = await evaluate(`(() => { const r = document.querySelector('#gamePanel').getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}; })()`);
  assert(rectangle.left >= 0 && rectangle.top >= 0 && rectangle.right <= rectangle.width && rectangle.bottom <= rectangle.height);
  mkdirSync(join(root, '.build'), { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(root, '.build/browser-smoke.png'), Buffer.from(shot.data, 'base64'));
  await evaluate('document.querySelector("#gamePanel .game-actions button:last-child").click()');
  await until(() => evaluate('document.querySelector("#gamePanel").hidden'));
  assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  console.log('PASS browser: canvas painting, game invitation, human move, pet reply, accessible board, close, and rendering');
  console.log('Screenshot: .build/browser-smoke.png');
} finally {
  socket?.close(); browser.kill();
  await new Promise((done) => { if (browser.exitCode !== null) done(); else browser.once('close', done); });
  rmSync(profile, { recursive: true, force: true });
  await new Promise((done) => server.close(done));
}
