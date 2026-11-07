import 'fake-indexeddb/auto';
import { LocalStore } from '../client/lib/storage.js';
import { evidence } from './audit-evidence.js';
import type { MutationResponse } from '../client/lib/contract.js';
import assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { bounded, deferred, fixture, mutation, receiptCount, record } from './helpers.js';

interface Checkpoint {
  type: 'checkpoint';
  event: string;
  mutationId: string;
  backendPid: number;
}

async function launch(databaseUrl: string, schema: string, heldEvent?: string, heldMutation?: string) {
  const ready = deferred<{ port: number; pid: number }>();
  const checkpoint = deferred<Checkpoint>();
  const exit = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
  const child: ChildProcess = fork(fileURLToPath(new URL('../src/server.js', import.meta.url)), [], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SYNCPROOF_DB_SCHEMA: schema,
      PORT: '0',
      NODE_ENV: 'test',
      SYNCPROOF_TEST_PROCESS: '1',
    },
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout?.on('data', (data: Buffer) => { output = (output + data.toString()).slice(-4_000); });
  child.stderr?.on('data', (data: Buffer) => { output = (output + data.toString()).slice(-4_000); });
  child.on('error', (error) => ready.reject(error));
  child.on('exit', (code, signal) => {
    exit.resolve({ code, signal });
    ready.reject(new Error(`Server exited before readiness (code=${code}, signal=${signal}). ${output}`));
  });
  child.on('message', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as Record<string, unknown>;
    if (message.type === 'ready' && typeof message.port === 'number' && typeof message.pid === 'number') {
      ready.resolve({ port: message.port, pid: message.pid });
    } else if (message.type === 'checkpoint') {
      const observed = message as unknown as Checkpoint;
      if (observed.event === heldEvent && observed.mutationId === heldMutation) {
        checkpoint.resolve(observed);
      } else {
        child.send({ type: 'release', event: observed.event, mutationId: observed.mutationId });
      }
    }
  });
  let started: { port: number; pid: number };
  try {
    started = await bounded(ready.promise, 'actual server IPC readiness');
  } catch (error) {
    child.kill('SIGKILL');
    await bounded(exit.promise, 'failed server exit').catch(() => undefined);
    throw error;
  }
  return {
    child,
    pid: started.pid,
    url: `http://127.0.0.1:${started.port}`,
    checkpoint: checkpoint.promise,
    kill: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      return bounded(exit.promise, 'actual server process exit');
    },
    close: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      try { await bounded(exit.promise, 'server shutdown', 3_000); }
      catch { child.kill('SIGKILL'); await bounded(exit.promise, 'forced server cleanup'); }
    },
  };
}

