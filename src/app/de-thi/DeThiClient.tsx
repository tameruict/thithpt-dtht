'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, FileQuestion, Inbox, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchActiveSubjects,
  fetchExamBank,
  getSupabaseErrorMessage,
  getUserAccess,
  type ExamBankItem,
  type SubjectBase,
  type UserAccess,
} from '@/lib/supabase/exam-data';
import StudentNav from '@/components/ui/StudentNav';
import styles from '@/styles/de-thi.module.css';

const YEAR_OPTIONS = Array.from({ length: 9 }, (_, index) => 2026 - index);
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export default function DeThiClient() {
  const supabase = useMemo(() => createClient(), []);

  const [subjects, setSubjects] = useState<SubjectBase[]>([]);
  const [access, setAccess] = useState<UserAccess | null>(null);

  const [subjectCode, setSubjectCode] = useState('');
  const [year, setYear] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ExamBankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reference data (subjects + VIP badge) — tải 1 lần, không phụ thuộc bộ lọc.
  useEffect(() => {
    let mounted = true;
    fetchActiveSubjects(supabase)
      .then((data) => {
        if (mounted) setSubjects(data);
      })
      .catch(() => {
        // Non-fatal: bộ lọc môn chỉ là tiện ích hiển thị.
      });
    getUserAccess(supabase)
      .then((data) => {
        if (mounted) setAccess(data);
      })
      .catch(() => {
        // Non-fatal: không có badge VIP vẫn xem được danh sách đề.
      });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  // Debounce ô tìm kiếm để không bắn request theo từng phím gõ.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // requestIdRef bỏ qua kết quả của các lần gọi cũ hơn khi bộ lọc đổi liên
  // tục (thay cho cờ "mounted" cục bộ) — cho phép tách phần gọi API ra
  // useCallback riêng, tránh gọi setState trực tiếp trong thân effect.
  const latestRequestIdRef = useRef(0);

  const loadExamBank = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const result = await fetchExamBank(supabase, {
        subjectCode: subjectCode || undefined,
        year: year ? Number(year) : undefined,
        isFree: freeOnly ? true : undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if (latestRequestIdRef.current !== requestId) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      if (latestRequestIdRef.current !== requestId) return;
      setError(getSupabaseErrorMessage(loadError, 'Không tải được danh sách đề thi.'));
    } finally {
      if (latestRequestIdRef.current === requestId) setLoading(false);
    }
  }, [supabase, subjectCode, year, freeOnly, search, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadExamBank(), 0);
    return () => window.clearTimeout(timer);
  }, [loadExamBank]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <StudentNav />
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Ngân hàng đề thi</h1>
            <p className={styles.subtitle}>
              Chọn đề thi theo môn và năm, xem chi tiết rồi bắt đầu làm bài ngay.
            </p>
          </div>
          {access ? (
            <span className={`${styles.accessBadge} ${access.isVip ? styles.vip : styles.free}`}>
              <Sparkles size={14} aria-hidden="true" />
              {access.isVip ? `VIP${access.planCode ? ` · ${access.planCode}` : ''}` : 'Tài khoản miễn phí'}
            </span>
          ) : null}
        </header>

        <div className={styles.filters}>
          <div className={styles.filterField}>
            <label htmlFor="de-thi-subject">Môn thi</label>
            <select
              id="de-thi-subject"
              value={subjectCode}
              onChange={(event) => {
                setSubjectCode(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả môn</option>
              {subjects.map((subject) => (
                <option key={subject.code} value={subject.code}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="de-thi-year">Năm</label>
            <select
              id="de-thi-year"
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả năm</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className={`${styles.filterField} ${styles.searchField}`}>
            <label htmlFor="de-thi-search">Tìm theo tên/mã đề</label>
            <div style={{ position: 'relative' }}>
              <input
                id="de-thi-search"
                type="search"
                value={searchInput}
                placeholder="VD: Đề minh họa 2024"
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </div>

          <label className={styles.freeToggle}>
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(event) => {
                setFreeOnly(event.target.checked);
                setPage(1);
              }}
            />
            Chỉ đề miễn phí
          </label>
        </div>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <div className={styles.emptyState}>
            <Inbox size={32} aria-hidden="true" />
            <p>
              {subjectCode || year || freeOnly || search
                ? 'Không tìm thấy đề thi phù hợp với bộ lọc hiện tại.'
                : 'Chưa có đề thi cho môn này.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid} aria-busy={loading}>
            {items.map((exam) => (
              <Link key={exam.id} href={`/de-thi/${exam.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.subjectTag}>{exam.subjectName}</span>
                  <span className={`${styles.statusBadge} ${exam.isFree ? styles.free : styles.vip}`}>
                    {exam.isFree ? 'Miễn phí' : 'VIP'}
                  </span>
                </div>
                <h2 className={styles.cardTitle}>{exam.title}</h2>
                <div className={styles.cardMeta}>
                  <span>{exam.year}{exam.round ? ` · Đợt ${exam.round}` : ''}</span>
                  <span>
                    <FileQuestion size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> {exam.questionCount} câu
                  </span>
                  <span>
                    <Clock size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> {exam.durationMinutes} phút
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className={styles.pagination}>
            <button
              type="button"
              className="btn outline small"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trang trước
            </button>
            <span>
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn outline small"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Trang sau
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
