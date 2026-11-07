import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { processMutation } from '../src/mutations.js';
import { blockedBy, bounded, deferred, fixture, mutation, receiptCount, record } from './helpers.js';

type Parsed = ReturnType<typeof mutation>;
type Result = Awaited<ReturnType<typeof processMutation>>;
type Context = { mutationId: string; backendPid: number };

function terminal(result: Result) {
  assert.ok('outcome' in result.body, 'expected terminal outcome, not protocol error');
  return result.body.outcome;
}

function replayed(result: Result) {
  assert.ok('replayed' in result.body, 'expected terminal response replay flag');
  return result.body.replayed;
}

function committed(result: Result) {
  assert.equal(result.status, 200);
  const outcome = terminal(result);
  assert.equal(outcome.kind, 'committed');
  if (outcome.kind !== 'committed') throw new Error('Expected committed outcome');
  return outcome;
}

function conflict(result: Result, reason: string) {
  assert.equal(result.status, 409);
  const outcome = terminal(result);
  assert.equal(outcome.kind, 'conflict');
  if (outcome.kind !== 'conflict') throw new Error('Expected conflict outcome');
  assert.equal(outcome.reason, reason);
  return outcome;
}

function next(base: Parsed, overrides: Record<string, unknown> = {}) {
  return mutation({ ...base.envelope, mutationId: randomUUID(), operation: 'update', baseRevision: '1', ...overrides });
}

async function httpServer(pool: Parameters<typeof createApp>[0], options?: Parameters<typeof createApp>[1]) {
  const server: Server = createApp(pool, options).listen(0, '127.0.0.1');
  await bounded(new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }), 'HTTP listen');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    post: async (body: string, contentType = 'application/json') => {
      const response = await fetch(`${url}/mutations`, {
        method: 'POST', headers: { 'content-type': contentType }, body, signal: AbortSignal.timeout(10_000),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
  };
}

test('environment: real PostgreSQL records durability and isolation settings', async (t) => {
  const { pool } = await fixture(t);
  const version = await pool.query<{ version: string }>('SELECT version()');
  const settings = await pool.query<{ name: string; setting: string }>(
    "SELECT name, setting FROM pg_settings WHERE name IN ('fsync','synchronous_commit','full_page_writes','default_transaction_isolation') ORDER BY name",
  );
  assert.equal(settings.rows.find((row) => row.name === 'fsync')?.setting, 'on');
  assert.equal(settings.rows.find((row) => row.name === 'synchronous_commit')?.setting, 'on');
  t.diagnostic(JSON.stringify({ database: version.rows[0]?.version, settings: settings.rows }));
});

test('create stores revision 1 and a durable complete success receipt', async (t) => {
  const { pool } = await fixture(t);
  const request = mutation();
  const result = await processMutation(pool, request);
  assert.equal(committed(result).committedRevision, '1');
  assert.equal(committed(result).record.deleted, false);
  assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
  const stored = await pool.query('SELECT * FROM processed_mutations WHERE mutation_id=$1', [request.envelope.mutationId]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].canonical_request, request.canonical);
  assert.equal(stored.rows[0].fingerprint, request.fingerprint);
  assert.equal(stored.rows[0].outcome, 'committed');
  assert.equal(stored.rows[0].http_status, 200);
  assert.deepEqual(stored.rows[0].response, result.body);
});

test('update and sequential identical replay advance exactly once; equivalent JSON replays', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  const update = next(initial, { payload: { title: 'Updated', status: 'complete', notes: 'New notes' } });
  const first = await processMutation(pool, update);
  const replay = await processMutation(pool, update);
  assert.equal(committed(first).committedRevision, '2');
  assert.deepEqual(terminal(replay), terminal(first));
  assert.equal(replayed(replay), true);
  assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
  assert.equal(await receiptCount(pool, update.envelope.mutationId), 1);
  const { parseMutation } = await import('../src/contracts.js');
  const reversed = Object.fromEntries(Object.entries(update.envelope).reverse());
  const equivalent = parseMutation(JSON.stringify(reversed, null, 2));
  assert.deepEqual(terminal(await processMutation(pool, equivalent)), terminal(first));
});

test('no-change update still advances revision exactly once', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  assert.equal(committed(await processMutation(pool, next(initial))).committedRevision, '2');
});

