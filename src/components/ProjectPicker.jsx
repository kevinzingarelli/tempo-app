import { useState, useMemo } from "react";
import { useData } from "../state/DataContext.jsx";
import Sheet from "./Sheet.jsx";
import { IconCheck } from "../lib/icons.jsx";

export default function ProjectPicker({ open, onClose, value, onChange }) {
  const { activeProjects, clientById, entries } = useData();
  const [q, setQ] = useState("");

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
          autoFocus
        />
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
