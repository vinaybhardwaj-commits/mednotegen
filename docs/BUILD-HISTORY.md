# MedNoteGen — Build History

> The whole product was built on **18 Jun 2026** in one extended session. This is the narrative + commit chronology
> so a future thread (e.g. the EvenScribe port) can absorb the *why* behind the code, not just the *what*.
> Pair with [`ARCHITECTURE.md`](./ARCHITECTURE.md) (current state) and [`EVENSCRIBE-INTEGRATION.md`](./EVENSCRIBE-INTEGRATION.md).

## The big arc

MedNoteGen started as the **inverse of transcription**. EvenScribe/ETA captures speech → extracts. MedNoteGen was
meant to *ask structured questions → compose*. The origin was a real surgeon (Chandrika Kambam) who'd produced an OT
note in Gemini quickly and wanted the same for OPD prescriptions and IPD notes, NABH-compliant, without an
"AI-detection" risk from insurers.

It went through **two design generations** in one day:

1. **v1 — Q&A engine (C-series).** Pick note type → AI generates a question schema anchored by a deterministic NABH
   field floor → doctor answers → composer generates a grounded prose note → faithfulness check + NABH gate → sign →
   export. A second input mode (B) let the doctor paste shorthand free-text that was parsed/expanded/mapped to NABH
   fields. **This worked end-to-end and is still in the repo, but is now dormant.**

2. **v2.1 — single live editor (R-series).** After using v1, the verdict was that the "cards + question form" model
   was wrong. The new vision (and the shipped product): **one always-editable free-text document** — a live
   clinical-writing assistant (Grammarly/Copilot for notes), **mobile-first**, **EvenScribe-native**, note-type via a
   slider, with three live streams nudging the note toward NABH completeness as the doctor types. Crucially: **the
   doctor authors**, which eliminates the AI-detection concern entirely. The v1 engine (composer, grounding, NABH
   floor, export, audit) was **reused**, not rebuilt.

A design review with a senior dev (Ira Banerjee) reframed it as **one engine, three input modes** — A) Q&A,
B) free-text + nudges, C) dictation (= EvenScribe later). The live editor is mode B taken to its conclusion; A is
dormant; C arrives at the EvenScribe port.

## Key product decisions (locked)

- **Scope:** OT note + Discharge summary + OPD Rx.
- **Templates:** pure AI-generated on the fly, anchored by a **deterministic NABH field floor** + a schema cache —
  no hand-curated template library.
- **NABH:** 6th ed (2025); the floor seed cites 6th-ed clauses (COP.14.e operative note, COP.13 perioperative,
  AAC.14 discharge, MOM.4.b Rx). 70 fields total.
- **NABH gate:** **soft** — never blocks signing, never demands a reason. Uncovered items are appended as an italic
  "items not documented" footer on the signed note; the live UI nudges toward them.
- **Editor:** TipTap (ProseMirror). Mobile inline decorations were judged the hardest risk; TipTap handled them.
- **Compose trigger:** doctor-initiated (a button), with a "ready" hint — never auto-overwrites.
- **Trust:** a before/after word-diff on compose (one-tap revert); every rewrite shown before it lands.
- **Cadence:** start aggressive (near-continuous), then add cost brakes in R7 (chosen posture: *balanced*).
- **Dictation + email:** **deferred to the EvenScribe port** — reuse EvenScribe's STT (mode C) and built-in email.
  This prototype is **export-only** (docx/PDF/clipboard).
- **Detectability:** doctor-authored + every transformation reviewed ⇒ insurer AI-detection is a non-issue. The real
  risk is clinical-validation NLP (the note must support acuity/coding); the defense is **completeness + grounding**.

## Commit chronology

### Infra + v1 (C-series)
| Commit | What |
|---|---|
| `d051883` | **C1 scaffold** — Next.js + Neon + Vertex, NABH-6th seed, P1 module stubs & API routes |
| `a447d06` | build fix — cast neon `.query`, valid db placeholder, eslint ignoreDuringBuilds |
| `060f8cf` | deploy fix — bundle `db/*.sql` into `/api/migrate` via `outputFileTracingIncludes` |
| `d9cc2dc` | migrate fix — raw SQL via neon tagged-template (no `.query` in 0.10.x) |
| `d1d493f` | migrate fix — quote/comment-aware SQL splitter + idempotent inserts (infra LIVE; DB seeded) |
| `29ceb95` | **C2–C3** Mode A capture→generate→review→sign→export UI; v1.2 schema (mode/raw_input/expansion_log) |
| `a36933a` | C3 fix — sanitize AI fields (`conditional_on` object/junk) at read-time + client guards |
| `6edad67` | **C4–C7** composer robust-parse+retry, generate 502 guard, review-with-diff grounding panel, docx tables/bold |
| `a0f97e6` | perf — compose on flash + maxDuration (pro compose timed out at 60s) |
| `cd32ff8` | C4–C7 polish — prose composer, faithfulness numbers-only, humanize flag-gated |
| `181cc90` | grounding fix — treat structural lines (headings/tables) as supported |
| `21d3674` | **perf** — compose markdown-only + **deterministic grounding** (drop LLM grounding_map) → ~46s |
| `2c44c46` | **C8–C9** Mode B free-text — parse/expand/map (pro) + nudge gap engine + expansion_log + UI |

