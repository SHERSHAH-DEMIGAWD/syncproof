# Phase 0 report

Date: 2026-11-04, Asia/Calcutta. **Documentation only. Implementation readiness is a reviewed design target; runtime correctness is untested.** The document acceptance audit below is separate from the NOT RUN application evidence register.

## Actual work and files

Read `<USER_HOME>\ledger-mvp\frontend\SYNCPROOF_PHASE_0_CODEX_PROMPT.md` as the supplied task specification after owner authorization. Inspected the current SYNCPROOF workspace, Git root/status, hidden directory listing, and applicable ancestor/workspace AGENTS.md locations. The workspace initially contained only `.git`; no applicable AGENTS.md or existing project files were found. No Fincore Payments, QuantLab or other application repository was inspected. The supplied prompt was not edited.

Created these nine files; no pre-existing project file required modification:

| File | Exact path |
| --- | --- |
| README | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\README.md` |
| Charter | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\PROJECT_CHARTER.md` |
| Protocol | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\PROTOCOL_SPEC.md` |
| Invariants/failures | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\INVARIANTS_AND_FAILURE_MATRIX.md` |
| Roadmap | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\ROADMAP.md` |
| Decisions | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\DECISION_LOG.md` |
| Evidence register | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\ENGINEERING_EVIDENCE_REGISTER.md` |
| Status | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\STATUS.md` |
| Phase report | `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF\docs\PHASE_REPORTS\PHASE_0.md` |

## Architecture, alternatives and recovery decisions

Use one inspection type, two/three isolated clients, one controller per profile, React/TypeScript with Dexie/IndexedDB, Express/Node/TypeScript with node-postgres, and PostgreSQL. Runtime/package versions are not chosen or installed yet. Reuse database transactions and constraints; implement the educational mutation/reconciliation protocol rather than incorporating a replication engine.

Immutable mutation UUIDs name stable canonical envelopes. Server processing claims identity before record mutation; successful effect and receipt commit together. Well-formed stale/deleted/missing conflicts also get durable terminal receipts. Same-ID concurrent duplicate requests wait/replay; changed canonical bytes collide. Stored canonical bytes supplement a SHA-256 fingerprint. Creation uniqueness handles racing create IDs separately from duplicate mutation IDs. SQL remains Phase 1 work.

Whole-record expected revision, row locking and conditional updates prevent stale overwrite. Revisions start at 1 and use decimal-string wire values. Revisioned tombstones remain forever within the unpruned database, cannot be reactivated and appear in full snapshots. A new-ID repeated delete conflicts; an identical original delete replays. No implicit upsert, automatic merge, undelete, dependent per-record chain or pruning.

Drafts are editable; queues are immutable and lock that record. Clean server snapshots remain separate from local work. Freeze and acknowledgment transitions use multi-store local transactions. A durable attempt marker precedes transport. A lost response or client/server crash means unknown outcome; exact replay of that original ID precedes interpretation of newer snapshots, including for resolution mutations. A historical success does not downgrade newer clean state. New manual resolution writes get new IDs only after the preceding terminal outcome is known.

Pull returns one complete statement snapshot including tombstones; no cursor or pagination. Validate and install the full response atomically without deleting drafts. Conditional eventual reconciliation requires quiescent writes, eventual reachability, repeated fair attempts, working retained storage and user resolution. A synced label is a last-reconciliation observation, not instant global equality.

Alternatives deliberately deferred: RxDB replication engine, Electric shapes/incremental reads, CouchDB-style revision trees, automatic field merging, service-worker cold-start caching, leadership election, ORM/generalized entities, and cursor/pruning designs. Direct IndexedDB is possible, but Dexie reduces access boilerplate while leaving transaction discipline visible. The [decision log](../DECISION_LOG.md) records selection status and consequences.

## Verified third-party comparison

Primary references were opened and read on 2026-11-04:

