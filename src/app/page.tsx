"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Field = {
  field_key: string;
  label: string;
  input_type: string;
  section: string;
  options?: unknown;
  unit?: string | null;
  mandatory: boolean;
  allow_na: boolean;
  default_value?: string | null;
  conditional_on?: string | null;
  help_text?: string | null;
  nabh: boolean;
};

const NOTE_TYPES = [
  { key: "ot_note", title: "Operative note", blurb: "OT / surgical note (COP)", needsProcedure: true },
  { key: "discharge_summary", title: "Discharge summary", blurb: "IPD discharge (AAC.14)", needsProcedure: false },
  { key: "opd_rx", title: "OPD prescription", blurb: "Outpatient Rx (MOM.4)", needsProcedure: false },
];

function useToken() {
  const [t, setT] = useState("");
  useEffect(() => {
    setT(new URLSearchParams(window.location.search).get("t") ?? "");
  }, []);
  return t;
}

export default function Home() {
  const token = useToken();
  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", "x-app-token": token, ...(init?.headers || {}) },
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
      return { ok: res.ok, status: res.status, json, text };
    },
    [token],
  );

  const [step, setStep] = useState<"home" | "start" | "answer" | "review" | "done">("home");
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number] | null>(null);
  const [procedure, setProcedure] = useState("");
  const [uhid, setUhid] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // generation result
  const [noteId, setNoteId] = useState("");
  const [draft, setDraft] = useState("");
  const [nabh, setNabh] = useState<any>(null);
  const [faith, setFaith] = useState<any>(null);
  const [signer, setSigner] = useState("");

  // ---- start a session ----
  async function start() {
    if (!noteType) return;
    setBusy(true); setMsg("Generating your question set…");
    const s = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ note_type: noteType.key, procedure, patient_ref: uhid, mode: "qa" }),
    });
    if (!s.ok) { setBusy(false); setMsg("Could not start: " + (s.json?.error || s.status)); return; }
    const id = s.json.id as string;
    setSessionId(id);
    const q = await api(`/api/sessions/${id}/questions`, { method: "POST" });
    setBusy(false);
    if (!q.ok) { setMsg("Could not load questions: " + (q.json?.error || q.status)); return; }
    const fs = (q.json.fields || []) as Field[];
    setFields(fs);
    const init: Record<string, string> = {};
    for (const f of fs) if (f.default_value != null) init[f.field_key] = f.default_value;
    setAnswers(init);
    setMsg(""); setStep("answer");
  }

  // ---- autosave (debounced) ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback((next: Record<string, string>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = Object.entries(next).map(([field_key, value]) => ({ field_key, value, source: "typed" }));
      if (payload.length) await api(`/api/sessions/${sessionId}/answers`, { method: "POST", body: JSON.stringify({ answers: payload }) });
    }, 700);
  }, [api, sessionId]);

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => { const next = { ...prev, [key]: value }; queueSave(next); return next; });
  }

  const isActive = useCallback((f: Field) => {
    if (!f.conditional_on) return true;
    const [k, v] = f.conditional_on.split("=");
    return (answers[k] ?? "") === v;
  }, [answers]);

  const activeFields = useMemo(() => fields.filter(isActive), [fields, isActive]);
  const sections = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, Field[]> = {};
    for (const f of activeFields) { if (!map[f.section]) { map[f.section] = []; order.push(f.section); } map[f.section].push(f); }
    return order.map((s) => ({ section: s, items: map[s] }));
  }, [activeFields]);

  const mandatory = activeFields.filter((f) => f.mandatory);
  const answered = mandatory.filter((f) => (answers[f.field_key] ?? "").trim() !== "").length;
  const complete = answered === mandatory.length;

  // ---- generate ----
  async function generate() {
    setBusy(true); setMsg("Composing the note (grounded — no invented facts)…");
    // flush pending saves
    const payload = Object.entries(answers).map(([field_key, value]) => ({ field_key, value, source: "typed" }));
    await api(`/api/sessions/${sessionId}/answers`, { method: "POST", body: JSON.stringify({ answers: payload }) });
    const g = await api(`/api/sessions/${sessionId}/generate`, { method: "POST" });
    setBusy(false);
    if (g.status === 422) { setNabh(g.json?.nabh); setMsg("Some required fields are missing — see highlights below."); return; }
    if (!g.ok) { setMsg("Generation failed: " + (g.json?.error || g.status)); return; }
    setNoteId(g.json.note_id); setDraft(g.json.draft_md || ""); setNabh(g.json.nabh); setFaith(g.json.faithfulness);
    setMsg(""); setStep("review");
  }

  // ---- sign ----
  async function sign() {
    if (!signer.trim()) { setMsg("Enter the signing doctor's name."); return; }
    setBusy(true); setMsg("Signing…");
    const f = await api(`/api/sessions/${sessionId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ note_id: noteId, final_md: draft, signed_by: signer }),
    });
    setBusy(false);
    if (!f.ok) { setMsg("Sign failed: " + (f.json?.error || f.status)); return; }
    setMsg(""); setStep("done");
  }

  function reset() {
    setStep("home"); setNoteType(null); setProcedure(""); setUhid(""); setSessionId("");
    setFields([]); setAnswers({}); setNoteId(""); setDraft(""); setNabh(null); setFaith(null); setSigner(""); setMsg("");
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-clinical">MedNoteGen</h1>
        {step !== "home" && <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-800">↩ start over</button>}
      </header>
      <p className="mt-1 text-sm text-slate-600">Ask the right questions → compose the note. The AI never authors clinical fact.</p>

      {msg && <div className="mt-4 rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div>}

      {/* HOME */}
      {step === "home" && (
        <section className="mt-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Start a note (Q&amp;A mode)</h2>
          <div className="mt-3 grid gap-3">
            {NOTE_TYPES.map((n) => (
              <button key={n.key} onClick={() => { setNoteType(n); setStep("start"); }}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-clinical">
                <div className="font-medium">{n.title}</div>
                <div className="text-sm text-slate-500">{n.blurb}</div>
              </button>
            ))}
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-left opacity-60">
              <div className="font-medium">Free-text mode <span className="text-xs font-normal">(coming soon)</span></div>
              <div className="text-sm text-slate-500">Type/dictate freely → we expand, structure &amp; nudge for gaps.</div>
            </div>
          </div>
        </section>
      )}

      {/* START */}
      {step === "start" && noteType && (
        <section className="mt-6 space-y-4">
          <h2 className="text-sm font-medium">{noteType.title}</h2>
          {noteType.needsProcedure && (
            <Labeled label="Procedure">
              <input className="inp" value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="e.g. Laparoscopic inguinal hernia repair" />
            </Labeled>
          )}
          <Labeled label="Patient UHID">
            <input className="inp" value={uhid} onChange={(e) => setUhid(e.target.value)} placeholder="EHRC-…" />
          </Labeled>
          <button disabled={busy} onClick={start} className="btn-primary">Start →</button>
        </section>
      )}

      {/* ANSWER */}
      {step === "answer" && (
        <section className="mt-6">
          <div className="sticky top-0 -mx-5 mb-4 bg-slate-50/90 px-5 py-2 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">NABH completeness</span>
              <span className={complete ? "text-green-700" : "text-amber-700"}>{answered}/{mandatory.length} required</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded bg-slate-200">
              <div className="h-1.5 rounded bg-clinical" style={{ width: `${mandatory.length ? (answered / mandatory.length) * 100 : 0}%` }} />
            </div>
          </div>

          {sections.map(({ section, items }) => (
            <div key={section} className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{section.replace(/_/g, " ")}</h3>
              <div className="space-y-3">
                {items.map((f) => (
                  <FieldInput key={f.field_key} field={f} value={answers[f.field_key] ?? ""} onChange={(v) => setAnswer(f.field_key, v)} />
                ))}
              </div>
            </div>
          ))}

          {nabh && !nabh.complete && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Missing required: {(nabh.missing || []).join(", ")}
            </div>
          )}
          <button disabled={busy} onClick={generate} className="btn-primary w-full">Generate note</button>
        </section>
      )}

      {/* REVIEW */}
      {step === "review" && (
        <section className="mt-6 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${nabh?.complete ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              NABH {nabh?.complete ? "complete" : "incomplete"}
            </span>
            <span className={`rounded-full px-2 py-0.5 ${faith?.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              Faithfulness {faith?.ok ? "clean" : "review flags"}
            </span>
          </div>
          {faith && !faith.ok && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
              Unsupported content to verify: {[...(faith.orphan_entities || []), ...((faith.unsupported || []).map((u: any) => u.sentence_text))].slice(0, 8).join(" · ") || "see note"}
            </div>
          )}
          <p className="text-xs text-slate-500">Review and correct before signing. You are the author of record.</p>
          <textarea className="inp h-96 font-mono text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Labeled label="Signing doctor">
            <input className="inp" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Dr. …" />
          </Labeled>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => setStep("answer")} className="btn-ghost">← edit answers</button>
            <button disabled={busy} onClick={sign} className="btn-primary flex-1">Sign &amp; finalize</button>
          </div>
        </section>
      )}

      {/* DONE */}
      {step === "done" && (
        <section className="mt-6 space-y-3">
          <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">Signed. The note is locked and audit-logged.</div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href={`/api/sessions/${sessionId}/export?format=docx&t=${token}`} target="_blank" rel="noreferrer">Download .docx</a>
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(draft)}>Copy to clipboard</button>
            <button className="btn-ghost" onClick={reset}>New note</button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs">{draft}</pre>
        </section>
      )}

      <style>{`
        .inp { width:100%; border:1px solid #cbd5e1; border-radius:0.5rem; padding:0.5rem 0.7rem; font-size:0.9rem; background:#fff; }
        .inp:focus { outline:none; border-color:#0e7490; box-shadow:0 0 0 2px rgba(14,116,144,.15); }
        .btn-primary { background:#0e7490; color:#fff; border-radius:0.5rem; padding:0.55rem 1rem; font-size:0.9rem; font-weight:500; }
        .btn-primary:disabled { opacity:.5; }
        .btn-ghost { border:1px solid #cbd5e1; border-radius:0.5rem; padding:0.55rem 0.9rem; font-size:0.9rem; background:#fff; }
      `}</style>
    </main>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
  const req = field.mandatory ? <span className="text-red-500">*</span> : null;
  const labelRow = (
    <span className="mb-1 flex items-baseline gap-1 text-sm font-medium text-slate-700">
      {field.label} {req}
      {field.nabh && <span className="text-[10px] font-normal text-cyan-700">NABH</span>}
    </span>
  );

  if (field.input_type === "toggle") {
    const on = value === "true";
    return (
      <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className="text-sm text-slate-700">{field.label} {req}</span>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
      </label>
    );
  }
  if (field.input_type === "select") {
    return (
      <label className="block">{labelRow}
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.input_type === "textarea" || field.input_type === "drug_list") {
    return (
      <label className="block">{labelRow}
        <textarea className="inp h-20" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.help_text || ""} />
      </label>
    );
  }
  const htmlType = field.input_type === "number" ? "number" : field.input_type === "date" ? "date" : field.input_type === "time" ? "time" : field.input_type === "datetime" ? "datetime-local" : "text";
  return (
    <label className="block">{labelRow}
      <div className="flex items-center gap-2">
        <input className="inp" type={htmlType} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.help_text || ""} />
        {field.unit && <span className="text-sm text-slate-500">{field.unit}</span>}
      </div>
    </label>
  );
}
