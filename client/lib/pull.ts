import { parseMutation, type Inspection } from './contract.js';
export interface Snapshot { protocolVersion:1; complete:true; recordCount:number; records:Inspection[] }
export function validateSnapshot(input:unknown):Snapshot {
  if(!input||typeof input!=='object')throw Error('Invalid snapshot');
  const s=input as Snapshot;
  if(s.protocolVersion!==1||s.complete!==true||!Array.isArray(s.records)||!Number.isSafeInteger(s.recordCount)||s.recordCount!==s.records.length)throw Error('Incomplete snapshot');
  const seen=new Set<string>();const records:Inspection[]=[];
  for(const r of s.records){
    if(!r||typeof r.deleted!=='boolean'||seen.has(r.id)||Object.keys(r).sort().join(',')!=='deleted,id,notes,revision,status,title')throw Error('Invalid or duplicate snapshot record');
    parseMutation(JSON.stringify({protocolVersion:1,mutationId:r.id,clientId:r.id,recordId:r.id,operation:'update',baseRevision:r.revision,payload:{title:r.title,status:r.status,notes:r.notes}}));
    seen.add(r.id);records.push({id:r.id,title:r.title,status:r.status,notes:r.notes,revision:r.revision,deleted:r.deleted});
  }
  return {protocolVersion:1,complete:true,recordCount:records.length,records};
}
export async function pullSnapshot(fetcher:typeof fetch=fetch):Promise<Snapshot>{
  const response=await fetcher('/api/inspections',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status!==200)throw Error(`Snapshot HTTP ${response.status}; previous state retained`);
  return validateSnapshot(await response.json());
}
