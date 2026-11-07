# Phase 5 engineering report

2026-11-04, Asia/Calcutta. **PHASE 5 COMPLETE — ready for owner review of the Phase 6 gate.** A01–A24 pass within the tested scope below. Phase6/7 were not started. The owner's independent exercise remains theirs to perform.

## Alignment and exact inventory

Before edits, inspected README/STATUS, charter, protocol, invariant registry, roadmap, decisions/evidence and Phase0–4 reports; actual server contracts/mutations/app/db/migration/integration/process tests; actual client storage/contract/push/pull/UI; browser configuration and owned PostgreSQL scripts. No applicable AGENTS.md was found. Verified Phase4 evidence rather than accepting the supplied 22/22 claim: final backend45, local13, push9, snapshot4 and browser22 regressions passed again this phase.

Actual conflict shape is `{protocolVersion:1,mutationId,replayed,outcome:{kind:'conflict',reason,expectedRevision,remoteAtDecision}}`. Dexie v1 stores work (draft/queued/terminal_conflict), mutations (queued/outcome_unknown/acknowledged/terminal_conflict with immutable envelope/canonical/fingerprint/commonBase and terminal receipt), cleanRecords and metadata. Unknown is durable before POST; normal shared-guard reconciliation remains recover→pull→push→pull. Revisions are validated positive decimal PostgreSQL BIGINT strings, compared as BigInt; strict existing business validation/canonicalization/SHA-256 remain authoritative. Relevant invariants: INV-CONFLICT-01, INV-TOMB-01, INV-UNKNOWN-01, INV-IDEMP-01, INV-ONE-01, INV-ACKCLIENT-01, INV-DRAFT-01, INV-REV-01 and conditional INV-RECON-01. Alignment anticipated only client storage/controller/UI, targeted tests, npm script and documentation changes.

