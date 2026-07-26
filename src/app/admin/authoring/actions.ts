'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { collectAuthoringImages, parseAuthoringSource } from '@/lib/authoring/parser';
import { getAuthoringTemplate } from '@/lib/authoring/templates';
import type {
  AuthoringDocument,
  AuthoringKnowledgeField,
  AuthoringMode,
  AuthoringPaper,
  AuthoringWorkspaceData,
} from '@/lib/authoring/types';
import {
  MAX_IMAGE_BYTES,
  imageExtension,
  isAllowedImageType,
  putR2Object,
  r2PublicUrl,
} from '@/lib/r2/client';
import { requireStaff } from '@/lib/supabase/staff';

type DocumentRecord = {
  id: string;
  mode: AuthoringMode;
  title: string;
  subject_code: string;
  paper_id: string | null;
  latex_source: string;
  revision: number;
  published_revision: number | null;
  updated_at: string;
  published_at: string | null;
};

type PaperRecord = {
  id: string;
  paper_code: string;
  label: string | null;
  is_default: boolean;
  status: AuthoringPaper['status'];
  exam_rooms:
    | { name: string; subject_code: string }
    | Array<{ name: string; subject_code: string }>
    | null;
};

type R2AssetRecord = {
  public_url: string;
  content_type: string;
  size_bytes: number | string | null;
};

type KnowledgeFieldRecord = {
  id: number | string;
  subject_code: string;
  parent_id: number | string | null;
  name: string;
  slug: string;
  grade: number | null;
};

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapDocument(record: DocumentRecord): AuthoringDocument {
  return {
    id: record.id,
    mode: record.mode,
    title: record.title,
    subjectCode: record.subject_code,
    paperId: record.paper_id,
    latexSource: record.latex_source,
    revision: Number(record.revision),
    publishedRevision:
      record.published_revision === null
        ? null
        : Number(record.published_revision),
    updatedAt: record.updated_at,
    publishedAt: record.published_at,
  };
}

function mapPaper(record: PaperRecord): AuthoringPaper {
  const room = firstRelation(record.exam_rooms);
  return {
    id: record.id,
    paperCode: record.paper_code,
    label: record.label ?? record.paper_code,
    roomName: room?.name ?? 'Phòng thi',
    subjectCode: room?.subject_code ?? '',
    status: record.status,
    isDefault: record.is_default,
  };
}

function mapKnowledgeField(
  record: KnowledgeFieldRecord,
): AuthoringKnowledgeField {
  return {
    id: Number(record.id),
    subjectCode: record.subject_code,
    parentId: record.parent_id === null ? null : Number(record.parent_id),
    name: record.name,
    slug: record.slug,
    grade: record.grade === null ? null : Number(record.grade),
  };
}

function slugifyKnowledgeField(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getActionError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '';

  if (message.includes('AUTHORING_REVISION_CONFLICT')) {
    return 'Bản nháp đã được cập nhật ở tab khác. Hãy tải lại trước khi tiếp tục.';
  }
  if (message.includes('IMAGE_NOT_REGISTERED')) {
    return 'Có ảnh chưa được đăng ký trong R2 registry.';
  }
  if (message.includes('IMAGE_URL_MUST_BE_STABLE_HTTPS')) {
    return 'Ảnh phải dùng URL HTTPS public ổn định, không có query hoặc fragment.';
  }
  if (message.includes('KNOWLEDGE_FIELD_NOT_FOUND')) {
    return 'Phạm vi kiến thức không tồn tại hoặc không thuộc môn học của tài liệu.';
  }
  if (message.includes('STAFF_ONLY') || message.includes('STAFF_REQUIRED')) {
    return 'Chỉ tài khoản giáo viên/quản trị mới được thao tác.';
  }
  if (message.includes('Thiếu biến môi trường')) {
    return message; // lỗi cấu hình R2 — hiển thị nguyên văn để dễ sửa .env.
  }

  return message || 'Không thể hoàn tất thao tác soạn đề.';
}

export async function loadAuthoringWorkspaceData(): Promise<AuthoringWorkspaceData> {
  const { supabase } = await requireStaff();
  const [documentsResult, subjectsResult, knowledgeFieldsResult, papersResult] =
    await Promise.all([
    supabase
      .from('exam_authoring_documents')
      .select(
        'id,mode,title,subject_code,paper_id,latex_source,revision,published_revision,updated_at,published_at',
      )
      .order('updated_at', { ascending: false }),
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
      .order('display_order')
      .order('name'),
    supabase
      .from('exam_room_papers')
      .select(
        'id,paper_code,label,is_default,status,exam_rooms!exam_room_papers_exam_room_id_fkey(name,subject_code)',
      )
      .in('status', ['draft', 'published'])
      .order('created_at', { ascending: false }),
  ]);

  if (documentsResult.error) throw documentsResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (knowledgeFieldsResult.error) throw knowledgeFieldsResult.error;
  if (papersResult.error) throw papersResult.error;

  return {
    documents: ((documentsResult.data ?? []) as DocumentRecord[]).map(mapDocument),
    subjects: (subjectsResult.data ?? []).map((subject) => ({
      code: String(subject.code),
      name: String(subject.name),
    })),
    knowledgeFields: (
      (knowledgeFieldsResult.data ?? []) as KnowledgeFieldRecord[]
    ).map(mapKnowledgeField),
    papers: ((papersResult.data ?? []) as unknown as PaperRecord[]).map(mapPaper),
  };
}

