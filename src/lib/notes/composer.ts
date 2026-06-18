import { gemini } from "@/lib/vertex";
import type { Answer, GroundingEntry, NoteType, QuestionField } from "./types";

/**
 * The grounding contract. The composer may use ONLY facts present in the answers.
 * It must emit a grounding_map alongside the prose. Any sentence it cannot map is a violation.
 */
const GROUNDING_CONTRACT = `You are a medical scribe composing a clinical note from a surgeon's structured answers.
RULES (priority order):
1. Use ONLY facts present in ANSWERS. Never introduce any clinical fact, value, name, time, count or finding not in ANSWERS.
2. Insert numbers, drug names, implant/lot details and proper nouns EXACTLY as given — never paraphrase, round or normalize.
3. If a required item is absent, write "Not documented" — never guess.
4. Follow the section order and house style of the SKELETON.
5. Output strict JSON: { "markdown": string, "grounding_map": [ { "sentence_id": number, "sentence_text": string, "source_field_keys": string[] } ] }.
A sentence you cannot map to an ANSWERS field_key is a rule violation.`;

export interface ComposeResult {
  markdown: string;
  grounding: GroundingEntry[];
}

export async function compose(
  noteType: NoteType,
  skeleton: QuestionField[],
  answers: Answer[],
  meta: Record<string, string>,
): Promise<ComposeResult> {
  const answersBlock = answers
    .filter((a) => a.value !== null && String(a.value).trim() !== "")
    .map((a) => `- ${a.field_key}: ${a.value}`)
    .join("\n");

  const skeletonBlock = skeleton
    .map((f) => `${f.section} :: ${f.field_key} (${f.label})`)
    .join("\n");

  const prompt = `NOTE TYPE: ${noteType}
META: ${JSON.stringify(meta)}

SKELETON (sections & fields, in order):
${skeletonBlock}

ANSWERS (the only permitted source of fact):
${answersBlock}

Compose the note now per the rules. Return ONLY the JSON object.`;

  // Robust parse: strip code fences; retry once on malformed JSON before giving up.
  let parsed: any = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const raw = await gemini(prompt, { tier: "reasoning", system: GROUNDING_CONTRACT, json: true });
    try { parsed = JSON.parse(stripFences(raw)); }
    catch { if (attempt === 1) throw new Error("composer returned non-JSON twice"); }
  }
  const grounding: GroundingEntry[] = (parsed.grounding_map ?? []).map((g: any) => ({
    sentence_id: g.sentence_id,
    sentence_text: g.sentence_text,
    source_field_keys: g.source_field_keys ?? [],
    supported: (g.source_field_keys ?? []).length > 0,
  }));

  return { markdown: parsed.markdown ?? "", grounding };
}

/** Strip ```json … ``` fences a model may wrap JSON in. */
function stripFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return t;
}