test('same ID rejects each changed immutable envelope field with no new effect', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  const update = next(initial);
  const original = await processMutation(pool, update);
  const variations: Record<string, unknown>[] = [
    { payload: { title: 'Different', status: 'open', notes: 'Synthetic test fixture' } },
    { operation: 'delete', payload: null },
    { recordId: randomUUID() },
    { clientId: randomUUID() },
    { baseRevision: '2' },
  ];
  for (const variation of variations) {
    const changed = mutation({ ...update.envelope, ...variation });
    const collision = await processMutation(pool, changed);
    assert.equal(collision.status, 409);
    assert.ok('error' in collision.body);
    assert.equal(collision.body.error.code, 'mutation_identity_collision');
  }
  assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
  assert.equal(await receiptCount(pool), 2);
  assert.deepEqual(terminal(await processMutation(pool, update)), terminal(original));
});

test('F2 concurrent same-ID requests block on independent PostgreSQL connections then replay', async (t) => {
  const { pool, admin } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  const update = next(initial);
  const ownerSeen = deferred<Context>();
  const waiterSeen = deferred<Context>();
  const release = deferred<void>();
  const owner = processMutation(pool, update, { on: async (event, context) => {
    if (event === 'after_receipt_claim_before_record') { ownerSeen.resolve(context); await release.promise; }
  } });
  let waiter: Promise<Result> | undefined;
  try {
    const first = await bounded(ownerSeen.promise, 'owner claim');
    waiter = processMutation(pool, update, { on: async (event, context) => {
      if (event === 'before_receipt_claim') waiterSeen.resolve(context);
    } });
    const second = await bounded(waiterSeen.promise, 'waiter connection');
    assert.notEqual(first.backendPid, second.backendPid);
    await blockedBy(admin, second.backendPid, first.backendPid);
    release.resolve();
    const [applied, replayed] = await Promise.all([owner, waiter]);
    assert.equal(committed(applied).committedRevision, '2');
    assert.deepEqual(terminal(replayed), terminal(applied));
    assert.equal('replayed' in replayed.body && replayed.body.replayed, true);
    assert.equal(await receiptCount(pool, update.envelope.mutationId), 1);
    assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
    t.diagnostic(`Observed duplicate backend ${second.backendPid} blocked by owner ${first.backendPid}; one receipt and revision 2.`);
  } finally {
    release.resolve();
    await Promise.allSettled([owner, ...(waiter ? [waiter] : [])]);
  }
});

test('F2 waiting duplicate becomes processor when initial claim owner rolls back', async (t) => {
  const { pool, admin } = await fixture(t);
  const request = mutation();
  const ownerSeen = deferred<Context>();
  const waiterSeen = deferred<Context>();
  const release = deferred<void>();
  const owner = processMutation(pool, request, { on: async (event, context) => {
    if (event === 'after_receipt_claim_before_record') {
      ownerSeen.resolve(context); await release.promise; throw new Error('controlled owner rollback');
    }
  } });
  const ownerFailure = assert.rejects(owner, /controlled owner rollback/);
  let waiter: Promise<Result> | undefined;
  try {
    const first = await bounded(ownerSeen.promise, 'owner claim');
    waiter = processMutation(pool, request, { on: async (event, context) => {
      if (event === 'before_receipt_claim') waiterSeen.resolve(context);
    } });
    const second = await bounded(waiterSeen.promise, 'waiting duplicate connection');
    await blockedBy(admin, second.backendPid, first.backendPid);
    release.resolve();
    await ownerFailure;
    const result = await waiter;
    assert.equal(committed(result).committedRevision, '1');
    assert.equal(replayed(result), false);
    assert.equal(await receiptCount(pool), 1);
    assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
  } finally {
    release.resolve();
    await Promise.allSettled([ownerFailure, ...(waiter ? [waiter] : [])]);
  }
});

