import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";
import { useData } from "../state/DataContext.jsx";
import { startOfWeek } from "../lib/format.js";
import { IconEdit } from "../lib/icons.jsx";

function weekStartISO() {
  const d = startOfWeek();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TeamNote() {
  const { isAdmin, user } = useAuth();
  const { toast } = useData();
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const wk = weekStartISO();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("team_notes")
      .select("content")
      .eq("week_start", wk)
      .maybeSingle();
    setContent(data?.content || "");
    setLoaded(true);
  }, [wk]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("team_notes")
      .upsert({ week_start: wk, content: draft.trim(), updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "week_start" });
    setBusy(false);
    if (error) { toast("Salvataggio non riuscito.", "error"); return; }
    setContent(draft.trim());
    setEditing(false);
    toast("Nota aggiornata.", "ok");
  }

  if (!loaded) return null;
  // Se non c'è nota e non sei admin, non mostrare nulla
  if (!content && !isAdmin) return null;

  return (
    <div className="card team-note">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div className="team-note-label">Nota della settimana</div>
        {isAdmin && !editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(content); setEditing(true); }}>
            <IconEdit style={{ width: 14, height: 14 }} /> {content ? "Modifica" : "Aggiungi"}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            className="field"
            style={{ minHeight: 80, resize: "vertical", marginTop: 8 }}
            placeholder="Es. Questa settimana priorità ai contenuti del cliente X…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>
              {busy ? <span className="spinner spinner-white" /> : "Salva"}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Annulla</button>
          </div>
        </>
      ) : content ? (
        <p className="team-note-text">{content}</p>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Nessuna nota per questa settimana.
        </p>
      )}
    </div>
  );
}
