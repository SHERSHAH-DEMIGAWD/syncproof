import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { LocalStore, type Mutation } from '../client/lib/storage.js';
import { PushController, deliver, type Delivery } from '../client/lib/push.js';
const payload={title:'Push 🧪',status:'open' as const,notes:'é\n"\\'};
async function setup(t:TestContext){const db=new LocalStore('push-'+crypto.randomUUID());t.after(()=>db.delete());const id=crypto.randomUUID();await db.saveDraft(id,payload,0);return {db,m:await db.freeze(id,1)};}
function success(m:Mutation):Delivery{return {kind:'terminal',receipt:{protocolVersion:1,mutationId:m.mutationId,replayed:false,outcome:{kind:'committed',committedRevision:'1',record:{id:m.recordId,...payload,revision:'1',deleted:false}}}};}
function responder(status:number,body:unknown,headers?:HeadersInit):typeof fetch{return (async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,...(headers?{headers}:{})})) as typeof fetch;}
test('fetch transport validates status/body/identity and exact durable canonical request',async t=>{
 const {m}=await setup(t);const expected=success(m);assert.equal(expected.kind,'terminal');if(expected.kind!=='terminal')return;
 let bytes='';const result=await deliver(m,(async(_url,init)=>{bytes=String(init?.body);assert.equal(init?.method,'POST');return new Response(JSON.stringify(expected.receipt),{status:200});}) as typeof fetch);
 assert.equal(result.kind,'terminal');assert.equal(bytes,m.canonical);
 for(const [status,body] of [[500,expected.receipt],[200,'{'],[200,{...expected.receipt,mutationId:crypto.randomUUID()}],[409,expected.receipt],[409,{...expected.receipt,outcome:{kind:'conflict',reason:'record_missing',expectedRevision:null,remoteAtDecision:null}}],[200,{...expected.receipt,outcome:{...expected.receipt.outcome,record:{id:m.recordId,...payload,notes:'Wrong',revision:'1',deleted:false}}}]] as [number,unknown][]){assert.equal((await deliver(m,responder(status,body))).kind,'unknown');}
});
test('classification separates blocked collision/admission from 429/5xx/unknown errors',async t=>{
 const {m}=await setup(t);
 for(const [status,code] of [[409,'mutation_identity_collision'],[400,'invalid_json'],[413,'body_too_large'],[415,'unsupported_media_type'],[422,'invalid_envelope'],[403,'origin_not_allowed']] as const){assert.equal((await deliver(m,responder(status,{protocolVersion:1,mutationId:m.mutationId,error:{code}}))).kind,'blocked');}
 for(const status of [401,404,429,500,503])assert.equal((await deliver(m,responder(status,{error:{code:'other'}}))).kind,'unknown');
 const delayed=await deliver(m,responder(429,{}, {'Retry-After':'60'}));assert.equal(delayed.kind==='unknown'&&delayed.retryAfterMs,60000);
 const unreadable=await deliver(m,responder(503,'not-json',{'Retry-After':'60'}));assert.equal(unreadable.kind==='unknown'&&unreadable.retryAfterMs,60000);
});
test('timeout, rejected fetch and unreadable body retain unknown outcome',async t=>{
 const {m}=await setup(t);assert.equal((await deliver(m,(async()=>{throw Error('connection');}) as typeof fetch)).kind,'unknown');
 const waitAbort:typeof fetch=async(_url,init)=>new Promise((_yes,no)=>{init?.signal?.addEventListener('abort',()=>no(new Error('aborted')));});assert.equal((await deliver(m,waitAbort,1)).kind,'unknown');
});
test('five attempts use durable marker, unchanged bytes, capped fake-clock backoff; next manual retry safe',async t=>{
 const {db,m}=await setup(t);const waits:number[]=[];let attempts=0;
 const controller=new PushController(db,{transport:async stored=>{attempts++;assert.equal((await db.mutations.get(m.mutationId))?.phase,'outcome_unknown');assert.equal(stored.canonical,m.canonical);return {kind:'unknown',message:'offline'};},wait:async ms=>{waits.push(ms);},random:()=>0.5});
 assert.equal((await controller.sendPending()).unknown,1);assert.equal(attempts,5);assert.deepEqual(waits,[1000,2000,4000,8000]);assert.equal((await db.mutations.get(m.mutationId))?.attemptCount,5);assert.equal((await db.mutations.get(m.mutationId))?.receipt,undefined);
 await new PushController(db,{transport:async stored=>success(stored)}).sendPending();assert.equal((await db.mutations.get(m.mutationId))?.phase,'acknowledged');assert.equal(await db.pending().then(x=>x.length),0);
});
test('overlapping triggers share one foreground operation and mutation identity',async t=>{
 const {db,m}=await setup(t);let release!:()=>void;const gate=new Promise<void>(yes=>{release=yes;});let calls=0;
 const controller=new PushController(db,{transport:async stored=>{calls++;await gate;return success(stored);}});const a=controller.sendPending(),b=controller.sendPending();assert.equal(a,b);release();await a;assert.equal(calls,1);assert.equal(await db.mutations.count(),1);assert.equal((await db.mutations.get(m.mutationId))?.receipt?.mutationId,m.mutationId);
});
test('local acknowledgment abort retains unknown and all stores recover by same-ID replay',async t=>{
 const {db,m}=await setup(t);let fault=true;
 const controller=new PushController(db,{transport:async stored=>success(stored),afterAcknowledgmentWrite:()=>{if(fault)throw Error('abort ack');}});
 assert.equal((await controller.sendPending()).unknown,1);assert.equal((await db.mutations.get(m.mutationId))?.phase,'outcome_unknown');assert.equal(await db.cleanRecords.count(),0);assert.equal((await db.work.get(m.recordId))?.activeMutationId,m.mutationId);
 fault=false;await controller.sendPending();assert.equal((await db.mutations.get(m.mutationId))?.phase,'acknowledged');
});
test('blocked requests retain unknown identity; another click cannot invent a repair mutation',async t=>{
 const {db,m}=await setup(t);let calls=0;const c=new PushController(db,{transport:async()=>{calls++;return {kind:'blocked',code:'mutation_identity_collision',message:'Investigate'};}});
 await c.sendPending();await c.sendPending();assert.equal(calls,1);assert.equal((await db.mutations.get(m.mutationId))?.canonical,m.canonical);assert.equal((await db.mutations.get(m.mutationId))?.phase,'outcome_unknown');assert.equal(await db.mutations.count(),1);
});
test('Retry-After beyond cap persists a not-before time instead of waiting or spinning',async t=>{
 const {db,m}=await setup(t);let clock=1000;let calls=0;const c=new PushController(db,{now:()=>clock,transport:async()=>{calls++;return {kind:'unknown',message:'later',retryAfterMs:60000};},wait:async()=>{throw Error('must not wait');}});
 await c.sendPending();assert.equal((await db.mutations.get(m.mutationId))?.notBefore,61000);assert.equal((await c.sendPending()).deferred,1);assert.equal(calls,1);clock=61000;await c.sendPending();assert.equal(calls,2);
});
test('multi-record interruption preserves partial success and recovers unknown before never-attempted work',async t=>{
 const {db}=await setup(t);for(let n=0;n<2;n++){const id=crypto.randomUUID();await db.saveDraft(id,payload,0);await db.freeze(id,1);}let count=0;const c=new PushController(db,{transport:async m=>++count===1?success(m):{kind:'unknown',message:'cut'},wait:async()=>{throw Error('process stopped');}});
 await assert.rejects(c.sendPending());const all=await db.mutations.toArray();assert.equal(all.filter(m=>m.phase==='acknowledged').length,1);assert.equal(all.filter(m=>m.phase==='outcome_unknown').length,1);assert.equal(all.filter(m=>m.phase==='queued').length,1);assert.equal((await db.pending())[0]?.phase,'outcome_unknown');await new PushController(db,{transport:async m=>success(m)}).sendPending();assert.equal((await db.pending()).length,0);
});
