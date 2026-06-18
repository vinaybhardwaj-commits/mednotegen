# MedNoteGen — Architecture

> Snapshot at `3ea8538` (R7 complete). Read [`BUILD-HISTORY.md`](./BUILD-HISTORY.md) for *how it got here* and
> [`EVENSCRIBE-INTEGRATION.md`](./EVENSCRIBE-INTEGRATION.md) for *how to fold it into EvenScribe*.

## 1. What it is

MedNoteGen is a **mobile-first, single-editor clinical note-writing assistant** — "Grammarly/Copilot for clinical
notes." The doctor writes (or dictates, later) free text in one always-editable document; a live assistant nudges
the note toward NABH completeness as they type. The strategic point: **the doctor authors the note**, so there is
no "AI wrote this" detectability problem — the AI only structures, completes, and expands what the doctor already said,
and it is forbidden from inventing clinical fact.

There are three live assistance streams, all running on the one editor:

1. **NABH coverage** — deterministic, client-side, instant. Which mandatory NABH items are/aren't yet present.
2. **Completions** — short, grounded ghost-text + insertable chips (LLM), gap-aware.
3. **Rewrites** — Grammarly-style faithful expansion/cleanup of shorthand (LLM), accept/dismiss.

Then: **Compose & format** (reflow the draft into NABH sections, with a before/after diff), **Sign & lock**
(append an "items not documented" footer, freeze the note), **Export** (Word / PDF / clipboard).

> ⚠️ The repo also still contains the **retired v1 "Q&A" flow** (structured question forms → generate). It is
> **dormant** — kept for reference and partial reuse, not wired into the live UI. See §5 for exactly what is live
> vs dormant. Do not assume a file is in use just because it exists.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14.2** (App Router) | `serverComponentsExternalPackages: ["@google-cloud/vertexai"]` keeps the SDK server-only |
| DB | **Neon Postgres**, HTTP driver `@neondatabase/serverless` | `neon()` — **NOT a pool**; no `.query()` (see §7) |
| LLM | **Vertex AI Gemini** via `@google-cloud/vertexai` | 2.5-**pro** reasoning / 2.5-**flash** utility; project `clinical-infra`, region `asia-northeast1` |
| Editor | **TipTap (ProseMirror)** | StarterKit + Placeholder + a custom `GhostSuggestion` extension |
| Auth | **token gate** (`?t=` or `x-app-token` header) | prototype-grade; replaced by EvenScribe auth at port |
| Exports | **docx** (`docx` lib), **PDF** (browser print), **clipboard** | export-only; no EMR write-back in this prototype |
| Icons / theme | Tabler icons webfont (CDN) + CSS custom properties | re-themeable `--mng-*` tokens, see §8 |

No state library, no UI kit — plain React + CSS tokens. Deployed on **Vercel** (project `mednotegen`,
team `vinaybhardwaj-commits-projects`), auto-deploy on push to `main`. Live at `mednotegen.vercel.app/?t=<token>`.

## 3. Request / data flow (live editor)

```
        ┌─────────────────────────── one TipTap document ───────────────────────────┐
type →  │  onEditorChange(text, html)                                                │
        │     ├─ autosave (debounced) ─────────────► PUT  /api/sessions/:id/editor   │  → note_sessions.editor_text
        │     ├─ coverage (deterministic, client) ── lib/coverage.ts                 │  (no network, instant)
        │     └─ scheduleAnalyze() ────────────────► POST /api/analyze               │  → {inline, chips, rewrites}
        │            (throttled: debounce + min-interval + delta-gate + visibility)  │
        └───────────────────────────────────────────────────────────────────────────┘
"Compose & format" ─► POST /api/sessions/:id/compose  → reflow markdown (grounded) → setContent + before/after diff
"Sign & lock"       ─► POST /api/sessions/:id/sign     → generated_notes(final_md) + audit; editor.setEditable(false)
"Export"            ─► GET  /api/sessions/:id/export?format=docx   (Word) | client print (PDF) | clipboard
```

`note_sessions` is created **lazily on first edit** (no orphan empty sessions). The session id lives only in client
state; the token authorizes every call.

## 4. Data model

