# Roadmap and phase gates

Eight phases, numbered 0–7. Phase 1 was explicitly authorized and implemented on 2026-11-04; see the [Phase 1 report](PHASE_REPORTS/PHASE_1.md). The phase definitions below preserve the planning gates. Phase 2 was subsequently authorized and completed as documented in [its report](PHASE_REPORTS/PHASE_2.md). Phase3 was subsequently authorized and implemented; see [its report](PHASE_REPORTS/PHASE_3.md). Phase4 was subsequently authorized and implemented; see [its report](PHASE_REPORTS/PHASE_4.md). Phase5 was subsequently explicitly authorized and implemented; see [its report](PHASE_REPORTS/PHASE_5.md). Phase6 was subsequently explicitly authorized and completed as a bounded deterministic audit; see [its report](PHASE_REPORTS/PHASE_6.md). Phase7 was subsequently explicitly authorized and completed for its bounded measurements/handbook/local-readiness audit; see [its report](PHASE_REPORTS/PHASE_7.md). No further phase, public push or deployment is inferred. Each phase requires a report, actual evidence for its acceptance checks, owner review, and an explicit stop before the next phase. Tests enter when the corresponding behavior is built; Phase 6 consolidates them rather than postponing reliability work.

The [protocol](PROTOCOL_SPEC.md) is the behavioral contract. [Invariant IDs and tests](INVARIANTS_AND_FAILURE_MATRIX.md) and the [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) define traceability. A failed required check leaves that gate incomplete. Do not replace a real PostgreSQL/browser/process test with a mock to obtain a pass. Record blocked environments as BLOCKED with a concrete reason.

## Phase 0 — documentation and design

**Objective:** Establish a bounded, explainable inspection workflow and a reviewable reliability contract.

**Exact scope:** Inspect the current workspace and supplied prompt; verify primary references; write charter, protocol, invariants, F1–F10, decisions, evidence placeholders, roadmap, README, status and Phase 0 report. No application code, migrations, endpoints, UI, tests, generated clients, infrastructure, dependency installation or benchmark execution.

**Dependencies:** Supplied Phase 0 prompt and owner authorization to execute it. The workspace was empty apart from Git metadata. No pre-existing project implementation is assumed.

**Outputs:** The nine Markdown deliverables indexed in README, source-grounded comparisons, and the acceptance audit in the Phase 0 report.

**Invariants:** Specify every INV-* obligation; none is established by executable evidence in this phase.

**Checks planned:** Relative-link/file/fence/JSON illustration checks; F1–F10 field/status and phase-count audit; manual consistency review of unknown outcomes, canonical identity, transaction boundaries and claim traceability. These are documentation checks, not application tests.

**Acceptance/completion:** All 14 prompt acceptance items are satisfied as documentation specifications, files link coherently, source facts are distinguished from choices, no application work exists, and every reliability evidence entry remains NOT RUN/TODO. Owner approval remains necessary before implementation.

**Learning checklist:** Explain draft versus queue; distinguish commit from acknowledgment; describe stale-write prevention, tombstones and conditional convergence; identify unsupported failures.

**Independent exercise:** On paper trace A's mutation commit with lost reply, B's later update, A's restart and replay. Label every revision, immutable ID, receipt, local state and atomic boundary; explain why A's original outcome is success.

**Hard stop:** Deliver Phase 0 audit and await owner review. Do not start Phase 1.

## Phase 1 — transactional PostgreSQL mutation server

**Objective:** Implement the server contract with evidence for atomicity, revisions and identity replay.

**Exact scope:** Minimal Node/TypeScript Express server, PostgreSQL connection/transaction ownership, inspection/receipt persistence, migrations, canonical envelope validation/fingerprinting, POST /mutations, retained tombstones, and backend tests. The complete GET snapshot and client are Phase 4/2 respectively; test fixtures may inspect SQL directly. Pin supported runtime/database/package versions. No extra infrastructure or auth platform.

**Dependencies:** Explicit Phase 1 authorization and reviewed Phase 0 contract; accessible dedicated PostgreSQL test environment. Revisit the design only if a discovered race demands it.

**Outputs:** Server source/migrations, reproducible local setup, actual backend test commands/artifacts, updated decisions/evidence register and phase report. Document how incomplete receipt claims cannot commit and how duplicate-member parsing is enforced.

