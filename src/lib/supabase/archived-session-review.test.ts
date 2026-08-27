import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('archived exam room history', () => {
  const migration = readFileSync(
    'supabase/migrations/20260827151952_exam_history_security_dedupe.sql',
    'utf8',
  );
  const dedupeMigration = readFileSync(
    'supabase/migrations/20260827160847_finalize_question_dedupe.sql',
    'utf8',
  );

  it('returns scores but suppresses questions for archived rooms', () => {
    expect(migration).toContain("'room_deleted', room.deleted_at is not null");
    expect(migration).toContain("when v_room_deleted_at is not null then '[]'::jsonb");
  });

  it('hides archived rooms from exam entry views', () => {
    expect(migration).toContain('where er.deleted_at is null');
    expect(migration).toContain('and room.deleted_at is null');
  });

  it('audits signatures before remapping references and soft-deleting duplicates', () => {
    expect(migration).toContain('question_duplicate_reviews');
    expect(migration).toContain('answer_signature_matches');
    expect(dedupeMigration).toContain('QUESTION_DEDUPE_OPTION_MAPPING_MISSING');
    expect(dedupeMigration).toContain('update public.exam_session_questions');
    expect(dedupeMigration).toContain('questions_subject_content_hash_active_uidx');
  });
});
