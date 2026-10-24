// Preserve validated CI downloads in a draft release. Never publish or replace a public release.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const product=JSON.parse(readFileSync('product.json','utf8'));
const tag='v'+product.version,folder=resolve('out/validated');
const files=readdirSync(folder).filter(f=>f.endsWith('.zip')||f.endsWith('.sha256')).map(f=>join(folder,f));
if(files.length!==4)throw Error('Expected two validated archives and two checksums.');
const existing=spawnSync('gh',['release','view',tag,'--json','isDraft'],{encoding:'utf8'});
const notes=resolve('docs/release/CANDIDATE.md');
if(existing.status===0){
 if(!JSON.parse(existing.stdout).isDraft)throw Error('Refusing to replace a public release.');
 execFileSync('gh',['release','edit',tag,'--draft','--prerelease','--target',process.env.GITHUB_SHA,'--notes-file',notes],{stdio:'inherit'});
}else{
 execFileSync('gh',['release','create',tag,'--draft','--prerelease','--target',process.env.GITHUB_SHA,'--title',product.name+' '+product.version+' — test candidate','--notes-file',notes],{stdio:'inherit'});
}
execFileSync('gh',['release','upload',tag,...files,'--clobber'],{stdio:'inherit'});
console.log('Preserved both exact validated archives in draft. No public release or store publication.');
