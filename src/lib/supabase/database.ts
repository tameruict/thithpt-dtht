import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database as GeneratedDatabase,
  Json,
} from '../../../types/supabase';

type GeneratedPublicSchema = GeneratedDatabase['public'];
type GeneratedFunctions = GeneratedPublicSchema['Functions'];
type GeneratedTables = GeneratedPublicSchema['Tables'];

type KeyProductTable = {
  Row: {
    id: string;
    code: string;
    name: string;
    product_kind: string;
    attempt_count: number;
    price_amount: number;
    currency: string;
    valid_days: number | null;
    is_active: boolean;
    metadata: Json;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
  };
  Insert: {
    id?: string;
    code: string;
    name: string;
    product_kind: string;
    attempt_count: number;
    price_amount: number;
    currency?: string;
    valid_days?: number | null;
    is_active?: boolean;
    metadata?: Json;
    created_at?: string;
    updated_at?: string;
    archived_at?: string | null;
  };
  Update: {
    id?: string;
    code?: string;
    name?: string;
    product_kind?: string;
    attempt_count?: number;
    price_amount?: number;
    currency?: string;
    valid_days?: number | null;
    is_active?: boolean;
    metadata?: Json;
    created_at?: string;
    updated_at?: string;
    archived_at?: string | null;
  };
  Relationships: [];
};

type PurchaseOrderTable = {
  Row: {
    id: string;
    student_id: string;
    product_id: string | null;
    status: string;
    amount: number;
    currency: string;
    product_snapshot: Json;
    provider: string | null;
    provider_order_ref: string | null;
    idempotency_key: string;
    payment_code: string;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
    paid_at: string | null;
    fulfilled_at: string | null;
    failed_at: string | null;
    failure_code: string | null;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

type PaymentEventTable = {
  Row: {
    id: number;
    order_id: string | null;
    provider: string;
    provider_event_id: string;
    event_type: string;
    payload_sha256: string;
    payload: Json;
    received_at: string;
    processed_at: string | null;
    processing_error: string | null;
    transaction_at: string | null;
    direction: string | null;
    amount: number | null;
    content: string | null;
    account_number: string | null;
    bank_code: string | null;
    provider_reference: string | null;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

type PaymentProviderStateTable = {
  Row: {
    provider: string;
    cursor: string | null;
    locked_until: string | null;
    lock_owner: string | null;
    last_polled_at: string | null;
    last_success_at: string | null;
    last_error_code: string | null;
    auto_fulfillment_enabled: boolean;
    updated_at: string;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

type ForwardTables = GeneratedTables & {
  key_products: KeyProductTable;
  purchase_orders: PurchaseOrderTable;
  payment_events: PaymentEventTable;
  payment_provider_state: PaymentProviderStateTable;
  exam_keys: GeneratedTables['exam_keys'] & {
    Row: GeneratedTables['exam_keys']['Row'] & {
      source_order_id: string | null;
    };
    Insert: GeneratedTables['exam_keys']['Insert'] & {
      source_order_id?: string | null;
    };
    Update: GeneratedTables['exam_keys']['Update'] & {
      source_order_id?: string | null;
    };
  };
};

type ForwardFunctions = Omit<
  GeneratedFunctions,
  | 'start_practice_session'
  | 'get_active_exam_session_full'
  | 'register_r2_asset'
  | 'get_paper_composition'
  | 'compose_add_questions'
  | 'compose_remove_question'
  | 'generate_exam_keys'
  | 'get_question_content_review_queue'
  | 'apply_question_content_review'
> & {
  create_purchase_order: {
    Args: { p_product_id: string; p_idempotency_key: string };
    Returns: Json;
  };
  process_bank_payment: {
    Args: {
      p_provider: string;
      p_provider_event_id: string;
      p_transaction_at: string;
      p_direction: string;
      p_amount: number;
      p_content: string;
      p_payment_code: string;
      p_account_number: string;
      p_expected_account_number: string;
      p_bank_code: string;
      p_expected_bank_code: string;
      p_provider_reference: string | null;
      p_payload: Json;
      p_payload_sha256: string;
    };
    Returns: Json;
  };
  claim_payment_provider_lease: {
    Args: {
      p_provider: string;
      p_owner: string;
      p_lease_seconds?: number;
      p_force?: boolean;
    };
    Returns: Json;
  };
  complete_payment_provider_poll: {
    Args: {
      p_provider: string;
      p_owner: string;
      p_cursor: string | null;
      p_success: boolean;
      p_error_code?: string | null;
      p_disable_auto_fulfillment?: boolean;
    };
    Returns: Json;
  };
  reconcile_purchase_order: {
    Args: { p_order_id: string };
    Returns: Json;
  };
  revoke_purchase_order: {
    Args: { p_order_id: string; p_reason: string };
    Returns: Json;
  };
  generate_exam_keys: {
    Args: {
      p_exam_room_id?: string | null;
      p_expires_at?: string | null;
      p_is_public: boolean;
      p_note?: string | null;
      p_quantity: number;
      p_total_attempts: number;
    };
    Returns: Json;
  };
  get_active_exam_session_full: {
    Args: { p_session_id: string };
    Returns: Json;
  };
  start_practice_session: {
    Args: {
      p_subject_code: string;
      p_question_count?: number;
      p_knowledge_field_ids?: number[] | null;
      p_difficulties?: number[] | null;
    };
    Returns: string;
  };
  register_r2_asset: {
    Args: {
      p_public_url: string;
      p_bucket: string;
      p_object_key: string;
      p_file_name: string;
      p_content_type: string;
      p_size_bytes: number;
      p_width_px?: number | null;
      p_height_px?: number | null;
      p_alt_text?: string | null;
    };
    Returns: string;
  };
  get_paper_composition: {
    Args: { p_paper_id: string };
    Returns: Json;
  };
  compose_add_questions: {
    Args: { p_paper_id: string; p_question_ids: string[] };
    Returns: Json;
  };
  compose_remove_question: {
    Args: { p_paper_id: string; p_question_id: string };
    Returns: Json;
  };
  get_question_content_review_queue: {
    Args: {
      p_status?: string;
      p_limit?: number;
      p_after?: string | null;
    };
    Returns: Json;
  };
  apply_question_content_review: {
    Args: { p_review_id: string; p_action: 'approve' | 'reject' };
    Returns: undefined;
  };
};

/**
 * Generated from the linked live schema, then extended only with the additive
 * forward migration that is deployed to staging before production.
 */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublicSchema, 'Tables' | 'Functions'> & {
    Tables: ForwardTables;
    Functions: ForwardFunctions;
  };
};

export type { Json };
export type AppSupabaseClient = SupabaseClient<Database>;
