import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import ProjectPicker from "../ProjectPicker.jsx";
import { IconChevron } from "../../lib/icons.jsx";
import { fmtDuration, fmtTime, dayKey } from "../../lib/format.js";

// Editor per l'admin: corregge la voce di QUALSIASI persona (scrive diretto al DB).
export default function AdminEntryEditor({ entry, personName, onClose, onSaved }) {
  const { projectById, clientById, toast } = useData();
  const [projectId, setProjectId] = useState(entry.project_id || null);
  const [desc, setDesc] = useState(entry.description || "");
  const [billable, setBillable] = useState(!!entry.billable);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const p = projectById(projectId);
  const client = p?.client_id ? clientById(p.client_id) : null;

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("time_entries")
      .update({ project_id: projectId, description: desc, billable })
      .eq("id", entry.id);
    setBusy(false);
    if (error) {
      toast("Modifica non riuscita: " + error.message, "error");
      return;
    }
    toast("Voce aggiornata.", "ok");
    onSaved?.();
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title="Sistemare la voce">
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>{personName}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {new Date(entry.started_at).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}
          {fmtTime(entry.started_at)}–{entry.stopped_at ? fmtTime(entry.stopped_at) : "…"}
          {" · "}
          {fmtDuration(
            entry.duration_seconds != null
              ? entry.duration_seconds
              : Math.max(0, Math.floor((new Date(entry.stopped_at) - new Date(entry.started_at)) / 1000))
          )}
        </div>
      </div>

      <div className="sheet-row">
        <label className="field-label">Descrizione</label>
        <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrizione" />
      </div>

      <div className="sheet-row">
        <label className="field-label">Progetto e cliente</label>
        <button
          className="field"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}
          onClick={() => setPickerOpen(true)}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {p ? (
              <>
                <span className="entry-dot" style={{ background: p.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}{client ? ` · ${client.name}` : " · senza cliente"}
                </span>
              </>
            ) : (
              <span className="muted">Nessun progetto</span>
            )}
          </span>
          <IconChevron style={{ width: 16, height: 16, color: "#9a9aa3" }} />
        </button>
      </div>

      <div className="sheet-row">
        <button className="list-action card" style={{ width: "100%" }} onClick={() => setBillable((b) => !b)}>
          <span style={{ fontWeight: 600 }}>Fatturabile</span>
          <span style={{ width: 46, height: 28, borderRadius: 999, background: billable ? "#1f9d6b" : "#d9d9d2", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: billable ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </span>
        </button>
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : "Salva modifiche"}
      </button>

      <ProjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={projectId}
        onChange={setProjectId}
      />
    </Sheet>
  );
}
