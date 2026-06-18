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
const SYSTEM = `You are a writing assistant helping a doctor compose a clinical note. You suggest how to CONTINUE or COMPLETE the note.
HARD RULES:
1. Build only on what the doctor has written. NEVER invent a specific clinical value, finding, name, dose, count, time or number. For any specific the doctor must supply, write a blank "___".
2. Keep suggestions short and in standard clinical phrasing.
3. Prioritise the still-missing items provided.
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
  "chips": ["up to 3 short phrases (<=10 words each) the doctor could insert to cover the missing items, each using ___ for unknown values"]
}`;

  try {
    const raw = await gemini(prompt, { tier: "utility", system: SYSTEM, json: true });
    const parsed = JSON.parse(stripFences(raw));
    const inline = typeof parsed.inline === "string" ? parsed.inline.slice(0, 160) : "";
    const chips = Array.isArray(parsed.chips)
      ? parsed.chips.filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, 3).map((c: string) => c.trim().slice(0, 90))
      : [];
    return NextResponse.json({ inline, chips });
  } catch {
    return NextResponse.json({ inline: "", chips: [] });
  }
}

function stripFences(s: string): string {
  const t = (s || "").trim();
  if (t.startsWith("```")) return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return t;
}
