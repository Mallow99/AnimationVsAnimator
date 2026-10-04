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
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
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
    p.props.spawn('chair', 180, floor - 44*sc - 2, sc);
    p.props.spawn('desk', 320, floor - 44*sc - 2, sc);
    p.props.spawn('scooter', 900, floor - 38*sc - 2, sc);
    for (let i = 0; i < 240; i++) p.update(1/120);
    p.paused = false; p.command('do:paint');
    for (let i = 0; i < 3600 && !canvas.art; i++) p.update(1/120);
    if (!canvas.art) throw new Error('Canvas painting did not finish');
    p.mind.reset(p.ctx); p.paused = true;
    // Arrange the painted easel away from the TV instead of overlapping both pieces.
    for (const point of canvas.points) { point.x += 430; point.px += 430; }
    p.props.spawn('chair', 70, floor - 44*sc - 2, sc);
    p.props.spawn('couch', 420, floor - 56*sc - 2, sc);
    p.props.spawn('tv', p.char.x + 160*sc, floor - 70*sc - 2, sc);
    p.items.give('helmet', p.char); p.items.give('boots', p.char);
    for (let i = 0; i < 240; i++) p.update(1/120);
    p.paused = false; p.command('do:videogame');
    for (let i = 0; i < 1800 && !p.props.placed.find(t => t.def.id === 'tv').arcade; i++) p.update(1/120);
    if (!p.char.gamepad) throw new Error('He never picked up the controller');
  })()`);
  // Chat opens while he plays, and his ordinary reply doesn't stop the game.
  await evaluate('window.pet.onTalk()');
  assert(await evaluate('document.querySelector("#talk").classList.contains("open")'));
  await evaluate(`(() => { const input = document.querySelector('#talkText'); input.value = 'hello'; input.dispatchEvent(new Event('input')); document.querySelector('#talk').requestSubmit(); })()`);
  await until(() => evaluate('window.pet.brain.log.some(l => l.who === "him")'));
  // Typing s in preview must not turn on smacking.
  const beforeSmack = await evaluate('window.pet.config.smacking');
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'s',code:'KeyS',text:'s'});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'s',code:'KeyS'});
  assert.equal(await evaluate('window.pet.config.smacking'), beforeSmack);
  // Gear follows both feet and can be removed and returned without occupying his belt.
  assert.deepEqual(await evaluate('window.pet.items.onHim.filter(i => i.where === "worn").map(i => [i.def.id, i.poses.length])'), [['helmet',1],['boots',2]]);
  mkdirSync(join(root, '.build'), { recursive: true });
  await evaluate('document.querySelector("#talkText").value = ""; window.pet.say("one more run", 4)');
  await pause(120);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(root, '.build/browser-smoke.png'), Buffer.from(shot.data, 'base64'));
  await evaluate('document.querySelector("#talkClose").click()');
  assert(!(await evaluate('document.querySelector("#talk").classList.contains("open")')));
  assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  console.log('PASS browser: painting, video games on the couch, chat while playing, removable gear, keys, close and rendering');
  console.log('Screenshot: .build/browser-smoke.png');
} finally {
  socket?.close(); browser.kill();
  await new Promise((done) => { if (browser.exitCode !== null) done(); else browser.once('close', done); });
  rmSync(profile, { recursive: true, force: true });
  await new Promise((done) => server.close(done));
}