**Invariants:** INV-ACK-01, INV-ATOMIC-01, INV-IDEMP-01, INV-REV-01, server portion of INV-TOMB-01.

**Tests planned:** Backend F1/F2/F3/F6/F7/F8; actual PostgreSQL distinct/same-ID races; T-ID-COLLISION, T-CONFLICT-REPLAY, T-CREATE-RACE, T-REV-BOUNDS, server T-TOMBSTONE. Test pre-commit abort and actual Node restart after commit, not just exceptions. Prove replay after intervening writes at server level.

**Acceptance/completion:** All server tests pass against real PostgreSQL; one same-ID receipt/effect under controlled duplicate concurrency; stale losers do not update; mismatching IDs collide; conflict receipts replay unchanged; commit/receipt crash boundaries verified; no client or snapshot implementation added. Commands, runtime/settings and artifacts recorded. No broader guarantee inferred.

**Learning checklist:** Explain READ COMMITTED statement visibility, row predicate recheck, unique ownership, aborted transaction handling, fingerprint/canonical-byte distinction and receipt retention.

**Independent exercise:** Write a two-connection interleaving for duplicate receipt claims where the first owner rolls back. Explain which statement can see a committed winning receipt and why a fresh read matters.

**Hard stop:** Report server evidence and remaining risks; await approval for Phase 2.

## Phase 2 — persistent offline client

**Objective:** Preserve drafts and one immutable queued mutation per record across real browser restart.

**Exact scope:** Minimal React/TypeScript inspection editor, Dexie/IndexedDB stores, stable profile ID, clean/work/queue separation, atomic draft save/freeze and active-slot checks, clear saved/unsaved/locked labels. The local frontend server remains reachable during API-offline tests. No service worker/background-sync requirement and no complete network sync controller yet.

**Dependencies:** Approved Phase 1 gate and separate Phase 2 authorization; protocol schema; persistent browser test profile. No assumption that a page reload demonstrates process persistence.

**Outputs:** Minimal UI/storage implementation, browser fixture setup, store transition evidence, real restart artifacts, phase report and updated register. Record chosen browser/durability hint and actual wrapper/runtime support without claiming power-failure guarantees.

**Invariants:** INV-DRAFT-01, INV-ONE-01; local transaction foundations for INV-ACKCLIENT-01 and INV-UNKNOWN-01.

**Tests planned:** F5 with actual test-browser process exit/relaunch using same profile and origin; T-LOCAL-ABORT and T-ONE-ACTIVE. Include saved draft, frozen queue, attempt-marker fixtures, draft-version mismatch, explicit draft cancel and quota/transaction failure. No real API effect is required for the offline fixture.

**Acceptance/completion:** Saved intent and frozen IDs/bytes recover unchanged; failed save is visibly unsaved; one active mutation enforced in storage; edits locked after freeze; no unrelated awaits inside local transactions. Lifecycle logs distinguish forced/graceful exits from reloads. Frontend-shell availability limitation is documented.

**Learning checklist:** Explain transaction completion, profile/origin identity, atomicity versus physical durability, auto-commit hazards and why a transient spinner is not durable state.

**Independent exercise:** Diagram stores before/after freeze and predict recoverable state if each write aborts. Compare with an edit that was typed but never saved.

**Hard stop:** Deliver local persistence evidence; await approval for Phase 3.

## Phase 3 — push, retry and acknowledgment recovery

**Objective:** Recover ambiguous outcomes without duplicate effects or lost local work.

**Exact scope:** Foreground/manual sync controller, persisted attempt-before-send marker, sequential POST submission, five-attempt retry policy, response validation and atomic success/conflict acknowledgment. No full pull/reconciliation or polished resolution UI yet. Preserve terminal conflict information even before Phase 5 controls exist.

**Dependencies:** Approved Phase 2 gate and Phase 3 authorization; tested server receipts and local stores.

**Outputs:** Controller implementation, test-only transport/checkpoint controls, actual HTTP/IndexedDB recovery artifacts and phase report. Keep normal build free of exposed fault controls.

**Invariants:** INV-IDEMP-01, INV-ACKCLIENT-01, INV-UNKNOWN-01, INV-ONE-01, INV-DRAFT-01.

