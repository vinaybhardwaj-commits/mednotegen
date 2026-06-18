# MedNoteGen

A **mobile-first, single-editor clinical note-writing assistant** — "Grammarly/Copilot for clinical notes." The
doctor writes (or, after the EvenScribe port, dictates) free text in one always-editable document; a live assistant
nudges the note toward **NABH** completeness as they type; then **compose → sign → export**.

The AI is a scribe and compliance guard — **never an author of clinical fact**. Because the doctor authors and signs
the note and every AI change is shown before it lands, there's no insurer "AI-detection" risk; the defense against
clinical-validation NLP is **completeness + grounding**.

Standalone prototype; **candidate to merge into [EvenScribe](./docs/EVENSCRIBE-INTEGRATION.md).**

## Documentation map
- **[`CLAUDE.md`](./CLAUDE.md)** — orientation for an agent/dev opening this repo (start here).
- **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — current system: stack, data model, **live-vs-dormant code map**, the 3-stream design, grounding contract, gotchas.
- **[`docs/BUILD-HISTORY.md`](./docs/BUILD-HISTORY.md)** — the full build narrative + commit chronology (the v1 Q&A → v2.1 live-editor pivot) and every bug fixed.
- **[`docs/EVENSCRIBE-INTEGRATION.md`](./docs/EVENSCRIBE-INTEGRATION.md)** — how best to fold this into EvenScribe, plus the R8 eval plan.

## Status
**R0–R7 complete and live** (the single-editor product). The live assistant runs three streams on one TipTap
document: deterministic **NABH coverage**, grounded **completions**, and faithful **rewrites** — then compose-in-place
with a before/after diff, a soft-gated **sign & lock** (uncovered NABH items appended as a footer), and **export**
(Word / PDF / clipboard). **R8 (eval) and dictation + email are deferred to the EvenScribe port.**

> ⚠️ The repo also contains a **dormant v1 "Q&A" flow** kept for reference. See `docs/ARCHITECTURE.md §5` for exactly
> what is live vs dormant before changing code.

## Stack
Next.js 14.2 (App Router) · Neon Postgres (HTTP driver) · Vertex AI Gemini (2.5-pro reasoning / 2.5-flash utility,
`clinical-infra` / `asia-northeast1`) · TipTap (ProseMirror) editor · token-gated (`?t=`) · export-only (docx/PDF/clipboard).

## Setup
1. `cp .env.example .env` and fill values (Neon `DATABASE_URL`, Vertex SA `GCP_SA_KEY_BASE64`, `APP_ACCESS_TOKEN`, `MIGRATION_SECRET`).
2. `npm install`
3. `npm run dev`
4. Migrate + seed: `POST /api/migrate` with header `x-migration-secret: $MIGRATION_SECRET` (creates 6 app tables + the NABH floor).

## Repo layout
```
CLAUDE.md               agent/dev orientation
docs/                   ARCHITECTURE.md, BUILD-HISTORY.md, EVENSCRIBE-INTEGRATION.md
db/                     schema.sql + seed/nabh_requirements_seed.sql (NABH 6th-ed floor)
src/app/                page.tsx (the live editor UI), layout.tsx, globals.css (--mng-* theme tokens), middleware.ts
src/app/api/            analyze, sessions/*, nabh-requirements, migrate   (+ dormant v1 routes)
src/components/         NoteEditor.tsx, ghost-suggestion.ts (TipTap)
src/lib/                db.ts, vertex.ts, token-gate.ts, coverage.ts, md.ts
src/lib/notes/          composer.ts, export-docx.ts  (+ dormant v1: question-engine, nabh-gate, faithfulness, humanize, freetext-parse, nudge)
```

## Safety
PHI is sent only to Vertex (EHRC's existing clinical processor) — no third-party AI. Notes are doctor-signed; full
audit trail in `note_audit`. Deploy = push to `main` (Vercel). Secrets live in Vercel only, never in git; this repo
should be **private**.
