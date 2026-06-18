import { sql, genId } from "@/lib/db";
import { gemini, geminiEnabled } from "@/lib/vertex";
import { loadFloor } from "./nabh-gate";
import type { NoteType, QuestionField, QuestionSchema } from "./types";

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Generate (or fetch) a question schema for a procedure.
 * The NABH floor is ALWAYS applied (immutable); the model may only ADD
 * procedure-specific clinical fields. Result cached by (note_type, procedure_key).
 */
export async function generateSchema(
  noteType: NoteType,
  procedure: string,
): Promise<QuestionSchema> {
  const floor = await loadFloor(noteType);
  const procedureKey = normalize(procedure || "generic");

  // Cache lookup — but re-apply the CURRENT floor so seed changes propagate.
  const cached = (await sql`
    SELECT schema_json FROM template_cache
    WHERE note_type = ${noteType} AND procedure_key = ${procedureKey}
    LIMIT 1
  `) as any[];

  let aiFields: QuestionField[] = [];
  if (cached.length) {
    aiFields = (cached[0].schema_json?.ai_fields ?? []) as QuestionField[];
  } else {
    aiFields = await proposeAiFields(noteType, procedure, floor);
    await sql`
      INSERT INTO template_cache (id, note_type, procedure_key, schema_json)
      VALUES (${genId("tpl")}, ${noteType}, ${procedureKey},
              ${JSON.stringify({ ai_fields: aiFields })}::jsonb)
      ON CONFLICT (note_type, procedure_key) DO NOTHING
    `;
  }

  return { note_type: noteType, procedure, fields: mergeFields(floor, aiFields) };
}

/** Floor wins on key collision; AI fields appended after their section's floor fields. */
function mergeFields(floor: QuestionField[], ai: QuestionField[]): QuestionField[] {
  const floorKeys = new Set(floor.map((f) => f.field_key));
  const extras = ai
    .filter((f) => !floorKeys.has(f.field_key))
    .map((f, i) => ({ ...f, nabh: false, sort_order: 1000 + i }));
  return [...floor, ...extras].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Ask Gemini for ADDITIONAL procedure-specific fields only.
 * TODO(P1-C2): harden prompt + zod-validate the returned schema; few-shot from golden note.
 */
async function proposeAiFields(
  noteType: NoteType,
  procedure: string,
  floor: QuestionField[],
): Promise<QuestionField[]> {
  if (!geminiEnabled()) return []; // floor-only until Vertex is wired

  const floorKeys = floor.map((f) => f.field_key).join(", ");
  const prompt = `Procedure: "${procedure}" (note type: ${noteType}).
The following mandatory fields are ALREADY captured and must not be repeated or relaxed:
${floorKeys}

Propose ONLY additional procedure-specific clinical fields a surgeon must record for THIS procedure
(e.g. approach, laterality, graft/mesh specifics, named operative steps). Return a JSON array of:
{ field_key, label, input_type, section, options?, unit?, mandatory, allow_na, default_value?, conditional_on? }.
input_type ∈ text|textarea|number|select|multiselect|toggle|date|time. Keep it tight (max ~10).`;

  try {
    const raw = await gemini(prompt, { tier: "reasoning", json: true });
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.fields ?? [];
    return arr.map((f: any) => ({
      field_key: normalize(f.field_key ?? f.label ?? "field"),
      label: f.label ?? f.field_key,
      input_type: f.input_type ?? "text",
      section: f.section ?? "procedure",
      sort_order: 1000,
      options: f.options,
      unit: f.unit,
      mandatory: !!f.mandatory,
      allow_na: f.allow_na ?? true,
      default_value: f.default_value ?? null,
      conditional_on: f.conditional_on ?? null,
      standard_ref: null,
      help_text: f.help_text ?? null,
      nabh: false,
    })) as QuestionField[];
  } catch (e) {
    console.error("[question-engine] AI field proposal failed; floor-only.", e);
    return [];
  }
}
