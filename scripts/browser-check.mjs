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
  await pause(100);
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
  // The physical bag uses real pointer input, and removed objects restore their original identity.
  await evaluate('for (const [i,p] of window.pets.entries()) { p.mind.reset(p.ctx); p.paused = true; p.config.windows=false; p.setWindows([]); p.char.standUp(); p.char.body.translate(450+i*400-p.char.x,0); } for(let i=0;i<600;i++)for(const p of window.pets)p.update(1/120);');
  const centerOf = async selector => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const mouse = async (type, at, down = false) => send('Input.dispatchMouseEvent', {type,...at,button:type==='mouseMoved'?'none':'left',buttons:down?1:0,clickCount:1});
  const click = async selector => { const at=await centerOf(selector);await mouse('mouseMoved',at);await mouse('mousePressed',at,true);await mouse('mouseReleased',at); };
  assert(await evaluate('document.querySelector("#grabBag").hidden && document.querySelector("#trashCan").hidden'));
  // Discover the bag through the figure's real right-click menu, with both shortcuts hidden.
  const head = await evaluate('({x:window.pet.char.body.j.head.x,y:window.pet.char.body.j.head.y})');
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
  await evaluate('window.friend.takeItem(window.bagGun)');
  await until(()=>evaluate('window.cursorWeapon.item === window.bagGun'));
  await evaluate('document.querySelector("#trashCan").click()');
  await until(()=>evaluate('!window.cursorWeapon.active && !window.friend.items.list.includes(window.bagGun)'));
  await click('#undoTrash');assert(await evaluate('window.friend.items.list.includes(window.bagGun) && window.bagGun.ammo===2'));
  // Pick that same book up from the world, drag it into the can, then click Undo.
  await evaluate('window.bagBook.at={x:300,y:240,z:0};window.bagBook.dir={x:0,y:1,z:0};window.bagBook.loosen();window.bagBook.resetMotion()');
  const grip=await evaluate('({x:window.bagBook.a.x,y:window.bagBook.a.y})');
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
  await click('#pongPanel button:nth-child(1)');
  const court=await centerOf('#pongPanel canvas');await mouse('mouseMoved',{x:court.x,y:court.y-35});
  assert.equal(await evaluate('window.pongFixture.user'),0);
  await evaluate('window.pongFixture.winner=0;window.pongFixture.score[0]=5');await pause(100);
  await click('#pongPanel button:nth-child(2)');assert.deepEqual(await evaluate('window.pongFixture.score'),[0,0]);
  await evaluate('window.pet.mind.reset(window.pet.ctx)');await pause(100);
  assert(await evaluate('document.querySelector("#pongPanel").hidden'));
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
