#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/ROLLBACK_TEST_COPY}"
BASELINE="$SCRIPT_DIR/BASELINE_MODIFIED_FILE"
if [[ ! -f "$BASELINE" ]]; then
  printf 'ROLLBACK_RESULT=baseline_missing\n' >&2
  exit 2
fi
cp -- "$BASELINE" "$TARGET"
printf 'ROLLBACK_RESULT=restored\nTARGET=%s\n' "$TARGET"