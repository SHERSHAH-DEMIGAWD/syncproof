import { validateSnapshot } from './pull.js';
import { Dexie, type Table } from 'dexie';
import { prepareMutation, parseMutation } from './contract.js';
import type { BusinessPayload, Inspection, MutationResponse } from './contract.js';

export interface Work {
  id: string; version: number; payload: BusinessPayload;
  baseRevision: string | null; commonBase: Inspection | null;
  phase: 'draft' | 'queued' | 'terminal_conflict'; activeMutationId?: string;
  resolutionOf?: string; intent?: 'update' | 'delete';
}
export interface Mutation {
  mutationId: string; recordId: string;
  envelope: Awaited<ReturnType<typeof prepareMutation>>['envelope'];
  canonical: string; fingerprint: string; commonBase: Inspection | null;
  phase: 'queued' | 'outcome_unknown' | 'acknowledged' | 'terminal_conflict';
  receipt?: MutationResponse;
  resolves?: string; decision?: {kind:'keep_server';at:number};
  attemptCount?: number; lastAttemptAt?: number; notBefore?: number; lastError?: string;
  blocked?: { code: string; message: string };
}
export class LocalStore extends Dexie {
  work!: Table<Work, string>;
  mutations!: Table<Mutation, string>;
  cleanRecords!: Table<Inspection, string>;
  metadata!: Table<{ key: string; value: string }, string>;
  constructor(name = 'syncproof-local-v1') {
    super(name);
    this.version(1).stores({ work: '&id,phase', mutations: '&mutationId,recordId,phase', cleanRecords: '&id', metadata: '&key' });
  }
  async initialize() {
    const candidate = crypto.randomUUID();
    return this.transaction('rw', this.metadata, async () => {
      let identity = await this.metadata.get('clientId');
      if (!identity) { identity = { key: 'clientId', value: candidate }; await this.metadata.add(identity); }
      return identity.value;
    });
  }
  async saveDraft(id: string, payload: BusinessPayload, expectedVersion: number, fault?: () => void) {
    const clientId = await this.initialize();
    const validated = parseMutation(JSON.stringify({ protocolVersion: 1, mutationId: crypto.randomUUID(), clientId, recordId: id, operation: 'create', baseRevision: null, payload }));
    if (!validated.envelope.payload) throw new Error('Draft payload missing');
    const savedPayload = validated.envelope.payload;
    return this.transaction('rw', this.work, this.cleanRecords, async () => {
      const old = await this.work.get(id);
      if (old && old.phase !== 'draft') throw new Error('Record is locked by an immutable mutation');
      if ((old?.version ?? 0) !== expectedVersion) throw new Error('Draft changed; reload before saving');
      const clean = await this.cleanRecords.get(id);
      if (clean?.deleted) throw new Error('Deleted inspection cannot be edited');
      const work: Work = { id, version: expectedVersion + 1, payload: savedPayload,
        baseRevision: old ? old.baseRevision : clean?.revision ?? null, commonBase: old ? old.commonBase : clean ?? null, phase: 'draft', ...(old?.resolutionOf?{resolutionOf:old.resolutionOf}:{}), ...(old?.intent?{intent:old.intent}:{}) };
      await this.work.put(work); fault?.();
      return work;
    });
  }
  async discardDraft(id: string) {
    return this.transaction('rw', this.work, async () => {
      const work = await this.work.get(id);
      if (work?.resolutionOf) throw new Error('Cancel the resolution draft explicitly instead');
      if (work?.phase !== 'draft') throw new Error('Only an editable draft can be discarded');
      await this.work.delete(id);
    });
  }
  async freeze(id: string, expectedVersion: number, fault?: () => void) {
    const work = await this.work.get(id);
    if (!work || work.phase !== 'draft') throw new Error('Record is locked or draft is missing');
    const clientId = await this.initialize();
    // Crypto promises finish BEFORE the read-write transaction opens.
    const parsed = await prepareMutation(JSON.stringify({ protocolVersion: 1, mutationId: crypto.randomUUID(), clientId,
      recordId: id, operation: work.intent ?? (work.baseRevision === null ? 'create' : 'update'), baseRevision: work.baseRevision, payload: work.intent === 'delete' ? null : work.payload }));
    return this.transaction('rw', this.work, this.mutations, this.cleanRecords, async () => {
      const current = await this.work.get(id);
      if (!current || current.phase !== 'draft' || current.activeMutationId) throw new Error('Record already has an outstanding mutation');
      if (current.version !== expectedVersion || work.version !== current.version) throw new Error('Draft changed during freeze; save/review again');
      if(current.resolutionOf) {const remote=await this.cleanRecords.get(id);if(!remote||remote.deleted||remote.revision!==current.baseRevision)throw new Error('Remote observation changed; cancel and review again');}
      const mutation: Mutation = { mutationId: parsed.envelope.mutationId, recordId: id, ...parsed, commonBase: current.commonBase, phase: 'queued', ...(current.resolutionOf?{resolves:current.resolutionOf}:{}) };
      await this.mutations.add(mutation); fault?.();
      await this.work.put({ ...current, phase: 'queued', activeMutationId: mutation.mutationId });
      return mutation;
    });
  }
  async beginResolution(conflictId:string, expectedRemote:string, values?:BusinessPayload, confirmDelete=false) {
    const rejected=await this.mutations.get(conflictId);
    if(!rejected)throw Error('Conflict missing');
    if(rejected.envelope.operation==='delete'&&!confirmDelete)throw Error('Confirm the new deletion explicitly');
    const source=values??rejected.envelope.payload??rejected.commonBase;
    const validated=parseMutation(JSON.stringify({...rejected.envelope,operation:'update',baseRevision:expectedRemote,payload:{title:source?.title,status:source?.status,notes:source?.notes}}));
    if(!validated.envelope.payload)throw Error('Resolution values missing');
    const payload=validated.envelope.payload;
    return this.transaction('rw',this.work,this.mutations,this.cleanRecords,async()=>{
      const m=await this.mutations.get(conflictId),w=await this.work.get(rejected.recordId),remote=await this.cleanRecords.get(rejected.recordId);
      if(m?.phase!=='terminal_conflict'||w?.phase!=='terminal_conflict'||w.activeMutationId!==conflictId||m.decision)throw Error('Conflict is not actionable');
      if(!remote||remote.deleted||remote.revision!==expectedRemote||m.envelope.operation==='create')throw Error('Review a live remote record; restore/upsert is not supported');
      const draft:Work={id:w.id,version:w.version+1,payload,baseRevision:remote.revision,commonBase:remote,phase:'draft',resolutionOf:conflictId,intent:m.envelope.operation==='delete'?'delete':'update'};
      await this.work.put(draft);return draft;
    });
  }
  async cancelResolution(id:string) {
    return this.transaction('rw',this.work,this.mutations,async()=>{
      const w=await this.work.get(id);if(w?.phase!=='draft'||!w.resolutionOf)throw Error('No editable resolution to cancel');
      const m=await this.mutations.get(w.resolutionOf);if(!m||m.phase!=='terminal_conflict')throw Error('Original conflict missing');
      const original=m.envelope.payload??m.commonBase??w.payload;
      await this.work.put({id,version:w.version+1,payload:{title:original.title,status:original.status,notes:original.notes},baseRevision:m.envelope.baseRevision,commonBase:m.commonBase,phase:'terminal_conflict',activeMutationId:m.mutationId});
    });
  }
  async keepServer(conflictId:string, confirmed:boolean, expectedRevision:string) {
    if(!confirmed)throw Error('Explicit discard confirmation required');
    const at=Date.now();
    return this.transaction('rw',this.work,this.mutations,this.cleanRecords,async()=>{
      const m=await this.mutations.get(conflictId);if(!m)throw Error('Conflict missing');
      const w=await this.work.get(m.recordId),remote=await this.cleanRecords.get(m.recordId);
      if(m.phase!=='terminal_conflict'||w?.phase!=='terminal_conflict'||w.activeMutationId!==conflictId||m.decision)throw Error('Pending resolution cannot be discarded');
      if(!remote||remote.revision!==expectedRevision)throw Error('Remote observation changed; review again');
      await this.mutations.put({...m,decision:{kind:'keep_server',at}});await this.work.delete(m.recordId);
    });
  }
  async queueDelete(id:string, expectedRevision:string, confirmed:boolean, fault?:()=>void) {
    if(!confirmed)throw Error('Explicit deletion confirmation required');
    const remote=await this.cleanRecords.get(id);if(!remote||remote.deleted||remote.revision!==expectedRevision)throw Error('Review live server record first');
    const clientId=await this.initialize();
    const parsed=await prepareMutation(JSON.stringify({protocolVersion:1,mutationId:crypto.randomUUID(),clientId,recordId:id,operation:'delete',baseRevision:expectedRevision,payload:null}));
    return this.transaction('rw',this.work,this.mutations,this.cleanRecords,async()=>{
      if(await this.work.get(id))throw Error('Record already has local work');
      const latest=await this.cleanRecords.get(id);if(!latest||latest.deleted||latest.revision!==expectedRevision)throw Error('Remote observation changed');
      const m:Mutation={...parsed,mutationId:parsed.envelope.mutationId,recordId:id,commonBase:latest,phase:'queued'};
      await this.mutations.add(m);fault?.();await this.work.put({id,version:1,payload:{title:latest.title,status:latest.status,notes:latest.notes},baseRevision:latest.revision,commonBase:latest,phase:'queued',activeMutationId:m.mutationId,intent:'delete'});return m;
    });
  }
  async applySnapshot(input: unknown, fault?: () => void) {
    const snapshot = validateSnapshot(input);
    return this.transaction('rw', this.cleanRecords, this.metadata, async () => {
      const incoming = new Map(snapshot.records.map(r => [r.id,r]));
      for (const known of await this.cleanRecords.toArray()) {
        const next = incoming.get(known.id);
        if (!next) throw new Error('Complete snapshot missing known authoritative record');
        if (BigInt(next.revision) < BigInt(known.revision)) throw new Error('Snapshot revision rollback rejected');
        if (next.revision === known.revision && recordKey(next) !== recordKey(known)) throw new Error('Equal revision has unequal state');
        if (known.deleted && !next.deleted) throw new Error('Tombstone resurrection rejected');
      }
      for (const record of snapshot.records) { await this.cleanRecords.put(record); fault?.(); }
      await this.metadata.put({key:'lastSnapshot',value:JSON.stringify({completedAt:Date.now(),recordCount:snapshot.recordCount})});
    });
  }
  async pending() {
    const entries = await this.mutations.where('phase').anyOf('queued','outcome_unknown').toArray();
    return entries.sort((a,b) => Number(b.phase === 'outcome_unknown') - Number(a.phase === 'outcome_unknown'));
  }
  async markAttempt(id: string, now: number) {
    return this.transaction('rw', this.mutations, this.work, async () => {
      const m = await this.mutations.get(id);
      if (!m || !['queued','outcome_unknown'].includes(m.phase) || m.blocked) throw new Error('Mutation is not eligible');
      const work = await this.work.get(m.recordId);
      if (work?.activeMutationId !== id) throw new Error('Active work does not match');
      if ((m.notBefore ?? 0) > now) throw new Error('Retry not-before time has not elapsed');
      await this.mutations.put({ ...m, phase: 'outcome_unknown', attemptCount: (m.attemptCount ?? 0)+1, lastAttemptAt: now });
    });
  }
  async noteFailure(id: string, message: string, blocked?: {code:string;message:string}, notBefore?: number) {
    return this.transaction('rw', this.mutations, async () => {
      const m = await this.mutations.get(id);
      if (!m || !['queued','outcome_unknown'].includes(m.phase)) return;
      await this.mutations.put({ ...m, lastError: message, ...(blocked ? {blocked} : {}), ...(notBefore === undefined ? {} : {notBefore}) });
    });
  }
  // Historical Phase 2 simulation entry remains for regressions; both paths use
  // identical validation and one atomic acknowledgment transaction.
  async applySyntheticReceipt(id: string, input: unknown, fault?: () => void) {
    return this.applyReceipt(id, input, fault);
  }
  async applyReceipt(id: string, input: unknown, fault?: () => void) {
    const mutation = await this.mutations.get(id);
    if (!mutation) throw new Error('Unknown mutation');
    const receipt = validateReceipt(mutation, input);
    return this.transaction('rw', this.work, this.mutations, this.cleanRecords, async () => {
      const current = await this.mutations.get(id);
      const work = await this.work.get(mutation.recordId);
      if (!current || current.canonical !== mutation.canonical) throw new Error('Mutation changed');
      if (current.receipt) {
        if (outcomeKey(current.receipt) !== outcomeKey(receipt)) throw new Error('Terminal outcome changed');
        return;
      }
      if (work?.activeMutationId !== id) throw new Error('Active mutation does not match');
      const remote = receipt.outcome.kind === 'committed' ? receipt.outcome.record : receipt.outcome.remoteAtDecision;
      if (remote) {
        const clean = await this.cleanRecords.get(remote.id);
        if (!clean || BigInt(remote.revision) > BigInt(clean.revision)) await this.cleanRecords.put(remote);
        else if (remote.revision === clean.revision && recordKey(remote) !== recordKey(clean)) throw new Error('Equal revision differs');
      }
      await this.mutations.put({ ...current, receipt, phase: receipt.outcome.kind === 'committed' ? 'acknowledged' : 'terminal_conflict', lastError: '' });
      fault?.();
      if (receipt.outcome.kind === 'committed') await this.work.delete(work.id);
      else await this.work.put({ ...work, phase: 'terminal_conflict' });
    });
  }
}