for (const controlPoint of ['after_record_write_before_commit', 'after_commit_before_response']) {
  test(`F6 ACTUAL Node termination/restart at ${controlPoint} preserves transaction/replay semantics`, async (t) => {
    const { pool, databaseUrl, schema } = await fixture(t);
    const local = new LocalStore('audit-process-'+crypto.randomUUID());t.after(()=>local.delete());
    const seed=mutation();await local.saveDraft(seed.envelope.recordId,{title:'Process fixture',status:'open',notes:'Same ID through server failure'},0);
    const request=await local.freeze(seed.envelope.recordId,1);await local.markAttempt(request.mutationId,Date.now());
    const server = await launch(databaseUrl, schema, controlPoint, request.envelope.mutationId);
    let restarted: Awaited<ReturnType<typeof launch>> | undefined;
    const transport = fetch(`${server.url}/mutations`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: request.canonical,
      signal: AbortSignal.timeout(20_000),
    }).then(
      (response) => ({ responded: true, status: response.status }),
      () => ({ responded: false, status: null }),
    );
    try {
      const checkpoint = await bounded(server.checkpoint, `actual ${controlPoint} checkpoint`);
      assert.equal(checkpoint.mutationId, request.envelope.mutationId);
      assert.ok(checkpoint.backendPid > 0);
      const committed = controlPoint === 'after_commit_before_response';
      assert.equal((await record(pool, request.envelope.recordId))?.revision, committed ? '1' : undefined);
      assert.equal(await receiptCount(pool, request.envelope.mutationId), committed ? 1 : 0);
      const exited = await server.kill();
      assert.equal((await local.mutations.get(request.mutationId))?.phase,'outcome_unknown');
      assert.equal((await local.mutations.get(request.mutationId))?.canonical,request.canonical);
      assert.equal((await local.work.get(request.recordId))?.activeMutationId,request.mutationId);
      assert.equal((await transport).responded, false, 'held response must be lost by actual process termination');
      restarted = await launch(databaseUrl, schema);
      assert.notEqual(restarted.pid, server.pid);
      const response = await fetch(`${restarted.url}/mutations`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: request.canonical,
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 200);
      const body = await response.json() as {
        mutationId: string; replayed: boolean; outcome: { kind: string; committedRevision: string };
      };
      assert.equal(body.mutationId, request.envelope.mutationId);
      assert.equal(body.replayed, committed);
      assert.equal(body.outcome.kind, 'committed');
      assert.equal(body.outcome.committedRevision, '1');
      assert.equal((await record(pool, request.envelope.recordId))?.revision, '1');
      assert.equal(await receiptCount(pool, request.envelope.mutationId), 1);
      await local.applyReceipt(request.mutationId,body as MutationResponse);
      assert.equal((await local.mutations.get(request.mutationId))?.phase,'acknowledged');
      assert.equal((await local.cleanRecords.get(request.recordId))?.revision,'1');
      assert.equal(await local.work.count(),0);
      await evidence(committed?'F6-postcommit':'F6-precommit',{test:t.name,actualNodeRestart:true,controlPoint,oldPid:server.pid,newPid:restarted.pid,postgresBackendAtCheckpoint:checkpoint.backendPid,oldProcessExit:exited,initialRecord:'absent',beforeKill:{recordRevision:committed?'1':null,receiptCount:committed?1:0},mutationId:request.mutationId,canonical:request.canonical,fingerprint:request.fingerprint,clientBeforeReplay:'outcome_unknown',clientAfterReplay:'acknowledged',replayed:body.replayed,finalRevision:'1',receiptCount:1,invariants:['INV-ACK-01','INV-ATOMIC-01','INV-IDEMP-01','INV-UNKNOWN-01'],limit:'Actual forced Node termination, PostgreSQL remains running; local IndexedDB uses fake-indexeddb, browser lifecycle tested separately.'});
      t.diagnostic(JSON.stringify({
        actualNodeRestart: true, controlPoint, oldPid: server.pid, newPid: restarted.pid,
        postgresBackendAtCheckpoint: checkpoint.backendPid, oldProcessExit: exited,
        responseLost: true, sameSchema: schema, replayed: body.replayed, finalRevision: '1', receiptCount: 1,
        limitation: 'Node process lifecycle only; PostgreSQL/OS/browser were not restarted.',
      }));
    } finally {
      await server.close();
      if (restarted) await restarted.close();
      await transport;
    }
  });
}

test('test process checkpoint controls refuse startup without both test environment and parent IPC', async (t) => {
  const { databaseUrl, schema } = await fixture(t);
  for (const { nodeEnv, ipc } of [{ nodeEnv: 'test', ipc: false }, { nodeEnv: 'production', ipc: true }]) {
    const exited = deferred<{ code: number | null; signal: NodeJS.Signals | null }>();
    const entry = fileURLToPath(new URL('../src/server.js', import.meta.url));
    const env = { ...process.env, DATABASE_URL: databaseUrl, SYNCPROOF_DB_SCHEMA: schema, PORT: '0', NODE_ENV: nodeEnv, SYNCPROOF_TEST_PROCESS: '1' };
    const child = ipc
      ? fork(entry, [], { env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      : spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
    child.on('error', exited.reject);
    child.on('exit', (code, signal) => exited.resolve({ code, signal }));
    try {
      const result = await bounded(exited.promise, `refused ${nodeEnv} process with IPC=${ipc}`);
      assert.notEqual(result.code, 0);
      assert.match(output, /Test process controls require NODE_ENV=test and a parent-owned IPC channel/);
      assert.doesNotMatch(output, /SyncProof listening/);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await bounded(exited.promise, 'refused process cleanup').catch(() => undefined);
    }
  }
});