### v2.1 live editor (R-series)
| Commit | What |
|---|---|
| `00edf7d` | **R0** mobile shell — TipTap editor + note-type slider + re-themeable token theme; **retire cards/Q&A UI** |
| `ead83a1` | **R1** editor autosave — `note_sessions.editor_text` + `PUT /editor` + debounced autosave + save indicator |
| `fbd793a` | **R2** live NABH coverage — deterministic engine + coverage pill + assistant bottom sheet |
| `12969ed` | R2 fix — suffix match for long keywords (count→counts, complication→complications) |
| `cb84431` | **R3** live completions — `/api/analyze` (flash, grounded) + ghost-text TipTap extension + suggestion bar |
| `03b7ef9` | R3 fix — inline completion must not repeat existing text |
| `11d7bf5` | **R4** rewrites/expansion — `/analyze` returns rewrites + dotted underline + accept/dismiss + expansion_log |
| `1515684` | **R5** compose-in-place + before/after diff (keep/revert) + Sign & lock with NABH-gaps footer |
| `2ce5f5b` | R5 fix — lock assistant at sign (kill late ghost repaint) + freeze NABH pill at pre-sign count |
| `885bde2` | **R6** export/share — Word (.docx) + Save as PDF (print view) + Copy text |
| `87036aa` | R6 fix — docx download via blob fetch + retry (cold-start 503 guard); token via header not URL |
| `ecb0d3a` | **R7** cost-harden live assistant (balanced) — throttle + tail context + cache + token cap |
| `3ea8538` | R7 fix — disable thinking on `/analyze` (`thinkingBudget:0`); a 320-tok cap with thinking on returned EMPTY |

## Gotchas discovered the hard way (each cost a fix commit)

- **Neon `.query()` doesn't exist** on the HTTP driver — tagged-template only (and a `TemplateStringsArray` cast for
  dynamic SQL). Two build/runtime fixes before migrate worked.
- **`db/*.sql` not bundled on Vercel** — `outputFileTracingIncludes` for `/api/migrate`.
- **Naive SQL splitter broke on `;` inside strings/comments** — wrote a quote/comment-aware splitter.
- **AI returned `conditional_on` as an object** → client crash → sanitize AI fields at read-time + typeof guards.
- **Compose on `pro` timed out at 60s** → flash + markdown-only + deterministic grounding.
- **Faithfulness false-positives on label words** → numbers-only check; structural lines treated as supported.
- **R2 coverage too strict** (`\bcount\b` ≠ "counts") → suffix-allowed for keywords > 3 chars.
- **R3 inline echoed existing text** → prompt "ONLY new words".
- **R4 TS narrowing** on `acceptRewrite` → use an array of ranges instead of a mutated `let`.
- **R5 late ghost repaint on a signed note** + **NABH pill flipping to green** (the footer text re-matched the
  coverage keywords) → a `lockRef` set at sign + a frozen pre-sign coverage snapshot.
- **R6 docx cold-start 503** → blob-fetch + retry; **sign was flattening headings** → serialize editor → markdown.
- **R7 thinking budget** → a small `maxOutputTokens` with 2.5-flash thinking ON returns an empty body;
  `thinkingBudget:0` fixes it and is cheaper.
- **Git inside the iCloud-synced folder hits a lock** (`Operation not permitted`). All git ops run from a `/tmp`
  clone; source files live in the iCloud `Daily Dash EHRC/mednotegen/` working copy.
- **Chrome automation backgrounds the tab** (`document.hidden=true`), which (correctly) pauses the R7 analyze loop —
  had to override visibility in-page to verify the loop during testing. Real foreground users are unaffected.

## Deploy model

Vercel auto-deploys on push to `main` (~44s). No deploy hook needed. Build locally first (`npm run build` with a
placeholder `DATABASE_URL`) to catch type errors before pushing. Token-gated prod: `mednotegen.vercel.app/?t=<APP_ACCESS_TOKEN>`.

## Status at this snapshot

R0–R7 complete and verified live. **R8 = eval, intentionally deferred** until MedNoteGen is integrated into
EvenScribe (eval the real ported surface, not the prototype). The remaining inputs — **dictation (mode C)** and
**email delivery** — are EvenScribe-native and arrive at the port. See [`EVENSCRIBE-INTEGRATION.md`](./EVENSCRIBE-INTEGRATION.md).
