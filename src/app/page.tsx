"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import NoteEditor from "@/components/NoteEditor";
import { computeCoverage, type Coverage, type FloorField } from "@/lib/coverage";
import { mdToHtml, wordDiff, type DiffToken } from "@/lib/md";

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
  const [chips, setChips] = useState<string[]>([]);
  const [rewrites, setRewrites] = useState<{ from: string; to: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [composing, setComposing] = useState(false);
  const [diff, setDiff] = useState<DiffToken[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signer, setSigner] = useState("");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [lockedCov, setLockedCov] = useState<{ covered: number; total: number } | null>(null);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const current = NOTE_TYPES.find((n) => n.key === noteType)!;
  const liveCoverage = useMemo<Coverage>(() => computeCoverage(floor, text), [floor, text]);
  // Once signed, freeze the NABH pill at the pre-sign count (the appended gaps footer would
  // otherwise make the keyword matcher re-match every gap label and flip the pill to full).
  const coverage = liveCoverage;
  const covDisplay = signed && lockedCov ? lockedCov : { covered: coverage.covered, total: coverage.total };
  const gaps = coverage.total - coverage.covered;
  const needed = coverage.items.filter((i) => !i.covered);
  const have = coverage.items.filter((i) => i.covered);

  const sessionIdRef = useRef<string>("");
  const htmlRef = useRef<string>("");
  const textRef = useRef<string>("");
  const beforeHtmlRef = useRef<string>("");
  const noteTypeRef = useRef<string>(noteType); noteTypeRef.current = noteType;
  const coverageRef = useRef<Coverage>(coverage); coverageRef.current = coverage;
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeCtrl = useRef<AbortController | null>(null);
  const lastAnalyzed = useRef<string>("");
  const lockRef = useRef<boolean>(false); // true from the moment Sign begins — kills late ghost/analyze

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, { ...init, headers: { "content-type": "application/json", "x-app-token": token, ...(init?.headers || {}) } }),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api(`/api/nabh-requirements?note_type=${noteType}`).then((r) => r.json())
      .then((j) => { if (!cancelled) setFloor((j.fields || []) as FloorField[]); }).catch(() => {});
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

  const runAnalyze = useCallback(async () => {
    if (lockRef.current) return;
    const t = textRef.current.trim();
    if (t.length < 8) { setChips([]); return; }
    if (t === lastAnalyzed.current) return;
    lastAnalyzed.current = t;
    analyzeCtrl.current?.abort();
    const ctrl = new AbortController(); analyzeCtrl.current = ctrl; setThinking(true);
    try {
      const gapLabels = coverageRef.current.items.filter((i) => !i.covered).map((i) => i.label);
      const r = await api("/api/analyze", { method: "POST", body: JSON.stringify({ text: t, note_type: noteTypeRef.current, gaps: gapLabels }), signal: ctrl.signal });
      const j = await r.json();
      if (ctrl.signal.aborted) return;
      setChips(Array.isArray(j.chips) ? j.chips : []);
      const rw = Array.isArray(j.rewrites) ? j.rewrites : [];
      setRewrites(rw);
      if (editorRef.current) editorRef.current.commands.setRewrites(rw);
      if (j.inline && editorRef.current) editorRef.current.commands.setSuggestion(" " + String(j.inline).trim());
    } catch { /* aborted */ } finally { if (!ctrl.signal.aborted) setThinking(false); }
  }, [api]);

  const onEditorChange = useCallback((t: string, h: string) => {
    setText(t); textRef.current = t; htmlRef.current = h;
    if (signed || lockRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSave("saving"); saveTimer.current = setTimeout(flushSave, 800);
    setChips([]); setRewrites([]);
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    analyzeTimer.current = setTimeout(runAnalyze, 400);
  }, [flushSave, runAnalyze, signed]);

  const handleReady = useCallback((ed: Editor) => { editorRef.current = ed; }, []);

  function applyChip(c: string) {
    const ed = editorRef.current; if (!ed) return;
    const lead = textRef.current && !/\s$/.test(textRef.current) ? " " : "";
    ed.chain().focus().insertContent(lead + c).run(); setChips([]);
  }
  function acceptRewrite(r: { from: string; to: string }) {
    const ed = editorRef.current;
    if (ed) ed.chain().focus().acceptRewrite(r.from, r.to).run();
    if (sessionIdRef.current) api(`/api/sessions/${sessionIdRef.current}/expansions`, { method: "POST", body: JSON.stringify({ from: r.from, to: r.to }) }).catch(() => {});
    setRewrites([]);
  }
  function dismissRewrite(r: { from: string; to: string }) {
    const rest = rewrites.filter((x) => x.from !== r.from || x.to !== r.to);
    setRewrites(rest); if (editorRef.current) editorRef.current.commands.setRewrites(rest);
  }

  function pickNoteType(key: string) {
    if (signed) return;
    setNoteType(key); lastAnalyzed.current = ""; setChips([]); setRewrites([]);
    if (sessionIdRef.current) api(`/api/sessions/${sessionIdRef.current}/editor`, { method: "PUT", body: JSON.stringify({ note_type: key }) }).catch(() => {});
  }

  // ---- R5: compose-in-place ----
  async function compose() {
    const ed = editorRef.current; if (!ed) return;
    const t = ed.getText().trim(); if (t.length < 8) return;
    setComposing(true);
    try {
      const id = await ensureSession();
      const r = await api(`/api/sessions/${id}/compose`, { method: "POST", body: JSON.stringify({ text: t }) });
      const j = await r.json();
      if (!r.ok || !j.composed_md) { setComposing(false); return; }
      const beforeText = ed.getText();
      beforeHtmlRef.current = ed.getHTML();
      ed.commands.setContent(mdToHtml(j.composed_md));
      const afterText = ed.getText();
      setDiff(wordDiff(beforeText, afterText)); setDiffOpen(true);
      htmlRef.current = ed.getHTML(); textRef.current = ed.getText(); flushSave();
    } catch { /* ignore */ } finally { setComposing(false); }
  }
  function revertCompose() {
    const ed = editorRef.current; if (ed && beforeHtmlRef.current) ed.commands.setContent(beforeHtmlRef.current);
    setDiffOpen(false);
  }

  // ---- R5: sign ----
  function doSign() {
    const ed = editorRef.current; if (!ed || !signer.trim()) return;
    setSigning(true);
    // Lock the assistant the moment we commit to signing, so a late analyze response can't
    // re-paint ghost text or rewrites onto the finished note.
    lockRef.current = true;
    setLockedCov({ covered: coverage.covered, total: coverage.total });
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    analyzeCtrl.current?.abort();
    ed.commands.clearSuggestion(); ed.commands.clearRewrites();
    setChips([]); setRewrites([]);
    const labels = needed.map((n) => n.label).join(", ");
    const footer = labels ? `\n\n---\nNABH — items not documented: ${labels}.` : "";
    const finalMd = ed.getText({ blockSeparator: "\n\n" }) + footer;
    if (footer) ed.chain().focus("end").insertContent(`<p></p><p><em>NABH — items not documented: ${labels}.</em></p>`).run();
    ed.commands.clearSuggestion(); ed.commands.clearRewrites();
    (async () => {
      try {
        const id = await ensureSession();
        const r = await api(`/api/sessions/${id}/sign`, { method: "POST", body: JSON.stringify({ final_md: finalMd, signed_by: signer }) });
        if (r.ok) { setSigned(true); ed.setEditable(false); setSignOpen(false); setChips([]); setRewrites([]); ed.commands.clearSuggestion(); ed.commands.clearRewrites(); }
      } finally { setSigning(false); }
    })();
  }

  const saveLabel = save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry" : "";
  const pillFull = covDisplay.total > 0 && covDisplay.covered >= covDisplay.total;
  const canAct = words >= 2 && !signed;

  return (
    <div className="mng-shell">
      <header className="mng-header">
        <button className="mng-iconbtn" aria-label="Back" style={{ width: 36, height: 36, border: 0 }}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
        <span className="mng-title">{signed ? "Signed note" : "New note"}</span>
        <span className={"mng-pill" + (pillFull ? " ok" : "")}>
          <i className="ti ti-shield-check" aria-hidden="true" /> NABH {floor.length ? `${covDisplay.covered}/${covDisplay.total}` : "—"}
        </span>
      </header>

      <div className="mng-slider" role="tablist" aria-label="Note type">
        {NOTE_TYPES.map((n) => (
          <button key={n.key} role="tab" aria-selected={noteType === n.key} disabled={signed}
            className={"mng-seg" + (noteType === n.key ? " on" : "")} onClick={() => pickNoteType(n.key)}>{n.label}</button>
        ))}
      </div>

      {signed && <div className="mng-signed"><i className="ti ti-circle-check" aria-hidden="true" /> Signed by {signer} · locked</div>}

      <main className="mng-editorwrap">
        <div className="mng-editor-label">{current.label} · {signed ? "signed" : "you are the author"}{thinking && !signed ? " · thinking…" : ""}</div>
        <NoteEditor onChange={onEditorChange} onReady={handleReady} />
      </main>

      {!signed && (
        <button className="mng-assistant-handle" onClick={() => setSheetOpen(true)} aria-label="Open assistant">
          <span><i className="ti ti-clipboard-check" aria-hidden="true" /> Assistant · {floor.length ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "live nudges"}{rewrites.length ? ` · ${rewrites.length} rewrite${rewrites.length === 1 ? "" : "s"}` : ""}</span>
          <i className="ti ti-chevron-up" aria-hidden="true" />
        </button>
      )}

      {!signed && rewrites.length > 0 && (
        <div className="mng-rwbar">
          <i className="ti ti-wand mng-ai" aria-hidden="true" />
          {rewrites.map((r, i) => (
            <span key={i} className="mng-rwpill">
              <span style={{ textDecoration: "line-through", color: "var(--mng-muted)" }}>{r.from}</span>
              <span className="arrow">→</span> {r.to}
              <button className="mng-rwbtn ok" onClick={() => acceptRewrite(r)} aria-label="Accept"><i className="ti ti-check" aria-hidden="true" /></button>
              <button className="mng-rwbtn no" onClick={() => dismissRewrite(r)} aria-label="Dismiss"><i className="ti ti-x" aria-hidden="true" /></button>
            </span>
          ))}
        </div>
      )}

      {!signed && chips.length > 0 && (
        <div className="mng-sugbar">
          <i className="ti ti-bulb mng-ai" aria-hidden="true" />
          {chips.map((c, i) => (<button key={i} className="mng-chip" onClick={() => applyChip(c)}>{c}</button>))}
        </div>
      )}

      <div className="mng-actionbar">
        <button className="mng-iconbtn" aria-label="Dictate (via EvenScribe at port)" disabled><i className="ti ti-microphone" aria-hidden="true" /></button>
        <button className="mng-primary" disabled={!canAct || composing} onClick={compose}>{composing ? "Composing…" : "Compose & format"}</button>
        <button className="mng-iconbtn" aria-label="Sign" disabled={!canAct} onClick={() => setSignOpen(true)}><i className="ti ti-signature" aria-hidden="true" /></button>
      </div>
      <div className="mng-foot">
        {words} words{!signed && saveLabel && (<> · <i className={"ti " + (save === "saved" ? "ti-circle-check" : save === "error" ? "ti-alert-circle" : "ti-loader-2")} style={{ verticalAlign: "-2px" }} aria-hidden="true" /> {saveLabel}</>)}
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
              {needed.map((i) => (<div key={i.field_key} className="mng-cov-row need" onClick={() => setSheetOpen(false)}><i className="ti ti-alert-circle mng-cov-ico need" aria-hidden="true" /> {i.label}</div>))}
              {have.length > 0 && <div className="mng-sheet-section">Covered ({have.length})</div>}
              {have.map((i) => (<div key={i.field_key} className="mng-cov-row has"><i className="ti ti-check mng-cov-ico has" aria-hidden="true" /> {i.label}</div>))}
              {coverage.total === 0 && <div className="mng-cov-row has">Start writing — NABH items light up as you cover them.</div>}
            </div>
          </div>
        </div>
      )}

      {diffOpen && (
        <div className="mng-scrim" onClick={() => setDiffOpen(false)}>
          <div className="mng-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mng-sheet-head">
              <span><i className="ti ti-wand" aria-hidden="true" /> Review formatting — green = AI added</span>
              <button className="mng-sheet-x" onClick={() => setDiffOpen(false)} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="mng-sheet-body">
              <p className="mng-difftext">
                {diff.map((d, i) => d.t === "same" ? <span key={i}>{d.w}</span> : d.t === "add" ? <span key={i} className="diff-add">{d.w}</span> : <span key={i} className="diff-del">{d.w}</span>)}
              </p>
            </div>
            <div className="mng-sheet-actions">
              <button className="mng-secondary" onClick={revertCompose}>Revert to my draft</button>
              <button className="mng-primary" onClick={() => setDiffOpen(false)}>Keep formatted</button>
            </div>
          </div>
        </div>
      )}

      {signOpen && (
        <div className="mng-scrim" onClick={() => setSignOpen(false)}>
          <div className="mng-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mng-sheet-head">
              <span><i className="ti ti-signature" aria-hidden="true" /> Sign &amp; lock</span>
              <button className="mng-sheet-x" onClick={() => setSignOpen(false)} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="mng-sheet-body">
              {needed.length > 0 && <div className="mng-cov-row need" style={{ cursor: "default" }}><i className="ti ti-alert-circle mng-cov-ico need" aria-hidden="true" /> {needed.length} NABH item{needed.length === 1 ? "" : "s"} will be noted as not documented in the signed note.</div>}
              <label style={{ display: "block", fontSize: 13, color: "var(--mng-muted)", margin: "10px 4px 6px" }}>Signing doctor</label>
              <input className="mng-input" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Dr. …" />
            </div>
            <div className="mng-sheet-actions">
              <button className="mng-secondary" onClick={() => setSignOpen(false)}>Cancel</button>
              <button className="mng-primary" disabled={!signer.trim() || signing} onClick={doSign}>{signing ? "Signing…" : "Sign & lock"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