export async function createKnowledgeField(input: {
  subjectCode: string;
  name: string;
  grade?: number | null;
  parentId?: number | null;
}) {
  try {
    const { supabase } = await requireStaff();
    const subjectCode = input.subjectCode.trim().toUpperCase();
    const name = input.name.trim();
    const grade = input.grade ?? null;
    const parentId = input.parentId ?? null;
    const slug = slugifyKnowledgeField(name);

    if (!name || !slug) {
      return { ok: false as const, error: 'Tên phạm vi kiến thức không hợp lệ.' };
    }
    if (grade !== null && ![10, 11, 12].includes(grade)) {
      return { ok: false as const, error: 'Khối lớp phải là 10, 11 hoặc 12.' };
    }

    if (parentId !== null) {
      const { data: parent, error: parentError } = await supabase
        .from('knowledge_fields')
        .select('id,subject_code')
        .eq('id', parentId)
        .single();
      if (parentError) throw parentError;
      if (parent.subject_code !== subjectCode) {
        return {
          ok: false as const,
          error: 'Phạm vi cha không thuộc môn học đang chọn.',
        };
      }
    }

    const { data, error } = await supabase
      .from('knowledge_fields')
      .insert({
        subject_code: subjectCode,
        parent_id: parentId,
        name,
        slug,
        grade,
      })
      .select('id,subject_code,parent_id,name,slug,grade')
      .single();
    if (error) {
      if (error.code === '23505') {
        return {
          ok: false as const,
          error: 'Phạm vi kiến thức này đã tồn tại trong môn học.',
        };
      }
      throw error;
    }

    revalidatePath('/admin/authoring');
    return {
      ok: true as const,
      knowledgeField: mapKnowledgeField(data as KnowledgeFieldRecord),
    };
  } catch (error) {
    return { ok: false as const, error: getActionError(error) };
  }
}

export async function createAuthoringDocument(input: {
  mode: AuthoringMode;
  title: string;
  subjectCode: string;
  sourcePaperId?: string | null;
  // Nội dung LaTeX khởi tạo (dùng khi nạp đề từ JSON). Bỏ trống -> template.
  seedSource?: string;
}) {
  try {
    const { supabase, user } = await requireStaff();
    const title = input.title.trim() || 'Bản nháp chưa đặt tên';
    const subjectCode = input.subjectCode.trim().toUpperCase();
    let paperId: string | null = null;

    if (input.mode === 'paper') {
      if (!input.sourcePaperId) {
        return { ok: false as const, error: 'Hãy chọn một đề đích.' };
      }

      const { data: sourcePaper, error: sourceError } = await supabase
        .from('exam_room_papers')
        .select('id,status,exam_rooms!exam_room_papers_exam_room_id_fkey(subject_code)')
        .eq('id', input.sourcePaperId)
        .single();

      if (sourceError) throw sourceError;
      const room = firstRelation(
        sourcePaper.exam_rooms as
          | { subject_code: string }
          | Array<{ subject_code: string }>
          | null,
      );
      if (!room || room.subject_code !== subjectCode) {
        return { ok: false as const, error: 'Đề và môn học không khớp nhau.' };
      }

      if (sourcePaper.status === 'draft') {
        paperId = sourcePaper.id;
      } else {
        const { data, error } = await supabase.rpc(
          'create_exam_paper_successor',
          { p_source_paper_id: sourcePaper.id },
        );
        if (error) throw error;
        paperId = String(data);
      }

      const { data: existing, error: existingError } = await supabase
        .from('exam_authoring_documents')
        .select(
          'id,mode,title,subject_code,paper_id,latex_source,revision,published_revision,updated_at,published_at',
        )
        .eq('paper_id', paperId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return { ok: true as const, document: mapDocument(existing as DocumentRecord) };
      }
    }

    const { data, error } = await supabase
      .from('exam_authoring_documents')
      .insert({
        mode: input.mode,
        title,
        subject_code: subjectCode,
        paper_id: paperId,
        latex_source:
          input.seedSource && input.seedSource.trim() !== ''
            ? input.seedSource
            : getAuthoringTemplate(input.mode),
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        'id,mode,title,subject_code,paper_id,latex_source,revision,published_revision,updated_at,published_at',
      )
      .single();

    if (error) throw error;
    revalidatePath('/admin/authoring');
    return { ok: true as const, document: mapDocument(data as DocumentRecord) };
  } catch (error) {
    return { ok: false as const, error: getActionError(error) };
  }
}

export async function saveAuthoringDocument(input: {
  documentId: string;
  expectedRevision: number;
  latexSource: string;
}) {
  try {
    const { supabase } = await requireStaff();
    const { data, error } = await supabase.rpc('save_authoring_document', {
      p_document_id: input.documentId,
      p_expected_revision: input.expectedRevision,
      p_latex_source: input.latexSource,
    });
    if (error) throw error;

    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved) throw new Error('AUTHORING_REVISION_CONFLICT');

    return {
      ok: true as const,
      revision: Number(saved.revision),
      updatedAt: String(saved.updated_at),
    };
  } catch (error) {
    return { ok: false as const, error: getActionError(error) };
  }
}

