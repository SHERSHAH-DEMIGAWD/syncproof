# Phase 2 engineering report

2026-11-04, Asia/Calcutta. **PHASE 2 COMPLETE — local-only browser client.** Phase 3 is not authorized. Final runs passed 13 local tests, 4 Chromium tests and 45 backend regressions, with no failures/skips/blocked cases in those final runs. Earlier build problems and limitations are reported below.

## Alignment and source of truth

Inspected README, charter workflow/scope, protocol §§2–6/9, invariant registry, roadmap Phase2 objective/scope/tests/gate, decisions D01/D04/D08/D12, evidence register, STATUS and Phase0/Phase1 reports. Relevant Phase1 contracts, mutation transaction service, HTTP boundary, tests, package manifest and strict TypeScript configuration were inspected. No applicable AGENTS.md was found in the workspace. Backend source was not refactored; hashes of its five source files, four existing tests/helpers, migration and setup helper remain unchanged against Phase1 evidence (11 files).

The authoritative constraints are global immutable mutation IDs, UUID client/record identity, exact fields, null base for create, positive BIGINT strings otherwise, fixed canonical ordering, SHA-256, scalar limits, pre-admission NUL rejection, separate clean/work/queue stores and one active mutation per local record. Phase2 targets INV-DRAFT-01, INV-ONE-01 and transaction foundations for INV-ACKCLIENT-01/INV-UNKNOWN-01. No fundamental contradiction was found.

Node's crypto import is browser-incompatible, so a small browser-safe copy retains the parser/validator/types and uses Web Crypto outside IndexedDB transactions. Conformance tests compare envelope/canonical/hash results with the real backend parser. No normal startup seed simulates PostgreSQL authority. Test-only clean records explicitly establish non-null bases. Roadmap Phase2 asks for acknowledgment foundations, so a storage-only synthetic receipt seam is included; no real server receipt or network controller invokes it.

## Files created and changed

All paths resolve under `<USER_HOME>\OneDrive\Documents\ChatGPT\SYNCPROOF`.

| Exact workspace-relative path | Work performed |
| --- | --- |
| [client/index.html](../../client/index.html) | New minimal app shell. |
| [client/main.tsx](../../client/main.tsx) | New React form/list, explicit save/freeze, metadata inspection, confirmed draft discard, accurate status/error labels. |
| [client/style.css](../../client/style.css) | New small responsive layout and keyboard-focus styling. |
| [client/env.d.ts](../../client/env.d.ts) | New Vite CSS/module declarations. |
| [client/lib/contract.ts](../../client/lib/contract.ts) | New browser-safe contract copy and asynchronous SHA-256 preparation. |
| [client/lib/storage.ts](../../client/lib/storage.ts) | New Dexie v1 schema and narrow local save/freeze/discard/synthetic receipt methods. |
| [tests/local.test.ts](../../tests/local.test.ts) | New 13 Node tests using fake-indexeddb for logic and actual backend conformance. |
| [tests/browser/local.spec.ts](../../tests/browser/local.spec.ts) | New four real Chromium workflows, including persistent-profile process restart. |
| [vite.config.ts](../../vite.config.ts) | New loopback frontend dev/build configuration, port5174, separate dist-client output. |
| [playwright.config.ts](../../playwright.config.ts) | New single-worker/no-retry browser suite, managed Vite shell and ignored browser output. |
| [tsconfig.client.json](../../tsconfig.client.json) | New strict browser/React/test typecheck. |
| [tsconfig.json](../../tsconfig.json) | Excludes browser test runner files from backend compilation; includes imported local library in Node tests. |
| [package.json](../../package.json), [package-lock.json](../../package-lock.json) | Added pinned React/Dexie/Vite/Playwright/test dependencies and separate client commands; existing backend commands retained. |
| [.gitignore](../../.gitignore) | Added generated frontend/test result paths; profiles/browsers remain beneath ignored .local. |
| [README.md](../../README.md), [STATUS.md](../../STATUS.md) | Updated current scope, commands, evidence and stop gate. |
| [docs/PROTOCOL_SPEC.md](../PROTOCOL_SPEC.md), [docs/DECISION_LOG.md](../DECISION_LOG.md) | Actual schema, methods, synthetic seam, tooling and test decisions. |
| [docs/INVARIANTS_AND_FAILURE_MATRIX.md](../INVARIANTS_AND_FAILURE_MATRIX.md), [docs/ENGINEERING_EVIDENCE_REGISTER.md](../ENGINEERING_EVIDENCE_REGISTER.md) | Scoped P2-L01–P2-L06 evidence; full future scenarios retained. |
| [docs/ROADMAP.md](../ROADMAP.md) | Updated authorization/status sentence; eight phase definitions retained. |
| [docs/PHASE_REPORTS/PHASE_2.md](PHASE_2.md) | This report. |
| [docs/evidence/phase-2/environment.json](../evidence/phase-2/environment.json) | Versions, source hashes and unchanged Phase1 source verification. |
| [docs/evidence/phase-2/browser-lifecycle.json](../evidence/phase-2/browser-lifecycle.json) | Actual process IDs, browser version, durability hint, profile lifecycle and canonical evidence. |
| [docs/evidence/phase-2/local-tests-final.txt](../evidence/phase-2/local-tests-final.txt), [browser-final.txt](../evidence/phase-2/browser-final.txt), [backend-regression.txt](../evidence/phase-2/backend-regression.txt) | Final execution outputs. |
| [docs/evidence/phase-2/typecheck-final.txt](../evidence/phase-2/typecheck-final.txt), [client-build-final.txt](../evidence/phase-2/client-build-final.txt), [backend-typecheck.txt](../evidence/phase-2/backend-typecheck.txt) | Actual successful build/typecheck outputs. |
| docs/evidence/phase-2/local-tests-attempt.txt, browser-attempt-1.txt, client-build.txt | Retained earlier successful test runs and initial sandbox-blocked frontend build; not counted again. |

