import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import { IconPlus, IconChevron } from "../../lib/icons.jsx";
import { parseDurationInput, fmtDuration, entrySeconds } from "../../lib/format.js";

const PALETTE = [
  "#27264d", "#3b6ef5", "#1f9d6b", "#e5a300",
  "#ff8a3d", "#e5484d", "#b14bd8", "#0ca6a6",
  "#d8567a", "#6b7280", "#8a5a2b", "#2b8a3e",
];

function Toggle({ on }) {
  return (
    <span style={{ width: 46, height: 28, borderRadius: 999, background: on ? "#1f9d6b" : "#d9d9d2", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </span>
  );
}

function ProjectForm({ project, onClose }) {
  const { addProject, updateProject, projectRate, clients, addClient } = useData();
  const editing = !!project;
  const [name, setName] = useState(project?.name || "");
  const [color, setColor] = useState(project?.color || PALETTE[0]);
  const [billable, setBillable] = useState(project?.billable_default || false);
  const [clientId, setClientId] = useState(project?.client_id || "");
  const [rate, setRate] = useState(() => {
    const r = editing ? projectRate(project.id) : null;
    return r != null ? String(r) : "";
  });
  const [estText, setEstText] = useState(
    project?.estimated_seconds ? fmtDuration(project.estimated_seconds).replace(" ", "") : ""
  );
  const [budgetText, setBudgetText] = useState(
    project?.budget_seconds ? String(Math.round(project.budget_seconds / 3600)) : ""
  );
  const [newClient, setNewClient] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Dai un nome al progetto."); return; }
    setBusy(true);
    let cid = clientId;
    if (newClient.trim()) {
      const c = await addClient(newClient.trim());
      if (c) cid = c.id;
    }
    const est = estText.trim() ? parseDurationInput(estText) : null;
    const budgetH = budgetText.trim() ? Number(budgetText.replace(",", ".")) : null;
    const payload = {
      name: name.trim(),
      color,
      billable_default: billable,
      client_id: cid || null,
      estimated_seconds: est,
      budget_seconds:
        budgetH != null && !Number.isNaN(budgetH) && budgetH > 0
          ? Math.round(budgetH * 3600)
          : null,
      billable_rate: rate === "" ? null : rate.replace(",", "."),
    };
    if (editing) await updateProject(project.id, payload);
    else await addProject(payload);
    setBusy(false);
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title={editing ? "Modifica progetto" : "Nuovo progetto"}>
      <div className="sheet-row">
        <label className="field-label">Nome</label>
        <input className="field" placeholder="Es. Cliente Rossi — sito web" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Cliente (per la redditività)</label>
        <select className="field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Nessun cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input className="field" style={{ marginTop: 8 }} placeholder="…oppure scrivi un nuovo cliente" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Colore</label>
        <div className="chips">
          {PALETTE.map((c) => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: "50%", background: c, border: color === c ? "3px solid #16161d" : "3px solid transparent", boxShadow: "0 0 0 1px rgba(0,0,0,.08)" }} aria-label={c} />
          ))}
        </div>
      </div>

      <div className="sheet-row">
        <button className="list-action card" style={{ width: "100%" }} onClick={() => setBillable((b) => !b)}>
          <span style={{ fontWeight: 600 }}>Fatturabile di default</span>
          <Toggle on={billable} />
        </button>
      </div>

      <div className="sheet-row">
        <label className="field-label">Tariffa cliente (€/ora) — opzionale</label>
        <input className="field" inputMode="decimal" placeholder="Es. 50" value={rate} onChange={(e) => setRate(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Quanto fatturi al cliente per ogni ora. Serve per ricavi e margine. Non visibile ai dipendenti.</p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Budget ore totale — opzionale</label>
        <input className="field" inputMode="decimal" placeholder="Es. 120" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Il monte-ore massimo previsto per l'intero progetto. In Dashboard vedi quanto ne è stato usato.</p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Durata attesa del lavoro — opzionale</label>
        <input className="field" placeholder="Es. 4h, 1:30, 0:45" value={estText} autoCapitalize="none" onChange={(e) => setEstText(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Quanto dovrebbe durare di solito. Serve a segnalare quando ci si mette molto di più o di meno, finché non c'è abbastanza storico.</p>
      </div>

      {err && <div className="banner banner-warn">{err}</div>}

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : editing ? "Salva" : "Crea progetto"}
      </button>

      {editing && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={async () => { await updateProject(project.id, { archived: !project.archived }); onClose(); }}>
          {project.archived ? "Ripristina progetto" : "Archivia progetto"}
        </button>
      )}
    </Sheet>
  );
}

export default function ProjectManager() {
  const { projects, projectRate, clientById } = useData();
  const [formProject, setFormProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [totals, setTotals] = useState({}); // project_id -> { secs, users:Set }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("project_id, user_id, duration_seconds, started_at, stopped_at")
        .not("stopped_at", "is", null);
      const m = {};
      (data || []).forEach((e) => {
        const k = e.project_id || "none";
        if (!m[k]) m[k] = { secs: 0, users: new Set() };
        m[k].secs += entrySeconds(e);
        m[k].users.add(e.user_id);
      });
      setTotals(m);
    })();
  }, []);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  function line(p) {
    const rate = projectRate(p.id);
    const client = p.client_id ? clientById(p.client_id) : null;
    const t = totals[p.id];
    const bits = [];
    if (client) bits.push(client.name);
    if (t && t.secs > 0) bits.push(fmtDuration(t.secs));
    if (t && t.users.size > 0)
      bits.push(t.users.size === 1 ? "1 persona" : `${t.users.size} persone`);
    if (rate != null) bits.push(`€ ${rate}/h`);
    return bits.join(" · ");
  }

  return (
    <div>
      <button className="btn btn-primary btn-block btn-lg" style={{ marginBottom: 16 }} onClick={() => setCreating(true)}>
        <IconPlus style={{ width: 18, height: 18 }} /> Nuovo progetto
      </button>

      {active.length === 0 && (
        <div className="empty"><div className="empty-emoji">📁</div>Nessun progetto. Creane uno per organizzare le ore.</div>
      )}

      {active.length > 0 && (
        <div className="card">
          {active.map((p) => (
            <button key={p.id} className="list-action" style={{ width: "100%", textAlign: "left" }} onClick={() => setFormProject(p)}>
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span className="entry-dot" style={{ background: p.color }} />
                <span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {line(p) && <span className="muted" style={{ fontSize: 12.5, display: "block" }}>{line(p)}</span>}
                </span>
              </span>
              <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
            </button>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <div className="section-label">Archiviati</div>
          <div className="card">
            {archived.map((p) => (
              <button key={p.id} className="list-action" style={{ width: "100%", textAlign: "left", opacity: 0.6 }} onClick={() => setFormProject(p)}>
                <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span className="entry-dot" style={{ background: p.color }} />
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                </span>
                <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
              </button>
            ))}
          </div>
        </>
      )}

      {creating && <ProjectForm onClose={() => setCreating(false)} />}
      {formProject && <ProjectForm project={formProject} onClose={() => setFormProject(null)} />}
    </div>
  );
}
