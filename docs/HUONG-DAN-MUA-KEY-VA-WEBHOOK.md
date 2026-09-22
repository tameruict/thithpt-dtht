# Hướng dẫn thanh toán mua key & tạo Webhook (MBBank V4 – ThueAPIBank)

Tài liệu này giải thích luồng mua key thi, cách bật thanh toán QR tự động, và
**các bước tạo webhook** trên ThueAPIBank để hệ thống tự cấp key ngay khi nhận tiền.

---

## 1. Luồng hoạt động (tóm tắt)

```
Học viên chọn gói  ─▶  Bấm "Tạo đơn chuyển khoản"  ─▶  Hiện QR VietQR
        │                                                   │
        │                                         (quét & chuyển khoản)
        ▼                                                   ▼
create_purchase_order (DB)                        Ngân hàng MB nhận tiền
   • sinh mã nội dung  THPT########                        │
   • tạo đơn "pending", hạn 24 giờ              ThueAPIBank bắt giao dịch
                                                            │
                    ┌───────────────────────────────────────┤
                    ▼ (realtime, tức thì)                    ▼ (dự phòng, định kỳ)
   POST /api/payments/mb/v4/webhook          Edge function poll-thueapibank
   header signature = SECRET KEY             gọi API lấy giao dịch
                    │                                        │
                    └──────────────▶ process_bank_payment ◀──┘
                                            │
                                   khớp đơn → fulfill
                                            │
                                     Cấp/nạp key BUY-…  →  đơn "fulfilled"
                                            │
                               Trang mua key tự cập nhật (Realtime)
```

- **Mã nội dung chuyển khoản** dạng `THPT` + 12 ký tự (ví dụ `THPT1A2B3C4D5E6F`). Bắt
  buộc giữ nguyên trong nội dung chuyển khoản – hệ thống dựa vào nó để khớp đơn.
- **Xác nhận tức thì** bằng webhook; đồng thời có **đối soát định kỳ (polling)** làm
  lớp dự phòng đúng như ThueAPIBank khuyến nghị chạy song song.
- Đơn hết hạn sau **24 giờ**; số tiền phải **khớp chính xác** thì mới được cấp key.

---

## 2. Biến môi trường cần cấu hình

> 🔴 **Chạy trên Vercel:** file `.env.local` **KHÔNG** được deploy lên Vercel (chỉ dùng
> khi chạy máy). Trên production phải khai báo các biến này trong **Vercel → Project
> Settings → Environment Variables** (chọn môi trường *Production*), lưu xong bấm
> **Redeploy** thì mới có hiệu lực. Domain hiện tại: `dtht-thithpt.vercel.app`.

### 2.1. Phía Next.js (file `.env.local` khi chạy máy, hoặc Environment Variables trên Vercel)

| Biến | Ý nghĩa | Ví dụ |
|------|---------|-------|
| `KEY_PURCHASE_ENABLED` | Bật kênh mua key. Chỉ đặt `true` sau khi đã test | `true` |
| `PAYMENT_PROVIDER` | Cổng thanh toán | `thueapibank` |
| `PAYMENT_BANK_CODE` | Mã ngân hàng nhận tiền (VietQR) | `MB` |
| `PAYMENT_BANK_ACCOUNT` | Số tài khoản nhận tiền | `317618668` |
| `THUEAPIBANK_WEBHOOK_SECRET` | **SECRET KEY của MBBank V4** – dùng xác thực webhook | *(dán từ bảng quản lý)* |
| `THUEAPIBANK_POLL_SECRET` | Chuỗi bí mật do bạn tự đặt, dùng để bảo vệ endpoint đối soát | *(chuỗi ngẫu nhiên)* |
| `NEXT_PUBLIC_SUPABASE_URL` | URL dự án Supabase | `https://xxx.supabase.co` |

> ⚠️ `THUEAPIBANK_WEBHOOK_SECRET` **bắt buộc** để webhook realtime chạy. Thiếu nó,
> route webhook trả về `503 WEBHOOK_NOT_CONFIGURED` và chỉ còn polling hoạt động.

### 2.2. Phía Supabase Edge Function (chỉ dùng cho polling dự phòng)

