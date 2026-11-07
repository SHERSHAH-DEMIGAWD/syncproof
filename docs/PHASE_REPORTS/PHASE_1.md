# Phase 1 engineering report

Date: 2026-11-04, Asia/Calcutta. **PHASE 1 COMPLETE — backend scope only.** Owner review is the next gate. No Phase 2 implementation has begun. This report records actual executed evidence, not a correctness proof or production-readiness assessment.

## 1. Specification alignment before implementation

The owner explicitly authorized execution of `<USER_HOME>\ledger-mvp\frontend\SYNCPROOF_PHASE_1_CODEX_PROMPT.md` after Phase 0. All nine existing project documents were inspected before implementation; their contracts were retained. No applicable ancestor/workspace AGENTS.md was found. The repository had no application files and no HEAD commit. Existing Phase 0 files were untracked; they were preserved rather than replaced with another project.

| Existing source | Exact relevant sections and implementation consequence |
| --- | --- |
| [README](../../README.md) | Initial Phase 0 status, bounded MVP and documentation index. Current README now distinguishes implemented server from planned client and supplies setup/run/test commands. |
| [Charter](../PROJECT_CHARTER.md) | One inspection workflow; fixed scope/operating assumptions; risks/approval boundaries. No generalized entity sync, extra infrastructure, competing-tab support or public deployment was introduced. |
| [Protocol](../PROTOCOL_SPEC.md) | §2 canonical envelope/global mutation identity/positive BIGINT string revisions; §3 claim-before-record transaction and fresh reads; §4 create/update/delete rules; §5 exact POST variants/statuses. Client §§6–9 and GET remain future specifications. |
| [Invariant registry](../INVARIANTS_AND_FAILURE_MATRIX.md) | INV-ACK-01, INV-ATOMIC-01, INV-IDEMP-01, INV-REV-01 and server part of INV-TOMB-01; F1/F2/F3/F6/F7/F8 backend gates. Broader client obligations were not relabeled passed. |
| [Roadmap](../ROADMAP.md) | Phase 1 exact scope, tests and acceptance: explicit SQL server, real PostgreSQL concurrency, actual Node restart after commit; GET snapshot deferred to Phase 4. |
| [Decision log](../DECISION_LOG.md) | D02 Express/node-postgres, D03 READ COMMITTED claim/lock order, D04 canonical bytes/hash, D05 conflict receipts, D06 revision encoding, D07 tombstones, D13 no health endpoint. Implemented details now recorded as P1-01–P1-09. |
| [Evidence register](../ENGINEERING_EVIDENCE_REGISTER.md) | C01–C19 scheduled targets, NOT RUN/TODO placeholders and eight-step future demo. Added narrow P1-B01–P1-B09 PASS records linked to actual tests/output. |
| [Status](../../STATUS.md) | Previous stop-before-Phase-1 gate was superseded by explicit owner authorization; current status stops before Phase 2. |
| [Phase 0 report](PHASE_0.md) | Actual checks/evidence and acceptance audit certified documents only, not runtime behavior. The historical report and all nine original documents remain present. |

One narrow clarification was necessary: U+0000 is a Unicode scalar but cannot be represented in PostgreSQL text/jsonb business values. It is rejected with 422 before admission; a UTF8 database is required. Other valid scalars, exact field names, canonical ordering, revisions and outcomes remain unchanged. This was recorded in the protocol and P1-05, with tests. No fundamental consistency contradiction required changing architecture or asking the owner to choose a different protocol.

## 2. Exact files created or updated

Workspace root for every path below: `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF`.

