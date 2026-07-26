-- 1. `question_tags` liên kết với bảng `tags`
ALTER TABLE question_tags ADD COLUMN tag_id BIGINT REFERENCES tags(id);
-- Chúng ta sẽ cần migrate dữ liệu sau (trong một script riêng hoặc RPC nếu cần)

-- 2. Thống nhất cách lưu asset
-- (Chỉ cần đánh dấu hoặc thông báo, hiện tại để nguyên cột URL text thô để tương thích ngược, 
-- chỉ comment nhắc nhở nên dùng bảng asset. Xóa sau khi update code front-end)

-- 3. `r2_assets.linked_to_id` là `TEXT` thay vì `UUID`
-- Không thể cast an toàn nếu có dữ liệu text không phải UUID.
-- Nhưng ta có thể đổi type vì dự án mới tạo.
-- Tránh lỗi "cannot cast type text to uuid", dùng USING
ALTER TABLE r2_assets ALTER COLUMN linked_to_id TYPE UUID USING linked_to_id::UUID;

-- 4. `students` có email trùng với `profiles`
-- Xóa cột gmail dư thừa, dùng email từ profiles
-- Cannot drop it directly because of view dependency. Commenting out for now.
-- ALTER TABLE students DROP COLUMN IF EXISTS gmail;

-- 5. Rủi ro leo thang quyền hạn (`profiles.role`)
CREATE POLICY "Không tự đổi role"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- 6. Thiếu GIN index cho Full-Text Search tiếng Việt
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_questions_search_vector
  ON questions USING GIN (search_vector);

-- CREATE INDEX IF NOT EXISTS idx_questions_content_trgm
--  ON questions USING GIN (content gin_trgm_ops);

-- 7. Thiếu nhiều index cho các truy vấn thường gặp
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions (status);
CREATE INDEX IF NOT EXISTS idx_questions_subject_code ON questions (subject_code);
CREATE INDEX IF NOT EXISTS idx_questions_knowledge_field_id ON questions (knowledge_field_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions (type);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions (difficulty);

CREATE INDEX IF NOT EXISTS idx_kf_parent_id ON knowledge_fields (parent_id);
CREATE INDEX IF NOT EXISTS idx_kf_subject_code ON knowledge_fields (subject_code);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions (status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_id ON exam_sessions (student_id);

CREATE INDEX IF NOT EXISTS idx_exam_keys_status ON exam_keys (status);
CREATE INDEX IF NOT EXISTS idx_exam_keys_assigned_to ON exam_keys (assigned_to);
CREATE INDEX IF NOT EXISTS idx_exam_keys_expires_at ON exam_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_exam_room_questions_question_id ON exam_room_questions (question_id);

-- 8. Thiếu unique constraint quan trọng
ALTER TABLE knowledge_fields ADD CONSTRAINT unique_subject_code_slug UNIQUE (subject_code, slug);
ALTER TABLE exam_blueprint_sections ADD CONSTRAINT unique_blueprint_id_section_code UNIQUE (blueprint_id, section_code);
ALTER TABLE exam_blueprint_sections ADD CONSTRAINT unique_blueprint_id_seq UNIQUE (blueprint_id, seq);
ALTER TABLE exam_room_papers ADD CONSTRAINT unique_exam_room_id_paper_code UNIQUE (exam_room_id, paper_code);
ALTER TABLE exam_rooms ADD CONSTRAINT check_ends_after_starts CHECK (ends_at > starts_at);

-- 9. `session_answers` có dữ liệu dư thừa không nhất quán
-- Giữ lại answer_json, drop 2 cột kia
ALTER TABLE session_answers DROP COLUMN IF EXISTS selected_option_id;
ALTER TABLE session_answers DROP COLUMN IF EXISTS short_answer_text;

-- 10. JSONB fields không có schema validation
CREATE EXTENSION IF NOT EXISTS pg_jsonschema;

ALTER TABLE exam_sessions
  ADD CONSTRAINT valid_shuffle_config
  CHECK (jsonb_matches_schema(
    '{"type":"object","properties":{"question_order":{"type":"array"}}}',
    shuffle_config
  ));

-- 11. `knowledge_fields` cần extension `ltree` cho cây phân cấp
CREATE EXTENSION IF NOT EXISTS ltree;
ALTER TABLE knowledge_fields ADD COLUMN IF NOT EXISTS path ltree;
CREATE INDEX IF NOT EXISTS idx_kf_path ON knowledge_fields USING GIST (path);

-- 12. `exam_blueprints.exam_year` hardcode giới hạn năm 2025
ALTER TABLE exam_blueprints DROP CONSTRAINT IF EXISTS exam_blueprints_exam_year_check;
ALTER TABLE exam_blueprints ADD CONSTRAINT exam_blueprints_exam_year_check CHECK (exam_year >= 2000 AND exam_year <= EXTRACT(YEAR FROM NOW()) + 2);

-- 13. Lịch sử thay đổi câu hỏi
CREATE TABLE IF NOT EXISTS question_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES questions(id),
  changed_by  UUID REFERENCES profiles(id),
  changed_at  TIMESTAMPTZ DEFAULT now(),
  old_data    JSONB,
  new_data    JSONB,
  action      TEXT CHECK (action IN ('update', 'status_change', 'delete'))
);

-- 14. Cơ chế Soft Delete
ALTER TABLE questions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE exam_rooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE exam_keys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 15. Payment chưa có bảng riêng
CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_key_id  UUID REFERENCES exam_keys(id),
  student_id   UUID REFERENCES students(id),
  amount_vnd   INTEGER NOT NULL CHECK (amount_vnd >= 0),
  status       TEXT CHECK (status IN ('pending','completed','failed','refunded')),
  gateway      TEXT,  -- 'vnpay', 'momo', 'bank_transfer'
  gateway_ref  TEXT,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- ĐỊNH DẠNG CÂU HỎI
-- ==========================================

-- === MULTIPLE CHOICE ===
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS mc_select_count SMALLINT NOT NULL DEFAULT 1
    CHECK (mc_select_count >= 1 AND mc_select_count <= 10),
  ADD COLUMN IF NOT EXISTS subtype TEXT;

ALTER TABLE question_options
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD CONSTRAINT valid_label CHECK (label ~ '^[A-Z]{1,2}$');

-- Trigger kiểm tra số đáp án đúng khớp mc_select_count
CREATE OR REPLACE FUNCTION validate_correct_option_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  expected SMALLINT;
  actual   INT;
BEGIN
  SELECT mc_select_count INTO expected FROM questions WHERE id = NEW.question_id;
  SELECT COUNT(*) INTO actual FROM question_correct_options WHERE question_id = NEW.question_id;
  IF actual > expected THEN
    RAISE EXCEPTION 'Câu hỏi chỉ cho phép % đáp án đúng, hiện có %', expected, actual;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_correct_options ON question_correct_options;
CREATE TRIGGER trg_validate_correct_options
  BEFORE INSERT ON question_correct_options
  FOR EACH ROW EXECUTE FUNCTION validate_correct_option_count();

-- === TRUE/FALSE ===
ALTER TABLE question_true_false_items
  DROP CONSTRAINT IF EXISTS question_true_false_items_seq_check,
  ADD CONSTRAINT question_true_false_items_seq_check CHECK (seq >= 1 AND seq <= 10),
  ADD COLUMN IF NOT EXISTS label TEXT,
  DROP CONSTRAINT IF EXISTS unique_item_label,
  ADD CONSTRAINT unique_item_label UNIQUE (question_id, label);

CREATE TABLE IF NOT EXISTS question_tf_score_steps (
  question_id        UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  correct_item_count INTEGER NOT NULL CHECK (correct_item_count >= 0),
  points             NUMERIC NOT NULL CHECK (points >= 0),
  PRIMARY KEY (question_id, correct_item_count)
);

-- Chi tiết đáp án Đúng/Sai theo từng mệnh đề. Bảng gốc THIẾU lệnh CREATE ở mọi
-- migration (chỉ tồn tại out-of-band trên remote), khiến `supabase db reset` chết
-- ngay tại trigger phía dưới. Thêm ở đây để schema tái lập được từ đầu.
-- IF NOT EXISTS -> no-op trên môi trường đã có bảng (không đổi cấu trúc remote).
CREATE TABLE IF NOT EXISTS session_tf_item_answers (
  session_question_id UUID        NOT NULL REFERENCES exam_session_questions(id) ON DELETE CASCADE,
  item_id             UUID        NOT NULL REFERENCES question_true_false_items(id) ON DELETE CASCADE,
  selected_value      BOOLEAN,
  is_correct          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_question_id, item_id)
);
ALTER TABLE session_tf_item_answers ENABLE ROW LEVEL SECURITY;