test('F2 concurrent changed-envelope contender collides after owner commits', async (t) => {
  const { pool, admin } = await fixture(t);
  const request = mutation();
  const changed = mutation({ ...request.envelope, clientId: randomUUID() });
  const ownerSeen = deferred<Context>();
  const waiterSeen = deferred<Context>();
  const release = deferred<void>();
  const owner = processMutation(pool, request, { on: async (event, context) => {
    if (event === 'after_receipt_claim_before_record') { ownerSeen.resolve(context); await release.promise; }
  } });
  let waiter: Promise<Result> | undefined;
  try {
    const first = await bounded(ownerSeen.promise, 'owner claim');
    waiter = processMutation(pool, changed, { on: async (event, context) => {
      if (event === 'before_receipt_claim') waiterSeen.resolve(context);
    } });
    const second = await bounded(waiterSeen.promise, 'changed-envelope contender');
    await blockedBy(admin, second.backendPid, first.backendPid);
    release.resolve();
    committed(await owner);
    const collision = await waiter;
    assert.ok('error' in collision.body);
    assert.equal(collision.body.error.code, 'mutation_identity_collision');
    assert.equal(await receiptCount(pool), 1);
    assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
  } finally {
    release.resolve();
    await Promise.allSettled([owner, ...(waiter ? [waiter] : [])]);
  }
});

for (const winnerIndex of [0, 1]) {
  test(`F8 distinct same-base mutations serialize on row; winner index ${winnerIndex}`, async (t) => {
    const { pool, admin } = await fixture(t);
    const initial = mutation();
    await processMutation(pool, initial);
    const requests = [next(initial, { payload: { title: 'A', status: 'open', notes: 'A' } }), next(initial, { payload: { title: 'B', status: 'open', notes: 'B' } })];
    const winnerRequest = requests[winnerIndex]!;
    const loserRequest = requests[1 - winnerIndex]!;
    const ownerSeen = deferred<Context>();
    const loserSeen = deferred<Context>();
    const release = deferred<void>();
    const winner = processMutation(pool, winnerRequest, { on: async (event, context) => {
      if (event === 'after_record_write_before_commit') { ownerSeen.resolve(context); await release.promise; }
    } });
    let loser: Promise<Result> | undefined;
    try {
      const owner = await bounded(ownerSeen.promise, 'winner row write');
      loser = processMutation(pool, loserRequest, { on: async (event, context) => {
        if (event === 'before_record_lock') loserSeen.resolve(context);
      } });
      const contender = await bounded(loserSeen.promise, 'loser before row lock');
      assert.notEqual(owner.backendPid, contender.backendPid);
      await blockedBy(admin, contender.backendPid, owner.backendPid);
      release.resolve();
      assert.equal(committed(await winner).committedRevision, '2');
      assert.equal(conflict(await loser, 'stale_revision').remoteAtDecision?.revision, '2');
      assert.equal((await record(pool, initial.envelope.recordId))?.title, winnerRequest.envelope.payload?.title);
      assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
      assert.equal(await receiptCount(pool), 3);
    } finally {
      release.resolve();
      await Promise.allSettled([winner, ...(loser ? [loser] : [])]);
    }
  });
}

test('F3 reversed arrival order accepts delivered-first request and records stale loser', async (t) => {
  const { pool } = await fixture(t);
  for (const delayedIndex of [0, 1]) {
    const initial = mutation();
    await processMutation(pool, initial);
    const requests = [next(initial), next(initial)];
    const stopped = deferred<void>();
    const release = deferred<void>();
    const delayed = processMutation(pool, requests[delayedIndex]!, { on: async (event) => {
      if (event === 'before_record_lock') { stopped.resolve(); await release.promise; }
    } });
    try {
      await bounded(stopped.promise, 'earlier request delivery gate');
      const firstDelivered = await processMutation(pool, requests[1 - delayedIndex]!);
      assert.equal(committed(firstDelivered).committedRevision, '2');
      release.resolve();
      conflict(await delayed, 'stale_revision');
      assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
    } finally { release.resolve(); await Promise.allSettled([delayed]); }
  }
});

test('F7 terminal stale conflict replays original snapshot after further legitimate update', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  await processMutation(pool, next(initial));
  const stale = next(initial);
  const first = await processMutation(pool, stale);
  assert.equal(conflict(first, 'stale_revision').remoteAtDecision?.revision, '2');
  await processMutation(pool, next(initial, { baseRevision: '2' }));
  const replay = await processMutation(pool, stale);
  assert.equal(replay.status, 409);
  assert.equal(replayed(replay), true);
  assert.deepEqual(terminal(replay), terminal(first));
  assert.equal((await record(pool, initial.envelope.recordId))?.revision, '3');
  assert.equal(await receiptCount(pool, stale.envelope.mutationId), 1);
});

