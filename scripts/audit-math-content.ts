import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { validateMathContent } from '../src/lib/math-content';

type ReviewRow = {
  question_id: string;
  entity_type: 'question' | 'option' | 'true_false_item' | 'short_answer_key';
  entity_id: string;
  field_name: 'content' | 'explanation' | 'normalized_text' | 'display_value';
  original_value: string | null;
  proposed_value: string | null;
  issue_codes: string[];
  severity: 'warning' | 'error';
  status: 'pending';
};

type ContentEntity = {
  id: string;
  content?: string | null;
  explanation?: string | null;
  normalized_text?: string | null;
  display_value?: string | null;
};

type QuestionRow = ContentEntity & {
  code: string;
  question_options: ContentEntity[] | null;
  question_true_false_items: ContentEntity[] | null;
  question_short_answer_keys: ContentEntity[] | null;
};

function loadLocalEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // CI and production runners normally provide environment variables directly.
  }
}

function fieldsForQuestion(question: QuestionRow) {
  const fields: Array<{
    entityType: ReviewRow['entity_type'];
    entityId: string;
    fieldName: ReviewRow['field_name'];
    value: string | null;
  }> = [
    { entityType: 'question', entityId: question.id, fieldName: 'content', value: question.content ?? '' },
    { entityType: 'question', entityId: question.id, fieldName: 'explanation', value: question.explanation ?? null },
  ];

  for (const option of question.question_options ?? []) {
    fields.push({ entityType: 'option', entityId: option.id, fieldName: 'content', value: option.content ?? '' });
    fields.push({ entityType: 'option', entityId: option.id, fieldName: 'explanation', value: option.explanation ?? null });
  }
  for (const item of question.question_true_false_items ?? []) {
    fields.push({ entityType: 'true_false_item', entityId: item.id, fieldName: 'content', value: item.content ?? '' });
  }
  for (const answer of question.question_short_answer_keys ?? []) {
    fields.push({ entityType: 'short_answer_key', entityId: answer.id, fieldName: 'normalized_text', value: answer.normalized_text ?? null });
    fields.push({ entityType: 'short_answer_key', entityId: answer.id, fieldName: 'display_value', value: answer.display_value ?? null });
  }
  return fields.filter((field) => field.value !== null);
}

async function main() {
  loadLocalEnv();
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run content:audit -- [--apply] [--limit=N]');
    console.log('Default mode is read-only. --apply writes review rows and quality metadata only.');
    return;
  }
  const apply = process.argv.includes('--apply');
  const requestedLimit = Number(process.argv.find((value) => value.startsWith('--limit='))?.split('=')[1] ?? 0);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase secret are required.');
  }

  const supabase = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pageSize = 200;
  let offset = 0;
  let questions = 0;
  let fields = 0;
  let blockingQuestions = 0;
  let reviewRows = 0;
  let verifiedQuestions = 0;

  while (!requestedLimit || questions < requestedLimit) {
    const remaining = requestedLimit ? Math.min(pageSize, requestedLimit - questions) : pageSize;
    const { data, error } = await supabase
      .from('questions')
      .select(`
        id,code,content,explanation,
        question_options!question_options_question_id_fkey(id,content,explanation),
        question_true_false_items(id,content),
        question_short_answer_keys(id,normalized_text,display_value)
      `)
      .eq('subject_code', 'MATH')
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + remaining - 1);
    if (error) throw error;

    const page = (data ?? []) as unknown as QuestionRow[];
    if (page.length === 0) break;

    for (const question of page) {
      const proposedReviews: ReviewRow[] = [];
      const normalizedValues: string[] = [];
      let hasBlockingIssue = false;

      for (const field of fieldsForQuestion(question)) {
        fields += 1;
        const validation = validateMathContent(field.value ?? '');
        normalizedValues.push(`${field.entityType}:${field.entityId}:${field.fieldName}:${validation.normalized}`);
        if (validation.issues.length === 0 && validation.normalized === field.value) continue;

        const severity = validation.issues.some((issue) => issue.severity === 'error')
          ? 'error'
          : 'warning';
        hasBlockingIssue ||= severity === 'error';
        proposedReviews.push({
          question_id: question.id,
          entity_type: field.entityType,
          entity_id: field.entityId,
          field_name: field.fieldName,
          original_value: field.value,
          proposed_value: validation.normalized,
          issue_codes: [...new Set(validation.issues.map((issue) => issue.code))],
          severity,
          status: 'pending',
        });
      }

      const contentHash = createHash('sha256')
        .update(normalizedValues.sort().join('\n'))
        .digest('hex');

      if (hasBlockingIssue || proposedReviews.length > 0) {
        blockingQuestions += 1;
        reviewRows += proposedReviews.length;
        if (apply) {
          if (proposedReviews.length > 0) {
            const { error: reviewError } = await supabase
              .from('question_content_reviews')
              .upsert(proposedReviews, {
                onConflict: 'entity_type,entity_id,field_name,original_value',
                ignoreDuplicates: true,
              });
            if (reviewError) throw reviewError;
          }
          const { error: updateError } = await supabase
            .from('questions')
            .update({ content_hash: contentHash, content_quality_status: 'needs_review' })
            .eq('id', question.id);
          if (updateError) throw updateError;
        }
      } else {
        verifiedQuestions += 1;
        if (apply) {
          const { error: updateError } = await supabase
            .from('questions')
            .update({
              content_hash: contentHash,
              content_format_version: 2,
              content_quality_status: 'verified',
            })
            .eq('id', question.id);
          if (updateError) throw updateError;
        }
      }
    }

    questions += page.length;
    offset += page.length;
    if (page.length < remaining) break;
  }

  console.log(`CONTENT_AUDIT_MODE=${apply ? 'apply' : 'dry-run'}`);
  console.log(`QUESTIONS_SCANNED=${questions}`);
  console.log(`CONTENT_FIELDS_SCANNED=${fields}`);
  console.log(`QUESTIONS_NEEDS_REVIEW=${blockingQuestions}`);
  console.log(`REVIEW_ROWS=${reviewRows}`);
  console.log(`QUESTIONS_VERIFIED=${verifiedQuestions}`);
  console.log('CONTENT_AUDIT_RESULT=pass');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