| Path relative to that exact root | Change / necessity |
| --- | --- |
| [.gitignore](../../.gitignore) | New; ignores dependencies/build/local database/cache and real env files. |
| [.env.example](../../.env.example) | New; placeholder URLs and local-only port/origin settings, no real credential. |
| [package.json](../../package.json) | New; compact build/migrate/start/test commands and exact dependencies. |
| [package-lock.json](../../package-lock.json) | New; reproducible resolved dependency versions. |
| [tsconfig.json](../../tsconfig.json) | New; strict NodeNext TypeScript, including tests. |
| [src/contracts.ts](../../src/contracts.ts) | New; types, duplicate-aware JSON parsing, input validation, canonical reconstruction/hash. |
| [src/db.ts](../../src/db.ts) | New; configured pool and checksummed transactional migration runner/CLI. |
| [src/mutations.ts](../../src/mutations.ts) | New; one same-connection transaction per mutation, adjudication and historical receipt replay. |
| [src/app.ts](../../src/app.ts) | New; minimal POST route, raw byte/UTF8/media/origin boundary and JSON errors. |
| [src/server.ts](../../src/server.ts) | New; loopback HTTP entry point, environment validation and test-only parent IPC checkpoints. |
| [migrations/001_mutation_server.sql](../../migrations/001_mutation_server.sql) | New; inspections/receipts, revision/status/identity constraints, deferred completion and immutable receipt triggers. |
| [scripts/local-postgres.ps1](../../scripts/local-postgres.ps1) | New; optional isolated native Windows PostgreSQL start/stop/setup without touching existing service. |
| [tests/contracts.test.ts](../../tests/contracts.test.ts) | New; 18 parser/canonicalization/validation tests. |
| [tests/helpers.ts](../../tests/helpers.ts) | New; run-owned schema fixtures, bounded barriers and observed DB lock waits. |
| [tests/integration.test.ts](../../tests/integration.test.ts) | New; 24 actual PostgreSQL/HTTP test cases. |
| [tests/process.test.ts](../../tests/process.test.ts) | New; two actual termination/restart cases plus normal-runtime fault-control gating case. |
| [README.md](../../README.md) | Updated with current scope, setup/run/test instructions and honest evidence links. |
| [STATUS.md](../../STATUS.md) | Updated to completed Phase 1, exact checks, future limits and stop gate. |
| [docs/PROTOCOL_SPEC.md](../PROTOCOL_SPEC.md) | Updated narrowly: implemented server scope, NUL/UTF8/HTTP details and actual receipt enforcement. |
| [docs/DECISION_LOG.md](../DECISION_LOG.md) | Added implemented decisions P1-01–P1-09 and reasons. |
| [docs/ROADMAP.md](../ROADMAP.md) | Updated authorization/status paragraph; original eight phase definitions/gates retained. |
| [docs/INVARIANTS_AND_FAILURE_MATRIX.md](../INVARIANTS_AND_FAILURE_MATRIX.md) | Preserved F1–F10, added backend execution overlay and future-layer limits. |
| [docs/ENGINEERING_EVIDENCE_REGISTER.md](../ENGINEERING_EVIDENCE_REGISTER.md) | Added actual backend PASS entries; retained full-target/client/demo NOT RUN statuses. |
| [docs/PHASE_REPORTS/PHASE_1.md](PHASE_1.md) | New; this engineering report and acceptance audit. |
| [docs/evidence/phase-1/final-tests.txt](../evidence/phase-1/final-tests.txt) | Final executed test output, lock observations, actual old/new Node PIDs and outcomes. |
| [docs/evidence/phase-1/unit.txt](../evidence/phase-1/unit.txt) | Initial successful 18-test unit run. |
| [docs/evidence/phase-1/database-attempt-1.txt](../evidence/phase-1/database-attempt-1.txt) | Initial successful 24-case DB/process run before targeted boundary additions; not added to final counts. |
| [docs/evidence/phase-1/typecheck.txt](../evidence/phase-1/typecheck.txt) | Actual successful strict typecheck output. |
| [docs/evidence/phase-1/build.txt](../evidence/phase-1/build.txt) | Actual successful build output. |
| [docs/evidence/phase-1/environment.json](../evidence/phase-1/environment.json) | Runtime/DB/settings and SHA-256 of all 14 code/config/migration/test/helper files; no fabricated commit ID. |
| [docs/evidence/phase-1/setup.txt](../evidence/phase-1/setup.txt) | Native cluster startup output; direct helper verification also observed. |
| [docs/evidence/phase-1/migrations.txt](../evidence/phase-1/migrations.txt) | Two successful consecutive migration CLI runs. |
| [docs/evidence/phase-1/migrations-unavailable-attempt.txt](../evidence/phase-1/migrations-unavailable-attempt.txt) | Preserved failed environment recheck while own cluster was stopped; not silently erased. |
| [docs/evidence/phase-1/normal-start-smoke.json](../evidence/phase-1/normal-start-smoke.json) | Actual normal server startup without IPC/test hooks; synthetic POST/replay succeeds and deferred GET returns404. |
| [docs/evidence/phase-1/documentation-check.json](../evidence/phase-1/documentation-check.json) | Final relative-link/anchor, Markdown/JSON, invariant/status/scope and source-hash validation output. |

