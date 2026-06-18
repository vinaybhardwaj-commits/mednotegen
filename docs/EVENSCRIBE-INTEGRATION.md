# Porting MedNoteGen into EvenScribe — the playbook

> Audience: the EvenScribe development thread. This is the "how best to approach it" note the prototype was built
> to feed. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first (esp. §5 *Live vs Dormant* and §7 *Gotchas*), then this.

## TL;DR

MedNoteGen is **the "compose & comply" half of EvenScribe**. EvenScribe captures what was said; MedNoteGen turns
free text into a **NABH-complete, doctor-signed, exportable note**. They share a stack (Next.js 14.2 + Neon +
Vertex Gemini, `clinical-infra` / `asia-northeast1`, `GEMINI_ALL`), so this is a **reskin + rewire**, not a rebuild.

The unifying insight: **EvenScribe's transcript *is* MedNoteGen's editor text.** Dictation (the deferred "mode C")
isn't a new feature to build — it's EvenScribe's live transcript flowing into the one editor, after which the same
three streams (coverage / completions / rewrites) + compose + sign + export run unchanged. Plan the port around that
convergence, not around bolting on a separate tool.

## What reuses as-is vs what EvenScribe replaces

| Prototype piece | At the port |
|---|---|
| TipTap editor + `GhostSuggestion` extension (`NoteEditor.tsx`, `ghost-suggestion.ts`) | **Port verbatim.** The trickiest code; don't reimplement. |
| Deterministic coverage (`lib/coverage.ts`) | **Reuse.** Stop excluding identifier fields once UHID/name come from the encounter (see *Patient context*). |
| Throttled analyze loop + `/api/analyze` (3 streams) | **Reuse.** Keep R7 cost posture (`thinkingBudget:0`, tail context, LRU, throttle). |
| Compose / sign / export routes + `composer.ts`, `md.ts`, `export-docx.ts` | **Reuse.** |
| `lib/vertex.ts` | **Replace with EvenScribe's existing Vertex/`routedChat` wrapper** if it has one — they're equivalent. Keep the `thinkingBudget:0` trick on the utility call. |
| `lib/db.ts` (neon client) | **Reuse**, pointed at EvenScribe's Neon DB. |
| Token gate (`middleware.ts`, `token-gate.ts`, `?t=`) | **Drop.** Use EvenScribe's session/auth; the signer = the logged-in clinician. |
| `--mng-*` CSS tokens (`globals.css`) | **Reskin** — override the tokens with EvenScribe's design system. No component changes needed. |
| Tabler icons webfont | Swap for EvenScribe's icon set if it has one (or keep). |
| Export-only (docx/PDF/clipboard) | **Add a "Send" action** beside Export using EvenScribe's built-in email. |
| Dictation (placeholder mic, disabled) | **Wire EvenScribe STT** → transcript text into the editor (mode C). |
| Dormant v1 Q&A modules (`question-engine`, `nabh-gate`, `faithfulness`, `freetext-parse`, `nudge`, the v1 routes) | **Don't port by default.** Treat as a menu — `freetext-parse` (shorthand→NABH mapping) is the most likely future revival. |

## The seams (where prototype meets EvenScribe)

1. **Auth / actor.** Remove the token gate. Every route currently trusts `?t=`/`x-app-token`; replace with
   EvenScribe's session check. `signed_by` becomes the authenticated clinician, not a typed name.
2. **Encounter context.** `note_sessions` is currently standalone. Link it to an EvenScribe **encounter** (add
   `encounter_id` / `clinician_id`). The note type can default from the encounter (OPD vs OT vs discharge).
3. **Patient context.** UHID / patient name / age / sex should come from the encounter and **prefill** the note.
   Today `coverage.ts` *excludes* identifier fields precisely because the prototype has no patient context — once
   the encounter supplies them, count them as covered (or pre-fill the header block).
4. **STT → editor (mode C).** Pipe EvenScribe's live/final transcript into the editor as the doctor's text. Two
   sub-modes worth supporting: (a) *dictate then compose* (transcript becomes the draft, doctor edits, the 3 streams
   run), and (b) *ambient* (deprioritized). The grounding contract still holds — the AI structures the transcript,
   never invents.