**Tests planned:** Client-integrated F1/F2/F3/F4/F6/F7, T-LOCAL-ACK-CRASH, T-ERROR-CLASSIFY and T-REPLAY-ADVANCED (server advance can use test fixture operations before pull exists). Fake-clock bounded retries, false online hints, late/malformed responses, 429/5xx and collision handling. Crash before/after local acknowledgment; preserve same ID on recovery.

**Acceptance/completion:** Lost replies replay original committed/conflict results; retry budget exhaustion never discards/re-IDs work; real Node restart recovery works; browser ack interruption gives old or complete state; independent records retain partial progress. A newer authoritative fixture cannot turn unknown success into conflict. No global synced claim before Phase 4's final snapshot exists.

**Learning checklist:** Explain transport versus logical operation, ambiguous versus terminal response, request timeout versus server cancellation, fair retry opportunities and atomic local acknowledgment.

**Independent exercise:** Exhaust all retry attempts after an unobserved commit. Specify what survives, what the UI says, and how next week's manual Sync recovers without inventing a new ID.

**Hard stop:** Report push/recovery evidence; await approval for Phase 4.

## Phase 4 — full snapshot and multi-client reconciliation

**Objective:** Refresh coherent authoritative state without replacing pending local intent.

**Exact scope:** GET /inspections single-query complete snapshot including tombstones, response validation/no-store behavior, atomic local installation, recover→pull→push→pull cycle, latest-remote observations, base-changed warnings, and precisely qualified local synced status. Two/three independent profiles; no cursor, pagination, subscriptions or competing tabs.

**Dependencies:** Approved Phase 3 gate and Phase 4 authorization; working mutation recovery before snapshot interpretation.

**Outputs:** Snapshot API/controller/UI status, controlled read/write integration evidence, isolated-client setup and phase report.

**Invariants:** INV-SNAP-01, INV-DRAFT-01, INV-UNKNOWN-01, INV-ACKCLIENT-01, read-side INV-TOMB-01, conditional INV-RECON-01.

**Tests planned:** T-SNAPSHOT, T-PULL-PRESERVE, T-SYNC-STATUS, full T-REPLAY-ADVANCED, F4 interrupted final pull, F8 multi-client refresh and snapshot portion of F10. Exercise query-time concurrent writes and truncated responses; preserve drafts/queues/unknown/conflict state byte-for-byte. Reject rollback/missing-known-ID/equal-revision mismatch.

**Acceptance/completion:** One coherent query returns every row including tombstones; failed snapshots cause no partial installation; historical receipts never downgrade clean state; unknown recovery occurs before interpreting newer state. Synced requires no work and a successful final pull, and is described as an observation. Two isolated clean clients reconcile under quiescence and repeated connectivity.

**Learning checklist:** Explain statement snapshot versus multiple reads, O(N) transfer, stale-at-arrival views, tombstone propagation and why no timestamp is a cursor here.

**Independent exercise:** Schedule a commit immediately after the snapshot query starts. Explain the valid old response, the honest UI wording, and the next opportunity that catches up.

**Hard stop:** Report full-snapshot evidence; await approval for Phase 5.

## Phase 5 — manual conflicts, deletion and extended disconnection

**Objective:** Make conflicting intent explicit and recover interrupted resolutions safely.

**Exact scope:** Base/local/original-remote/latest-remote comparison, confirmed keep-server, intentional reapply/manual merge drafts with new IDs/latest bases, second-conflict handling, delete UI, retained tombstones, simulated-weeks reconnection, and same-ID recovery of resolution unknowns. No automatic merge/undelete/dependent queues.

**Dependencies:** Approved Phase 4 gate and Phase 5 authorization; stable local and server recovery/snapshot semantics.

**Outputs:** Minimal resolution workflow, preserved lineage evidence, deletion/reconnect scenarios, phase report and updated register.

**Invariants:** INV-CONFLICT-01, INV-TOMB-01, INV-UNKNOWN-01, INV-IDEMP-01, INV-ONE-01, INV-ACKCLIENT-01, conditional INV-RECON-01.

**Tests planned:** Full F7/F8/F9/F10, T-RESOLVE-RACE, T-DISCARD-CONFIRM and browser T-TOMBSTONE. Drop a successful resolution response, advance server again, restart browser and replay original resolution. Test new-ID repeated delete, stale update to tombstone, create collision and manual copy to different identity.

