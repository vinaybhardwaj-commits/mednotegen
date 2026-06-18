import { loadFloor } from "./nabh-gate";
import type { NoteType } from "./types";

export interface Nudge {
  field_key: string;
  label: string;
  why: string;
  standard_ref?: string | null;
}

/**
 * The gap engine (Mode B). Gap-fill ONLY — it flags which mandatory NABH fields the
 * doctor's free text did NOT cover, surfaced as nudges. It never rewrites clinical wording.
 * Same `nabh_requirements` floor + completeness logic as the Q&A gate, different skin.
 */
export async function computeNudges(noteType: NoteType, mapped: Record<string, string>): Promise<Nudge[]> {
  const floor = await loadFloor(noteType);
  const isActive = (cond: string | null | undefined) => {
    if (!cond || typeof cond !== "string" || !cond.includes("=")) return true;
    const [k, v] = cond.split("=");
    return (mapped[k] ?? "") === v;
  };
  const nudges: Nudge[] = [];
  for (const f of floor) {
    if (!f.mandatory) continue;
    if (!isActive(f.conditional_on)) continue;
    const v = mapped[f.field_key];
    if (v == null || String(v).trim() === "") {
      nudges.push({
        field_key: f.field_key,
        label: f.label,
        why: f.help_text || (f.standard_ref ? `Required for NABH ${f.standard_ref}` : "Required field"),
        standard_ref: f.standard_ref,
      });
    }
  }
  return nudges;
}
