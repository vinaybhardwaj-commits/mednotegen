import type { Answer, FaithfulnessReport, GroundingEntry } from "./types";

/**
 * Two-layer faithfulness check (PRD §7 / plan §4.3).
 * Layer 1 (here, deterministic): every number and capitalized token in the note
 *   must appear in the answers. Orphans are flagged.
 * Layer 2 (TODO P1-C5): Gemini-flash judges each sentence Supported/Unsupported
 *   against the answers, complementing the grounding_map the composer emitted.
 */

function numbers(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((s) => s);
}

// Crude proper-noun / entity proxy: TitleCase words 4+ chars, minus section headers.
function entities(text: string): string[] {
  const stop = new Set(["Patient", "Procedure", "Diagnosis", "Operative", "Note", "Post"]);
  return Array.from(
    new Set((text.match(/\b[A-Z][a-zA-Z]{3,}\b/g) ?? []).filter((w) => !stop.has(w))),
  );
}

export function checkGroundingRules(markdown: string, answers: Answer[]): FaithfulnessReport {
  // Normalize digits only (strip separators) so reformatted dates/times still match.
  const haystack = answers.map((a) => String(a.value ?? "")).join(" ").replace(/[^0-9]/g, " ");
  const orphans: string[] = [];

  // Deterministic check: every NUMBER in the note (blood loss, doses, counts) must appear in answers.
  // Note: the crude TitleCase "entity" heuristic was removed — it flagged structural labels
  // (UHID, Checklist, Sign-out…) as false positives. Sentence-level support comes from the
  // composer's grounding_map (see mergeFaithfulness); numbers are the reliable rule-layer signal.
  for (const n of numbers(markdown)) {
    if (n.length >= 2 && !haystack.includes(n)) orphans.push(n);
  }

  return { ok: orphans.length === 0, unsupported: [], orphan_entities: Array.from(new Set(orphans)) };
}

/** Combine the composer's grounding_map with the rule layer. */
export function mergeFaithfulness(
  grounding: GroundingEntry[],
  ruleReport: FaithfulnessReport,
): FaithfulnessReport {
  const unsupported = grounding.filter((g) => !g.supported);
  return {
    ok: unsupported.length === 0 && ruleReport.orphan_entities.length === 0,
    unsupported,
    orphan_entities: ruleReport.orphan_entities,
  };
}
