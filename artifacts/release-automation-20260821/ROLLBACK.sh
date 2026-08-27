#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${TARGET_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

cp "$SCRIPT_DIR/originals/package.json" "$TARGET_ROOT/package.json"
rm -f "$TARGET_ROOT/.github/workflows/quality-gates.yml"
rm -f "$TARGET_ROOT/scripts/release-check.mjs"
rm -f "$TARGET_ROOT/load/k6-exam-session.js"
rm -f "$TARGET_ROOT/DEPLOYMENT_STAGING_RUNBOOK.md"
printf 'ROLLBACK_RESULT=release_automation_restored\n'