**Acceptance/completion:** No proposal disappears without acknowledgment or explicit decision; tombstones never reactivate; a resolution can conflict again; lost-resolution acknowledgment cannot produce another ID; simulated 21-day interval does not expire receipts/revisions or masquerade as physical durability evidence. All three demo clients can resolve and reconcile under documented progress conditions.

**Learning checklist:** Explain manual resolution as a new conditional write, original versus latest remote observation, tombstones versus erasure, and logical time versus real storage aging.

**Independent exercise:** Create a third-writer race after a resolution draft refresh. Predict both conflict histories and identify exactly when a new ID is and is not allowed.

**Hard stop:** Report conflict/reconnect evidence; await approval for Phase 6.

## Phase 6 — deterministic failure harness consolidation

**Objective:** Make F1–F10 repeatable and auditable across actual and simulated layers.

**Exact scope:** Consolidate earlier fault controls into a run-isolated parent harness, explicit barriers, HTTP gates, Node supervision, persistent browser profiles, database assertions and structured artifacts. Add missing boundary coverage and retain earlier regressions. Do not add distributed infrastructure or new product features.

**Dependencies:** Approved Phase 5 gate and Phase 6 authorization; real restart tests already exist from the relevant phases.

**Outputs:** One reproducible scenario command/entry point, environment/seed manifest, actual artifacts per variant, completed traceability entries, phase report and a list of still-uncovered failure assumptions.

**Invariants:** Entire registry, within its explicit supported model.

**Tests planned:** F1–F10 and supplemental tests; at least 20 repetitions per deterministic variant. Separate actual PostgreSQL, real IndexedDB, actual browser exit/relaunch, actual Node restart, simulated exceptions, response drops and virtual time. Validate normal demo build cannot accept fault-control calls. Bounded waits guard failures; sleeps must not choose race winners.

**Acceptance/completion:** Each required case has setup, injection checkpoint, assertion, recovery and retained artifacts; zero unexplained failures in required repetitions. A FAIL or BLOCKED remains visible and blocks completion where required. Every reliability claim has real executable/artifact paths rather than invented placeholders. No outcome relabeled solely because retry happened to pass.

**Learning checklist:** Explain deterministic interleavings, test isolation, observability limits, simulation versus lifecycle evidence and limits of finite repetitions.

**Independent exercise:** Design an adversarial schedule not already in the matrix, justify which invariant it targets, and implement it without nondeterministic timing after review.

**Hard stop:** Report harness coverage and gaps; await approval for Phase 7.

## Phase 7 — benchmarks, handbook and evidence-based demo

**Objective:** Present measured behavior and defensible claims the owner can reproduce and explain.

**Exact scope:** Run the benchmark plan below, assemble source-grounded educational handbook, finalize README run/demo instructions, execute required eight-step demo, review local/publication security, redact secrets, and audit every claim against evidence. No public deployment or new feature scope is implied. A publication review may recommend retaining local-only status.

**Dependencies:** Approved Phase 6 gate and Phase 7 authorization; no unexplained required reliability failures; reproducible environment.

**Outputs:** Raw measurements, environment manifest, median/p95/limitations report, handbook, final evidence register, demo artifacts and phase report. Each README reliability claim links to a real test and/or reproducible demo plus its assumptions.

**Invariants:** All relevant invariants remain unchanged; benchmark throughput is not correctness evidence.

**Tests/checks planned:** Re-run correctness checks only when benchmark/presentation changes introduce code risk; execute DEMO-01–08 and verify their artifacts; audit fault hooks, local bindings, synthetic data, credentials and dependency versions; verify benchmark repeatability on recorded environment.

**Acceptance/completion:** All eight demo steps have actual evidence; each published reliability claim maps to a tested invariant with limits; performance claims derive from retained raw samples, not extrapolation. The owner can run the demo and explain crash/concurrency cases independently. Security review records remaining limitations, with no production-ready claim.

**Learning checklist:** Explain distributions, tail latency, client/server timing boundaries, asymptotic versus observed costs, evidence limitations and the choice to build versus reuse a sync engine.

**Independent exercise:** Reproduce one benchmark without the assistant, change exactly one parameter, and explain the difference using raw samples and a plausible mechanism without inventing causality.

**Hard stop:** Deliver final audited project. Any further feature or hosting work requires a separately approved scope.

## Benchmark and complexity plan

