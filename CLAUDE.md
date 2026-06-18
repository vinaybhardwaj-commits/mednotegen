# CLAUDE.md — orientation for an agent working in this repo

You are reading **MedNoteGen**, a working prototype intended to be folded into **EvenScribe**. If you are the
EvenScribe development thread, **start with [`docs/EVENSCRIBE-INTEGRATION.md`](./docs/EVENSCRIBE-INTEGRATION.md)** —
it is the playbook written specifically for you.

## What this is, in one line
A mobile-first, single-editor clinical note-writing assistant ("Grammarly/Copilot for clinical notes"): the doctor
writes free text; a live assistant nudges it toward NABH completeness; then compose → sign → export. The AI never
authors clinical fact.

## Read these, in order
1. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — current system. **§5 Live-vs-Dormant is essential**, **§7 Gotchas saves you hours.**
2. [`docs/BUILD-HISTORY.md`](./docs/BUILD-HISTORY.md) — how it got here (the v1→v2.1 pivot, every commit, every bug).
3. [`docs/EVENSCRIBE-INTEGRATION.md`](./docs/EVENSCRIBE-INTEGRATION.md) — how to port it into EvenScribe + the R8 eval plan.

## The five things to know before you touch the code
1. **Half the repo is dormant.** A retired v1 "Q&A" flow still lives here. The shipped product is the **live editor**
   (the R-series). `docs/ARCHITECTURE.md §5` lists exactly which files are LIVE vs DORMANT — check it before assuming
   a file is in use.
2. **Grounding is the whole point.** Every LLM surface may only use facts the doctor wrote; unknown specifics become
   a literal `___`. The doctor authors and signs; the AI structures + faithfully expands; every change is shown
   before it lands. Do not loosen this.
3. **Neon HTTP driver has no `.query()`** — tagged-template only. **Gemini 2.5 thinking eats output tokens** — keep
   `thinkingBudget:0` on the utility call. (More in `ARCHITECTURE.md §7`.)
4. **Deploy = push to `main`** (Vercel auto-deploys, ~44s). **Run git from a `/tmp` clone**, not the iCloud working
   copy (the synced folder throws a git lock). Build locally first with a placeholder `DATABASE_URL`.
5. **Secrets are never in git** — Vercel env + an out-of-repo `vercel-env.txt`. The repo should be **private**
   (clinical app).

## Stack
Next.js 14.2 (App Router) · Neon Postgres (HTTP driver) · Vertex AI Gemini (2.5-pro reasoning / 2.5-flash utility,
`clinical-infra` / `asia-northeast1`, `GEMINI_ALL=1`) · TipTap editor · token-gated (`?t=`) · export-only.

## Run it
`cp .env.example .env` (fill values) → `npm install` → `npm run dev` → `POST /api/migrate` with
`x-migration-secret: $MIGRATION_SECRET` to create tables + seed the NABH floor.
