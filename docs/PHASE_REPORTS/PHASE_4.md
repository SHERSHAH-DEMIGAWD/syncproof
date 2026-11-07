# Phase 4 engineering report

2026-11-04, Asia/Calcutta. **PHASE 4 COMPLETE**, pending owner review. No Phase5 authorization is inferred.

## Alignment and exact changes

Reviewed README/STATUS, charter narrow inspection workflow, protocol §§2/5/7 (complete snapshot, tombstones, unknown-first ordering), invariant registry INV-SNAP-01/INV-DRAFT-01/INV-RECON-01, roadmap Phase4 gate, decisions/evidence and Phase1–3 reports. Actual source inspected: server contracts/mutations/app/db and migration/test setup, LocalStore/schema, browser contract, PushController and React/Vite/Playwright configuration. No applicable workspace AGENTS.md was found. Baseline had POST /mutations, not GET /inspections. Fields remain id/title/status/notes/revision/deleted; revisions are positive decimal BIGINT strings. Mutation/terminal receipt shapes remain unchanged. Dexie stays v1 with work/mutations/cleanRecords/metadata. No fundamental protocol contradiction was found.

All paths are under `<USER_HOME>/OneDrive/Documents/ChatGPT/SYNCPROOF`:

| Changed file | Purpose |
| --- | --- |
| [src/app.ts](../../src/app.ts) | Add single-query GET /inspections, existing Origin/no-store/error policies retained. |
| [tests/integration.test.ts](../../tests/integration.test.ts) | Update old deferred-endpoint404 expectation to200; all45 backend cases pass. |
| [client/lib/pull.ts](../../client/lib/pull.ts) | New typed snapshot validation and bounded GET transport. |
| [client/lib/storage.ts](../../client/lib/storage.ts) | Atomic monotone clean/metadata installation, preserving all work/history. |
| [client/lib/push.ts](../../client/lib/push.ts) | Shared-guard unknown recovery/pull/queued push/pull; actual snapshotApplied indicator. |
| [client/main.tsx](../../client/main.tsx) | Reconcile now, honest observation/error status, original-base warning only when an authoritative counterpart exists. |
| [vite.config.ts](../../vite.config.ts) | Existing loopback proxy now includes snapshot GET under /api. |
| [package.json](../../package.json) | Add test:snapshot; no dependencies added. |
| [tests/snapshot.test.ts](../../tests/snapshot.test.ts) | Four local validation/atomicity/monotonicity/preservation/error tests. |
| [tests/browser/snapshot.spec.ts](../../tests/browser/snapshot.spec.ts) | Seven real browser/PostgreSQL scenarios, independent contexts and controlled failures. |
| [README](../../README.md), [STATUS](../../STATUS.md) | Current behavior, run/test commands and next gate. |
| [Protocol](../PROTOCOL_SPEC.md), [decisions](../DECISION_LOG.md) | Current contract/read consistency and storage/order decisions. |
| [Invariants/matrix](../INVARIANTS_AND_FAILURE_MATRIX.md), [evidence register](../ENGINEERING_EVIDENCE_REGISTER.md) | P4-E01–P4-E07 scoped results, remaining gaps. |
| [Roadmap](../ROADMAP.md) | Authorization/status paragraph only; eight phases retained. |
| [This report](PHASE_4.md) | Actual observations and22 acceptance entries. |
| docs/evidence/phase-4/ | snapshot.txt, backend.txt, local.txt, push.txt, browser.txt, browser-final.txt, build.txt, build-final.txt, snapshot-browser-final.txt, snapshot-browser-database-unavailable.txt, environment.json and final documentation-check.json. Earlier results are retained, never added again to final counts. |

Server mutation SQL/receipt processing, contracts, database schema/migrations, prior reports/evidence and existing browser tests remain intact. No schema/index migration is needed: existing cleanRecords and metadata store the new state. Existing rows and saved work are reopened without clearing. No auth/origin relaxation, test-only normal endpoint, new library or replacement engine.

