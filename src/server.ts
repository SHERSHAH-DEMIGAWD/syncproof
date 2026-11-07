import { createApp } from './app.js';
import { createPool } from './db.js';
import type { Checkpoint, MutationHooks } from './mutations.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; see .env.example');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
const originUrl = new URL(allowedOrigin);
if (!['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname)
    || originUrl.protocol !== 'http:' || originUrl.origin !== allowedOrigin) {
  throw new Error('ALLOWED_ORIGIN must be an HTTP loopback origin without a path');
}

let hooks: MutationHooks | undefined;
if (process.env.SYNCPROOF_TEST_PROCESS !== undefined) {
  if (process.env.SYNCPROOF_TEST_PROCESS !== '1' || process.env.NODE_ENV !== 'test' || !process.send) {
    throw new Error('Test process controls require NODE_ENV=test and a parent-owned IPC channel');
  }
  hooks = {
    async on(event, context) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          process.off('message', receive);
          reject(new Error('Test checkpoint release timed out'));
        }, 12000);
        function receive(message: unknown) {
          if (typeof message !== 'object' || message === null) return;
          const m = message as { type?: string; event?: Checkpoint; mutationId?: string };
          if (m.type === 'release' && m.event === event && m.mutationId === context.mutationId) {
            clearTimeout(timeout);
            process.off('message', receive);
            resolve();
          }
        }
        process.on('message', receive);
        process.send!({ type: 'checkpoint', event, ...context });
      });
    },
  };
}

const pool = createPool(databaseUrl, process.env.SYNCPROOF_DB_SCHEMA);
try {
  const encoding = await pool.query<{ server_encoding: string }>('SHOW server_encoding');
  if (encoding.rows[0]?.server_encoding !== 'UTF8') throw new Error('SyncProof requires UTF8 PostgreSQL');
  const app = createApp(pool, { allowedOrigin, ...(hooks ? { hooks } : {}) });
  const server = app.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (typeof address === 'object' && address) {
      process.stdout.write(`SyncProof listening on http://127.0.0.1:${address.port}\n`);
      process.send?.({ type: 'ready', port: address.port, pid: process.pid });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on('error', () => {
    process.stderr.write('HTTP server could not start.\n');
    void pool.end().finally(() => { process.exitCode = 1; });
  });
  const shutdown = () => {
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  await pool.end();
  process.stderr.write('Database connection failed; verify DATABASE_URL, UTF8 encoding, and migrations.\n');
  process.exitCode = 1;
}