Prior reports, evidence and backend implementation remain intact. No real credentials, personal browser profile, giant trace or browser binary is committed.

## Numbered local lifecycle walkthrough

1. Normal startup constructs `LocalStore`, defines version1 stores and calls `initialize`. A candidate UUID is prepared outside a transaction; metadata transaction retains the existing clientId or inserts it once. It never clears data. Ordinary cleanRecords is empty.
2. Form typing stays in React state and says Unsaved changes. `saveDraft` validates first, then rechecks expected version/lock and writes work in one transaction. `App.act` reports Saved locally only after the transaction promise resolves. Failed writes show Storage error and retain prior durable content; failed typing is not claimed saved.
3. Queue requires a saved, unchanged draft. `freeze` reads it and prepares mutation UUID, exact canonical envelope and SHA-256 outside the read-write transaction. Inside that transaction it rereads version/active slot, adds immutable mutation and locks work with its mutation ID. Any abort leaves the prior draft and no queue entry.
4. Queued UI fields/actions are disabled and metadata is inspectable. Storage methods also reject edits, requeue and discard rather than relying on buttons alone. Concurrent repeat freeze within the supported controller yields one winner, not a replacement identity. Other record IDs can queue independently.
5. The actual lifecycle test closes the complete persistent Chromium context/browser and waits for termination, then starts a new Chromium process with the same dedicated userDataDir. No storageState export/import or fake IndexedDB substitutes are used.
6. Relaunch reloads the reachable frontend shell and reads existing stores. Selecting the queued item rehydrates the same canonical envelope, mutation/client/record IDs, null base, payload and queued phase. Fields stay locked. A separately launched fresh browser has an empty local list.

## State model and atomicity

| State | Durable fields / behavior | UI or scope |
| --- | --- | --- |
| Unsaved form | No completed write yet | Unsaved changes; restart persistence not promised. |
| draft | work id/version/payload/baseRevision/commonBase | Editable; Saved locally only after commit. |
| queued | work activeMutationId + immutable mutation envelope/canonical/hash/commonBase; mutable phase separate | Queued on this device; locked; no server acceptance implied. |
| Storage error | Previous committed state remains | Visible actionable error; not a phantom successful save. |
| outcome_unknown | Reserved mutation metadata, tested through explicit reopen fixture | No actual attempt marking/send/retry exists yet. |
| acknowledged / terminal_conflict | Synthetic seam only: original receipt retained and matching queue/work transition atomic | No UI integration, real acknowledgment, conflict-resolution controls or server sync. |

Stores: work `&id,phase`; mutations `&mutationId,recordId,phase`; cleanRecords `&id`; metadata `&key`. A work primary-key slot and transactional lock/version recheck enforce one outstanding mutation per record; queue primary key preserves identity/history. Normal local create uses base=null and commonBase=null. An existing draft's null base is preserved even if a later explicit fixture appears. Saved draft discard is confirmed; queued discard is forbidden.

If queue insertion and lock were separate commits, failure could leave editable work with an issued mutation or locked work without an envelope. Tests abort immediately after mutation insertion and assert both writes rolled back, then verify a normal freeze works. Real Chromium repeats that abort on native IndexedDB. A test-only patched IDBObjectStore.put throws QuotaExceededError; the UI reports error and reload shows prior notes. This simulates an error; it does not demonstrate actual disk exhaustion.

