import type {Pet} from './pet';
/** Read-only, bounded world audit. It never changes or freezes the simulation. */
export function checkSanity(figures:readonly Pet[],active:readonly Pet[]=figures):string[] {
 const issues:string[]=[],uids=new Map<number,string>(),shelves=new Map<Pet['props'],Set<string>>(),ids=new Set(active.map(p=>p.ctx.who));
 const report=(text:string)=>{if(issues.length<30)issues.push(text);};
 for(const p of figures){
  const name=p.config.name;
  for(const point of p.char.body.points)if(![point.x,point.y,point.z,point.px,point.py].every(Number.isFinite)){report(`${name}: invalid body coordinates`);break;}
  const b=p.ctx.world.bounds,hip=p.char.body.j.hip;
  if(hip.x<b.left-2000||hip.x>b.right+2000||hip.y<b.top-2000||hip.y>b.floor+2000)report(`${name}: outside recoverable desktop bounds`);
  if(Object.values(p.mood.s).some(v=>!Number.isFinite(v)||v<0||v>1))report(`${name}: invalid mood value`);
  for(const i of p.items.list){
   if(uids.has(i.uid))report(`${i.def.name}: duplicate ownership (${uids.get(i.uid)}, ${name})`);else uids.set(i.uid,name);
   if(i.where==='belt' && (i.slot<0||p.items.belt[i.slot]!==i))report(`${name}: ${i.def.name} has a stale bag slot`);
   if(i.where!=='belt' && p.items.belt.includes(i))report(`${name}: ${i.def.name} occupies a bag slot while ${i.where}`);
   if(![i.at.x,i.at.y,i.ammo,i.reloadRemaining,i.bookmark,i.gameBest,i.giftWrap].every(Number.isFinite))report(`${name}: ${i.def.name} has invalid item state`);
   if(i.bookmark<0||i.gameBest<0||i.gameBest>9999||i.giftWrap<0||i.giftWrap>3)report(`${name}: invalid saved item progress`);
   if(i.dock!==null&&(i.where!=='world'||i.def.use!=='connect'))report(`${name}: invalid console attachment`);
   if(i.shelf&&active.includes(p)){
    const key=`${i.shelf.key}:${i.shelf.slot}`,slots=shelves.get(p.props)??new Set<string>();
    if(slots.has(key))report(`${name}: duplicate bookshelf slot`);
    slots.add(key);shelves.set(p.props,slots);
   }
  }
  for(const item of p.items.belt)if(item&&!p.items.list.includes(item))report(`${name}: bag refers to an unowned item`);
  if(p.items.list.filter(i=>i.where==='cursor').length>1)report(`${name}: multiple cursor items`);
  if(p.userWeaponControlled && (!p.items.carried || !p.items.carried.cursorControlled))report(`${name}: stranded cursor weapon controller`);
  const group=p.view().group;if(group&&group.members.some(id=>!ids.has(id)))report(`${name}: group refers to a missing character`);
  if(p.mind.activeSkill?.name==='duel' && p.partnerId && !ids.has(p.partnerId))report(`${name}: missing combat partner`);
 }
 const worlds=new Set(figures.map(p=>p.props));
 for(const props of worlds)for(const t of props.things){
  if(t.points.some(q=>![q.x,q.y,q.px,q.py].every(Number.isFinite)))report(`${t.def?.name??'Prop'}: invalid physics coordinates`);
  for(const id of [...t.sitters.keys(),...t.watchers,...t.players,...t.lightUsers])if(!ids.has(id))report(`${t.def?.name??'Prop'}: stale seat/player claim`);
  if(t.movingBy&&!ids.has(t.movingBy))report(`${t.def?.name??'Prop'}: stale mover claim`);
 }
 return issues;
}
