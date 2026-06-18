import { gemini } from "@/lib/vertex";
import type { Answer, GroundingEntry, NoteType, QuestionField } from "./types";

/**
 * The grounding contract. The composer may use ONLY facts present in the answers.
 * It returns markdown only — the grounding map is computed deterministically (see
 * computeGrounding), which is faster (half the output tokens) and more trustworthy
 * than asking the model to grade its own work.
 */
const GROUNDING_CONTRACT = `You are a medical scribe composing a clinical note from a surgeon's structured answers.
RULES (priority order):
1. Use ONLY facts present in ANSWERS. Never introduce any clinical fact, value, name, time, count or finding not in ANSWERS.
2. Insert numbers, drug names, implant/lot details and proper nouns EXACTLY as given — never paraphrase, round or normalize.
3. If a required item is absent, write "Not documented" — never guess.
4. Write the note as flowing PROSE under markdown "### Heading" sections (a short header block with patient identifiers and team; diagnosis; procedure & anaesthesia; operative findings and salient steps; implant / specimen / blood loss / counts; complications; post-operative plan & advice; sign-off). Do NOT output a flat "label: value" list — write the sentences a surgeon would actually write, weaving the answer values into prose.
Output ONLY the note in markdown — no preamble, no commentary, no JSON.`;

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

Compose the note now as flowing clinical prose with markdown "### " headings per the rules.`;

  const raw = await gemini(prompt, { tier: "utility", system: GROUNDING_CONTRACT });
  const markdown = stripFences(raw).trim();
  return { markdown, grounding: computeGrounding(markdown, answers, skeleton) };
}

const TEXT_CONTRACT = `You reformat a doctor's rough clinical note into a clean, well-structured note.
RULES (priority order):
1. Use ONLY facts present in the doctor's text. NEVER add, invent or infer any clinical fact, value, name, time, count or finding. Keep "___" placeholders exactly as written.
2. Insert numbers, drug names, implant/lot details and proper nouns EXACTLY as given.
3. Organise into clinical sections with markdown "### " headings, in flowing prose — do NOT output a "label: value" list.
Output ONLY the note markdown — no preamble, no commentary, no JSON.`;

/** v2 (R5): reformat the doctor's free-text editor content into a clean NABH-organised note. */
export async function composeFromText(noteType: NoteType, text: string): Promise<string> {
  const prompt = `NOTE TYPE: ${noteType}

DOCTOR'S NOTE (the only source of fact):
"""${text}"""

Reformat it now into a clean, NABH-organised clinical note in flowing prose under markdown "### " headings, per the rules.`;
  const raw = await gemini(prompt, { tier: "utility", system: TEXT_CONTRACT });
  return stripFences(raw).trim();
}

/** Strip ```markdown … ``` fences a model may wrap output in. */
function stripFences(s: string): string {
  const t = (s || "").trim();
  if (t.startsWith("```")) return t.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  return t;
}

const STOP = new Set([
  "with", "done", "this", "that", "from", "were", "have", "been", "the", "and", "for", "not",
  "note", "number", "date", "time", "name", "type", "patient", "value", "field", "details",
  "performed", "obtained", "documented", "reference", "completed", "given",
]);

function sigTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((t) => !STOP.has(t));
}

/**
 * Deterministic grounding: for each substantive sentence, find which answers support it by
 * matching the answer's value, its numbers, or its label's significant tokens into the sentence.
 * Structural lines (headings, table rows, bullets) carry no clinical claim → supported.
 */
function computeGrounding(markdown: string, answers: Answer[], skeleton: QuestionField[]): GroundingEntry[] {
  const labelByKey = new Map(skeleton.map((f) => [f.field_key, f.label]));
  const out: GroundingEntry[] = [];
  let id = 0;
  for (const line of markdown.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    id++;
    const structural = /^(#{1,6}\s|\||[-*]\s|-{3,})/.test(text) || text.length < 4;
    const keys: string[] = [];
    if (!structural) {
      const lower = text.toLowerCase();
      for (const a of answers) {
        const v = String(a.value ?? "").trim();
        if (!v) continue;
        const generic = v.startsWith("Documented:");
        const isBool = v === "true" || v === "false";
        let hit = false;
        if (!generic && !isBool && v.length >= 4 && lower.includes(v.toLowerCase())) hit = true;
        if (!hit) {
          const vn = v.match(/\d{2,}/g) ?? [];
          if (vn.some((n) => text.includes(n))) hit = true;
        }
        if (!hit) {
          const lt = sigTokens(labelByKey.get(a.field_key) ?? "");
          if (lt.length && lt.some((t) => lower.includes(t))) hit = true;
        }
        if (hit) keys.push(a.field_key);
      }
    }
    out.push({
      sentence_id: id,
      sentence_text: text,
      source_field_keys: Array.from(new Set(keys)),
      supported: structural || keys.length > 0,
    });
  }
  return out;
}