Đặt bằng lệnh `supabase secrets set` (không bao giờ để lộ hay gắn tiền tố `NEXT_PUBLIC_`):

| Secret | Ý nghĩa |
|--------|---------|
| `THUEAPIBANK_API_KEY` | Chính là **SECRET KEY** MBBank V4 (dùng gọi API lấy giao dịch) |
| `THUEAPIBANK_CONTRACT_JSON` | JSON hợp đồng API (copy trong tài liệu API sau khi đăng nhập) |
| `THUEAPIBANK_POLL_SECRET` | Trùng với giá trị bên Next.js |
| `PAYMENT_BANK_CODE`, `PAYMENT_BANK_ACCOUNT` | Trùng với bên Next.js |
| `SUPABASE_SECRET_KEY` (hoặc `SUPABASE_SERVICE_ROLE_KEY`) | Key service để ghi DB |
| `KEY_PURCHASE_ENABLED` | `true` |

> **Lưu ý quan trọng:** `SECRET KEY` của MBBank V4 vừa là `THUEAPIBANK_WEBHOOK_SECRET`
> (webhook) **vừa là** `THUEAPIBANK_API_KEY` (polling). Cùng một giá trị, đặt ở hai nơi.

---

## 3. Tạo Webhook trên ThueAPIBank (MBBank V4)

### Bước 1 — Đăng nhập & mở cấu hình MBBank V4
1. Vào <https://thueapibank.vn> và đăng nhập.
2. Mở **Home → MBBank V4** (`https://thueapibank.vn/home/mbbank_v4`).
3. Tìm mục **Webhooks → Cấu hình MBBank V4**. Bạn sẽ thấy 2 ô: **SECRET KEY** và **WEBHOOK URL**.

### Bước 2 — Lấy SECRET KEY
- Copy giá trị trong ô **SECRET KEY**.
- Dán vào:
  - `THUEAPIBANK_WEBHOOK_SECRET` (biến môi trường Next.js), và
  - `THUEAPIBANK_API_KEY` (secret của Edge Function, nếu dùng polling).

### Bước 3 — Điền WEBHOOK URL
Điền đúng URL production (domain đang dùng là `dtht-thithpt.vercel.app`):

```
https://dtht-thithpt.vercel.app/api/payments/mb/v4/webhook
```

> - Phải là **HTTPS** và là **domain production đang chạy thật** (không dùng localhost).
> - Đây là URL mà ThueAPIBank sẽ `POST` tới mỗi khi có giao dịch.
> - Nếu sau này đổi sang domain riêng (vd `thithpt.vn`), nhớ cập nhật lại URL này.

Bấm **Lưu**.

### Bước 4 — Bật "Chia sẻ biến động số dư VietQR"
Đảm bảo tính năng chia sẻ biến động số dư (webhook giao dịch) đang **bật** cho tài khoản.

> 📌 **Lưu ý về nội dung:** ThueAPIBank chỉ bắt giao dịch và bắn webhook khi **nội dung
> chuyển khoản có chứa mã** đã được duyệt. Hệ thống của bạn sinh mã dạng `THPT…` và
> nhúng sẵn vào QR, nên học viên chỉ cần quét QR và giữ nguyên nội dung là được.

### Bước 5 — ThueAPIBank gửi gì tới webhook?
Provider gửi `POST` với:

- **Header:** `signature: <SECRET KEY>` và `Content-Type: application/json`
- **Body (JSON):**

```json
{
  "transactions": [
    {
      "transactionID": "abc123",
      "amount": "100000",
      "description": "…THPT1A2B3C4D5E6F…",
      "type": "in"
    }
  ]
}
```

Route `src/app/api/payments/mb/v4/webhook/route.ts` sẽ:
1. So sánh header `signature` với `THUEAPIBANK_WEBHOOK_SECRET` (chống giả mạo, so sánh
   an toàn theo thời gian hằng số).
2. Trích mã `THPT…` từ `description`.
3. Gọi RPC `process_bank_payment` để khớp đơn, kiểm tra **số tiền – tài khoản – ngân
   hàng – thời gian**, rồi **cấp/nạp key** nếu hợp lệ.
4. Trả `200` khi đã ghi nhận (để provider không phải gửi lại nhiều lần).

