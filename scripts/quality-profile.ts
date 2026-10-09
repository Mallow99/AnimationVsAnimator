// Reproducible core workload; this measures Linux CPU time, not native desktop/rendering performance.
import { performance } from 'node:perf_hooks';
import { Pet, DEFAULT_CONFIG } from '../src/core/pet';
import { companionConfig } from '../src/core/config';
let seed=17;
Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const bounds={left:0,right:1400,top:0,floor:800},dt=1/120;
for(const count of [2,5]) {
  const cfg={...structuredClone(DEFAULT_CONFIG),windows:false,dailyRhythm:false};
  const first=new Pet(bounds,cfg,{identity:'profile-0'}),pets=[first];
  for(let i=1;i<count;i++)pets.push(new Pet(bounds,companionConfig(cfg,i),{props:first.props,identity:`profile-${i}`}));
  for(const [i,p] of pets.entries()){
    p.others=pets.filter(q=>p!==q);p.paused=true;p.mind.holdUntil=Infinity;
    p.items.give(['book','cup','dumbbell','yo-yo','handheld'][i],p.char);
    // Two loose items per owner exercise artwork contacts and cross-owner snapshots.
    p.items.spawn('book',{x:900+i*45,y:730},1);p.items.spawn('cup',{x:920+i*45,y:710},1);
  }
  first.props.spawn('couch',100,730,1);first.props.spawn('bookshelf',700,730,1);
  for(let i=0;i<1200;i++)for(const p of pets)p.update(dt);
  for(const [i,p] of pets.entries()){p.paused=false;p.command('do:'+['read','sip','exercise','yoyo','handheld'][i]);}
  const samples:number[]=[],begin=performance.now();
  for(let frame=0;frame<7200;frame++){
    const at=performance.now();for(const p of pets)p.update(dt);samples.push(performance.now()-at);
  }
  const elapsed=performance.now()-begin;samples.sort((a,b)=>a-b);
  console.log(`${count} figures + ${count*2} loose items + couch/bookshelf: 60 simulated seconds in ${(elapsed/1000).toFixed(2)}s; mean ${(elapsed/7200).toFixed(3)}ms, p95 ${samples[Math.floor(samples.length*0.95)].toFixed(3)}ms per combined 120Hz update (8.33ms budget)`);
}
