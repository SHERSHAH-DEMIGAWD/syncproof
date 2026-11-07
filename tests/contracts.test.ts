import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { InputError, parseMutation } from '../src/contracts.js';

const create = () => ({
  protocolVersion: 1,
  mutationId: '20000000-0000-4000-8000-000000000001',
  clientId: '10000000-0000-4000-8000-000000000001',
  recordId: '30000000-0000-4000-8000-000000000001',
  operation: 'create',
  baseRevision: null as string | null,
  payload: { title: 'Pump inspection', status: 'open', notes: '' } as Record<string, unknown> | null,
});

function rejected(value: unknown, code: 'invalid_json' | 'invalid_envelope' = 'invalid_envelope'): void {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  assert.throws(() => parseMutation(raw), (error: unknown) => {
    assert.ok(error instanceof InputError);
    assert.equal(error.code, code);
    assert.equal(error.status, code === 'invalid_json' ? 400 : 422);
    return true;
  });
}

test('canonical create has prescribed field order and SHA-256 of UTF-8 bytes', () => {
  const parsed = parseMutation(JSON.stringify(create()));
  assert.equal(parsed.canonical, JSON.stringify(create()));
  assert.equal(parsed.fingerprint, createHash('sha256').update(parsed.canonical, 'utf8').digest('hex'));
  assert.equal(parsed.fingerprint.length, 64);
  assert.deepEqual(Object.keys(parsed.envelope), ['protocolVersion', 'mutationId', 'clientId', 'recordId', 'operation', 'baseRevision', 'payload']);
});

test('different member order, whitespace and escaped equivalent scalars have one canonical identity', () => {
  const expected = create();
  expected.payload!.notes = 'café\n"\\\u0001';
  const reversed = Object.fromEntries(Object.entries(expected).reverse());
  reversed.payload = { notes: expected.payload!.notes, status: 'open', title: 'Pump inspection' };
  const equivalent = JSON.stringify(reversed, null, 2).replace('café', 'caf\\u00e9');
  assert.deepEqual(parseMutation(equivalent), parseMutation(JSON.stringify(expected)));
  assert.ok(parseMutation(equivalent).canonical.includes('café\\n\\"\\\\\\u0001'));
});

test('composed and decomposed Unicode, whitespace and business differences remain distinct', () => {
  const versions = ['é', 'e\u0301', ' é', 'é ', 'É'];
  const fingerprints = versions.map((notes) => parseMutation(JSON.stringify({ ...create(), payload: { title: 'X', status: 'open', notes } })).fingerprint);
  assert.equal(new Set(fingerprints).size, versions.length);
});

test('every immutable identity field participates in the canonical fingerprint', () => {
  const base = { ...create(), operation: 'update', baseRevision: '1' };
  const expected = parseMutation(JSON.stringify(base)).fingerprint;
  const changes = [
    { mutationId: '20000000-0000-4000-8000-000000000002' },
    { clientId: '10000000-0000-4000-8000-000000000002' },
    { recordId: '30000000-0000-4000-8000-000000000002' },
    { baseRevision: '2' },
    { operation: 'delete', payload: null },
    { payload: { title: 'Changed', status: 'open', notes: '' } },
  ];
  for (const change of changes) assert.notEqual(parseMutation(JSON.stringify({ ...base, ...change })).fingerprint, expected);
});

test('duplicate envelope member names are rejected before JSON can discard a value', () => {
  const raw = JSON.stringify(create());
  rejected(raw.replace('"protocolVersion":1', '"protocolVersion":0,"protocolVersion":1'), 'invalid_json');
  rejected(raw.replace('"mutationId":', '"mutationId":"ignored","mutationId":'), 'invalid_json');
});

test('duplicate escaped member aliases and nested payload duplicates are rejected', () => {
  const raw = JSON.stringify(create());
  rejected(raw.replace('"title":', '"ti\\u0074le":"first","title":'), 'invalid_json');
  rejected(raw.replace('"notes":""', '"notes":"first","notes":""'), 'invalid_json');
});

test('malformed JSON syntax, invalid escapes, controls, trailing tokens and trailing commas are rejected', () => {
  for (const raw of ['', '{', '[] trailing', '{"a":1,}', '[1,]', '{"x":"\\q"}', '{"x":"bad\nstring"}', 'undefined', '01', 'true false', '{"x" 1}', '"unterminated']) {
    rejected(raw, 'invalid_json');
  }
});

test('JSON primitives, arrays and non-object payloads are not envelopes', () => {
  for (const raw of ['null', 'true', '1', '"value"', '[]']) rejected(raw);
  for (const payload of [null, [], 'notes', 1, true]) rejected({ ...create(), payload });
});

test('envelope and payload fields are exact, with no defaults or unknown stripping', () => {
  for (const field of Object.keys(create())) {
    const value: Record<string, unknown> = create();
    delete value[field];
    rejected(value);
  }
  rejected({ ...create(), extra: true });
  for (const field of ['title', 'status', 'notes']) {
    const value = create();
    delete value.payload![field];
    rejected(value);
  }
  rejected({ ...create(), payload: { ...create().payload, deleted: false } });
  rejected(JSON.stringify(create()).replace('"protocolVersion":1', '"__proto__":{},"protocolVersion":1'));
});

