# poll-thueapibank

Edge Function nội bộ chủ động gọi MBB GET history của ThueAPIBank, chuẩn hóa giao dịch
và gọi RPC `process_bank_payment`. Function giữ lease 20 giây trong
`payment_provider_state`; cursor chỉ tiến sau khi xử lý xong toàn bộ event. Dedupe vẫn
dựa trên cặp provider/event ID ở adapter và database.

## 1. Contract MBB GET

Contract mẫu nằm tại `contract.example.json` và khớp fixture MBB:

- `GET https://thueapibank.vn/historyapimbv2/{API_KEY}`.
- Auth dùng `location: "path"`; poller chỉ thay đúng placeholder trong `auth.name` và
  URL-encode toàn bộ credential trước khi tạo URL.
- Payload chỉ được chấp nhận khi top-level `status=success`.
- Danh sách nằm ở `transactions`; các trường là `transactionID`, `type`, `amount`,
  `description`, `transactionDate`.
- `transactionDate` dùng đúng `DD/MM/YYYY` và được chuẩn hóa thành
  `23:59:59.999 Asia/Ho_Chi_Minh` để không bị `TRANSACTION_BEFORE_ORDER` trong cùng ngày.
- Endpoint MBB này là account-scoped nên `accountNumber` và `bankCode` trong payload
  được để `null`. Poller dùng `PAYMENT_BANK_ACCOUNT`/`PAYMENT_BANK_CODE` server-side
  khi gọi RPC. Trường top-level `merchant` là mã merchant, không phải số tài khoản và
  không được map vào `accountNumber`.

API key chỉ nằm trong secret `THUEAPIBANK_API_KEY`. Không log request URL, contract
JSON, API key hoặc payload chứa credential.

## 2. Secrets cho staging

Minify `contract.example.json`, sau đó cấu hình server-side secrets:

```powershell
supabase secrets set --project-ref <STAGING_REF> `
  KEY_PURCHASE_ENABLED=false `
  THUEAPIBANK_API_KEY=<SECRET> `
  THUEAPIBANK_POLL_SECRET=<RANDOM_SECRET> `
  THUEAPIBANK_CONTRACT_JSON='<MINIFIED_CONTRACT_JSON>' `
  PAYMENT_BANK_CODE=MB `
  PAYMENT_BANK_ACCOUNT=<ACCOUNT_NUMBER>
```

Deploy function:

```powershell
supabase functions deploy poll-thueapibank --project-ref <STAGING_REF> --use-api
```

`THUEAPIBANK_POLL_SECRET` cũng phải có trong môi trường server-side của Next.js để
nút **Đồng bộ ThueAPIBank ngay** gọi đúng Edge Function.

## 3. Lịch poll 60 giây

MBB GET không có cursor nên mỗi lần poll đọc lại trang lịch sử. Mặc định chạy 60 giây
một lần để giảm request lặp. Sau khi deploy function, lưu URL project và poll secret
trong Vault rồi tạo job. Thay placeholder trực tiếp trong SQL Editor; không commit giá
trị thật.

```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co',
  'thueapibank_project_url'
);
select vault.create_secret(
  '<THUEAPIBANK_POLL_SECRET>',
  'thueapibank_poll_secret'
);

select cron.schedule(
  'poll-thueapibank-every-60-seconds',
  '60 seconds',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'thueapibank_project_url'
    ) || '/functions/v1/poll-thueapibank',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-poll-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'thueapibank_poll_secret'
      )
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```

Tắt job khi rollback vận hành:

```sql
select cron.unschedule('poll-thueapibank-every-60-seconds');
```

Không xóa `payment_events`, `purchase_orders` hoặc key đã cấp.

## 4. Smoke test

1. Deploy trên staging khi `KEY_PURCHASE_ENABLED=false`.
2. Cấu hình contract/API key staging, rồi bật flag Edge + Next.
3. Tạo đơn, chuyển đúng số tiền và chỉ dùng mã `THPT...` làm nội dung.
4. Xác nhận đơn `fulfilled` và key xuất hiện trong `/purchase` cùng `/profile` trong
   tối đa 75 giây.
5. Gửi lại cùng `transactionID`, chạy hai poll đồng thời, thử sai nội dung/số tiền và
   xác nhận không tạo thêm event/key.
