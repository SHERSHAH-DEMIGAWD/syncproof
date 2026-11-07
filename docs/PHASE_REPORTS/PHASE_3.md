# Phase 3 engineering report

2026-11-04, Asia/Calcutta. **PHASE 3 COMPLETE — foreground push and durable acknowledgment/recovery only.** No Phase4 work is authorized. Final runs passed 9 push unit tests, 15 browser tests (4 previous +11 new), 13 local regressions and45 backend regressions. Root/client typechecks and production build passed. No final required check was skipped or blocked.

## Alignment before implementation

Read the actual protocol §§2–7 and Phase2 local schema/seam, roadmap Phase3 scope/tests/acceptance, decisions and evidence/invariant overlays; current README/STATUS and Phase1/Phase2 reports; server contracts/mutation transaction/app/origin/configuration/database code and existing tests; LocalStore, browser contract, React UI and build/browser configuration. The accepted envelope remains exactly protocolVersion, mutationId, clientId, recordId, operation, baseRevision and payload. Creation uses null base; update/delete positive BIGINT strings. Global ID/canonical-content arbitration and historical receipts remain server-owned.

Terminal replies retain protocolVersion=1, mutationId, replayed and outcome. HTTP200 committed contains committedRevision and original resulting record; HTTP409 domain conflict contains reason, expectedRevision and original remoteAtDecision. Collision409 is an error, not a domain receipt. Local phases remain queued/outcome_unknown/acknowledged/terminal_conflict; editable work stays separate from clean records and immutable envelopes. Relevant invariants: INV-IDEMP-01, INV-UNKNOWN-01, INV-ACKCLIENT-01, INV-ONE-01 and INV-DRAFT-01.

The Phase0 complete algorithm includes two pulls. Phase3's explicit roadmap defers them, so this implementation provides recover/push/ack without claiming synced status. The existing acknowledgment seam and clean-record handling were extended rather than duplicating storage or rewriting the server. No fundamental contradiction was found. One integration configuration adjustment was required: Phase2 frontend uses127.0.0.1:5174 while the server's legacy default allowed Origin is localhost:5173. The documented backend ALLOWED_ORIGIN and .env.example now explicitly match the actual frontend; a narrow loopback Vite proxy forwards POSTs to port3000. Server enforcement remains unchanged.

## Complete changed-file inventory

Root: `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF`. Paths below are exact relative paths beneath that root.