export async function publishAuthoringDocument(input: {
  documentId: string;
  expectedRevision: number;
  latexSource: string;
}) {
  try {
    const { supabase } = await requireStaff();
    const { data: document, error: documentError } = await supabase
      .from('exam_authoring_documents')
      .select('id,mode,subject_code,revision,published_revision,latex_source')
      .eq('id', input.documentId)
      .single();
    if (documentError) throw documentError;

    if (Number(document.revision) !== input.expectedRevision) {
      throw new Error('AUTHORING_REVISION_CONFLICT');
    }
    if (Number(document.published_revision) === input.expectedRevision) {
      return {
        ok: false as const,
        error: 'Revision này đã được xuất bản. Hãy tạo một bản nháp kế nhiệm.',
      };
    }
    if (document.latex_source !== input.latexSource) {
      return {
        ok: false as const,
        error: 'Hãy chờ autosave hoàn tất trước khi xuất bản.',
      };
    }

    const parsed = parseAuthoringSource(
      input.latexSource,
      document.mode as AuthoringMode,
    );
    if (parsed.errors.length > 0) {
      return {
        ok: false as const,
        error: parsed.errors[0].message,
        errors: parsed.errors,
      };
    }

    const images = collectAuthoringImages(parsed.questions);
    const uniqueUrls = [...new Set(images.map((image) => image.url))];
    const assetByUrl = new Map<string, R2AssetRecord>();

    if (uniqueUrls.length > 0) {
      const { data: assets, error: assetError } = await supabase
        .from('r2_assets')
        .select('public_url,content_type,size_bytes')
        .in('public_url', uniqueUrls);
      if (assetError) throw assetError;
      for (const asset of (assets ?? []) as R2AssetRecord[]) {
        assetByUrl.set(asset.public_url, asset);
      }
    }

    for (const image of images) {
      let url: URL;
      try {
        url = new URL(image.url);
      } catch {
        return { ok: false as const, error: `URL ảnh không hợp lệ: ${image.url}` };
      }
      if (url.protocol !== 'https:' || url.search || url.hash) {
        return {
          ok: false as const,
          error: 'Ảnh phải dùng URL HTTPS public ổn định, không có query hoặc fragment.',
        };
      }

      const asset = assetByUrl.get(image.url);
      if (!asset) {
        return {
          ok: false as const,
          error: `Ảnh chưa có trong R2 registry: ${image.url}`,
        };
      }
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(
          asset.content_type,
        )
      ) {
        return { ok: false as const, error: `MIME ảnh không được hỗ trợ: ${image.url}` };
      }
      if (asset.size_bytes === null || Number(asset.size_bytes) > 10 * 1024 * 1024) {
        return { ok: false as const, error: `Ảnh vượt giới hạn 10 MB: ${image.url}` };
      }
    }

    const { data, error } = await supabase.rpc('publish_authoring_document', {
      p_document_id: input.documentId,
      p_expected_revision: input.expectedRevision,
      p_payload: {
        mode: document.mode,
        subjectCode: document.subject_code,
        questions: parsed.questions,
      },
    });
    if (error) throw error;

    revalidatePath('/admin/authoring');
    return { ok: true as const, result: data };
  } catch (error) {
    return { ok: false as const, error: getActionError(error) };
  }
}

// Upload ảnh câu hỏi lên R2 rồi đăng ký vào r2_assets registry, để publish
// (private.resolve_authoring_image) chấp nhận URL. Trả về URL public + alt để
// client chèn macro \image[alt={...}]{url}.
export async function uploadAuthoringImage(formData: FormData) {
  try {
    const { supabase } = await requireStaff();

    const file = formData.get('file');
    const alt = String(formData.get('alt') ?? '')
      .trim()
      .replace(/[{}]/g, '');

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: 'Chưa chọn tệp ảnh.' };
    }
    if (!isAllowedImageType(file.type)) {
      return {
        ok: false as const,
        error: `Định dạng không hỗ trợ (${file.type || 'không rõ'}). Chỉ nhận PNG, JPG, WEBP, AVIF.`,
      };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false as const, error: 'Ảnh vượt giới hạn 10 MB.' };
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const key = `authoring/${randomUUID()}.${imageExtension(file.type)}`;

    await putR2Object({ key, body, contentType: file.type });
    const url = r2PublicUrl(key);

    const { error } = await supabase.rpc('register_r2_asset', {
      p_public_url: url,
      p_content_type: file.type,
      p_size_bytes: file.size,
    });
    if (error) throw error;

    return { ok: true as const, url, alt };
  } catch (error) {
    return { ok: false as const, error: getActionError(error) };
  }
}
