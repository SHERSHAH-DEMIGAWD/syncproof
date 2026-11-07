# Decision log

Date: 2026-11-04. Status vocabulary: **baseline accepted** comes from the owner's executed prompt; **selected for MVP** is a Phase 0 design choice awaiting document review; **deferred** is outside implementation scope. Selection does not imply installation, implementation, or tested correctness.

## Accepted baseline decisions

| ID | Decision | Reason / consequence |
| --- | --- | --- |
| B01 | Field inspections; one record type | Narrow enough to explain and test thoroughly. |
| B02 | React/TypeScript + IndexedDB; Node/TypeScript REST + PostgreSQL | Local persistence and an authoritative transactional database are explicit requirements. |
| B03 | Two or three isolated clients; one controller per browser profile | Competing same-profile tabs are excluded rather than silently assumed safe. |
| B04 | One immutable outstanding mutation per record per client | Avoid dependent-operation graphs; freeze after editable draft. |
| B05 | Whole-record expected revision; manual resolution | Preserve stale proposals without automatic merge or silent overwrite. |
| B06 | Complete consistent pull, including tombstones | No cursor, incremental log, or streaming lifecycle in MVP. |
| B07 | Lifetime retention of receipts and tombstones | Safe replay and extended disconnection within an unpruned database; storage grows. |
| B08 | Local unauthenticated demo; eight phases 0–7 | Synthetic data, no public deployment; Phase 0 creates documents only. |

## Technical choices selected for MVP

