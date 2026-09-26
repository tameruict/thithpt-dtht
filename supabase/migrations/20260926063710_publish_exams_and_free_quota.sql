-- Publish toan bo 295 de (dang draft) va chon 3 de/mon lam de mien phi (is_free),
-- con lai chuyen thanh tra phi (can VIP subscription qua start_exam_session()).
-- Idempotent: chay lai nhieu lan cho ket qua giong nhau (ORDER BY on dinh theo year desc, code asc).

update public.exams
set status = 'published', updated_at = now()
where status = 'draft';

with ranked as (
  select id, subject_code,
         row_number() over (
           partition by subject_code
           order by year desc, code asc
         ) as rn
  from public.exams
)
update public.exams e
set is_free = (r.rn <= 3), updated_at = now()
from ranked r
where r.id = e.id
  and e.is_free <> (r.rn <= 3);

-- Audit: so de free theo tung mon sau khi seed. Ket qua thuc te tren du lieu hien co
-- (295 de, KHONG co de nao subject_code=BIOLOGY duoc ingest cho toi thoi diem nay):
--   CHEMISTRY: 3, MATH: 3, PHYSICS: 3, BIOLOGY: 0 (chua co de nao trong bang exams).