Schema in [`db/schema.sql`](../db/schema.sql); NABH floor in [`db/seed/nabh_requirements_seed.sql`](../db/seed/nabh_requirements_seed.sql).
Migration + seed run via `POST /api/migrate` with `x-migration-secret`. The migrate route uses a **quote/comment-aware
SQL splitter** and idempotent statements (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT`), so
it is safe to re-run.

| Table | Role | Live editor? |
|---|---|---|
| `nabh_requirements` | The **deterministic NABH floor** — 70 mandatory fields (OT 35 / discharge 21 / Rx 14), 6th-ed clauses. Seeded. | ✅ source of coverage + sign footer |
| `note_sessions` | One note in progress. `editor_text` (R1) holds the live document; `note_type`, `status`, `mode`. | ✅ |
| `generated_notes` | The composed/signed note: `final_md`, `signed_by`, `signed_at`. | ✅ (written at sign; read at export) |
| `note_audit` | Medico-legal trail: `composed`, `note_signed`, … with actor + payload. | ✅ |
| `expansion_log` | Every accepted shorthand→expansion, to grow a curated lexicon later. | ✅ (rewrites) |
| `note_answers` | v1 structured answers (the "only source of fact" in Q&A mode). | ⚪ dormant (v1) |
| `template_cache` | v1 cached AI question schemas by (note_type, procedure). | ⚪ dormant (v1) |
| `grounding_map` | v1 per-sentence traceability table. | ⚪ dormant (the live composer computes grounding deterministically in-process) |

`nabh_requirements` columns of note: `field_key`, `label`, `note_type`, `section`, `mandatory`, `standard_ref`
(NABH clause), `conditional_on`. The coverage engine reads these per note type.

## 5. Code map — LIVE vs DORMANT

**This is the most important section for anyone porting the code.** The live editor uses a *subset* of the repo.

### Live (the v2.1 editor — port these)
```
src/app/page.tsx                       the whole mobile single-editor UI + the throttled analyze loop + compose/diff/sign/export
src/components/NoteEditor.tsx          TipTap wrapper (StarterKit+Placeholder+GhostSuggestion; immediatelyRender:false for SSR)
src/components/ghost-suggestion.ts     TipTap/ProseMirror extension: ghost-text widget decoration (Tab-accepts) + rewrite inline underlines
src/lib/coverage.ts                    DETERMINISTIC NABH coverage — keyword/abbrev matcher over editor text vs the floor (no LLM)
src/lib/md.ts                          mdToHtml (compose→editor), wordDiff (before/after), editorJsonToMarkdown (sign→clean markdown)
src/lib/notes/composer.ts              composeFromText(noteType,text) — reflow free text into grounded NABH-sectioned prose
src/lib/notes/export-docx.ts           markdown → .docx (headings, tables, bold)
src/lib/vertex.ts                      Gemini-on-Vertex wrapper (maxOutputTokens + thinkingBudget options)
src/lib/db.ts                          neon() client + genId()
src/lib/token-gate.ts / middleware.ts  ?t= / x-app-token gate (replace with EvenScribe auth at port)
src/app/api/analyze/route.ts           live coverage-aware completions + rewrites (flash, thinking off, tail-context, LRU cache)
src/app/api/sessions/route.ts          create session
src/app/api/sessions/[id]/editor/route.ts      autosave editor_text
src/app/api/sessions/[id]/compose/route.ts     compose-in-place
src/app/api/sessions/[id]/sign/route.ts        sign + lock
src/app/api/sessions/[id]/expansions/route.ts  log accepted rewrites
src/app/api/sessions/[id]/export/route.ts      docx/markdown export
src/app/api/nabh-requirements/route.ts         serve the floor for a note type
src/app/api/migrate/route.ts                   migrate + seed (secret-gated)
```

### Dormant (retired v1 Q&A flow — reference only, NOT wired to the live UI)
```
src/lib/notes/question-engine.ts       procedure → question schema (floor ⊕ AI fields), schema cache
src/lib/notes/nabh-gate.ts             hard completeness gate over structured answers (the live editor uses a SOFT gate instead)
src/lib/notes/faithfulness.ts          numbers/entity faithfulness check over a generated note
src/lib/notes/humanize.ts              style pass (flag-gated; latency)
src/lib/notes/freetext-parse.ts        Mode B: parse shorthand → map to NABH field_keys (pro)
src/lib/notes/nudge.ts                 Mode B: gap engine over mapped answers
src/app/api/sessions/[id]/questions|answers|generate|finalize|freetext/route.ts   v1/Mode-A/Mode-B endpoints
```
The dormant code is a useful **reference implementation** of the grounding/faithfulness ideas, and some of it (e.g.
`freetext-parse`, the question schema) may be revived as optional inputs inside EvenScribe. But the live product does
**not** depend on it. When porting, port the *Live* set first and treat the *Dormant* set as a menu.

## 6. The grounding contract (the safety core)

Every LLM surface operates under the same rule, stated in each prompt's system message:

> **Use ONLY facts present in the doctor's text. Never invent a clinical value, name, dose, count, time or finding.
> For any specific the doctor must supply, emit a literal `___` placeholder.**

- **Completions** (`/api/analyze`) add structure / standard phrasing / prompts for *missing* items, with `___` for
  any unknown specific; the inline ghost must contain only *new* words (never echo existing text).
- **Rewrites** must copy `from` **verbatim** from the note and only expand/clean it; the server drops any rewrite
  whose `from` isn't an exact substring (so the client can locate the span) and the UI shows a before→after diff so
  the doctor accepts each one consciously. Accepted rewrites are logged to `expansion_log`.
- **Compose** (`composeFromText`) reflows the doctor's text into `### ` sections **without adding facts**, preserving
  `___` placeholders; the doctor reviews a word-level before/after diff (Keep / Revert) before it sticks.
- **Sign** is always a human action. Uncovered NABH items are appended as an italic *"items not documented"* footer
  (a **soft** gate — it never blocks signing or demands a reason).

This is why insurer "AI-detection" is a non-issue here: the human writes and signs; the AI only structures and
faithfully expands, and every transformation is shown before it lands.

## 7. Gotchas baked into the code (don't regress these)

- **Neon HTTP driver has no `.query()`** — use the tagged-template form. For dynamic raw SQL (e.g. the migrate
  splitter) wrap as `Object.assign([stmt], { raw: [stmt] }) as TemplateStringsArray` then `await sql(tsa)`.
- **`neon()` validates the URL at import** — `db.ts` falls back to a *well-formed* placeholder so `next build`
  (page-data collection) doesn't throw when `DATABASE_URL` is unset.
- **Gemini 2.5 bills hidden "thinking" against output tokens.** A small `maxOutputTokens` **with thinking on returns
  an empty body**. `/api/analyze` sets `thinkingBudget: 0` (utility/flash) + a 512 cap. `vertex.ts` forwards
  `thinkingConfig` through `generationConfig` — the SDK's `validateGenerationConfig` passes unknown fields verbatim.
- **Compose on `pro` timed out at 60s** → compose runs on **flash** + markdown-only output + **deterministic**
  grounding (no LLM self-grading) → ~46s, faithful.
- **docx export can cold-start 503** → the client fetches it as a **blob with one retry** (token in header, not URL)
  rather than a raw `<a href>` navigation.
- **SSR + TipTap** → `immediatelyRender: false`; typing before hydration is lost (a test-only artifact).
- **Sign serializes the editor to markdown** (`editorJsonToMarkdown`) so docx/PDF/clipboard carry real `###`
  headings — do not revert to `editor.getText()` (it flattens headings).

## 8. Theming & mobile

All colors/spacing are CSS custom properties (`--mng-*`) defined at `:root` in `src/app/globals.css`. Nothing
hardcodes a brand color. **To reskin for EvenScribe, override the `--mng-*` tokens** — no component changes needed.
Layout is mobile-first (max-width column, bottom action bar, pull-up assistant sheet, keyboard suggestion bar);
desktop is progressive enhancement. Icons are the Tabler webfont loaded in `layout.tsx`.

## 9. Cost posture (R7)

The live assistant is throttled to stay cheap without feeling laggy: 450ms debounce + **2.5s min-interval floor**
+ char-delta gate (fires on clause boundaries) + idle catch-up; **tail-only context** (~800 chars) to `/analyze`;
output capped + **thinking off**; an in-memory **LRU cache** (sha1 of note_type+text+gaps, TTL 5m); and the loop
**pauses when the tab is hidden or offline**. Coverage is fully deterministic, so it costs nothing. A ~7s typing
burst collapses to ~1 LLM call; identical requests are served from cache in ~270ms.

## 10. Environment

See [`.env.example`](../.env.example). Server-side only: `DATABASE_URL`, `MIGRATION_SECRET`, `APP_ACCESS_TOKEN`,
`GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SA_KEY_BASE64` (service-account JSON, base64), `GEMINI_REASONING_MODEL`,
`GEMINI_UTILITY_MODEL`, `GEMINI_ALL=1`. Real secret values live in Vercel + the out-of-repo
`Daily Dash EHRC/mednotegen-deploy/vercel-env.txt`, never in git.