| File | Change and purpose |
| --- | --- |
| [client/lib/push.ts](../../client/lib/push.ts) | New typed transport, response taxonomy and single-run foreground controller. |
| [client/lib/storage.ts](../../client/lib/storage.ts) | Extend existing store with pending ordering, durable markAttempt, noteFailure, real applyReceipt and stronger receipt validation; retain synthetic wrapper. |
| [client/main.tsx](../../client/main.tsx) | Manual send/retry control; unknown/blocked/conflict/history visibility; acknowledged record selection enables new independent edit. |
| [vite.config.ts](../../vite.config.ts) | Loopback /api/mutations proxy to existing server port3000. |
| [.env.example](../../.env.example) | Match ALLOWED_ORIGIN to127.0.0.1:5174; placeholder DB credentials only. |
| [package.json](../../package.json) | Add test:push script. No dependency or lockfile change. |
| [tests/push.test.ts](../../tests/push.test.ts) | New nine controller/transport/local-state cases with deterministic injected transport/wait/clock. |
| [tests/browser/push.spec.ts](../../tests/browser/push.spec.ts) | New eleven real browser/PostgreSQL integration cases, including native ack abort and actual retained-profile restart. |
| [README.md](../../README.md), [STATUS.md](../../STATUS.md) | Actual manual push startup, outcomes, commands, limits and Phase4 stop. |
| [docs/PROTOCOL_SPEC.md](../PROTOCOL_SPEC.md) | Current §12 push/ack states, classifications and crash windows; earlier milestone descriptions retained as history. |
| [docs/DECISION_LOG.md](../DECISION_LOG.md) | Decisions P3-01–P3-07 and integration/retry/schema rationale. |
| [docs/INVARIANTS_AND_FAILURE_MATRIX.md](../INVARIANTS_AND_FAILURE_MATRIX.md), [docs/ENGINEERING_EVIDENCE_REGISTER.md](../ENGINEERING_EVIDENCE_REGISTER.md) | Granular P3-E01–P3-E07 execution overlay, with future layers unrun. |
| [docs/ROADMAP.md](../ROADMAP.md) | Authorization/status clarification only; phase definitions unchanged. |
| [docs/PHASE_REPORTS/PHASE_3.md](PHASE_3.md) | This report and20-item acceptance audit. |
| [docs/evidence/phase-3/environment.json](../evidence/phase-3/environment.json) | Versions/source hashes and11 unchanged original backend file checks. |
| [docs/evidence/phase-3/push-unit-final.txt](../evidence/phase-3/push-unit-final.txt), [browser-final.txt](../evidence/phase-3/browser-final.txt) | Final9 unit/15 browser results; earlier attempts retained separately. |
| [docs/evidence/phase-3/backend-regression.txt](../evidence/phase-3/backend-regression.txt), [local-regression.txt](../evidence/phase-3/local-regression.txt) | Actual45 backend and13 local regression results. |
| [docs/evidence/phase-3/typecheck.txt](../evidence/phase-3/typecheck.txt), [client-build.txt](../evidence/phase-3/client-build.txt) | Successful strict checking and frontend production build. |
| [docs/evidence/phase-3/f1-observation.json](../evidence/phase-3/f1-observation.json), [browser-recovery.json](../evidence/phase-3/browser-recovery.json) | Actual commit-before-drop and graceful browser lifecycle observations, IDs/PIDs and final revisions. |
| [docs/evidence/phase-3/documentation-check.json](../evidence/phase-3/documentation-check.json) | Link/anchor/invariant/acceptance/source verification output. |
| docs/evidence/phase-3/push-unit-attempt.txt, browser-attempt-1.txt | Earlier successful runs, not double-counted. |

Original server source, migrations, prior tests/helper and setup helper are unchanged (11 hashes verified against Phase1). No new framework, dependency, schema store/index, endpoint, background process or deployment artifact was introduced. Optional attempt/error/timing metadata extends v1 mutation objects; old absent fields default safely. Existing v1 reopen tests pass. No migration/reset is necessary because IndexedDB keys/indexes did not change.

## Implemented paths and transaction walkthroughs

**Success:** PushController.sendPending shares one running promise across overlapping callers. `pending` selects queued/unknown records, unknown first. Each attempt rereads exact canonical/envelope/hash and checks integrity outside IndexedDB. `markAttempt` atomically verifies the active work link and commits outcome_unknown, count and time BEFORE any HTTP. `deliver` then posts those stored bytes and validates the complete response outside all Dexie transactions. `applyReceipt` commits receipt/history, terminal mutation phase, monotone clean state and matching work removal together. The UI reports Server acknowledged only after this local commit. A new independent draft can then use that last known revision and a new mutation ID; it may be stale by its next send.

**Lost reply:** Server can commit while response/connection disappears. Transport retains unknown; retries resend the SAME canonical bytes/ID. The server's original receipt ends ambiguity, even if its revision is historical. Budget exhaustion is not rejection and does not clear work. A new manual cycle can recover after connectivity returns. Restart reads persistent unknown state; an in-memory sending label is not trusted. No startup auto-send is required or implemented.

**Conflict:** A schema-valid HTTP409 domain result is receipted locally in the same transaction as terminal_conflict/work transition. The common base, original local payload, original server conflict snapshot and receipt remain. There is no automatic merge, rebase, discard or new mutation. The record stays locked for Phase5 manual resolution. Later exact replay retains that original conflict even after another writer advances the server.

**Local ack failure:** If PostgreSQL committed but any local receipt transaction write aborts, old unknown/work state survives; no clean record/receipt half-state is accepted. The controller stops retrying that receipt within the current record's cycle, exposes storage failure, and leaves exact-ID replay eligible next time. Re-obtaining the original server receipt does not repeat its effect. An identical terminal receipt is a semantic local no-op; a different outcome under that ID is rejected. A historical replay never clears a later draft or decreases clean revision; revisions compare with BigInt.