test('protocol version is numeric 1 and never coerced', () => {
  for (const protocolVersion of [0, 2, '1', null, true, 1.5]) rejected({ ...create(), protocolVersion });
  assert.equal(parseMutation(JSON.stringify(create()).replace('"protocolVersion":1', '"protocolVersion":1e0')).envelope.protocolVersion, 1);
});

test('UUID identities must be canonical lowercase hyphenated strings', () => {
  for (const field of ['mutationId', 'clientId', 'recordId']) {
    for (const invalid of ['ABCDEF00-0000-4000-8000-000000000001', '30000000000040008000000000000001', 'not-a-uuid', '', 1, null]) {
      rejected({ ...create(), [field]: invalid });
    }
  }
});

test('create requires null base; update and delete require positive BIGINT revision strings', () => {
  rejected({ ...create(), baseRevision: '1' });
  for (const operation of ['update', 'delete']) {
    const payload = operation === 'delete' ? null : create().payload;
    for (const baseRevision of [null, 1, 0, '', '0', '-1', '01', '+1', '1.0', '1e0', ' 1', '1 ', '9223372036854775808', '999999999999999999999999']) {
      rejected({ ...create(), operation, payload, baseRevision });
    }
    for (const baseRevision of ['1', '9007199254740993', '9223372036854775807']) {
      assert.equal(parseMutation(JSON.stringify({ ...create(), operation, payload, baseRevision })).envelope.baseRevision, baseRevision);
    }
  }
});

test('delete requires explicit null payload and unknown operations are rejected', () => {
  assert.equal(parseMutation(JSON.stringify({ ...create(), operation: 'delete', baseRevision: '2', payload: null })).envelope.operation, 'delete');
  rejected({ ...create(), operation: 'delete', baseRevision: '2' });
  for (const operation of ['upsert', 'CREATE', '', null, 1]) rejected({ ...create(), operation });
});

test('business field validation rejects wrong types and unsupported statuses', () => {
  for (const title of [null, 1, true, [], {}]) rejected({ ...create(), payload: { title, status: 'open', notes: '' } });
  for (const notes of [null, 1, true, [], {}]) rejected({ ...create(), payload: { title: 'X', status: 'open', notes } });
  for (const status of [null, 1, 'closed', 'OPEN', '']) rejected({ ...create(), payload: { title: 'X', status, notes: '' } });
  for (const status of ['open', 'in_progress', 'complete']) assert.equal(parseMutation(JSON.stringify({ ...create(), payload: { title: 'X', status, notes: '' } })).envelope.payload?.status, status);
});

test('title requires a non-whitespace scalar and no input trimming occurs', () => {
  for (const title of ['', ' ', '\t\n\r', '\u2003\u00a0']) rejected({ ...create(), payload: { title, status: 'open', notes: '' } });
  const parsed = parseMutation(JSON.stringify({ ...create(), payload: { title: '  X  ', status: 'open', notes: '  notes\n' } }));
  assert.equal(parsed.envelope.payload?.title, '  X  ');
  assert.equal(parsed.envelope.payload?.notes, '  notes\n');
});

test('length limits count Unicode scalars rather than UTF-16 code units', () => {
  const valid = { ...create(), payload: { title: '🧪'.repeat(200), status: 'open', notes: '🧪'.repeat(8_000) } };
  assert.equal(parseMutation(JSON.stringify(valid)).envelope.payload?.title, valid.payload.title);
  rejected({ ...valid, payload: { ...valid.payload, title: '🧪'.repeat(201) } });
  rejected({ ...valid, payload: { ...valid.payload, notes: '🧪'.repeat(8_001) } });
});

test('unpaired surrogates are rejected while valid supplementary pairs round-trip', () => {
  for (const invalid of ['\ud800', '\udfff', '\ud800x', 'x\udfff', '\udfff\ud800']) {
    for (const field of ['title', 'notes']) rejected({ ...create(), payload: { title: 'X', status: 'open', notes: '', [field]: invalid } });
  }
  const parsed = parseMutation(JSON.stringify({ ...create(), payload: { title: '\ud83e\uddea', status: 'open', notes: '' } }));
  assert.equal(parsed.envelope.payload?.title, '🧪');
});

test('U+0000 is rejected before PostgreSQL text admission, while other escaped controls remain valid', () => {
  for (const field of ['title', 'notes']) {
    rejected({ ...create(), payload: { title: 'X', status: 'open', notes: '', [field]: 'before\u0000after' } });
  }
  const controls = '\b\f\n\r\t\u0001\u001f';
  const parsed = parseMutation(JSON.stringify({ ...create(), payload: { title: 'X', status: 'open', notes: controls } }));
  assert.equal(parsed.envelope.payload?.notes, controls);
});
