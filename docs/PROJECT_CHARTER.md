# Project charter

Planning baseline: 2026-11-04, Asia/Calcutta. Phase 0 only. See the [protocol](PROTOCOL_SPEC.md), [roadmap](ROADMAP.md), and [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) for normative details and planned validation.

## Purpose and portfolio value

SyncProof serves a third-year Data Science undergraduate preparing for software engineering and fintech internships. The owner's existing Fincore Payments sandbox and QuantLab backtesting project are contextual inputs from the supplied prompt; their repositories were not inspected. This project adds distributed-state reasoning: a request may commit while its acknowledgment disappears, two offline edits may both look valid locally, and restarting a process must not invent a new logical operation.

The intended result is a small project the owner can explain through transaction boundaries, interleavings, and reproducible evidence. Feature count, novelty claims, and a polished SaaS interface are not goals. A passing demo will support particular tested claims under stated assumptions, not establish universal correctness.

## One inspection workflow

A field inspector records a title, status (`open`, `in_progress`, or `complete`), and notes. They save an editable local draft, then explicitly queue it. Queueing freezes one logical mutation and blocks further editing of that record until its outcome is known. Other records remain usable. On demand, Sync recovers uncertain requests, refreshes clean server state, sends queued work, and refreshes again.

Two or three isolated browser profiles/devices can start from the same revision. If another inspector has changed that record, the stale submission receives a visible conflict. The user compares common base, local proposal, and current server state, then keeps the server after confirmation or submits an intentional new proposal against a freshly observed revision. Deletion leaves a revisioned tombstone. There is no undelete operation.

For the local demonstration, the frontend shell must remain available from a local static/development server, including after browser restart. Offline tests disconnect the API while leaving this shell reachable. A fresh browser launch with no reachable frontend assets is not promised. A service worker and offline cold-loading are deferred; they are distinct from IndexedDB edit persistence and are not prerequisites for the specified MVP.

## Fixed scope and operating assumptions

- One `Inspection` type; client-created UUID identities; server-owned revisions; PostgreSQL is authoritative.
- React + TypeScript; IndexedDB, with Dexie selected as a wrapper; Node.js + TypeScript with a lightweight HTTP framework and REST.
- Two or three independent local stores. Exactly one controller per browser profile; no competing tabs, shared-store arbitration, or leader-election implementation.
- One outstanding queued/submitted logical mutation per record per client. Editable unsent drafts are separate. No dependent per-record operation chain.
- Complete consistent snapshots, including all demo rows and tombstones; no pagination, cursor, change log, live stream, or server push.
- Whole-record expected-revision checks. Manual conflict resolution; no field-level automatic merge, CRDT, or last-write-wins rule.
- Receipts and tombstones remain for the lifetime of the unpruned MVP database. There is no revision-admission TTL.
- Normal browser restarts use a persistent, non-private profile and functioning storage. No claim covers storage eviction, user clearing, disk corruption, power-loss durability, or backup restoration.
- Local demonstration, synthetic data, and no public exposure. Client IDs identify a profile for tracing; they are not authentication credentials.

Excluded: Redis, Kafka, buses, Kubernetes, microservices, enterprise auth, multi-tenancy, multi-region replication, media synchronization, collaborative rich text, AI conflict resolution, generalized replication, elaborate dashboards, background-sync requirements, tombstone pruning, and public hosting.

## Production-tool comparison: documented facts and our choices

The following primary documentation was read on 2026-11-04. These are scoped documentation findings, not hands-on evaluations or performance comparisons. No third-party product was installed or benchmarked.