test('historical success replay returns old revision without rolling newest authoritative state back', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  const first = await processMutation(pool, initial);
  await processMutation(pool, next(initial, { payload: { title: 'Newest', status: 'complete', notes: 'Keep this' } }));
  const replay = await processMutation(pool, initial);
  assert.equal(replayed(replay), true);
  assert.deepEqual(terminal(replay), terminal(first));
  assert.equal(committed(replay).committedRevision, '1');
  assert.equal((await record(pool, initial.envelope.recordId))?.revision, '2');
  assert.equal((await record(pool, initial.envelope.recordId))?.title, 'Newest');
});

test('delete retains tombstone; identical delete replays; new matching/stale deletes and update/create cannot resurrect', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  const deletion = next(initial, { operation: 'delete', payload: null });
  const first = await processMutation(pool, deletion);
  assert.equal(committed(first).committedRevision, '2');
  assert.equal(committed(first).record.deleted, true);
  assert.deepEqual(terminal(await processMutation(pool, deletion)), terminal(first));
  conflict(await processMutation(pool, next(initial)), 'record_deleted');
  conflict(await processMutation(pool, next(initial, { operation: 'delete', payload: null })), 'record_deleted');
  conflict(await processMutation(pool, next(initial, { operation: 'delete', payload: null, baseRevision: '2' })), 'record_deleted');
  conflict(await processMutation(pool, mutation({ ...initial.envelope, mutationId: randomUUID() })), 'record_deleted');
  const tombstone = await record(pool, initial.envelope.recordId);
  assert.equal(tombstone?.revision, '2');
  assert.equal(tombstone?.deleted, true);
  assert.equal(tombstone?.notes, initial.envelope.payload?.notes);
});

test('missing update/delete yield replayable record_missing receipts without creating records', async (t) => {
  const { pool } = await fixture(t);
  for (const operation of ['update', 'delete']) {
    const request = mutation({ operation, baseRevision: '1', ...(operation === 'delete' ? { payload: null } : {}) });
    const first = await processMutation(pool, request);
    assert.equal(conflict(first, 'record_missing').remoteAtDecision, null);
    assert.deepEqual(terminal(await processMutation(pool, request)), terminal(first));
    assert.equal(await record(pool, request.envelope.recordId), undefined);
  }
  assert.equal(await receiptCount(pool), 2);
});

test('concurrent distinct-ID creates on one absent record yield one record and one record_exists receipt', async (t) => {
  const { pool, admin } = await fixture(t);
  const firstRequest = mutation();
  const secondRequest = mutation({ recordId: firstRequest.envelope.recordId });
  const ownerSeen = deferred<Context>();
  const waiterSeen = deferred<Context>();
  const release = deferred<void>();
  const owner = processMutation(pool, firstRequest, { on: async (event, context) => {
    if (event === 'after_record_write_before_commit') { ownerSeen.resolve(context); await release.promise; }
  } });
  let contender: Promise<Result> | undefined;
  try {
    const ownerContext = await bounded(ownerSeen.promise, 'first create write');
    contender = processMutation(pool, secondRequest, { on: async (event, context) => {
      if (event === 'before_receipt_claim') waiterSeen.resolve(context);
    } });
    const waiterContext = await bounded(waiterSeen.promise, 'second create connection');
    await blockedBy(admin, waiterContext.backendPid, ownerContext.backendPid);
    release.resolve();
    assert.equal(committed(await owner).committedRevision, '1');
    assert.equal(conflict(await contender, 'record_exists').remoteAtDecision?.revision, '1');
    assert.equal((await record(pool, firstRequest.envelope.recordId))?.revision, '1');
    assert.equal(await receiptCount(pool), 2);
  } finally { release.resolve(); await Promise.allSettled([owner, ...(contender ? [contender] : [])]); }
});

test('F6 simulated pre-commit exception rolls back provisional row and receipt; retry executes safely', async (t) => {
  const { pool } = await fixture(t);
  const request = mutation();
  await assert.rejects(processMutation(pool, request, { on: async (event) => {
    if (event === 'after_record_write_before_commit') throw new Error('simulated failure before commit');
  } }), /simulated failure before commit/);
  assert.equal(await record(pool, request.envelope.recordId), undefined);
  assert.equal(await receiptCount(pool, request.envelope.mutationId), 0);
  assert.equal(committed(await processMutation(pool, request)).committedRevision, '1');
});

