import { useState, useMemo } from "react";
import { useData } from "../state/DataContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import Sheet from "./Sheet.jsx";
import { IconCheck, IconPlus } from "../lib/icons.jsx";

const QUICK_COLORS = ["#2f7d4f", "#3b6ef5", "#e5a300", "#ff8a3d", "#e5484d", "#b14bd8", "#0ca6a6", "#d8567a"];

export default function ProjectPicker({ open, onClose, value, onChange }) {
  const { activeProjects, clientById, entries, addProject, toast } = useData();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(QUICK_COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function createQuick() {
    if (!newName.trim()) return;
    setBusy(true);
    const created = await addProject({ name: newName.trim(), color: newColor, billable_default: false });
    setBusy(false);
    if (created) {
      toast("Progetto creato.", "ok");
      setCreating(false);
      setNewName("");
      onChange(created.id);
      onClose();
    }
  }

  function pick(id) {
    onChange(id);
    onClose();
  }

  // progetti usati più di recente da questa persona, per proporli in cima
  const recentIds = useMemo(() => {
    const seen = new Map();
    for (const e of entries) {
      if (!e.project_id || seen.has(e.project_id)) continue;
      seen.set(e.project_id, e.started_at);
    }
    return [...seen.entries()]
      .sort((a, b) => new Date(b[1]) - new Date(a[1]))
      .map(([id]) => id)
      .slice(0, 5);
  }, [entries]);

  const query = q.trim().toLowerCase();
  const filtered = activeProjects.filter((p) => {
    if (!query) return true;
    const client = p.client_id ? clientById(p.client_id) : null;
    return (
      p.name.toLowerCase().includes(query) ||
      (client && client.name.toLowerCase().includes(query))
    );
  });

  const recent = !query
    ? recentIds.map((id) => filtered.find((p) => p.id === id)).filter(Boolean)
    : [];
  const recentSet = new Set(recent.map((p) => p.id));
  const rest = filtered.filter((p) => !recentSet.has(p.id));

  function Row(p) {
    const client = p.client_id ? clientById(p.client_id) : null;
    return (
      <button
        key={p.id}
        className="list-action"
        style={{ width: "100%", textAlign: "left" }}
        onClick={() => pick(p.id)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="entry-dot" style={{ background: p.color || "#999", flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </span>
            {client && (
              <span className="muted" style={{ fontSize: 12 }}>{client.name}</span>
            )}
          </span>
        </span>
        {value === p.id && (
          <IconCheck style={{ width: 18, height: 18, color: "var(--brand)", flexShrink: 0 }} />
        )}
      </button>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Scegli progetto">
      {activeProjects.length > 6 && (
        <input
          className="field"
          style={{ marginBottom: 12 }}
          placeholder="Cerca progetto o cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {isAdmin && (
        creating ? (
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <label className="field-label">Nuovo progetto</label>
            <input
              className="field"
              placeholder="Nome del progetto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "10px 0" }}>
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  aria-label="colore"
                  style={{
                    width: 26, height: 26, borderRadius: "50%", background: c,
                    border: newColor === c ? "3px solid var(--ink)" : "2px solid var(--line)",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={createQuick} disabled={busy || !newName.trim()}>
                {busy ? <span className="spinner spinner-white" /> : "Crea e seleziona"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCreating(false)}>
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-soft btn-block" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>
            <IconPlus style={{ width: 16, height: 16 }} /> Nuovo progetto
          </button>
        )
      )}

      <div className="card">
        {!query && (
          <button
            className="list-action"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => pick(null)}
          >
            <span className="muted" style={{ fontWeight: 600 }}>
              Nessun progetto
            </span>
            {!value && <IconCheck style={{ width: 18, height: 18, color: "var(--brand)" }} />}
          </button>
        )}

        {recent.length > 0 && (
          <>
            <div style={{ padding: "9px 14px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
              Usati di recente
            </div>
            {recent.map(Row)}
            <div style={{ padding: "9px 14px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
              Tutti i progetti
            </div>
          </>
        )}

        {rest.map(Row)}

        {filtered.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>
            {query ? `Nessun progetto trovato per "${q}".` : "Nessun progetto. L'amministratore può crearli nella sezione Admin."}
          </div>
        )}
      </div>
    </Sheet>
  );
}