| ID | Selection / alternative considered | Rationale, boundary, and planned check |
| --- | --- | --- |
| D01 | Dexie wrapper; direct IndexedDB remains an alternative | Reduces storage boilerplate while retaining explicit transaction reasoning. Network and unrelated awaits stay outside transaction scopes. Phase 2 verifies multi-store commits and restart behavior. [Dexie transaction constraints](https://dexie.org/docs/Dexie/Dexie.transaction%28%29). |
| D02 | Express and node-postgres; no ORM or generalized sync SDK | Familiar, small server surface; explicit transaction ownership. Exact supported package/runtime versions are selected and pinned in Phase 1, without changing the protocol. No dependencies installed in Phase 0. |
| D03 | PostgreSQL READ COMMITTED; claim mutation identity before touching a record | Unique receipt claim serializes duplicate IDs; row lock plus conditional revision update handles distinct IDs. A single-query snapshot avoids cross-statement read skew. SQL and actual races remain Phase 1 work. [Isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [uniqueness](https://www.postgresql.org/docs/current/ddl-constraints.html). |
| D04 | Global mutation UUID key, canonical bytes plus SHA-256 fingerprint | Include protocol version, client, target, intent, base and payload. Compare stored canonical bytes as well as hash; correctness need not depend on a theoretical hash collision being impossible. Different payload under the same ID is a blocked protocol error. |
| D05 | Terminal receipts for committed and well-formed rejected conflicts | Lost conflict responses also replay deterministically. Pre-admission validation does not allocate a receipt. Conflict receipts preserve their original observed remote state, which may later become old. |
| D06 | Revisions start at 1; decimal-string wire encoding of PostgreSQL BIGINT | Avoid JavaScript integer precision loss; no timestamp ordering. Matching update/delete increments once. Overflow rolls back without a terminal success. |
| D07 | No undelete; every new-ID delete of a tombstone conflicts | Exact duplicate delete replays prior success without incrementing. Tombstones retain last business fields for inspection/debugging; deletion is not privacy erasure. |
| D08 | Persist attempt marker before transport; recover unknowns before pull interpretation | A crash after marking but before sending merely causes safe replay. No cancellation/new ID while an outcome remains unknown. |
| D09 | Sequential mutation scheduling across records in the client | Simplifies deterministic reasoning; partial progress remains per mutation. Server concurrency tests can use independent HTTP workers beyond the two/three-client UI demo. Parallel client scheduling is unnecessary. |
| D10 | One complete snapshot query; atomic local installation; monotone clean revisions | No paginated mixed-time view. Validate the entire response, retain drafts, and reject snapshot rollback/missing known authoritative IDs. Missing rows are not deletion signals. |
| D11 | Foreground/manual Sync with bounded retries | Five attempts per request per cycle, timeouts, capped jittered backoff; future opportunities are necessary for reconciliation. `navigator.onLine` can suggest retry but cannot establish reachability. |
| D12 | Frontend shell available from a local server during API-offline tests | Verifies durable editing and real browser restart without expanding into service-worker caching. Full network-disconnected cold start remains unavailable. |
| D13 | No optional health endpoint for MVP | Readiness in the future harness can use a bounded GET /inspections probe; transport success is more useful than a separate connectivity hint. |

See the [protocol](PROTOCOL_SPEC.md) for precise normative rules. Every choice above is a design proposal; database facts do not establish that our eventual code implements them correctly.

## Deferred enhancements

- Incremental change logs and cursor sync: reduce repeated O(N) transfer but require ordering, atomic cursor progress, retention, expired-cursor full resync, and a safe tombstone policy. No cursor exists in MVP, so cursor expiration is inapplicable today.
- Multi-tab arbitration and background sync: require controller lifecycle and ownership design. RxDB provides leadership-aware replication patterns, but those are not incorporated here. [RxDB replication](https://rxdb.info/replication.html).
- Automatic/field-level merge, CRDTs, revision trees, and peer replication: introduce different conflict semantics and evidence obligations. [PouchDB revision conflicts](https://pouchdb.apache.org/guides/conflicts.html).
- Shape-based streaming/incremental reads: production read-path tooling such as [Electric](https://electric.ax/docs/sync/) supplies capabilities absent from a full snapshot; it does not remove the application's write-path decisions.
- Receipt pruning, tombstone compaction, backups/restores, database incarnation migration, authentication, remote hosting, media, generalized entities, rich UI, and offline shell caching: separate designs/approvals, not hidden prerequisites.

## Unresolved questions and owner approval

There is no unresolved high-impact architectural decision at the end of Phase 0. Database/runtime/package version pinning, SQL syntax, and harness file names are routine later implementation choices, not owner-blocking questions. A consistency issue that requires changing a baseline must be recorded here with the smallest viable alternative before building it.

Historical Phase 0 boundary: await owner review; Phase 1 required explicit approval. That approval was provided in the subsequent implementation request. The following entries supersede the prior next-action status.

## Phase 1 implemented decisions — 2026-11-04

| ID | Implemented selection and reason | Evidence / boundary |
| --- | --- | --- |
| P1-01 | Express 5.3.0, pg 8.23.1, TypeScript 7.0.2, Node 24.15.0; exact package versions plus package-lock.json. Explicit small modules and SQL, no ORM or sync framework. | [Package manifest](../package.json); [source inventory/report](PHASE_REPORTS/PHASE_1.md). PostgreSQL tested version is 18.6; no claims for untested runtime versions. |
| P1-02 | Same-connection READ COMMITTED transaction; INSERT receipt claim ON CONFLICT DO NOTHING before record work; fresh SELECT after loser wait. If owner aborts, waiter can acquire/process. | [Service](../src/mutations.ts), real blocking PID tests in [integration suite](../tests/integration.test.ts). [INSERT behavior](https://www.postgresql.org/docs/current/sql-insert.html), [transaction visibility](https://www.postgresql.org/docs/current/transaction-iso.html), [driver transaction ownership](https://node-postgres.com/features/transactions). |
| P1-03 | Deferred receipt-completeness constraint queries final row at commit; immediate identity/terminal immutability trigger prevents rewrites. Missing conflicts have no inspection FK. | [Migration](../migrations/001_mutation_server.sql); incomplete COMMIT and terminal-update tests. [Deferred constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html). |
| P1-04 | SELECT FOR UPDATE plus conditional revision/deleted predicate; create uses record uniqueness ON CONFLICT then fresh locked read. No global request lock. | Same-base races in both winner orders, create race and independent-record progress tests. [Row locking](https://www.postgresql.org/docs/current/explicit-locking.html). |
| P1-05 | Narrow input clarification: reject U+0000 in title/notes as 422 before admission; require UTF8 database. Preserve all other valid scalars without normalization. | PostgreSQL [character types](https://www.postgresql.org/docs/current/datatype-character.html) cannot store code zero; readable native text columns and jsonb historical responses were chosen over custom binary/encoded business storage. [Parser/tests](../src/contracts.ts), [unit tests](../tests/contracts.test.ts). This tightens accepted input, not mutation/recovery semantics. |
| P1-06 | Strict raw UTF8 HTTP parsing, 64KiB byte limit, duplicate decoded keys rejected, fixed field reconstruction then stringify/SHA-256, compare both stored canonical text and hash. | Pure equivalence/difference tests plus actual HTTP admission tests. Input member order is never used as identity. Unsupported encoding/charset is rejected rather than transformed. |
| P1-07 | Local PostgreSQL option uses existing installed binaries to create an ignored project-owned loopback cluster, independent of existing system service. External URL configuration remains supported. No Docker needed. | [Setup helper](../scripts/local-postgres.ps1), [README](../README.md). Local trust authentication is synthetic-data-only, allows other local processes, and supplies no security boundary. No credentials committed. |
| P1-08 | Fault control is in-process hooks or test-gated parent IPC only; actual Node process kill/restart verifies pre/post-commit states against retained PostgreSQL. No fault routes/headers in normal runs. | [Lifecycle tests](../tests/process.test.ts), [retained output](evidence/phase-1/final-tests.txt). Neither thrown exceptions nor Node restarts are labeled database/browser/OS restarts. |
| P1-09 | Checksummed transactional migrations with a schema-scoped migration advisory lock; no automatic app-start migration or global mutation lock. | [Migration runner](../src/db.ts); migration executed twice on dev DB successfully. Custom schema must be created first; test fixtures create/drop only their own generated schemas. |

No fundamental protocol contradiction remained. Minor review issue fixed before final validation: malformed unpaired charset quotes had been accepted; paired alternatives now reject them and HTTP tests cover both cases. Initial sandbox network/process restrictions were resolved through approved dependency downloads and process execution; they are not application correctness failures.

**Next authorized action: owner review of completed Phase 1. Do not start Phase 2 without owner approval.**

## Phase 2 implemented decisions — 2026-11-04

- **P2-01:** React19.3.1, Dexie4.4.7, Vite8.3.5, Playwright1.64.1, fake-indexeddb6.2.7 pinned. Separate frontend build preserves backend scripts. No global state framework or sync SDK.
- **P2-02:** Small browser contract copy avoids importing Node crypto into browser or refactoring the server; Node conformance cases compare canonical bytes/envelopes/SHA-256. Browser Web Crypto runs before Dexie writes.
- **P2-03:** Separate work/mutations/cleanRecords/metadata stores follow protocol §6. Transactional active work slot enforces one mutation; no claim of cross-tab arbitration. No ordinary seed snapshots; only explicit isolated tests insert known revisions.
- **P2-04:** Editable save, explicit freeze and locked queued UI. Draft version is rechecked after asynchronous preparation; null base is retained, not treated as missing. Receipt equality compares logical fields rather than JSON member order.
- **P2-05:** Storage-only synthetic receipt seam included because roadmap Phase2 requires acknowledgment transaction foundations; UI cannot invoke it. No real acknowledgments, transport or resolution implementation.
- **P2-06:** Persistent Playwright profile created under ignored .local/profiles; close full browser context, await termination, launch same directory, inspect identical canonical operation. CDP records distinct browser PIDs. Profile removed only after absolute containment check and browser close. Graceful restart, not forced kill or OS/power failure.
- **P2-07:** Offline authoring is tested after load; relaunch uses reachable local Vite shell. No service worker/cold-load extension. Browser default durability observed. [Dexie transaction constraints](https://dexie.org/docs/Dexie/Dexie.transaction%28%29), [MDN durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability), [Playwright persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context).

Owner explicitly authorized Phase2 after Phase1. All final local/browser/regression checks passed; next gate is owner review before Phase3. Historical prior stop statements describe their earlier phase.

## Phase 3 implemented decisions — 2026-11-04

- P3-01: No new dependency/server mutation change. Vite loopback proxy sends /api/mutations to existing port3000; .env.example now matches frontend Origin127.0.0.1:5174. Backend keeps its explicit Origin policy.
- P3-02: Extend existing receipt seam via applyReceipt; retain applySyntheticReceipt wrapper for regression tests. Tighten real response validation to require matching status/ID/revision/business/deleted semantics. Atomic clean/work/mutation acknowledgment uses existing stores.
- P3-03: Commit unknown marker before transport, re-read/check durable canonical bytes each attempt, share one active controller promise. Preserve every issued ID through network/error/storage ambiguity. No navigator.onLine shortcut or automatic startup send.
- P3-04: Five foreground attempts with 10s timeout and capped exponential jitter. Retry-After above cap persists notBefore instead of blocking forever; blocked admission/collision diagnostics preserve uncertainty from earlier attempts. No automatic new-ID repair, pull or resolution.
- P3-05: Version1 schema retained: optional mutable processing metadata adds no store/index and old rows default to zero/absent fields. Existing Phase2 reopen/queue tests reran successfully. No startup reset/migration loss.
- P3-06: Real browser tests use isolated PostgreSQL schemas and the compiled unchanged server. Playwright route.fetch forwards an actual request, SQL verifies commit, then route.abort drops its response. No production test route/header was added. Browser profile close/relaunch tests both unknown recovery and acknowledged persistence; graceful closure only.
- P3-07: UI says Server acknowledged, Outcome unknown, blocked or conflict; never fully synchronized. Successful durable acknowledgment allows new independent edits against last known clean revision. That cached revision may already be stale, and next write can conflict.

The Phase0 full recover/pull/push/pull algorithm is staged: Phase3 implements recover/push/ack only; Phase4 owns both pulls. No baseline guarantee was weakened to fabricate a synced status. Initial test helper optional-header typing was corrected. Review tightened unreadable error Retry-After handling; final suites passed. [Fetch status behavior](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), [Dexie transaction scope](https://dexie.org/docs/Dexie/Dexie.transaction%28%29), [Playwright forwarding](https://playwright.dev/docs/api/class-route#route-fetch).

Next gate: owner review of Phase3. Do not start Phase4 without explicit approval.

## Phase 4 implemented snapshots — 2026-11-04

P4-01: one SELECT/read statement, deterministic UUID ordering, count from same rows. No filters/pagination or cursor. P4-02: strict full validation and entire-response rollback/missing-ID rejection follow the accepted protocol. P4-03: reuse v1 cleanRecords/metadata; no migration/index change. Snapshot cannot write work/queue/history. P4-04: share existing controller guard; unknown replay precedes read, queued submission is bracketed by reads. snapshotApplied flag prevents overlapping Send from being labeled successful Pull. P4-05: UI observations remain conditional; local-only drafts never get a fake remote-change warning. P4-06: parent test locks the table and atomically advances two fixtures to examine one real query; this is not a client multi-row write API. P4-07: controlled delayed HTTP, native IndexedDB abort, independent contexts and virtual21-day tests are distinct from physical durability tests. Full report and evidence: [Phase4](PHASE_REPORTS/PHASE_4.md). Phase5 needs explicit approval.

## Phase 5 implemented decisions — 2026-11-04

- P5-01: Owner explicitly authorized Phase5. Preserve Phase0–4 server contracts, revisions and immutable identity; no backend/schema/dependency change. Actual existing create-collision policy forbids implicit upsert, so create conflicts offer keep-server/manual copy to a new inspection only. No contradiction requiring a protocol rewrite.
- P5-02: Reuse Dexie v1 optional fields: work resolutionOf/intent, mutation resolves, local keep-server decision metadata. No new stores/indexes or migration needed. Prior local/restart regressions reopen legacy shapes; all earlier fields remain valid.
- P5-03: Keep terminal evidence and current clean observation distinct. Actionable pointer selects newest active conflict; editable draft points at predecessor. Only confirmed local keep-server releases conflict work without server mutation. Pending/unknown cannot be discarded by a resolution choice.
- P5-04: Require explicit latest review (guarded unknown recovery then pull, no queued push). Prepare editable local candidate, show operation/base and require explicit freeze/send. Validate/hash outside transaction, recheck version/remote and atomically queue+lock+associate. Server revision gating remains definitive after review.
- P5-05: Confirm deletes; keep-only against tombstones. No resurrection, stale-ID create, extra automatic delete or pruning. Candidate cancellation restores preserved original proposal. No automatic merge or generalized conflict graph/queue chain.
- P5-06: Reuse existing unknown/retry/receipt path for resolution. Actual committed6/lost-response + same-profile graceful restart + newer7/replay case supports F9 at this boundary. Native IndexedDB acknowledgment/freeze aborts are injected exceptions, not physical storage failures.
- P5-07: Initial browser attempt exposed wrong parent conflict selection after a second conflict; fixed current active-pointer selection and keyed review state per conflict. A second initial failure was Vite HMR while source was edited mid-run; final runs avoid source edits during execution. Both failed outputs retained. Strengthened final assertions cover both clients' clean caches, retained fingerprint/lock and direct update-versus-tombstone rejection.

[Report, exact inventory and A01–A24](PHASE_REPORTS/PHASE_5.md). Phase5 is complete for owner review; stop before Phase6. Earlier milestones' future-tense statements describe their historical scope, superseded by this overlay.
