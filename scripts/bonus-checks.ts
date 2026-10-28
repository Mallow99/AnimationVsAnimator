import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, mergeConfig, companionConfig, activeFigureIds } from '../src/core/config';
import { BASE_PROFILE_IDS, ALL_PROFILE_IDS, availableProfileIds, knownUnlocks, isArnoldCode } from '../src/core/profiles';
import { drawJTTattoo, DEFAULT_LOOK, type Ctx2D } from '../src/core/render';

assert.deepEqual(availableProfileIds(),[0,1,2,3,4]);
assert.deepEqual(availableProfileIds(['arnold']),[0,1,2,3,4,5]);
assert.deepEqual(knownUnlocks(['arnold','bad','arnold']),['arnold']);
for(const v of [null,{},['bad'],true])assert.deepEqual(knownUnlocks(v),[]);
for(const v of ['ARNOLD','arnold','  ArNoLd  '])assert(isArnoldCode(v));
for(const v of ['',null,{},'ARNOLD123','A'.repeat(100)])assert(!isArnoldCode(v));
console.log('PASS bonus: code normalisation and known unlock allowlist');
const original=structuredClone(DEFAULT_CONFIG),arnold=companionConfig(original,5);
assert.equal(arnold.name,'Arnold');assert.equal(arnold.look.tattoo,'jt');
assert.equal(arnold.personality,'competitive');assert.deepEqual(original,DEFAULT_CONFIG);
for(const id of BASE_PROFILE_IDS)assert.notEqual(companionConfig(arnold,id===0?1:id).look.tattoo,'jt');
assert.equal(mergeConfig(original,{look:{tattoo:'invalid'}}).look.tattoo,'none');
const six=mergeConfig(original,{figureCount:6,spawnOrder:[5,0,1,2,3,4]});
assert.equal(six.figureCount,5);
assert.deepEqual(activeFigureIds(six),[0,1,2,3,4]);
assert.deepEqual(activeFigureIds(six,ALL_PROFILE_IDS),[5,0,1,2,3]);
assert.deepEqual(activeFigureIds(mergeConfig(six,{figureCount:1}),ALL_PROFILE_IDS),[5]);
console.log('PASS bonus: sixth stable identity, unchanged originals, unlock gating and five-active limit');
let rectangles=0,saves=0,restores=0;
const g=new Proxy({},{get:(_,key)=>key==='fillRect'?()=>rectangles++:key==='save'?()=>saves++:key==='restore'?()=>restores++:()=>{}}) as Ctx2D;
const random=Math.random;try{Math.random=()=>{throw Error('Tattoo consumed randomness');};drawJTTattoo(g,{x:10,y:10},{x:10,y:30},DEFAULT_LOOK,1);}finally{Math.random=random;}
assert(rectangles>0);assert.equal(saves,restores);
console.log('PASS bonus: JT glyph draws without fonts/randomness and restores canvas state');
