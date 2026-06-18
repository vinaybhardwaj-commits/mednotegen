-- ============================================================================
-- MedNoteGen — application schema (run before db/seed/nabh_requirements_seed.sql)
-- 6 app tables; nabh_requirements is created+seeded by the seed file.
-- ============================================================================

-- AI-generated question schemas, cached by (note_type, normalized procedure).
CREATE TABLE IF NOT EXISTS template_cache (
    id            TEXT PRIMARY KEY,
    note_type     TEXT NOT NULL,
    procedure_key TEXT NOT NULL,          -- normalize(procedure)
    schema_json   JSONB NOT NULL,         -- merged floor + AI fields
    version       INTEGER NOT NULL DEFAULT 1,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (note_type, procedure_key)
);

-- One note in progress.
CREATE TABLE IF NOT EXISTS note_sessions (
    id          TEXT PRIMARY KEY,
    doctor_id   TEXT,
    patient_ref TEXT,                      -- UHID
    note_type   TEXT NOT NULL CHECK (note_type IN ('ot_note','discharge_summary','opd_rx')),
    procedure   TEXT,
    status      TEXT NOT NULL DEFAULT 'started'
                CHECK (status IN ('started','answering','generated','signed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doctor's structured answers (the ONLY source of clinical fact).
CREATE TABLE IF NOT EXISTS note_answers (
    session_id TEXT NOT NULL REFERENCES note_sessions(id) ON DELETE CASCADE,
    field_key  TEXT NOT NULL,
    value      TEXT,
    source     TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','voice','default')),
    na_reason  TEXT,                       -- set when a field is marked N/A
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, field_key)
);

-- Composed note (draft + signed final).
CREATE TABLE IF NOT EXISTS generated_notes (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES note_sessions(id) ON DELETE CASCADE,
    draft_md      TEXT,
    final_md      TEXT,
    humanized     BOOLEAN NOT NULL DEFAULT FALSE,
    version       INTEGER NOT NULL DEFAULT 1,
    signed_by     TEXT,
    signed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-sentence traceability: which answers support which sentence.
CREATE TABLE IF NOT EXISTS grounding_map (
    note_id          TEXT NOT NULL REFERENCES generated_notes(id) ON DELETE CASCADE,
    sentence_id      INTEGER NOT NULL,
    sentence_text    TEXT NOT NULL,
    source_field_keys JSONB NOT NULL DEFAULT '[]',
    supported        BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (note_id, sentence_id)
);

-- Full medico-legal + NABH audit trail.
CREATE TABLE IF NOT EXISTS note_audit (
    id         BIGSERIAL PRIMARY KEY,
    session_id TEXT,
    event      TEXT NOT NULL,
    actor      TEXT,
    payload    JSONB,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status   ON note_sessions(status);
CREATE INDEX IF NOT EXISTS idx_answers_session   ON note_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_session     ON note_audit(session_id);

-- ============================================================================
-- v1.2 input-mode additions (PRD §5A) — idempotent; safe to re-run.
-- ============================================================================
ALTER TABLE note_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'qa';
ALTER TABLE note_sessions ADD COLUMN IF NOT EXISTS raw_input TEXT;
-- v2.1 (R1): the always-editable live document
ALTER TABLE note_sessions ADD COLUMN IF NOT EXISTS editor_text TEXT;

-- Mode B: log every shorthand→expansion so a curated lexicon can accrue later.
CREATE TABLE IF NOT EXISTS expansion_log (
    id         BIGSERIAL PRIMARY KEY,
    session_id TEXT,
    note_type  TEXT,
    from_text  TEXT NOT NULL,
    to_text    TEXT NOT NULL,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
