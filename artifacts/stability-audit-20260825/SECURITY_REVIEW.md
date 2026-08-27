# SECURITY DEFINER review

Live review covered all 31 `public` SECURITY DEFINER functions.

- `anon` execution is revoked for every reviewed function.
- Authenticated execution is retained only for RPCs used by student/admin flows.
- Student-owned functions check `auth.uid()` directly or delegate to a helper that does.
- Admin/staff functions check `private.is_admin()` or `private.is_staff()`.
- Worker/provider functions (`process_bank_payment`, lease/completion RPCs, scoring worker, expiry worker) are not executable by `authenticated`.
- Remaining Supabase advisor warnings are grant-surface review notices, not anonymous exposure findings.

Separate security follow-up remains: enable leaked-password protection and decide whether any authenticated RPC should move to a private schema or have a narrower grant.
