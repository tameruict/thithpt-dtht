'use client';

import { useEffect, useState } from 'react';
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

export default function RoomLeaderboard({ roomId }: { roomId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient() as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_room_leaderboard', {
          p_room_id: roomId,
          p_limit: 10,
        });
        if (!mounted) return;
        if (!error && Array.isArray(data)) setRows(data as Row[]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roomId]);

  if (loading) return <p className={styles.subjectMeta}>Đang tải BXH...</p>;
  if (rows.length === 0)
    return (
      <p className={styles.subjectMeta}>
        Chưa có lượt thi nào — bạn có thể là người đầu tiên lên BXH.
      </p>
    );

  return (
    <ol className={styles.leaderboard} aria-label="Bảng xếp hạng phòng thi">
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
