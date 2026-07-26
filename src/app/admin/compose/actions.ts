'use server';

import type {
  AuthoringKnowledgeField,
  AuthoringSubject,
} from '@/lib/authoring/types';
import { requireStaff } from '@/lib/supabase/staff';

export type ComposePaper = {
  id: string;
  label: string;
  roomName: string;
  subjectCode: string;
  blueprintId: string;
  status: string;
};

export type ComposeData = {
  papers: ComposePaper[];
  subjects: AuthoringSubject[];
  knowledgeFields: AuthoringKnowledgeField[];
};

export type BankQuestion = {
  id: string;
  code: string | null;
  type: string;
  difficulty: number;
  content: string;
  status: string;
};

export type CompositionQuestion = {
  questionId: string;
  code: string | null;
  difficulty: number;
  content: string;
  seq: number;
};

export type CompositionSection = {
  sectionId: string;
  sectionCode: string;
  title: string;
  type: string;
  displayedCount: number;
  placedCount: number;
  questions: CompositionQuestion[];
};

export type Composition = {
  paper: {
    id: string;
    label: string;
    status: string;
    subjectCode: string;
    roomName: string;
    blueprintId: string;
  } | null;
  sections: CompositionSection[];
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function actionError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('STAFF_ONLY') || message.includes('STAFF_REQUIRED')) {
    return 'Chỉ tài khoản giáo viên/quản trị mới được thao tác.';
  }
  if (message.includes('PAPER_IS_IMMUTABLE')) {
    return 'Đề này không ở trạng thái nháp nên không sửa được.';
  }
  if (message.includes('PAPER_NOT_FOUND')) {
    return 'Không tìm thấy đề đích.';
  }
  return message || 'Không thể hoàn tất thao tác.';
}

export async function loadComposeData(): Promise<ComposeData> {
  const { supabase } = await requireStaff();
  const [papersRes, subjectsRes, knowledgeRes] = await Promise.all([
    supabase
      .from('exam_room_papers')
      .select(
        'id,paper_code,label,status,blueprint_id,created_at,exam_rooms!exam_room_papers_exam_room_id_fkey(name,subject_code)',
      )
      .eq('status', 'draft')
      .order('created_at', { ascending: false }),
    supabase
      .from('subjects')
      .select('code,name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('knowledge_fields')
      .select('id,subject_code,parent_id,name,slug,grade')
      .order('subject_code')
      .order('grade')
      .order('name'),
  ]);

  if (papersRes.error) throw papersRes.error;
  if (subjectsRes.error) throw subjectsRes.error;
  if (knowledgeRes.error) throw knowledgeRes.error;

  const papers: ComposePaper[] = (
    (papersRes.data ?? []) as unknown as Array<{
      id: string;
      paper_code: string;
      label: string | null;
      status: string;
      blueprint_id: string;
      exam_rooms:
        | { name: string; subject_code: string }
        | Array<{ name: string; subject_code: string }>
        | null;
    }>
  ).map((record) => {
    const room = firstRelation(record.exam_rooms);
    return {
      id: record.id,
      label: record.label ?? record.paper_code,
      roomName: room?.name ?? 'Phòng thi',
      subjectCode: room?.subject_code ?? '',
      blueprintId: record.blueprint_id,
      status: record.status,
    };
  });

  return {
    papers,
    subjects: (subjectsRes.data ?? []).map((subject) => ({
      code: String(subject.code),
      name: String(subject.name),
    })),
    knowledgeFields: (
      (knowledgeRes.data ?? []) as unknown as Array<{
        id: number | string;
        subject_code: string;
        parent_id: number | string | null;
        name: string;
        slug: string;
        grade: number | null;
      }>
    ).map((record) => ({
      id: Number(record.id),
      subjectCode: record.subject_code,
      parentId: record.parent_id === null ? null : Number(record.parent_id),
      name: record.name,
      slug: record.slug,
      grade: record.grade === null ? null : Number(record.grade),
    })),
  };
}

export async function searchBankQuestions(input: {
  subjectCode: string;
  type?: string;
  difficulty?: number | null;
  knowledgeFieldId?: number | null;
  query?: string;
}) {
  try {
    const { supabase } = await requireStaff();
    let request = supabase
      .from('questions')
      .select('id,code,type,difficulty,content,status')
      .eq('subject_code', input.subjectCode.trim().toUpperCase())
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(100);

    if (input.type) request = request.eq('type', input.type);
    if (input.difficulty) request = request.eq('difficulty', input.difficulty);
    if (input.knowledgeFieldId) {
      request = request.eq('knowledge_field_id', input.knowledgeFieldId);
    }
    if (input.query && input.query.trim() !== '') {
      request = request.ilike('content', `%${input.query.trim()}%`);
    }

    const { data, error } = await request;
    if (error) throw error;

    const questions: BankQuestion[] = (
      (data ?? []) as unknown as Array<{
        id: string;
        code: string | null;
        type: string;
        difficulty: number;
        content: string | null;
        status: string;
      }>
    ).map((record) => ({
      id: record.id,
      code: record.code,
      type: record.type,
      difficulty: record.difficulty,
      content: record.content ?? '',
      status: record.status,
    }));

    return { ok: true as const, questions };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function getComposition(paperId: string) {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.rpc('get_paper_composition', {
      p_paper_id: paperId,
    });
    if (error) throw error;
    return { ok: true as const, composition: data as Composition };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function addToComposition(paperId: string, questionIds: string[]) {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.rpc('compose_add_questions', {
      p_paper_id: paperId,
      p_question_ids: questionIds,
    });
    if (error) throw error;
    return { ok: true as const, composition: data as Composition };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}

export async function removeFromComposition(
  paperId: string,
  questionId: string,
) {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.rpc('compose_remove_question', {
      p_paper_id: paperId,
      p_question_id: questionId,
    });
    if (error) throw error;
    return { ok: true as const, composition: data as Composition };
  } catch (error) {
    return { ok: false as const, error: actionError(error) };
  }
}
