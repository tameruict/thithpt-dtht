# poll-thueapibank

Edge Function nội bộ chủ động đọc lịch sử giao dịch ThueAPIBank, chuẩn hóa dữ
liệu và gọi RPC `process_bank_payment`. Function dùng lease 20 giây trong
`payment_provider_state`; cursor chỉ tiến sau khi toàn bộ event đã xử lý xong.

## 1. Khóa contract sau đăng nhập

1. Mở tài liệu V1/V2/V3 trong dashboard ThueAPIBank.
2. Chỉ giữ các version có đủ: event ID ổn định, thời gian, chiều vào/ra, số
   tiền, nội dung, ngân hàng và tài khoản.
3. Sao chép `contract.example.json`, thay các giá trị `REDACTED_*` bằng contract
   thật nhưng không ghi API key vào JSON.
4. Có thể đưa nhiều contract vào mảng; poller tự chọn version cao nhất hợp lệ.
5. Giữ `KEY_PURCHASE_ENABLED=false` nếu không có event ID ổn định hoặc không
   phân biệt được tiền vào/ra.

## 2. Secrets cho staging

```powershell
supabase secrets set --project-ref <STAGING_REF> `
  KEY_PURCHASE_ENABLED=false `
  THUEAPIBANK_API_KEY=<SECRET> `
  THUEAPIBANK_POLL_SECRET=<RANDOM_SECRET> `
  THUEAPIBANK_CONTRACT_JSON='<MINIFIED_JSON>' `
  PAYMENT_BANK_CODE=<BANK_CODE> `
  PAYMENT_BANK_ACCOUNT=<ACCOUNT_NUMBER> `
  PAYMENT_ACCOUNT_NAME='<ACCOUNT_NAME>'
```

Deploy function:

```powershell
supabase functions deploy poll-thueapibank --project-ref <STAGING_REF> --use-api
```

`THUEAPIBANK_POLL_SECRET` cũng phải có trong môi trường server-side của Next.js
để nút **Đồng bộ ThueAPIBank ngay** gọi đúng Edge Function.

## 3. Lịch poll 5 giây

Sau khi deploy function, lưu URL project và poll secret trong Vault rồi tạo job.
Các placeholder dưới đây được thay trực tiếp trong SQL Editor; không commit giá
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
  'poll-thueapibank-every-5-seconds',
  '5 seconds',
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
update cron.job
set active = false
where jobname = 'poll-thueapibank-every-5-seconds';
```

Không xóa `payment_events`, `purchase_orders` hoặc key đã cấp.

## 4. Smoke test

1. Apply migration trên staging và deploy function khi flag vẫn `false`.
2. Đặt contract/API key staging, bật flag Edge + Next.
3. Tạo đơn, chuyển đúng số tiền và chỉ dùng mã `THPT...` làm nội dung.
4. Xác nhận `fulfilled` và key xuất hiện trong `/purchase` cùng `/profile` trong
   tối đa 15 giây.
5. Lặp cùng event, chạy hai poll đồng thời, thử sai nội dung/số tiền/tài khoản và
   xác nhận không tạo thêm key.