The charter and Phase 0 report were left unchanged as historical planning inputs. `.local/`, `dist/` and `node_modules/` are ignored runtime/generated content. No frontend, deployment package, generated client or later-phase code exists. The documentation audit and normal-start smoke are verification records rather than application features.

## 3. Implemented modules and principal functions

`parseMutation` in contracts.ts parses raw text with `parseUniqueJson`, rejecting decoded duplicate member names before an object can discard them. `exactObject`, `identity`, `revision`, `scalarString` and `businessPayload` enforce exact fields/types/scalar limits. Reconstruction fixes envelope and payload property order before JSON.stringify and SHA-256. This is not input-order-dependent stringify. Whitespace, property order and equivalent escape spelling converge; normalization/trimming does not occur.

`createPool` in db.ts validates the schema identifier, retains parameterized business SQL, caps pool connections, and sets statement/lock timeouts. `migrate` verifies UTF8, takes a database/schema-scoped migration-only advisory lock, checks applied file hashes and commits versioned SQL together. It does not automatically create arbitrary schemas or run on application startup. External database URLs are supported without Docker.

`processMutation` in mutations.ts owns one checked-out connection for BEGIN through COMMIT/ROLLBACK. The global primary-key receipt insert arbitrates ownership; a losing insert waits and a fresh SELECT reads its committed terminal response. `adjudicate` handles create identity uniqueness and row-locked conditional update/delete. No process mutex or global request lock participates in correctness.

`createApp` in app.ts exposes POST /mutations only, plus its preflight OPTIONS. It rejects oversized/invalid UTF8/malformed JSON, unsupported media/encoding and disallowed browser Origin before ledger admission. A 500 never includes a fake terminal conflict/success. No GET /inspections, health, public fault route or special fault header was added. `server.ts` binds 127.0.0.1, validates local configuration and only enables checkpoint IPC under both explicit test environment and a parent-owned IPC channel.

## 4. Numbered transaction walkthroughs

### Successful mutation

1. HTTP boundary validates bytes/media/Origin. Parser validates the immutable envelope, fixes canonical order and computes hash before database admission.
2. Acquire one pool connection and BEGIN READ COMMITTED. Insert an uncommitted receipt claim under global mutation_id uniqueness. No inspection effect precedes this claim.
3. Create attempts a unique identity insert at revision 1; update/delete locks the row, checks missing/deleted/stale in that order, then writes only with exact expected revision and deleted=false. A valid no-change update still increments. Overflow is a database error and rolls back.
4. Store full original response, kind, status and committed revision in the same receipt row/transaction. A well-formed domain conflict stores a 409 receipt with no record effect.
5. COMMIT runs the deferred constraint against the final receipt row. Incomplete claims cannot commit. The immutability trigger prevents later terminal rewrites.
6. Only after driver commit confirmation can HTTP200/409 be returned. A crash/transport failure after this point cannot undo the committed receipt/effect; exact-ID replay recovers its result.

