import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAtomic, readStoredJson } from '../src/electron/storage';
import { readLocalSave, writeLocalSave } from '../src/app/local-storage';
import { DEFAULT_CONFIG, mergeConfig } from '../src/core/config';
import { offlineEdition, productDefaults } from '../src/shared/product';
import { overlaps, placeSpeech } from '../src/core/speech-layout';

import { BUILTIN_PROPS, parsePropDef, propMaterials } from '../src/core/props';
import { parseMaterial } from '../src/core/materials';
import { hexToHsl, hslToHex } from '../src/settings/color';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mallow-storage-'));
class BrowserStorage implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { if (this.fail) throw new Error('QuotaExceededError'); this.data.set(key, value); }
}
try {
  const file = path.join(dir, 'state.json');
  assert.equal(readStoredJson(file).text, null);
  writeAtomic(file, '{"value":1}'); writeAtomic(file, '{"value":2}');
  fs.writeFileSync(file, '{broken');
  assert.deepEqual(readStoredJson(file), { text: '{"value":1}', recovered: true });
  assert.equal(fs.readFileSync(file + '.corrupt', 'utf8'), '{broken');
  console.log('PASS disk recovery restores the last-good backup and retains the damaged original');

  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw Object.assign(new Error('disk failure'), { code: 'ENOSPC' }); };
    assert.throws(() => writeAtomic(file, '{"value":3}'));
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(file, 'utf8'), '{"value":1}'); assert(!fs.existsSync(file + '.tmp'));
  fs.writeFileSync(file, 'damaged'); fs.writeFileSync(file + '.bak', 'also damaged');
  assert.throws(() => readStoredJson(file)); assert.equal(fs.readFileSync(file, 'utf8'), 'damaged');
  console.log('PASS failed atomic replacement keeps the original, cleans temporary files, and refuses unrecoverable saves');

  const storage = new BrowserStorage();
  assert(writeLocalSave(storage, 'pet', '{"v":1,"items":[1]}').ok);
  assert(writeLocalSave(storage, 'pet', '{"v":1,"items":[2]}').ok);
  storage.setItem('pet', 'bad');
  assert.equal(readLocalSave(storage, 'pet').text, '{"v":1,"items":[1]}');
  assert.equal(storage.getItem('pet.corrupt'), 'bad');
  storage.fail = true;
  assert(!writeLocalSave(storage, 'pet', '{"v":1,"items":[3]}').ok);
  assert.equal(storage.getItem('pet'), '{"v":1,"items":[1]}');
  assert(!writeLocalSave(storage, 'pet', '[]').ok);
  console.log('PASS browser save recovery and quota failures preserve the previous world and original item data');

  const original = structuredClone(DEFAULT_CONFIG), quiet = productDefaults(original);
  for (const key of ['windows', 'sound', 'sfx', 'knockCursor', 'moveWindows', 'screenAware', 'mischief'] as const) assert.equal(quiet[key], false);
  assert.deepEqual(original, DEFAULT_CONFIG);
  const custom = mergeConfig(original, { name: 'My friend', mind: 'full', fileHomes: true, browserPlay: true, closeWindows: true, look: { color: '#aa7733' } });
  const offline = offlineEdition(custom);
  assert.equal(offline.name, 'My friend'); assert.equal(offline.look.color, '#aa7733');
  assert.equal(offline.mind, 'offline'); assert.equal(offline.fileHomes, false); assert.equal(offline.browserPlay, false); assert.equal(offline.closeWindows, false);
  assert.equal(custom.mind, 'full');
  console.log('PASS commercial defaults are quiet; imported and patched configs stay offline without changing identity or appearance');

  for (let r=0;r<=255;r+=17) for (let g=0;g<=255;g+=17) for (let b=0;b<=255;b+=17) {
    const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    assert.equal(hslToHex(hexToHsl(hex)),hex);
  }
  assert.equal(hslToHex({h:360,s:100,l:50}),'#ff0000');
  assert.equal(hslToHex({h:-120,s:100,l:50}),'#0000ff');
  assert.equal(hslToHex({h:NaN,s:Infinity,l:-1}),'#000000');
  assert.equal(hslToHex({h:120,s:200,l:100}),'#ffffff');
  console.log('PASS 4,096 RGB colours round-trip exactly; HSL boundaries, wrapping and nonfinite inputs stay safe');

  for(const stock of BUILTIN_PROPS){
    const legacy=structuredClone(stock);for(const shape of legacy.shape)delete shape.material;
    assert.deepEqual(propMaterials(legacy),propMaterials(stock));
    const custom=structuredClone(legacy);custom.shape[0].color='#ab1234';
    assert(propMaterials(custom).every(value=>value===undefined),'custom artwork was retextured');
    const optOut=structuredClone(legacy);optOut.shape[0].material='none';
    assert.equal(propMaterials(optOut)[0],'none');
    const parsed=parsePropDef({...stock,type:'prop',shape:stock.shape.map(shape=>({...shape,material:'invalid'}))})!;
    assert(parsed.shape.every(shape=>shape.material===undefined));
    assert.deepEqual(legacy.shape.map(({material,...shape})=>shape),stock.shape.map(({material,...shape})=>shape));
  }
  assert.equal(parseMaterial('wood'),'wood');assert.equal(parseMaterial({} ),undefined);
  console.log('PASS all ten stock props retain geometry, upgrade legacy materials, preserve custom art and honor explicit texture opt-out');

  for (const [width, height] of [[1280, 800], [380, 600]]) {
    const input = Array.from({ length: 5 }, (_, i) => ({ x: width / 2 - 100 + i * 8, y: height - 180, w: 200, h: 70 }));
    const placed = placeSpeech(input, width, height);
    for (const [i, box] of placed.entries()) {
      assert(box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height);
      assert(placed.slice(0, i).every(other => !overlaps(box, other)));
    }
    assert.deepEqual(placeSpeech(input, width, height), placed);
  }
  console.log('PASS five simultaneous speech bubbles remain distinct, deterministic and on-screen on desktop and small viewports');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