- [RxDB replication](https://rxdb.info/replication.html): handlers/checkpoints, master conflict states, deletion markers, leadership-aware replication and retry/duplicate handling.
- Electric [overview](https://electric.ax/docs/sync/), [Shapes](https://electric.ax/docs/sync/guides/shapes), [HTTP API](https://electric.ax/openapi), and [Writes](https://electric.ax/docs/sync/guides/writes): read-path shapes with incremental/live consumption, with application writes handled separately.
- PouchDB [conflicts](https://pouchdb.apache.org/guides/conflicts.html) and [updates/deletion](https://pouchdb.apache.org/guides/updating-deleting.html): revision-tree conflicts and tombstones.
- PostgreSQL [READ COMMITTED](https://www.postgresql.org/docs/current/transaction-iso.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), and [transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html): statement visibility, predicate recheck, uniqueness and atomic grouping.
- [MDN durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability) and [Dexie transaction scope](https://dexie.org/docs/Dexie/Dexie.transaction%28%29): durability hints and unrelated-await/auto-commit hazards.

The [charter comparison](../PROJECT_CHARTER.md#production-tool-comparison-documented-facts-and-our-choices) distinguishes these documented facts from SyncProof's choices. No product was installed or evaluated hands-on, and no superiority/novelty claim is made. The project omits substantial production capabilities and increases custom correctness responsibility for educational value.

## Protocol complexity and risks

Two complete pulls per cycle cost O(NB) transfer each for N retained rows of average B bytes; parsing/installation and materialization use comparable work/space. Stable ordering can add sorting cost. Indexed mutation lookups depend on retained record/receipt counts; hashing is linear in envelope size. Sequential Q mutations require O(Q) logical submissions, with at most five attempts per request per cycle. Tombstones, receipts and local history grow over an unbounded run. These are estimates, not measurements; the [roadmap](../ROADMAP.md#benchmark-and-complexity-plan) defines later measurements and environment recording.

Major implementation risks: receipt claim visibility and transaction ownership; create races; incorrectly classifying unknown outcomes; local auto-commit/split acknowledgment; old receipt state replacing newer clean data; incomplete snapshots; parser/canonicalization mismatch; poorly placed fault hooks; and confusing simulation with actual restart evidence. Each has a planned invariant/test mapping. Hardware/browser eviction, backup restore, same-profile competing tabs, hostile clients, production security, database failover and offline cold-loading remain outside coverage. The local unauthenticated demo must not be publicly exposed.

## Actual checks and evidence

Executed repository/ancestor-instruction inspection, primary-source review of all 12 referenced documentation pages, and an in-memory Python documentation checker. The checker reported nine Markdown files and no unexpected application files; 49 valid local links/anchors; four valid JSON illustrations; 12 defined invariant IDs with no undefined references; ten F1–F10 rows with all 11 required fields and NOT RUN status; exactly phases 0–7 with all required gate fields; 19 claim rows and eight demo rows with NOT RUN/TODO evidence; and 14 acceptance items. No checker errors were reported. Markdown fence balance and trailing whitespace also passed.

The final Git status listed exactly the nine intended untracked Markdown files, with no pre-existing tracked changes. `git diff --check` returned no errors; because the files are untracked, their whitespace/fence/link checks were performed by the Python checker rather than inferred from that command. Manual review checked the protocol against the supplied prompt, including replay before conflict inference, receipt uniqueness/visibility, create races, no resurrection, preserved local proposals, atomic acknowledgment, lifecycle distinctions and qualified progress conditions.

**No application tests run.** No browser/server lifecycle tests, benchmarks or installations ran. F1–F10, all supplemental tests, all reliability claims and all eight demo steps remain **NOT RUN**; executable/artifact paths remain **TODO**. No validation script or other application artifact was saved to the repository.

Documentation checks establish link/structure/example consistency and scope compliance. They cannot establish application correctness, crash durability, concurrency safety or measured performance. The acceptance labels below concern the presence and coherence of specifications, not proof that their invariants hold in software.

## Owner decisions and readiness

No unresolved high-impact architectural question requires a separate choice at this point. The selected details stay within the owner's fixed baseline. The next action is owner review of the documentation; Phase 1 is not authorized by completion of Phase 0. A consistency issue requiring a baseline change must be documented with a minimal alternative and approved before building it.

Phase 0 documentation is complete and ready for owner review. Phase 1 readiness is conditional on that review/authorization and access to a real PostgreSQL environment; no environment has been provisioned here.

## Independent learning and interview preparation

**Owner exercise:** Without consulting the protocol, draw this schedule: A edits revision 4 and queues mA; server commits revision 5 but drops A's acknowledgment; B commits revision 6; A restarts and syncs. Label clean/work/unknown states, the canonical mA envelope and receipt, all transaction boundaries, the replay response, and the final snapshot. Then repeat with A never having committed and explain why the original replay now conflicts. No code is needed for this exercise.

Interview questions:

1. Why must a successful record change and its processing receipt share a transaction?
2. How can the same POST arrive concurrently without two effects, and what if the first owner rolls back?
3. Why can a timeout followed by a newer snapshot not establish that the original write conflicted?
4. What is the difference between an editable draft and an immutable queued mutation, and why lock the record?
5. Which race does an expected revision prevent, and why must the check occur inside the update transaction?
6. How do retained tombstones prevent stale resurrection, and why is deletion not privacy erasure?
7. Why can a manual resolution conflict again, and what happens if its acknowledgment is lost?
8. What does a real browser/server restart test establish that a simulation cannot, and what assumptions remain?

## Phase 0 acceptance audit

All 14 documentation acceptance items passed the structural and manual audit. PASS means the required specification is present and coherent; it does not mean the planned behavior has passed application tests. Each support link points to an existing deliverable; runtime evidence remains NOT RUN. Owner review is pending, and Phase 1 remains unauthorized.

| # | Required acceptance item | Result | Supporting document |
| --- | --- | --- | --- |
| A01 | One limited inspection workflow, not a platform | PASS | [Charter](../PROJECT_CHARTER.md#one-inspection-workflow) |
| A02 | Balanced, verified production-tool comparison | PASS | [Charter comparison](../PROJECT_CHARTER.md#production-tool-comparison-documented-facts-and-our-choices) |
| A03 | No unjustified framework/infrastructure added | PASS | [Decisions](../DECISION_LOG.md#technical-choices-selected-for-mvp), actual file audit |
| A04 | Immutable identity/payload, receipts and revision races specified | PASS | [Protocol §§2–5](../PROTOCOL_SPEC.md) |
| A05 | Client crash and server commit/ack boundaries explicit | PASS | [Protocol §9](../PROTOCOL_SPEC.md#9-crash-windows-and-guarantee-boundaries) |
| A06 | Lost acknowledgment resolved through original ID before conflict inference | PASS | [Protocol §7](../PROTOCOL_SPEC.md#7-retry-policy-and-sync-cycle), INV-UNKNOWN-01 |
| A07 | Draft preservation, manual resolution, single-operation policy and tombstones clear | PASS | [Protocol §§6–8](../PROTOCOL_SPEC.md) |
| A08 | Full snapshot, no cursor, retention and extended disconnection explicit | PASS | [Protocol §§5/7/8](../PROTOCOL_SPEC.md) |
| A09 | Reliability targets have invariant, assumptions, limits and planned tests | PASS | [Evidence register](../ENGINEERING_EVIDENCE_REGISTER.md) |
| A10 | F1–F10 include setup, operations, precise injection, client/server outcomes, recovery, invariant, layer, phase and NOT RUN | PASS | [Failure matrix](../INVARIANTS_AND_FAILURE_MATRIX.md#f1f10-failure-matrix) |
| A11 | Real lifecycle restarts distinguished from simulations | PASS | [F5/F6 and harness](../INVARIANTS_AND_FAILURE_MATRIX.md) |
| A12 | Eight-step interview demo has truthful evidence placeholders | PASS | [Demo plan](../ENGINEERING_EVIDENCE_REGISTER.md#eight-step-required-interview-demo) |
| A13 | Phase 0 status consistent; no application implementation started | PASS | [Status](../../STATUS.md), actual file audit |
| A14 | Exactly eight phases, each with acceptance gate, learning exercise and hard stop | PASS | [Roadmap](../ROADMAP.md) |

**STOP — Phase 0 only. Do not start Phase 1 without owner approval.**