No fetch, response decode, timer, crypto, user interaction or unrelated wait occurs inside a Dexie transaction. [Dexie transaction scope](https://dexie.org/docs/Dexie/Dexie.transaction%28%29) explains why that separation matters. Mark/ack failures before local commit leave the preceding durable state. A crash after mark but before transport may replay a request that never reached the server; that is safe. A crash after server commit but before local commit must replay. After local commit, terminal state survives reopening as tested.

## Response taxonomy and bounded retry

| Observation | Durable client action |
| --- | --- |
| Valid200 committed /409 domain conflict | Atomic terminal receipt/queue/work/clean transition. |
| Recognized409 identity collision or400/413/415/422 admission error,403 Origin error | Blocked diagnostics, original ID/content retained, no fake receipt or automatic replacement. Prior timed-out attempts may still have committed. |
| Timeout/abort/rejected fetch,429/5xx, unreadable/truncated JSON, wrong ID/record/revision/values/status or unexpected response | Outcome remains unknown; original request retained. HTTP status alone cannot certify an outcome. |
| Local receipt transaction failure | Unknown with original envelope; next foreground retry uses server receipt. |

Five attempts per record/cycle; 10-second request/body timeout;1/2/4/8-second backoff multiplied by jitter[0.8,1.2], capped at30seconds. Retry-After can increase the wait. A valid hint above30seconds persists notBefore and stops this record's cycle, including unreadable error bodies. Future manual attempts respect it. Tests inject clocks/waits and assert exact schedules; no sleep chooses a race winner. Independent records proceed sequentially. No navigator.onLine reachability assumption, background timer service or delivery while the app is closed exists.

[Fetch resolves for HTTP errors](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), so the adapter explicitly checks status/body. Aborting fetch does not cancel or roll back a server transaction.

## Actual browser/PostgreSQL evidence

Browser tests use an isolated generated syncproof_push_* schema per case in the dedicated test database, actual checksummed migrations and the unchanged compiled Express/PostgreSQL service on127.0.0.1:3000. The frontend remains127.0.0.1:5174. Parent tests own and close each server; no normal server hooks/routes are enabled. Port3000 must be unused before the suite. A missing TEST_DATABASE_URL fails clearly rather than substituting mocks.

**F1 commit-before-loss:** Playwright intercepts POST /api/mutations, route.fetch forwards it to the real server and awaits its response. The test queries PostgreSQL and asserts revision1 and one committed receipt BEFORE route.abort causes browser network failure. It repeats five identical requests, leaving the client unknown, then removes interception and manually retries. The client records replayed=true; PostgreSQL still has revision1 and one receipt. Exact actual mutation/record IDs, forwarded count and observation order are retained in f1-observation.json. This is controlled browser response loss AFTER real commit, not a request rejected before admission. It does not simulate physical network hardware failure.

Other cases verify: Unicode and special-character browser canonical/hash match SQL; valid independent update and duplicate historical replay; pre-admission connection-refused interception with zero receipt then restored connectivity; native IDB receipt-put exception after server commit with rollback/replay; stale conflict and historical replay after later legitimate server write; real ID collision blocking; cached revision3/later draft preserved on historical revision1 receipt; three-record interruption leaving acknowledged/unknown/queued state; rapid UI triggers sharing one actual request;503 with long Retry-After and malformed200 response; and graceful retained-profile restart both before and after durable acknowledgment.

The actual browser test closes the complete persistent Chromium process, then launches a distinct process with the SAME generated userDataDir. It restores unknown canonical bytes/ID, manually retries the original receipt, closes/relaunches again and verifies acknowledged history persists. browser-recovery.json records actual three PIDs/version/ID and flags. No storageState import or user's personal browser profile is used. Cleanup closes browser before removing only its generated profile after absolute containment verification. Closure was graceful; no forced browser kill or OS/power/storage-eviction test is claimed. Frontend shell stays reachable on relaunch.

**Historical receipt scope:** One real test explicitly seeds the already-known newer clean cache from a direct test DB query (not an implemented client GET/pull), creates a later draft, replays the old receipt and asserts neither cache nor draft changes. Existing local tests also exercise first-install of an old success over a newer clean fixture. These demonstrate the tested receipt transitions, not global reconciliation or all schedules.

## Commands and actual results

```powershell
.\scripts\local-postgres.ps1 -Action Start
$env:TEST_DATABASE_URL='postgresql://syncproof@127.0.0.1:55432/syncproof_test'
npm run typecheck
npm run build
npm run build:client
npm run test:push
npm run test:browser
npm test
npm run test:local
```

| Suite/check | Actual final result | Retained evidence |
| --- | --- | --- |
| Push controller/transport units | 9 PASS,0 failures/skips | push-unit-final.txt |
| Browser total | 15 PASS (4 Phase2 +11 new),0 failures/skips | browser-final.txt |
| Phase2 local regression | 13 PASS,0 failures/skips | local-regression.txt |
| Phase1 backend contract | 18 PASS | backend-regression.txt |
| Phase1 real PostgreSQL/process | 27 PASS, including actual Node pre/post-commit restart | backend-regression.txt |
| Root/client strict checks and build | PASS | typecheck.txt, client-build.txt; npm build completed |

Environment: Node24.15.0/npm11.12.1, Chromium156.0.8078.4/Playwright1.64.1, PostgreSQL18.6 UTF8, READ COMMITTED, fsync/synchronous_commit/full_page_writes on; React19.3.1/Dexie4.4.7/Vite8.3.5/TypeScript7.0.2. Exact source hashes/configuration are in environment.json. No dependency install or backend-source change was needed. Prior successful attempt logs are preserved but not added to final counts. No benchmark was executed.

## Coverage, bugs, complexity and limits

P3-E01–P3-E07 map executed coverage to invariant IDs and claim rows in the evidence/matrix overlays. F1 has real browser/PG commit-before-response-loss and recovery coverage; F2 adds client duplicate/overlap/collision behavior; F4 partial foreground cycle and F5 unknown/acknowledged graceful-browser restart passed. F7 conflict preservation/historical outcome passed. F6 actual server restart remains the separately rerun backend evidence; it is not labeled a coupled browser/server restart. F3 full transport reorder across clients, F8 multi-client resolution, F9 interrupted resolution, F10 simulated weeks/pull and the complete eight-step demo remain unrun. Phase6 broad repetitions are not inferred from these runs.

Bugs/decisions: corrected an initial test helper's optional-header TypeScript annotation; strengthened real terminal response checks beyond the old synthetic seam, including rejection of impossible missing/stale conflicts for create; updated explicit frontend/backend Origin configuration; preserved long Retry-After even on an unreadable error body; made sending UI distinct from saving locally. Schema stayed version1 because added metadata has no store/index changes. Source review found no remaining blocking issue; finite passing tests are not formal proof.

Each pending scan is O(Q) in retained eligible work plus index access, with sequential up to5 attempts per request. Canonical validation/hash/serialization is O(B) for bounded valid payload size. Server lookup costs depend on B-tree/index/storage/lock contention, roughly O(log N + log M), plus payload and commit/network costs; no constant-latency claim. Client rendering/history and retained receipts grow over time. Receipts/tombstones are unpruned; there is no measured throughput or recovery-time claim.

Limits: one active controller/tab per profile, retained functioning IndexedDB/database, local unauthenticated synthetic-data environment and future foreground reachability opportunities. Storage eviction/clearing, private-profile loss, OS/power/hardware failures, forced browser kill, persistent outage, malicious clients, backup/database replacement, public deployment and production security remain unsupported/unverified. Blocked identity/admission errors need diagnosis; no UI rewrites IDs to force acceptance. Last acknowledged state can be historical. No full snapshot, convergence, resolution UI, service worker or background sync was added.

## Independent exercise and interview preparation

**Owner exercise (not claimed completed):** Let PostgreSQL confirm one mutation while its browser response is lost. Close/reopen the same persistent profile and retry the exact ID. Submit a different authorized mutation to advance the server revision, then replay the first ID again while preserving the newer known state. Inspect markAttempt, deliver, applyReceipt and the two deduplication boundaries. Explain why a durable server receipt cannot replace a durable client queue/ack transaction, and why client-only deduplication cannot replace server arbitration.

| Interview question | Answer outline |
| --- | --- |
| Why is a timeout ambiguous? | Server may have committed before the connection/body was lost; lack of response is not rejection. |
| Why keep the same mutation ID? | The receipt names one logical decision; a new ID creates a different operation and can repeat an effect. |
| Why mark unknown before sending? | Crash between transport and local marking would otherwise lose knowledge of a possibly committed attempt. |
| Why keep HTTP outside Dexie transactions? | Network waits can make local transactions inactive and cannot participate in the PostgreSQL commit. |
| What if local receipt storage fails after server commit? | Retain unknown envelope; exact-ID replay obtains original receipt; local transaction then commits atomically. |
| How can a conflict be terminal yet unresolved? | The issued mutation's outcome is final, but the user's preserved proposal still requires an explicit later decision/new operation. |
| Why is receipt revision not necessarily current? | Later legitimate writes may have advanced the record; historical response must remain stable. |
| What does a browser restart prove? | Tested retained-profile recovery across graceful actual process lifecycle, not eviction or physical crash guarantees. |
| What does push-only not provide? | No complete authoritative read, multi-client reconciliation or instant/global synced guarantee. |

## Phase 3 acceptance gate

| ID | Required item | Result | Evidence path |
| --- | --- | --- | --- |
| P3-A01 | Prior docs/protocol/source/tests inspected | PASS | Alignment above; environment.json unchanged backend hashes |
| P3-A02 | Browser/server ID/canonical/hash integration | PASS | Browser create/update/duplicate case; browser-final.txt |
| P3-A03 | Minimal foreground control without pull | PASS | main.tsx, push.ts; browser workflows |
| P3-A04 | HTTP outside storage; one atomic ack | PASS | markAttempt/applyReceipt; native ack-abort case |
| P3-A05 | Durable committed receipt/queue/clean metadata | PASS | Browser create/update and actual acknowledged restart |
| P3-A06 | Durable preserved blocking conflict | PASS | Real stale conflict/historical409 case |
| P3-A07 | Ambiguity retains original envelope | PASS | F1, unreachable, malformed/timeout units and browser restart |
| P3-A08 | Commit actually confirmed before response drop | PASS | f1-observation.json; SQL assertion precedes route.abort |
| P3-A09 | Lost-response replay adds no effect | PASS | F1 revision1/one receipt after five drops and recovery |
| P3-A10 | Historical receipt cannot regress newer known state | PASS | Real cached-r3/later-draft case; prior local first-ack fixture test |
| P3-A11 | Blocked versus unknown distinction, no discard | PASS | Real collision, taxonomy units,503/malformed browser case |
| P3-A12 | Overlapping sends preserve one identity/run | PASS | Rapid UI one-request case and shared-promise unit |
| P3-A13 | Local ack abort recoverable with same ID | PASS | Native receipt-put abort and recovered replay |
| P3-A14 | Pending/unknown browser restart recovery | PASS | browser-recovery.json, actual retained userDataDir/PIDs |
| P3-A15 | Phase1/2 regressions and builds pass | PASS | backend-regression.txt, local-regression.txt,4 old browser cases, type/build logs |
| P3-A16 | F1–F10 evidence granular, remaining gaps explicit | PASS | P3-E overlay and coverage section above |
| P3-A17 | No Phase4/5 scope added | PASS | Unchanged server endpoints, no client pull/resolution code |
| P3-A18 | Docs/status/README/logs/report updated | PASS | Current linked files and retained evidence inventory |
| P3-A19 | Independent exercise/interview Q&A and limits | PASS | Previous section and limitations |
| P3-A20 | Explicit stop before Phase4 | PASS | STATUS/README and ending below |

**PHASE 3 COMPLETE.** Next authorized action is owner review. Phase4 requires explicit owner approval; completion here does not authorize adding pulls or reconciliation.

**STOP — Phase 3 only. Do not start Phase 4 without explicit owner approval.**
