# Release and publication readiness

Review date2026-11-05. **GO for owner review of a local technical demonstration. NO-GO for immediate public push/deployment.** Phase7 performs the audit and provides reviewable files; it does not choose a project license, authorize disclosure, publish or certify production security. [Machine audit](evidence/phase-7/readiness-audit.json), [license inventory](evidence/phase-7/dependency-licenses.json), [release correctness evidence](evidence/phase-7/release-check.json).

## What was actually reviewed

Candidate publishable files are Git's tracked plus untracked/nonignored files, not only HEAD. This project currently has NO HEAD commit and all existing source is untracked. No reset/reinitialize/checkout/commit/remote/push/history rewrite occurred. The scan covers candidate text up to5MB/file, known generated/private path categories, token/private-key/password-URI patterns, absolute private paths, ignore behavior, installed/lock dependency metadata and point-in-time npm advisory output. It prints file paths/categories, never matched secret values. Heuristics can miss secrets or flag examples; this is not a penetration test or certification.

- No actual token/key-shaped secret or non-placeholder database password was flagged. .env.example uses placeholder credentials. No real credential was copied into browser code or a report.
- .env/.env.local, .local PostgreSQL/profiles, node_modules, dist and dist-client are ignored. No candidate private database cluster/profile/build directory was admitted by the scan.
- Absolute local/private paths DO exist in historical reports/lifecycle evidence and preserved failed setup logs. Review/redact a publication COPY deliberately while retaining private originals. The machine audit lists exact filenames/categories, without echoing usernames/path values in this report. Do not equate these paths with discovered API credentials, and do not assume they are approved for public disclosure.
- No source Git history exists to inspect for historical secrets. This does not clear a future commit or files outside the candidate set. At publication time inspect the final staged diff and then-current history again.
- No file over5MB was flagged in the scanned candidate set. Raw benchmark data and concise logs are intentional evidence, not user inspection records. Inputs are synthetic. Do not publish .local or npm-cache logs from elsewhere on the machine.

The last scan's candidate/path counts are in readiness-audit.json because additional final report files change the candidate count; the executable scan can be rerun after any change. Existing Phase0–6 reports/evidence were preserved rather than silently scrubbed. Generated Phase7 lifecycle/failed-install artifacts can also include paths and need the same review.

## Dependencies, licensing and advisory assessment

The local lock inventory has163 package entries;119 have installed manifests. Installed SPDX metadata counts: MIT: 100, Apache-2.0: 8, ISC: 7, MPL-2.0: 2, BSD-3-Clause: 2. No installed package lacked license metadata;116 had an identifiable top-level LICENSE/LICENCE/NOTICE/COPYING filename. Platform-optional entries not installed locally use lockfile metadata only. Three installed packages without detected notice filenames—@rolldown/binding-win32-x64-msvc, pg-types and pgpass—still require manual attribution review; metadata alone is not enough. Full version/location/notice-file facts are in dependency-licenses.json.

No project license is declared and no root license file exists. **Owner selection is unresolved.** No license was automatically chosen. Confirm ownership/rights and choose terms separately before public redistribution. Preserve applicable dependency copyright/license/notice requirements when distributing dependencies or bundled code; this audit inventories facts rather than giving legal clearance. Source package metadata is not proof every bundled transitive notice requirement has been fulfilled.

`npm audit --json` completed against the npm registry with0 known reported advisories (info/low/moderate/high/critical all0) at this review time. [Raw audit](evidence/phase-7/npm-audit.json). This is neither a guarantee of no vulnerabilities nor an application security review. Do not claim vulnerability databases were unavailable: the command actually succeeded. Recheck at actual publication time.

## Trust model and fault-control safety

src/server.ts binds127.0.0.1 and validates an HTTP loopback ALLOWED_ORIGIN. Vite also binds127.0.0.1. Origin filtering is not authentication/authorization and does not stop other local processes. The owned PostgreSQL helper uses loopback55432/trust authentication; this is for synthetic local data, not sensitive/shared use. No public binding, tunnel, cloud resource, auth system or secret sharing was introduced.

Existing server process checkpoints require SYNCPROOF_TEST_PROCESS=1, NODE_ENV=test AND parent IPC. Negative tests refuse production mode/missing IPC. Normal HTTP crash/checkpoint/fault routes return404 and a test-looking header cannot activate destructive controls. [Safety observation](evidence/phase-7/fault-safety.json), [actual SQL/process output](evidence/phase-7/audit-db.txt). New Phase7 evidence destination selection only changes test artifact paths, not normal runtime behavior or fault access.

Benchmark/test/fresh-copy helpers create generated private schemas and validate owned names before cleanup. Persistent default owner demo profiles are retained; disposable check profiles/fresh copies are contained and removed. No user tables, profiles, documents or Git state were cleared. Final cleanup evidence is in release-check.json and documentation-check.json.

## Reproducibility actually demonstrated

- Main Windows environment:123 named product/audit test cases pass, including real PostgreSQL, actual Node forced termination, actual graceful Chromium restarts, both ordered demo repetitions, strict checks and builds. Three process checks repeat across commands; do not inflate distinct totals.
- Fresh local source copy: network-enabled exact lockfile install with lifecycle scripts disabled; backend/client builds, strict checks,18 contract cases and real isolated migration/HTTP smoke. [Result](evidence/phase-7/fresh-copy.json), [output](evidence/phase-7/fresh-copy.txt). This is not a remote clone on a different host, a fresh Windows install or cross-platform evidence.
- Initial offline install failed ENOTCACHED for a locked tarball; the failure and cleanup are retained separately. It demonstrates why complete offline npm cache availability is not promised. The normal registry-enabled retry passed. No lockfile update or lifecycle-script workaround was hidden.
- Two-profile launcher: separate persistent Chromium stores/client IDs verified headlessly with disposable profiles, then closed/removed. [Check](evidence/phase-7/two-client-launch.json). Default launcher opens visible windows for the owner and retains their data; no owner exercise was completed for them.
- Benchmarks: two seeded isolated repetitions, actual raw samples/plans/sizes, no test/package-install workload running concurrently. See [performance report](PERFORMANCE_REPORT.md) for boundaries and noise. No desktop UI timing, cold-start or public service capacity claim.

No screenshot or video was produced. Those are optional manual artifacts; no synthetic image is represented as a real application capture. No external peer review or owner mastery is inferred.

## Publication checklist for a separate owner decision

- [ ] Select repository owner/name/privacy; no remote has been created.
- [ ] Choose project license after rights review; confirm dependency attribution/notice obligations, including installed packages without detected notice files and uninstalled platform dependencies.
- [ ] Review final staged files and secret history at the actual publication moment; exclude generated/private data even if .gitignore exists.
- [ ] Review/redact historical absolute local paths in a publication copy, retain private originals and label any sanitized evidence honestly.
- [ ] Re-run supported correctness/demo/security checks after source/dependency changes; benchmark changes require new raw data, not edited numbers.
- [ ] Recheck npm advisories;0 reported today is not a future guarantee.
- [ ] Optionally capture actual running UI screenshots/video with synthetic data and no private chrome/profile details.
- [ ] Obtain explicit separate approval before commit/push/public release/deployment; no such action is part of this phase.

Unsupported/unverified guarantees remain: storage eviction/profile deletion/private mode, forced browser kill, OS/power/hardware/database-process loss, competing tabs/controllers, DB replacement/restore, physical weeks of durability, unrestricted production/auth/multitenancy/multi-region, arbitrary permanent partitions and unconditional convergence. Full snapshots/retained histories are intentionally unpruned. A local demonstration can be ready for technical review while public disclosure/license choices remain open.
