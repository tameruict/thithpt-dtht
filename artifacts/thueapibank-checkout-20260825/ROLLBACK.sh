#!/usr/bin/env bash
set -euo pipefail

artifact_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$artifact_dir/../.." && pwd)"
baseline_dir="$artifact_dir/baseline"

[[ "$artifact_dir" == "$repo_dir"/artifacts/thueapibank-checkout-20260825 ]]
[[ -d "$baseline_dir" ]]

restore_files=(
  ".env.example"
  "scripts/release-check.mjs"
  "src/lib/payments/config.ts"
  "src/lib/payments/sepay.ts"
  "src/lib/payments/sepay.test.ts"
  "src/app/api/payments/sepay/webhook/route.ts"
  "src/app/purchase/page.tsx"
  "src/app/purchase/PurchaseClient.tsx"
  "src/app/admin/purchases/PurchasesClient.tsx"
  "src/app/admin/AdminDashboardClient.tsx"
  "src/lib/supabase/database.ts"
  "src/styles/adminPurchase.module.css"
  "supabase/config.toml"
  "supabase/migrations/20260821114952_sepay_checkout.sql"
  "supabase/tests/sepay_checkout_test.sql"
)

new_files=(
  "src/app/api/admin/payments/poll/route.ts"
  "src/lib/payments/thueapibank.test.ts"
  "supabase/functions/_shared/thueapibank.ts"
  "supabase/functions/poll-thueapibank/index.ts"
  "supabase/functions/poll-thueapibank/contract.example.json"
  "supabase/functions/poll-thueapibank/README.md"
  "supabase/migrations/20260821114952_key_checkout.sql"
  "supabase/migrations/20260825141704_thueapibank_polling_checkout.sql"
  "supabase/tests/thueapibank_checkout_test.sql"
)

for relative in "${restore_files[@]}"; do
  source_path="$baseline_dir/$relative"
  target_path="$repo_dir/$relative"
  [[ -f "$source_path" ]]
  mkdir -p "$(dirname "$target_path")"
  cp -f "$source_path" "$target_path"
done

for relative in "${new_files[@]}"; do
  target_path="$repo_dir/$relative"
  [[ "$target_path" == "$repo_dir"/* ]]
  rm -f "$target_path"
done

# Restore the two short labels and TypeScript exclusion touched outside the
# checkout baseline list.
python3 - "$repo_dir" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
replacements = {
    root / "src/app/admin/key-products/KeyProductsClient.tsx": (
        "Đơn ThueAPIBank", "Đơn SePay"
    ),
    root / "src/app/room-key/page.tsx": ("Mua key tự động", "Mua key qua SePay"),
}
for path, (current, original) in replacements.items():
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace(current, original), encoding="utf-8")

tsconfig = root / "tsconfig.json"
text = tsconfig.read_text(encoding="utf-8")
text = text.replace(
    '"exclude": [\n    "node_modules",\n    "test-exam-rooms.ts",\n    "artifacts",\n    "supabase/functions/*/index.ts"\n  ]',
    '"exclude": ["node_modules", "test-exam-rooms.ts"]',
)
tsconfig.write_text(text, encoding="utf-8")
PY

echo "ROLLBACK_RESULT=restored"
