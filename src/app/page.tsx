"use client";

import { useMemo, useState } from "react";
import NoteEditor from "@/components/NoteEditor";

const NOTE_TYPES = [
  { key: "ot_note", label: "Op note" },
  { key: "discharge_summary", label: "Discharge" },
  { key: "opd_rx", label: "OPD Rx" },
];

export default function Home() {
  const [noteType, setNoteType] = useState("ot_note");
  const [text, setText] = useState("");
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const current = NOTE_TYPES.find((n) => n.key === noteType)!;

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
          <button
            key={n.key}
            role="tab"
            aria-selected={noteType === n.key}
            className={"mng-seg" + (noteType === n.key ? " on" : "")}
            onClick={() => setNoteType(n.key)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <main className="mng-editorwrap">
        <div className="mng-editor-label">{current.label} · you are the author</div>
        <NoteEditor onChange={(t) => setText(t)} />
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
      <div className="mng-foot">{words} words · autosave arrives R1</div>
    </div>
  );
}
