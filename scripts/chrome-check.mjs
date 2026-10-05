// Real Chromium DOM/canvas + real local bridge. Chrome extension APIs are simulated here;
// activeTab grants and captureVisibleTab permissions still require testing in installed Chrome.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const root = resolve(import.meta.dirname, '..');
await build({
  entryPoints: [join(root, 'src/electron/desktop-bridge.ts')],
  outfile: join(root, '.build/desktop-bridge.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { DesktopBridge } = await import('../.build/desktop-bridge.mjs');
const profile = mkdtempSync(join(tmpdir(), 'ava-chrome-')),
  cutouts = [];
const bridge = new DesktopBridge({
  dataDir: profile,
  enabled: () => true,
  changed: () => {},
  cutout: (c) => cutouts.push(c),
});
await bridge.start();
const url = `http://127.0.0.1:${bridge.port}/test?token=${new URL(bridge.pairing).searchParams.get('token')}`;
bridge.server.prependListener('request', (req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/test') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<!doctype html><title>Bridge test</title><style>body{margin:0;font:20px system-ui}#pick{position:absolute;left:150px;top:180px;width:180px;height:80px;background:#f8bf65}</style><div id="pick">Real page content</div>',
    );
  }
});
const browser = spawn(
  process.env.CHROMIUM_BIN ?? 'chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--window-size=1000,700',
    `--user-data-dir=${profile}/chrome`,
    '--no-proxy-server',
    url,
  ],
  { stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let socket, launchError;
browser.on('error', (err) => (launchError = err));
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (launchError) throw launchError;
    if (await fn()) return;
    await pause(50);
  }
  throw new Error('Readiness timeout');
}
try {
  await until(() => existsSync(join(profile, 'chrome/DevToolsActivePort')));
  const port = readFileSync(
    join(profile, 'chrome/DevToolsActivePort'),
    'utf8',
  ).split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(
    tabs.find((t) => t.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((yes, no) => {
    socket.onopen = yes;
    socket.onerror = no;
  });
  let seq = 0;
  const pending = new Map(),
    errors = [];
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        m.params.exceptionDetails.exception?.description ??
          m.params.exceptionDetails.text,
      );
    if (m.id) {
      const cb = pending.get(m.id);
      pending.delete(m.id);
      m.error ? cb.reject(new Error(m.error.message)) : cb.resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await until(() =>
    evaluate(
      `location.href===${JSON.stringify(url)} && document.readyState==='complete'`,
    ),
  );

  await evaluate(`window.__phase='content';window.__stored={};window.__tab={id:7,windowId:1,title:'Bridge test',url:location.href};window.__closed=false;
    window.chrome={storage:{local:{get:async()=>window.__stored,set:async v=>Object.assign(window.__stored,v)}},runtime:{onMessage:{addListener(fn){window[window.__phase==='content'?'__contentListener':'__backgroundListener']=fn;}},sendMessage(message){return new Promise(resolve=>window.__backgroundListener(message,{tab:window.__tab},resolve));}},scripting:{executeScript:async()=>{}},tabs:{query:async()=>[window.__tab],sendMessage:async(id,msg)=>{if(id!==7)throw new Error('Wrong tab');return new Promise(resolve=>window.__contentListener(msg,{},resolve));},captureVisibleTab:async()=>window.__capture,remove:async id=>{if(id!==7)throw new Error('Wrong tab');window.__closed=true;}}};
    window.popup=message=>new Promise(resolve=>window.__backgroundListener(message,{},resolve));`);
  await evaluate(
    readFileSync(join(root, 'extension/chrome/content.js'), 'utf8'),
  );
  await evaluate("window.__phase='background'");
  await evaluate(
    readFileSync(join(root, 'extension/chrome/background.js'), 'utf8'),
  );
  assert.equal(
    (
      await evaluate(
        `popup({action:'save',pairing:${JSON.stringify(bridge.pairing)}})`,
      )
    ).ok,
    true,
  );
  assert.equal((await evaluate("popup({action:'pick'})")).ok, true);
  await evaluate(
    "document.getElementById('pick').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))",
  );
  await until(() => bridge.state.browser?.selected === true);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await evaluate(
    `window.__capture=${JSON.stringify('data:image/png;base64,' + shot.data)}`,
  );
  const extracting = bridge.browserAction('pluck', 1);
  assert.equal((await extracting).ok, true);
  await until(() =>
    evaluate(
      "getComputedStyle(document.getElementById('pick')).visibility==='hidden'",
    ),
  );
  assert.equal(cutouts.length, 1);
  assert.equal(cutouts[0].owner, 1);
  assert(cutouts[0].image.startsWith('data:image/png;base64,'));
  assert.equal(cutouts[0].width, 180);
  assert.equal(cutouts[0].height, 80);
  assert.equal((await bridge.browserAction('restorepage', 1)).ok, true);
  assert.equal(
    await evaluate(
      "getComputedStyle(document.getElementById('pick')).visibility",
    ),
    'visible',
  );
  await evaluate("popup({action:'pick'})");
  await evaluate(
    "document.getElementById('pick').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))",
  );
  await until(() => bridge.state.browser?.selected === true);
  const again = bridge.browserAction('pluck', 0);
  assert.equal((await again).ok, true);
  await until(() =>
    evaluate(
      "getComputedStyle(document.getElementById('pick')).visibility==='hidden'",
    ),
  );
  await evaluate("popup({action:'disconnect'})");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.getElementById('pick')).visibility",
    ),
    'visible',
  );
  await evaluate("popup({action:'connect'})");
  await pause(1100);
  assert.equal((await bridge.browserAction('closetab', 0)).ok, true);
  assert.equal(await evaluate('window.__closed'), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS Chrome code with simulated extension APIs: pairing, real DOM picking, screenshot cropping, extraction, restore, disconnect restore, and selected-tab close routing',
  );
} finally {
  socket?.close();
  browser.kill();
  await new Promise((done) =>
    browser.exitCode !== null ? done() : browser.once('close', done),
  );
  await bridge.stop();
  rmSync(profile, { recursive: true, force: true });
}
