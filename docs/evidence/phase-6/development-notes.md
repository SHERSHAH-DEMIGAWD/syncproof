# Phase 6 development observations

Initial client check rejected the new helper's `ReturnType<typeof gate>` because generic inference produced an unknown release parameter while the stored gate used void. Compiler reported TS2345 at audit-harness.ts:32 and TS2554 at line40. Corrected the helper type to `ReturnType<typeof gate<void>>`; subsequent client checks passed. This was a test-helper compile error, not a production defect. The initial diagnostic was observed in the tool output before the log capture was added; this note preserves the failure honestly rather than claiming a saved raw log.

The first DB audit run passed6/6 and first browser audit passed11/11. Those counts overlap later final regressions and must not be added to distinct test totals. No product behavior has been changed.

Harness review tightened response-loss scheduling: the real committed response stays held until page reload destroys the old controller, then the intercepted route is aborted. This removes dependence on reloading before the retry-backoff timer, especially for F4's unsent third record. Earlier passes remain retained; final regressions exercise the stronger barrier.
