const NOTE_TYPES = [
  { key: "ot_note", title: "Operative note", blurb: "OT / surgical note (COP)" },
  { key: "discharge_summary", title: "Discharge summary", blurb: "IPD discharge (AAC.14)" },
  { key: "opd_rx", title: "OPD prescription", blurb: "Outpatient Rx (MOM.4)" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <h1 className="text-2xl font-semibold text-clinical">MedNoteGen</h1>
      <p className="mt-1 text-sm text-slate-600">
        Ask the right questions → compose the note. The AI never authors clinical fact.
      </p>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">
        Start a note
      </h2>
      <div className="mt-3 grid gap-3">
        {NOTE_TYPES.map((n) => (
          <div
            key={n.key}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="font-medium">{n.title}</div>
            <div className="text-sm text-slate-500">{n.blurb}</div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-slate-400">
        P1 scaffold — the OT-note flow (start → questions → answer → generate → sign → export)
        is implemented in commits C2–C8. See MEDNOTEGEN-P1-BUILD-PLAN.md.
      </p>
    </main>
  );
}
