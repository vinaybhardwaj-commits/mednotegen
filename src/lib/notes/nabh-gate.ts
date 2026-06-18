import { sql } from "@/lib/db";
import type { Answer, NabhStatus, NoteType, QuestionField } from "./types";

/** Load the deterministic NABH field floor for a note type. */
export async function loadFloor(noteType: NoteType): Promise<QuestionField[]> {
  const rows = (await sql`
    SELECT note_type, section, sort_order, field_key, label, input_type,
           options, unit, mandatory, allow_na, default_value, conditional_on,
           standard_ref, help_text
    FROM nabh_requirements
    WHERE note_type = ${noteType}
    ORDER BY sort_order ASC
  `) as any[];

  return rows.map((r) => ({
    field_key: r.field_key,
    label: r.label,
    input_type: r.input_type,
    section: r.section,
    sort_order: r.sort_order,
    options: r.options ?? undefined,
    unit: r.unit,
    mandatory: r.mandatory,
    allow_na: r.allow_na,
    default_value: r.default_value,
    conditional_on: r.conditional_on,
    standard_ref: r.standard_ref,
    help_text: r.help_text,
    nabh: true,
  }));
}

/** A conditional field is only required when its trigger condition is met. */
function isActive(field: QuestionField, byKey: Map<string, Answer>): boolean {
  if (!field.conditional_on) return true;
  const [k, v] = field.conditional_on.split("=");
  const a = byKey.get(k);
  return (a?.value ?? "") === v;
}

function answered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.na_reason && a.na_reason.trim()) return true; // N/A with reason counts
  return a.value !== null && String(a.value).trim() !== "";
}

/**
 * Completeness gate. Pure over the floor + answers.
 * Blocks finalize when any active mandatory field is unanswered,
 * or marked N/A without a reason on a field that allows N/A.
 */
export function validateCompleteness(floor: QuestionField[], answers: Answer[]): NabhStatus {
  const byKey = new Map(answers.map((a) => [a.field_key, a]));
  const missing: string[] = [];
  const naWithoutReason: string[] = [];

  for (const f of floor) {
    if (!f.mandatory) continue;
    if (!isActive(f, byKey)) continue;

    const a = byKey.get(f.field_key);
    if (!answered(a)) {
      missing.push(f.field_key);
      continue;
    }
    if (a?.na_reason !== undefined && a?.na_reason !== null) {
      if (!f.allow_na && (a.value === null || String(a.value).trim() === "")) {
        // Marked N/A on a field that does not permit it.
        naWithoutReason.push(f.field_key);
      }
    }
  }

  return { complete: missing.length === 0 && naWithoutReason.length === 0, missing, na_without_reason: naWithoutReason };
}