## Contract and coherent SQL

GET /inspections returns HTTP200 `{protocolVersion:1,complete:true,recordCount,records}`. Records include every active row and tombstone. SQL is exactly `SELECT id,title,status,notes,revision::text AS revision,deleted FROM inspections ORDER BY id`. Count derives from those same result rows. One [READ COMMITTED statement](https://www.postgresql.org/docs/current/transaction-iso.html) supplies one snapshot, unlike independent paginated/count queries. UUID order is deterministic, not a cursor/global revision. No silent row cap/filter/truncation. Existing statement timeout and10-second client fetch timeout apply; the full dataset is materialized for the bounded local demo, with no production-scale memory guarantee.

A real test holds an ACCESS EXCLUSIVE lock, starts HTTP GET, observes its relation-lock wait through pg_stat_activity, advances two synthetic fixtures atomically and commits. The returned pair belongs to one coherent version and sorted IDs. This parent-only SQL transaction tests reads; it does not add a multi-record client mutation API. Snapshot records are current rows, never reconstructed receipt history. Server Cache-Control remains no-store; client requests no-store.

## Local decision table and walkthroughs

| Local condition | Snapshot action |
| --- | --- |
| New remote row/tombstone | Insert clean copy. |
| Same/newer valid known revision | Refresh clean state and completed-observation metadata atomically. |
| Older response, unequal equal-version state or tombstone revival | Reject the WHOLE snapshot; preserve existing state and show error. |
| Missing previously known authoritative ID | Reject whole snapshot; absence is not deletion. |
| Unsent draft | Preserve values, version, original base/commonBase; update separate clean row only. |
| Frozen queued/unknown | Preserve exact ID/envelope/hash/lock/attempt state. Content equality cannot settle it. |
| Terminal conflict | Preserve original receipt/base/proposal, while cleanRecords tracks latest remote. |
| Local-only create absent remotely | Preserve it; it has no authoritative clean ID to require in snapshot. |

`validateSnapshot` checks complete/count/array, exact record fields, duplicate IDs and all original business/UUID/revision rules before writes. `applySnapshot` validates outside IndexedDB then checks all known rows within one cleanRecords/metadata transaction. A staged-write fault rolls it back. No work/queue/receipt writes or unrelated async waits occur inside it.

**Clean success:** A creates/sends and receives authoritative revision1; B independently pulls it. Three independent contexts create three separate records, then reconcile to identical three-row clean caches under quiescence. A's saved unsent draft remains local; B/C have no such pending work. These are conditionally equal clean observations, not permanent global consistency.

**Conflict:** A and B observe revision1. B saves a draft. A edits/freezes/sends through its own UI to revision2. B reconciles, preserving its draft/base1 while clean state advances. B freezes its original-base edit and receives real stale409. Pull preserves its proposal and original conflict receipt; no resolution UI appears. A later test-authored delete becomes revision3 tombstone. Advancing B's clock21 days and reconciling observes deletion without discarding the conflict. This is simulated duration, not actual multiweek storage retention.

**Unknown/history:** Browser's create commits at1, interception confirms SQL receipt and drops the response. Another authorized writer reaches2. Reconcile first replays the SAME original ID, storing historical receipt1; only then pulls newest2. No duplicate effect or false stale conflict. Existing real response-drop/local-ack-abort/browser-restart regressions reran.

**Delayed/error:** An old complete HTTP response is held, a newer response installs revision2, then old response is released and rejected rather than regressing. This deliberately injects parallel low-level reads; normal foreground operations share one guard. Invalid complete flags/duplicate IDs/missing IDs/older revisions reject as whole. Native IndexedDB mid-write failure proves clean/work/queue/history/metadata remain identical. HTTP503 leaves prior state and a later manual action succeeds. No client write bypasses POST /mutations.

**Foreground sequence:** recover unknowns → pull/apply → send genuinely queued work → pull/apply. Unknown exhaustion remains unknown; unrelated clean rows may refresh. Existing active run promise serializes Send and Reconcile. A joined push-only run cannot falsely report a completed pull because snapshotApplied is set only by a completed reconciliation. UI never claims fully synchronized while conflicts/drafts remain; its observation can become stale immediately.

## Executed commands/results and failure honesty

Run from root, with project-owned PostgreSQL on127.0.0.1:55432 and TEST_DATABASE_URL pointing to syncproof_test:

```powershell
npm run build
npm run typecheck
npm run check:client
npm run test:snapshot
npm test
npm run test:local
npm run test:push
npm run build:client
npm run test:browser
npm run test:browser -- tests/browser/snapshot.spec.ts
```

[Backend output](../evidence/phase-4/backend.txt):45 PASS (18 contract+27 real PostgreSQL/process). [Local](../evidence/phase-4/local.txt):13 PASS. [Push](../evidence/phase-4/push.txt):9 PASS. [Snapshot local](../evidence/phase-4/snapshot.txt):4 PASS. [Full browser](../evidence/phase-4/browser-final.txt):22 PASS, including15 existing and7 snapshot scenarios. [Targeted final snapshot browser](../evidence/phase-4/snapshot-browser-final.txt):7 PASS; final case1 explicitly uses both browser UIs for the conflicting edits. That rerun is NOT seven additional distinct cases. [Build](../evidence/phase-4/build-final.txt) and strict typechecks passed. No final skipped/blocked test. Earlier combined17-browser run and prior six/seven-case targeted passes are not counted again.

On continued verification, the owned database was no longer running. Seven test setup attempts failed with ECONNREFUSED before bodies ran; output is retained separately. Restarting the project-owned cluster and rerunning yielded the final7 PASS. This is an environment failure, not hidden as a passing test. No other service/database was changed. Each test uses a generated dedicated schema and independent browser stores; profile restart evidence remains the actual earlier lifecycle regressions, not context isolation mislabeled restart.

Environment: Node24.15.0, PostgreSQL18.6 UTF8/READ COMMITTED with fsync/synchronous_commit/full_page_writes on; Chromium156.0.8078.4, Playwright1.64.1, Dexie4.4.7, Vite8.3.5. No benchmarks. Source hashes/configuration: [environment.json](../evidence/phase-4/environment.json).

## Fixes, complexity and limits

Added the endpoint intentionally changes the old deferred GET404 expectation. Kept known-row absence/rollback fail-closed policy from Phase0. Corrected a misleading local-only draft warning and ensured overlapping push/reconcile cannot manufacture a pull-success label. Removed unnecessary dynamic import/chunk warning; no transaction semantics change.

Server transfer/materialization is O(NB); client validation/map and known-row scan O(N+K) plus bytes, indexed writes roughly O(N log N) storage work, with O(N+K) temporary space. Pending scan O(Q), existing bounded retries, lock/index/network/commit costs remain. Payloads, retained tombstones and histories grow unbounded without deferred pruning. Full snapshot choice simplifies correctness at bandwidth/memory cost; no performance or very-large-dataset guarantee.

Coverage advances INV-SNAP-01, INV-DRAFT-01, INV-UNKNOWN-01, INV-TOMB-01 and conditional INV-RECON-01; conflict preservation supports INV-CONFLICT-01. F1 gains unknown-before-newer-pull; F7/F8 gain actual independent-UI stale preservation; F4 gains independent clean reconciliation with pending work; F10 gains virtual21-day/tombstone observation. Prior F2/F5/F6 layers reran. Full F3 reordered multi-client mutations, F9 interrupted resolution, Phase6 comprehensive repetitions and the complete eight-step demo remain NOT RUN. There is no automatic merge/resolution, cursor/change-log, subscription, background sync, auth or deployment. Conditional reconciliation requires eventual reachability, repeated opportunities, retained working storage, finite/quiescent writes and eventual user conflict decisions. Eviction, private-profile loss, OS/power/hardware failure, competing tabs and arbitrary device loss remain unsupported/unverified.

## Interview questions and independent exercise

1. Why one SELECT? Its statement snapshot is coherent; independent READ COMMITTED statements may observe different commits.
2. Why keep tombstones? Absence cannot safely convey deletion to an old client; retained IDs prevent resurrection.
3. Why replay unknown before interpreting a snapshot? A newer row could follow the client's successful unacknowledged commit.
4. Why preserve original draft base? Replacing it would silently authorize overwriting work the user never reviewed.
5. Why reject a missing known ID? Complete snapshots must retain tombstones; absence suggests incompatibility, not permission to erase.
6. Why BigInt? Decimal revisions beyond JS safe integers must compare without rounding or lexical ordering.
7. Why atomic snapshot installation? A partial view with fresh metadata could falsely describe mixed local state as one completed read.
8. What do independent contexts prove? Separate IndexedDB clients reconcile; two shared-profile tabs do not establish independent-store behavior.
9. Why is convergence conditional? New writes, unresolved conflicts or permanently unavailable storage/network can prevent completion.

Owner exercise (NOT claimed completed): use two profiles on revision4; save an unfrozen A draft, advance B to5, pull A and inspect its unchanged original base and separate clean5. Freeze/submit the stale edit and observe its preserved conflict without resolving. Then install a later valid snapshot and show an older response cannot regress it. Explain unknown-ID recovery, momentary snapshots and prolonged-disconnection tombstones independently.

## A01–A22 acceptance

| Gate | Requirement | Result | Supporting executed evidence |
| --- | --- | --- | --- |
| A01 | Actual contracts/source inspected | PASS | Report alignment; protocol §§2/5/7/Phase3 overlay; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A02 | Coherent complete GET/tombstones/revision strings | PASS | snapshot browser case2; src/app.ts; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A03 | Actual read consistency and no truncation | PASS | snapshot browser case6, single SELECT; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A04 | Validate complete typed response before write | PASS | snapshot local case1; browser case4; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A05 | Atomic IndexedDB abort rolls back | PASS | snapshot local case2; native browser case7; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A06 | Monotone authoritative state | PASS | browser case4; local case2; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A07 | Draft/base/immutable queue preservation | PASS | browser cases1/3/5; local cases2/3; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A08 | Conflict proposal/history preserved | PASS | two UI writers, browser case1; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A09 | Unknown same-ID replay precedes latest pull | PASS | browser case3 plus existing F1 regression; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A10 | History distinct from latest snapshot | PASS | browser case3: receipt1 /clean2; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A11 | Tombstones do not resurrect | PASS | browser case1; local case2; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A12 | Missing known ID vs local-only create policy | PASS | local case2; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A13 | Independent clients converge conditionally | PASS | browser case5: three separate contexts; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A14 | Two UI clients generate preserved conflict | PASS | strengthened final browser case1; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A15 | HTTP failure preserves state/retry | PASS | browser cases4/7; local case4; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A16 | Shared guard/stale response rejection | PASS | push guard; browser case4; UI snapshotApplied flag; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A17 | Simulated prolonged disconnection | PASS | case1 virtual21-day clock/tombstone; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A18 | Earlier regressions/typecheck/build pass | PASS | 45 backend,13 local,9 push,15 prior browser; logs; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A19 | Granular honest F1–F10 evidence | PASS | evidence register overlay; no F9/full-demo claim; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A20 | No Phase5+ features | PASS | no resolution, cursor, streaming or deployment; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A21 | Current documentation/evidence consistent | PASS | linked current documents and source audit; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |
| A22 | Complexity/exercise/Q&A/stop included | PASS | report sections below; [browser logs](../evidence/phase-4/snapshot-browser-final.txt) |

**PHASE 4 COMPLETE.** Next step is owner review, not Phase5 implementation. Full evidence labels remain scoped; the final demo has not been certified.

**STOP — Phase 4 only. Do not start Phase 5 without explicit owner approval.**