test('F1/F6 controlled after-commit exception gives transient HTTP failure but replay is original success', async (t) => {
  const { pool } = await fixture(t);
  const request = mutation();
  let inject = true;
  const server = await httpServer(pool, { hooks: { on: async (event) => {
    if (event === 'after_commit_before_response' && inject) { inject = false; throw new Error('simulated response-boundary failure'); }
  } } });
  try {
    const failed = await server.post(request.canonical);
    assert.equal(failed.status, 500);
    assert.ok('error' in failed.body);
    assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
    assert.equal(await receiptCount(pool, request.envelope.mutationId), 1);
    const intervening = next(request, { payload: { title: 'Newer after lost acknowledgment', status: 'complete', notes: 'Keep newer server state' } });
    assert.equal(committed(await processMutation(pool, intervening)).committedRevision, '2');
    const replay = await server.post(request.canonical);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    const originalOutcome = replay.body.outcome as { committedRevision: string; record: { revision: string; title: string } };
    assert.equal(originalOutcome.committedRevision, '1');
    assert.equal(originalOutcome.record.revision, '1');
    assert.equal(originalOutcome.record.title, request.envelope.payload?.title);
    assert.equal((await record(pool, request.envelope.recordId))?.revision, '2');
    assert.equal((await record(pool, request.envelope.recordId))?.title, 'Newer after lost acknowledgment');
    assert.equal(await receiptCount(pool, request.envelope.mutationId), 1);
    t.diagnostic('Controlled exception after COMMIT; not a process restart or socket-drop simulation. Real restart covered separately.');
  } finally { await server.close(); }
});

test('database enforces positive revisions/status constraints and terminal receipt immutability', async (t) => {
  const { pool } = await fixture(t);
  const request = mutation();
  await processMutation(pool, request);
  const checkViolation = (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, '23514');
    return true;
  };
  await assert.rejects(pool.query('UPDATE inspections SET revision=0 WHERE id=$1', [request.envelope.recordId]), checkViolation);
  await assert.rejects(pool.query("UPDATE inspections SET status='unknown' WHERE id=$1", [request.envelope.recordId]), checkViolation);
  await assert.rejects(pool.query("UPDATE inspections SET title='' WHERE id=$1", [request.envelope.recordId]), checkViolation);
  await assert.rejects(pool.query('UPDATE processed_mutations SET response=$2::jsonb WHERE mutation_id=$1', [request.envelope.mutationId, '{}']), checkViolation);
  await assert.rejects(pool.query('UPDATE processed_mutations SET canonical_request=canonical_request WHERE mutation_id=$1', [request.envelope.mutationId]), checkViolation);
  assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
  assert.equal((await record(pool, request.envelope.recordId))?.status, 'open');
  assert.equal(await receiptCount(pool), 1);
});

test('revision overflow is a real database error, rolls back receipt, and is not a terminal conflict', async (t) => {
  const { pool } = await fixture(t);
  const initial = mutation();
  await processMutation(pool, initial);
  await pool.query('UPDATE inspections SET revision=$1 WHERE id=$2', ['9223372036854775807', initial.envelope.recordId]);
  const request = next(initial, { baseRevision: '9223372036854775807' });
  await assert.rejects(processMutation(pool, request), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, '22003');
    return true;
  });
  assert.equal(await receiptCount(pool, request.envelope.mutationId), 0);
  assert.equal((await record(pool, initial.envelope.recordId))?.revision, '9223372036854775807');
  const server = await httpServer(pool);
  try {
    const response = await server.post(request.canonical);
    assert.equal(response.status, 500);
    assert.ok('error' in response.body);
    assert.ok(!('outcome' in response.body));
    assert.equal(await receiptCount(pool, request.envelope.mutationId), 0);
  } finally { await server.close(); }
});

