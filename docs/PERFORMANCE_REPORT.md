# Performance report

Measured2026-11-05. Status **PASS for the bounded experiment matrix**; not production capacity/SLA evidence. [Raw4010 observations](evidence/phase-7/bench-raw.json), [actual command log](evidence/phase-7/bench.txt), [benchmark source](../scripts/bench.mjs), [release checks](evidence/phase-7/release-check.json). Correctness evidence is separate from timing evidence.

## Reproduction and safety

```powershell
.\scripts\local-postgres.ps1 -Action Start
$env:TEST_DATABASE_URL='postgresql://syncproof@127.0.0.1:55432/syncproof_test'
npm run build
node scripts/bench.mjs --smoke --seed=20261105
node scripts/bench.mjs --seed=20261105
.\scripts\local-postgres.ps1 -Action Stop
```

Leave3000/5174 free; do not leave a normal app/test server running. Browser executables are installed with `npx playwright install chromium` after setting PLAYWRIGHT_BROWSERS_PATH to `.local/browsers` as README shows. The script sets that project path BEFORE dynamically importing Playwright. Smoke is a small plumbing check and is NOT pooled into reported timings. Outputs overwrite latest bench-raw/bench-smoke; archive them separately to retain another measurement run. No application config/data reset or public bind occurs.

Every experiment/repetition uses a random generated syncproof_bench_* schema in the dedicated test DB, unchanged migrations/server and actual browser modules. Finally closes only owned Node HTTP/Vite/Chromium resources and drops only that validated schema. No developer/public schema or saved user profile is cleared. Source hash, script hash, seed and environment are retained in the raw file. Full-run deadline12 minutes; errors make status FAIL rather than filling missing values.

## Environment and measurement contract

- Windows 10.0.26200 x64, Node v24.15.0; npm11.12.1 from the tested toolchain. PostgreSQL18.6 UTF8, READ COMMITTED, fsync/synchronous_commit/full_page_writes ON, loopback55432; application pool max12. Chromium 156.0.8078.4 headless, Playwright1.64.1, Vite8.3.5, Dexie4.4.7. No HEAD commit; SHA-256 identifies source.
- CPU AMD Ryzen AI 9 HX 370 w/ Radeon 890M, 12 cores/24 logical processors. RAM 24,823,836,672 bytes (23.12GiB). Observed disk SSD/NVMe, 512,110,190,592 bytes. These are discovered host facts, not claims about isolated available resources.
- Fixed seed20261105; fixture IDs/payloads derive from that seed. Notes cycle128/256/512 ASCII fill plus a short seed/index prefix and supplementary Unicode; actual body/record bytes are retained. Record counts100/500/1000 have10% seeded tombstones. Fixtures insert synthetic rows directly BEFORE measurement with no receipts; measured accepted/duplicate/conflict requests use the real API. Browser freeze generates real random mutation IDs; values/workload are seeded, not a deterministic-ID replacement protocol.
- Two independent schema/context repetitions. HTTP groups:5 untimed warmups then100 observations per repetition. Combined browser install/validate:3 warmups then50 each (100 pooled). Foreground clean/draft pulls:one untimed call then10 per mode/repetition (20 pooled). Queue scan:100/repetition. Full foreground reconciliation:one untimed cycle then5/repetition (10 pooled). Same-record race:10 rounds/repetition; distinct-record concurrency100 requests/repetition in groups of1/2/10/20, with untimed connection warmup.
- Node/browser performance.now are monotonic clocks. Median is the middle value (average of middle pair for even n); p95 is empirical nearest rank ceil(.95*n). p95 is omitted when pooled n<100. Raw per-repetition n/min/median/p95/max remains available. These are empirical sample statistics, not confidence bounds or SLAs; pooled samples are not proof of independent identical distributions.

| Measurement | Included | Excluded / warning |
| --- | --- | --- |
| Direct HTTP POST/GET | Node fetch start through complete arrayBuffer, loopback3000, Express validation/hash/SQL commit/JSON serialization and body transfer | Request preparation/canonical hash on caller and client JSON parse; no browser/Vite/DOM. |
| Browser validateSnapshot | Actual validator CPU around in-memory decoded snapshot | Network and IndexedDB; measured separately. |
| Browser applySnapshot | Actual validation, scan of already-known rows, all atomic IndexedDB puts/metadata commit | Network/DOM; unchanged rows still rewritten. Separate validator ran just before this, warming validation code/cache. |
| Foreground reviewLatest | Unknown scan, GET via Vite5174 proxy, validation and IDB commit | Startup, draft preparation, DOM. Clean versus pending drafts use different retained work but identical server fixtures. |
| Foreground synchronize | One precommitted unknown same-ID replay, first pull, queued Q-1 writes, acknowledgment transactions, final pull | Save/freeze/crypto and initial unknown commit fixture outside timer; Q includes that one unknown. History grows across cycles. |
| pending | Actual phase-index query, object materialization and unknown-first ordering | Network/commit; active Q only, not all retained history. |
| Growth | Actual SQL relation/table/index allocation plus average stored request/response sizes | No VACUUM or extrapolated future growth. |