### Bước 6 — Kiểm tra webhook
- Sau khi lưu, thực hiện **một giao dịch chuyển khoản thật số tiền nhỏ** (đúng nội dung
  mã `THPT…` của một đơn test), hoặc dùng nút "Test" của provider (nếu có).
- Kỳ vọng: trang mua key tự chuyển sang **"Đã cấp key"** trong vài giây.
- Nếu không thấy, xem phần **Khắc phục sự cố** bên dưới.

---

## 4. Đối soát dự phòng bằng Polling (khuyến nghị bật kèm)

Webhook có thể lỗi mạng/nhỡ, nên nên chạy thêm đối soát định kỳ.

1. **Deploy edge function:**
   ```bash
   supabase functions deploy poll-thueapibank
   ```
2. **Đặt secrets** (mục 2.2).
3. **Lên lịch gọi định kỳ** (ví dụ mỗi 1 phút) tới:
   ```
   POST https://TEN-DU-AN.supabase.co/functions/v1/poll-thueapibank
   Header: x-poll-secret: <THUEAPIBANK_POLL_SECRET>
   Body:   {}
   ```
   Có thể dùng **Supabase Scheduled Functions / pg_cron**, cron của hosting, hoặc dịch
   vụ cron ngoài. Hàm tự dùng cơ chế "lease" nên chạy nhiều lần trùng nhau vẫn an toàn.

---

## 5. Checklist bật bán (Go-live)

- [ ] `KEY_PURCHASE_ENABLED=true` trên production.
- [ ] `PAYMENT_BANK_CODE`, `PAYMENT_BANK_ACCOUNT` đúng tài khoản nhận tiền.
- [ ] `THUEAPIBANK_WEBHOOK_SECRET` = SECRET KEY của MBBank V4.
- [ ] WEBHOOK URL trên ThueAPIBank trỏ đúng domain production `/api/payments/mb/v4/webhook`.
- [ ] Có ít nhất một gói key đang mở bán (`key_products.is_active = true`, `currency = VND`).
- [ ] (Khuyến nghị) Đã deploy `poll-thueapibank` + đặt cron đối soát dự phòng.
- [ ] Đã **test bằng một giao dịch thật số tiền nhỏ** và thấy đơn chuyển "Đã cấp key".

---

## 6. Khắc phục sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|------------|------------------------|------------|
| Trang mua key báo "Thanh toán đang tạm đóng" | Thiếu env hoặc `KEY_PURCHASE_ENABLED` chưa `true` | Kiểm tra mục 2.1, restart app |
| QR không hiển thị | Host ảnh QR chưa được cho phép | Đã thêm `img.vietqr.io` & `api.qrserver.com` vào `next.config.ts` – nhớ **build lại** |
| Webhook trả `401 Invalid Signature` | `THUEAPIBANK_WEBHOOK_SECRET` khác SECRET KEY | Copy lại SECRET KEY cho khớp |
| Webhook trả `503 WEBHOOK_NOT_CONFIGURED` | Thiếu `THUEAPIBANK_WEBHOOK_SECRET` hoặc cấu hình bank | Điền đủ env, restart |
| Chuyển tiền rồi nhưng không cấp key | Sai nội dung, sai số tiền, hoặc quá 24h | Số tiền phải khớp; nội dung phải chứa đúng mã `THPT…`; tạo đơn mới nếu hết hạn |
| Có tiền vào nhưng không khớp đơn | Provider chưa bắt được nội dung | Kiểm tra tính năng "Chia sẻ biến động số dư" và nội dung có chứa mã |

Mọi giao dịch (kể cả không khớp) đều được ghi vào bảng `payment_events` làm bằng chứng
đối soát, nên có thể tra cứu lại khi cần.

---

## 7. Bảo mật

- Không commit giá trị thật của `THUEAPIBANK_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`,
  `THUEAPIBANK_API_KEY`… lên git. `.env.local` chỉ để ở máy/hosting.
- Không chia sẻ SECRET KEY / webhook cho bên thứ ba – bạn tự chịu trách nhiệm nếu bị lộ
  (theo chính sách của ThueAPIBank).
- Nếu nghi lộ key: đổi SECRET KEY trong bảng quản lý MBBank V4, rồi cập nhật lại env.
