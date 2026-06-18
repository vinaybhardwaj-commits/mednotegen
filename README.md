# MedNoteGen

Structured, NABH-aware clinical note generator. The **inverse of transcription**: it asks the doctor for exactly the facts a note needs, then composes the note from those answers. The AI is a scribe and compliance guard — never an author of clinical fact.

Standalone prototype; candidate to merge into EvenScribe later.

## Status
- **P0 done:** PRD, NABH-6th seed, golden OT note, this scaffold (C1).
- **P1 (in progress):** OT-note flow end-to-end. See `MEDNOTEGEN-P1-BUILD-PLAN.md`.

## Stack
Next.js 14.2 (App Router) · Neon Postgres (HTTP driver) · Vertex AI Gemini (2.5-pro reasoning / 2.5-flash utility, `clinical-infra` / `asia-northeast1`) · token-gated (`?t=`) · export-only (docx/PDF/clipboard).

## The three LLM roles
1. **Interviewer** — procedure → question schema, anchored by a deterministic NABH field floor.
2. **Composer** — answers → note, under a strict *grounding contract* (no invented facts).
3. **Stylist** — humanization pass (style only, re-checked for fact drift).

Guards between Composer and sign-off: **faithfulness check** + **NABH completeness gate**. A human signature is always mandatory.

## Setup
1. `cp .env.example .env` and fill values (Neon, Vertex SA, secrets).
2. `npm install`
3. `npm run dev`
4. Run migration + seed: `POST /api/migrate` with header `x-migration-secret: $MIGRATION_SECRET`.

## Repo layout
```
db/                     schema.sql + seed/nabh_requirements_seed.sql
src/lib/                db.ts, vertex.ts, token-gate.ts
src/lib/notes/          question-engine, composer, faithfulness, nabh-gate, humanize, export-docx, types
src/app/api/            sessions, questions, answers, generate, finalize, export, migrate, nabh-requirements
```

## Safety
PHI is sent only to Vertex (EHRC's existing clinical processor). No third-party AI. Notes are doctor-signed; full audit trail in `note_audit`.
