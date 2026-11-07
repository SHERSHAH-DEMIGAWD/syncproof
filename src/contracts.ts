import { createHash } from 'node:crypto';

export interface BusinessPayload {
  title: string;
  status: 'open' | 'in_progress' | 'complete';
  notes: string;
}

interface EnvelopeIdentity {
  protocolVersion: 1;
  mutationId: string;
  clientId: string;
  recordId: string;
}

export type MutationEnvelope = EnvelopeIdentity & (
  | { operation: 'create'; baseRevision: null; payload: BusinessPayload }
  | { operation: 'update'; baseRevision: string; payload: BusinessPayload }
  | { operation: 'delete'; baseRevision: string; payload: null }
);

export interface Inspection extends BusinessPayload {
  id: string;
  revision: string;
  deleted: boolean;
}

export type ConflictReason = 'record_missing' | 'record_deleted' | 'record_exists' | 'stale_revision';

export type Outcome =
  | { kind: 'committed'; committedRevision: string; record: Inspection }
  | {
      kind: 'conflict';
      reason: ConflictReason;
      expectedRevision: string | null;
      remoteAtDecision: Inspection | null;
    };

export interface MutationResponse {
  protocolVersion: 1;
  mutationId: string;
  replayed: boolean;
  outcome: Outcome;
}

export interface ParsedMutation {
  envelope: MutationEnvelope;
  canonical: string;
  fingerprint: string;
}

export class InputError extends Error {
  constructor(
    public readonly status: 400 | 422,
    public readonly code: 'invalid_json' | 'invalid_envelope',
    message: string,
  ) {
    super(message);
    this.name = 'InputError';
  }
}

/** JSON.parse alone silently discards duplicate members, including escaped aliases.
 * This parser checks each decoded member name before constructing its object.
 */
function parseUniqueJson(source: string): unknown {
  let cursor = 0;
  const invalid = (message: string): never => {
    throw new InputError(400, 'invalid_json', message);
  };
  const whitespace = (): void => {
    while (cursor < source.length && /[\t\n\r ]/.test(source[cursor]!)) cursor += 1;
  };
  const string = (): string => {
    if (source[cursor] !== '"') return invalid('Expected a JSON string.');
    const start = cursor++;
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === '"') {
        try {
          return JSON.parse(source.slice(start, cursor)) as string;
        } catch {
          return invalid('Invalid JSON string.');
        }
      }
      if (character === '\\') cursor += 1;
    }
    return invalid('Unterminated JSON string.');
  };
  const value = (): unknown => {
    whitespace();
    const first = source[cursor];
    if (first === '"') return string();
    if (first === '{') {
      cursor += 1;
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const names = new Set<string>();
      whitespace();
      if (source[cursor] === '}') { cursor += 1; return result; }
      while (true) {
        whitespace();
        const name = string();
        if (names.has(name)) return invalid('Duplicate JSON member name.');
        names.add(name);
        whitespace();
        if (source[cursor++] !== ':') return invalid('Expected a colon after member name.');
        result[name] = value();
        whitespace();
        const delimiter = source[cursor++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') return invalid('Expected an object separator.');
      }
    }
    if (first === '[') {
      cursor += 1;
      const result: unknown[] = [];
      whitespace();
      if (source[cursor] === ']') { cursor += 1; return result; }
      while (true) {
        result.push(value());
        whitespace();
        const delimiter = source[cursor++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') return invalid('Expected an array separator.');
      }
    }
    for (const [token, literal] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(token, cursor)) { cursor += token.length; return literal; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(cursor));
    if (number) { cursor += number[0].length; return Number(number[0]); }
    return invalid('Expected a JSON value.');
  };
  let parsed: unknown;
  try {
    parsed = value();
  } catch (error) {
    if (error instanceof InputError) throw error;
    // A deeply nested invalid envelope may exhaust the parser stack; never leak
    // that exception as a database/internal error or admit a partial parse.
    return invalid('Invalid or excessively nested JSON.');
  }
  whitespace();
  if (cursor !== source.length) return invalid('Unexpected content after JSON value.');
  return parsed;
}

const envelopeFields = ['protocolVersion', 'mutationId', 'clientId', 'recordId', 'operation', 'baseRevision', 'payload'] as const;
const payloadFields = ['title', 'status', 'notes'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const maximumRevision = 9_223_372_036_854_775_807n;

function invalidEnvelope(message: string): never {
  throw new InputError(422, 'invalid_envelope', message);
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidEnvelope(`${label} must be an object.`);
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    return invalidEnvelope(`${label} must contain exactly: ${fields.join(', ')}.`);
  }
  return object;
}

function scalarString(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') return invalidEnvelope(`${label} must be a string.`);
  let length = 0;
  for (const scalar of value) {
    const point = scalar.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) return invalidEnvelope(`${label} contains an unpaired surrogate.`);
    // PostgreSQL text/jsonb cannot represent U+0000. Reject it before admission
    // rather than turn a deterministic input problem into a database failure.
    if (point === 0) return invalidEnvelope(`${label} cannot contain U+0000.`);
    length += 1;
  }
  if (length < minimum || length > maximum) return invalidEnvelope(`${label} has invalid Unicode scalar length.`);
  return value;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) return invalidEnvelope(`${label} must be a canonical lowercase UUID.`);
  return value;
}

function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > maximumRevision) {
    return invalidEnvelope('baseRevision must be a positive decimal BIGINT string without leading zeros.');
  }
  return value;
}

function businessPayload(value: unknown): BusinessPayload {
  const object = exactObject(value, payloadFields, 'payload');
  const title = scalarString(object.title, 'payload.title', 1, 200);
  if (!/\S/u.test(title)) return invalidEnvelope('payload.title must contain a non-whitespace character.');
  const status = object.status;
  if (status !== 'open' && status !== 'in_progress' && status !== 'complete') {
    return invalidEnvelope('payload.status must be open, in_progress, or complete.');
  }
  const notes = scalarString(object.notes, 'payload.notes', 0, 8_000);
  return { title, status, notes };
}

/** Validate first, then reconstruct the specified member order. Input property
 * ordering never participates in mutation identity. No strings are normalized.
 */
export function parseMutation(source: string): ParsedMutation {
  const object = exactObject(parseUniqueJson(source), envelopeFields, 'envelope');
  if (object.protocolVersion !== 1) return invalidEnvelope('protocolVersion must be integer 1.');
  const common: EnvelopeIdentity = {
    protocolVersion: 1,
    mutationId: identity(object.mutationId, 'mutationId'),
    clientId: identity(object.clientId, 'clientId'),
    recordId: identity(object.recordId, 'recordId'),
  };
  let envelope: MutationEnvelope;
  if (object.operation === 'create') {
    if (object.baseRevision !== null) return invalidEnvelope('Create requires baseRevision=null.');
    envelope = { ...common, operation: 'create', baseRevision: null, payload: businessPayload(object.payload) };
  } else if (object.operation === 'update') {
    envelope = { ...common, operation: 'update', baseRevision: revision(object.baseRevision), payload: businessPayload(object.payload) };
  } else if (object.operation === 'delete') {
    if (object.payload !== null) return invalidEnvelope('Delete requires payload=null.');
    envelope = { ...common, operation: 'delete', baseRevision: revision(object.baseRevision), payload: null };
  } else {
    return invalidEnvelope('operation must be create, update, or delete.');
  }
  const canonical = JSON.stringify(envelope);
  const fingerprint = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { envelope, canonical, fingerprint };
}