### Simultaneous duplicate submissions

1. T1 and T2 receive the same valid ID/canonical bytes on independent PostgreSQL connections.
2. T1 inserts the uncommitted unique receipt claim. T2's conflicting insert blocks on T1; the tests observe that actual backend lock relationship rather than guessing with sleeps.
3. If T1 commits, T2's conflict-aware insert returns no claimed row. T2 issues a separate READ COMMITTED SELECT, which can see the now-committed receipt even when the earlier INSERT statement snapshot could not.
4. Equal canonical bytes and hash return the stored terminal response with replayed=true; changed client/target/intent/base/payload returns identity collision without changing the receipt or inspection.
5. If T1 rolls back, T2 can instead acquire the identity and process it normally. No pending receipt from T1 survives, and no in-memory lock is required.

### Distinct mutations racing from the same base

1. A and B have different mutation IDs but the same active record/base revision r. Each can claim its own receipt independently.
2. A obtains the record lock and its conditional write changes r to r+1. B's row-lock request waits. The tests run both selected winner orders.
3. After A commits, B locks/observes the updated row. Its expected r no longer matches; B stores a terminal stale conflict with the observed r+1 snapshot and leaves the record unchanged.
4. Retrying B later returns that same historical conflict even if C has since advanced to r+2. Retrying A returns A's historical success, not a rollback of today's row.
5. Independent records can progress while A is held. This is per-record concurrency, not arbitrary cross-record serializability or an all-or-nothing batch API.