**No measurements have been run.** Targets are descriptive metrics, not promised latency budgets. Correctness assertions remain enabled around workloads; duplicate requests and conflicts must not be counted as successful new effects.

Record actual CPU model/core count, RAM, OS/build, storage type if known, power mode, Node/PostgreSQL/browser/package versions, source revision, PostgreSQL durability/isolation settings, database size and retained receipt/tombstone counts, browser profile/durability hint, local versus remote topology, transport limits, seed and workload. Unknown hardware details are labeled unknown. No hardware facts are assumed in Phase 0.

Use deterministic synthetic inspection payloads with recorded field lengths/UTF-8 sizes. Grid: **100/500/1000 records**, **10/50/100 queued independent mutations**, and HTTP worker concurrency **1/2/10/20 where supported**. The actual client remains sequential; concurrency 10/20 is a backend load driver, not a claim of supporting 20 demo devices or competing same-profile controllers. If a grid cell is unsupported, record it explicitly rather than silently substituting another load. Keep queue size ≤ record count. Run fixed contention and disjoint-record workloads separately.

For each feasible cell, prepare a fresh run-owned fixture, do one excluded warm-up run, then five independent measured runs. Target at least 1,000 individual mutation/replay samples per latency distribution by repeating seeded batches; report actual count and explain missing samples. Snapshot/reconciliation and recovery distributions use at least 100 complete operations per feasible cell. Reset fixtures between independent runs, never inside a recovery scenario. Collect errors/timeouts/conflicts separately; include both successful latency and failure rates to avoid survivorship bias. Use monotonic timers per process, not cross-machine wall-clock subtraction.

| Metric | Timing boundary and method |
| --- | --- |
| Local draft/freeze commit | Browser performance timer from start of storage operation to IndexedDB transaction completion; separate canonicalization/hash preparation and UI render time. Report median/p95 and actual sample count. |
| Server mutation | Client HTTP round trip plus separately instrumented handler/transaction time; report median/p95 for create/update/delete successes, conflicts, disjoint and contended requests. Do not mix the populations. |
| Duplicate replay | Resubmit an identical committed envelope; measure first processing versus replay, verify unchanged revision/effect count and report latency distribution. |
| Full-snapshot payload | Count rows including tombstones, uncompressed JSON UTF-8 bytes and actual transferred bytes under recorded compression settings; time server query/encoding and client download/parse separately where observable. |
| Reconciliation | Time snapshot validation + atomic local installation; separately report entire recover→pull→push→pull cycle, queue size, work preservation and final state. |
| Conflict detection | From stale request dispatch to complete conflict response and local terminal conflict commit; keep network and local persistence components distinct. |
| Recovery | From transport restoration/manual retry opportunity or process relaunch readiness to durable terminal acknowledgment and final reconciliation; include retry/backoff delay separately and label fault variant. |

Report raw sample locations, method for nearest-rank p95, per-run summaries and pooled summaries with counts. No precision beyond timer resolution. Log tail failures and scheduler effects. Physical weeks, power failures and production networks are not represented by local virtual-time benchmarks.

Let N be all retained inspection rows, M retained server receipts, H local history, Q active queued work, and B average full-record bytes. Each full snapshot transfers O(NB) bytes; two pulls approximately double that per cycle, excluding mutations/recovery. Server scan/encoding and local validation/install are O(NB) expected work, with O(NB) materialization memory in this simple design. Stable sorting may cost O(N log N) if the database cannot use ID order; do not assume a query plan. A temporary client ID map adds O(N) space.

A keyed receipt lookup/record lookup has expected indexed O(log M)/O(log N) search cost under a B-tree model, plus O(payload bytes) canonicalization/hash/copy work. Real cost includes lock waits, transaction flush and contention; constant-time mutation performance is not promised. Sequential queue processing performs O(Q) logical submissions, bounded by up to five attempts each per cycle, plus uncertain-outcome recovery. Local active data needs O(NB + QB); retained history/receipts increase storage by O(HB)/O(MB). Lifetime tombstones increase N and retained receipts/history grow without a bound over an unbounded run.

Full snapshots deliberately trade bandwidth and write amplification for a small read protocol without cursor bookkeeping. Incremental replication could reduce repeated transfer but requires a change log, stable ordering, cursor persistence/retention, expired-cursor full resync preserving local work, and safe deletion retention. That remains a deferred evolution, not a Phase 0–7 requirement.
