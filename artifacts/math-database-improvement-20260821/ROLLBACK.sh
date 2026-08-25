#!/usr/bin/env bash
set -euo pipefail
ARTIFACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TARGET_ROOT="${TARGET_ROOT:-$(cd "$ARTIFACT_DIR/../.." && pwd -P)}"
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd -P)"
if [[ ! -f "$TARGET_ROOT/package.json" ]]; then echo "ROLLBACK_RESULT=invalid_target" >&2; exit 2; fi
restore_file() { local rel="$1"; local source="$ARTIFACT_DIR/baseline/$rel"; [[ -f "$source" ]] || source="$source.orig"; mkdir -p "$(dirname "$TARGET_ROOT/$rel")"; cp -f -- "$source" "$TARGET_ROOT/$rel"; }
restore_file "package.json"
restore_file "package-lock.json"
restore_file "README.md"
restore_file "DEPLOYMENT_STAGING_RUNBOOK.md"
restore_file "db_dump.sql"
restore_file "src/components/question/QuestionRenderer.tsx"
restore_file "src/components/question/QuestionRenderer.test.ts"
restore_file "src/styles/question-renderer.module.css"
restore_file "src/lib/authoring/parser.ts"
restore_file "src/lib/authoring/parser.test.ts"
restore_file "src/lib/supabase/database.ts"
restore_file "src/lib/supabase/exam-data.ts"
for rel in "src/lib/math-content.ts" "src/lib/math-content.test.ts" "scripts/audit-math-content.ts" "scripts/bootstrap-staging.ps1" "supabase/migrations/20260821022816_math_content_database_v2.sql" "supabase/tests/math_content_database_v2_test.sql" "src/app/admin/content-quality/actions.ts" "src/app/admin/content-quality/ContentQualityClient.tsx" "src/app/admin/content-quality/page.tsx" "src/app/admin/content-quality/content-quality.module.css"; do rm -f -- "$TARGET_ROOT/$rel"; done
rmdir "$TARGET_ROOT/src/app/admin/content-quality" 2>/dev/null || true
echo "ROLLBACK_RESULT=math_database_improvement_restored"