No protocol contradiction required redesign. Existing create-identity collisions cannot implicitly upsert; the inspector permits keep-server or manual copying to a separate new inspection. A missing/non-live authoritative record cannot be used as a resolution update. [P5 decisions](../DECISION_LOG.md#phase-5-implemented-decisions--2026-11-04) document these narrow choices.

All paths below resolve under `<USER_HOME>/OneDrive/Documents/ChatGPT/SYNCPROOF`:

| File | Exact purpose |
| --- | --- |
| [client/lib/storage.ts](../../client/lib/storage.ts) | Optional resolution provenance/intent/local-decision fields; begin/cancel/keep-server; atomic confirmed delete and resolution freeze with draft/remote rechecks. |
| [client/lib/push.ts](../../client/lib/push.ts) | Shared-guard reviewLatest: recover unknown then pull, without sending queued entries. Existing transport/retry/receipt engine reused. |
| [client/conflict.tsx](../../client/conflict.tsx) | New compact four-part inspector and explicit reviewed choices; keep/delete confirmations and no-restore explanation. |
| [client/main.tsx](../../client/main.tsx) | Integrate inspector/current conflict selection, editable resolution/cancel/intent/base, confirmed delete and audit history labels. |
| [tests/resolution.test.ts](../../tests/resolution.test.ts) | Five local validation/atomicity/lock/integrity cases. |
| [tests/browser/resolution.spec.ts](../../tests/browser/resolution.spec.ts) | Nine real PostgreSQL/independent Chromium lifecycle and decision cases. |
| [package.json](../../package.json) | Add test:resolution only; no dependency added. |
| [README](../../README.md), [STATUS](../../STATUS.md) | Current behavior, commands and authorization gate. |
| [Protocol](../PROTOCOL_SPEC.md#14-phase-5-explicit-manual-decisions--2026-11-04), [decisions](../DECISION_LOG.md#phase-5-implemented-decisions--2026-11-04) | Exact client overlay and unchanged server contract. |
| [Invariants](../INVARIANTS_AND_FAILURE_MATRIX.md#phase-5-explicit-resolution--2026-11-04), [evidence register](../ENGINEERING_EVIDENCE_REGISTER.md#phase-5-explicit-resolution--2026-11-04) | P5-E01–P5-E08 actual checks and remaining gaps. |
| [Roadmap](../ROADMAP.md) | Authorization/status paragraph only; eight phases retained. |
| [This report](PHASE_5.md) | State machine, results, acceptance, limitations and independent exercise. |
| docs/evidence/phase-5/ | backend.txt, local-regression.txt, push-regression.txt, snapshot-regression.txt, local.txt, local-final.txt, browser-attempt.txt, browser-targeted.txt, browser-final.txt, browser-strengthened.txt, build.txt, typecheck.txt, typecheck-final.txt, client-check.txt, f9.json, environment.json, documentation-check.json and regression-browser-lifecycle.json/regression-f1-observation.json/regression-browser-recovery.json. |

No backend mutation/read implementation, SQL migration, contract, dependency lockfile, proxy, prior test source or prior report was changed by Phase5. Existing browser regressions automatically refresh three fixed-path artifacts: docs/evidence/phase-2/browser-lifecycle.json, docs/evidence/phase-3/f1-observation.json and docs/evidence/phase-3/browser-recovery.json. Their latest values were also copied into phase-5/regression-*.json. Prior logs/reports remain retained. [Source audit](../evidence/phase-5/environment.json) compares ten backend/dependency/helper files with retained appropriate Phase1/2/4 hashes. There is no HEAD commit; source SHA-256 identifies this uncommitted workspace. Git lists the historical project as untracked, so it is not a phase-change inventory. No reset or commit was performed.

## State machine and supported actions

| State / trigger | Durable result |
| --- | --- |
| Terminal conflict selected | Original common base, exact rejected operation/payload, immutable historical receipt/ID/hash and separate latest clean record displayed. No automatic push. |
| Review latest | Existing guard recovers unknown IDs then pulls; choice enabled only for currently reviewed revision and active terminal conflict. |
| Confirm keep server | Atomically add local decision metadata and remove unresolved work; no server write; immutable receipt/proposal and latest clean remain. Cancel confirmation changes nothing. |
| Reapply / manually combine | Persist editable work with resolutionOf, reviewed base/commonBase and update/delete intent. Reapply copies rejected values; manual combine seeds remote values and lets the human edit only existing fields. No new ID yet. |
| Save / explicit freeze | Validate values, prepare new UUID/canonical/hash outside transaction; recheck version/remote, atomically add immutable mutation/resolves and lock work. Failure preserves prior committed draft/evidence. |
| Cancel editable resolution | Atomically restore original conflict work from immutable rejected operation; unsent resolution draft is abandoned explicitly. |
| Send pending | Existing engine checks durable integrity, writes outcome_unknown before request and uses identical issued ID on every retry. No edit/second resolution/keep-server while queued or unknown. |
| Valid success / second conflict | Existing acknowledgment transaction stores terminal outcome and monotone clean state. Success clears work. Second conflict stays locked/actionable with own proposal/receipt and predecessor pointer; earlier evidence retained. |

Rechecking clean revision during freeze catches locally observed changes. A remote commit can still happen after review; the unchanged server revision check decides. Disabled controls supplement storage-level uniqueness and transaction rechecks. One outstanding network mutation per record/profile remains the rule; old terminal receipts are historical evidence, not a queue chain. One active controller/tab per profile is still required.

Delete inspection on a clean live record requires confirmation and queues a revision-checked delete/null payload. Stale delete versus newer live permits keep-server or a newly confirmed delete; a subsequent race can conflict again. Tombstones offer keep-server only, for both stale update and stale delete. No restore, stale update→create, implicit upsert, physical row deletion, automatic extra delete or pruning. Text can be copied manually outside that record. Intent and reviewed base appear before freeze; delete draft fields are read-only.

## Real two-client walkthroughs and targeted tests

Browser1–9 below correspond, in order, to [resolution.spec.ts](../../tests/browser/resolution.spec.ts) and the nine `resolution.spec.ts` lines in [final browser output](../evidence/phase-5/browser-strengthened.txt). Synthetic initial record creation and authorized later writes go through the actual existing mutation service; conflicting A/B edits are made through independent browser UIs. Per-test generated PostgreSQL schemas and independent IndexedDB contexts isolate data; these are not two tabs sharing one store.

| Case / exact test name | Observed client/server result |
| --- | --- |
| B1 `inspector and confirmed keep-server preserve audit; cancel creates no server mutation` | Both start4; A commits5, B conflicts4. Base4/local proposal/receipt preserved; review5; dismiss confirmation changes nothing; confirmed keep stores decision with identical receipt count and no POST. |
| B2 `new reapply and manual combine use new IDs; second conflict preserves both histories` | B reapply is new ID/base5; authorized writer reaches6 first; B gets second conflict without overwriting6. New manual candidate/base6/newID commits7 with chosen notes. Both clean caches7; prior canonical/history preserved. |
| B3 `reapply commits revision 6 and both clients reconcile; delayed response keeps one locked resolution` | Duplicate prepare clicks yield one draft/new frozen ID, new fingerprint/base5. Real commit6 response held; Reconcile disabled and only one resolution. Release; both independent clean caches6 with B values. SQL canonical matches client; original receipt unchanged. |
| B4 `F9 committed resolution dropped reply, newer write and graceful browser restart replay same ID` | SQL verifies commit6 and exactly one receipt before response abort. Unknown persisted. Whole Chromium closes; writer advances7; same profile reopens in different process with identical ID/hash/envelope and active unknown lock. Same-ID replay matches original terminal outcome6; subsequent pull gives clean7, exactly one resolution child. |
| B5 `resolution acknowledgment native transaction abort preserves unknown and retries identical ID` | Real commit6, native receipt put throws; acknowledgment rolls back and unknown remains. Retry receives replayed original receipt; no duplicate effect and old canonical preserved. |
| B6 `update against retained tombstone disables restore after simulated weeks and keeps deletion` | Prepared stale update/base5 meets tombstone6, receives record_deleted conflict after virtual21-day jump. Reapply/combine disabled; explicit keep retains tombstone6. |
| B7 `stale delete versus newer live record requires explicit safe choice` | Delete/base5 conflicts at live6; new destructive confirmation prepares new delete/base6; explicit queue/send creates tombstone7. |
| B8 `stale delete versus tombstone requires explicit safe choice` | Delete/base5 conflicts against tombstone6; new delete disabled; keep retains6 with no automatic increment. |
| B9 `native resolution freeze rollback, invalid values and repeated queue retain original conflict` | Invalid status rejects; native work-put failure after mutation insertion rolls back whole freeze, keeping draft/original evidence and no extra queue. Rapid queue clicks create one ID; reload retains it. |

F9 actual run: [f9.json](../evidence/phase-5/f9.json) records resolution6776cd3e-607a-4369-a4fb-2836343ee7ce, original conflict1a82f10a-2396-414f-ac1b-4a8b5c1eccd1, Chromium PIDs8648→26868, graceful=true, receipt6/current7, one receipt. Assertions additionally check retained fingerprint/envelope/lock, replayed logical outcome equality and clean7. Temporary dedicated profile is removed after closing browser and absolute containment validation. This is graceful closure, not forced kill or power-loss recovery.

Five [local tests](../evidence/phase-5/local-final.txt) exercise actual LocalStore with explicitly simulated fake-indexeddb receipts: confirmation/history; new-ID/base/provenance/locks; invalid U+0000/atomic abort/changed-remote/cancel; confirmed delete/tombstone second conflict; out-of-range revision and corrupted resolution fingerprint blocked before transport. Earlier local/reopen tests cover absent optional fields; Dexie stays v1 because stores/indexes are unchanged. No migration, clearing or rewriting legacy data is needed.

## Commands, actual results and failure honesty

Run from root with project-owned PostgreSQL127.0.0.1:55432 and `$env:TEST_DATABASE_URL='postgresql://syncproof@127.0.0.1:55432/syncproof_test'`. Chromium is installed under ignored .local/browsers; browser tests own port3000 and Vite5174. Normal server must not occupy3000 during tests.

```powershell
npm run typecheck
npm run check:client
npm run build
npm test
npm run test:local
npm run test:push
npm run test:snapshot
npm run test:resolution
npm run build:client
npm run test:browser -- tests/browser/resolution.spec.ts
npm run test:browser
```

| Final check | Actual result / artifact |
| --- | --- |
| Backend | 45 PASS (18 contract +27 real PostgreSQL/process), [backend.txt](../evidence/phase-5/backend.txt). |
| Existing local / push / snapshot | 13 /9 /4 PASS, [local](../evidence/phase-5/local-regression.txt), [push](../evidence/phase-5/push-regression.txt), [snapshot](../evidence/phase-5/snapshot-regression.txt). |
| Resolution local | 5 PASS, [local-final.txt](../evidence/phase-5/local-final.txt). |
| Full final browser | 31 PASS (22 existing +9 resolution), zero skipped/failed, [browser-strengthened.txt](../evidence/phase-5/browser-strengthened.txt). |
| Strict root/client checks | PASS, [typecheck-final](../evidence/phase-5/typecheck-final.txt), [client-check](../evidence/phase-5/client-check.txt). |
| Root/client builds | PASS (root build in backend command; client in [build.txt](../evidence/phase-5/build.txt)). |
| Environment/source/isolation and docs | [environment.json](../evidence/phase-5/environment.json), [documentation-check.json](../evidence/phase-5/documentation-check.json). |

Earlier initial targeted attempt had3 PASS/2 FAIL: wrong parent conflict was selected after second conflict, disabling review/actions; fixed current active pointer and keyed review state. F9 setup was interrupted by Vite HMR while app source was edited during that run, resetting form/UI state; stopped concurrent app edits during browser execution. [Original failed output](../evidence/phase-5/browser-attempt.txt) retained. Corrected8-targeted run passed, then full30 passed. Final strengthened31-case run adds normal reapply/delayed-response assertions and tighter F9/tombstone checks. Earlier four-unit,8-targeted and30-browser outputs are retained but NOT added to final distinct counts. An initial source-audit comparator used the pre-client Phase1 lockfile hash; comparing the retained Phase2 lockfile correctly confirms no dependency change. No required final test remains failed/blocked/skipped.

Environment: Windows11 x64, Node24.15.0, PostgreSQL18.6 UTF8/READ COMMITTED with fsync/synchronous_commit/full_page_writes on; Chromium156.0.8078.4, Playwright1.64.1, Dexie4.4.7, TypeScript7.0.2, Vite8.3.5. Source audit found zero generated test schemas left. Only the project-owned cluster is stopped after testing; existing system service is untouched. No benchmark was run.

## A01–A24 acceptance

| Gate | Result | Exact support |
| --- | --- | --- |
| A01 actual inspection/alignment | PASS | Alignment above, prior-regression logs, environment source audit. |
| A02 four distinct inspector views | PASS | B1/B2, ConflictPanel, protocol§14. |
| A03 confirmed local keep-server/no POST/audit | PASS | B1, local1, immutable original receipt and SQL receipt-count equality. |
| A04 new validated immutable resolution ID/base/hash | PASS | B2/B3, local2/5, SQL canonical equality. |
| A05 explicit supported-field manual combination | PASS | B2 clean7/chosen notes, form/save/queue path; no auto send. |
| A06 one outstanding/unknown lock | PASS | B3/B4/B9; local2. |
| A07 second conflict/provenance/current state | PASS | B2 newID/base5 rejection at6, child/base6 commits7. |
| A08 atomic freeze/queue/association/lock | PASS | B9 native abort; local3. |
| A09 unchanged canonical API/revision gate | PASS | B2/B3, backend45, unchanged server/hash audit. |
| A10 F9 real commit-before-drop/sameID/one effect | PASS | B4, f9.json, SQL commit6/one receipt/replay equality. |
| A11 local acknowledgment abort/recover | PASS | B5 native IndexedDB abort after SQL commit6. |
| A12 actual graceful restart/retained evidence | PASS | B4 same profile, distinct PIDs, ID/hash/envelope/lock checks. |
| A13 historical outcome cannot regress clean | PASS | B4 receipt6 then clean7; existing push/snapshot delayed/history regressions. |
| A14 stale update/tombstone no restore | PASS | B6 record_deleted at6; disabled reapply/combine and keep-only. |
| A15 stale delete/live explicit new confirmed delete | PASS | B7 delete/base6→tombstone7; local4 confirmation check. |
| A16 delete/tombstone no extra increment | PASS | B8 remains6; local4 retains both receipts. |
| A17 simulated prolonged disconnection safety | PASS | B6 virtual21 days, real stale rejection; no disk-aging claim. |
| A18 duplicate/overlap/delay/refresh identity safety | PASS | B3 duplicate prepare +held response/disabled sync, B9 rapid queue/reload; existing shared-guard push tests. |
| A19 invalid/cancel/storage failure preserves work | PASS | B1/B5/B9; local1/3/5. |
| A20 real independent-client decision→reconciliation | PASS | B2 both clean7; B3 both clean6, real PostgreSQL. |
| A21 prior regressions/checks/builds | PASS | All final command/count/artifact rows above. |
| A22 precise documentation/no false full certification | PASS | Updated protocol/decisions/invariants/evidence/README/STATUS; doc audit; full demo remains unrun. |
| A23 scope remains Phase5 only | PASS | Seven code/package files; no server/dependency/harness/deployment changes. |
| A24 full report/limits/Q&A/exercise/readiness/stop | PASS | This report and following sections. |

## Complexity, tradeoffs and limitations

New candidate validation/copy/canonical hashing is O(B) in payload bytes. Indexed transactional point lookup/write work depends on store index size (roughly O(log M) each, plus copying B); cancellation/decision retains history. Existing pending scan is O(Q), bounded per-entry retries remain. Full pull is O(N) records plus bytes/known-row validation and indexed installation (roughly O(N log N)); temporary arrays/maps scale with N. History display currently scans retained mutations; receipts/tombstones/work grow with retained history. No pruning, quota/capacity or measured throughput claim.

Requiring explicit review and invalidating changed local bases costs another foreground read but avoids silently rebasing a draft. Keeping predecessor pointers and original immutable evidence avoids an unnecessary conflict graph. Local keep-server avoids a meaningless server write. Default IndexedDB durability/retained profile remain prerequisites. Native exceptions establish atomic rollback under injected failure, not physical disk exhaustion or corruption recovery.

F9 targeted interrupted resolution now has executed evidence. F7/F8 gain explicit choices/double conflict; F10 gains simulated long-offline safe decision. F1/F2/F4/F5/F6 earlier scoped variants reran; complete F3 reordered multi-client transport and full repeated F1–F10/complete eight-step demo remain NOT RUN. No formal proof, permanent global equality or conflict-free convergence during continuing writes. Eventual reconciliation requires reachable foreground opportunities, retained working storage, finite/quiescent writes and eventual user decisions.

Unsupported/unverified: competing tabs/controllers, profile deletion/eviction/private-store loss, forced browser kill, OS/power/hardware failure, arbitrary device loss and browser disk aging. Shell must be reachable after restart; no service worker/offline cold load. Unauthenticated loopback synthetic-data demo only; Origin policy retained and no public deployment/security claim. No automatic merge, CRDT, restore, background sync, cursor/change log, AI decisions, benchmarking or Phase6 generalized fault harness.

## Interview questions and owner exercise

1. Why a new ID for resolution? An ID identifies immutable content and its original terminal outcome; changing the base/payload requires another ID.
2. Why keep the old conflict receipt? It explains the server decision for that exact rejected request even when newer state exists.
3. Does reviewing latest guarantee success? No; a subsequent writer can advance the revision before submission.
4. Why distinguish draft from frozen mutation? Drafts can change; frozen network requests must survive uncertainty byte-for-byte.
5. What must local freeze commit together? New immutable envelope/hash/provenance and active work lock, with the prior draft/evidence preserved on abort.
6. What must server commit together? Revision-checked record effect and original terminal receipt, or durable conflict receipt without record effect.
7. Why recover unknown before another resolution? The first resolution may already have committed; state equality/newer revision cannot identify its outcome.
8. Why no reapply against tombstones? It would silently restore deleted data; restore is outside the accepted MVP.
9. What does graceful restart prove? The tested profile retains state and recovers after normal process close/relaunch; it does not establish forced-kill, eviction or power-failure durability.

**Independent owner exercise — NOT marked completed:** Use two independent profiles against the same local database, both at revision4. A commits5; B submits its rev4 edit and examines base4, rejected intent, immutable conflict receipt and latest5. B prepares a manually combined resolution/base5. Before B submits, A commits6. Submit B: confirm second terminal conflict, server6 and both proposals/receipts preserved. Review6, prepare a NEW resolution/newID/base6, submit to7, then reconcile both profiles and compare clean7. Explain why old IDs cannot be rebased, why receipt history matters and why continuing writers can prevent conflict-free completion. Explain recovery if rev7 committed but reply was lost (same ID first), if tombstone8 exists (no restore), the atomic boundaries above and what graceful restart leaves unproved.

Phase5 meets its scoped gate and is ready for **Phase6 review**. Owner approval remains necessary before any Phase6 implementation.

**STOP — Phase 5 only. Do not start Phase 6 without explicit owner approval.**
