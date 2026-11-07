import type { Pool, PoolClient } from 'pg';
import type { Inspection, MutationResponse, Outcome, ParsedMutation } from './contracts.js';

export type Checkpoint = 'before_receipt_claim' | 'after_receipt_claim_before_record'
  | 'before_record_lock' | 'after_record_write_before_commit' | 'after_commit_before_response';
export interface MutationHooks {
  on(event: Checkpoint, context: { mutationId: string; backendPid: number }): Promise<void>;
}
export interface IdentityCollisionResponse {
  protocolVersion: 1;
  mutationId: string;
  error: { code: 'mutation_identity_collision' };
}
export interface MutationResult {
  status: 200 | 409;
  body: MutationResponse | IdentityCollisionResponse;
}

const columns = 'id,title,status,notes,revision::text AS revision,deleted';

async function adjudicate(client: PoolClient, parsed: ParsedMutation): Promise<Outcome> {
  const m = parsed.envelope;
  let current: Inspection | undefined;
  if (m.operation === 'create') {
    const inserted = await client.query<Inspection>(
      `INSERT INTO inspections (id,title,status,notes,revision,deleted)
       VALUES ($1,$2,$3,$4,1,false) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
      [m.recordId, m.payload.title, m.payload.status, m.payload.notes],
    );
    if (inserted.rows[0]) return { kind: 'committed', committedRevision: '1', record: inserted.rows[0] };
    // A competing insertion may not have been visible to the INSERT snapshot.
    // This separate READ COMMITTED statement sees the now-committed winner.
    const existing = await client.query<Inspection>(`SELECT ${columns} FROM inspections WHERE id=$1 FOR UPDATE`, [m.recordId]);
    current = existing.rows[0];
    if (!current) throw new Error('Record disappeared after create uniqueness conflict');
    return {
      kind: 'conflict', reason: current.deleted ? 'record_deleted' : 'record_exists',
      expectedRevision: null, remoteAtDecision: current,
    };
  }

  const locked = await client.query<Inspection>(`SELECT ${columns} FROM inspections WHERE id=$1 FOR UPDATE`, [m.recordId]);
  current = locked.rows[0];
  const reason = !current ? 'record_missing' : current.deleted ? 'record_deleted'
    : current.revision !== m.baseRevision ? 'stale_revision' : undefined;
  if (reason) return {
    kind: 'conflict', reason, expectedRevision: m.baseRevision, remoteAtDecision: current ?? null,
  };
  // Even after the lock/check, keep the expected-revision condition in the write.
  const updated = m.operation === 'update'
    ? await client.query<Inspection>(
      `UPDATE inspections SET title=$3,status=$4,notes=$5,revision=revision+1
       WHERE id=$1 AND revision=$2::bigint AND deleted=false RETURNING ${columns}`,
      [m.recordId, m.baseRevision, m.payload.title, m.payload.status, m.payload.notes],
    )
    : await client.query<Inspection>(
      `UPDATE inspections SET deleted=true,revision=revision+1
       WHERE id=$1 AND revision=$2::bigint AND deleted=false RETURNING ${columns}`,
      [m.recordId, m.baseRevision],
    );
  const record = updated.rows[0];
  if (!record) throw new Error('Locked revision predicate unexpectedly failed');
  return { kind: 'committed', committedRevision: record.revision, record };
}

export async function processMutation(pool: Pool, parsed: ParsedMutation, hooks?: MutationHooks): Promise<MutationResult> {
  const client = await pool.connect();
  let committed = false;
  const m = parsed.envelope;
  // backendPid is diagnostic information for deterministic test barriers.
  const context = { mutationId: m.mutationId, backendPid: 0 };
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    if (hooks) {
      const pid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      context.backendPid = pid.rows[0]!.pid;
      await hooks.on('before_receipt_claim', context);
    }
    const claim = await client.query(
      `INSERT INTO processed_mutations
       (mutation_id,protocol_version,client_id,record_id,operation,base_revision,canonical_request,fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (mutation_id) DO NOTHING RETURNING mutation_id`,
      [m.mutationId, m.protocolVersion, m.clientId, m.recordId, m.operation, m.baseRevision, parsed.canonical, parsed.fingerprint],
    );
    let result: MutationResult;
    if (claim.rowCount === 0) {
      const stored = await client.query<{
        canonical_request: string; fingerprint: string; http_status: 200 | 409; response: MutationResponse;
      }>('SELECT canonical_request,fingerprint,http_status,response FROM processed_mutations WHERE mutation_id=$1', [m.mutationId]);
      const receipt = stored.rows[0];
      if (!receipt?.response) throw new Error('Committed receipt is missing or incomplete');
      result = receipt.canonical_request !== parsed.canonical || receipt.fingerprint !== parsed.fingerprint
        ? { status: 409, body: { protocolVersion: 1, mutationId: m.mutationId, error: { code: 'mutation_identity_collision' } } }
        : { status: receipt.http_status, body: { ...receipt.response, replayed: true } };
    } else {
      await hooks?.on('after_receipt_claim_before_record', context);
      await hooks?.on('before_record_lock', context);
      const outcome = await adjudicate(client, parsed);
      await hooks?.on('after_record_write_before_commit', context);
      const body: MutationResponse = { protocolVersion: 1, mutationId: m.mutationId, replayed: false, outcome };
      const status = outcome.kind === 'committed' ? 200 : 409;
      await client.query(
        `UPDATE processed_mutations SET outcome=$2,http_status=$3,committed_revision=$4,response=$5::jsonb
         WHERE mutation_id=$1`,
        [m.mutationId, outcome.kind, status, outcome.kind === 'committed' ? outcome.committedRevision : null, JSON.stringify(body)],
      );
      result = { status, body };
    }
    await client.query('COMMIT');
    committed = true;
    // Failure here is deliberately outside rollback semantics. A transport or
    // hook failure cannot undo the committed result; callers must replay.
    await hooks?.on('after_commit_before_response', context);
    return result;
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