5. **Delivery.** Add **Send via email** next to Export, reusing EvenScribe's email. Export-only stays as a fallback.
6. **Data model.** Reuse EvenScribe's Neon DB. Either keep MedNoteGen's tables (namespace if needed) or merge —
   `note_sessions`, `generated_notes`, `note_audit`, `expansion_log`, and the `nabh_requirements` seed are the
   minimum. `note_answers` / `template_cache` / `grounding_map` are only needed if you revive the v1 Q&A path.

## Recommended porting order

1. **Stand up the engine, headless.** Bring over `lib/{db,vertex,coverage,md}`, `lib/notes/{composer,export-docx}`,
   the `nabh_requirements` seed, and the API routes (`analyze`, `sessions/*`, `nabh-requirements`). Wire to
   EvenScribe's DB + Vertex + auth. Verify `/api/analyze` and compose/sign work behind EvenScribe auth.
2. **Mount the editor surface.** Port `NoteEditor.tsx`, `ghost-suggestion.ts`, and the editor portion of `page.tsx`
   as an EvenScribe route/tab (e.g. a "Note" tab inside an encounter). Reskin via `--mng-*` tokens. Confirm the 3
   live streams render inside EvenScribe's shell on mobile.
3. **Wire encounter + patient context.** `encounter_id`/`clinician_id` on the session; prefill identifiers; adjust
   coverage to count context-supplied identifiers.
4. **Dictation (mode C).** Feed EvenScribe's transcript into the editor; let the doctor dictate → edit → compose →
   sign. This is the headline integration — budget the most time here.
5. **Delivery.** Add email send; keep export.
6. **R8 eval** (below), then iterate.

## R8 — eval plan (run on the ported surface, not the prototype)

Eval was intentionally deferred to here so we measure the *real* EvenScribe surface. Suggested metrics:

- **Faithfulness / safety** — sample signed notes; confirm zero invented clinical facts vs the doctor's input
  (the core guarantee). Track any rewrite that changed meaning (should be ~0; the diff + `expansion_log` are the audit).
- **NABH coverage accuracy** — does the deterministic coverage correctly reflect what's documented? False
  positives/negatives per note type (tune `coverage.ts` keyword maps).
- **Acceptance rate** — % of completions/rewrites accepted (signal of usefulness); shorthand expansions logged.
- **Latency & cost** — `/api/analyze` p50/p95, LLM calls per finished note, cost per note (verify R7 posture holds
  at real volume; truth-up vs Vertex billing).
- **Time-to-signed-note** vs the doctor's baseline (dictation vs typing).
- **Compose quality** — does the reflowed note read like a real clinician's note and keep `___` for unknowns?

## Risks / watch-items

- **The GhostSuggestion extension + throttle loop are the highest-risk port** — copy them verbatim and re-test on
  mobile before refactoring. Keep `immediatelyRender:false` (SSR) and the R5 `lockRef`/frozen-pill behaviors.
- **Keep `thinkingBudget:0`** on the utility analyze call — a token cap with 2.5-flash thinking on returns empty.
- **Neon HTTP driver** — no `.query()`; tagged-template only (see `ARCHITECTURE.md §7`).
- **Soft NABH gate is a product stance** — sign is never blocked; uncovered items become a footer. Don't "harden"
  it into a blocker without a product decision.
- **Don't carry the `?t=` token gate into production** — it's prototype-grade.

## One-paragraph pitch for the EvenScribe PR description

> MedNoteGen is the note-composition half of EvenScribe: one always-editable, mobile-first clinical document with a
> live assistant that (1) tracks NABH coverage deterministically, (2) offers grounded completions, and (3) faithfully
> expands shorthand — then composes the draft into NABH sections, lets the doctor sign, and exports/sends it. The AI
> never authors clinical fact (doctor-authored + every change reviewed ⇒ no insurer AI-detection risk). It shares
> EvenScribe's stack (Next/Neon/Vertex); the port is a reskin + rewire, and dictation simply feeds EvenScribe's
> transcript into the same editor.
