"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NoteEditor from "@/components/NoteEditor";

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
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const current = NOTE_TYPES.find((n) => n.key === noteType)!;

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

  // Create the session lazily on first edit (avoids empty/orphan sessions).
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const r = await api("/api/sessions", { method: "POST", body: JSON.stringify({ note_type: noteTypeRef.current, mode: "freetext" }) });
    const j = await r.json().catch(() => ({}));
    sessionIdRef.current = j.id || "";
    return sessionIdRef.current;
  }, [api]);

  const flushSave = useCallback(async () => {
    if (!htmlRef.current.trim()) return; // nothing meaningful yet
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

  function onEditorChange(t: string, h: string) {
    setText(t); htmlRef.current = h; scheduleSave();
  }

  // Persist a note-type switch if a session already exists.
  function pickNoteType(key: string) {
    setNoteType(key);
    if (sessionIdRef.current) {
      api(`/api/sessions/${sessionIdRef.current}/editor`, { method: "PUT", body: JSON.stringify({ note_type: key }) }).catch(() => {});
    }
  }

  const saveLabel = save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry" : "";

  return (
    <div className="mng-shell">
      <header className="mng-header">
        <button className="mng-iconbtn" aria-label="Back" style={{ width: 36, height: 36, border: 0 }}>
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <span className="mng-title">New note</span>
        <span className="mng-pill"><i className="ti ti-shield-check" aria-hidden="true" /> NABH —</span>
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

      <button className="mng-assistant-handle" aria-label="Open assistant">
        <span><i className="ti ti-clipboard-check" aria-hidden="true" /> Assistant · live nudges</span>
        <span className="mng-muted">arrives R2</span>
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
    </div>
  );
}