export function validateReceipt(mutation: Mutation, input: unknown): MutationResponse {
  // Input is cloned so callers cannot change it while the storage transaction runs.
  const r = structuredClone(input) as MutationResponse;
  if (!r || r.protocolVersion !== 1 || r.mutationId !== mutation.mutationId || typeof r.replayed !== 'boolean' || !r.outcome) throw new Error('Invalid receipt');
  const o = r.outcome;
  const remote = o.kind === 'committed' ? o.record : o.kind === 'conflict' ? o.remoteAtDecision : undefined;
  if (remote === undefined) throw new Error('Invalid terminal outcome');
  if (o.kind === 'conflict' && (!['record_missing','record_deleted','record_exists','stale_revision'].includes(o.reason) || o.expectedRevision !== mutation.envelope.baseRevision || ((o.reason === 'record_missing') !== (remote === null)))) throw new Error('Invalid conflict');
  if (remote) {
    parseMutation(JSON.stringify({ ...mutation.envelope, operation: 'update', baseRevision: remote.revision,
      payload: { title: remote.title, status: remote.status, notes: remote.notes } }));
    if (remote.id !== mutation.recordId || typeof remote.deleted !== 'boolean') throw new Error('Invalid remote record');
  }
  if (o.kind === 'committed' && (!remote || o.committedRevision !== remote.revision || BigInt(remote.revision) !== BigInt(mutation.envelope.baseRevision ?? '0') + 1n)) throw new Error('Invalid committed revision');
  if (o.kind === 'committed' && remote) {
    if (remote.deleted !== (mutation.envelope.operation === 'delete')) throw new Error('Committed tombstone mismatch');
    const intended = mutation.envelope.payload;
    if (intended && (remote.title !== intended.title || remote.status !== intended.status || remote.notes !== intended.notes)) throw new Error('Committed values mismatch');
  }
  if (o.kind === 'conflict' && mutation.envelope.operation === 'create' && !['record_exists','record_deleted'].includes(o.reason)) throw new Error('Invalid conflict for create');
  if (o.kind === 'conflict' && remote) {
    if ((o.reason === 'record_deleted') !== remote.deleted) throw new Error('Conflict tombstone mismatch');
    if (o.reason === 'record_exists' && mutation.envelope.operation !== 'create') throw new Error('Invalid create conflict');
    if (o.reason === 'stale_revision' && (mutation.envelope.baseRevision === null || remote.revision === mutation.envelope.baseRevision)) throw new Error('Invalid stale conflict');
  }
  return r;
}

function recordKey(r: Inspection) { return JSON.stringify([r.id,r.title,r.status,r.notes,r.revision,r.deleted]); }
function outcomeKey(r: MutationResponse) { const o=r.outcome; return o.kind==='committed' ? JSON.stringify([o.kind,o.committedRevision,recordKey(o.record)]) : JSON.stringify([o.kind,o.reason,o.expectedRevision,o.remoteAtDecision ? recordKey(o.remoteAtDecision) : null]); }
