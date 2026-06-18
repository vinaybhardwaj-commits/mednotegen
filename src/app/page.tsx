"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NoteEditor from "@/components/NoteEditor";
import { computeCoverage, type FloorField } from "@/lib/coverage";

const NOTE_TYPES = [
  { key: "ot_note", label: "Op note" },
  { key: "discharge_summary", label: "Discharge" },
  { key: "opd_rx", label: "OPD Rx" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Home() {
  const [token, setToken] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("t") ?? ""); }, []);

  const [noteType, setNoteType] = useState("ot_note");
  const [text, setText] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [floor, setFloor] = useState<FloorField[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const current = NOTE_TYPES.find((n) => n.key === noteType)!;
  const coverage = useMemo(() => computeCoverage(floor, text), [floor, text]);
  const gaps = coverage.total - coverage.covered;

  const sessionIdRef = useRef<string>("");
  const htmlRef = useRef<string>("");
  const noteTypeRef = useRef<string>(noteType);
  noteTypeRef.current = noteType;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, { ...init, headers: { "content-type": "application/json", "x-app-token": token, ...(init?.headers || {}) } }),
    [token],
  );

  // Load the NABH floor for the selected note type (drives live coverage).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api(`/api/nabh-requirements?note_type=${noteType}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setFloor((j.fields || []) as FloorField[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [noteType, token, api]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const r = await api("/api/sessions", { method: "POST", body: JSON.stringify({ note_type: noteTypeRef.current, mode: "freetext" }) });
    const j = await r.json().catch(() => ({}));
    sessionIdRef.current = j.id || "";
    return sessionIdRef.current;
  }, [api]);

  const flushSave = useCallback(async () => {
    if (!htmlRef.current.trim()) return;
    setSave("saving");
    try {
      const id = await ensureSession();
      if (!id) { setSave("error"); return; }
      const r = await api(`/api/sessions/${id}/editor`, { method: "PUT", body: JSON.stringify({ editor_text: htmlRef.current, note_type: noteTypeRef.current }) });
      setSave(r.ok ? "saved" : "error");
    } catch { setSave("error"); }
  }, [api, ensureSession]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSave("saving");
    saveTimer.current = setTimeout(flushSave, 800);
  }, [flushSave]);

  function onEditorChange(t: string, h: string) { setText(t); htmlRef.current = h; scheduleSave(); }

  function pickNoteType(key: string) {
    setNoteType(key);
    if (sessionIdRef.current) {
      api(`/api/sessions/${sessionIdRef.current}/editor`, { method: "PUT", body: JSON.stringify({ note_type: key }) }).catch(() => {});
    }
  }

  const saveLabel = save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry" : "";
  const pillFull = coverage.total > 0 && gaps === 0;
  const needed = coverage.items.filter((i) => !i.covered);
  const have = coverage.items.filter((i) => i.covered);

  return (
    <div className="mng-shell">
      <header className="mng-header">
        <button className="mng-iconbtn" aria-label="Back" style={{ width: 36, height: 36, border: 0 }}>
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <span className="mng-title">New note</span>
        <span className={"mng-pill" + (pillFull ? " ok" : "")}>
          <i className="ti ti-shield-check" aria-hidden="true" /> NABH {floor.length ? `${coverage.covered}/${coverage.total}` : "—"}
        </span>
      </header>

      <div className="mng-slider" role="tablist" aria-label="Note type">
        {NOTE_TYPES.map((n) => (
          <button key={n.key} role="tab" aria-selected={noteType === n.key}
            className={"mng-seg" + (noteType === n.key ? " on" : "")} onClick={() => pickNoteType(n.key)}>
            {n.label}
          </button>
        ))}
      </div>

      <main className="mng-editorwrap">
        <div className="mng-editor-label">{current.label} · you are the author</div>
        <NoteEditor onChange={onEditorChange} />
      </main>

      <button className="mng-assistant-handle" onClick={() => setSheetOpen(true)} aria-label="Open assistant">
        <span><i className="ti ti-clipboard-check" aria-hidden="true" /> Assistant · {floor.length ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "live nudges"}</span>
        <i className="ti ti-chevron-up" aria-hidden="true" />
      </button>

      <div className="mng-actionbar">
        <button className="mng-iconbtn" aria-label="Dictate (via EvenScribe at port)" disabled>
          <i className="ti ti-microphone" aria-hidden="true" />
        </button>
        <button className="mng-primary" disabled>Compose &amp; format</button>
        <button className="mng-iconbtn" aria-label="Sign" disabled>
          <i className="ti ti-signature" aria-hidden="true" />
        </button>
      </div>
      <div className="mng-foot">
        {words} words{saveLabel && (<> · <i className={"ti " + (save === "saved" ? "ti-circle-check" : save === "error" ? "ti-alert-circle" : "ti-loader-2")} style={{ verticalAlign: "-2px" }} aria-hidden="true" /> {saveLabel}</>)}
      </div>

      {sheetOpen && (
        <div className="mng-scrim" onClick={() => setSheetOpen(false)}>
          <div className="mng-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mng-sheet-head">
              <span><i className="ti ti-clipboard-check" aria-hidden="true" /> Vital info · NABH <b>{coverage.covered}/{coverage.total}</b></span>
              <button className="mng-sheet-x" onClick={() => setSheetOpen(false)} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="mng-sheet-body">
              {needed.length > 0 && <div className="mng-sheet-section">Needed ({needed.length})</div>}
              {needed.map((i) => (
                <div key={i.field_key} className="mng-cov-row need" onClick={() => setSheetOpen(false)}>
                  <i className="ti ti-alert-circle mng-cov-ico need" aria-hidden="true" /> {i.label}
                </div>
              ))}
              {have.length > 0 && <div className="mng-sheet-section">Covered ({have.length})</div>}
              {have.map((i) => (
                <div key={i.field_key} className="mng-cov-row has">
                  <i className="ti ti-check mng-cov-ico has" aria-hidden="true" /> {i.label}
                </div>
              ))}
              {coverage.total === 0 && <div className="mng-cov-row has">Start writing — NABH items light up as you cover them.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
