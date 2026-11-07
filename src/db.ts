import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

export function createPool(databaseUrl: string, schema = 'public'): pg.Pool {
  // Identifiers cannot be query parameters. Only this validated identifier is
  // interpolated; all business values use parameters.
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 12,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    application_name: 'syncproof',
    options: `-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=10000`,
  });
}

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const encoding = await client.query<{ server_encoding: string }>('SHOW server_encoding');
    if (encoding.rows[0]?.server_encoding !== 'UTF8') throw new Error('SyncProof requires a UTF8 PostgreSQL database');
    // Migration-only lock, scoped by database and schema. Request processing
    // uses no global/advisory locks.
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    const directory = fileURLToPath(new URL('../../migrations/', import.meta.url));
    const versions = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const version of versions) {
      const sql = await readFile(resolve(directory, version), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${version}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version,checksum) VALUES ($1,$2)', [version, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = createPool(url, process.env.SYNCPROOF_DB_SCHEMA);
  try {
    await migrate(pool);
    process.stdout.write('Migrations applied.\n');
  } finally {
    await pool.end();
  }
}
