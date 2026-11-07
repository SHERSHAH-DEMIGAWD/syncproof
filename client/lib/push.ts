import { pullSnapshot } from './pull.js';
import { LocalStore, validateReceipt, type Mutation } from './storage.js';
import { prepareMutation } from './contract.js';
import type { MutationResponse } from './contract.js';

export type Delivery = { kind:'terminal'; receipt:MutationResponse }
  | { kind:'unknown'; message:string; retryAfterMs?:number }
  | { kind:'blocked'; code:string; message:string };

/** Only the POST is timed. Decode errors/status failures are outcomes too:
 * fetch resolves for HTTP errors, and an abort cannot undo a server commit. */
export async function deliver(m:Mutation, fetcher:typeof fetch=fetch, timeoutMs=10000, now=Date.now()):Promise<Delivery> {
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const response=await fetcher('/api/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:m.canonical,signal:abort.signal,cache:'no-store'});
    const hint=response.headers.get('retry-after');
    const retryAfterMs=hint===null?undefined:/^\d+$/.test(hint)?Number(hint)*1000:Math.max(0,Date.parse(hint)-now);
    const retryHint=retryAfterMs!==undefined&&Number.isFinite(retryAfterMs)?{retryAfterMs}:{};
    const text=await response.text();
    let body:unknown;try{body=JSON.parse(text);}catch{return {kind:'unknown',message:`Unreadable response (HTTP ${response.status}); retry same ID`,...retryHint};}
    if (response.status===200 || (response.status===409 && typeof body==='object' && body!==null && 'outcome' in body)) {
      try {
        const receipt=validateReceipt(m,body);
        if((receipt.outcome.kind==='committed'?200:409)!==response.status) throw new Error('Status/outcome mismatch');
        return {kind:'terminal',receipt};
      } catch {return {kind:'unknown',message:'Invalid terminal response; original outcome remains unknown'};}
    }
    const b=body as {protocolVersion?:unknown;mutationId?:unknown;error?:{code?:unknown}};
    const code=b?.error?.code;
    if(response.status===409 && code==='mutation_identity_collision' && b.protocolVersion===1 && b.mutationId===m.mutationId)
      return {kind:'blocked',code,message:'Mutation identity collision. Preserve original operation; investigate server/client identity.'};
    const admission:Record<number,string>={400:'invalid_json',413:'body_too_large',415:'unsupported_media_type',422:'invalid_envelope',403:'origin_not_allowed'};
    if(admission[response.status] && code===admission[response.status]) return {kind:'blocked',code:String(code),message:`Request blocked (${String(code)}). Prior attempts may still have committed; do not replace the ID.`};
    return {kind:'unknown',message:`HTTP ${response.status}; terminal outcome not established`,...(retryAfterMs!==undefined&&Number.isFinite(retryAfterMs)?{retryAfterMs}:{})};
  } catch {return {kind:'unknown',message:'Network failure or timeout; original outcome remains unknown'};}
  finally {clearTimeout(timer);}
}

interface Options {
  transport?:(m:Mutation)=>Promise<Delivery>;
  wait?:(ms:number)=>Promise<void>;
  now?:()=>number;
  random?:()=>number;
  afterAcknowledgmentWrite?:()=>void;
}
export interface PushSummary { acknowledged:number; conflicts:number; unknown:number; blocked:number; deferred:number; snapshotApplied?:boolean }
export class PushController {
  private running:Promise<PushSummary>|undefined;
  constructor(private db:LocalStore,private options:Options={}) {}
  sendPending():Promise<PushSummary> { return this.start(() => this.run()); }
  reviewLatest():Promise<PushSummary> {return this.start(async()=>{const recovered=await this.run('outcome_unknown');await this.db.applySnapshot(await pullSnapshot());return {...recovered,snapshotApplied:true};});}
  synchronize():Promise<PushSummary> {
    return this.start(async () => {
      const recovered=await this.run('outcome_unknown');
      await this.db.applySnapshot(await pullSnapshot());
      const sent=await this.run('queued');
      await this.db.applySnapshot(await pullSnapshot());
      return {snapshotApplied:true,acknowledged:recovered.acknowledged+sent.acknowledged, conflicts:recovered.conflicts+sent.conflicts, unknown:recovered.unknown+sent.unknown, blocked:recovered.blocked+sent.blocked, deferred:recovered.deferred+sent.deferred};
    });
  }
  private start(task:()=>Promise<PushSummary>):Promise<PushSummary> {
    if(this.running)return this.running;
    const run=task();this.running=run;
    void run.finally(()=>{if(this.running===run)this.running=undefined;}).catch(()=>undefined);
    return run;
  }
  private async run(phase?:'queued'|'outcome_unknown'):Promise<PushSummary> {
    const summary:PushSummary={acknowledged:0,conflicts:0,unknown:0,blocked:0,deferred:0};
    const now=this.options.now??Date.now;
    const wait=this.options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    const transport=this.options.transport??(m=>deliver(m));
    for(const entry of await this.db.pending()) {
      if(phase && entry.phase!==phase)continue;
      if(entry.blocked){summary.blocked++;continue;}
      if((entry.notBefore??0)>now()){summary.deferred++;continue;}
      for(let attempt=0;attempt<5;attempt++) {
        // Re-read durable bytes on EVERY attempt. No reconstruction or rebase.
        const m=await this.db.mutations.get(entry.mutationId);
        if(!m || !['queued','outcome_unknown'].includes(m.phase))break;
        const check=await prepareMutation(m.canonical);
        if(check.canonical!==m.canonical || check.fingerprint!==m.fingerprint || JSON.stringify(check.envelope)!==JSON.stringify(m.envelope)) {
          await this.db.noteFailure(m.mutationId,'Stored envelope integrity mismatch',{code:'local_integrity_error',message:'Stored bytes/envelope disagree; investigate without replacing identity'});summary.blocked++;break;
        }
        await this.db.markAttempt(m.mutationId,now());
        let result:Delivery;
        try{result=await transport(m);}catch{result={kind:'unknown',message:'Transport failed; retry original ID'};}
        if(result.kind==='terminal') {
          try {
            await this.db.applyReceipt(m.mutationId,result.receipt,this.options.afterAcknowledgmentWrite);
            if(result.receipt.outcome.kind==='committed')summary.acknowledged++;else summary.conflicts++;
          } catch {
            await this.db.noteFailure(m.mutationId,'Acknowledgment storage failed; retry original ID');summary.unknown++;
          }
          break;
        }
        if(result.kind==='blocked') {
          await this.db.noteFailure(m.mutationId,result.message,{code:result.code,message:result.message});summary.blocked++;break;
        }
        const later=result.retryAfterMs!==undefined && result.retryAfterMs>30000;
        await this.db.noteFailure(m.mutationId,result.message,undefined,later?now()+result.retryAfterMs!:undefined);
        if(attempt===4 || later){summary.unknown++;break;}
        const jitter=0.8+0.4*(this.options.random??Math.random)();
        const delay=Math.min(30000,Math.max(1000*2**attempt*jitter,result.retryAfterMs??0));
        await wait(delay);
      }
    }
    return summary;
  }
}
