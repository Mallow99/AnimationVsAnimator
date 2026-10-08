// Actual browser smoke check using Chromium's DevTools protocol and Node's built-in WebSocket.
// No browser library or downloaded browser. CHROMIUM_BIN can select a local Chromium executable.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const presetBuild=await build({entryPoints:[join(root,'src/core/presets.ts')],bundle:true,platform:'node',format:'esm',write:false});
const {BUNDLES,PRESET_ROWS}=await import('data:text/javascript;base64,'+Buffer.from(presetBuild.outputFiles[0].text).toString('base64'));
const visualPresets=[...BUNDLES,...[0,1,2,3].map(i=>({name:'mix-'+i,look:Object.assign({},...PRESET_ROWS.map(r=>r.variants[i].look)),body:Object.assign({},...PRESET_ROWS.map(r=>r.variants[i].body))}))];
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
  await pause(100);
  await evaluate("window.equipCursor('sword')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#weaponBar')).display"),'flex');
  await evaluate("document.querySelector('#weaponBar button').click()");assert.equal(await evaluate('window.cursorWeapon.kind'),'none');
  // Explicitly using an owned weapon connects pointer controls to that same item.
  await evaluate(`(() => {
    for(const p of window.pets)p.paused=true;
    const p=window.pet;p.mind.reset(p.ctx);
    const gun=p.items.give('gun',p.char);gun.ammo=1;p.useItem(gun);
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
  await evaluate("(() => {const p=window.pet;p.useItem(p.items.give('bow',p.char));})()");
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
  // The physical bag uses real pointer input, and removed objects restore their original identity.
  await evaluate('window.equipCursor("none");for (const [i,p] of window.pets.entries()) { p.mind.reset(p.ctx); p.paused = true; p.mood.asleep=false; p.mood.s.energy=1; p.config.windows=false; p.config.destructible=false; p.setWindows([]); p.command("respawn"); p.char.standUp(); p.char.grab("neck",p.char.body.j.neck.x,p.char.body.j.neck.y);p.char.moveHold(450+i*400,p.ctx.world.bounds.floor-100*p.char.scale,0,0); } for(let i=0;i<180;i++)for(const p of window.pets)p.update(1/120);for(const p of window.pets)p.char.release();for(let i=0;i<720;i++)for(const p of window.pets)p.update(1/120);');
  const centerOf = async selector => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const mouse = async (type, at, down = false) => send('Input.dispatchMouseEvent', {type,...at,button:type==='mouseMoved'?'none':'left',buttons:down?1:0,clickCount:1});
  const click = async selector => { const at=await centerOf(selector);await mouse('mouseMoved',at);await mouse('mousePressed',at,true);await mouse('mouseReleased',at); };
  assert(await evaluate('document.querySelector("#grabBag").hidden && document.querySelector("#trashCan").hidden'));
  // Discover the bag through the figure's real right-click menu, with both shortcuts hidden.
  await evaluate('window.pet.char.stop()');
  // Use the torso: moving the pointer itself makes his head look toward it.
  const head = await evaluate('(() => {const j=window.pet.char.body.j;return {x:(j.neck.x+j.hip.x)/2,y:(j.neck.y+j.hip.y)/2};})()');
  await mouse('mouseMoved', head);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...head,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...head,button:'right',clickCount:1});
  assert(await evaluate('window.pet.menu.rows.some(r=>r.label==="Open bag") && !window.pet.menu.rows.some(r=>r.label.startsWith("Take "))'));
  const bagRow = await evaluate('(() => {const p=window.pet,m=p.menuLayout(),i=p.menu.rows.findIndex(r=>r.label==="Open bag");return {x:m.x+m.w/2,y:m.y+2*m.p+(i+0.5)*m.rowH};})()');
  await mouse('mousePressed',bagRow,true);await mouse('mouseReleased',bagRow);
  assert(await evaluate('window.toolBag.isOpen && document.querySelector("#bagInventory").getAttribute("aria-pressed")==="true"'));
  await click('.bag-choice[data-kind=owned]');
  assert(await evaluate('window.toolBag.isOpen && !window.toolBag.dragging && !document.querySelector("#bagDetails").hidden'));
  const inspected = await evaluate('document.querySelector(".bag-choice[aria-pressed=true]").dataset.id');
  const originalWhere = await evaluate(`window.pet.items.list.find(i=>String(i.uid)===${JSON.stringify(inspected)}).where`);
  await click('#bagDetails [data-action=place]');
  assert(await evaluate('window.toolBag.dragging && !document.querySelector("#bagTransport").hidden'));
  await click('#bagTransport button:last-child');
  assert.equal(await evaluate(`window.pet.items.list.find(i=>String(i.uid)===${JSON.stringify(inspected)}).where`),originalWhere);
  assert(await evaluate('!window.toolBag.dragging && !window.pets.some(p=>p.userWeaponControlled)'));
  await evaluate('window.toolBag.showFor(window.pet)');
  const anchored = await evaluate('document.querySelector("#bagPanel").getBoundingClientRect().left');
  await evaluate('window.pet.char.body.translate(60,0);window.toolBag.refresh()');
  assert.equal(await evaluate('document.querySelector("#bagPanel").getBoundingClientRect().left'),anchored);
  await evaluate('window.pet.char.body.translate(-60,0)');
  await click('#bagSupplies');await click('.bag-choice[data-id=sponge]');
  assert(await evaluate('document.querySelector("#bagDetails").textContent.includes("Sponge")'));
  await click('#bagDetails [data-action=give]');
  assert(await evaluate('window.pet.items.onHim.some(i=>i.def.id==="sponge") && document.querySelector("#bagInventory").getAttribute("aria-pressed")==="true"'));
  await click('#bagActivities');
  assert(await evaluate('Array.from(document.querySelectorAll(".bag-activity")).find(b=>b.dataset.action==="group:relay").disabled'));
  assert(await evaluate('Array.from(document.querySelectorAll(".bag-activity")).find(b=>b.dataset.action==="group:relay").textContent.includes("5")'));
  await click('#bagPanel summary');
  assert(await evaluate('document.querySelector("#bagPanel details").open'));
  const coherentShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'.build/browser-bag-activities.png'),Buffer.from(coherentShot.data,'base64'));
  await click('#bagInventory');await click('.bag-choice[data-kind=owned][data-id]');
  await evaluate('window.coherentTrash=window.pet.items.onHim.find(i=>i.def.id==="sponge")');
  await click(`.bag-choice[data-id="${await evaluate('String(window.coherentTrash.uid)')}"]`);
  await click('#bagDetails [data-action=trash]');
  assert(await evaluate('!window.pet.items.list.includes(window.coherentTrash) && !document.querySelector("#bagUndo").hidden && document.querySelector("#trashCan").hidden'));
  await click('#bagUndo');assert(await evaluate('window.pet.items.list.includes(window.coherentTrash)'));
  await evaluate('window.storeCheck=window.pet.items.onHim[0];window.pet.command("item:take:"+window.storeCheck.uid)');
  assert(await evaluate('window.toolBag.tools.held?.object===window.storeCheck'));
  await evaluate('window.pet.command("item:return:"+window.storeCheck.uid)');
  assert(await evaluate('!window.toolBag.dragging && window.pet.items.onHim.includes(window.storeCheck)'));
  await evaluate('window.pet.command("hear:open bag")');
  assert(await evaluate('window.toolBag.isOpen'));
  const inventoryShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'.build/browser-bag-inventory.png'),Buffer.from(inventoryShot.data,'base64'));
  await evaluate('window.bagFill=[];while(window.pet.items.belt.some(i=>!i))window.bagFill.push(window.pet.items.give("bouncy-ball",window.pet.char));window.fullBefore=window.pet.items.list.length');
  await click('#bagSupplies');await click('.bag-choice[data-id=book]');await click('#bagDetails [data-action=give]');
  assert(await evaluate('window.pet.items.list.length===window.fullBefore && document.querySelector("#bagHint").textContent.includes("full")'));
  await evaluate('for(const item of window.bagFill)window.pet.items.remove(item)');
  await click('[aria-label="Close bag"]');

  await evaluate('window.pet.config.showBag=true;window.pet.config.showTrash=true;window.toolBag.refresh()');
  await click('#grabBag');
  assert.equal(await evaluate('document.querySelector("#bagPanel").hidden'),false);
  assert(await evaluate('document.querySelectorAll(".bag-choice canvas").length >= 17'));
  const bagShot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'.build/browser-grab-bag.png'),Buffer.from(bagShot.data,'base64'));
  // Pull a book into empty world space.
  const booksBefore = await evaluate('JSON.parse(window.pet.save()).items.filter(i=>i.id==="book").length');
  const bookCard=await centerOf('.bag-choice[data-id="book"]');
  await mouse('mousePressed',bookCard,true);await mouse('mouseMoved',{x:bookCard.x+10,y:bookCard.y},true);
  assert(await evaluate('window.toolBag.dragging'));
  await evaluate('window.bagBook = window.toolBag.tools.held.object');
  await mouse('mouseMoved',{x:300,y:240},true);await mouse('mouseReleased',{x:300,y:240});
  assert.equal(await evaluate('window.bagBook.where'),'world');assert.equal(await evaluate('window.toolBag.dragging'),false);
  // Pull a pistol directly onto the second figure, preserving one object and its magazine.
  await click('#grabBag');
  const gunCard=await centerOf('.bag-choice[data-id="gun"]');
  await mouse('mousePressed',gunCard,true);await mouse('mouseMoved',{x:gunCard.x+10,y:gunCard.y},true);
  await evaluate('window.bagGun = window.toolBag.tools.held.object;window.bagGun.ammo=2');
  const target=await evaluate('({x:window.friend.char.body.j.hip.x,y:window.friend.char.body.j.hip.y})');
  await mouse('mouseMoved',target,true);await mouse('mouseReleased',target);
  assert(await evaluate('window.friend.items.list.includes(window.bagGun) && !window.pet.items.list.includes(window.bagGun)'));
  assert.equal(await evaluate('window.bagGun.ammo'),2);assert.equal(await evaluate('window.cursorWeapon.active'),false);
  // Activating the bin without a mouse release must also end an actual weapon controller.
  await evaluate('window.friend.useItem(window.bagGun)');
  await until(()=>evaluate('window.cursorWeapon.item === window.bagGun'));
  await evaluate('document.querySelector("#trashCan").click()');
  await until(()=>evaluate('!window.cursorWeapon.active && !window.friend.items.list.includes(window.bagGun)'));
  await click('#undoTrash');assert(await evaluate('window.friend.items.list.includes(window.bagGun) && window.bagGun.ammo===2'));
  // Pick that same book up from the world, drag it into the can, then click Undo.
  if(await evaluate('window.toolBag.isOpen'))await click('[aria-label="Close bag"]');
  await evaluate('window.bagBook.at={x:1200,y:window.pet.ctx.world.bounds.floor-18,z:0};window.bagBook.dir={x:0,y:1,z:0};window.bagBook.loosen();window.bagBook.resetMotion();for(let j=0;j<300;j++)for(const p of window.pets)p.update(1/120)');
  const grip=await evaluate('(() => {const hull=window.bagBook.collisionHull;return {x:hull.reduce((n,p)=>n+p.x,0)/hull.length,y:hull.reduce((n,p)=>n+p.y,0)/hull.length};})()');
  await mouse('mousePressed',grip,true);
  assert(await evaluate('window.toolBag.tools.held?.object===window.bagBook'));
  const bin=await centerOf('#trashCan');
  await mouse('mouseMoved',bin,true);await mouse('mouseReleased',bin);
  assert(await evaluate('!window.pet.items.list.includes(window.bagBook)'));
  assert.equal(await evaluate('document.querySelector("#undoTrash").hidden'),false);
  assert.equal(await evaluate('JSON.parse(window.pet.save()).items.filter(i=>i.id==="book").length'), booksBefore);
  await click('#undoTrash');
  assert.equal(await evaluate('window.pet.items.list.filter(i=>i===window.bagBook).length'),1);
  assert.equal(await evaluate('window.bagBook.where'),'world');assert.equal(await evaluate('document.querySelector("#undoTrash").hidden'),true);
  // Furniture follows the same bag → can → undo path, without replacing its platform identity.
  await click('#grabBag');
  const chairCard=await centerOf('.bag-choice[data-kind="prop"][data-id="chair"]');
  await mouse('mousePressed',chairCard,true);await mouse('mouseMoved',{x:chairCard.x+10,y:chairCard.y},true);
  await evaluate('window.bagChair=window.toolBag.tools.held.object');
  await mouse('mouseMoved',bin,true);await mouse('mouseReleased',bin);
  assert(await evaluate('!window.pet.props.things.includes(window.bagChair)'));
  await click('#undoTrash');assert.equal(await evaluate('window.pet.props.things.filter(t=>t===window.bagChair).length'),1);
  // Click-to-place and keyboard selection work without relying on a drag.
  await click('#grabBag');await click('.bag-choice[data-id="bouncy-ball"]');
  assert(await evaluate('window.toolBag.isOpen && !window.toolBag.dragging'));
  await click('#bagDetails [data-action=place]');
  assert(await evaluate('window.toolBag.dragging'));
  await mouse('mousePressed',{x:520,y:220},true);await mouse('mouseReleased',{x:520,y:220});
  assert.equal(await evaluate('window.toolBag.dragging'),false);
  await click('#grabBag');
  await click('#bagKeyboard');
  await evaluate('document.querySelector(".bag-choice[data-id=book]").focus()');
  assert.equal(await evaluate('document.activeElement.dataset.id'), 'book');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert(await evaluate('window.toolBag.isOpen && !window.toolBag.dragging'));
  await evaluate('document.querySelector("#bagDetails [data-action=place]").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert(await evaluate('window.toolBag.dragging'), JSON.stringify(await evaluate('({focus:document.activeElement.outerHTML,hint:document.querySelector("#bagHint").textContent,weapon:window.cursorWeapon.kind,carried:window.pets.map(p=>p.items.carried?.def.id),open:window.toolBag.isOpen})')));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await evaluate('window.toolBag.dragging'),false);
  assert(await evaluate('!window.pets.some(p=>p.userWeaponControlled || p.items.carried)'));
  // The open bag remains inside a small viewport, with a scrollable catalog.
  await send('Emulation.setDeviceMetricsOverride',{width:360,height:480,deviceScaleFactor:1,mobile:false});
  await pause(100);
  await evaluate('window.toolBag.refresh()');
  await click('#grabBag');
  assert(await evaluate('!document.querySelector("#bagPanel").hidden'),'small-screen supplies did not open');
  assert(await evaluate('(() => {const r=document.querySelector("#bagPanel").getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})()'));
  const smallBagShot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(root,'.build/browser-grab-bag-small.png'),Buffer.from(smallBagShot.data,'base64'));
  // Optional shortcuts move and persist; the wearable inventory remains usable with both hidden.
  await click('[aria-label="Close bag"]');
  const shortcutBefore = await centerOf('#grabBag');
  const relocated = {x:shortcutBefore.x-85,y:shortcutBefore.y+60};
  await mouse('mousePressed',shortcutBefore,true);await mouse('mouseMoved',relocated,true);await mouse('mouseReleased',relocated);
  const shortcutAfter = await centerOf('#grabBag');assert(Math.abs(shortcutAfter.x-shortcutBefore.x)>40);assert(await evaluate('!!localStorage.getItem("overlay-tools-placement")'));
  await evaluate('window.pet.config.showBag=false;window.pet.config.showTrash=false;window.toolBag.refresh();window.toolBag.showFor(window.pet)');
  assert(await evaluate('!document.querySelector("#bagPanel").hidden && document.querySelector("#grabBag").hidden && document.querySelector("#trashCan").hidden'));
  assert(await evaluate('document.querySelectorAll(".bag-choice[data-kind=owned]").length > 0'));
  await click('[aria-label="Close bag"]');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await pause(100);
  await evaluate(`(() => {
    const previous=window.pet;const cfg={...structuredClone(previous.config),windows:false,dailyRhythm:false};for(const p of window.pets)p.leaveWorld();const a=new previous.constructor({left:0,right:innerWidth,top:0,floor:innerHeight},cfg,{identity:'visual-0'});window.pets.splice(0,window.pets.length,a);window.pet=a;
    while(window.pets.length<5){const i=window.pets.length,names=['Blurp','Leonard','Moss','Violet','Ruby'],colors=['#557ed6','#f7931e','#48a879','#ad72d3','#e46d67'];const p=new a.constructor(a.ctx.world.bounds,{...structuredClone(a.config),name:names[i],look:{...a.config.look,color:colors[i]},windows:false,dailyRhythm:false},{props:a.props,identity:'visual-'+i});window.pets.push(p);}
    for(const [i,p] of window.pets.entries()){p.config.windows=false;p.config.dailyRhythm=false;p.mind.reset(p.ctx);p.paused=true;p.setWindows([]);p.items.list.filter(q=>q.where==='world').forEach(q=>p.items.remove(q));p.char.body.translate(520+i*38-p.char.x,0);p.mind.holdUntil=Infinity;}
    for(const p of window.pets)p.others=window.pets.filter(q=>q!==p);
    for(let i=0;i<360;i++)for(const p of window.pets)p.update(1/120);
    a.props.spawn('couch',610,a.ctx.world.bounds.floor-56*a.char.scale-2,a.char.scale);
    for(let i=0;i<360;i++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=false;
    a.command('do:group:couch');
    for(let i=0;i<2400;i++){for(const p of window.pets)p.update(1/120);if(window.pets.every(p=>p.char.mode==='sit'&&p.view().group?.phase==='do'))break;}
    if(!window.pets.every(p=>p.char.mode==='sit'))throw new Error('Five-person visual fixture did not seat: '+JSON.stringify(window.pets.map(p=>({mode:p.char.mode,group:p.view().group,time:p.ctx.world.time,bounds:p.ctx.world.bounds,whole:p.char.whole,hp:p.char.hp,why:p.mind.why,x:p.char.x}))));
    for(let i=0;i<240;i++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)if(Math.abs(p.char.body.j.hip.y-a.props.placed[0].seatFor(p.ctx.who).y)>10)throw new Error('Visual sitter is off the cushion');
    for(const p of window.pets)p.paused=true;
  })()`);
  await pause(100);
  const groupShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'.build/browser-couch-five.png'),Buffer.from(groupShot.data,'base64'));
  await evaluate(`(() => {
    const a=window.pet;for(const p of window.pets)p.mind.reset(p.ctx);for(const t of [...a.props.things])a.props.remove(t);
    for(const [i,p]of window.pets.entries()){p.char.standUp();p.char.body.translate(260+i*140-p.char.x,0);}
    a.props.spawn('desk',430,730,1);a.props.spawn('workbench',610,730,1);a.props.spawn('storage',800,770,1);
    for(let i=0;i<360;i++)for(const p of window.pets)p.update(1/120);
    a.command('do:deskwork');a.paused=false;
    for(let i=0;i<3600&&!a.props.placed.find(t=>t.def.id==='desk').art;i++)a.update(1/120);
    a.mind.reset(a.ctx);a.paused=true;
    const b=window.pets[1];b.command('do:drawitem:katana');b.paused=false;
    for(let i=0;i<3600&&!b.items.list.some(q=>q.ink);i++)b.update(1/120);
    b.mind.reset(b.ctx);b.command('do:refine');
    for(let i=0;i<2400;i++){b.update(1/120);if(b.items.list.some(q=>q.ink?.progress>0.35))break;}
    if(!b.items.list.some(q=>q.ink?.progress>0.35))throw new Error('Workshop visual fixture did not refine');
    b.paused=true;
  })()`);
  await pause(100);
  const workShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(root,'.build/browser-workshop.png'),Buffer.from(workShot.data,'base64'));
  // New Pong controls use the actual companion game, including keyboard focus from a hidden preview.
  await evaluate(`(() => {
    const a=window.pet;for(const p of window.pets){p.mind.reset(p.ctx);p.char.standUp();p.paused=true;}
    for(let i=0;i<360;i++)for(const p of window.pets)p.update(1/120);
    const tv=a.props.spawn('tv',260,720,1);for(let i=0;i<240;i++)a.update(1/120);
    for(const [i,p]of window.pets.entries()){p.mood.asleep=i>1;p.paused=i>1;}
    a.command('do:pong');for(let i=0;i<2400&&!tv.pong;i++)for(const p of window.pets.slice(0,2))p.update(1/120);
    if(!tv.pong)throw new Error('Pong controls fixture did not start');
    for(const p of window.pets)p.paused=true;window.pongFixture=tv.pong;tv.pong.time=9;
  })()`);
  await pause(100);
  assert(await evaluate('document.querySelector("#pongPanel canvas").hidden'));
  await click('#pongPanel button:nth-child(3)');
  assert(await evaluate('document.activeElement===document.querySelector("#pongPanel canvas")'));
  const paddleBefore=await evaluate('window.pongFixture.paddles[0]');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  assert(await evaluate('window.pongFixture.paddles[0]')>paddleBefore);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await evaluate('window.pongFixture.user'),null);
  await until(()=>evaluate('!document.querySelector("#pongPanel button:nth-child(1)").hidden'));
  await click('#pongPanel button:nth-child(1)');
  const court=await centerOf('#pongPanel canvas');await mouse('mouseMoved',{x:court.x,y:court.y-35});
  assert.equal(await evaluate('window.pongFixture.user'),0);
  await evaluate('window.pongFixture.winner=0;window.pongFixture.score[0]=5');await pause(100);
  await click('#pongPanel button:nth-child(2)');assert.deepEqual(await evaluate('window.pongFixture.score'),[0,0]);
  await evaluate('window.pet.mind.reset(window.pet.ctx)');await pause(100);
  assert(await evaluate('document.querySelector("#pongPanel").hidden'));
  // Pet Quality: actual pointer transport/use/carry/drop and mouse-only reload.
  await evaluate(`(() => {
    window.equipCursor('none');
    for(const p of window.pets){p.paused=true;p.mind.reset(p.ctx);p.mood.asleep=false;p.char.standUp();p.setWindows([]);p.mind.holdUntil=Infinity;}
    for(const t of [...window.pet.props.things])window.pet.props.remove(t);
    for(let i=0;i<300;i++)for(const p of window.pets)p.update(1/120);
    window.qualityGun=window.pet.items.give('gun',window.pet.char);window.qualityGun.ammo=0;
    window.toolBag.showFor(window.pet);
  })()`);
  await click(`.bag-choice[data-kind=owned][data-id="${await evaluate('String(window.qualityGun.uid)')}"]`);
  await click('#bagDetails [data-action=place]');
  assert(await evaluate('window.toolBag.dragging && !window.cursorWeapon.active'));
  await mouse('mouseMoved',{x:600,y:230},true);
  assert.equal(await evaluate('window.qualityGun.ammo'),0);
  await click('#bagTransport button:first-of-type');
  await until(()=>evaluate('window.cursorWeapon.item === window.qualityGun'));
  const weaponAction = async label => {
    const at=await evaluate(`(() => {const b=Array.from(document.querySelectorAll('#weaponBar button')).find(b=>b.textContent===${JSON.stringify(label)});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await mouse('mouseMoved',at);await mouse('mousePressed',at,true);await mouse('mouseReleased',at);
  };
  await weaponAction('Reload');
  await until(()=>evaluate('window.qualityGun.reloadRemaining>0 && document.querySelector("#weaponBar").textContent.includes("Reloading")'));
  await until(()=>evaluate('window.qualityGun.ammo===6'));
  await weaponAction('Carry');
  assert(await evaluate('window.toolBag.tools.held?.object===window.qualityGun && !window.cursorWeapon.active'));
  await mouse('mouseMoved',{x:950,y:240});await mouse('mousePressed',{x:950,y:240},true);await mouse('mouseReleased',{x:950,y:240});
  assert(await evaluate('window.qualityGun.where==="world" && !window.toolBag.dragging && window.qualityGun.ammo===6'));
  await evaluate('window.toolBag.takeItem(window.pet,window.qualityGun)');
  await click('#bagTransport button:last-child');
  assert(await evaluate('window.qualityGun.where==="world" && !window.cursorWeapon.active'));

  // Cleaner transport is passive, activation starts here, and Stop using returns to safe carrying.
  await evaluate(`(() => {
    window.qualitySponge=window.pet.items.give('sponge',window.pet.char);
    window.qualityInk={strokes:[[{x:550,y:330},{x:750,y:330}]],color:'#fff',done:true,born:window.pet.ctx.world.time};
    window.pet.ctx.doodles.push(window.qualityInk);window.toolBag.showFor(window.pet);
  })()`);
  await click(`.bag-choice[data-kind=owned][data-id="${await evaluate('String(window.qualitySponge.uid)')}"]`);
  await click('#bagDetails [data-action=place]');
  await mouse('mouseMoved',{x:650,y:330},true);
  assert(await evaluate('window.qualityInk.strokes.length===1 && window.qualityInk.strokes[0][0].x===550 && !window.toolBag.tools.using'));
  await click('#bagTransport button:first-of-type');
  assert(await evaluate('window.toolBag.tools.using'));
  await mouse('mouseMoved',{x:665,y:330},true);
  assert(await evaluate('window.qualityInk.strokes.length===2'));
  await click('#bagTransport button:first-of-type');
  assert(await evaluate('!window.toolBag.tools.using'));
  const passiveInk=await evaluate('JSON.stringify(window.qualityInk.strokes)');
  await mouse('mouseMoved',{x:740,y:330},true);assert.equal(await evaluate('JSON.stringify(window.qualityInk.strokes)'),passiveInk);
  await click('#bagTransport button:last-child');assert(await evaluate('window.qualitySponge.where==="belt"'));

  // Explicitly store a real book, fetch that same one and inspect every opening/page/closing phase.
  await evaluate(`(() => {
    const a=window.pet;window.qualityShelf=a.props.spawn('bookshelf',1020,innerHeight-67,1);
    window.qualityBook=a.items.give('book',a.char);window.toolBag.showFor(a);
  })()`);
  await click(`.bag-choice[data-kind=owned][data-id="${await evaluate('String(window.qualityBook.uid)')}"]`);
  await click('#bagDetails [data-action=shelve]');
  assert(await evaluate('window.qualityBook.where==="world" && window.qualityBook.shelf?.key===window.qualityShelf.storageKey'));
  await click('[aria-label="Close bag"]');
  await evaluate(`(() => {
    const ids=['book','cup','dumbbell','yo-yo','handheld'], commands=['read','sip','exercise','yoyo','handheld'];
    const personalities=['inventive','gentle','competitive','mischievous','adventurous'];
    for(const [i,p]of window.pets.entries()){
      p.mind.reset(p.ctx);p.paused=true;p.mood.asleep=false;p.char.standUp();p.applyConfig({...p.config,personality:personalities[i],hyperactivity:1,scale:1,windows:false,dailyRhythm:false});
      for(const item of [...p.items.list])if(item.def.id==='book' || item.where==='world')p.items.remove(item);
      p.char.grab("neck",p.char.body.j.neck.x,p.char.body.j.neck.y);p.char.moveHold(130+i*200,p.ctx.world.bounds.floor-100,0,0);p.items.give(ids[i],p.char);
    }
    for(let i=0;i<180;i++)for(const p of window.pets)p.update(1/120);for(const p of window.pets)p.char.release();
    for(let i=0;i<720;i++)for(const p of window.pets)p.update(1/120);
    for(const [i,p]of window.pets.entries()){p.paused=false;p.command('do:'+commands[i]);}
    for(let i=0;i<160;i++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=true;
  })()`);
  const scene = async name => {
    await pause(80);const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:innerHeightFallback-180,width:1280,height:180,scale:2}});
    writeFileSync(join(root,'.build/'+name+'.png'),Buffer.from(shot.data,'base64'));
  };
  const innerHeightFallback = await evaluate('innerHeight');
  await scene('quality-everyday-open');
  assert(await evaluate('window.pets[0].items.list.find(i=>i.def.id==="book").bookOpen>0.8'));
  await evaluate('for(let i=0;i<1450;i++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}');
  await scene('quality-everyday-page');
  const renderedFrameMs=await evaluate(`new Promise(resolve=>{
    for(const p of window.pets)p.paused=false;
    const times=[];let before=0;
    const frame=now=>{if(before)times.push(now-before);before=now;if(times.length<120)requestAnimationFrame(frame);else{for(const p of window.pets)p.paused=true;times.sort((a,b)=>a-b);resolve({median:times[60],p95:times[114]});}};
    requestAnimationFrame(frame);
  })`);
  console.log('Chromium five-figure rendered frame intervals (ms):',renderedFrameMs);

  // End-of-activity screenshots include the closing reach and the returned original book.
  await evaluate(`(() => {
    const p=window.pet;p.paused=false;
    for(let i=0;i<42000;i++){
      p.update(1/120);const b=p.items.list.find(i=>i.def.id==='book');
      if(b && b.bookOpen>0.1 && b.bookOpen<0.8 && p.mind.activeSkill?.name==='read')break;
    }
    p.paused=true;
  })()`);
  await scene('quality-book-closing');
  await evaluate('for(let i=0;i<42000 && window.pet.mind.activeSkill?.name==="read";i++){window.pet.paused=false;window.pet.update(1/120);}window.pet.paused=true;');
  await scene('quality-bookshelf-return');
  assert(await evaluate('window.pet.items.list.some(i=>i.def.id==="book"&&i.shelf?.key===window.qualityShelf.storageKey)'));
  console.log('PASS Pet Quality browser: passive Take out, explicit Use, visible mouse Reload, Carry, Drop, Cancel, passive/active/stop cleaning, bookshelf storage, and rendered everyday/open/page/close/return sequences');
  // Shared inventory uses the selected roster and keeps original owned objects through removal.
  await evaluate(`(() => {window.rosterRuby=window.figurePool[4];window.rosterBook=window.rosterRuby.items.give('book',window.rosterRuby.char);window.setRoster([4]);window.toolBag.showAll('supplies');})()`);
  assert.deepEqual(await evaluate('window.pets.map(p=>p.ctx.who)'),['pet-4']);
  assert(await evaluate('window.pet.ownsProps && window.pet.props===window.figurePool[0].props'));
  await click('.bag-choice[data-kind=item][data-id=cup]');await click('#bagDetails [data-action=give]');
  assert(await evaluate('window.rosterRuby.items.list.some(i=>i.def.id==="cup")'));
  await evaluate('window.setRoster([0,2,4]);window.toolBag.showAll("supplies")');
  await click('.bag-choice[data-kind=item][data-id="yo-yo"]');await click('#bagDetails [data-action=give]');
  assert(await evaluate('window.pets.every(p=>p.items.list.some(i=>i.def.id==="yo-yo"))'));
  assert.equal(await evaluate('new Set(window.pets.map(p=>p.items.list.filter(i=>i.def.id==="yo-yo").at(-1))).size'),3);
  await evaluate('window.setRoster([0]);window.setRoster([4]);window.toolBag.showAll()');
  assert(await evaluate('window.pet===window.rosterRuby && window.pet.items.list.includes(window.rosterBook)'));
  await send('Page.captureScreenshot',{format:'png'}).then(shot=>writeFileSync(join(root,'.build/living-unified-bag.png'),Buffer.from(shot.data,'base64')));
  console.log('PASS selectable Ruby solo, stable character identity/owned book, shared furniture responsibility, All figures supplies with distinct ownership, unified target dropdown');
  await evaluate(`(() => {
    window.toolBag.close();window.setRoster([0,1,2,3,4]);window.pet.props.things.length=0;
    for(const [i,p] of window.pets.entries()){
      p.paused=true;p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.mood.asleep=false;p.command('resetMood');p.char.hp=1;p.freeze=0;p.applyConfig({...p.config,windows:false,scale:1,dailyRhythm:false,destructible:false});p.setWindows([]);p.command('respawn');
    }
    for(let j=0;j<1000;j++)for(const p of window.pets)p.update(1/120);
    for(const [i,p]of window.pets.entries())p.char.placeHome(140+i*70);
    window.livingCouch=window.pet.props.spawn('couch',640,innerHeight-57,1);
    for(let j=0;j<360;j++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets){p.mind.reset(p.ctx);p.paused=false;}window.pet.command('do:group:couch');
    for(let j=0;j<2400&&!window.pets.every(p=>p.view().group?.phase==='do');j++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=true;
  })()`);
  assert(await evaluate('window.pets.every(p=>p.char.mode==="sit" && p.view().group?.members.length===5)'),JSON.stringify(await evaluate('window.pets.map(p=>({mode:p.char.mode,hp:p.char.hp,skill:p.mind.activeSkill?.name,group:p.view().group,x:p.char.x,y:p.char.body.j.footL.y,why:p.mind.why}))')));
  await scene('living-five-couch');
  // Recenter live individual activities after a member leaves; exercise their actual scoot loop.
  await evaluate(`(() => {
    for(const p of window.pets){p.mind.reset(p.ctx);p.char.standUp();p.paused=false;p.command('do:sitdown');}
    for(let j=0;j<1200;j++)for(const p of window.pets)p.update(1/120);
    window.pets[4].mind.reset(window.pets[4].ctx);
    for(let j=0;j<5;j++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=true;
  })()`);
  await scene('living-scoot-brace');
  await evaluate('for(let j=0;j<34;j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}');await scene('living-scoot-lift');
  await evaluate('for(let j=0;j<42;j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}');await scene('living-scoot-shift');
  await evaluate(`(() => {
    for(const p of window.pets){window.livingCouch.leaveSeat(p.ctx.who);p.char.standUp();p.paused=false;}window.pet.command('do:chat');
    for(let j=0;j<2000&&!window.pets.every(p=>p.view().group?.phase==='do');j++)for(const p of window.pets)p.update(1/120);
    for(let j=0;j<490;j++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=true;
  })()`);
  await scene('living-group-listening');
  assert.deepEqual(await evaluate('window.checkSanity()'),[]);
  await evaluate(`(() => {
    for(const [i,p]of window.pets.entries()){p.mind.reset(p.ctx);p.char.standUp();p.char.placeHome(220+i*160);p.paused=false;p.mind.holdUntil=Infinity;}
    window.pets[0].selectPeer(window.pets[1].ctx.who);window.pets[1].selectPeer(window.pets[0].ctx.who);
    window.pets[0].command('do:duel');
    for(let j=0;j<700;j++)for(const p of window.pets)p.update(1/120);
    for(const p of window.pets)p.paused=true;
  })()`);
  await scene('living-duel-spectators');assert(await evaluate('window.pets.slice(2).every(p=>p.char.hp===1 && p.mind.activeSkill?.name!=="duel")'));
  console.log('PASS Living Stickmen browser: rendered five couch seats, brace/lift/shift scoot phases, group listening and spectator-safe combat; live sanity audit clean');
  // Update 2: stock supplies, actual Activities buttons and physical motion phases.
  await evaluate(`(() => {
    window.toolBag.cancel();window.cursorWeapon.detach();
    for(const p of window.pets){p.mind.reset(p.ctx);for(const item of [...p.items.list])p.items.remove(item);p.command('respawn');p.mind.reset(p.ctx);p.paused=true;p.char.standUp();p.mind.holdUntil=Infinity;p.items.give('book',p.char);p.items.give('bouncy-ball',p.char);}
    for(const t of [...window.pet.props.things])window.pet.props.remove(t);
    for(const [i,p]of window.pets.entries()){p.char.placeHome([350,850,650,1030,1240][i]);p.char.hp=1;p.mood.s.energy=.8;p.mood.asleep=false;for(const id of ['blanket','snack-box'])p.items.give(id,p.char);}
    window.pet.props.spawn('couch',390,innerHeight-57,1);window.pet.props.spawn('lamp',660,innerHeight-31,1);
    for(let j=0;j<600;j++)for(const p of window.pets)p.update(1/120);
    window.toolBag.showFor(window.pets[1],'activities');
  })()`);
  assert(await evaluate('Array.from(document.querySelectorAll(".bag-activity")).some(b=>b.textContent.includes("Have a snack"))'));
  await click('.bag-activity[data-action=snack]');assert(!await evaluate('window.toolBag.isOpen'));
  await evaluate('for(let j=0;j<600;j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}');
  assert(await evaluate('window.pets[1].items.list.some(i=>i.def.id==="snack-box"&&i.snackOpen>0.8)'));
  await evaluate('window.pets[0].command("do:blanket");window.pets[2].command("do:read");for(let j=0;j<1400;j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}');
  await scene('pq2-domestic');
  for(const [phase,ticks]of [['pause',200],['snack-reach',120],['snack-lower',240]]){
    await evaluate(`for(let j=0;j<${ticks};j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}`);await scene('pq2-domestic-'+phase);
  }
  await evaluate(`(() => {for(const p of window.pets){p.mind.reset(p.ctx);p.char.standUp();p.char.placeHome(210+window.pets.indexOf(p)*180);p.mood.s.energy=.8;p.mood.asleep=false;p.paused=false;}for(const t of [...window.pet.props.things])window.pet.props.remove(t);for(let j=0;j<600;j++)for(const p of window.pets)p.update(1/120);if(!window.pet.items.list.some(i=>i.def.id==='bouncy-ball'))window.pet.items.give('bouncy-ball',window.pet.char);window.toolBag.showFor(window.pet,'activities');})()`);
  assert(!await evaluate('document.querySelector(".bag-activity[data-action=catch]").disabled'),JSON.stringify(await evaluate('window.pets.map(p=>({view:p.view(),why:p.mind.why}))')));
  await click('.bag-activity[data-action=catch]');assert(!await evaluate('window.toolBag.isOpen'));
  await evaluate('for(let j=0;j<1800&&window.pet.view().group?.phase!=="do";j++)for(const p of window.pets)p.update(1/120);for(const p of window.pets)p.paused=true;');
  assert.equal(await evaluate('window.pet.view().group?.act'),'catch',JSON.stringify(await evaluate('window.pets.map(p=>({mode:p.char.mode,energy:p.mood.s.energy,doing:p.mind.activeSkill?.name,group:p.view().group,why:p.mind.why,items:p.items.list.map(i=>[i.def.id,i.where])}))')));await scene('pq2-catch-ready');
  for(const [phase,ticks]of [['throw',145],['flight',20],['receive',40]]){await evaluate(`for(let j=0;j<${ticks};j++)for(const p of window.pets){p.paused=false;p.update(1/120);p.paused=true;}`);await scene('pq2-catch-'+phase);}
  assert(await evaluate('window.pets.every(p=>p.char.hp===1)'));assert.deepEqual(await evaluate('window.checkSanity()'),[]);
  await evaluate('for(const p of window.pets)p.mind.reset(p.ctx);window.toolBag.showFor(window.pet,"supplies")');
  await click('.bag-choice[data-id=blanket]');await click('#bagDetails [data-action=place]');
  assert(await evaluate('window.toolBag.dragging && !window.toolBag.tools.using && !window.cursorWeapon.active && !window.pet.items.carried?.working'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});assert(!await evaluate('window.toolBag.dragging'));
  console.log('PASS Update 2 browser: real snack/catch buttons, passive blanket transport/cancel, lamp/blanket/snack and catch motion frames, safe spectators and live audit');
  // Both facings for every bundle and every stance/walk/color/thickness/pixel preset variant.
  await evaluate('window.pq2PresetBase=structuredClone(window.pet.config)');
  for(const preset of visualPresets)for(const facing of [-1,1]){
    await evaluate(`(() => {
      for(const p of window.pets)p.leaveWorld();
      const p=window.pet,v=${JSON.stringify(preset)},base=structuredClone(window.pq2PresetBase);
      p.applyConfig({...base,look:{...base.look,...v.look},body:{...base.body,...v.body},windows:false,dailyRhythm:false,destructible:false});
      window.pets.splice(0,window.pets.length,p);p.others=[];p.paused=true;p.mind.holdUntil=Infinity;for(const i of [...p.items.list])p.items.remove(i);p.command('respawn');p.char.placeHome(520);
      for(let j=0;j<600;j++)p.update(1/120);p.char.facing=${facing};p.char.yaw=${facing<0?'Math.PI':'0'};
      p.items.give('book',p.char);p.paused=false;p.command('do:read');for(let j=0;j<500;j++)p.update(1/120);p.paused=true;
    })()`);
    await scene('pq2-preset-'+preset.name.toLowerCase()+'-'+(facing<0?'left':'right'));
    assert.deepEqual(await evaluate('window.checkSanity()'),[]);
  }
  console.log('PASS Update 2 visual fixtures: all appearance/movement variants and four bundles, both facings, original reader book and live audits');
  assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  console.log('PASS browser: painting, seated Othello, captures, pet turn, concurrent chat, removable gear, keyboard navigation, dragging, bounds, close, actual cursor pistol aim/ammo/reload/return, bow charge/release, book rendering, page-fragment images, native-window visit controller and rendering');
  console.log('Screenshot: .build/browser-smoke.png');
  console.log('PASS browser: right-click Open bag with hidden shortcuts, inspect without taking/closing, explicit give/place, safe Cancel, stable panel, activity requirements, instructions, hidden-icon Trash/Undo, Settings take/return, full bag refusal');
  console.log('PASS browser: physical bag art, mouse pull/drop/give, ammo preservation, loose item selection, trash/undo identity, furniture undo, click-to-place, keyboard/Escape, small-screen bag bounds, 5-person couch/workshop rendering, real Pong mouse/keyboard/join/rematch controls');
} finally {
  socket?.close(); browser.kill();
  await new Promise((done) => { if (browser.exitCode !== null) done(); else browser.once('close', done); });
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  await new Promise((done) => server.close(done));
}
