import { artifactPath } from '../audit-evidence.js';
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

async function author(page: Page, title: string) {
  await page.getByRole('button',{name:'New inspection',exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill(title);
  await page.getByLabel('Notes',{exact:true}).fill('Retain this offline proposal');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Saved locally');
}
async function queue(page: Page) {
  await page.getByRole('button',{name:'Queue for future sync',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Queued on this device');
  return page.getByTestId('metadata').innerText();
}
test('draft edit/reload, queue immutability, independent records and exact reload persistence',async({page})=>{
  await page.goto('/');await author(page,'Pump A');
  await page.getByLabel('Notes').fill('Edited draft');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved locally');
  await page.reload();await page.getByRole('button',{name:'Pump A — Local draft',exact:true}).click();await expect(page.getByLabel('Notes')).toHaveValue('Edited draft');
  const first=await queue(page);expect(JSON.parse(first).envelope.baseRevision).toBeNull();await expect(page.getByLabel('Title',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Queue for future sync',exact:true})).toBeDisabled();
  await page.reload();await page.getByRole('button',{name:'Pump A — Queued on this device',exact:true}).click();await expect(page.getByTestId('metadata')).toHaveText(first);
  const rejected=await page.evaluate(async()=>{const path='/lib/storage.ts';const {LocalStore}=await import(path);const db=new LocalStore();const w=(await db.work.toArray())[0];let failures=0;try{await db.freeze(w.id,w.version);}catch{failures++;}try{await db.saveDraft(w.id,{...w.payload,title:'Forbidden'},w.version);}catch{failures++;}db.close();return failures;});expect(rejected).toBe(2);
  await author(page,'Pump B');await queue(page);await expect(page.getByText('Pending on this device: 2',{exact:true})).toBeVisible();
});
test('already loaded app authors and queues offline with no mutation/snapshot HTTP requests',async({page,context})=>{
  const api:string[]=[];page.on('request',r=>{if(/\/(mutations|inspections)(\?|$)/.test(new URL(r.url()).pathname))api.push(r.url());});
  await page.goto('/');await expect(page.getByRole('heading',{name:'SyncProof',exact:true})).toBeVisible();await context.setOffline(true);
  await author(page,'Offline pump');await queue(page);expect(api).toEqual([]);await expect(page.getByRole('status')).not.toHaveText(/Synced|Uploaded|Server confirmed|Committed/);
  await context.setOffline(false);
});
test('actual IndexedDB aborted freeze rolls back both stores; UI write failure never claims saved',async({page})=>{
  await page.goto('/');await author(page,'Abort fixture');
  const result=await page.evaluate(async()=>{const path='/lib/storage.ts';const {LocalStore}=await import(path);const db=new LocalStore();const w=(await db.work.toArray())[0];let aborted=false;try{await db.freeze(w.id,w.version,()=>{throw new Error('deterministic abort');});}catch{aborted=true;}const result={aborted,count:await db.mutations.count(),phase:(await db.work.get(w.id)).phase};db.close();return result;});expect(result).toEqual({aborted:true,count:0,phase:'draft'});
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(..._args:Parameters<IDBObjectStore['put']>){IDBObjectStore.prototype.put=original;throw new DOMException('Injected storage failure','QuotaExceededError');};});
  await page.getByLabel('Notes').fill('Must not be persisted');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Storage error');await expect(page.getByRole('status')).not.toHaveText('Saved locally');
  await page.reload();await page.getByRole('button',{name:'Abort fixture — Local draft',exact:true}).click();await expect(page.getByLabel('Notes')).toHaveValue('Retain this offline proposal');
});
test('F5 actual graceful browser process close/relaunch retains same persistent profile; fresh profile isolated',async()=>{
  const parent=resolve('.local/profiles');await mkdir(parent,{recursive:true});const profile=await mkdtemp(resolve(parent,'phase2-'));let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
  const pids:number[]=[];let version='';
  async function launch(){context=await chromium.launchPersistentContext(profile,{headless:true});const browser=context.browser();version=browser?.version()??'unknown';if(browser){const cdp=await browser.newBrowserCDPSession();const info=await cdp.send('SystemInfo.getProcessInfo');pids.push(info.processInfo.find(p=>p.type==='browser')!.id);await cdp.detach();}return context;}
  try{
    let c=await launch();let page=c.pages()[0]??await c.newPage();await page.goto('http://127.0.0.1:5174');await author(page,'Restart pump');const before=await queue(page);
    await c.close();expect(c.browser()?.isConnected()??false).toBe(false);context=undefined;
    c=await launch();page=c.pages()[0]??await c.newPage();await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Restart pump — Queued on this device',exact:true}).click();await expect(page.getByTestId('metadata')).toHaveText(before);await expect(page.getByLabel('Title',{exact:true})).toBeDisabled();
    expect(pids.length).toBe(2);expect(pids[0]).not.toBe(pids[1]);
    const fresh=await chromium.launch({headless:true});try{const independent=await fresh.newPage();await independent.goto('http://127.0.0.1:5174');await expect(independent.getByText('No local inspections yet.')).toBeVisible();}finally{await fresh.close();}
    const durability=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((yes,no)=>{const r=indexedDB.open('syncproof-local-v1');r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});const tx=db.transaction('metadata','readonly');const hint=tx.durability;await new Promise<void>(yes=>{tx.oncomplete=()=>yes();});db.close();return hint;});
    await mkdir('docs/evidence/phase-2',{recursive:true});await writeFile(artifactPath('phase-2','browser-lifecycle.json'),JSON.stringify({result:'PASS',browser:version,browserPids:pids,close:'graceful full persistent browser context/process close',sameUserDataDir:true,profileDirectory:profile,profileRemovedAfterTest:true,durabilityHint:durability,canonicalBefore:JSON.parse(before).canonical,canonicalAfterIdentical:true,freshProfileEmpty:true,limits:'Frontend shell reachable on relaunch; no forced kill, power loss, eviction, OS crash or backend sync tested'},null,2));
  }finally{if(context)await context.close();if(!profile.startsWith(parent+sep))throw new Error('Unsafe profile cleanup');await rm(profile,{recursive:true,force:true});}
});
