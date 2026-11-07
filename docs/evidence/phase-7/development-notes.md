# Phase 7 execution observations

- Initial Phase6 gate: all38 source hashes matched, ten scenarios PASS under the retained run ID, ordered demo traces1–8 in both runs,22 acceptance gates PASS. No critical entry blocker.
- Initial non-escalated hardware metadata reads were denied; authorized read-only CIM/Storage collection succeeded. CPU/RAM/NVMe metadata is observed, not guessed.
- Release checks: all123 named cases passed;126 command executions include three repeated process checks. Separate fresh-copy18 contract tests repeat prior cases and are not new distinct product cases.
- First benchmark smoke failed before any measurements because static Playwright import resolved a default cache path before the project path was set. Corrected to environment assignment before dynamic import. Failed attempt retained, corrected smoke and full4010-observation/two-repetition run passed. No numbers from failure/smoke pooled into the full run.
- Initial fresh-copy offline npm install failed ENOTCACHED (missing locked tarball), with transient npm cleanup warnings. Helper finally removed only the contained disposable directory. Network-enabled lockfile retry passed; both attempts retained. Working node_modules/lockfile were untouched.
- The read-only audit's child Git enumeration first encountered sandbox EPERM; authorized execution succeeded. No normal app fault hook or product bug was involved.
- A large handbook-authoring shell command exceeded Windows process command-length limit206 before starting; writing smaller chunks completed the same document. No repository content was reset or lost.
- All these are setup/tooling observations. No production correctness defect was exposed; no protocol or product optimization was made.
