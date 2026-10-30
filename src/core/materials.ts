import type { Ctx2D } from './render';

export const MATERIALS = ['none','wood','fabric','paper','metal','leather','rubber','ceramic'] as const;
export type Material = typeof MATERIALS[number];
export function parseMaterial(value: unknown): Material | undefined {
  return typeof value === 'string' && MATERIALS.includes(value as Material) ? value as Material : undefined;
}
// Small immutable local-space tiles. Weak context caches release their patterns with their canvas.
const tiles = new Map<Material, OffscreenCanvas | HTMLCanvasElement>();
const patterns = new WeakMap<Ctx2D, Map<Material, CanvasPattern>>();
function pattern(ctx: Ctx2D, kind: Material): CanvasPattern | null {
  if (typeof ctx.createPattern !== 'function') return null;
  let cached = patterns.get(ctx); if (!cached) { cached = new Map(); patterns.set(ctx,cached); }
  if (cached.has(kind)) return cached.get(kind)!;
  let tile = tiles.get(kind);
  if (!tile) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(32,32) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'),{width:32,height:32}) : null;
    if (!canvas) return null;
    const g = canvas.getContext('2d') as Ctx2D | null; if (!g) return null;
    const mark = (color:string,x:number,y:number,w:number,h:number) => {g.fillStyle=color;g.fillRect(x,y,w,h);};
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const n=(Math.imul(x+11,193)^Math.imul(y+7,389))>>>0;
      if(kind==='fabric' && x%4===0 && y%4<2)mark('#ffffff24',x,y,1,1);
      if(kind==='fabric' && y%4===2 && x%4<2)mark('#3c332421',x,y,1,1);
      if(kind==='wood' && y%6===Math.round(Math.sin(x*Math.PI/16)*1.1+1))mark('#38251925',x,y,1,.7);
      if(kind==='wood' && y%8===5)mark('#fff4d313',x,y,1,.5);
      if(kind==='metal' && y%3===0)mark('#ffffff15',x,y,1,.45);
      if(kind==='leather' && n%19===0)mark('#17232d22',x,y,1,.7);
      if(kind==='leather' && n%37===0)mark('#ffffff21',x,y,1,.5);
      if(kind==='paper' && n%13===0)mark('#977f5419',x,y,1,.4);
      if(kind==='paper' && n%23===0)mark('#ffffff28',x,y,1,.5);
      if(kind==='rubber' && n%9===0)mark('#ffffff14',x,y,1,.7);
      if(kind==='ceramic' && n%41===0)mark('#ffffff24',x,y,1,.5);
    }
    tiles.set(kind,canvas); tile=canvas;
  }
  const result=ctx.createPattern(tile,'repeat'); if(result)cached.set(kind,result);return result;
}
/** Call inside the filled shape's clip, in the object's local frame. Never changes the current path. */
export function paintMaterial(ctx: Ctx2D, kind: Material | undefined, x:number,y:number,w:number,h:number) {
  if (!kind || kind==='none' || w<3 || h<3) return;
  const tile=pattern(ctx,kind);if(tile){ctx.fillStyle=tile;ctx.fillRect(x,y,w,h);}
  if(typeof ctx.createLinearGradient==='function'){
    const light=ctx.createLinearGradient(x,y,x,y+h);
    light.addColorStop(0,'#ffffff24');light.addColorStop(.4,'#ffffff00');light.addColorStop(1,'#17231f14');
    ctx.fillStyle=light;ctx.fillRect(x,y,w,h);
  }
}
/** Restrained ink on a real page plane; geometry, grips and picking stay unchanged. */
export function paintPageText(ctx: Ctx2D,w:number,h:number){
  if(w<5||h<8)return;
  ctx.fillStyle='#74664755';
  for(let i=0;i<5;i++)ctx.fillRect(1.4,3+i*2.25,Math.max(1,(w-2.8)*(i===4?.58:i===1?.82:1)),.25);
}
