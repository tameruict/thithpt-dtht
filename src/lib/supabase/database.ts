import type { SupabaseClient } from '@supabase/supabase-js'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
          request_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: number
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: number
          request_id?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_discount: number | null
          max_uses: number | null
          min_order_amount: number
          name: string
          per_user_limit: number
          updated_at: string
          used_count: number
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number
          name?: string
          per_user_limit?: number
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number
          name?: string
          per_user_limit?: number
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          expires_at: string | null
          granted_at: string
          id: string
          kind: string
          metadata: Json
          revoked_at: string | null
          scope: string
          source_order_id: string | null
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          id?: string
          kind: string
          metadata?: Json
          revoked_at?: string | null
          scope?: string
          source_order_id?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          id?: string
          kind?: string
          metadata?: Json
          revoked_at?: string | null
          scope?: string
          source_order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_blueprint_section_rules: {
        Row: {
          created_at: string
          difficulty_distribution: Json
          id: string
          knowledge_distribution: Json
          question_filters: Json
          section_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty_distribution?: Json
          id?: string
          knowledge_distribution?: Json
          question_filters?: Json
          section_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty_distribution?: Json
          id?: string
          knowledge_distribution?: Json
          question_filters?: Json
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprint_section_rules_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "exam_blueprint_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_blueprint_section_score_steps: {
        Row: {
          correct_item_count: number
          points: number
          section_id: string
        }
        Insert: {
          correct_item_count: number
          points: number
          section_id: string
        }
        Update: {
          correct_item_count?: number
          points?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprint_section_score_steps_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_blueprint_sections: {
        Row: {
          blueprint_id: string
          choice_rule: Json
          created_at: string
          displayed_question_count: number
          grading_mode: string
          id: string
          instructions: string | null
          items_per_question: number
          max_points_per_question: number
          question_type: Database["public"]["Enums"]["question_type"]
          required_question_count: number
          section_code: string
          seq: number
          title: string
          updated_at: string
        }
        Insert: {
          blueprint_id: string
          choice_rule?: Json
          created_at?: string
          displayed_question_count: number
          grading_mode: string
          id?: string
          instructions?: string | null
          items_per_question?: number
          max_points_per_question: number
          question_type: Database["public"]["Enums"]["question_type"]
          required_question_count: number
          section_code: string
          seq: number
          title: string
          updated_at?: string
        }
        Update: {
          blueprint_id?: string
          choice_rule?: Json
          created_at?: string
          displayed_question_count?: number
          grading_mode?: string
          id?: string
          instructions?: string | null
          items_per_question?: number
          max_points_per_question?: number
          question_type?: Database["public"]["Enums"]["question_type"]
          required_question_count?: number
          section_code?: string
          seq?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprint_sections_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_blueprint_sections_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_blueprints: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          exam_year: number
          form_label: string
          id: string
          locked: boolean
          name: string
          program_version: string
          source_ref: string | null
          status: Database["public"]["Enums"]["blueprint_status"]
          subject_code: string
          total_score: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          exam_year: number
          form_label: string
          id?: string
          locked?: boolean
          name: string
          program_version?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["blueprint_status"]
          subject_code: string
          total_score?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          exam_year?: number
          form_label?: string
          id?: string
          locked?: boolean
          name?: string
          program_version?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["blueprint_status"]
          subject_code?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      exam_key_assignments: {
        Row: {
          claimed_at: string
          key_id: string
          revoked_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          claimed_at?: string
          key_id: string
          revoked_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          claimed_at?: string
          key_id?: string
          revoked_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_key_assignments_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_assignments_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_assignments_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_assignments_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_key_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_key_usage_ledger: {
        Row: {
          attempts: number
          created_at: string
          id: number
          idempotency_key: string
          key_id: string
          reason: string
          session_id: string
          student_id: string
        }
        Insert: {
          attempts: number
          created_at?: string
          id?: never
          idempotency_key: string
          key_id: string
          reason: string
          session_id: string
          student_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          idempotency_key?: string
          key_id?: string
          reason?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_key_usage_ledger_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_exam_session_result"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_key_usage_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_keys: {
        Row: {
          activated_at: string | null
          assigned_to: string | null
          batch_id: string | null
          bound_at: string | null
          bound_device_hash: string | null
          code: string
          created_at: string
          deleted_at: string | null
          exam_room_id: string | null
          expires_at: string | null
          id: string
          is_public: boolean
          paper_id: string | null
          payment_ref: string | null
          price_paid: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["exam_key_status"]
          total_attempts: number
          updated_at: string
          used_attempts: number
        }
        Insert: {
          activated_at?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          bound_at?: string | null
          bound_device_hash?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean
          paper_id?: string | null
          payment_ref?: string | null
          price_paid?: number
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["exam_key_status"]
          total_attempts?: number
          updated_at?: string
          used_attempts?: number
        }
        Update: {
          activated_at?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          bound_at?: string | null
          bound_device_hash?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean
          paper_id?: string | null
          payment_ref?: string | null
          price_paid?: number
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["exam_key_status"]
          total_attempts?: number
          updated_at?: string
          used_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "key_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_room_generation_rules: {
        Row: {
          blueprint_section_id: string
          created_at: string
          difficulty_distribution: Json
          exam_room_id: string
          id: string
          knowledge_distribution: Json
          question_filters: Json
          selection_mode: string
          updated_at: string
        }
        Insert: {
          blueprint_section_id: string
          created_at?: string
          difficulty_distribution?: Json
          exam_room_id: string
          id?: string
          knowledge_distribution?: Json
          question_filters?: Json
          selection_mode?: string
          updated_at?: string
        }
        Update: {
          blueprint_section_id?: string
          created_at?: string
          difficulty_distribution?: Json
          exam_room_id?: string
          id?: string
          knowledge_distribution?: Json
          question_filters?: Json
          selection_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_room_generation_rules_blueprint_section_id_fkey"
            columns: ["blueprint_section_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_generation_rules_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_generation_rules_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_generation_rules_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_generation_rules_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_generation_rules_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_room_papers: {
        Row: {
          blueprint_id: string
          created_at: string
          display_order: number
          exam_room_id: string
          id: string
          is_default: boolean
          label: string | null
          paper_code: string
          published_at: string | null
          source_paper_id: string | null
          status: string
          subject_code: string
          updated_at: string
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          display_order?: number
          exam_room_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          paper_code: string
          published_at?: string | null
          source_paper_id?: string | null
          status?: string
          subject_code: string
          updated_at?: string
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          display_order?: number
          exam_room_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          paper_code?: string
          published_at?: string | null
          source_paper_id?: string | null
          status?: string
          subject_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_room_papers_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_source_paper_id_fkey"
            columns: ["source_paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_papers_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_room_papers_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      exam_room_questions: {
        Row: {
          blueprint_section_id: string
          branch_code: string | null
          created_at: string
          exam_room_id: string
          is_required: boolean
          paper_id: string
          points_override: number | null
          question_id: string
          seq: number
        }
        Insert: {
          blueprint_section_id: string
          branch_code?: string | null
          created_at?: string
          exam_room_id: string
          is_required?: boolean
          paper_id: string
          points_override?: number | null
          question_id: string
          seq: number
        }
        Update: {
          blueprint_section_id?: string
          branch_code?: string | null
          created_at?: string
          exam_room_id?: string
          is_required?: boolean
          paper_id?: string
          points_override?: number | null
          question_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_room_questions_blueprint_section_id_fkey"
            columns: ["blueprint_section_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_room_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_rooms: {
        Row: {
          blueprint_id: string
          blueprint_snapshot: Json
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number
          ends_at: string | null
          id: string
          mode: Database["public"]["Enums"]["exam_room_mode"]
          name: string
          price_vnd: number
          published_at: string | null
          settings: Json
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_room_status"]
          subject_code: string
          total_attempts_default: number
          updated_at: string
        }
        Insert: {
          blueprint_id: string
          blueprint_snapshot?: Json
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes: number
          ends_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["exam_room_mode"]
          name: string
          price_vnd?: number
          published_at?: string | null
          settings?: Json
          starts_at?: string | null
          status?: Database["public"]["Enums"]["exam_room_status"]
          subject_code: string
          total_attempts_default?: number
          updated_at?: string
        }
        Update: {
          blueprint_id?: string
          blueprint_snapshot?: Json
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number
          ends_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["exam_room_mode"]
          name?: string
          price_vnd?: number
          published_at?: string | null
          settings?: Json
          starts_at?: string | null
          status?: Database["public"]["Enums"]["exam_room_status"]
          subject_code?: string
          total_attempts_default?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      exam_session_key_charges: {
        Row: {
          attempts: number
          created_at: string
          key_id: string
          session_id: string
        }
        Insert: {
          attempts: number
          created_at?: string
          key_id: string
          session_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          key_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_session_key_charges_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_key_charges_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_key_charges_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_key_charges_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_key_charges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_key_charges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_exam_session_result"
            referencedColumns: ["session_id"]
          },
        ]
      }
      exam_session_questions: {
        Row: {
          blueprint_section_id: string | null
          created_at: string
          display_no: string | null
          id: string
          max_points: number
          option_order: string[]
          question_id: string
          question_seq: number
          session_id: string
        }
        Insert: {
          blueprint_section_id?: string | null
          created_at?: string
          display_no?: string | null
          id?: string
          max_points: number
          option_order?: string[]
          question_id: string
          question_seq: number
          session_id: string
        }
        Update: {
          blueprint_section_id?: string | null
          created_at?: string
          display_no?: string | null
          id?: string
          max_points?: number
          option_order?: string[]
          question_id?: string
          question_seq?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_session_questions_blueprint_section_id_fkey"
            columns: ["blueprint_section_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_exam_session_result"
            referencedColumns: ["session_id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          attempt_number: number
          client_info: Json
          created_at: string
          due_at: string | null
          exam_id: string | null
          exam_room_id: string | null
          grading_error: string | null
          grading_status: Database["public"]["Enums"]["exam_grading_status"]
          id: string
          key_id: string | null
          max_score: number
          paper_id: string | null
          score: number | null
          scored_at: string | null
          shuffle_config: Json
          started_at: string
          status: Database["public"]["Enums"]["exam_session_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
          violation_count: number
        }
        Insert: {
          attempt_number: number
          client_info?: Json
          created_at?: string
          due_at?: string | null
          exam_id?: string | null
          exam_room_id?: string | null
          grading_error?: string | null
          grading_status?: Database["public"]["Enums"]["exam_grading_status"]
          id?: string
          key_id?: string | null
          max_score?: number
          paper_id?: string | null
          score?: number | null
          scored_at?: string | null
          shuffle_config?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
          violation_count?: number
        }
        Update: {
          attempt_number?: number
          client_info?: Json
          created_at?: string
          due_at?: string | null
          exam_id?: string | null
          exam_room_id?: string | null
          grading_error?: string | null
          grading_status?: Database["public"]["Enums"]["exam_grading_status"]
          id?: string
          key_id?: string | null
          max_score?: number
          paper_id?: string | null
          score?: number | null
          scored_at?: string | null
          shuffle_config?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["exam_session_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
          violation_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sources: {
        Row: {
          created_at: string
          created_by: string | null
          exam_year: number | null
          id: string
          metadata: Json
          organization: string | null
          province: string | null
          source_kind: string
          source_slug: string | null
          source_type: string
          subject_code: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exam_year?: number | null
          id?: string
          metadata?: Json
          organization?: string | null
          province?: string | null
          source_kind?: string
          source_slug?: string | null
          source_type?: string
          subject_code: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exam_year?: number | null
          id?: string
          metadata?: Json
          organization?: string | null
          province?: string | null
          source_kind?: string
          source_slug?: string | null
          source_type?: string
          subject_code?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sources_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_sources_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      exams: {
        Row: {
          answer_key_confidence: string
          blueprint_id: string | null
          code: string
          content_hash: string
          created_at: string
          drive_file_id: string | null
          duration_minutes: number
          exam_kind: string
          has_official_key: boolean
          id: string
          is_free: boolean
          metadata: Json
          question_count: number
          r2_archive_key: string | null
          round: number | null
          search_vector: unknown
          source_docx_path: string | null
          source_id: string | null
          status: string
          subject_code: string
          title: string
          updated_at: string
          year: number
        }
        Insert: {
          answer_key_confidence?: string
          blueprint_id?: string | null
          code: string
          content_hash: string
          created_at?: string
          drive_file_id?: string | null
          duration_minutes: number
          exam_kind?: string
          has_official_key?: boolean
          id?: string
          is_free?: boolean
          metadata?: Json
          question_count?: number
          r2_archive_key?: string | null
          round?: number | null
          search_vector?: unknown
          source_docx_path?: string | null
          source_id?: string | null
          status?: string
          subject_code: string
          title: string
          updated_at?: string
          year: number
        }
        Update: {
          answer_key_confidence?: string
          blueprint_id?: string | null
          code?: string
          content_hash?: string
          created_at?: string
          drive_file_id?: string | null
          duration_minutes?: number
          exam_kind?: string
          has_official_key?: boolean
          id?: string
          is_free?: boolean
          metadata?: Json
          question_count?: number
          r2_archive_key?: string | null
          round?: number | null
          search_vector?: unknown
          source_docx_path?: string | null
          source_id?: string | null
          status?: string
          subject_code?: string
          title?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "exam_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exams_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      key_batches: {
        Row: {
          created_at: string
          created_by: string | null
          exam_room_id: string | null
          expires_at: string | null
          id: string
          is_public: boolean
          note: string | null
          quantity: number
          total_attempts: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean
          note?: string | null
          quantity: number
          total_attempts?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean
          note?: string | null
          quantity?: number
          total_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "key_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_batches_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_batches_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_batches_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_batches_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_batches_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
        ]
      }
      key_products: {
        Row: {
          archived_at: string | null
          attempt_count: number
          code: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          price_amount: number
          product_kind: string
          updated_at: string
          valid_days: number | null
        }
        Insert: {
          archived_at?: string | null
          attempt_count: number
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          price_amount: number
          product_kind: string
          updated_at?: string
          valid_days?: number | null
        }
        Update: {
          archived_at?: string | null
          attempt_count?: number
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          price_amount?: number
          product_kind?: string
          updated_at?: string
          valid_days?: number | null
        }
        Relationships: []
      }
      key_topups: {
        Row: {
          added_attempts: number
          created_at: string
          extended_days: number | null
          id: string
          key_id: string
          order_id: string
        }
        Insert: {
          added_attempts: number
          created_at?: string
          extended_days?: number | null
          id?: string
          key_id: string
          order_id: string
        }
        Update: {
          added_attempts?: number
          created_at?: string
          extended_days?: number | null
          id?: string
          key_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_topups_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_topups_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_topups_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_topups_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_topups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_fields: {
        Row: {
          created_at: string
          display_order: number
          grade: number | null
          id: number
          metadata: Json
          name: string
          parent_id: number | null
          path: unknown
          slug: string
          subject_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          grade?: number | null
          id?: never
          metadata?: Json
          name: string
          parent_id?: number | null
          path?: unknown
          slug: string
          subject_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          grade?: number | null
          id?: never
          metadata?: Json
          name?: string
          parent_id?: number | null
          path?: unknown
          slug?: string
          subject_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_fields_parent_subject_fkey"
            columns: ["parent_id", "subject_code"]
            isOneToOne: false
            referencedRelation: "knowledge_fields"
            referencedColumns: ["id", "subject_code"]
          },
          {
            foreignKeyName: "knowledge_fields_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "knowledge_fields_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      ocr_import_staging: {
        Row: {
          created_at: string
          id: number
          imported_at: string | null
          payload: Json
          result: Json | null
          seq: number | null
          subject_code: string
        }
        Insert: {
          created_at?: string
          id?: never
          imported_at?: string | null
          payload: Json
          result?: Json | null
          seq?: number | null
          subject_code: string
        }
        Update: {
          created_at?: string
          id?: never
          imported_at?: string | null
          payload?: Json
          result?: Json | null
          seq?: number | null
          subject_code?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_code: string | null
          content: string | null
          direction: string | null
          event_type: string
          id: number
          order_id: string | null
          payload: Json
          payload_sha256: string
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string
          provider_reference: string | null
          received_at: string
          transaction_at: string | null
        }
        Insert: {
          account_number?: string | null
          amount?: number | null
          bank_code?: string | null
          content?: string | null
          direction?: string | null
          event_type: string
          id?: number
          order_id?: string | null
          payload: Json
          payload_sha256: string
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id: string
          provider_reference?: string | null
          received_at?: string
          transaction_at?: string | null
        }
        Update: {
          account_number?: string | null
          amount?: number | null
          bank_code?: string | null
          content?: string | null
          direction?: string | null
          event_type?: string
          id?: number
          order_id?: string | null
          payload?: Json
          payload_sha256?: string
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string
          provider_reference?: string | null
          received_at?: string
          transaction_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_state: {
        Row: {
          auto_fulfillment_enabled: boolean
          cursor: string | null
          last_error_code: string | null
          last_polled_at: string | null
          last_success_at: string | null
          lock_owner: string | null
          locked_until: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          auto_fulfillment_enabled?: boolean
          cursor?: string | null
          last_error_code?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          lock_owner?: string | null
          locked_until?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          auto_fulfillment_enabled?: boolean
          cursor?: string | null
          last_error_code?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          lock_owner?: string | null
          locked_until?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_vnd: number
          created_at: string | null
          exam_key_id: string | null
          gateway: string | null
          gateway_ref: string | null
          id: string
          paid_at: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          amount_vnd: number
          created_at?: string | null
          exam_key_id?: string | null
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          paid_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          amount_vnd?: number
          created_at?: string | null
          exam_key_id?: string | null
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          paid_at?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_exam_key_id_fkey"
            columns: ["exam_key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_exam_key_id_fkey"
            columns: ["exam_key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_exam_key_id_fkey"
            columns: ["exam_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_exam_key_id_fkey"
            columns: ["exam_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          amount: number
          coupon_code: string | null
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string | null
          failed_at: string | null
          failure_code: string | null
          fulfilled_at: string | null
          id: string
          idempotency_key: string
          original_amount: number | null
          paid_at: string | null
          payment_code: string
          product_id: string | null
          product_snapshot: Json
          provider: string | null
          provider_order_ref: string | null
          status: string
          student_id: string
          target_key_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          coupon_code?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          fulfilled_at?: string | null
          id?: string
          idempotency_key: string
          original_amount?: number | null
          paid_at?: string | null
          payment_code: string
          product_id?: string | null
          product_snapshot: Json
          provider?: string | null
          provider_order_ref?: string | null
          status?: string
          student_id: string
          target_key_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          coupon_code?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          fulfilled_at?: string | null
          id?: string
          idempotency_key?: string
          original_amount?: number | null
          paid_at?: string | null
          payment_code?: string
          product_id?: string | null
          product_snapshot?: Json
          provider?: string | null
          provider_order_ref?: string | null
          status?: string
          student_id?: string
          target_key_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "key_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_target_key_fkey"
            columns: ["target_key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_target_key_fkey"
            columns: ["target_key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_target_key_fkey"
            columns: ["target_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_target_key_fkey"
            columns: ["target_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
        ]
      }
      question_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          kind: string
          question_id: string
          r2_asset_id: string | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          kind: string
          question_id: string
          r2_asset_id?: string | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          kind?: string
          question_id?: string
          r2_asset_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_assets_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assets_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assets_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_audit_log: {
        Row: {
          action: string | null
          changed_at: string | null
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          question_id: string
        }
        Insert: {
          action?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          question_id: string
        }
        Update: {
          action?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_audit_log_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_audit_log_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_content_reviews: {
        Row: {
          detected_at: string
          entity_id: string
          entity_type: string
          field_name: string
          id: string
          issue_codes: string[]
          original_value: string | null
          proposed_value: string | null
          question_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
        }
        Insert: {
          detected_at?: string
          entity_id: string
          entity_type: string
          field_name: string
          id?: string
          issue_codes?: string[]
          original_value?: string | null
          proposed_value?: string | null
          question_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          detected_at?: string
          entity_id?: string
          entity_type?: string
          field_name?: string
          id?: string
          issue_codes?: string[]
          original_value?: string | null
          proposed_value?: string | null
          question_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_content_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_content_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_content_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_correct_options: {
        Row: {
          created_at: string
          option_id: string
          question_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          question_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_correct_options_option_id_fk"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_correct_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_correct_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_correct_options_question_id_option_id_fkey"
            columns: ["question_id", "option_id"]
            isOneToOne: true
            referencedRelation: "question_options"
            referencedColumns: ["question_id", "id"]
          },
        ]
      }
      question_duplicate_reviews: {
        Row: {
          answer_signature_matches: boolean
          canonical_question_id: string
          content_hash: string
          created_at: string
          duplicate_question_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subject_code: string
        }
        Insert: {
          answer_signature_matches: boolean
          canonical_question_id: string
          content_hash: string
          created_at?: string
          duplicate_question_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_code: string
        }
        Update: {
          answer_signature_matches?: boolean
          canonical_question_id?: string
          content_hash?: string
          created_at?: string
          duplicate_question_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_duplicate_reviews_canonical_question_id_fkey"
            columns: ["canonical_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_duplicate_reviews_canonical_question_id_fkey"
            columns: ["canonical_question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_duplicate_reviews_duplicate_question_id_fkey"
            columns: ["duplicate_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_duplicate_reviews_duplicate_question_id_fkey"
            columns: ["duplicate_question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_duplicate_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_essay_rubric_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_points: number
          question_id: string
          seq: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_points: number
          question_id: string
          seq: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_points?: number
          question_id?: string
          seq?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_essay_rubric_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_essay_rubric_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_group_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          group_id: string
          id: string
          kind: string
          r2_asset_id: string | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          group_id: string
          id?: string
          kind?: string
          r2_asset_id?: string | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          group_id?: string
          id?: string
          kind?: string
          r2_asset_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_group_assets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_group_assets_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_groups: {
        Row: {
          asset_url: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          r2_asset_id: string | null
          stimulus: string | null
          subject_code: string
          title: string | null
          updated_at: string
        }
        Insert: {
          asset_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          r2_asset_id?: string | null
          stimulus?: string | null
          subject_code: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          asset_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          r2_asset_id?: string | null
          stimulus?: string | null
          subject_code?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_groups_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_groups_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "question_groups_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      question_import_jobs: {
        Row: {
          auto_approve: boolean
          created_at: string
          default_difficulty: number | null
          default_status: Database["public"]["Enums"]["question_status"] | null
          error_count: number
          file_name: string
          file_url: string | null
          finished_at: string | null
          format: string
          id: string
          imported_by: string | null
          mapping_config: Json
          r2_asset_id: string | null
          skip_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["import_job_status"]
          subject_code: string
          success_count: number
          summary_log: Json
          total_rows: number | null
        }
        Insert: {
          auto_approve?: boolean
          created_at?: string
          default_difficulty?: number | null
          default_status?: Database["public"]["Enums"]["question_status"] | null
          error_count?: number
          file_name: string
          file_url?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          imported_by?: string | null
          mapping_config?: Json
          r2_asset_id?: string | null
          skip_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_job_status"]
          subject_code: string
          success_count?: number
          summary_log?: Json
          total_rows?: number | null
        }
        Update: {
          auto_approve?: boolean
          created_at?: string
          default_difficulty?: number | null
          default_status?: Database["public"]["Enums"]["question_status"] | null
          error_count?: number
          file_name?: string
          file_url?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          imported_by?: string | null
          mapping_config?: Json
          r2_asset_id?: string | null
          skip_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_job_status"]
          subject_code?: string
          success_count?: number
          summary_log?: Json
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_import_jobs_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_import_jobs_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_import_jobs_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "question_import_jobs_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      question_import_rows: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          question_id: string | null
          raw_data: Json
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          question_id?: string | null
          raw_data?: Json
          row_number: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          question_id?: string | null
          raw_data?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "question_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_import_rows_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_import_rows_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          content: string
          created_at: string
          explanation: string | null
          id: string
          image_alt_text: string | null
          image_url: string | null
          label: string
          question_id: string
          r2_asset_id: string | null
          seq: number
        }
        Insert: {
          content: string
          created_at?: string
          explanation?: string | null
          id?: string
          image_alt_text?: string | null
          image_url?: string | null
          label: string
          question_id: string
          r2_asset_id?: string | null
          seq: number
        }
        Update: {
          content?: string
          created_at?: string
          explanation?: string | null
          id?: string
          image_alt_text?: string | null
          image_url?: string | null
          label?: string
          question_id?: string
          r2_asset_id?: string | null
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_options_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_short_answer_keys: {
        Row: {
          answer_type: string
          case_sensitive: boolean
          created_at: string
          display_value: string | null
          fuzzy_threshold: number | null
          id: string
          is_primary: boolean
          match_mode: string
          normalized_text: string | null
          note: string | null
          numeric_value: number | null
          question_id: string
          regex_pattern: string | null
          tolerance: number | null
          unaccent_normalize: boolean
        }
        Insert: {
          answer_type?: string
          case_sensitive?: boolean
          created_at?: string
          display_value?: string | null
          fuzzy_threshold?: number | null
          id?: string
          is_primary?: boolean
          match_mode?: string
          normalized_text?: string | null
          note?: string | null
          numeric_value?: number | null
          question_id: string
          regex_pattern?: string | null
          tolerance?: number | null
          unaccent_normalize?: boolean
        }
        Update: {
          answer_type?: string
          case_sensitive?: boolean
          created_at?: string
          display_value?: string | null
          fuzzy_threshold?: number | null
          id?: string
          is_primary?: boolean
          match_mode?: string
          normalized_text?: string | null
          note?: string | null
          numeric_value?: number | null
          question_id?: string
          regex_pattern?: string | null
          tolerance?: number | null
          unaccent_normalize?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "question_short_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_short_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_solutions: {
        Row: {
          created_at: string
          explanation: string | null
          question_id: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          question_id: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          question_id?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_solutions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_solutions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_source_links: {
        Row: {
          created_at: string
          question_id: string
          source_id: string
          source_question_code: string | null
        }
        Insert: {
          created_at?: string
          question_id: string
          source_id: string
          source_question_code?: string | null
        }
        Update: {
          created_at?: string
          question_id?: string
          source_id?: string
          source_question_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_source_links_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_source_links_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_source_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "exam_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      question_tags: {
        Row: {
          question_id: string
          tag: string
          tag_id: number | null
        }
        Insert: {
          question_id: string
          tag: string
          tag_id?: number | null
        }
        Update: {
          question_id?: string
          tag?: string
          tag_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      question_tf_score_steps: {
        Row: {
          correct_item_count: number
          points: number
          question_id: string
        }
        Insert: {
          correct_item_count: number
          points: number
          question_id: string
        }
        Update: {
          correct_item_count?: number
          points?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_tf_score_steps_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_tf_score_steps_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      question_true_false_answer_keys: {
        Row: {
          correct_value: boolean
          created_at: string
          item_id: string
          question_id: string
        }
        Insert: {
          correct_value: boolean
          created_at?: string
          item_id: string
          question_id: string
        }
        Update: {
          correct_value?: boolean
          created_at?: string
          item_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_true_false_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_true_false_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_true_false_answer_keys_question_id_item_id_fkey"
            columns: ["question_id", "item_id"]
            isOneToOne: true
            referencedRelation: "question_true_false_items"
            referencedColumns: ["question_id", "id"]
          },
        ]
      }
      question_true_false_items: {
        Row: {
          content: string
          created_at: string
          id: string
          label: string | null
          question_id: string
          seq: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          label?: string | null
          question_id: string
          seq: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          label?: string | null
          question_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_true_false_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_true_false_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "v_question_full"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          code: string
          content: string
          content_format_version: number
          content_hash: string | null
          content_quality_status: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          difficulty: number
          exam_id: string | null
          explanation: string | null
          group_id: string | null
          id: string
          image_alt_text: string | null
          image_height_px: number | null
          image_url: string | null
          image_width_px: number | null
          knowledge_field_id: number | null
          mc_select_count: number
          metadata: Json
          order_in_exam: number | null
          part: string | null
          r2_asset_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_vector: unknown
          source_label: string | null
          status: Database["public"]["Enums"]["question_status"]
          subject_code: string
          subject_track_code: string | null
          subtype: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          code: string
          content: string
          content_format_version?: number
          content_hash?: string | null
          content_quality_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          difficulty: number
          exam_id?: string | null
          explanation?: string | null
          group_id?: string | null
          id?: string
          image_alt_text?: string | null
          image_height_px?: number | null
          image_url?: string | null
          image_width_px?: number | null
          knowledge_field_id?: number | null
          mc_select_count?: number
          metadata?: Json
          order_in_exam?: number | null
          part?: string | null
          r2_asset_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_vector?: unknown
          source_label?: string | null
          status?: Database["public"]["Enums"]["question_status"]
          subject_code: string
          subject_track_code?: string | null
          subtype?: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          content?: string
          content_format_version?: number
          content_hash?: string | null
          content_quality_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          difficulty?: number
          exam_id?: string | null
          explanation?: string | null
          group_id?: string | null
          id?: string
          image_alt_text?: string | null
          image_height_px?: number | null
          image_url?: string | null
          image_width_px?: number | null
          knowledge_field_id?: number | null
          mc_select_count?: number
          metadata?: Json
          order_in_exam?: number | null
          part?: string | null
          r2_asset_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_vector?: unknown
          source_label?: string | null
          status?: Database["public"]["Enums"]["question_status"]
          subject_code?: string
          subject_track_code?: string | null
          subtype?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_knowledge_field_subject_fkey"
            columns: ["knowledge_field_id", "subject_code"]
            isOneToOne: false
            referencedRelation: "knowledge_fields"
            referencedColumns: ["id", "subject_code"]
          },
          {
            foreignKeyName: "questions_r2_asset_id_fkey"
            columns: ["r2_asset_id"]
            isOneToOne: false
            referencedRelation: "r2_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "questions_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
          {
            foreignKeyName: "questions_subject_code_subject_track_code_fkey"
            columns: ["subject_code", "subject_track_code"]
            isOneToOne: false
            referencedRelation: "subject_tracks"
            referencedColumns: ["subject_code", "code"]
          },
        ]
      }
      r2_assets: {
        Row: {
          alt_text: string | null
          bucket: string
          checksum_md5: string | null
          content_type: string
          created_at: string
          file_name: string
          height_px: number | null
          id: string
          linked_to_id: string | null
          linked_to_type: string | null
          object_key: string
          public_url: string
          size_bytes: number | null
          uploaded_by: string | null
          width_px: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket: string
          checksum_md5?: string | null
          content_type: string
          created_at?: string
          file_name: string
          height_px?: number | null
          id?: string
          linked_to_id?: string | null
          linked_to_type?: string | null
          object_key: string
          public_url: string
          size_bytes?: number | null
          uploaded_by?: string | null
          width_px?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          checksum_md5?: string | null
          content_type?: string
          created_at?: string
          file_name?: string
          height_px?: number | null
          id?: string
          linked_to_id?: string | null
          linked_to_type?: string | null
          object_key?: string
          public_url?: string
          size_bytes?: number | null
          uploaded_by?: string | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "r2_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_papers: {
        Row: {
          created_at: string
          display_order: number
          exam_room_id: string
          is_default: boolean
          paper_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          exam_room_id: string
          is_default?: boolean
          paper_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          exam_room_id?: string
          is_default?: boolean
          paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_papers_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_papers_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      session_answers: {
        Row: {
          answer_json: Json
          correct_item_count: number | null
          created_at: string
          earned_points: number | null
          grader: Json
          id: string
          is_correct: boolean | null
          selected_option_id: string | null
          session_question_id: string
          short_answer_text: string | null
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          answer_json?: Json
          correct_item_count?: number | null
          created_at?: string
          earned_points?: number | null
          grader?: Json
          id?: string
          is_correct?: boolean | null
          selected_option_id?: string | null
          session_question_id: string
          short_answer_text?: string | null
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          answer_json?: Json
          correct_item_count?: number | null
          created_at?: string
          earned_points?: number | null
          grader?: Json
          id?: string
          is_correct?: boolean | null
          selected_option_id?: string | null
          session_question_id?: string
          short_answer_text?: string | null
          student_id?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: true
            referencedRelation: "exam_session_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_answers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "session_answers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tf_item_answers: {
        Row: {
          created_at: string
          earned_points: number | null
          id: string
          is_correct: boolean | null
          item_id: string
          selected_value: boolean | null
          session_question_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          earned_points?: number | null
          id?: string
          is_correct?: boolean | null
          item_id: string
          selected_value?: boolean | null
          session_question_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          earned_points?: number | null
          id?: string
          is_correct?: boolean | null
          item_id?: string
          selected_value?: boolean | null
          session_question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tf_item_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "question_true_false_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tf_item_answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "exam_session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          current_key_id: string | null
          date_of_birth: string | null
          district_name: string | null
          free_exam_quota: number
          free_exam_used: number
          full_name: string | null
          gender: string | null
          id: string
          note: string | null
          phone: string | null
          province_name: string | null
          school_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_key_id?: string | null
          date_of_birth?: string | null
          district_name?: string | null
          free_exam_quota?: number
          free_exam_used?: number
          full_name?: string | null
          gender?: string | null
          id: string
          note?: string | null
          phone?: string | null
          province_name?: string | null
          school_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_key_id?: string | null
          date_of_birth?: string | null
          district_name?: string | null
          free_exam_quota?: number
          free_exam_used?: number
          full_name?: string | null
          gender?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          province_name?: string | null
          school_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_tracks: {
        Row: {
          code: string
          is_active: boolean
          name: string
          subject_code: string
        }
        Insert: {
          code: string
          is_active?: boolean
          name: string
          subject_code: string
        }
        Update: {
          code?: string
          is_active?: boolean
          name?: string
          subject_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_tracks_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subject_tracks_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          color_hex: string | null
          cover_url: string | null
          created_at: string
          default_duration_minutes: number
          deleted_at: string | null
          display_order: number
          exam_group: string
          exam_template: string
          family: string
          icon_url: string | null
          is_active: boolean
          is_compulsory: boolean
          name: string
          practice_attempt_cost: number
          updated_at: string
        }
        Insert: {
          code: string
          color_hex?: string | null
          cover_url?: string | null
          created_at?: string
          default_duration_minutes: number
          deleted_at?: string | null
          display_order?: number
          exam_group: string
          exam_template?: string
          family?: string
          icon_url?: string | null
          is_active?: boolean
          is_compulsory?: boolean
          name: string
          practice_attempt_cost?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color_hex?: string | null
          cover_url?: string | null
          created_at?: string
          default_duration_minutes?: number
          deleted_at?: string | null
          display_order?: number
          exam_group?: string
          exam_template?: string
          family?: string
          icon_url?: string | null
          is_active?: boolean
          is_compulsory?: boolean
          name?: string
          practice_attempt_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color_hex: string | null
          created_at: string
          id: number
          name: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_exam_key_overview: {
        Row: {
          assigned_to: string | null
          batch_expires_at: string | null
          batch_id: string | null
          batch_quantity: number | null
          code: string | null
          created_at: string | null
          exam_room_id: string | null
          exam_room_name: string | null
          expires_at: string | null
          id: string | null
          is_public: boolean | null
          remaining_attempts: number | null
          status: Database["public"]["Enums"]["exam_key_status"] | null
          student_name: string | null
          subject_code: string | null
          subject_name: string | null
          total_attempts: number | null
          used_attempts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "key_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_exam_room_options: {
        Row: {
          code: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string | null
          name: string | null
          status: Database["public"]["Enums"]["exam_room_status"] | null
          subject_code: string | null
          subject_name: string | null
          total_attempts_default: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      admin_exam_room_summary: {
        Row: {
          blueprint_code: string | null
          blueprint_id: string | null
          blueprint_name: string | null
          code: string | null
          created_at: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string | null
          name: string | null
          paper_count: number | null
          price_vnd: number | null
          published_at: string | null
          question_count: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_room_status"] | null
          subject_code: string | null
          subject_name: string | null
          total_attempts_default: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      exam_blueprint_score_summary: {
        Row: {
          code: string | null
          configured_score: number | null
          exam_year: number | null
          id: string | null
          is_score_valid: boolean | null
          subject_code: string | null
          total_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
        ]
      }
      student_key_summary: {
        Row: {
          assigned_key_count: number | null
          current_key_code: string | null
          current_key_expires_at: string | null
          current_key_has_been_used: boolean | null
          current_key_id: string | null
          current_key_status:
            | Database["public"]["Enums"]["exam_key_status"]
            | null
          district_name: string | null
          exam_room_code: string | null
          exam_room_id: string | null
          exam_room_name: string | null
          exhausted_key_count: number | null
          full_name: string | null
          gmail: string | null
          phone: string | null
          province_name: string | null
          remaining_attempts: number | null
          school_name: string | null
          student_id: string | null
          subject_code: string | null
          total_attempts: number | null
          used_attempts: number | null
          used_key_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_key_id_fkey"
            columns: ["current_key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_exam_key_balances: {
        Row: {
          consumed_attempts: number | null
          effective_status: string | null
          id: string | null
          remaining_attempts: number | null
          total_attempts: number | null
        }
        Relationships: []
      }
      v_exam_keys_effective: {
        Row: {
          activated_at: string | null
          assigned_to: string | null
          batch_id: string | null
          code: string | null
          created_at: string | null
          deleted_at: string | null
          effective_status:
            | Database["public"]["Enums"]["exam_key_status"]
            | null
          exam_room_id: string | null
          expires_at: string | null
          id: string | null
          is_public: boolean | null
          paper_id: string | null
          payment_ref: string | null
          price_paid: number | null
          remaining_attempts: number | null
          status: Database["public"]["Enums"]["exam_key_status"] | null
          total_attempts: number | null
          updated_at: string | null
          used_attempts: number | null
        }
        Insert: {
          activated_at?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          effective_status?: never
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string | null
          is_public?: boolean | null
          paper_id?: string | null
          payment_ref?: string | null
          price_paid?: number | null
          remaining_attempts?: never
          status?: Database["public"]["Enums"]["exam_key_status"] | null
          total_attempts?: number | null
          updated_at?: string | null
          used_attempts?: number | null
        }
        Update: {
          activated_at?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          effective_status?: never
          exam_room_id?: string | null
          expires_at?: string | null
          id?: string | null
          is_public?: boolean | null
          paper_id?: string | null
          payment_ref?: string | null
          price_paid?: number | null
          remaining_attempts?: never
          status?: Database["public"]["Enums"]["exam_key_status"] | null
          total_attempts?: number | null
          updated_at?: string | null
          used_attempts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_keys_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "key_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_keys_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_exam_room_readiness: {
        Row: {
          approved_practice_question_count: number | null
          blueprint_id: string | null
          code: string | null
          default_paper_id: string | null
          default_paper_question_count: number | null
          deleted_at: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string | null
          is_ready: boolean | null
          mode: Database["public"]["Enums"]["exam_room_mode"] | null
          name: string | null
          price_vnd: number | null
          published_at: string | null
          readiness_reason: string | null
          schedule_is_open: boolean | null
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_room_status"] | null
          subject_code: string | null
          total_attempts_default: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
          {
            foreignKeyName: "room_papers_paper_id_fkey"
            columns: ["default_paper_id"]
            isOneToOne: false
            referencedRelation: "exam_room_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_exam_rooms_full: {
        Row: {
          blueprint_code: string | null
          blueprint_id: string | null
          blueprint_name: string | null
          blueprint_snapshot: Json | null
          code: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string | null
          name: string | null
          price_vnd: number | null
          published_at: string | null
          settings: Json | null
          starts_at: string | null
          status: Database["public"]["Enums"]["exam_room_status"] | null
          subject_code: string | null
          subject_exam_group: string | null
          subject_name: string | null
          total_attempts_default: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_blueprints_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprint_score_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "exam_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_exam_session_result: {
        Row: {
          attempt_number: number | null
          created_at: string | null
          exam_room_code: string | null
          exam_room_id: string | null
          exam_room_name: string | null
          key_code: string | null
          key_id: string | null
          max_score: number | null
          minutes_taken: number | null
          province_name: string | null
          school_name: string | null
          score: number | null
          score_10: number | null
          session_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["exam_session_status"] | null
          student_id: string | null
          student_name: string | null
          subject_code: string | null
          subject_name: string | null
          submitted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exam_rooms_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_room_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "exam_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_room_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_exam_room_id_fkey"
            columns: ["exam_room_id"]
            isOneToOne: false
            referencedRelation: "v_exam_rooms_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "admin_exam_key_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "exam_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_key_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "v_exam_keys_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_key_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_question_bank_stats: {
        Row: {
          approved: number | null
          archived: number | null
          diff_nhan_biet: number | null
          diff_thong_hieu: number | null
          diff_van_dung: number | null
          diff_van_dung_cao: number | null
          draft: number | null
          essay_count: number | null
          mc_count: number | null
          reviewing: number | null
          sa_count: number | null
          subject_code: string | null
          subject_name: string | null
          tf_count: number | null
          total_questions: number | null
        }
        Relationships: []
      }
      v_question_full: {
        Row: {
          asset_count: number | null
          code: string | null
          content: string | null
          correct_option_count: number | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          difficulty: number | null
          explanation: string | null
          group_asset_url: string | null
          group_id: string | null
          group_stimulus: string | null
          id: string | null
          image_url: string | null
          knowledge_field_id: number | null
          knowledge_field_name: string | null
          metadata: Json | null
          option_count: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_label: string | null
          status: Database["public"]["Enums"]["question_status"] | null
          subject_code: string | null
          subject_name: string | null
          subject_track_code: string | null
          tags: string[] | null
          tf_item_count: number | null
          type: Database["public"]["Enums"]["question_type"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "question_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_knowledge_field_subject_fkey"
            columns: ["knowledge_field_id", "subject_code"]
            isOneToOne: false
            referencedRelation: "knowledge_fields"
            referencedColumns: ["id", "subject_code"]
          },
          {
            foreignKeyName: "questions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "questions_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "v_question_bank_stats"
            referencedColumns: ["subject_code"]
          },
          {
            foreignKeyName: "questions_subject_code_subject_track_code_fkey"
            columns: ["subject_code", "subject_track_code"]
            isOneToOne: false
            referencedRelation: "subject_tracks"
            referencedColumns: ["subject_code", "code"]
          },
        ]
      }
    }
    Functions: {
      activate_exam_key: {
        Args: { p_key_code: string; p_subject_code?: string }
        Returns: Json
      }
      admin_reset_key_device: { Args: { p_key_id: string }; Returns: Json }
      apply_answer_key: {
        Args: {
          p_answer: Json
          p_audit?: Json
          p_confidence?: string
          p_evidence?: string
          p_needs_human_check?: boolean
          p_question_id: string
          p_source?: string
        }
        Returns: Json
      }
      apply_question_content_review: {
        Args: { p_action: string; p_review_id: string }
        Returns: undefined
      }
      claim_payment_provider_lease: {
        Args: {
          p_force?: boolean
          p_lease_seconds?: number
          p_owner: string
          p_provider: string
        }
        Returns: Json
      }
      complete_payment_provider_poll: {
        Args: {
          p_cursor: string
          p_disable_auto_fulfillment?: boolean
          p_error_code?: string
          p_owner: string
          p_provider: string
          p_success: boolean
        }
        Returns: Json
      }
      create_purchase_order: {
        Args: {
          p_coupon_code?: string
          p_idempotency_key: string
          p_product_id: string
          p_target_key_id?: string
        }
        Returns: Json
      }
      expire_overdue_exam_sessions: { Args: never; Returns: number }
      finish_import_job: { Args: { p_job_id: string }; Returns: undefined }
      generate_exam_keys:
        | {
            Args: {
              p_exam_room_id: string
              p_expires_at?: string
              p_note?: string
              p_quantity: number
              p_total_attempts?: number
            }
            Returns: {
              batch_id: string
              code: string
              created_at: string
              exam_room_id: string
              exam_room_name: string
              expires_at: string
              id: string
              status: Database["public"]["Enums"]["exam_key_status"]
              subject_code: string
              total_attempts: number
              used_attempts: number
            }[]
          }
        | {
            Args: {
              p_exam_room_id: string
              p_expires_at: string
              p_is_public: boolean
              p_note: string
              p_quantity: number
              p_total_attempts: number
            }
            Returns: {
              batch_id: string
              code: string
              created_at: string
              exam_room_id: string
              exam_room_name: string
              expires_at: string
              id: string
              is_public: boolean
              status: Database["public"]["Enums"]["exam_key_status"]
              subject_code: string
              total_attempts: number
              used_attempts: number
            }[]
          }
        | {
            Args: {
              p_expires_at?: string
              p_note?: string
              p_quantity: number
              p_total_attempts?: number
            }
            Returns: {
              batch_id: string
              code: string
              created_at: string
              exam_room_id: string
              exam_room_name: string
              expires_at: string
              id: string
              status: Database["public"]["Enums"]["exam_key_status"]
              subject_code: string
              total_attempts: number
              used_attempts: number
            }[]
          }
      get_active_exam_session_full: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_active_session: { Args: never; Returns: Json }
      get_attempt_status: { Args: never; Returns: Json }
      get_exam_results: {
        Args: {
          p_exam_room_id?: string
          p_limit?: number
          p_status?: string
          p_subject_code?: string
        }
        Returns: Json
      }
      get_exam_session_full: { Args: { p_session_id: string }; Returns: Json }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          role: string
        }[]
      }
      get_pending_essays: { Args: { p_limit?: number }; Returns: Json }
      get_practice_bank: {
        Args: { p_subject_code: string }
        Returns: {
          difficulty: number
          group_slug: string
          has_explanation: boolean
          id: string
          knowledge_field_id: string
          slug: string
          source_label: string
          tf_item_count: number
          type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      get_practice_bank_stats: {
        Args: { p_subject_code: string }
        Returns: {
          difficulty: number
          group_slug: string
          knowledge_field_id: string
          n: number
          slug: string
          type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      get_question_content_review_queue: {
        Args: { p_after?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      get_room_leaderboard: {
        Args: { p_limit?: number; p_room_id: string }
        Returns: Json
      }
      get_session_review: { Args: { p_session_id: string }; Returns: Json }
      get_session_review_core_20260821: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_subjects_dashboard: { Args: never; Returns: Json }
      get_user_access: { Args: never; Returns: Json }
      grade_essay_answer: {
        Args: { p_answer_id: string; p_points: number }
        Returns: number
      }
      import_ocr_exam: { Args: { payload: Json }; Returns: Json }
      join_exam: {
        Args: {
          p_code: string
          p_device_hash?: string
          p_exam_room_id?: string
          p_subject_code?: string
        }
        Returns: string
      }
      process_bank_payment: {
        Args: {
          p_account_number: string
          p_amount: number
          p_bank_code: string
          p_content: string
          p_direction: string
          p_expected_account_number: string
          p_expected_bank_code: string
          p_payload: Json
          p_payload_sha256: string
          p_payment_code: string
          p_provider: string
          p_provider_event_id: string
          p_provider_reference: string
          p_transaction_at: string
        }
        Returns: Json
      }
      reconcile_purchase_order: { Args: { p_order_id: string }; Returns: Json }
      record_session_event: {
        Args: { p_session_id: string; p_type?: string }
        Returns: number
      }
      retract_inferred_answer_key: {
        Args: { p_audit?: Json; p_question_id: string; p_reason: string }
        Returns: Json
      }
      revoke_purchase_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      run_ocr_import_staging: {
        Args: never
        Returns: {
          result: Json
          staging_id: number
        }[]
      }
      save_session_answers: {
        Args: { p_answers: Json; p_session_id: string }
        Returns: undefined
      }
      score_exam_session: { Args: { p_session_id: string }; Returns: undefined }
      score_pending_exam_sessions: {
        Args: { p_limit?: number }
        Returns: number
      }
      search_questions: {
        Args: {
          p_difficulty?: number
          p_limit?: number
          p_offset?: number
          p_query: string
          p_status?: Database["public"]["Enums"]["question_status"]
          p_subject_code?: string
          p_type?: Database["public"]["Enums"]["question_type"]
        }
        Returns: {
          code: string
          content: string
          created_at: string
          difficulty: number
          id: string
          rank: number
          source_label: string
          status: Database["public"]["Enums"]["question_status"]
          subject_code: string
          type: Database["public"]["Enums"]["question_type"]
        }[]
      }
      start_exam_session: { Args: { p_exam_id: string }; Returns: Json }
      start_free_exam_session: {
        Args: { p_exam_room_id?: string; p_subject_code?: string }
        Returns: string
      }
      start_practice_session: {
        Args: {
          p_difficulties?: number[]
          p_knowledge_field_ids?: number[]
          p_question_count?: number
          p_subject_code: string
        }
        Returns: string
      }
      submit_exam_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      blueprint_status: "draft" | "published" | "archived"
      exam_grading_status:
        | "pending_auto"
        | "pending_manual"
        | "scored"
        | "failed"
      exam_key_status: "unused" | "active" | "exhausted" | "expired" | "revoked"
      exam_room_mode: "exam" | "practice"
      exam_room_status: "draft" | "published" | "archived"
      exam_session_status: "in_progress" | "submitted" | "abandoned" | "expired"
      import_job_status:
        | "pending"
        | "processing"
        | "done"
        | "partial"
        | "failed"
      question_status: "draft" | "reviewing" | "approved" | "archived"
      question_type: "multiple_choice" | "true_false" | "short_answer" | "essay"
      user_role: "student" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      blueprint_status: ["draft", "published", "archived"],
      exam_grading_status: [
        "pending_auto",
        "pending_manual",
        "scored",
        "failed",
      ],
      exam_key_status: ["unused", "active", "exhausted", "expired", "revoked"],
      exam_room_mode: ["exam", "practice"],
      exam_room_status: ["draft", "published", "archived"],
      exam_session_status: ["in_progress", "submitted", "abandoned", "expired"],
      import_job_status: ["pending", "processing", "done", "partial", "failed"],
      question_status: ["draft", "reviewing", "approved", "archived"],
      question_type: ["multiple_choice", "true_false", "short_answer", "essay"],
      user_role: ["student", "admin"],
    },
  },
} as const

export type AppSupabaseClient = SupabaseClient<Database>
