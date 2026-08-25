# Local-only migrations quarantined on 2026-08-21

These 15 files existed only in the repository and were not present in the linked production migration history. They are preserved here for audit and code recovery, but this directory is intentionally outside `supabase/migrations` so `supabase db push` cannot replay them against the live database.

Source of truth: linked live Supabase migration history fetched with `supabase migration fetch --linked`. New schema work must be additive and forward-only from that baseline.
