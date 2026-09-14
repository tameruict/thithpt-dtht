'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from '@/styles/subjects.module.css';

type Row = {
  rank: number;
  name: string;
  school: string;
  score: number;
  max_score: number;
  score10: number;
  attempt_number: number;
  submitted_at: string | null;
};

/* ─── Cache + dedupe BXH ─────────────────────────────────────────────
 * Trang môn thi render N phòng × 1 RoomLeaderboard = N RPC song song tới
 * Supabase (Mumbai). Cache kết quả 60s ở module-scope + gộp các lần gọi
 * trùng đang bay để quay lại/trượt lên xuống không bắn request mới. */
const LEADERBOARD_TTL_MS = 60_000;
const leaderboardCache = new Map<string, { rows: Row[]; expires: number }>();
const leaderboardInflight = new Map<string, Promise<Row[]>>();

function loadLeaderboard(roomId: string): Promise<Row[]> {
  const now = Date.now();
  const hit = leaderboardCache.get(roomId);
  if (hit && hit.expires > now) return Promise.resolve(hit.rows);
  const inflight = leaderboardInflight.get(roomId);
  if (inflight) return inflight;

  const supabase = createClient() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const run = supabase
    .rpc('get_room_leaderboard', { p_room_id: roomId, p_limit: 10 })
    .then(({ data, error }) => {
      const rows = !error && Array.isArray(data) ? (data as Row[]) : [];
      leaderboardCache.set(roomId, { rows, expires: Date.now() + LEADERBOARD_TTL_MS });
      return rows;
    })
    .finally(() => {
      if (leaderboardInflight.get(roomId) === run) leaderboardInflight.delete(roomId);
    });

  leaderboardInflight.set(roomId, run);
  return run;
}

export default function RoomLeaderboard({ roomId }: { roomId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const rootRef = useRef<HTMLOListElement | HTMLParagraphElement | null>(null);

  useEffect(() => {
    let mounted = true;
    let observer: IntersectionObserver | null = null;
    let started = false;

    const start = () => {
      if (started) return;
      started = true;
      loadLeaderboard(roomId).then((loaded) => {
        if (mounted) setRows(loaded);
      });
    };

    // Chỉ fetch khi card phòng thực sự lọt vào viewport — trang có 10 phòng
    // thì lúc đầu chỉ tải 2-3 BXH thay vì cả 10 RPC cùng lúc.
    const node = rootRef.current;
    if (node && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            start();
            observer?.disconnect();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(node);
    } else {
      start();
    }

    return () => {
      mounted = false;
      observer?.disconnect();
    };
  }, [roomId]);

  if (rows === null)
    return (
      <p ref={rootRef as React.RefObject<HTMLParagraphElement>} className={styles.subjectMeta}>
        Đang tải BXH...
      </p>
    );
  if (rows.length === 0)
    return (
      <p ref={rootRef as React.RefObject<HTMLParagraphElement>} className={styles.subjectMeta}>
        Chưa có lượt thi nào — bạn có thể là người đầu tiên lên BXH.
      </p>
    );

  return (
    <ol ref={rootRef as React.RefObject<HTMLOListElement>} className={styles.leaderboard} aria-label="Bảng xếp hạng phòng thi">
      {rows.slice(0, 5).map((row) => (
        <li key={row.rank + '-' + row.submitted_at}>
          <span className={styles.leaderRank}>
            {row.rank <= 3 ? <Trophy size={13} aria-hidden="true" /> : null}#{row.rank}
          </span>
          <span>
            <strong>{row.name}</strong>
            {row.school ? <small> · {row.school}</small> : null}
          </span>
          <b>{Number(row.score10).toFixed(2)}</b>
        </li>
      ))}
    </ol>
  );
}