| Source | Verified documented behavior | SyncProof proposal and educational tradeoff |
| --- | --- | --- |
| [RxDB replication](https://rxdb.info/replication.html) | Pull handlers use checkpoints; push handlers compare assumed master state and return conflicting master states. Replication uses deletion markers. Client conflict handlers resolve conflicts; the default chooses master state. Multi-tab replication can wait for leadership. Failed requests are resent, including when processing succeeded but the answer failed; duplicate-safe handling is required. | Build a small manual state machine and durable receipts ourselves. Full snapshots replace checkpoints; conflicts retain local proposals; one controller per profile avoids implementing leader election. We learn replay and concurrency explicitly, while forgoing RxDB's replication engine, adapters, streaming, and multi-instance coordination. |
| [Electric Sync overview](https://electric.ax/docs/sync/), [Shapes](https://electric.ax/docs/sync/guides/shapes), [HTTP API](https://electric.ax/openapi), [Writes](https://electric.ax/docs/sync/guides/writes) | Electric's current Sync product is a Postgres read-path engine. Shapes select subsets of data. The HTTP API supports initial data, offsets, and live update polling. Writes use separate application patterns/APIs; Electric does not prescribe a built-in write-path synchronization solution. | We implement both a bounded mutation API and a full read snapshot. We do not adopt Electric's incremental shape log or claim that read-path sync alone solves durable offline writes. The simpler read side leaves more work on retry and user resolution, and scales less efficiently. |
| [PouchDB conflicts](https://pouchdb.apache.org/guides/conflicts.html), [updating/deleting](https://pouchdb.apache.org/guides/updating-deleting.html) | PouchDB follows CouchDB replication semantics. Revision trees can retain competing branches; a deterministic winner is presented while conflicts remain discoverable. Deletion adds a tombstone at a revision-tree leaf. | Use one authoritative linear revision and local preserved proposals, not a replicated revision tree. Tombstones teach why absence cannot propagate deletion safely. We do not implement peer replication or server-side branching history. |
| [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) | At READ COMMITTED, a plain SELECT sees a statement snapshot; successive statements may differ. Concurrent row updates wait and recheck predicates. Unique constraints enforce identity uniqueness. Transactions make grouped changes commit or roll back together. | Reuse those mechanisms for receipt claims, row races, revision checks, and record/receipt atomicity. Use one SELECT for a complete read snapshot. These facts support the design; Phase 1 must still test the actual transaction algorithm. |
| [IndexedDB durability, MDN](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability) | Durability hints distinguish strict persistent-medium verification, relaxed OS-level completion, and the browser's default. | Observe and report actual browser behavior and wrapper support in Phase 2. A successful normal restart test is evidence for that profile/runtime, not proof against eviction, power loss, or physical failure. |
| [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction%28%29) | IndexedDB can auto-commit when its transaction becomes inactive. Unrelated asynchronous waits inside the transaction can lose its scope; the transaction promise resolves after commit. | Keep network calls, hashing, timers, and other unrelated awaits outside local transactions. Group draft/queue and acknowledgment changes atomically. Dexie simplifies storage access; it does not supply our mutation protocol or strengthen physical storage guarantees. |

SyncProof reuses React, TypeScript, HTTP, the browser's IndexedDB implementation, Dexie, the Node runtime/framework, and PostgreSQL transactions/constraints. It builds the inspection-specific envelope, canonical identity check, receipt processing, local queue transitions, retry controller, full-snapshot reconciliation, conflict workflow, and deterministic evidence harness. These are established ideas assembled for learning, not an invention.

Production capabilities remain unavailable: audited security and authorization, operational hardening, large-scale replication, cursor lifecycle, pruning, backups/restore correctness, cross-region behavior, multi-tab coordination, extensive compatibility coverage, and sustained real-world durability evidence. Choosing a production platform would reduce custom protocol responsibility; this project deliberately accepts that work within a narrow local learning scope.

## Risks and approval boundaries

The largest implementation risks are an incorrectly ordered receipt transaction, treating a timeout as rejection, losing drafts during pull/acknowledgment, accepting an old replay as the latest server state, and insufficiently controlled race tests. Each has an invariant and planned evidence in the registry. Full snapshots and lifetime receipts/tombstones consume increasing transfer/storage; this is an accepted small-demo tradeoff.

No high-impact design question is currently unresolved. Decisions selected within the fixed baseline are recorded in the [decision log](DECISION_LOG.md). If implementation reveals a genuine consistency problem requiring broader scope, stop at that boundary, document the smallest viable alternative, and request approval. Phase 1, public exposure, pruning, multiple controllers per profile, and later feature expansion are not authorized by this Phase 0 session. Feature requests must support core correctness or demonstrable learning, or receive separate approval.

## Learning mechanisms

Each mechanism has a plain explanation, an interview question, and an exercise to perform independently later. Exercises are not completed work.

| Mechanism | Plain-English explanation | Interview question | Independent exercise |
| --- | --- | --- | --- |
| Revision comparison | Submit the version you edited; the server refuses to overwrite someone else's newer work. | Why must the revision check and update be coupled? | Draw two writes from revision 4 and identify the losing check. |
| Receipt atomicity | The change and its proof of processing become durable together. | What fails if the receipt commits separately? | Trace crashes between the two commits in both orders. |
| Idempotency | The same logical request can travel twice but has one recorded outcome. | Why is a record ID insufficient for deduplicating updates? | Compare replay of an ID with reuse of that ID for different notes. |
| Local transactions | The draft, frozen request, and queue state change together or remain as before. | What happens if the browser exits halfway through acknowledgment? | Enumerate every durable state on each side of that transaction. |
| Unknown outcome | Silence cannot reveal whether the server committed. | Why can a newer snapshot mislead a client after a lost response? | Trace A's lost response followed by B's successful update. |
| Manual conflict preservation | Keep the user's proposal until the user explicitly decides its fate. | Why can a resolution conflict again? | Build a three-column base/local/remote example, then add a third writer. |
| Tombstones | A retained deleted row tells an old client that the ID must stay deleted. | Why is physical deletion unsafe for a stale client? | Compare reconnect behavior with and without a tombstone. |
| Snapshot reconciliation | Copy one coherent server view, then repeat when circumstances permit. | Why is a snapshot not a global synchronization barrier? | Schedule a server write immediately after the snapshot query. |
| Failure evidence | Stop at a known point, inject a fault, and inspect durable state. | What does a process restart test establish that a thrown exception cannot? | Design a parent-controlled after-commit process termination. |

Expected costs are developed in the [benchmark plan](ROADMAP.md#benchmark-and-complexity-plan). We do not yet solve distributed consensus, replicated database internals, revision-tree replication, Byzantine clients, backup consistency, storage hardware reliability, or automatic merge theory. Those topics are valuable but would obscure the bounded protocol and require evidence this MVP cannot supply.
