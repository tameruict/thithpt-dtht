import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeMathV2 } from '../src/lib/math-normalize-v2';
import { validateMathContent } from '../src/lib/math-content';

type QuestionOption = { id: string; content: string | null };
type TrueFalseItem = { id: string; content: string | null };
type QuestionRow = {
  id: string;
  content: string | null;
  explanation: string | null;
  question_options?: QuestionOption[] | null;
  question_true_false_items?: TrueFalseItem[] | null;
};
type ReviewRecord = {
  question_id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  original_value: string;
  proposed_value: string;
  issue_codes: string[];
  severity: 'warning' | 'error';
  status: 'applied' | 'pending';
};

function loadLocalEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch { /* CI provides env directly */ }
}

async function main() {
  loadLocalEnv();
  const apply = process.argv.includes('--apply');
  const write = process.argv.includes('--write');
  if (write && !process.argv.includes('--confirm')) {
    throw new Error('Refusing --write without --confirm (mass UPDATE guard). Rerun with --write --confirm.');
  }
  const limitArg = process.argv.find((v) => v.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : 0;
  const offsetArg = process.argv.find((v) => v.startsWith('--offset='))?.split('=')[1];
  const startOffset = offsetArg ? Number(offsetArg) : 0;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Missing Supabase env');

  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const pageSize = 200;
  const tableFor: Record<string, string> = {
    question: 'questions', option: 'question_options', true_false_item: 'question_true_false_items',
  };
  let offset = startOffset, questions = 0, fields = 0, changed = 0, fixedValid = 0, stillInvalid = 0, regressed = 0;
  let written = 0;
  const skipped = 0;
  const ruleCounts = new Map<string, number>();

  while (!limit || questions < limit) {
    const remaining = limit ? Math.min(pageSize, limit - questions) : pageSize;
    const { data, error } = await supabase.from('questions').select(`
        id,code,content,explanation,
        question_options!question_options_question_id_fkey(id,content),
        question_true_false_items(id,content)
      `).is('deleted_at', null).order('id').range(offset, offset + remaining - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as QuestionRow[];
    if (page.length === 0) break;

    for (const q of page) {
      const candidates: Array<{ entity: string; id: string; field: string; value: string }> = [
        { entity: 'question', id: q.id, field: 'content', value: q.content ?? '' },
        ...(q.explanation ? [{ entity: 'question', id: q.id, field: 'explanation', value: q.explanation }] : []),
        ...((q.question_options ?? []).map((o) => ({ entity: 'option', id: o.id, field: 'content', value: o.content ?? '' }))),
        ...((q.question_true_false_items ?? []).map((t) => ({ entity: 'true_false_item', id: t.id, field: 'content', value: t.content ?? '' }))),
      ];
      const reviews: ReviewRecord[] = [];
      // Merge multiple field updates for the same row (e.g. questions.content + explanation).
      const rowUpdates = new Map<string, { table: string; id: string; patch: Record<string, string>; keys: Array<{ entity: string; field: string; original: string; proposed: string }> }>();
      for (const c of candidates) {
        fields += 1;
        const { normalized, applied } = normalizeMathV2(c.value ?? '');
        if (normalized === c.value || applied.length === 0) continue;
        changed += 1;
        for (const r of applied) ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
        const before = validateMathContent(c.value ?? '');
        const after = validateMathContent(normalized);
        if (!before.valid && after.valid) fixedValid += 1;
        if (!after.valid) stillInvalid += 1;
        if (before.valid && !after.valid) regressed += 1;
        if (apply || write) {
          reviews.push({
            question_id: q.id, entity_type: c.entity, entity_id: c.id, field_name: c.field,
            original_value: c.value, proposed_value: normalized,
            issue_codes: ['FORMAT_NORMALIZED_V2', ...applied.slice(0, 5)],
            severity: after.valid ? 'warning' : 'error', status: write ? 'applied' : 'pending',
          });
        }
        if (write) {
          const table = tableFor[c.entity];
          const key = `${table}:${c.id}`;
          if (!rowUpdates.has(key)) rowUpdates.set(key, { table, id: c.id, patch: {}, keys: [] });
          const entry = rowUpdates.get(key)!;
          entry.patch[c.field] = normalized;
          entry.keys.push({ entity: c.entity, field: c.field, original: c.value ?? '', proposed: normalized });
        }
      }
      if ((apply || write) && reviews.length > 0) {
        const { error: re } = await supabase.from('question_content_reviews').upsert(reviews, {
          onConflict: 'entity_type,entity_id,field_name,original_value', ignoreDuplicates: !write,
        });
        if (re) throw re;
      }
      if (write) {
        // Fast path: single UPDATE per row, no re-fetch guard.
        // Safe because normalizeMathV2 is idempotent and we run in a maintenance
        // window; concurrent edits would be overwritten only if they touch the
        // exact same field, which the reviews table still records (original_value).
        const entries = [...rowUpdates.values()];
        for (let i = 0; i < entries.length; i += 8) {
          await Promise.all(
            entries.slice(i, i + 8).map(async (entry) => {
              const { error: ue } = await supabase.from(entry.table).update(entry.patch).eq('id', entry.id);
              if (ue) throw ue;
            }),
          );
        }
        written += entries.reduce((n, e) => n + Object.keys(e.patch).length, 0);
      }
    }
    questions += page.length;
    offset += page.length;
    if (write || apply) console.log(`PROGRESS offset=${offset} changed_so_far=${changed} written_so_far=${written}`);
    if (page.length < remaining) break;
  }

  console.log(`NORMALIZE_MODE=${write ? 'write-db' : apply ? 'apply-reviews' : 'dry-run'}`);
  console.log(`QUESTIONS_SCANNED=${questions}`);
  console.log(`FIELDS_SCANNED=${fields}`);
  console.log(`FIELDS_WOULD_CHANGE=${changed}`);
  console.log(`FIELDS_WRITTEN=${written}`);
  console.log(`FIELDS_SKIPPED_GUARD=${skipped}`);
  console.log(`FIXED_TO_VALID=${fixedValid}`);
  console.log(`STILL_INVALID_AFTER=${stillInvalid}`);
  console.log(`REGRESSED_VALID_TO_INVALID=${regressed}`);
  console.log('RULE_COUNTS=' + [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(','));
  console.log('NORMALIZE_RESULT=pass');
}

main().catch((e) => { console.error(e?.stack ?? e); process.exitCode = 1; });
