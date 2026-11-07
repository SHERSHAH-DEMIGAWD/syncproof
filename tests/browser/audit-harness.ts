import {test as base,expect,chromium,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Pool} from 'pg';
import type {Server} from 'node:http';
import type {Mutation,Work} from '../../client/lib/storage.js';
import type {Inspection} from '../../client/lib/contract.js';
import type {Checkpoint} from '../../src/mutations.js';
import {evidence} from '../audit-evidence.js';
const {createPool,migrate}=await import(pathToFileURL(resolve('dist/src/db.js')).href) as typeof import('../../src/db.js');
const {createApp}=await import(pathToFileURL(resolve('dist/src/app.js')).href) as typeof import('../../src/app.js');
const {processMutation}=await import(pathToFileURL(resolve('dist/src/mutations.js')).href) as typeof import('../../src/mutations.js');
const {parseMutation}=await import(pathToFileURL(resolve('dist/src/contracts.js')).href) as typeof import('../../src/contracts.js');
export {expect,evidence};
export function gate<T=void>(){let yes!:(value:T)=>void;const promise=new Promise<T>(resolve=>yes=resolve);return {promise,release:yes};}
export interface State {work:Work[];mutations:Mutation[];clean:Inspection[];metadata:{key:string;value:string}[]}
export async function state(p:Page):Promise<State>{return p.evaluate(async()=>{const path='/lib/storage.ts';const {LocalStore}=await import(path);const d=new LocalStore();try{return {work:await d.work.toArray(),mutations:await d.mutations.toArray(),clean:await d.cleanRecords.toArray(),metadata:await d.metadata.toArray()};}finally{d.close();}});}
export async function load(p:Page){await p.goto('http://127.0.0.1:5174');await expect.poll(async()=>(await state(p)).metadata.some(x=>x.key==='clientId')).toBe(true);}
export async function reconcile(p:Page){await p.getByRole('button',{name:'Reconcile now',exact:true}).click();await expect(p.getByRole('status')).toContainText('Snapshot applied');}
export async function send(p:Page,expected='Server acknowledged: 1'){await p.getByRole('button',{name:'Send pending / Retry',exact:true}).click();await expect(p.getByRole('status')).toContainText(expected);}
export async function createDraft(p:Page,title:string,notes='Saved proposal',freeze=true){await p.getByRole('button',{name:'New inspection',exact:true}).click();await p.getByLabel('Title').fill(title);await p.getByLabel('Notes').fill(notes);await p.getByRole('button',{name:'Save draft',exact:true}).click();await expect(p.getByRole('status')).toHaveText('Saved locally');if(!freeze)return undefined;await p.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(p.getByRole('status')).toHaveText('Queued on this device');return JSON.parse(await p.getByTestId('metadata').innerText()) as Mutation;}
export async function edit(p:Page,title:string,notes:string){await p.getByRole('button',{name:title+' — Server acknowledged',exact:true}).click();await p.getByLabel('Notes').fill(notes);await p.getByRole('button',{name:'Save draft',exact:true}).click();await expect(p.getByRole('status')).toHaveText('Saved locally');await p.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(p.getByRole('status')).toHaveText('Queued on this device');return JSON.parse(await p.getByTestId('metadata').innerText()) as Mutation;}
export async function keep(p:Page,title:string){await p.getByRole('button',{name:title+' — Conflict — local proposal preserved',exact:true}).click();await p.getByRole('button',{name:'Review latest server',exact:true}).click();await expect(p.getByRole('button',{name:'Keep server',exact:true})).toBeEnabled();p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Keep server',exact:true}).click();await expect(p.getByRole('status')).toContainText('deliberately discarded');}
export async function resolution(p:Page,title:string){await p.getByRole('button',{name:title+' — Conflict — local proposal preserved',exact:true}).click();await p.getByRole('button',{name:'Review latest server',exact:true}).click();await expect(p.getByRole('button',{name:'Reapply local values',exact:true})).toBeEnabled();await p.getByRole('button',{name:'Reapply local values',exact:true}).click();await p.getByRole('button',{name:'Queue for future sync',exact:true}).click();await expect(p.getByRole('status')).toHaveText('Queued on this device');return JSON.parse(await p.getByTestId('metadata').innerText()) as Mutation;}
export class Audit {
 pool!:Pool;admin!:Pool;server?:Server;schema='';contexts:BrowserContext[]=[];profiles:{path:string;context?:BrowserContext;pids:number[]}[]=[];
 private holds=new Map<string,{arrived:ReturnType<typeof gate<{mutationId:string;backendPid:number}>>;released:ReturnType<typeof gate<void>>}>();
 constructor(private browser:Browser){}
 async start(){const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL required for real audit');this.schema='syncproof_audit_'+randomUUID().replaceAll('-','');this.admin=createPool(url);await this.admin.query(`CREATE SCHEMA "${this.schema}"`);this.pool=createPool(url,this.schema);await migrate(this.pool);this.server=createApp(this.pool,{allowedOrigin:'http://127.0.0.1:5174',hooks:{on:async(event,ctx)=>{const hold=this.holds.get(event+ctx.mutationId);if(hold){hold.arrived.release(ctx);await hold.released.promise;}}}}).listen(3000,'127.0.0.1');await new Promise<void>((yes,no)=>{this.server!.once('listening',yes);this.server!.once('error',no);});}
 hold(event:Checkpoint,id:string){const value={arrived:gate<{mutationId:string;backendPid:number}>(),released:gate()};this.holds.set(event+id,value);return {seen:value.arrived.promise,release:()=>value.released.release()};}
 async client(){const c=await this.browser.newContext();this.contexts.push(c);const p=await c.newPage();await load(p);return p;}
 async persistent(){const parent=resolve('.local/profiles');await mkdir(parent,{recursive:true});const item:{path:string;context?:BrowserContext;pids:number[]}={path:await mkdtemp(resolve(parent,'audit-')),pids:[]};this.profiles.push(item);const open=async()=>{item.context=await chromium.launchPersistentContext(item.path,{headless:true,serviceWorkers:'block'});const b=item.context.browser()!,cdp=await b.newBrowserCDPSession();const info=await cdp.send('SystemInfo.getProcessInfo');item.pids.push(info.processInfo.find(x=>x.type==='browser')!.id);await cdp.detach();const p=item.context.pages()[0]??await item.context.newPage();await load(p);return p;};return {open,close:async()=>{await item.context?.close();delete item.context;},pids:item.pids};}
 async seed(title='Audit inspection'){const m=parseMutation(JSON.stringify({protocolVersion:1,mutationId:randomUUID(),clientId:randomUUID(),recordId:randomUUID(),operation:'create',baseRevision:null,payload:{title,status:'open',notes:'Base'}}));await processMutation(this.pool,m);return m;}
 async advance(id:string,base:string,operation:'update'|'delete'='update',notes='Other authorized writer'){const old=(await this.pool.query('SELECT title FROM inspections WHERE id=$1',[id])).rows[0];const m=parseMutation(JSON.stringify({protocolVersion:1,mutationId:randomUUID(),clientId:randomUUID(),recordId:id,operation,baseRevision:base,payload:operation==='delete'?null:{title:old.title,status:'open',notes}}));const result=await processMutation(this.pool,m);expect(result.status).toBe(200);return m;}
 async record(id:string){return (await this.pool.query('SELECT id,title,status,notes,revision::text,deleted FROM inspections WHERE id=$1',[id])).rows[0] as Inspection|undefined;}
 async receipt(id:string){const r=await this.pool.query('SELECT mutation_id,canonical_request,fingerprint,response FROM processed_mutations WHERE mutation_id=$1',[id]);return {count:r.rowCount,row:r.rows[0]};}
 async records(){return (await this.pool.query('SELECT id,title,status,notes,revision::text,deleted FROM inspections ORDER BY id')).rows as Inspection[];}
 async finish(){for(const h of this.holds.values())h.released.release();for(const c of this.contexts)await c.close();for(const p of this.profiles){await p.context?.close();if(!p.path.startsWith(resolve('.local/profiles')+sep))throw Error('Unsafe profile cleanup');await rm(p.path,{recursive:true,force:true});}if(this.server){this.server.closeAllConnections();await new Promise<void>(yes=>this.server!.close(()=>yes()));}if(this.pool)await this.pool.end();if(this.admin){if(!/^syncproof_audit_[a-f0-9]{32}$/.test(this.schema))throw Error('Unsafe schema cleanup');await this.admin.query(`DROP SCHEMA "${this.schema}" CASCADE`);await this.admin.end();}}
}
export const test=base.extend<{audit:Audit}>({audit:async({browser},use)=>{const audit=new Audit(browser);try{await audit.start();await use(audit);}finally{await audit.finish();}}});
// Simulated response loss, real backend commit; stop the active foreground run by reload.
export async function dropCommitted(p:Page,a:Audit,m:Mutation){
 const committed=gate(),release=gate();await p.route('**/api/mutations',async route=>{const reply=await route.fetch();expect([200,409]).toContain(reply.status());expect((await a.receipt(m.mutationId)).count).toBe(1);committed.release();await release.promise;await route.abort().catch(()=>undefined);});
 await p.getByRole('button',{name:'Send pending / Retry',exact:true}).click();await committed.promise;
 // Keep the response blocked until the old JS controller is destroyed. No race against retry backoff.
 try{expect((await state(p)).mutations.find(x=>x.mutationId===m.mutationId)?.phase).toBe('outcome_unknown');await p.reload();}finally{release.release();}
 await p.unroute('**/api/mutations');const stored=(await state(p)).mutations.find(x=>x.mutationId===m.mutationId)!;expect(stored.phase).toBe('outcome_unknown');expect(stored.canonical).toBe(m.canonical);expect(stored.fingerprint).toBe(m.fingerprint);expect(stored.envelope).toEqual(m.envelope);
}
export async function equalClean(p:Page,a:Audit){expect((await state(p)).clean.sort((x,y)=>x.id.localeCompare(y.id))).toEqual(await a.records());}

