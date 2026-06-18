import { NextRequest, NextResponse } from "next/server";
import { gemini, geminiEnabled } from "@/lib/vertex";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/analyze  (R3: live contextual completions)
 * Body: { text, note_type, gaps?: string[] }
 * Returns { inline, chips } — a short continuation + insertable phrases, gap-aware.
 *
 * Grounding: completions may add structure / standard phrasing / prompts for missing
 * items, but NEVER invent specific patient values — unknown specifics become "___".
 */
const SYSTEM = `You are a writing assistant helping a doctor compose a clinical note. You suggest how to CONTINUE or COMPLETE the note, and propose faithful wording REWRITES.
HARD RULES:
1. Build only on what the doctor has written. NEVER invent a specific clinical value, finding, name, dose, count, time or number. For any specific the doctor must supply, write a blank "___".
2. Keep suggestions short and in standard clinical phrasing.
3. Prioritise the still-missing items provided.
4. REWRITES: faithfully expand medical shorthand/abbreviations (e.g. "NAD" -> "no abnormality detected", "EBL" -> "estimated blood loss", "pt" -> "patient") or tidy obviously rough wording — WITHOUT changing clinical meaning and WITHOUT inventing detail. Each rewrite "from" must be copied VERBATIM from the note.
Return STRICT JSON only.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const noteType = String(body.note_type ?? "ot_note");
  const gaps = Array.isArray(body.gaps) ? body.gaps.slice(0, 6).map(String) : [];

  if (!geminiEnabled() || text.length < 8) {
    return NextResponse.json({ inline: "", chips: [] });
  }

  const prompt = `NOTE TYPE: ${noteType}
STILL-MISSING items (prioritise these): ${gaps.join(", ") || "none"}

CURRENT NOTE:
"""${text.slice(-1500)}"""

Return JSON:
{
  "inline": "ONLY the NEW words to append at the very end — do NOT repeat any words already written. <=14 words. Use ___ for unknown specifics. Empty string if nothing sensible to add.",
  "chips": ["up to 3 short phrases (<=10 words each) the doctor could insert to cover the missing items, each using ___ for unknown values"],
  "rewrites": [{ "from": "<exact substring copied verbatim from the note>", "to": "<faithful expansion or tidy>" }]
}`;

  try {
    const raw = await gemini(prompt, { tier: "utility", system: SYSTEM, json: true });
    const parsed = JSON.parse(stripFences(raw));
    const inline = typeof parsed.inline === "string" ? parsed.inline.slice(0, 160) : "";
    const chips = Array.isArray(parsed.chips)
      ? parsed.chips.filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, 3).map((c: string) => c.trim().slice(0, 90))
      : [];
    // Only keep rewrites whose `from` is actually present in the note (so the client can locate the span).
    const rewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites
          .filter((r: any) => r && typeof r.from === "string" && typeof r.to === "string" && r.from.trim() && r.from !== r.to && text.includes(r.from))
          .slice(0, 4)
          .map((r: any) => ({ from: r.from, to: r.to.slice(0, 120) }))
      : [];
    return NextResponse.json({ inline, chips, rewrites });
  } catch {
    return NextResponse.json({ inline: "", chips: [], rewrites: [] });
  }
}

function stripFences(s: string): string {
  const t = (s || "").trim();
  if (t.startsWith("```")) return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return t;
}