test('database rejects COMMIT of incomplete receipt claims rather than leaving permanent pending rows', async (t) => {
  const { pool } = await fixture(t);
  const request = mutation();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO processed_mutations
       (mutation_id,protocol_version,client_id,record_id,operation,base_revision,canonical_request,fingerprint)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7)`,
      [request.envelope.mutationId, request.envelope.clientId, request.envelope.recordId,
        request.envelope.operation, request.envelope.baseRevision, request.canonical, request.fingerprint],
    );
    await assert.rejects(client.query('COMMIT'));
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.equal(await receiptCount(pool, request.envelope.mutationId), 0);
  assert.equal(committed(await processMutation(pool, request)).committedRevision, '1');
});

test('parallel different-record writes progress while an unrelated transaction holds its row lock', async (t) => {
  const { pool } = await fixture(t);
  const a = mutation();
  const b = mutation();
  await processMutation(pool, a);
  await processMutation(pool, b);
  const stopped = deferred<void>();
  const release = deferred<void>();
  const held = processMutation(pool, next(a), { on: async (event) => {
    if (event === 'after_record_write_before_commit') { stopped.resolve(); await release.promise; }
  } });
  try {
    await bounded(stopped.promise, 'first record lock');
    const independent = await bounded(processMutation(pool, next(b)), 'independent record completion while first remains held');
    assert.equal(committed(independent).committedRevision, '2');
    assert.equal((await record(pool, a.envelope.recordId))?.revision, '1');
    assert.equal((await record(pool, b.envelope.recordId))?.revision, '2');
  } finally { release.resolve(); await held; }
});

test('HTTP rejects invalid/malformed/media/oversized input before receipt admission; no read API added early', async (t) => {
  const { pool } = await fixture(t);
  const server = await httpServer(pool);
  try {
    const valid = mutation();
    const invalidCases: [string, string, number, string][] = [
      ['{', 'application/json', 400, 'invalid_json'],
      ['{"protocolVersion":1,"protocolVersion":1}', 'application/json', 400, 'invalid_json'],
      [JSON.stringify({ ...valid.envelope, extra: true }), 'application/json', 422, 'invalid_envelope'],
      [valid.canonical, 'text/plain', 415, 'unsupported_media_type'],
      [' '.repeat(65_537), 'application/json', 413, 'body_too_large'],
    ];
    for (const [body, contentType, status, code] of invalidCases) {
      const response = await server.post(body, contentType);
      assert.equal(response.status, status);
      const error = response.body.error as { code: string };
      assert.equal(error.code, code);
    }
    assert.equal(await receiptCount(pool), 0);
    assert.equal((await fetch(`${server.url}/inspections`)).status, 200);
    assert.equal((await fetch(`${server.url}/health`)).status, 404);
    const accepted = await server.post(valid.canonical);
    assert.equal(accepted.status, 200);
  } finally { await server.close(); }
});

test('HTTP rejects invalid UTF8/BOM/charset/encoding/origin before admission; normal app exposes no fault controls', async (t) => {
  const { pool } = await fixture(t);
  const server = await httpServer(pool);
  try {
    const valid = mutation();
    const invalid: { body: string | Uint8Array; headers: Record<string, string>; status: number; code: string }[] = [
      { body: new Uint8Array([0xff]), headers: { 'content-type': 'application/json' }, status: 400, code: 'invalid_json' },
      { body: '\ufeff' + valid.canonical, headers: { 'content-type': 'application/json' }, status: 400, code: 'invalid_json' },
      { body: valid.canonical, headers: { 'content-type': 'application/json; charset=utf-16' }, status: 415, code: 'unsupported_media_type' },
      { body: valid.canonical, headers: { 'content-type': 'application/json; charset="utf-8' }, status: 415, code: 'unsupported_media_type' },
      { body: valid.canonical, headers: { 'content-type': 'application/json; charset=utf-8"' }, status: 415, code: 'unsupported_media_type' },
      { body: valid.canonical, headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, status: 415, code: 'unsupported_media_type' },
      { body: valid.canonical, headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' }, status: 403, code: 'origin_not_allowed' },
    ];
    for (const fixture of invalid) {
      const response = await fetch(`${server.url}/mutations`, {
        method: 'POST', headers: fixture.headers, body: fixture.body as BodyInit, signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, fixture.status);
      assert.equal(((await response.json()) as { error: { code: string } }).error.code, fixture.code);
    }
    assert.equal(await receiptCount(pool), 0);
    for (const path of ['/__fault', '/__test/checkpoint', '/test/release']) {
      const response = await fetch(`${server.url}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 404);
    }
    const accepted = await fetch(`${server.url}/mutations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset="utf-8"', origin: 'http://localhost:5173', 'x-syncproof-test-event': 'after_commit_before_response' },
      body: valid.canonical, signal: AbortSignal.timeout(10_000),
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(await receiptCount(pool), 1);
  } finally { await server.close(); }
});
