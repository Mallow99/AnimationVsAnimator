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
  async function ready(expression) {
    try { return await evaluate(expression); }
    catch (err) { if (/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(err.message)) return false; throw err; }
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: pageUrl });
  try { await until(() => ready('!!window.pet')); }
  catch (err) { throw new Error(`${err.message}: ${errors.join('; ')}; page=${await evaluate('location.href')}`); }
  const key = (key, extra = {}) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, ...extra });
  const input = async text => { await evaluate('document.querySelector("#talkText").focus()'); await send('Input.insertText', {text}); };
  await evaluate(`for(const p of window.pets){p.mind.reset(p.ctx);p.mind.holdUntil=Infinity;p.setWindows([]);}window.pet.onTalk()`);
  await input('My name is Sam'); await key('Enter');
  await until(()=>evaluate('document.querySelector("#talkLog .him")?.textContent.includes("Sam")'));
  await input('I am building a tiny platform game'); await key('Enter');
  await until(()=>evaluate('document.querySelectorAll("#talkLog .him").length===2'));
  await input('why?'); await key('Enter');
  await until(()=>evaluate('document.querySelectorAll("#talkLog .him").length===3'));
  assert(await evaluate('document.querySelector("#talkLog").textContent.includes("tiny platform game")'));
  await input('This is a long message. '+ 'A paragraph about the project. '.repeat(30));
  await key('Enter', {modifiers:8}); // Shift+Enter keeps the message in the composer.
  assert((await evaluate('document.querySelector("#talkText").value')).includes('long message'));
  const count=await evaluate('window.pet.brain.log.length');
  await evaluate('document.querySelector("#talkText").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true}))');
  assert.equal(await evaluate('window.pet.brain.log.length'),count);
  await key('Enter');
  await until(()=>evaluate('document.querySelectorAll("#talkLog .you").length===4'));
  assert((await evaluate('document.querySelector("#talkLog .you:last-of-type")?.textContent') ?? '').length || await evaluate('window.pet.brain.log.some(l=>l.who==="you"&&l.text.length>800)'));
  await input('an unsent draft'); await key('Escape');
  assert(await evaluate('!document.querySelector("#talk").classList.contains("open")'));
  await evaluate('window.pet.onTalk()');
  assert.equal(await evaluate('document.querySelector("#talkText").value'),'an unsent draft');
  await evaluate('window.friend.onTalk()');
  assert.equal(await evaluate('document.querySelector("#talkText").value'),'');
  await input('other draft');await evaluate('window.pet.onTalk()');
  assert.equal(await evaluate('document.querySelector("#talkText").value'),'an unsent draft');
  await evaluate('document.querySelector("#talkText").value="";window.pet.command("hear:tell me a story")');
  await until(()=>evaluate('document.querySelector("#talkLog").textContent.includes("brass key")'));
  await evaluate('document.querySelector("#talkLog").scrollTop=0;window.pet.command("hear:take the key to the tower")');
  await until(()=>evaluate('document.querySelector("#talkLog").textContent.includes("cupboard")'));
  assert.equal(await evaluate('document.querySelector("#talkLog").scrollTop'),0);
  const box=await evaluate('(()=>{const r=document.querySelector("#talk").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()');
  assert(box.left>=0 && box.top>=0 && box.right<=1280 && box.bottom<=800);
  mkdirSync(join(root,'docs/verification'),{recursive:true});
  await evaluate('document.querySelector("#talkLog").scrollTop=document.querySelector("#talkLog").scrollHeight');
  writeFileSync(join(root,'docs/verification/ux-local-conversation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(profile,'downloads')});
  await evaluate('document.querySelector("#talkExport").click()');
  await until(()=>existsSync(join(profile,'downloads','Cobalt-conversation.txt')));
  assert(readFileSync(join(profile,'downloads','Cobalt-conversation.txt'),'utf8').includes('brass key'));
  const original=await evaluate('window.pet.brain.log');
  const configs=await evaluate('window.pets.map(p=>p.config)');
  const previousDocument=await evaluate('performance.timeOrigin');
  await send('Page.reload');await until(()=>ready(`performance.timeOrigin!==${previousDocument} && !!window.pet`));
  assert.deepEqual(await evaluate('window.pet.brain.log'),original);
  await evaluate('window.pet.onTalk();window.pet.command("hear:go to the garden")');
  await until(()=>evaluate('window.pet.brain.log.some(l=>l.text.includes("seed from the tower"))'));
  console.log('PASS actual Chromium desktop: export download, long input, Enter/Shift+Enter/IME, topic follow-ups, drafts, figure isolation, bounds, scroll position, restart and story continuity');

  // The Settings document runs unchanged; only the Electron bridge is simulated here.
  const shellSource = `(() => {
    const configs=${JSON.stringify(configs)};configs[0].figureCount=2;
    while(configs.length<5)configs.push({...configs[0],name:'Figure '+configs.length});
    window.sent=[];window.callbacks={};
    window.petShell={petId:0,getConfig:async(id=0)=>configs[id],getConfigs:async()=>configs,
      onStats:cb=>window.callbacks.stats=cb,onCollections:cb=>window.callbacks.collections=cb,onConfig:cb=>window.callbacks.config=cb,onTab:cb=>window.callbacks.tab=cb,
      onKeyStatus:()=>{},onSelect:cb=>window.callbacks.select=cb,
      command:(cmd,id)=>window.sent.push({cmd,id}),setConfig:(patch,id=0)=>{configs[id]={...configs[id],...patch};window.callbacks.config?.({id,config:configs[id]});},resetConfig:(patch,id=0)=>{configs[id]={...configs[id],...patch};window.callbacks.config?.({id,config:configs[id]});},
      keyStatus:async provider=>({provider,saved:false,hint:''}),listModels:async()=>({ok:true,models:[]}),setKey:()=>{},openItemsFolder:()=>{},reloadItems:()=>{}};
  })()`;
  await send('Page.addScriptToEvaluateOnNewDocument',{source:shellSource});
  await send('Page.navigate',{url:pageUrl.replace('/app/index.html','/settings/index.html')});
  await until(()=>ready('!!window.callbacks?.stats && document.querySelector("#figureTarget").options.length===6'));
  const stats = {name:configs[0].name,mood:{happiness:.5,energy:.5,boredom:.5,annoyance:0,fear:0,trust:.5,socialNeed:.5,inspiration:.5,frustration:0,contentment:.5,confidence:.5,affection:.5,stress:0},label:'content',doing:'idle',why:'',asleep:false,recent:[],windows:0,platforms:0,brain:{active:false,status:'',log:original}};
  await evaluate(`window.callbacks.stats({id:0,stats:${JSON.stringify(stats)}});window.callbacks.tab('chat')`);
  assert(!(await evaluate('document.querySelector("#talkText").disabled')));
  await evaluate('document.querySelector("#talkText").value="private draft";window.callbacks.select(1)');
  assert.equal(await evaluate('document.querySelector("#talkText").value'),'');
  assert(!(await evaluate('document.querySelector("#chat").textContent.includes("brass key")')));
  await evaluate('window.callbacks.select(0)');
  assert.equal(await evaluate('document.querySelector("#talkText").value'),'private draft');
  await evaluate('const t=document.querySelector("#figureTarget");t.value="all";t.dispatchEvent(new Event("change"))');
  assert(await evaluate('document.querySelector("#talkText").disabled && document.querySelector("#sendTalk").disabled'));
  const sent=await evaluate('window.sent.length');
  await evaluate('document.querySelector("#talkForm").requestSubmit()');
  assert.equal(await evaluate('window.sent.length'),sent);
  await evaluate('window.callbacks.select(4)');assert(await evaluate('document.querySelector("#talkText").disabled'));
  await evaluate('window.callbacks.select(0);document.querySelector("#talkText").value="a message";document.querySelector("#talkForm").requestSubmit()');
  assert.deepEqual(await evaluate('window.sent.at(-1)'),{cmd:'hear:a message',id:0});
  await evaluate('document.querySelector("#newChat").click()');
  assert(!(await evaluate('document.querySelector("#chatReset").hidden')));
  await evaluate('document.querySelector("#cancelNewChat").click()');
  assert(await evaluate('document.querySelector("#chatReset").hidden'));
  await evaluate('document.querySelector("#newChat").click();document.querySelector("#confirmNewChat").click()');
  assert.deepEqual(await evaluate('window.sent.at(-1)'),{cmd:'conversation:new',id:0});
  await evaluate(`window.callbacks.stats({id:0,stats:${JSON.stringify(stats)}})`);
  writeFileSync(join(root,'docs/verification/ux-settings-conversation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate('const provider=document.querySelector("#provider");provider.value="ollama";provider.dispatchEvent(new Event("change"))');
  await until(()=>evaluate('document.querySelector("#keyForm").hidden'));
  assert(await evaluate('document.querySelector("#providerHelp").textContent.includes("download a model")'));
  assert.deepEqual(errors,[]);
  console.log('PASS actual Chromium Settings with simulated bridge: named/All/inactive scope, no broadcast, drafts, new conversation confirmation/cancel, local capability text, keyless local-provider setup and no page exceptions');
} finally {
  socket?.close(); browser.kill();
  await new Promise((done) => { if (browser.exitCode !== null) done(); else browser.once('close', done); });
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  await new Promise((done) => server.close(done));
}
