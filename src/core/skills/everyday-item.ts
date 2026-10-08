import { Skill, type Ctx } from './context';
import { Tool, FetchItem } from '../skills';
import type { Item, ItemUse } from '../items';
import { smooth, clamp } from '../math';

/** Small reusable activities: deliberate reaches, repetitions, pauses, then storage. */
export class EverydayItem extends Skill {
  private tool: Tool;
  private item: Item | null = null;
  private fetch: FetchItem | null = null;
  private elapsed = 0;
  private stowing = false;
  constructor(private use: 'sip' | 'exercise' | 'play', readonly name: 'sip' | 'exercise' | 'yoyo',private original:Item|null=null,elapsed=0) {
    super(); this.tool = new Tool(use as ItemUse);this.elapsed=elapsed;
  }
  continuation(c:Ctx){const item=this.item,elapsed=this.elapsed;return item&&!this.stowing?()=>c.items.list.includes(item)&&item.where!=='cursor'?new EverydayItem(this.use,this.name,item,elapsed):null:null;}
  start(c: Ctx) {
    this.item = this.original ?? c.items.find(this.use);
    if (!this.item || this.item.where === 'cursor') { c.say(`I need my ${this.use === 'sip' ? 'cup' : this.use === 'exercise' ? 'dumbbell' : 'yo-yo'}.`, 1.5); this.item = null; return; }
    this.tool.item = this.item;
    if (this.item.where === 'world') { this.fetch = new FetchItem(this.item, false); this.fetch.start(c); }
  }
  update(c: Ctx, dt: number) {
    const it = this.item, ch = c.char;
    if (!it || !c.items.list.includes(it) || it.where === 'cursor' || !ch.useHand || this.t > 75) return true;
    if (this.fetch) {
      this.fetch.t += dt;
      if (!this.fetch.update(c, dt)) return false;
      this.fetch.stop(c); this.fetch = null;
      if (it.where === 'world') return true;
    }
    if (this.stowing) return this.tool.stow(c, dt);
    const result = this.tool.fetch(c, dt);
    if (result !== 'ready') return result === 'none';
    if (ch.mode !== 'ground' && ch.mode !== 'sit') return true;
    ch.stop(); this.elapsed += dt;
    const n = ch.body.j.neck, sc = ch.scale, f = ch.facing;
    const cycle = this.use === 'sip' ? 9 : this.use === 'exercise' ? 3.2 : 4;
    const rest = this.use === 'exercise' && this.elapsed % 20 > 12;
    const u = rest ? 0 : (this.elapsed % cycle) / cycle;
    const lift = smooth(clamp(u / 0.25, 0, 1)) * (1-smooth(clamp((u-0.5)/0.25,0,1)));
    const at = {x:n.x+f*(11+5*(1-lift))*sc,y:n.y+(this.use === 'sip' ? 28-30*lift : 32-25*lift)*sc};
    ch.handsAt = {[it.hand]:at};
    it.aim = this.use === 'sip' ? {x:1,y:-0.15*lift,z:0} : {x:1,y:0,z:0};
    if (this.use === 'play') it.yoyoDrop = 30 * Math.sin(u*Math.PI)**2;
    c.look = this.use === 'sip' && u > 0.75 ? 'default' : 'target';
    c.lookTarget = {x:at.x,y:at.y+(it.yoyoDrop||0)*sc};
    c.mood.s.boredom = Math.max(0,c.mood.s.boredom-dt/180);
    if (this.use === 'exercise') c.mood.s.energy = Math.max(0,c.mood.s.energy-dt/1200);
    else c.mood.s.happiness = Math.min(1,c.mood.s.happiness+dt/1200);
    // Complete at a lowered hand/caught toy, not halfway through a repetition.
    if (this.elapsed > (this.use === 'sip' ? 25 : 35) && u > 0.92) {
      it.yoyoDrop = 0; ch.handsAt = null; this.stowing = true;
    }
    return false;
  }
  stop(c: Ctx) {
    this.fetch?.stop(c); c.char.handsAt = null; c.char.handTarget = null;
    if (this.item&&c.items.list.includes(this.item)) { this.item.yoyoDrop = 0; this.item.aim = null; if (this.item.where === 'hand' && !c.items.stow(this.item)) c.items.drop(this.item,0,0); }
  }
}