These mechanisms use documented [READ COMMITTED visibility](https://www.postgresql.org/docs/current/transaction-iso.html), [ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html), [row locks](https://www.postgresql.org/docs/current/explicit-locking.html) and [single-client driver transactions](https://node-postgres.com/features/transactions). Actual implementation evidence, rather than these references alone, supports the tested cases.

## 5. Crash windows and actual observations

Before COMMIT, both record work and claim are provisional. A thrown exception rolls back; killing the real application process closes its transaction and PostgreSQL rolls it back. If COMMIT confirmation is itself uncertain, no invented terminal response is returned: same-ID replay determines the database result. After confirmed COMMIT, a hook/HTTP failure is outside rollback semantics; server error/timeout cannot prove rejection.

The final process tests recorded:

| Actual control point | Actual Node PIDs (old → restarted) | Observations / recovery |
| --- | --- | --- |
| after_record_write_before_commit | 7488 → 28044 | Held HTTP response lost by SIGKILL; no committed record/receipt visible before kill. Same-schema retry processes normally with replayed=false, revision1 and one receipt. |
| after_commit_before_response | 3436 → 13240 | Record revision1 and terminal receipt visible at checkpoint; held HTTP response lost by SIGKILL. Same-schema retry returns replayed=true, original revision1, one receipt and no extra effect. |

These were actual Node exits and different restarted PIDs, not thrown-exception substitutes. PostgreSQL stayed running during those tests; browser, OS, storage hardware and PostgreSQL lifecycle were not tested by them. Later incidental local database restart/setup is not relabeled as a deterministic database-restart correctness test.

Separately, an integration hook throws after commit, producing HTTP500. Another valid mutation then advances that row to revision2. Replaying the original ID returns its original revision1 success while the current row remains revision2. This is a controlled exception/error-response case, not a literal socket drop. Actual held-response loss is covered by the process-kill case. Client queue, local acknowledgment, pull ordering and full resolution lineage remain future work.

## 6. Executed checks and environment

Commands executed from the workspace:

```powershell
npm run typecheck
npm run build
$env:TEST_DATABASE_URL='postgresql://syncproof@127.0.0.1:55432/syncproof_test'
npm test
$env:DATABASE_URL='postgresql://syncproof@127.0.0.1:55432/syncproof_dev'
npm run migrate
npm run migrate
```

| Check | Actual result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | [typecheck.txt](../evidence/phase-1/typecheck.txt) |
| Build | PASS | [build.txt](../evidence/phase-1/build.txt) |
| Contract unit tests | 18 PASS, 0 failures/skips | [final-tests.txt](../evidence/phase-1/final-tests.txt) |
| PostgreSQL/HTTP integration cases | 24 PASS | [integration.test.ts](../../tests/integration.test.ts), final output |
| Real process-restart/runtime-gating cases | 3 PASS, including 2 actual restart variants | [process.test.ts](../../tests/process.test.ts), final output |
| Final application suite total | **45 PASS, 0 failures, 0 cancelled, 0 skipped** | Final output contains separate 18/27 summaries; earlier runs are not double-counted. |
| Consecutive migration CLI executions | Both PASS | [migrations.txt](../evidence/phase-1/migrations.txt) |
| Optional Windows setup helper | Direct invocation PASS against the project-owned cluster | [helper source](../../scripts/local-postgres.ps1); startup capture in setup.txt |
| Normal server startup without test hooks | PASS: POST200 revision1; exact replay true; deferred GET404 | [normal-start-smoke.json](../evidence/phase-1/normal-start-smoke.json); isolated schema removed afterward |
| Final documentation/source audit | PASS: 201 local links/anchors, four JSON illustrations, 12 invariant definitions, 16 acceptance entries and 14 source hashes checked; no errors | [documentation-check.json](../evidence/phase-1/documentation-check.json) |

Environment: Node24.15.0, npm11.12.1, TypeScript7.0.2, Express5.3.0, pg8.23.1; win32 x64, OS release10.0.26200; actual PostgreSQL18.6 x86_64 Windows, UTF8. Recorded settings: READ COMMITTED, fsync=on, synchronous_commit=on, full_page_writes=on. No hardware specifications, benchmark results or performance guarantees were invented. Lock waits and checkpoint messages choose interleavings; bounded timeouts fail stalled tests rather than choosing race winners.

The existing system PostgreSQL service required credentials, so it was not changed or used. A separate ignored project-owned cluster on 127.0.0.1:55432 supplied dedicated dev/test databases. Each test uses a generated run-owned schema, holds it across the process restart when needed, and drops only that schema after completion. No test resets its database halfway through a recovery scenario. Real secrets were neither read nor committed.

Evidence mapping: backend F2 duplicate races, F3 processing-order reversal, F6 pre/post-commit faults and real Node restart, F7 historical conflict and F8 same-base races passed. F1 has backend post-commit/lost-response coverage. F9 has only shared replay primitives, not a completed resolution scenario. Full F1–F10 browser/client/Phase6 repeated variants and all eight interview-demo steps remain NOT RUN. The [register](../ENGINEERING_EVIDENCE_REGISTER.md#executed-phase-1-backend-evidence) and [matrix overlay](../INVARIANTS_AND_FAILURE_MATRIX.md#phase-1-backend-execution-overlay) make those limits explicit.

## 7. Complexity, indexes and retained state

Inspection ID and mutation ID primary keys provide B-tree lookup/uniqueness paths. schema_migrations has a version primary key. There is no unnecessary generic entity index, client ordering index or global request lock. A receipt's record_id intentionally has no inspection FK: a missing-record conflict still needs a durable receipt.

With N retained inspections, M receipts and B request/response bytes, expected indexed lookup/uniqueness work is approximately O(log N) and O(log M), not universal O(1). Validation, canonicalization, hashing and response materialization are O(B) for the bounded valid envelope shape. Network/WAL writing and commit flush add byte/storage costs. Row/identity lock contention can dominate latency; fixed query count does not imply fixed latency. The simple parser also rejects invalid nesting; no large-input complexity/security claim is made beyond the raw body bound.

Successful create/update/delete and replay have a small fixed sequence of parameterized statements, but PostgreSQL plans, index/cache behavior, durability settings and contention determine actual cost. Store size grows approximately O(NB + MB); tombstones remain among N and every terminal conflict/success adds a retained receipt. There is no lifetime storage bound or garbage collector. Full O(N) snapshots remain a later-phase tradeoff, not an implemented endpoint or measured cost here.

## 8. Alternatives rejected, bugs and limits

Rejected check-then-write outside a transaction because concurrent requests can both observe absence. Rejected memory-only deduplication/mutex because restart or multiple server processes would lose arbitration. Rejected last-write-wins because it silently replaces stale intent. Rejected independently committed receipts/effects because a crash can leave an applied change without replay evidence or a receipt without its effect. Rejected dynamic receipt reconstruction from current rows because historical replay would change after later writes. No ORM/general sync framework or extra infrastructure was needed.

Issues found and addressed:

1. Phase0 scalar allowance included NUL, which native PostgreSQL text/jsonb cannot store. Added explicit pre-admission422 clarification/test rather than an indefinite internal error or bespoke binary business representation.
2. Review found that the first charset regex allowed unmatched quotes. Tightened paired alternatives and added both malformed-quote HTTP cases before final execution.
3. Initial npm cache/network restrictions prevented dependency discovery, and the sandbox initially blocked Node test-runner spawn with EPERM before test bodies ran. Approved dependency/process execution resolved these environment restrictions. The initial runner failure is not included in the final 45 passing-test count.
4. On later setup verification, piping native database startup output stalled capture. Cancelling that capture stopped its child cluster, so a migration recheck returned ECONNREFUSED. The failed attempt is retained; direct helper startup and both migration rechecks then passed. This is an environment/control-process event, not a silently ignored application invariant failure.

No unresolved correctness finding remained after independent source/test review and final execution. That is not a proof over all schedules. No browser persistence, retry scheduler, snapshot install, conflict-resolution UI, authenticated access, backup restoration, database failover, storage eviction, physical power loss, malicious-client resilience, scale benchmark or public deployment is established. Local Origin checks and loopback binding are scope controls, not authentication or a security audit. Trust-auth local helper databases are only for synthetic data and may be accessed by other local processes.

## 9. Learning checklist, interview questions and owner exercise

The owner should independently be able to explain: logical operation versus HTTP attempt; why canonical bytes are compared as well as a fingerprint; uniqueness wait/fresh-statement visibility; row lock plus revision predicate; receipt/effect commit boundary; historical versus latest state; tombstone retention; why an internal error is not terminal rejection; and what each actual lifecycle test establishes. Completing implementation does not certify the owner's independent mastery.

| Interview question | Short answer outline |
| --- | --- |
| Why must a mutation and receipt share one transaction? | Otherwise a crash can separate effect from replay evidence. Same commit exposes both or neither. |
| How do simultaneous duplicates avoid two effects? | Unique receipt claim before record work. Loser waits; winner commit causes historical replay, winner rollback permits takeover. |
| Why a fresh read after ON CONFLICT? | READ COMMITTED statements have separate snapshots; the conflicting winner may be absent from the earlier insert snapshot yet committed by the next SELECT. |
| Why compare canonical content as well as SHA-256? | Stable semantics require defined field order/validation, and direct byte comparison avoids assuming a hash collision is impossible. |
| How are same-base races resolved? | Lock current record, check expected revision, conditional write increments once; stale loser stores a conflict without changing the row. |
| Why preserve original conflict responses? | Replay must report that logical mutation's terminal decision, not reevaluate against a newer record. |
| How do tombstones stop stale resurrection? | The identity remains reserved/deleted and all update/create/delete rules check it; repeated original delete replays without another revision. |
| What does after-commit process kill establish? | For the tested retained database, actual lost response plus Node restart still yields original receipt/no new effect. It does not test browser, OS or disk survival. |
| Why no FK from every receipt to an inspection? | A well-formed update/delete to a missing ID must still retain a terminal conflict receipt. |

**Independent exercise, not completed by the owner:** Add your own variant to tests/integration.test.ts: create r1; make update m1 commit r2 but lose its response; apply m2 at base2 to reach r3; replay m1 and assert its original r2 receipt while the authoritative row stays r3. Use a new test name and explain every assertion without copying the existing create-based after-commit example. Inspect `parseMutation` in contracts.ts, `processMutation`/`adjudicate` in mutations.ts, HTTP error handling in app.ts, and barrier/fixture helpers in tests/helpers.ts. Run the variant against real PostgreSQL and describe what client behavior it still cannot establish.

## 10. Phase 1 acceptance and readiness

| # | Required item | Result | Evidence pointer |
| --- | --- | --- | --- |
| P1-A01 | Canonical Phase0 docs read; necessary clarifications logged | PASS | §1 above; [P1 decisions](../DECISION_LOG.md#phase-1-implemented-decisions--2026-11-04) |
| P1-A02 | Minimal TypeScript HTTP server runs locally with safe config/docs | PASS | [server](../../src/server.ts), HTTP integration/process tests; [README](../../README.md) |
| P1-A03 | Reproducible PostgreSQL schema/migrations/test setup | PASS | [migration](../../migrations/001_mutation_server.sql), [runner](../../src/db.ts), [helper](../../scripts/local-postgres.ps1), [two runs](../evidence/phase-1/migrations.txt) |
| P1-A04 | One inspection type; revision/status/tombstone constraints | PASS | Migration; constraint, delete and no-resurrection integration cases |
| P1-A05 | Global identity uniqueness and changed-envelope rejection | PASS | Contract tests plus serial/concurrent collision cases |
| P1-A06 | Terminal success and stale-conflict receipts persist | PASS | Create/update/stale/historical conflict integration cases |
| P1-A07 | Record effect and receipt atomic in one transaction | PASS | Precommit throw, actual precommit kill, deferred incomplete-COMMIT rejection |
| P1-A08 | Concurrent same-ID submits yield one effect in real PostgreSQL | PASS | F2 independent-PID/observed blocking/commit and rollback cases |
| P1-A09 | Distinct-ID stale races cannot silently overwrite | PASS | F8 both winner orders; F3 backend-order case |
| P1-A10 | Historical replay stable after legitimate later updates | PASS | Historical success/conflict and after-commit-error/intervening-write cases |
| P1-A11 | Create uniqueness, versioned delete and stale resurrection checked | PASS | Concurrent create, tombstone, repeat delete and missing-ID cases |
| P1-A12 | Before/after-commit faults separate; real restart labeled honestly | PASS | [Process suite](../../tests/process.test.ts), [PIDs/output](../evidence/phase-1/final-tests.txt); §5 scope limits |
| P1-A13 | Required tests, typecheck and build succeed | PASS | 18+27 passing tests, [typecheck](../evidence/phase-1/typecheck.txt), [build](../evidence/phase-1/build.txt) |
| P1-A14 | Evidence separates backend results from future client requirements | PASS | [P1-B rows](../ENGINEERING_EVIDENCE_REGISTER.md#executed-phase-1-backend-evidence), [matrix overlay](../INVARIANTS_AND_FAILURE_MATRIX.md#phase-1-backend-execution-overlay) |
| P1-A15 | Report, README, status and decisions updated | PASS | This report; [README](../../README.md), [status](../../STATUS.md), [decisions](../DECISION_LOG.md) |
| P1-A16 | No frontend/IndexedDB/deployment/later phase begun | PASS | Source inventory above and repository file audit |

**Readiness: PHASE 1 COMPLETE.** No required Phase1 database/process test is BLOCKED or NOT RUN. Full later-phase reliability scenarios remain explicitly unexecuted. Phase2 can be considered after owner review and authorization; readiness does not authorize starting it.

**STOP — Phase 1 only. Do not start Phase 2 without owner approval.**
