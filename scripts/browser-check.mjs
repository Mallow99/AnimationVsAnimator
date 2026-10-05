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
    p.paused = false; p.command('do:playgame');
    for (let i = 0; i < 1800 && p.game.state === 'closed'; i++) p.update(1/120);
    if (p.game.state !== 'invite') throw new Error('Game invitation did not appear');
  })()`);
  await until(() => evaluate('!document.querySelector("#gamePanel").hidden'));
  await evaluate('document.querySelector("#gamePanel .game-actions button").click()');
  await until(() => evaluate('!document.querySelector(".game-grid").hidden'));
  await evaluate('document.querySelectorAll(".game-grid button")[19].click()');
  assert.equal(await evaluate('window.pet.game.board[19]'), 'black');
  assert.equal(await evaluate('window.pet.game.board[27]'), 'black');
  await until(() => evaluate('window.pet.game.turn === "you"'));
  assert.equal(await evaluate('window.pet.game.board.filter(Boolean).length'), 6);
  assert.equal(await evaluate('document.querySelectorAll(".game-grid button[aria-label]").length'), 64);
  assert.equal(await evaluate('window.pet.char.mode'), 'sit');
  // The board and chat must coexist, including after his ordinary reply.
  await evaluate('document.querySelector("#gamePanel .game-actions button:last-child").click()');
  assert(await evaluate('document.querySelector("#talk").classList.contains("open")'));
  assert.equal(await evaluate('window.pet.game.state'), 'playing');
  await evaluate(`(() => { const input = document.querySelector('#talkText'); input.value = 'hello'; input.dispatchEvent(new Event('input')); document.querySelector('#talk').requestSubmit(); })()`);
  await until(() => evaluate('window.pet.brain.log.some(l => l.who === "him")'));
  assert.equal(await evaluate('window.pet.game.state'), 'playing');
  assert.equal(await evaluate('window.pet.char.mode'), 'sit');
  // Typing s in preview must not turn on smacking.
  const beforeSmack = await evaluate('window.pet.config.smacking');
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'s',code:'KeyS',text:'s'});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'s',code:'KeyS'});
  assert.equal(await evaluate('window.pet.config.smacking'), beforeSmack);
  // Gear follows both feet and can be removed and returned without occupying his belt.
  assert.deepEqual(await evaluate('window.pet.items.onHim.filter(i => i.where === "worn").map(i => [i.def.id, i.poses.length])'), [['helmet',1],['boots',2]]);
  // Arrow navigation and keyboard play use the same validated rules as clicking.
  const keyboardMove = await evaluate('window.pet.game.moves[0]');
  await evaluate(`document.querySelectorAll('.game-grid button')[${keyboardMove % 8 < 7 ? keyboardMove + 1 : keyboardMove - 1}].focus()`);
  const arrow = keyboardMove % 8 < 7 ? 'ArrowLeft' : 'ArrowRight';
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:arrow,code:arrow});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:arrow,code:arrow});
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".game-grid button")).indexOf(document.activeElement)'), keyboardMove);
  await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate(`window.pet.game.board[${keyboardMove}]`), 'black');
  // Move the tabletop panel; it stays independent of his speech anchor.
  const start = await evaluate(`(() => { const r = document.querySelector('.game-titlebar').getBoundingClientRect(); return {x:r.left+65,y:r.top+12}; })()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-40,y:start.y-20,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x-40,y:start.y-20,button:'left',clickCount:1});
  const moved = await evaluate('document.querySelector(".game-titlebar").getBoundingClientRect().left');
  assert(moved < start.x-65-20, 'game panel did not drag');
  const rectangle = await evaluate(`(() => { const r = document.querySelector('#gamePanel').getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}; })()`);
  assert(rectangle.left >= 0 && rectangle.top >= 0 && rectangle.right <= rectangle.width && rectangle.bottom <= rectangle.height);
  mkdirSync(join(root, '.build'), { recursive: true });
  await until(() => evaluate('window.pet.game.turn === "you"'));
  await evaluate('document.querySelector("#talkText").value = ""; window.pet.say("your turn", 4)');
  await pause(120);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(root, '.build/browser-smoke.png'), Buffer.from(shot.data, 'base64'));
  await evaluate('document.querySelector("#gamePanel .game-close").click()');
  await until(() => evaluate('document.querySelector("#gamePanel").hidden'));
  // Small screens keep a usable, scrollable board inside the viewport.
  await evaluate('window.pet.paused = true; window.pet.game.invite(); window.pet.game.accept()');
  await send('Emulation.setDeviceMetricsOverride', {width:480,height:640,deviceScaleFactor:2,mobile:false});
  await pause(100);
  const small = await evaluate(`(() => { const r = document.querySelector('#gamePanel').getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}; })()`);
  assert(small.left >= 0 && small.top >= 0 && small.right <= 480 && small.bottom <= 640);
  await evaluate('document.querySelector(".game-close").click(); document.querySelector("#talkClose").click()');
  // New desktop controls and data-image fragments render in the real overlay page.
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await evaluate("window.equipCursor('sword')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#weaponBar')).display"),'flex');
  await evaluate("document.querySelector('#weaponBar button').click()");assert.equal(await evaluate('window.cursorWeapon.kind'),'none');
  // Taking an actual owned weapon automatically connects the pointer controls to that same item.
  await evaluate(`(() => {
    for(const p of window.pets)p.paused=true;
    const p=window.pet;p.mind.reset(p.ctx);
    const gun=p.items.give('gun',p.char);gun.ammo=1;p.takeItem(gun);
  })()`);
  await until(()=>evaluate('window.cursorWeapon.item?.def.id === "gun"'));
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:220,y:260});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:220,y:260,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:220,y:100,button:'left',buttons:1});
  await until(()=>evaluate('window.cursorWeapon.item.ammo === 0'));
  assert(await evaluate('window.cursorWeapon.item.dir.y < -0.9'));
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:220,y:100,button:'left',clickCount:1});
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR'});
  await until(()=>evaluate('window.cursorWeapon.item.ammo === 6'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert(await evaluate('!window.pet.userWeaponControlled && !window.pet.items.carried'));
  await evaluate("(() => {const p=window.pet;p.takeItem(p.items.give('bow',p.char));})()");
  await until(()=>evaluate('window.cursorWeapon.item?.def.id === "bow"'));
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:200,y:260});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:260,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:480,y:160,button:'left',buttons:1});
  await pause(400);
  assert(await evaluate('!!window.cursorWeapon.item.pull'));
  assert(await evaluate('document.querySelector("#weaponBar").textContent.includes("release")'));
  const bowShot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'.build/browser-bow.png'),Buffer.from(bowShot.data,'base64'));
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:480,y:160,button:'left',clickCount:1});
  await until(()=>evaluate('window.cursorWeapon.projectiles.rounds.some(r=>r.kind === "arrow")'));
  await evaluate("document.querySelector('#weaponBar button').click()");
  await evaluate(`(() => {const p=window.pet;p.applyConfig({...p.config,hyperactivity:0});p.paused=false;p.command('do:read');for(let i=0;i<3000;i++)p.update(1/120);p.paused=true;})()`);
  assert.equal(await evaluate('window.pet.mind.skill?.name'),'read');
  assert(await evaluate('window.pet.items.list.some(i=>i.def.id === "book" && i.where === "hand")'));
  await pause(100);
  const readShot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'.build/browser-reading.png'),Buffer.from(readShot.data,'base64'));
  const fragment=await send('Page.captureScreenshot',{format:'png'});
  await evaluate(`window.cutouts.add({id:'render-check',image:${JSON.stringify('data:image/png;base64,'+fragment.data)},x:400,y:300,width:160,height:100,title:'Real screenshot',owner:0})`);
  await until(()=>evaluate('window.cutouts.cards[0].bitmap.naturalWidth>0'));
  assert(await evaluate('window.cutouts.hit(window.cutouts.cards[0].x+5,window.cutouts.cards[0].y+5)!==null'));await evaluate('window.cutouts.clear()');
  // A resident uses its existing identity and is returned by the actual controller.
  await evaluate("window.habitats.enter(0,window.pet,'/test/real-folder');window.habitats.refresh([{id:1,path:'/test/real-folder',kind:'folder',x:100,y:100,width:500,height:400}])");
  assert.equal(await evaluate('window.habitats.activePets[0].ctx.who===window.pet.ctx.who'),true);
  await evaluate('window.habitats.refresh([])');assert.equal(await evaluate('window.habitats.activePets.length'),0);
  await evaluate('window.habitats.returnHome(0)');assert.equal(await evaluate('window.pet.paused'),false);
  assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  console.log('PASS browser: painting, seated Othello, captures, pet turn, concurrent chat, removable gear, keyboard navigation, dragging, bounds, close, actual cursor pistol aim/ammo/reload/return, bow charge/release, book rendering, page-fragment images, native-window visit controller and rendering');
  console.log('Screenshot: .build/browser-smoke.png');
} finally {
  socket?.close(); browser.kill();
  await new Promise((done) => { if (browser.exitCode !== null) done(); else browser.once('close', done); });
  rmSync(profile, { recursive: true, force: true });
  await new Promise((done) => server.close(done));
}
