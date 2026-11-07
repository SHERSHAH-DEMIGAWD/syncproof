import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
import {processMutation} from '../src/mutations.js';
import {fixture,mutation,record,receiptCount,deferred,bounded,blockedBy} from './helpers.js';
import {evidence} from './audit-evidence.js';
import type {MutationResponse} from '../src/contracts.js';

for(const conflict of [false,true])test(`F2 HTTP concurrent ${conflict?'conflict':'success'} duplicates arbitrate one receipt and preserve identity`,async t=>{
 const {pool,admin}=await fixture(t);const initial=mutation();await processMutation(pool,initial);
 if(conflict)await processMutation(pool,mutation({...initial.envelope,mutationId:crypto.randomUUID(),operation:'update',baseRevision:'1'}));
 const m=mutation({...initial.envelope,mutationId:crypto.randomUUID(),operation:'update',baseRevision:'1',payload:{title:'Duplicate candidate',status:'open',notes:'Exact identity'}});
 const owner=deferred<number>(),waiter=deferred<number>(),release=deferred<void>();let claims=0;
 const server=createApp(pool,{hooks:{on:async(event,ctx)=>{if(ctx.mutationId!==m.envelope.mutationId)return;if(event==='before_receipt_claim'&&++claims===2)waiter.resolve(ctx.backendPid);if(event==='after_receipt_claim_before_record'){owner.resolve(ctx.backendPid);await release.promise;}}}}).listen(0,'127.0.0.1');
 await bounded(new Promise<void>((yes,no)=>{server.once('listening',yes);server.once('error',no);}), 'audit HTTP listen');const address=server.address();assert.ok(address&&typeof address!=='string');
 const post=async(body=m.canonical)=>{const r=await fetch(`http://127.0.0.1:${address.port}/mutations`,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json() as MutationResponse};};
 const first=post();let second:ReturnType<typeof post>|undefined;
 try{const ownerPid=await bounded(owner.promise,'HTTP owner claim');second=post();const waiterPid=await bounded(waiter.promise,'HTTP duplicate claim');assert.notEqual(ownerPid,waiterPid);await blockedBy(admin,waiterPid,ownerPid);release.resolve();const [a,b]=await Promise.all([first,second]);assert.equal(a.status,conflict?409:200);assert.equal(b.status,a.status);assert.equal(a.body.outcome.kind,conflict?'conflict':'committed');assert.deepEqual(b.body.outcome,a.body.outcome);assert.equal(b.body.replayed,true);
 const serial=await post();assert.deepEqual(serial.body.outcome,a.body.outcome);assert.equal(serial.body.replayed,true);const collision=await post(JSON.stringify({...m.envelope,payload:{title:'Changed',status:'open',notes:'Collision'}}));assert.equal(collision.status,409);assert.equal((collision.body as unknown as {error:{code:string}}).error.code,'mutation_identity_collision');assert.equal(await receiptCount(pool,m.envelope.mutationId),1);assert.equal((await record(pool,m.envelope.recordId))?.revision,'2');
 await evidence(conflict?'F2-conflict':'F2-success',{test:t.name,layer:'real PostgreSQL + HTTP independent connections',initialRevision:conflict?'2':'1',mutationId:m.envelope.mutationId,canonical:m.canonical,fingerprint:m.fingerprint,fault:'hold receipt owner, observe actual pg_blocking_pids, release',ownerPid,waiterPid,observed:a.body,duplicate:b.body,serial:serial.body,collision:collision.body,finalRevision:'2',receiptCount:1,invariants:['INV-IDEMP-01','INV-ATOMIC-01','INV-REV-01'],limit:'No delivery guarantee; ownership rollback separately covered by existing integration regression.'});
 }finally{release.resolve();await Promise.allSettled([first,...(second?[second]:[])]);server.closeAllConnections();await new Promise<void>(yes=>server.close(()=>yes()));}
});

test('normal HTTP runtime has no fault routes and ignores test-control request input',async t=>{
 const {pool}=await fixture(t);const server=createApp(pool).listen(0,'127.0.0.1');await bounded(new Promise<void>(yes=>server.once('listening',yes)),'normal server');const a=server.address();assert.ok(a&&typeof a!=='string');const url=`http://127.0.0.1:${a.port}`;
 try{for(const path of ['/__test/crash','/__test/checkpoint','/faults'])assert.equal((await fetch(url+path,{method:'POST'})).status,404);const m=mutation();const r=await fetch(url+'/mutations',{method:'POST',headers:{'Content-Type':'application/json','X-SyncProof-Test-Fault':'after_commit_before_response'},body:m.canonical});assert.equal(r.status,200);assert.equal((await record(pool,m.envelope.recordId))?.revision,'1');await evidence('fault-safety',{test:t.name,normalFaultRoutes:404,testHeaderIgnored:true,productionProcessGuard:'tests/process.test.ts negative NODE_ENV/IPC test rerun separately'});}finally{server.closeAllConnections();await new Promise<void>(yes=>server.close(()=>yes()));}
});
