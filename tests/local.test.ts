import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { LocalStore } from '../client/lib/storage.js';
import { prepareMutation } from '../client/lib/contract.js';
import { parseMutation } from '../src/contracts.js';
import type { MutationResponse, Inspection } from '../client/lib/contract.js';
const payload = {title:'Inspection',status:'open' as const,notes:'Local notes'};
async function fixture(t: TestContext) {
  const db=new LocalStore('test-'+crypto.randomUUID());await db.initialize();t.after(()=>db.delete());return db;
}
test('browser canonical bytes, hash and validation conform to Phase 1 parser',async()=>{
  for(const notes of ['', 'é\n🧪', 'e\u0301','\\"\u0001']){
    const source=JSON.stringify({protocolVersion:1,mutationId:crypto.randomUUID(),clientId:crypto.randomUUID(),recordId:crypto.randomUUID(),operation:'create',baseRevision:null,payload:{...payload,notes}});
    assert.deepEqual(await prepareMutation(source),parseMutation(source));
  }
  const source=JSON.stringify({protocolVersion:1,mutationId:crypto.randomUUID(),clientId:crypto.randomUUID(),recordId:crypto.randomUUID(),operation:'create',baseRevision:null,payload});
  for(const raw of ['{',source.replace('"protocolVersion":1','"protocolVersion":1,"protocolVersion":1'),source.replace('Local notes','\\u0000'),source.replace('"baseRevision":null','"baseRevision":"1"')]){
    assert.throws(()=>parseMutation(raw));await assert.rejects(prepareMutation(raw));
  }
});
test('draft create/edit/read and database version1 reopen preserve identity and values',async t=>{
  const db=await fixture(t);const id=crypto.randomUUID();const client=await db.initialize();await db.saveDraft(id,payload,0);await db.saveDraft(id,{...payload,notes:'Edited'},1);
  db.close();await db.open();assert.equal(db.verno,1);assert.equal(await db.initialize(),client);assert.equal((await db.work.get(id))?.payload.notes,'Edited');
});
test('freeze matches server create with null base and one stable identity',async t=>{
  const db=await fixture(t), id=crypto.randomUUID();await db.saveDraft(id,payload,0);const m=await db.freeze(id,1);
  assert.deepEqual(parseMutation(m.canonical).envelope,m.envelope);assert.equal(m.envelope.baseRevision,null);assert.equal(m.envelope.clientId,await db.initialize());assert.equal((await db.work.get(id))?.activeMutationId,m.mutationId);
});
test('editing, requeue and double queue cannot replace immutable operation',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);
  const results=await Promise.allSettled([db.freeze(id,1),db.freeze(id,1)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const original=(await db.mutations.toArray())[0]!;await assert.rejects(db.saveDraft(id,{...payload,title:'Changed'},1));await assert.rejects(db.freeze(id,1));
  const copy=await db.mutations.get(original.mutationId);copy!.envelope.payload!.notes='Caller mutation';assert.equal((await db.mutations.get(original.mutationId))?.canonical,original.canonical);assert.equal(await db.mutations.count(),1);
});
test('freeze abort rolls back queue insertion and work lock together',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);
  await assert.rejects(db.freeze(id,1,()=>{throw new Error('injected transaction abort');}));assert.equal(await db.mutations.count(),0);assert.equal((await db.work.get(id))?.phase,'draft');await db.freeze(id,1);
});
test('failed draft write preserves prior saved values; stale versions rejected',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);await assert.rejects(db.saveDraft(id,{...payload,notes:'Failed'},1,()=>{throw new Error('write failed');}));assert.equal((await db.work.get(id))?.payload.notes,payload.notes);await assert.rejects(db.freeze(id,0));await assert.rejects(db.saveDraft(id,payload,0));
});
test('independent records queue independently and profiles start empty',async t=>{
  const db=await fixture(t),other=await fixture(t);for(let n=0;n<2;n++){const id=crypto.randomUUID();await db.saveDraft(id,payload,0);await db.freeze(id,1);}assert.equal(await db.mutations.count(),2);assert.equal(await other.mutations.count(),0);assert.notEqual(await db.initialize(),await other.initialize());
});
test('draft discard is explicit and queued work cannot be discarded',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);await db.discardDraft(id);assert.equal(await db.work.count(),0);await db.saveDraft(id,payload,0);await db.freeze(id,1);await assert.rejects(db.discardDraft(id));
});
test('test-only authoritative fixture produces update envelope retaining common base',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();const base:Inspection={id,...payload,revision:'7',deleted:false};await db.cleanRecords.add(base);await db.saveDraft(id,{...payload,notes:'Edit'},0);const m=await db.freeze(id,1);assert.equal(m.envelope.operation,'update');assert.equal(m.envelope.baseRevision,'7');assert.deepEqual(m.commonBase,base);
});
test('synthetic success acknowledgment is atomic and historical state never regresses clean record',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);const m=await db.freeze(id,1);
  const r:MutationResponse={protocolVersion:1,mutationId:m.mutationId,replayed:false,outcome:{kind:'committed',committedRevision:'1',record:{id,...payload,revision:'1',deleted:false}}};
  await assert.rejects(db.applySyntheticReceipt(m.mutationId,r,()=>{throw new Error('ack abort');}));assert.equal((await db.work.get(id))?.phase,'queued');assert.equal((await db.mutations.get(m.mutationId))?.receipt,undefined);assert.equal(await db.cleanRecords.count(),0);
  await db.cleanRecords.put({id,...payload,title:'Newer fixture',revision:'2',deleted:false});await db.applySyntheticReceipt(m.mutationId,r);assert.equal(await db.work.count(),0);assert.equal((await db.cleanRecords.get(id))?.revision,'2');assert.equal((await db.mutations.get(m.mutationId))?.phase,'acknowledged');await db.applySyntheticReceipt(m.mutationId,r);
  const reordered=JSON.parse(JSON.stringify(r));reordered.outcome=Object.fromEntries(Object.entries(reordered.outcome).reverse());await db.applySyntheticReceipt(m.mutationId,reordered);
});
test('synthetic conflict retains proposal/base and original receipt; invalid receipt rejected',async t=>{
  const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);const m=await db.freeze(id,1);
  const r:MutationResponse={protocolVersion:1,mutationId:m.mutationId,replayed:false,outcome:{kind:'conflict',reason:'record_exists',expectedRevision:null,remoteAtDecision:{id,...payload,title:'Remote fixture',revision:'2',deleted:false}}};
  await assert.rejects(db.applySyntheticReceipt(m.mutationId,{...r,mutationId:crypto.randomUUID()}));await db.applySyntheticReceipt(m.mutationId,r);assert.equal((await db.work.get(id))?.phase,'terminal_conflict');assert.deepEqual((await db.work.get(id))?.payload,payload);assert.deepEqual((await db.mutations.get(m.mutationId))?.receipt,r);
});

test('saved null base never silently rebases when a separate fixture appears',async t=>{
 const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);await db.cleanRecords.put({id,...payload,revision:'3',deleted:false});await db.saveDraft(id,payload,1);const w=await db.work.get(id);assert.equal(w?.baseRevision,null);assert.equal(w?.commonBase,null);
});
test('unknown phase fixture and exact envelope survive reopen without a retry controller',async t=>{
 const db=await fixture(t),id=crypto.randomUUID();await db.saveDraft(id,payload,0);const m=await db.freeze(id,1);await db.mutations.update(m.mutationId,{phase:'outcome_unknown'});db.close();await db.open();assert.equal((await db.mutations.get(m.mutationId))?.canonical,m.canonical);assert.equal((await db.mutations.get(m.mutationId))?.phase,'outcome_unknown');await assert.rejects(db.freeze(id,1));
});
