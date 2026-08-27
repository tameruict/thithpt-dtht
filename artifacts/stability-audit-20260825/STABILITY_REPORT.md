# Stability audit - 2026-08-25

## Scope

- Candidate source: E:\Web-thi-thpt, branch fix/exam-session-scoring-lifecycle.
- Live Supabase project: eskgjwzcognziachvcbl (web-thi-thpt).
- Live schema was migrated forward-only; test fixtures were tagged and removed.

## Current result

**Production readiness: CONDITIONAL (8/10).** Source quality gates pass, the live schema and Edge Function are deployed, and the final realistic staggered 500-VU run passes all latency and failure thresholds. A synchronized worst-case wave still produces API tail latency and remains a capacity alert.

## Live deployment

Remote migration history now includes 71 migrations through 20260825161852:

- production foundation
- math/content database v2
- key checkout
- ThueApiBank polling checkout
- finish_import_job enum/grant fix
- PL/pgSQL ambiguity fixes
- async submit restoration

`poll-thueapibank` is ACTIVE version 1. Checkout remains disabled until provider secrets are configured.

## Fixes shipped

- `finish_import_job` now casts enum values and revokes anonymous/authenticated execution.
- `compose_add_questions`, `get_subjects_dashboard`, and `grade_essay_answer` no longer contain ambiguous PL/pgSQL variable references.
- `submit_exam_session` only transitions state; scoring runs asynchronously.
- `scripts/audit-math-content.ts` uses the explicit question-options relationship.
- `types/supabase.ts` was regenerated from the linked live schema.
- `load/k6-exam-session.js` uses per-VU records, accepts RPC 200/204, and applies deterministic 0-10 second phase jitter.

## Validation

- TypeScript: pass.
- ESLint: pass.
- Tests: 10 files, 57 tests passed.
- Production build: pass.
- npm audit: 0 vulnerabilities.
- DB lint: no errors; only warnings remain.
- Content audit: 2,420 questions and 13,191 fields scanned; 3,056 review rows; 8 verified; no content mutation.
- Public base tables: 39; RLS enabled: 39.
- Post-load live state: 14 pre-existing submitted sessions, 0 null scores, 0 overdue sessions.
- Cron, lock, and long-running-query checks remained healthy.

## Load results

### Synchronized worst-case

- 6,500 requests.
- HTTP failure: 0% in the first run, 0.01% after async submit.
- Autosave p95: 2.60 s then 4.42 s (target <800 ms).
- Submit p95: 2.36 s then 1.72 s (target <2 s).

### Final staggered run

- 6,406 requests.
- Checks: 6,406/6,406 passed.
- HTTP failure: 0%.
- Autosave p95: 361.30 ms.
- Submit p95: 212.91 ms.
- K6 exit: 0.
- Fixture cleanup: sessions=0, keys=0, users=0.

`pg_stat_statements` showed mean DB execution around 6.23 ms for save_session_answers and 5.32 ms for async submit_exam_session; the synchronized tail is API/connection queuing rather than an individual SQL plan.

## Remaining release work

1. Set real strict deployment variables, including the Turnstile site key.
2. Review the 3,056 content-review rows through the admin workflow.
3. Enable leaked-password protection.
4. Keep synchronized-wave latency as a capacity alert; the staggered 500-session gate is passed.

See `VERIFICATION.txt`, `SECURITY_REVIEW.md`, `K6_500_JITTERED_RESULTS.txt`, and `ROLLBACK.sh` for evidence.