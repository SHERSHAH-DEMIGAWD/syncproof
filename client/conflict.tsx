import * as React from 'react';
import { useState } from 'react';
import type { LocalStore, Work, Mutation } from './lib/storage.js';
import type { Inspection } from './lib/contract.js';
export function ConflictPanel({store,work,mutation,remote,disabled,review,onDraft,changed,fail}:{store:LocalStore;work:Work;mutation:Mutation;remote:Inspection|undefined;disabled:boolean;review:()=>Promise<void>;onDraft:(w:Work)=>void;changed:()=>Promise<void>;fail:(e:unknown)=>void}) {
  const [reviewed,setReviewed]=useState<string|null>(null);
  const actionable=work.phase==='terminal_conflict'&&work.activeMutationId===mutation.mutationId;
  const permitted=actionable&&!disabled&&remote&&reviewed===remote.revision;
  async function prepare(manual:boolean){
    if(!remote)return;
    if(mutation.envelope.operation==='delete'&&!confirm('Prepare a new deletion against the reviewed live revision?'))return;
    try{onDraft(await store.beginResolution(mutation.mutationId,remote.revision,manual?{title:remote.title,status:remote.status,notes:remote.notes}:undefined,mutation.envelope.operation==='delete'));}catch(e){fail(e);}
  }
  return React.createElement('section',{'aria-label':'Conflict inspector'},
    <><h2>Unresolved conflict</h2><p>Original decision is historical. Latest known server state can change again.</p>
    <div className="layout"><div><h3>Original common base</h3><pre>{JSON.stringify(mutation.commonBase??'No historical base available',null,2)}</pre></div>
    <div><h3>My rejected edit</h3><pre>{JSON.stringify({operation:mutation.envelope.operation,payload:mutation.envelope.payload},null,2)}</pre></div>
    <div><h3>Latest known server</h3><pre>{JSON.stringify(remote??'No authoritative record observed',null,2)}</pre></div></div>
    <details open><summary>Historical conflict receipt</summary><pre>{JSON.stringify(mutation.receipt,null,2)}</pre><p>Original mutation: {mutation.mutationId}; fingerprint: {mutation.fingerprint}; previous conflict: {mutation.resolves??'none'}</p></details>
    <button disabled={disabled||!actionable} onClick={()=>{void review().then(async()=>{const latest=await store.cleanRecords.get(work.id);if(latest)setReviewed(latest.revision);}).catch(fail);}}>Review latest server</button>
    <button disabled={!permitted} onClick={()=>{if(remote&&confirm('Permanently abandon this local proposal? Its historical receipt remains, but this editable proposal will be cleared.'))void store.keepServer(mutation.mutationId,true,remote.revision).then(changed).catch(fail);}}>Keep server</button>
    <button disabled={!permitted||remote?.deleted||mutation.envelope.operation==='create'} onClick={()=>void prepare(false)}>{mutation.envelope.operation==='delete'?'Prepare new delete':'Reapply local values'}</button>
    <button disabled={!permitted||remote?.deleted||mutation.envelope.operation!=='update'} onClick={()=>void prepare(true)}>Manually combine values</button>
    {remote?.deleted&&<p>Server deletion is retained. Restore/undelete is outside this MVP. To preserve text, copy it manually outside this record.</p>}
    {mutation.envelope.operation==='create'&&<p>Existing identity cannot be implicitly overwritten. Keep server or manually copy information to a separate new inspection.</p>}
    {work.resolutionOf&&<p>Resolution draft: review the form, save it, then explicitly queue. No automatic submission occurs.</p>}
    </>);
}
