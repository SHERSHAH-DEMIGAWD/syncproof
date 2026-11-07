import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { Pool } from 'pg';
import { InputError, parseMutation } from './contracts.js';
import { processMutation } from './mutations.js';
import type { MutationHooks } from './mutations.js';

export function createApp(pool: Pool, options: { hooks?: MutationHooks; allowedOrigin?: string } = {}): express.Express {
  const app = express();
  const allowedOrigin = options.allowedOrigin ?? 'http://localhost:5173';
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.headers.origin) {
      if (request.headers.origin !== allowedOrigin) {
        response.status(403).json({ error: { code: 'origin_not_allowed', message: 'Only the configured local origin is allowed' } });
        return;
      }
      response.set('Access-Control-Allow-Origin', allowedOrigin);
      response.set('Vary', 'Origin');
    }
    next();
  });
  app.get('/inspections', async (_request, response) => {
    const result = await pool.query('SELECT id,title,status,notes,revision::text AS revision,deleted FROM inspections ORDER BY id');
    response.json({ protocolVersion: 1, complete: true, recordCount: result.rows.length, records: result.rows });
  });
  app.options('/mutations', (_request, response) => {
    response.set('Access-Control-Allow-Methods', 'POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.sendStatus(204);
  });
  app.post('/mutations', (request, response, next) => {
    const mediaType = request.headers['content-type'] ?? '';
    const encoding = request.headers['content-encoding'];
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(mediaType)
        || (encoding !== undefined && encoding.toLowerCase() !== 'identity')) {
      response.status(415).json({ error: { code: 'unsupported_media_type', message: 'Use uncompressed application/json encoded as UTF-8' } });
      return;
    }
    next();
  }, express.raw({ type: () => true, limit: 65536, inflate: false }), async (request, response) => {
    let text: string;
    try {
      // Preserve BOM as input (JSON then rejects it); never replace invalid
      // UTF-8 with a different string before canonicalization.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(request.body as Buffer | undefined);
    } catch {
      throw new InputError(400, 'invalid_json', 'Request must contain valid UTF-8 JSON');
    }
    const parsed = parseMutation(text);
    const result = await processMutation(pool, parsed, options.hooks);
    response.status(result.status).json(result.body);
  });
  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } });
  });
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof InputError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'body_too_large', message: 'Maximum request body is 64 KiB' } });
      return;
    }
    // Do not turn an internal/uncertain database or post-commit transport error
    // into a terminal conflict. Do not expose SQL, credentials, or stack traces.
    response.status(500).json({ error: { code: 'server_error', message: 'Outcome not established by this response; retry the same mutation ID' } });
  };
  app.use(errors);
  return app;
}