## Mutation latency

Expected200/409 outcomes were asserted; no caught transport/assertion errors. Direct HTTP code performs no explicit retry. Replay repeatedly uses the FIRST warmup request (fixed smaller body), whereas accepted/conflict bodies cycle sizes; category differences therefore do not isolate a single causal cost. Conflicts here are valid terminal stale inputs, not transient failures.

| Case | n | Median ms | Empirical p95 ms | Min–max ms |
| --- | --- | --- | --- | --- |
| post_accepted | 200 | 4.995 | 7.422 | 3.215–16.953 |
| post_replay | 200 | 3.401 | 4.617 | 1.951–45.179 |
| post_conflict | 200 | 4.156 | 6.360 | 2.745–13.682 |

## Complete snapshots and browser installation

GET bytes are uncompressed response BODY bytes, not HTTP headers. Every snapshot has the exact count and includes N/10 tombstones. All measured installs are the already-known-state path after warmup, not empty-store first installation or cold browser launch.

| N | Body bytes | HTTP median / p95 ms (n200) | Validate median / p95 ms (n100) | Combined install median / p95 ms (n100) |
| --- | --- | --- | --- | --- |
| 100 | 45,306 | 2.834 / 4.568 | 1.700 / 2.500 | 28.550 / 44.800 |
| 500 | 227,360 | 8.581 / 13.546 | 9.700 / 14.200 | 126.050 / 177.700 |
| 1000 | 455,017 | 14.038 / 28.325 | 20.750 / 28.300 | 286.350 / 478.600 |

Browser installation costs substantially more elapsed time than transferring these localhost bodies. This implementation issues per-row awaited puts even for equal revisions. That is a potential explanation, not a controlled proof of which suboperation dominates. Validation is primed and the combined timer includes more than writes. No production optimization was made.

## Queue and foreground measurements

| N / Q | pending median / p95 ms (n200) | Clean pull median ms (n20) | Pull with Q drafts median ms (n20) | Full synchronize median ms (n10) |
| --- | --- | --- | --- | --- |
| 100 / 10 | 1.750 / 2.900 | 43.100 | 38.500 | 280.200 |
| 500 / 50 | 3.300 / 4.900 | 163.550 | 162.600 | 1250.750 |
| 1000 / 100 | 4.600 / 6.900 | 400.900 | 396.400 | 2193.800 |

No p95 for foreground groups with fewer than100 observations. Pending draft preservation, Q acknowledgments, no residual unknown/conflict/block, final snapshot application, no work left and one receipt per measured new mutation were asserted. One planned same-ID recovery per cycle is explicit. Internal foreground transport retry counts were NOT INSTRUMENTED; the normal bounded retry engine remains active, and zero residual unknown is not evidence of zero intermediate retries. No delivery failure was intentionally injected in this performance workload.

N and Q increase together in these three foreground workloads, so the elapsed differences do not isolate queue cost from snapshot size. pending isolates a narrower local operation, while retained history grows each cycle. Clean and draft-pull differences at these n are not evidence that drafts make the system faster.

## Concurrency and same-record contention

Distinct-record requests are valid independent creates;100 accepted/repetition, zero terminal conflicts/errors. Latency below pools both repetitions, while throughput lists each repetition rather than hiding run-to-run variation. Width20 exceeds the12-connection application pool and can queue. No claim of linear scaling or sustained capacity.

| Writers | Request median / p95 ms (n200) | Rep1 req/s | Rep2 req/s | Success rate |
| --- | --- | --- | --- | --- |
| 1 | 5.715 / 8.449 | 135.7 | 235.3 | 100% |
| 2 | 6.958 / 10.941 | 208.9 | 359.7 | 100% |
| 10 | 20.867 / 31.355 | 372.8 | 535.0 | 100% |
| 20 | 28.378 / 68.325 | 509.5 | 446.9 | 100% |

Same-record races are SEPARATE. Every round seeds one live1 outside request timing; all width requests submit base1. Exactly one commits2, others receive409, and SQL postconditions verify2. There are20 total rounds per width. Race per-request timers use the group start and include JSON decode; race batch throughput ALSO includes round seeding/preparation/SQL checks. These differ from the direct accepted latency clock and are not equal-work comparisons.

| Writers | Requests pooled | Accepted / expected conflicts | Request median / p95 ms | Rep1 / Rep2 batch req/s |
| --- | --- | --- | --- | --- |
| 1 | 20 | 20 / 0 | 6.035 / — (n<100) | 99.3 / 182.9 |
| 2 | 40 | 20 / 20 | 7.344 / — (n<100) | 160.0 / 249.9 |
| 10 | 200 | 20 / 180 | 22.783 / 41.444 | 224.0 / 359.8 |
| 20 | 400 | 20 / 380 | 37.926 / 68.266 | 277.3 / 381.7 |

Expected conflict rates are0/50/90/95% for widths1/2/10/20 in this workload. They show whole-record revision contention, not random service failures. Throughput varied and was non-monotonic across repetitions; machine/cache/flush/background effects were not isolated, so no causal explanation or universal optimal writer count is established.

