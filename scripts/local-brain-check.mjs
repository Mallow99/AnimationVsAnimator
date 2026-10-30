// Verify the real provider adapter against a fake local HTTP service, with no credentials or model.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['src/electron/llm.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
  name: 'no-electron-or-secrets', setup(build) {
    build.onResolve({filter: /^electron$/}, () => ({path:'electron',namespace:'fake'}));
    build.onLoad({filter:/.*/,namespace:'fake'}, () => ({contents:`export const app={getPath(){throw Error('Local providers must not read credentials')}};export const safeStorage={};`}));
  },
}] });
const service=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const fetchOriginal=globalThis.fetch;
const calls=[];
const req={system:'A local conversation.',messages:[{role:'user',text:'Tell me about your day.'}]};
try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({choices:[{message:{content:'{"say":"A long local answer.","plan":[]}'}}]}));};
  assert.equal((await service.ask('ollama','installed-model',req)).ok,true);
  assert.equal(calls[0].url,'http://127.0.0.1:11434/v1/chat/completions');
  assert(!('Authorization' in calls[0].options.headers));
  assert.deepEqual(JSON.parse(calls[0].options.body).messages,[{role:'system',content:req.system},{role:'user',content:req.messages[0].text}]);
  globalThis.fetch=async(url,options)=>{assert(!('Authorization' in options.headers));return new Response(JSON.stringify({data:[{id:'second'},{id:'first'}]}));};
  assert.deepEqual(await service.listModels('ollama'),{ok:true,models:['first','second']});
  assert.equal(service.keyStatus('ollama').saved,false); service.setKey('ollama','must not be saved');
  let attempt=0;
  globalThis.fetch=async()=>++attempt===1?new Response('{}',{status:400}):new Response(JSON.stringify({choices:[{message:{content:'plain answer'}}]}));
  assert.equal((await service.ask('ollama','without-json',req)).ok,true);assert.equal(attempt,2);
  globalThis.fetch=async()=>new Response('{}',{status:404});
  assert.match((await service.ask('ollama','missing-model',req)).error,/Find models/);
  globalThis.fetch=async()=>{throw Error('connection refused');};
  assert.match((await service.ask('ollama','installed-model',req)).error,/Start Ollama/);
  assert.match((await service.listModels('ollama')).error,/Start Ollama/);
  console.log('PASS local model adapter: loopback-only service, no keys or credential reads, installed model discovery, JSON fallback, missing model and stopped-server feedback');
} finally {globalThis.fetch=fetchOriginal;}
