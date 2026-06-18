import { gemini } from "@/lib/vertex";
import type { Answer } from "./types";
import { checkGroundingRules } from "./faithfulness";

/**
 * Style-only humanization pass (PRD §6.3, §6.5). Varies structure / applies house
 * phrasing / removes LLM tells. MUST NOT change facts — re-checked, reverted on drift.
 * TODO(P1-C6): house-style profile per surgeon; configurable tone.
 */
const STYLE_SYSTEM = `Rewrite the clinical note for natural, concise, doctor-authored prose.
Do NOT add, remove, or alter any clinical fact, number, name or finding. Style only.
Return only the rewritten markdown.`;

export async function humanize(markdown: string, answers: Answer[]): Promise<string> {
  const out = await gemini(markdown, { tier: "utility", system: STYLE_SYSTEM, temperature: 0.5 });

  // Fact-drift guard: if humanized text introduces an orphan number/entity, revert.
  const before = checkGroundingRules(markdown, answers).orphan_entities.length;
  const after = checkGroundingRules(out, answers).orphan_entities.length;
  if (after > before) {
    console.warn("[humanize] fact drift detected; reverting to pre-humanized note");
    return markdown;
  }
  return out;
}
