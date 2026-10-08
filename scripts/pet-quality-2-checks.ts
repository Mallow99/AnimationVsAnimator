import assert from 'node:assert/strict';
import { PixelLayer, DEFAULT_LOOK } from '../src/core/render';
let passed=0;
function test(name:string,run:()=>void){run();passed++;console.log('PASS',name);}
test('pixel workspaces clip huge throws to the Retina viewport and reuse/shrink their backing store',()=>{
 let created=0;
 const original=globalThis.OffscreenCanvas;
 class Canvas {
  constructor(public width:number,public height:number){created++;}
  getContext(){return {setTransform(){},clearRect(){},getImageData(_x:number,_y:number,w:number,h:number){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};}
 }
 (globalThis as any).OffscreenCanvas=Canvas;
 try {
  const ctx={canvas:{width:800,height:600},getTransform:()=>({a:2,d:2,b:0,c:0,e:0,f:0}),save(){},restore(){},drawImage(){}} as any;
  const layer=new PixelLayer();layer.paint(ctx,[{x:-10000,y:-10000},{x:10000,y:10000}],8,DEFAULT_LOOK,()=>{});
  const cv=(layer as any).cv;assert(cv.width<=256&&cv.height<=192);
  for(let i=0;i<130;i++)layer.paint(ctx,[{x:20,y:20},{x:40,y:50}],4,DEFAULT_LOOK,()=>{});
  assert.equal((layer as any).cv,cv);assert.equal(created,1);assert.equal(cv.width,64);assert.equal(cv.height,64);
  layer.paint(ctx,[{x:10000,y:10000},{x:10001,y:10001}],4,DEFAULT_LOOK,()=>{});assert.equal(created,1);
 } finally {(globalThis as any).OffscreenCanvas=original;}
});
console.log(`${passed} Pet Quality 2 checks passed`);
