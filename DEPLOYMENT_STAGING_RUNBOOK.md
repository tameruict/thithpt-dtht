# Staging and Vercel release runbook

## 1. Provision preview services

1. Provision a separate Supabase staging project; Branching is unavailable on the current plan.
2. Run `scripts/bootstrap-staging.ps1` with a secure snapshot directory outside the repository.
3. Set Vercel Preview environment variables to the staging URL and publishable key.
3. Keep `KEY_PURCHASE_ENABLED=false`.
4. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel Preview.
5. In Supabase Auth > Protection, enable Cloudflare Turnstile with its secret key, require a 10-character password with letter and digit, and enable leaked-password protection.

## 2. Verify and migrate staging

```powershell
npm ci
npm run release:check -- --strict
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test
npx supabase db push --linked --dry-run
npx supabase db push --linked
npm run build
npm audit --omit=dev
```

The forward migration list must contain exactly:

- `20260820234029_production_foundation_v1.sql`
- `20260821022816_math_content_database_v2.sql`

Run `npm run content:audit` before migration. `--apply` creates review rows and
marks ambiguous questions `needs_review`; it never auto-applies proposed text.

## 3. Exercise preview

- Register/login/reset with Turnstile enabled.
- Verify admin-only routes as a student and an admin.
- Start/resume an exam, autosave, submit, and inspect the grading state.
- Start a practice session and verify the server-selected question set and charge ledger.
- Upload an R2 image; force the registry write to fail in a test environment and verify the compensating delete.

## 4. Load test

Run only with an isolated staging test student/session:

```bash
k6 run \
  -e BASE_URL=https://STAGING_PROJECT.supabase.co \
  -e PUBLISHABLE_KEY=... \
  -e ACCESS_TOKEN=... \
  -e SESSION_ID=... \
  -e SESSION_QUESTION_ID=... \
  load/k6-exam-session.js
```

The test enforces fewer than 1% request failures, p95 autosave under 800 ms, and p95 submit under 2 s.

## 5. Promote and rollback

Promote the validated Vercel Preview and migration only after the gates pass. To reverse repository changes, use `artifacts/production-improvement-20260821/ROLLBACK.sh`; database rollback stays additive and uses the tested migration transaction path in `VERIFICATION.txt`.
