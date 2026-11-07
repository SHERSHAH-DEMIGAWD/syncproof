import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { createPool, migrate } from '../src/db.js';
import { parseMutation } from '../src/contracts.js';

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function bounded<T>(promise: Promise<T>, label: string, timeout = 15_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeout); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function mutation(overrides: Record<string, unknown> = {}) {
  return parseMutation(JSON.stringify({
    protocolVersion: 1,
    mutationId: randomUUID(),
    clientId: randomUUID(),
    recordId: randomUUID(),
    operation: 'create',
    baseRevision: null,
    payload: { title: 'Pump inspection', status: 'open', notes: 'Synthetic test fixture' },
    ...overrides,
  }));
}

export async function fixture(t: TestContext) {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required: these integration tests require real PostgreSQL.');
  const schema = `syncproof_test_${randomUUID().replaceAll('-', '')}`;
  const admin = createPool(databaseUrl);
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = createPool(databaseUrl, schema);
    await migrate(pool);
  } catch (error) {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.end();
    throw error;
  }
  const testPool = pool;
  t.after(async () => {
    await testPool.end();
    // The name is generated here, never supplied by a caller or environment variable.
    if (!/^syncproof_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema cleanup target');
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  return { pool: testPool, admin, schema, databaseUrl };
}

export async function blockedBy(admin: Pool, waiter: number, owner: number): Promise<void> {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const result = await admin.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [waiter]);
    if (result.rows[0]?.blockers.includes(owner)) return;
    // Yield to I/O; actual PostgreSQL lock observation, not a sleep, selects the schedule.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`PostgreSQL backend ${waiter} did not block on backend ${owner}`);
}

export async function record(pool: Pool, id: string) {
  const result = await pool.query<{
    id: string; title: string; status: string; notes: string; revision: string; deleted: boolean;
  }>('SELECT id, title, status, notes, revision::text, deleted FROM inspections WHERE id = $1', [id]);
  return result.rows[0];
}

export async function receiptCount(pool: Pool, mutationId?: string): Promise<number> {
  const result = mutationId
    ? await pool.query<{ count: string }>('SELECT count(*)::text FROM processed_mutations WHERE mutation_id = $1', [mutationId])
    : await pool.query<{ count: string }>('SELECT count(*)::text FROM processed_mutations');
  return Number(result.rows[0]?.count);
}
