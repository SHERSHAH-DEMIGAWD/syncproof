import { artifactPath } from '../audit-evidence.js';
import { test, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Mutation } from '../../client/lib/storage.js';
const dbModule=pathToFileURL(resolve('dist/src/db.js')).href;
const appModule=pathToFileURL(resolve('dist/src/app.js')).href;
const mutationModule=pathToFileURL(resolve('dist/src/mutations.js')).href;
const contractModule=pathToFileURL(resolve('dist/src/contracts.js')).href;
const {createPool,migrate}=await import(dbModule) as typeof import('../../src/db.js');
const {createApp}=await import(appModule) as typeof import('../../src/app.js');
const {processMutation}=await import(mutationModule) as typeof import('../../src/mutations.js');
const {parseMutation}=await import(contractModule) as typeof import('../../src/contracts.js');
let pool:Pool,admin:Pool,server:Server,schema:string;
test.beforeEach(async()=>{
  const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL required for real browser/PostgreSQL integration');
  schema='syncproof_push_'+randomUUID().replaceAll('-','');admin=createPool(url);await admin.query(`CREATE SCHEMA "${schema}"`);pool=createPool(url,schema);await migrate(pool);
  server=createApp(pool,{allowedOrigin:'http://127.0.0.1:5174'}).listen(3000,'127.0.0.1');await once(server,'listening');
});
test.afterEach(async()=>{
  if(server){server.closeAllConnections();await new Promise<void>(yes=>server.close(()=>yes()));}
  if(pool)await pool.end();
  if(admin){if(!/^syncproof_push_[a-f0-9]{32}$/.test(schema))throw Error('Unsafe test schema cleanup');await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});
async function list(page:Page):Promise<Mutation[]> {return page.evaluate(async()=>{const p='/lib/storage.ts';const {LocalStore}=await import(p);const db=new LocalStore();try{return await db.mutations.toArray();}finally{db.close();}});}
async function queue(page:Page,title='Push pump 🧪') {
  await page.getByRole('button',{name:'New inspection',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill(title);await page.getByLabel('Notes').fill('Seal é\n"special" \\');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');await page.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Queued on this device');
  return JSON.parse(await page.getByTestId('metadata').innerText()) as Mutation;
}
async function send(page:Page) {await page.getByRole('button',{name:'Send pending / Retry',exact:true}).click();}
async function observedError(page:Page) {await expect.poll(async()=> (await list(page)).filter(m=>m.phase==='outcome_unknown'&&m.lastError).length).toBeGreaterThan(0);}
async function dbState(m:Mutation){const row=await pool.query('SELECT id,title,revision::text,deleted FROM inspections WHERE id=$1',[m.recordId]);const receipts=await pool.query('SELECT mutation_id,canonical_request,fingerprint,outcome,response FROM processed_mutations WHERE mutation_id=$1',[m.mutationId]);return {row:row.rows[0],receipt:receipts.rows[0],receiptCount:receipts.rowCount};}
async function update(m:Mutation,base:string,title:string){return processMutation(pool,parseMutation(JSON.stringify({...m.envelope,mutationId:randomUUID(),clientId:randomUUID(),operation:'update',baseRevision:base,payload:{title,status:'complete',notes:'Authorized later writer'}})));}

test('browser canonical create/independent update accepted; exact duplicates replay without extra revision',async({page})=>{
 await page.goto('/');const m=await queue(page);await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');
 const state=await dbState(m);expect(state.row.revision).toBe('1');expect(state.receipt.canonical_request).toBe(m.canonical);expect(state.receipt.fingerprint).toBe(m.fingerprint);expect((await list(page))[0]?.phase).toBe('acknowledged');
 await page.getByRole('button',{name:'Push pump 🧪 — Server acknowledged',exact:true}).click();await page.getByLabel('Notes').fill('Independent update');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');await page.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Queued on this device');const m2=JSON.parse(await page.getByTestId('metadata').innerText()) as Mutation;expect(m2.envelope.baseRevision).toBe('1');expect(m2.mutationId).not.toBe(m.mutationId);await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');
 const replay=await page.evaluate(async canonical=>{const r=await fetch('/api/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:canonical});return r.json();},m.canonical);expect(replay.replayed).toBe(true);expect(replay.outcome.committedRevision).toBe('1');expect((await dbState(m)).row.revision).toBe('2');
});
test('F1 actual commit confirmed in PostgreSQL before response loss; five exact replays then manual recovery',async({page})=>{
 test.setTimeout(60000);await page.goto('/');const m=await queue(page);let forwards=0;const sent:string[]=[];
 await page.route('**/api/mutations',async route=>{sent.push(route.request().postData()!);const response=await route.fetch();expect(response.status()).toBe(200);const state=await dbState(m);expect(state.row.revision).toBe('1');expect(state.receiptCount).toBe(1);forwards++;await route.abort('failed');});
 await send(page);await expect(page.getByRole('status')).toContainText('outcome unknown: 1',{timeout:35000});expect(forwards).toBe(5);expect(new Set(sent)).toEqual(new Set([m.canonical]));expect((await list(page))[0]?.phase).toBe('outcome_unknown');
 await page.unroute('**/api/mutations');await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');const stored=(await list(page))[0]!;expect(stored.receipt?.replayed).toBe(true);expect((await dbState(m)).row.revision).toBe('1');
 await writeFile(artifactPath('phase-3','f1-observation.json'),JSON.stringify({result:'PASS',mutationId:m.mutationId,recordId:m.recordId,commitObservedBeforeEveryAbort:true,forwardedRequests:forwards,canonicalBytesIdentical:true,finalRevision:'1',receiptCount:1,replayed:stored.receipt?.replayed},null,2));
});
test('unreachable backend before admission retains bytes across reload and retries when reachable',async({page})=>{
 await page.goto('/');const m=await queue(page);await page.route('**/api/mutations',route=>route.abort('connectionrefused'));await send(page);await observedError(page);expect((await dbState(m)).receiptCount).toBe(0);await page.reload();await page.unroute('**/api/mutations');expect((await list(page))[0]?.canonical).toBe(m.canonical);await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');expect((await dbState(m)).row.revision).toBe('1');
});
test('actual server commit followed by native acknowledgment transaction failure recovers same ID',async({page})=>{
 await page.goto('/');const m=await queue(page);
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){if(this.name==='mutations'&&value&&typeof value==='object'&&'receipt' in value){IDBObjectStore.prototype.put=original;throw new DOMException('Injected acknowledgment abort','QuotaExceededError');}return key===undefined?original.call(this,value):original.call(this,value,key);};});
 await send(page);await expect(page.getByRole('status')).toContainText('outcome unknown: 1');const local=(await list(page))[0]!;expect(local.phase).toBe('outcome_unknown');expect(local.receipt).toBeUndefined();expect((await dbState(m)).receiptCount).toBe(1);
 const cleanCount=await page.evaluate(async()=>{const p='/lib/storage.ts';const {LocalStore}=await import(p);const db=new LocalStore();try{return await db.cleanRecords.count();}finally{db.close();}});expect(cleanCount).toBe(0);await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');expect((await list(page))[0]?.receipt?.replayed).toBe(true);expect((await dbState(m)).row.revision).toBe('1');
});
test('real stale conflict retains local/base/original response and blocks edits without resolution UI',async({page})=>{
 await page.goto('/');const initial=await queue(page,'Conflict pump');await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');await page.getByRole('button',{name:'Conflict pump — Server acknowledged',exact:true}).click();await page.getByLabel('Notes').fill('Preserve local changes');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');await page.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Queued on this device');const m=JSON.parse(await page.getByTestId('metadata').innerText()) as Mutation;
 await update(initial,'1','Other inspector');await send(page);await expect(page.getByRole('status')).toContainText('conflicts: 1');const local=(await list(page)).find(x=>x.mutationId===m.mutationId)!;expect(local.phase).toBe('terminal_conflict');expect(local.commonBase?.revision).toBe('1');expect(local.envelope.payload?.notes).toBe('Preserve local changes');expect(local.receipt?.outcome.kind).toBe('conflict');await expect(page.getByLabel('Notes')).toBeDisabled();expect((await dbState(m)).row.revision).toBe('2');await update(initial,'2','Latest inspector');
 const replay=await page.evaluate(async canonical=>{const r=await fetch('/api/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:canonical});return {status:r.status,body:await r.json()};},m.canonical);expect(replay.status).toBe(409);expect(replay.body.outcome.remoteAtDecision.revision).toBe('2');expect((await dbState(m)).row.revision).toBe('3');
});
test('real identity collision is blocked without altering local frozen envelope or server winner',async({page})=>{
 await page.goto('/');const m=await queue(page);await processMutation(pool,parseMutation(JSON.stringify({...m.envelope,payload:{title:'Different winner',status:'open',notes:'Collision fixture'}})));await send(page);await expect(page.getByRole('alert')).toContainText('mutation_identity_collision');const local=(await list(page))[0]!;expect(local.canonical).toBe(m.canonical);expect(local.phase).toBe('outcome_unknown');expect(local.receipt).toBeUndefined();expect((await dbState(m)).row.title).toBe('Different winner');
});
test('historical replay keeps latest known revision and unrelated later draft while preserving original receipt',async({page})=>{
 await page.goto('/');const m=await queue(page);await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');await update(m,'1','Revision 2');await update(m,'2','Revision 3');
 const remote=await pool.query('SELECT id,title,status,notes,revision::text,deleted FROM inspections WHERE id=$1',[m.recordId]);
 const result=await page.evaluate(async args=>{const p='/lib/storage.ts';const {LocalStore}=await import(p);const db=new LocalStore();try{await db.cleanRecords.put(args.remote);await db.saveDraft(args.id,{title:'Later unsent draft',status:'open',notes:'Keep this'},0);const r=await fetch('/api/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:args.canonical});const receipt=await r.json();await db.applyReceipt(args.mutationId,receipt);return {revision:(await db.cleanRecords.get(args.id)).revision,draft:(await db.work.get(args.id)).payload.title,receipt};}finally{db.close();}}, {remote:remote.rows[0],id:m.recordId,mutationId:m.mutationId,canonical:m.canonical});
 expect(result.receipt.outcome.committedRevision).toBe('1');expect(result.revision).toBe('3');expect(result.draft).toBe('Later unsent draft');expect((await dbState(m)).row.revision).toBe('3');
});
test('partial F4 browser interruption leaves acknowledged, unknown and queued records recoverable',async({page})=>{
 await page.goto('/');await queue(page,'Batch A');await queue(page,'Batch B');await queue(page,'Batch C');let count=0;let secondId='';
 let gate!:()=>void;const second=new Promise<void>(yes=>{gate=yes;});await page.route('**/api/mutations',async route=>{count++;const response=await route.fetch();if(count===1){await route.fulfill({response});return;}secondId=JSON.parse(route.request().postData()!).mutationId;const r=await pool.query('SELECT mutation_id FROM processed_mutations WHERE mutation_id=$1',[secondId]);expect(r.rowCount).toBe(1);await route.abort('failed');gate();});
 await send(page);await second;await observedError(page);await page.reload();await page.unroute('**/api/mutations');const states=await list(page);expect(states.filter(m=>m.phase==='acknowledged')).toHaveLength(1);expect(states.filter(m=>m.phase==='outcome_unknown')).toHaveLength(1);expect(states.filter(m=>m.phase==='queued')).toHaveLength(1);
 const order:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/mutations'))order.push(JSON.parse(r.postData()!).mutationId);});await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 2');expect(order[0]).toBe(secondId);expect((await list(page)).every(m=>m.phase==='acknowledged')).toBe(true);const counts=await pool.query('SELECT count(*)::text FROM processed_mutations');expect(counts.rows[0].count).toBe('3');
});
test('rapid UI send triggers share one actual request and one durable server outcome',async({page})=>{
 await page.goto('/');const m=await queue(page);let calls=0;let release!:()=>void;const hold=new Promise<void>(yes=>{release=yes;});let observed!:()=>void;const seen=new Promise<void>(yes=>{observed=yes;});
 await page.route('**/api/mutations',async route=>{calls++;const response=await route.fetch();expect((await dbState(m)).receiptCount).toBe(1);observed();await hold;await route.fulfill({response});});
 await page.getByRole('button',{name:'Send pending / Retry',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await seen;await expect(page.getByRole('button',{name:'Send pending / Retry',exact:true})).toBeDisabled();release();await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');expect(calls).toBe(1);expect((await list(page)).length).toBe(1);expect((await dbState(m)).row.revision).toBe('1');
});
test('HTTP503 not-before and malformed response remain unknown and later same-ID retry succeeds',async({page})=>{
 await page.goto('/');const m=await queue(page);await page.route('**/api/mutations',route=>route.fulfill({status:503,headers:{'Retry-After':'60'},body:'not-json'}));await send(page);await expect(page.getByRole('status')).toContainText('outcome unknown: 1');let local=(await list(page))[0]!;expect(local.receipt).toBeUndefined();expect(local.notBefore).toBeGreaterThan(Date.now());expect((await dbState(m)).receiptCount).toBe(0);
 await page.unroute('**/api/mutations');await page.evaluate(async id=>{const p='/lib/storage.ts';const {LocalStore}=await import(p);const db=new LocalStore();try{await db.mutations.update(id,{notBefore:0});}finally{db.close();}},m.mutationId);
 await page.route('**/api/mutations',route=>route.fulfill({status:200,body:'{"truncated":'}));await send(page);await expect.poll(async()=>(await list(page))[0]?.lastError).toContain('(HTTP 200)');await page.reload();await page.unroute('**/api/mutations');local=(await list(page))[0]!;expect(local.canonical).toBe(m.canonical);expect(local.phase).toBe('outcome_unknown');await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');expect((await dbState(m)).row.revision).toBe('1');
});
test('actual retained-profile browser restart after commit-before-loss replays the original unknown operation',async()=>{
 const parent=resolve('.local/profiles');await mkdir(parent,{recursive:true});const profile=await mkdtemp(resolve(parent,'push-'));let context:BrowserContext|undefined;const pids:number[]=[];
 async function launch(){context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});const browser=context.browser()!;const cdp=await browser.newBrowserCDPSession();const info=await cdp.send('SystemInfo.getProcessInfo');pids.push(info.processInfo.find(p=>p.type==='browser')!.id);await cdp.detach();return context;}
 try{let c=await launch();let page=c.pages()[0]??await c.newPage();await page.goto('http://127.0.0.1:5174');const m=await queue(page,'Restart unknown');let release!:()=>void;const committed=new Promise<void>(yes=>{release=yes;});await page.route('**/api/mutations',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);expect((await dbState(m)).receiptCount).toBe(1);await route.abort('failed');release();});await send(page);await committed;await observedError(page);await c.close();context=undefined;
 c=await launch();page=c.pages()[0]??await c.newPage();await page.goto('http://127.0.0.1:5174');await expect.poll(async()=> (await list(page)).length).toBe(1);expect((await list(page))[0]?.canonical).toBe(m.canonical);expect((await list(page))[0]?.phase).toBe('outcome_unknown');await send(page);await expect(page.getByRole('status')).toContainText('Server acknowledged: 1');expect((await list(page))[0]?.receipt?.replayed).toBe(true);expect((await dbState(m)).row.revision).toBe('1');expect(pids[0]).not.toBe(pids[1]);
 await c.close();context=undefined;c=await launch();page=c.pages()[0]??await c.newPage();await page.goto('http://127.0.0.1:5174');await expect.poll(async()=>(await list(page))[0]?.phase).toBe('acknowledged');expect((await list(page))[0]?.canonical).toBe(m.canonical);
 await writeFile(artifactPath('phase-3','browser-recovery.json'),JSON.stringify({result:'PASS',browser:c.browser()!.version(),pids,closure:'graceful full browser close/relaunch before and after acknowledgment',sameProfile:true,mutationId:m.mutationId,canonicalUnchanged:true,committedBeforeLoss:true,acknowledgmentSurvivesSecondRestart:true,finalRevision:'1',replayed:true},null,2));
 }finally{if(context)await context.close();if(!profile.startsWith(parent+sep))throw Error('Unsafe profile cleanup');await rm(profile,{recursive:true,force:true});}
});