## Retained database growth and actual plans

Both repetitions produced the same allocated relation sizes at these stages.100 inspection rows start with10 seeded tombstones and zero receipts; updates accumulate100/500/1000 receipts. Ten more real deletes end with20 tombstones and1010 receipts. Numbers below are ACTUAL bytes including allocated storage/indexes/TOAST; dead versions/free page space may be present. No vacuum/compaction and no future-growth estimate.

| Stage | Receipts | Tombstones | Inspections total bytes | Receipts table+TOAST bytes | Receipt index bytes | Receipt total bytes |
| --- | --- | --- | --- | --- | --- | --- |
| seed | 0 | 10 | 98,304 | 8,192 | 8,192 | 16,384 |
| receipts_100 | 100 | 10 | 98,304 | 303,104 | 16,384 | 319,488 |
| receipts_500 | 500 | 10 | 98,304 | 1,392,640 | 49,152 | 1,441,792 |
| receipts_1000 | 1000 | 10 | 98,304 | 2,760,704 | 73,728 | 2,834,432 |
| after_10_more_deletes | 1010 | 20 | 98,304 | 2,760,704 | 73,728 | 2,834,432 |

Unchanged allocated bytes after ten deletes reflect existing page allocation, not zero logical history growth. Canonical requests and response JSON duplicate substantial payload information; measured average byte columns are in raw growth observations. Long-lived M/N/H remain unbounded by design. The script retains EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) for ordered snapshots and receipt lookup. The access nodes observed for each are:

- Rep1, complete ordered snapshot, N=100: Sort, Seq Scan.
- Rep1, complete ordered snapshot, N=500: Sort, Seq Scan.
- Rep1, complete ordered snapshot, N=1000: Sort, Seq Scan.
- Rep1, receipt lookup by mutation_id: Index Scan.
- Rep2, complete ordered snapshot, N=100: Sort, Seq Scan.
- Rep2, complete ordered snapshot, N=500: Sort, Seq Scan.
- Rep2, complete ordered snapshot, N=1000: Sort, Seq Scan.
- Rep2, receipt lookup by mutation_id: Index Scan.

These small hot-table plans do not imply a plan or complexity guarantee at larger sizes. Primary-key B-trees exist for inspection/receipt identities; actual scans/sorts depend on planner statistics and data size.

## Bottlenecks, alternatives and limitations

| Observation | Supporting measurement | Potential explanation, not proven cause | Alternative / decision |
| --- | --- | --- | --- |
| Snapshot grows with N |45,306→455,017 body bytes at100→1000 | Complete retained rows transferred each pull | Incremental log/checkpoints could reduce transfer but require another protocol; DEFERRED. |
| Browser apply dominates this localhost read |1k HTTP median14.038ms versus combined install286.350ms, unlike timing boundaries | Validation, known-row scan and individual IDB puts/commit all included | Skipping identical puts/batching would need measured comparison and invariant regressions; NO optimization added. |
| Queue/reconciliation increases with workload |pending Q10→100 median1.750→4.600ms; full N/Q workloads280.200→2193.800ms | More materialization/network/crypto/receipts/IDB; N and Q confounded | Keep bounded manual demo; do not claim isolated per-mutation causal slope. |
| Concurrency variation is large |Both per-repetition throughput columns | Warm caches, durable commit batching, pool queueing or background load may contribute | No architecture ranking, production capacity claim or unsupported optimization. |
| Receipt allocation grows |1k receipts total2,834,432 bytes in this fixture | Retained canonical+response and index/page allocation | Pruning/compaction requires a safe retention protocol; DEFERRED. |

The model remains O(N) records/O(NB) transfer/validation per complete pull, plus sort/indexed writes, O(B) canonical/hash work and approximately O(Q) returned pending data (generic sort can be O(Q log Q)). No unconditional O(1) SQL claim; locks/commits matter. No product bottleneck demonstrated a correctness/usability blocker, so product code stays unchanged.

NOT MEASURED: cold app/browser/server startup, empty-store install timing, independent variation of N and Q in full reconciliation, intermediate foreground retry counts, WAN/mobile/real deployment, sustained load, arbitrary data sizes, storage eviction/power failure, physical weeks, cross-machine/browser/OS comparison or third-party tool benchmarks. Tests and benchmark ran sequentially; lightweight authoring/tool activity and uncontrolled Windows/OneDrive/background work can still add noise. The host was not reserved or thermally/power controlled. Values cannot be treated as production promises.

## Execution honesty

Initial smoke failed before any samples because static Playwright import chose its default browser cache. The script now assigns the project browser path before dynamic import. The [failed smoke](evidence/phase-7/bench-smoke-attempt-1.json) is retained; the corrected [smoke](evidence/phase-7/bench-smoke.json) and full run passed. No failed run was mixed into successful statistics. No benchmark numbers were interpolated or invented. Optional performance plots were not produced; reproducible tables and all raw samples are supplied without adding a plotting dependency.
