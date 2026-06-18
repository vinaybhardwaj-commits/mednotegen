import { gemini } from "@/lib/vertex";
import { loadFloor } from "./nabh-gate";
import type { NoteType } from "./types";

export interface ParseResult {
  fields: Record<string, string>;       // mapped field_key -> value
  expansions: { from: string; to: string }[];
  cleaned: string;                       // the expanded free text
}

/**
 * Mode B: turn a doctor's free-text / shorthand into structured field values.
 * Gemini 2.5-pro (reasoning tier) under the grounding contract:
 *  - expand shorthand/abbreviations using ONLY the doctor's text (never invent findings)
 *  - map content onto the note type's NABH field_keys (only fields the text addresses)
 *  - report the expansions made (logged to expansion_log for a future lexicon)
 */
export async function parseFreeText(noteType: NoteType, rawText: string): Promise<ParseResult> {
  const floor = await loadFloor(noteType);
  const fieldList = floor.map((f) => `${f.field_key} (${f.label})`).join("\n");

  const system = `You convert a doctor's free-text or shorthand into structured fields for a clinical note.
HARD RULES:
1. Use ONLY information present in the doctor's text. NEVER introduce a clinical fact, finding, value, name, count or time that is not in the text.
2. Expand medical shorthand/abbreviations faithfully (e.g. "NAD" -> "no abnormality detected", "PA soft" -> "per abdomen: soft"). Expansion must not add new findings.
3. Map only the fields the text actually addresses; leave the rest out. Do not guess.
Return STRICT JSON only.`;

  const prompt = `NOTE TYPE: ${noteType}

FIELDS you may map to (use these exact field_key values):
${fieldList}

DOCTOR'S FREE TEXT:
"""${rawText}"""

Return strict JSON:
{
  "fields": { "<field_key>": "<value>", ... },
  "expansions": [ { "from": "<shorthand>", "to": "<expansion>" }, ... ],
  "cleaned": "<the doctor's text with shorthand expanded, otherwise unchanged>"
}`;

  let parsed: any = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const raw = await gemini(prompt, { tier: "reasoning", system, json: true });
    try { parsed = JSON.parse(stripFences(raw)); }
    catch { if (attempt === 1) throw new Error("freetext parser returned non-JSON twice"); }
  }

  // Keep only fields that exist in the floor; coerce values to strings.
  const valid = new Set(floor.map((f) => f.field_key));
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.fields ?? {})) {
    if (valid.has(k) && v != null && String(v).trim() !== "") fields[k] = String(v);
  }
  const expansions = Array.isArray(parsed.expansions)
    ? parsed.expansions
        .filter((e: any) => e && e.from && e.to)
        .map((e: any) => ({ from: String(e.from), to: String(e.to) }))
    : [];

  return { fields, expansions, cleaned: String(parsed.cleaned ?? rawText) };
}

function stripFences(s: string): string {
  const t = (s || "").trim();
  if (t.startsWith("```")) return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return t;
}
