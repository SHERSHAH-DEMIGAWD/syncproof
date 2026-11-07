import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export function artifactPath(phase:string,name:string){
  if(!/^phase-[235]$/.test(phase)||!/^[a-z0-9-]+\.json$/.test(name))throw Error('Invalid historical artifact name');
  return process.env.SYNCPROOF_EVIDENCE_PHASE==='phase-7'?resolve('docs/evidence/phase-7',`legacy-${phase}-${name}`):resolve('docs/evidence',phase,name);
}
export async function evidence(id:string, details:Record<string,unknown>) {
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('Invalid evidence identifier');
  const phase=process.env.SYNCPROOF_EVIDENCE_PHASE??'phase-6';if(!['phase-6','phase-7'].includes(phase))throw Error('Unsupported evidence phase');
  const directory=resolve('docs/evidence',phase);await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,id+'.json'),JSON.stringify({scenario:id,status:'PASS',runId:process.env.SYNCPROOF_AUDIT_RUN_ID??'manual',recordedAt:new Date().toISOString(),...details},null,2)+'\n');
}
