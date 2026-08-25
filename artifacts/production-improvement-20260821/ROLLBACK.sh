#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${TARGET_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
PATCH_FILE="$SCRIPT_DIR/DIFF_FILE.patch"

printf 'ROLLBACK_TARGET=%s\n' "$TARGET_ROOT"
printf 'ROLLBACK_PATCH=%s\n' "$PATCH_FILE"
git -C "$TARGET_ROOT" apply --whitespace=nowarn --reverse --check "$PATCH_FILE"
git -C "$TARGET_ROOT" apply --whitespace=nowarn --reverse "$PATCH_FILE"
printf 'ROLLBACK_RESULT=restored\n'
