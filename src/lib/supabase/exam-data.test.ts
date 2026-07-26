import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSessionReview,
  getSupabaseErrorMessage,
  saveSessionAnswers,
} from './exam-data';

describe('saveSessionAnswers', () => {
  it('derives ownership in Postgres instead of sending student_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await saveSessionAnswers(supabase, 'session-1', [
      {
        sessionQuestionId: 'session-question-1',
        selectedOptionId: 'option-2',
        answerJson: { type: 'multiple_choice', option_id: 'option-2' },
      },
    ]);

    expect(rpc).toHaveBeenCalledWith('save_session_answers', {
      p_session_id: 'session-1',
      p_answers: [
        {
          session_question_id: 'session-question-1',
          selected_option_id: 'option-2',
          short_answer_text: null,
          answer_json: { type: 'multiple_choice', option_id: 'option-2' },
        },
      ],
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('student_id');
  });

  it('does not call Supabase for an empty batch', async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as SupabaseClient;

    await saveSessionAnswers(supabase, 'session-1', []);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('getSupabaseErrorMessage', () => {
  it('turns an RLS violation into an actionable Vietnamese message', () => {
    expect(
      getSupabaseErrorMessage(
        { code: '42501', message: 'new row violates row-level security policy' },
        'Không thể lưu đáp án.',
      ),
    ).toBe(
      'Phiên đăng nhập không còn quyền lưu bài. Vui lòng tải lại trang để tiếp tục.',
    );
  });
});

describe('fetchSessionReview', () => {
  it('shows a clear message when an active exam blocks answer review', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'ACTIVE_EXAM_IN_PROGRESS' },
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await expect(fetchSessionReview(supabase, 'submitted-session')).rejects.toThrow(
      'Đáp án và lời giải sẽ được mở lại sau khi bạn nộp bài hoặc hết giờ.',
    );
  });
});