-- Trigger sync session_answers.correct_item_count từ session_tf_item_answers
CREATE OR REPLACE FUNCTION sync_tf_aggregate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE session_answers
  SET
    correct_item_count = (
      SELECT COUNT(*) FROM session_tf_item_answers
      WHERE session_question_id = NEW.session_question_id AND is_correct = TRUE
    ),
    updated_at = now()
  WHERE session_question_id = NEW.session_question_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tf_aggregate ON session_tf_item_answers;
CREATE TRIGGER trg_sync_tf_aggregate
  AFTER INSERT OR UPDATE ON session_tf_item_answers
  FOR EACH ROW EXECUTE FUNCTION sync_tf_aggregate();

-- === SHORT ANSWER ===
ALTER TABLE question_short_answer_keys
  ADD COLUMN IF NOT EXISTS answer_type TEXT NOT NULL DEFAULT 'text'
    CHECK (answer_type IN ('text', 'numeric', 'expression', 'regex')),
  ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unaccent_normalize BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS match_mode TEXT NOT NULL DEFAULT 'exact'
    CHECK (match_mode IN ('exact', 'contains', 'starts_with', 'fuzzy')),
  ADD COLUMN IF NOT EXISTS fuzzy_threshold NUMERIC DEFAULT 0.8
    CHECK (fuzzy_threshold > 0 AND fuzzy_threshold <= 1.0),
  ADD COLUMN IF NOT EXISTS display_value TEXT,
  DROP CONSTRAINT IF EXISTS valid_answer_type_data,
  ADD CONSTRAINT valid_answer_type_data CHECK (
    (answer_type = 'text'       AND normalized_text IS NOT NULL) OR
    (answer_type = 'numeric'    AND numeric_value IS NOT NULL)   OR
    (answer_type = 'expression' AND normalized_text IS NOT NULL) OR
    (answer_type = 'regex'      AND regex_pattern IS NOT NULL)
  );
