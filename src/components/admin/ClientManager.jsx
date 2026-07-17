import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import { IconPlus, IconChevron } from "../../lib/icons.jsx";
import { fmtDuration, entrySeconds } from "../../lib/format.js";

function ClientForm({ client, onClose }) {
  const { addClient, updateClient, deleteClient, projects } = useData();
  const editing = !!client;
  const [name, setName] = useState(client?.name || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const nProjects = editing
    ? projects.filter((p) => p.client_id === client.id).length
    : 0;

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    if (editing) await updateClient(client.id, name.trim());
    else await addClient(name.trim());
    setBusy(false);
    onClose();
  }

  async function remove() {
    setBusy(true);
    await deleteClient(client.id);
    setBusy(false);
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title={editing ? "Modifica cliente" : "Nuovo cliente"}>
      <div className="sheet-row">
        <label className="field-label">Nome</label>
        <input
          className="field"
          placeholder="Es. Rossi S.r.l."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy || !name.trim()}>
        {busy ? <span className="spinner spinner-white" /> : editing ? "Salva" : "Crea cliente"}
      </button>

      {editing && !confirmDel && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 10, color: "var(--stop)" }} onClick={() => setConfirmDel(true)}>
          Elimina cliente
        </button>
      )}
      {editing && confirmDel && (
        <div className="banner banner-warn" style={{ marginTop: 12 }}>
          {nProjects > 0
            ? `${nProjects} ${nProjects === 1 ? "progetto resterà" : "progetti resteranno"} senza cliente (le ore NON si perdono).`
            : "Nessun progetto collegato."}{" "}
          Confermi?
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={remove} disabled={busy}>
              Sì, elimina
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDel(false)}>
              Annulla
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function ClientManager() {
  const { clients, projects } = useData();
  const [totals, setTotals] = useState({}); // project_id -> secs
  const [open, setOpen] = useState({});
  const [formClient, setFormClient] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("project_id, duration_seconds, started_at, stopped_at")
      .not("stopped_at", "is", null);
    const m = {};
    (data || []).forEach((e) => {
      const k = e.project_id || "none";
      m[k] = (m[k] || 0) + entrySeconds(e);
    });
    setTotals(m);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = clients.map((c) => {
    const projs = projects.filter((p) => p.client_id === c.id);
    const secs = projs.reduce((s, p) => s + (totals[p.id] || 0), 0);
    return { client: c, projs, secs };
  });

  const orphan = projects.filter((p) => !p.client_id);
  const orphanSecs = orphan.reduce((s, p) => s + (totals[p.id] || 0), 0);

  return (
    <div>
      <button className="btn btn-primary btn-block btn-lg" style={{ marginBottom: 16 }} onClick={() => setCreating(true)}>
        <IconPlus style={{ width: 18, height: 18 }} /> Nuovo cliente
      </button>

      {rows.length === 0 && (
        <div className="empty">
          <div className="empty-emoji">🤝</div>
          Nessun cliente. Creane uno e collegalo ai progetti per vedere redditività e fatturazione.
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          {rows.map(({ client, projs, secs }) => {
            const isOpen = open[client.id];
            return (
              <div key={client.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="list-action" style={{ borderBottom: "none" }}>
                  <button
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, textAlign: "left", minWidth: 0 }}
                    onClick={() => setOpen((o) => ({ ...o, [client.id]: !o[client.id] }))}
                  >
                    <IconChevron
                      style={{
                        width: 16, height: 16, color: "#9a9aa3", flexShrink: 0,
                        transform: isOpen ? "rotate(90deg)" : "none",
                        transition: "transform .2s",
                      }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {client.name}
                      </span>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {projs.length} {projs.length === 1 ? "progetto" : "progetti"} · {fmtDuration(secs)}
                      </span>
                    </span>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFormClient(client)}>
                    Modifica
                  </button>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 14px 10px 40px" }}>
                    {projs.length === 0 ? (
                      <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
                        Nessun progetto collegato.
                      </p>
                    ) : (
                      projs.map((p) => (
                        <div key={p.id} className="row-between" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14 }}>
                            <span className="entry-dot" style={{ background: p.color }} />
                            {p.name}
                            {p.archived && <span className="muted" style={{ fontSize: 11.5 }}>(archiviato)</span>}
                          </span>
                          <span className="entry-dur" style={{ fontSize: 13.5 }}>
                            {fmtDuration(totals[p.id] || 0)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {orphan.length > 0 && (
        <>
          <div className="section-label">Senza cliente</div>
          <div className="card">
            <div className="list-action">
              <span>
                <span style={{ fontWeight: 600 }}>{orphan.length} {orphan.length === 1 ? "progetto" : "progetti"}</span>
                <span className="muted" style={{ fontSize: 12.5, display: "block" }}>
                  Collegali dalla scheda Progetti per la redditività
                </span>
              </span>
              <span className="entry-dur">{fmtDuration(orphanSecs)}</span>
            </div>
          </div>
        </>
      )}

      {creating && <ClientForm onClose={() => setCreating(false)} />}
      {formClient && <ClientForm client={formClient} onClose={() => setFormClient(null)} />}
    </div>
  );
}
