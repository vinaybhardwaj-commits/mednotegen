export type NoteType = "ot_note" | "discharge_summary" | "opd_rx";

export type InputType =
  | "text" | "textarea" | "number" | "select" | "multiselect"
  | "toggle" | "date" | "time" | "datetime" | "drug_list" | "signature";

export interface QuestionField {
  field_key: string;
  label: string;
  input_type: InputType;
  section: string;
  sort_order: number;
  options?: unknown;
  unit?: string | null;
  mandatory: boolean;
  allow_na: boolean;
  default_value?: string | null;
  conditional_on?: string | null;   // "field_key=value"
  standard_ref?: string | null;     // NABH clause (floor fields only)
  help_text?: string | null;
  nabh: boolean;                     // true = part of the deterministic floor
}

export interface QuestionSchema {
  note_type: NoteType;
  procedure: string;
  fields: QuestionField[];           // floor (immutable) ⊕ AI fields, ordered
}

export interface Answer {
  field_key: string;
  value: string | null;
  source: "typed" | "voice" | "default";
  na_reason?: string | null;
}

export interface NabhStatus {
  complete: boolean;
  missing: string[];                 // mandatory + unanswered field_keys
  na_without_reason: string[];
}

export interface GroundingEntry {
  sentence_id: number;
  sentence_text: string;
  source_field_keys: string[];
  supported: boolean;
}

export interface FaithfulnessReport {
  ok: boolean;
  unsupported: GroundingEntry[];     // any entry blocks sign-off
  orphan_entities: string[];         // numbers/names in note but not in answers
}
