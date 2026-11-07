import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { LocalStore, type Work, type Mutation } from './lib/storage.js';
import { PushController } from './lib/push.js';
import type { BusinessPayload, Inspection } from './lib/contract.js';
import { ConflictPanel } from './conflict.js';
import './style.css';
const store = new LocalStore();
const push = new PushController(store);
const empty: BusinessPayload = { title: '', status: 'open', notes: '' };
function App() {
  const [rows,setRows] = useState<Work[]>([]);
  const [confirmed,setConfirmed] = useState<Inspection[]>([]);
  const [history,setHistory] = useState<Mutation[]>([]);
  const [id,setId] = useState<string>(() => crypto.randomUUID());
  const [version,setVersion] = useState(0);
  const [form,setForm] = useState(empty);
  const [phase,setPhase] = useState('draft');
  const [dirty,setDirty] = useState(true);
  const [busy,setBusy] = useState(false);
  const [sending,setSending] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [metadata,setMetadata] = useState('');
  async function refresh() { setRows(await store.work.toArray());setConfirmed(await store.cleanRecords.toArray());setHistory(await store.mutations.toArray()); }
  useEffect(() => { void store.initialize().then(refresh).catch(e => setError(String(e))); },[]);
  function select(w: Work) {
    setId(w.id);setVersion(w.version);setForm(w.payload);setPhase(w.phase);setDirty(false);setError('');
    setMessage(w.phase === 'queued' ? 'Queued on this device' : w.phase === 'terminal_conflict' ? 'Conflict — local proposal preserved' : 'Saved locally');setMetadata('');
    if (w.activeMutationId) void store.mutations.get(w.activeMutationId).then(m => setMetadata(JSON.stringify(m,null,2))).catch(e => setError(String(e)));
  }
  async function act(queue: boolean) {
    setBusy(true);setError('');setMessage('');
    try {
      if (queue) { await store.freeze(id,version); const w=await store.work.get(id); if(w)select(w); }
      else { const w=await store.saveDraft(id,form,version);select(w); }
      await refresh();
    } catch(e) { setError(`Storage error — action not saved: ${e instanceof Error ? e.message : String(e)}. Keep these values and retry.`); }
    finally {setBusy(false);}
  }
  async function send(reconcile=false) {
    setBusy(true);setSending(true);setError('');setMessage('Sending pending operations…');
    try {
      const summary=await (reconcile?push.synchronize():push.sendPending());await refresh();
      const work=await store.work.get(id);
      if(!work && summary.acknowledged>0)setPhase('acknowledged');
      else if(work)setPhase(work.phase);
      setMessage(`Server acknowledged: ${summary.acknowledged}; conflicts: ${summary.conflicts}; outcome unknown: ${summary.unknown}; blocked: ${summary.blocked}; deferred: ${summary.deferred}. ${summary.snapshotApplied?'Snapshot applied as of completed pull; pending drafts/conflicts may remain.':'Push only; no snapshot reconciliation performed.'}`);
    } catch(e) {setError(`Foreground operation failed: ${String(e)}. Preserve work and retry the original IDs.`);await refresh().catch(()=>undefined);}
    finally {setBusy(false);setSending(false);}
  }
  async function review() {setBusy(true);try{const result=await push.reviewLatest();await refresh();if(!result.snapshotApplied)throw Error('Another foreground operation was active; review again');}catch(e){setError(String(e));throw e;}finally{setBusy(false);}}
  const current=rows.find(w=>w.id===id);
  const selected=history.find(m=>m.mutationId===(current?.phase==='draft'?(current.resolutionOf??current.activeMutationId):current?.activeMutationId));
  const locked=phase!=='draft';
  return <main><header><h1>SyncProof</h1><p>Field inspections · Phase 5 manual decisions</p></header>
    <aside><strong>Local drafts with manual push.</strong> Queueing alone has no server acceptance. Send pending requires the local backend; server acknowledgment is not global synchronization.
      <p>Use one tab per browser profile. The app shell must be reachable after restart.</p></aside>
    <p aria-live="polite">Pending on this device: {history.filter(m=>m.phase==='queued'||m.phase==='outcome_unknown').length}</p>
    <button disabled={busy} onClick={()=>void send(true)}>Reconcile now</button>
    <button disabled={busy} onClick={()=>void send()}>Send pending / Retry</button>
    <button disabled={busy} onClick={()=>{setId(crypto.randomUUID());setVersion(0);setForm({...empty});setPhase('draft');setDirty(true);setMessage('');setError('');setMetadata('');}}>New inspection</button>
    <div className="layout"><section aria-label="Local inspections"><h2>On this device</h2>{rows.length===0&&<p>No local inspections yet.</p>}
      <ul>{rows.map(w=><li key={w.id}><button disabled={busy} onClick={()=>select(w)}>{w.payload.title} — {w.phase==='queued'?'Queued on this device':w.phase==='terminal_conflict'?'Conflict — local proposal preserved':'Local draft'}</button></li>)}</ul>
      {confirmed.filter(c=>!rows.some(w=>w.id===c.id)).map(c=><p key={c.id}><button disabled={busy||c.deleted} onClick={()=>{setId(c.id);setVersion(0);setForm({title:c.title,status:c.status,notes:c.notes});setPhase('draft');setDirty(false);setMessage(`Last server-acknowledged revision ${c.revision}; may be historical. Edit and save to create a new independent operation.`);setError('');setMetadata('');}}>{c.title} — Server acknowledged</button></p>)}
      </section>
    <section><h2>{locked?'Frozen local inspection':'Editable local draft'}</h2>
      <form onSubmit={e=>{e.preventDefault();void act(false);}}>
      <fieldset disabled={busy||locked||current?.intent==='delete'}>
      <label>Title<input value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setDirty(true);setMessage('');}} required /></label>
      <label>Status<select value={form.status} onChange={e=>{setForm({...form,status:e.target.value as BusinessPayload['status']});setDirty(true);setMessage('');}}><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select></label>
      <label>Notes<textarea value={form.notes} onChange={e=>{setForm({...form,notes:e.target.value});setDirty(true);setMessage('');}} rows={6}/></label>
      <button type="submit">Save draft</button></fieldset></form>
      <button disabled={busy||locked||dirty||version===0} onClick={()=>void act(true)}>Queue for future sync</button>
      {!locked&&version>0&&!current?.resolutionOf&&<button disabled={busy} onClick={()=>{if(confirm('Discard this saved local draft?')){setBusy(true);void store.discardDraft(id).then(()=>{setVersion(0);setDirty(true);setMessage('Draft discarded');return refresh();}).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}}>Discard draft</button>}
      <p role="status">{busy?(sending?'Sending pending operations…':'Saving locally…'):message||(!locked&&dirty?'Unsaved changes':'')}</p>
      {error&&<p role="alert">{error}</p>}
      {locked&&<p>This record is locked until its outcome is durably acknowledged. Conflicts require an explicit decision below; retries keep the same ID.</p>}
      {rows.find(w=>w.id===id&&w.phase==='draft')&&confirmed.some(c=>c.id===id)&&confirmed.find(c=>c.id===id)?.revision!==rows.find(w=>w.id===id)?.baseRevision&&<p>Remote revision changed; original saved draft and base are preserved. Submission may conflict.</p>}
      {selected?.phase==='terminal_conflict'&&current&&<ConflictPanel key={selected.mutationId} store={store} work={current} mutation={selected} remote={confirmed.find(c=>c.id===id)} disabled={busy} review={review} onDraft={w=>{select(w);void refresh();}} changed={async()=>{await refresh();setPhase('acknowledged');setMessage('Local proposal deliberately discarded; historical receipt retained.');}} fail={e=>setError(String(e))}/>}
      {current?.resolutionOf&&current.phase==='draft'&&<button disabled={busy} onClick={()=>{void store.cancelResolution(id).then(async()=>{const w=await store.work.get(id);if(w)select(w);await refresh();}).catch(e=>setError(String(e)));}}>Cancel resolution draft</button>}
      {confirmed.find(c=>c.id===id&&!c.deleted)&&!current&&<button disabled={busy} onClick={()=>{if(confirm('Delete this inspection using its displayed revision? This creates a retained tombstone.')){setBusy(true);const remote=confirmed.find(c=>c.id===id)!;void store.queueDelete(id,remote.revision,true).then(async()=>{const w=await store.work.get(id);if(w)select(w);await refresh();}).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}}>Delete inspection</button>}
      {current?.resolutionOf&&<p>Resolution intent: {current.intent}; reviewed base revision: {current.baseRevision}. A new immutable ID is issued only when queued.</p>}
      {metadata&&<details open><summary>Immutable queued operation</summary><pre data-testid="metadata">{metadata}</pre></details>}
    </section></div>
    <section aria-label="Operation history"><h2>Operation history</h2><ul>{history.map(m=><li key={m.mutationId} data-testid="history-entry"><strong>{m.phase==='acknowledged'?'Server acknowledged':m.phase==='outcome_unknown'?'Outcome unknown':m.phase==='terminal_conflict'?(m.decision?'Historical conflict — kept server':history.some(child=>child.resolves===m.mutationId)?'Historical conflict — resolution attempted':'Conflict — proposal preserved'):'Queued on this device'}</strong> · {m.mutationId}
      {m.blocked&&<p role="alert">Blocked: {m.blocked.code}. {m.blocked.message}</p>}{m.lastError&&<p>{m.lastError}</p>}
      <details><summary>Original operation and receipt</summary><pre>{JSON.stringify(m,null,2)}</pre></details>
    </li>)}</ul></section></main>;
}
createRoot(document.getElementById('root')!).render(React.createElement(App));
