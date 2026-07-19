import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../state/AuthContext.jsx";
import { useData } from "../../state/DataContext.jsx";
import { IconCheck } from "../../lib/icons.jsx";
import Sheet from "../Sheet.jsx";

function eur(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function Opportunities() {
  const { user } = useAuth();
  const { clients, addClient, projects, addProject, toast } = useData();

  const [state, setState] = useState({ loading: true, connected: false, deals: [], error: null });
  const [imported, setImported] = useState({});
  const [importOpen, setImportOpen] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  const loadDeals = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/zoho-deals`);
      const data = await res.json();
      setState({ loading: false, connected: !!data.connected, deals: data.deals || [], error: data.error || null });
    } catch (e) {
      setState({ loading: false, connected: false, deals: [], error: null });
    }
  }, []);

  const loadImported = useCallback(async () => {
    const { data } = await supabase.from("opportunities").select("*");
    const m = {};
    (data || []).forEach((o) => (m[o.zoho_deal_id] = o));
    setImported(m);
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);
  useEffect(() => { loadImported(); }, [loadImported]);

  function connect() {
    window.location.href = `/api/zoho-auth?uid=${user.id}`;
  }
  async function disconnect() {
    await fetch("/api/zoho-disconnect", { method: "POST" });
    loadDeals();
  }

  if (state.loading) {
    return <div className="center" style={{ marginTop: 40 }}><span className="spinner" /></div>;
  }

  if (!state.connected) {
    return (
      <div className="card" style={{ padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔗</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Collega Zoho CRM</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Vedi qui le opportunità (Deal) create su Zoho e importale per calcolarne la redditività.
        </p>
        <button className="btn btn-primary" onClick={connect}>Collega Zoho CRM</button>
      </div>
    );
  }

  const deals = state.deals;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setHowOpen(true)}>Come funziona</button>
        <button className="btn btn-ghost btn-sm" onClick={disconnect}>Scollega Zoho</button>
      </div>

      {state.error && <div className="banner banner-warn" style={{ marginBottom: 12 }}>{state.error}</div>}

      {deals.length === 0 ? (
        <div className="empty" style={{ padding: 30 }}>
          <div className="empty-emoji">📋</div>
          Nessuna opportunità trovata su Zoho.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {deals.map((d) => {
            const done = imported[d.id];
            return (
              <div key={d.id} className="card" style={{ padding: "13px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {d.title}
                      {done && <span className="gcal-done-badge"><IconCheck style={{ width: 12, height: 12 }} /> importata</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {d.accountName || "Senza cliente"} {d.stage ? `· ${d.stage}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700 }}>{eur(d.amount)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>+ IVA</div>
                  </div>
                </div>
                {!done && (
                  <button className="btn btn-soft btn-sm" style={{ marginTop: 10 }} onClick={() => setImportOpen(d)}>
                    Importa opportunità
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {importOpen && (
        <ImportSheet
          deal={importOpen}
          clients={clients}
          addClient={addClient}
          addProject={addProject}
          toast={toast}
          onClose={() => setImportOpen(null)}
          onDone={() => { setImportOpen(null); loadImported(); }}
        />
      )}

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="Come funziona">
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          Qui vedi le opportunità (Deal) create su Zoho CRM. Quando importi un'opportunità:
        </p>
        <ul style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 18 }}>
          <li>La colleghi a un cliente Boschetto (esistente o nuovo)</li>
          <li>Puoi creare un progetto/lavoro collegato, con la tariffa già impostata dal valore dell'opportunità</li>
          <li>Il valore economico (imponibile) resta quello di Zoho: qui non lo modifichiamo</li>
          <li>Puoi impostare un margine-obiettivo, per essere avvisato se il lavoro lo sta erodendo</li>
        </ul>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          L'importazione è manuale (tocchi "Importa"): non c'è sincronizzazione automatica in tempo reale.
        </p>
      </Sheet>
    </div>
  );
}

function ImportSheet({ deal, clients, addClient, addProject, toast, onClose, onDone }) {
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState(deal.accountName || "");
  const [createProject, setCreateProject] = useState(true);
  const [projectName, setProjectName] = useState(deal.title);
  const [marginTarget, setMarginTarget] = useState("30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (deal.accountName) {
      const match = clients.find((c) => c.name.trim().toLowerCase() === deal.accountName.trim().toLowerCase());
      if (match) setClientId(match.id);
    }
  }, [deal, clients]);

  async function doImport() {
    setBusy(true);
    try {
      let cid = clientId;
      if (!cid && newClientName.trim()) {
        const c = await addClient(newClientName.trim());
        if (c) cid = c.id;
      }

      let pid = null;
      if (createProject && projectName.trim()) {
        const proj = await addProject({
          name: projectName.trim(),
          color: "#4fae7a",
          billable_default: true,
          client_id: cid || null,
          billable_rate: deal.amount || null,
        });
        pid = proj?.id || null;
      }

      await supabase.from("opportunities").insert({
        zoho_deal_id: deal.id,
        title: deal.title,
        account_name: deal.accountName,
        client_id: cid || null,
        project_id: pid,
        amount: deal.amount,
        currency: deal.currency || "EUR",
        stage: deal.stage,
        closing_date: deal.closingDate || null,
        margin_target_pct: marginTarget ? Number(marginTarget) : null,
      });

      toast("Opportunità importata.", "ok");
      onDone();
    } catch (e) {
      toast("Errore: " + e.message, "error");
    }
    setBusy(false);
  }

  return (
    <Sheet open={true} onClose={onClose} title="Importa opportunità">
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{deal.title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{eur(deal.amount)} + IVA</div>
      </div>

      <div className="sheet-row">
        <label className="field-label">Cliente Boschetto</label>
        <select className="field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli o crea nuovo —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!clientId && (
          <input className="field" style={{ marginTop: 8 }} placeholder="…oppure nome nuovo cliente" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
        )}
      </div>

      <div className="sheet-row">
        <button className="list-action card" style={{ width: "100%" }} onClick={() => setCreateProject((v) => !v)}>
          <span style={{ fontWeight: 600 }}>Crea un progetto/lavoro collegato</span>
          <span style={{ width: 46, height: 28, borderRadius: 999, background: createProject ? "#1f9d6b" : "#d9d9d2", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: createProject ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff" }} />
          </span>
        </button>
        {createProject && (
          <input className="field" style={{ marginTop: 8 }} value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        )}
      </div>

      <div className="sheet-row">
        <label className="field-label">Margine-obiettivo (%) — opzionale</label>
        <input className="field" inputMode="decimal" placeholder="Es. 30" value={marginTarget} onChange={(e) => setMarginTarget(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Se le ore lavorate erodono il margine sotto questa soglia, lo vedrai in Redditività.</p>
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={doImport} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : "Importa"}
      </button>
    </Sheet>
  );
}
