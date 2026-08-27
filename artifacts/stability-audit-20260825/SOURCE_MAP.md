# Source map

- Source files under src: 98
- SQL migrations in checkout: 68
- Test files: 9
- App route/page files: 22
- TypeScript compiler: 
px tsc --noEmit --pretty false exit 0
- Lint: 
pm run lint -- --max-warnings=0 exit 0
- Unit tests: 10 files / 57 tests passed
- Production build: exit 0

Key domains: auth/session, exam lifecycle, practice, result/review, admin dashboard, authoring, compose, content quality, R2 assets, key purchase, ThueApiBank polling, CSP/proxy, and Supabase typed DAL.

The working tree is a candidate checkout with substantial uncommitted changes; it must be reviewed as a release unit rather than inferred from HEAD alone.