Only Dexie requests are awaited inside transactions. UUID generation, parser validation, SHA-256 and user decisions happen first. [Dexie documents transaction auto-commit hazards](https://dexie.org/docs/Dexie/Dexie.transaction%28%29); unrelated async waits would risk an inactive transaction. Default durability does not supply an OS/power failure promise. [MDN describes durability hints](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability).

`applySyntheticReceipt` clones/validates identity, outcome, revision and remote business values before its transaction. The transaction stores receipt/phase, conditionally advances clean records and clears matching work only for success; a conflict retains proposal/base/history. An abort preserves all old stores. Lower historical revisions cannot replace newer clean state; repeated equivalent outcome member ordering compares semantically. These are local synthetic tests, not server synchronization or F1/F9 completion.

## Browser restart procedure and actual environment

[Browser test](../../tests/browser/local.spec.ts): create a unique directory under absolute .local/profiles; launchPersistentContext headless Chromium; open the reachable Vite origin; save and freeze a new inspection; read canonical metadata; obtain browser PID via browser-level CDP SystemInfo.getProcessInfo; close the entire context/browser; confirm disconnected; launch another persistent browser with identical directory; inspect exact persisted metadata/lock. Capture second PID and verify it differs; separately launch a fresh browser and verify empty state. Finally close browsers and remove only the generated directory after absolute containment verification.

Final browser: Chromium **156.0.8078.4**, Playwright **1.64.1**, Windows x64, Node **24.15.0**. Final observed PIDs and canonical bytes are in [lifecycle JSON](../evidence/phase-2/browser-lifecycle.json); the test records them directly, not inferred from reload. The observed IndexedDB transaction durability hint was **default**. Profile directory is recorded for audit but removed after testing. This was a **graceful full process close/relaunch**, not a forced kill, page reload, new-tab substitute or weeks-long physical storage test. Shell stayed reachable at http://127.0.0.1:5174 on relaunch. Offline authoring was tested separately after load with context network access disabled and zero mutation/snapshot requests.

Versions pinned: React19.3.1, Dexie4.4.7, Vite8.3.5, fake-indexeddb6.2.7, TypeScript7.0.2; PostgreSQL18.6 for backend regressions. Exact OS/dependencies/source hashes are in environment.json. Persistent-browser testing follows [Playwright's dedicated userDataDir API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), never the user's ordinary browser profile.

## Executed checks

```powershell
npm run typecheck
npm run build
npm run build:client
npm run test:local
$env:PLAYWRIGHT_BROWSERS_PATH=(Join-Path (Get-Location) '.local/browsers')
npx playwright install chromium
npm run test:browser
# Start project-owned PostgreSQL; set TEST_DATABASE_URL to dedicated DB:
npm test
```

| Check | Actual final result | Evidence |
| --- | --- | --- |
| Root strict typecheck/build | PASS | typecheck-final.txt; compiled local tests executed. |
| Frontend typecheck + production build | PASS | client-build-final.txt. |
| Local storage/contract logic | **13 PASS** | local-tests-final.txt; fake-indexeddb, not browser persistence proof. |
| Real Chromium workflows | **4 PASS** | browser-final.txt and browser-lifecycle.json. |
| Existing backend contract regression | **18 PASS** | backend-regression.txt. |
| Existing real PostgreSQL/process regression | **27 PASS** | backend-regression.txt; actual Node restart cases reran. |

No final checks were skipped or blocked. Counts are separate final suites, not totals accumulated across repeated runs. No benchmark was run. Tests use transaction abort hooks, completion assertions, version checks and browser readiness rather than race-selecting sleeps. Browser tests have one worker, zero automatic retries and bounded waits. PostgreSQL regressions used the existing project-owned loopback cluster/dedicated test DB, without modifying system service. Backend source/tests/migration/setup hashes match Phase1. Fake IndexedDB tests do not certify real disk durability; native browser tests supply the actual lifecycle evidence.

## Bugs, complexity and remaining limits

Fixed initial test-context type and CSS declaration errors. Vite's Windows path resolver hit sandbox spawn EPERM; approved execution resolved it, with failed output retained. Used an explicit React namespace at render to avoid depending on an implicit JSX transform setup. Review corrected saved-null-base fallback that could rebase to a later clean fixture; a regression now preserves base/commonBase null. Synthetic outcome equality now ignores member order rather than rejecting equivalent JSON. All affected local/browser checks were rerun on final source.

Expected primary-key lookup/update costs follow IndexedDB indexes, roughly logarithmic in retained entries plus serialized payload bytes; implementation-specific cost and transaction contention are not constant-time guarantees. `toArray` list rendering is O(W), pending count O(W), hash/canonicalization O(B) for valid envelope size. Storage grows O(WB+MB+NB) for work, retained mutation/receipt history and clean rows. No pruning is implemented and no latency numbers are invented. The narrow schema has no arbitrary dependency graph or orchestration framework.

Unsupported/unverified: eviction, cleared storage/profile removal, private-profile lifetime, power/OS/hardware crash, forced browser termination, browser-engine compatibility beyond tested Chromium, competing tabs, user-independent long-term retention, offline cold loading and database incarnation replacement. No service worker, API calls, background retries, real acknowledgments, authoritative pull, multi-client convergence, conflict-resolution UI or deployment was added. Development Vite asset/HMR traffic is not sync traffic. App authoring is local and unauthenticated; no public exposure/security claim. A synthetic seam cannot certify server truth.

## Interview questions and independent exercise

| Question | Answer outline |
| --- | --- |
| Why separate draft and immutable queue? | Draft remains editable; an issued logical operation must retain stable identity/content across future attempts. |
| Why queue/work in one transaction? | Prevent either half from persisting without the other; test abort after the first write. |
| Why hash before opening Dexie transaction? | Unrelated asynchronous work can make IndexedDB inactive/auto-commit; only storage requests belong inside. |
| Why reread draft version after hashing? | An edit might occur during preparation; reject stale prepared content instead of freezing it. |
| Why is queued different from server accepted? | Phase2 has no transport or terminal server outcome; local commit proves only local storage. |
| What does real process restart establish? | Same profile/origin recovers completed writes in the tested environment; reload and mock storage cannot establish that lifecycle. |
| Why preserve old base and historical receipt separately from latest clean record? | Avoid silent rebase and rollback when future remote state advances. |
| What does default durability leave unproven? | Eviction, physical loss, OS/power crash and cross-browser long-term guarantees. |

**Owner exercise, not claimed completed:** Independently add a variant that saves/freezes a mutation, closes/relaunches its browser profile, then attempts edit and requeue through both UI and LocalStore methods. Assert original ID/canonical/hash and active slot cannot change. Inspect App.act, saveDraft, freeze and the persistent-profile test helpers; explain which transaction check prevents each attempted change. Existing tests provide reference mechanisms, not proof of your independent work.

## Acceptance matrix and Phase 3 gate

| # | Required item | Result | Concrete support |
| --- | --- | --- | --- |
| P2-A01 | Existing contracts/status honored | PASS | Alignment above; environment.json 11 unchanged Phase1 hashes; backend regressions. |
| P2-A02 | Runnable minimal React/TypeScript UI | PASS | main.tsx; client-build-final.txt; browser-final.txt. |
| P2-A03 | Dexie persists drafts/local states | PASS | local draft/edit/reopen tests and browser reload. |
| P2-A04 | Atomic server-compatible freeze | PASS | conformance, native abort and freeze tests. |
| P2-A05 | Stable client/mutation/record/base identity | PASS | local create/conformance; lifecycle canonical evidence. |
| P2-A06 | One outstanding mutation per record | PASS | double freeze/edit rejection and locked browser workflow. |
| P2-A07 | No silent envelope edit/regeneration/drop | PASS | immutable/reload/requeue tests; queued discard rejection. |
| P2-A08 | Local persistence distinguished from server acceptance | PASS | explicit UI copy; browser status assertions; zero API calls. |
| P2-A09 | Aborts/errors cannot leave split/phantom state | PASS | native IndexedDB abort + UI put exception, local rollback tests. |
| P2-A10 | Reload retains completed work | PASS | first browser case compares exact metadata after reload. |
| P2-A11 | Real full browser close/relaunch retains profile work | PASS | F5 lifecycle browser case; distinct PID lifecycle JSON. |
| P2-A12 | Independent profiles do not share state | PASS | fresh browser empty and separate local DB tests. |
| P2-A13 | Loaded-app offline authoring, no cold-load claim | PASS | offline browser case; README/protocol limitations. |
| P2-A14 | Deterministic tests executed/evidenced honestly | PASS | 13 local +4 browser logs, no skips/retries; synthetic labels. |
| P2-A15 | No undocumented backend regression | PASS | unchanged hashes; 18+27 regressions passed. |
| P2-A16 | Documents/evidence/status reflect actual scope | PASS | updated current docs; full F targets remain NOT RUN. |
| P2-A17 | No Phase3+ sync/ack integration/resolution UI | PASS | no fetch/API path/controller in client; network test zero requests. |
| P2-A18 | Manageable learning/source scope | PASS | one UI, contract copy, one storage class, small configs and focused suites; no extra framework. |

**PHASE 2 COMPLETE.** Ready for owner review before Phase3. No current hard acceptance blocker; this does not authorize transport implementation. Phase3 must first preserve the existing immutable envelope and transaction boundaries when adding attempt marking/replay/real acknowledgments.

**STOP — Phase 2 only. Do not start Phase 3 without owner approval.**
