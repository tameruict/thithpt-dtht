# E2E and load results

## Completed

- Production build smoke: passed.
- Unauthenticated route smoke against local `next start`: `/` 200, `/register` 200, `/reset-password` 200, `/subjects` redirected to login, `/admin` redirected to login.
- Baseline and modified load harness syntax: passed.
- One-VU live RPC load smoke passed sequentially: autosave p95 225.73 ms, submit p95 190.33 ms, 0% request failures, 6/6 checks.
- Synchronized 500-VU runs exposed API tail latency; their raw results are retained for stress analysis.
- After async submit plus deterministic phase jitter, the final 500-VU run completed 6,406 requests with 0% failures; autosave p95 361.30 ms and submit p95 212.91 ms, both thresholds passed.

## Live fixture attempts

- The live fixture setup created 500 run-tagged auth users, 500 keys and 500 sessions.
- An early password-sign-in attempt was rate-limited at user 34; the final run used temporary magic-link verification limits and completed all 500 records.
- The cleanup transaction removed all run-tagged sessions, keys, batch rows and auth users; post-cleanup aggregate was `sessions=0, batches=0, keys=0, users=0` for the run-id.

## Cleanup and configuration

- The final 500-VU result is recorded in `K6_500_JITTERED_RESULTS.txt`; cleanup restored zero run-tagged rows.
- Temporary Auth rate limits used for fixture provisioning were restored to 30 sign-in/sign-up and 30 token verifications.

The modified harness is ready at `MODIFIED_FILE.js`; it accepts a JSON dataset through `USERS_FILE` and uses deterministic phase jitter for realistic concurrency.
