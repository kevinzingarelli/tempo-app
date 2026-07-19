import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../state/AuthContext.jsx";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import { IconChevron } from "../../lib/icons.jsx";
import { hourlyCostFrom, activeCostRecord, DEFAULT_WORKABLE_HOURS_YEAR } from "../../lib/cost.js";

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function Toggle({ on }) {
  return (
    <span style={{ width: 46, height: 28, borderRadius: 999, background: on ? "#1f9d6b" : "#d9d9d2", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </span>
  );
}

function UserForm({ user, me, onClose, onSaved }) {
  const { toast } = useData();
  const [name, setName] = useState(user.name || "");
  const [role, setRole] = useState(user.role || "member");
  const [active, setActive] = useState(user.active !== false);
  const [contract, setContract] = useState(user.contracted_hours_weekly != null ? String(user.contracted_hours_weekly) : "");
  const [leave, setLeave] = useState(user.annual_leave_days != null ? String(user.annual_leave_days) : "");
  const [busy, setBusy] = useState(false);
  const isMe = user.id === me;

  // ---- Costo del personale (staff_cost) ----
  const [costMode, setCostMode] = useState("diretto"); // diretto | componenti
  const [cph, setCph] = useState("");                  // costo per ora (modalità diretto)
  const [gross, setGross] = useState("");              // RAL annua
  const [contribPct, setContribPct] = useState("24");  // % contributi azienda
  const [tfrPct, setTfrPct] = useState("7.4");         // % TFR
  const [otherAnnual, setOtherAnnual] = useState("");  // altri costi annui
  const [workableH, setWorkableH] = useState("");      // ore lavorabili/anno
  const [costLoaded, setCostLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff_cost")
        .select("*")
        .eq("user_id", user.id)
        .order("valid_from", { ascending: false });
      const active = activeCostRecord(data || []);
      if (active) {
        if (active.cost_per_hour != null) {
          setCostMode("diretto");
          setCph(String(active.cost_per_hour));
        } else if (active.annual_gross != null) {
          setCostMode("componenti");
          setGross(String(active.annual_gross));
          setContribPct(active.contrib_pct != null ? String(active.contrib_pct) : "24");
          setTfrPct(active.tfr_pct != null ? String(active.tfr_pct) : "7.4");
          setOtherAnnual(active.other_annual != null ? String(active.other_annual) : "");
          setWorkableH(active.workable_hours_year != null ? String(active.workable_hours_year) : "");
        }
      } else if (user.cost_rate != null) {
        // migrazione morbida dal vecchio campo
        setCostMode("diretto");
        setCph(String(user.cost_rate));
      }
      setCostLoaded(true);
    })();
  }, [user.id, user.cost_rate]);

  // anteprima costo orario calcolato
  const costPreview = (() => {
    if (costMode === "diretto") {
      const v = parseFloat((cph || "").replace(",", "."));
      return Number.isFinite(v) && v > 0 ? v : null;
    }
    const rec = {
      annual_gross: gross, contrib_pct: contribPct, tfr_pct: tfrPct,
      other_annual: otherAnnual, workable_hours_year: workableH,
    };
    const r = hourlyCostFrom({
      annual_gross: parseFloat((gross || "").replace(",", ".")),
      contrib_pct: parseFloat((contribPct || "0").replace(",", ".")),
      tfr_pct: parseFloat((tfrPct || "0").replace(",", ".")),
      other_annual: parseFloat((otherAnnual || "0").replace(",", ".")),
      workable_hours_year: parseFloat((workableH || "0").replace(",", ".")),
    });
    return r ? r.costPerHour : null;
  })();

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      name: name.trim(),
      role,
      active,
      contracted_hours_weekly: contract ? Number(contract.replace(",", ".")) : null,
      annual_leave_days: leave ? Number(leave.replace(",", ".")) : null,
    }).eq("id", user.id);
    if (error) { setBusy(false); toast("Errore: " + error.message, "error"); return; }

    // Salvo/aggiorno il costo del personale come nuovo record datato oggi,
    // solo se è stato inserito qualcosa. Manteniamo lo storico.
    const hasCost = (costMode === "diretto" && cph) ||
                    (costMode === "componenti" && gross);
    if (hasCost) {
      const today = new Date().toISOString().slice(0, 10);
      const row = {
        user_id: user.id,
        valid_from: today,
        cost_per_hour: costMode === "diretto" ? numOrNull(cph) : null,
        annual_gross: costMode === "componenti" ? numOrNull(gross) : null,
        contrib_pct: costMode === "componenti" ? numOrNull(contribPct) : null,
        tfr_pct: costMode === "componenti" ? numOrNull(tfrPct) : null,
        other_annual: costMode === "componenti" ? numOrNull(otherAnnual) : null,
        workable_hours_year: costMode === "componenti" ? numOrNull(workableH) : null,
      };
      // se esiste già un record con valid_from = oggi lo aggiorno, altrimenti inserisco
      const { data: existing } = await supabase
        .from("staff_cost")
        .select("id")
        .eq("user_id", user.id)
        .eq("valid_from", today)
        .maybeSingle();
      if (existing) {
        await supabase.from("staff_cost").update(row).eq("id", existing.id);
      } else {
        await supabase.from("staff_cost").insert(row);
      }
      // aggiorno anche il vecchio campo cost_rate come "costo orario corrente"
      // così i report esistenti continuano a funzionare senza modifiche
      if (costPreview != null) {
        await supabase.from("profiles").update({ cost_rate: Math.round(costPreview * 100) / 100 }).eq("id", user.id);
      }
    }

    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title="Modifica persona">
      <div className="sheet-row">
        <label className="field-label">Nome</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Ruolo</label>
        <div className="segment">
          <button className={role === "member" ? "active" : ""} onClick={() => setRole("member")}>Utente</button>
          <button className={role === "admin" ? "active" : ""} onClick={() => !isMe && setRole("admin")} disabled={isMe}>Admin</button>
        </div>
        {isMe && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Non puoi togliere il ruolo admin a te stesso.</p>}
      </div>

      <div className="sheet-row">
        <label className="field-label">Ore settimanali da contratto</label>
        <input className="field" inputMode="decimal" placeholder="Es. 40" value={contract} onChange={(e) => setContract(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Serve per confrontare le ore fatte con quelle previste.</p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Monte ferie annuo (giorni)</label>
        <input className="field" inputMode="decimal" placeholder="Es. 26" value={leave} onChange={(e) => setLeave(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Giorni di ferie all'anno per questa persona. L'app sottrae quelli approvati e mostra i residui.</p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Costo del personale (stima gestionale interna)</label>
        <div className="segment" style={{ marginBottom: 10 }}>
          <button className={costMode === "diretto" ? "active" : ""} onClick={() => setCostMode("diretto")}>Costo orario</button>
          <button className={costMode === "componenti" ? "active" : ""} onClick={() => setCostMode("componenti")}>Da componenti</button>
        </div>

        {costMode === "diretto" ? (
          <>
            <input className="field" inputMode="decimal" placeholder="Es. 31" value={cph} onChange={(e) => setCph(e.target.value)} />
            <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Costo aziendale di un'ora di lavoro di questa persona (€/ora), se lo conosci già.</p>
          </>
        ) : (
          <>
            <div className="grid-2">
              <div>
                <label className="field-label" style={{ fontSize: 12 }}>RAL annua lorda (€)</label>
                <input className="field" inputMode="decimal" placeholder="Es. 22000" value={gross} onChange={(e) => setGross(e.target.value)} />
              </div>
              <div>
                <label className="field-label" style={{ fontSize: 12 }}>Ore lavorabili/anno</label>
                <input className="field" inputMode="decimal" placeholder={String(DEFAULT_WORKABLE_HOURS_YEAR)} value={workableH} onChange={(e) => setWorkableH(e.target.value)} />
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div>
                <label className="field-label" style={{ fontSize: 12 }}>Contributi azienda (%)</label>
                <input className="field" inputMode="decimal" placeholder="24" value={contribPct} onChange={(e) => setContribPct(e.target.value)} />
              </div>
              <div>
                <label className="field-label" style={{ fontSize: 12 }}>TFR (%)</label>
                <input className="field" inputMode="decimal" placeholder="7.4" value={tfrPct} onChange={(e) => setTfrPct(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label className="field-label" style={{ fontSize: 12 }}>Altri costi annui (€) — assicurazioni, ecc.</label>
              <input className="field" inputMode="decimal" placeholder="Es. 500" value={otherAnnual} onChange={(e) => setOtherAnnual(e.target.value)} />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Se non indichi le ore lavorabili, uso {DEFAULT_WORKABLE_HOURS_YEAR}h/anno come stima prudente.
            </p>
          </>
        )}

        {costPreview != null && (
          <div className="card" style={{ padding: "10px 12px", marginTop: 10, background: "var(--brand-soft)" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>≈ {costPreview.toFixed(2)} €/ora</span>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>costo orario gestionale stimato</span>
          </div>
        )}
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          ⚠️ Stima gestionale interna. Il dato ufficiale è quello del consulente del lavoro.
        </p>
      </div>

      <div className="sheet-row">
        <button className="list-action card" style={{ width: "100%" }} onClick={() => !isMe && setActive((a) => !a)} disabled={isMe}>
          <span style={{ fontWeight: 600 }}>Attivo</span>
          <Toggle on={active} />
        </button>
        {isMe && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Non puoi disattivare te stesso.</p>}
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : "Salva"}
      </button>
    </Sheet>
  );
}

export default function UserManager() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  const load = useCallback(async () => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    const [profRes, offRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, role, active, cost_rate, contracted_hours_weekly, annual_leave_days")
        .order("name"),
      supabase
        .from("time_off")
        .select("user_id, start_date, end_date, status")
        .eq("status", "approved")
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd),
    ]);
    // giorni ferie approvati per persona quest'anno (esclusi sab/dom)
    const usedByUser = {};
    for (const r of offRes.data || []) {
      let d = new Date(r.start_date + "T00:00:00");
      const end = new Date(r.end_date + "T00:00:00");
      let count = 0;
      while (d <= end) {
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) count++;
        d = new Date(d.getTime() + 86400000);
      }
      usedByUser[r.user_id] = (usedByUser[r.user_id] || 0) + count;
    }
    const merged = (profRes.data || []).map((p) => ({ ...p, leaveUsed: usedByUser[p.id] || 0 }));
    setPeople(merged);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="center" style={{ marginTop: 30 }}><span className="spinner" /></div>;

  return (
    <div>
      <button className="btn btn-primary btn-block btn-lg" style={{ marginBottom: 16 }} onClick={() => setHowOpen(true)}>
        Come aggiungere una persona
      </button>

      <div className="card">
        {people.map((p) => (
          <button key={p.id} className="list-action" style={{ width: "100%", textAlign: "left" }} onClick={() => setEditUser(p)}>
            <span>
              <span style={{ fontWeight: 600 }}>{p.name || "Senza nome"}{p.id === user.id ? " (tu)" : ""}</span>
              <span className="muted" style={{ fontSize: 12.5, display: "block" }}>
                {p.role === "admin" ? "Amministratore" : "Utente"}
                {p.contracted_hours_weekly ? ` · ${p.contracted_hours_weekly}h/sett` : ""}
                {p.annual_leave_days != null ? ` · ferie: ${Math.max(0, p.annual_leave_days - p.leaveUsed)}/${p.annual_leave_days} gg` : ""}
                {p.active === false ? " · disattivato" : ""}
              </span>
            </span>
            <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
          </button>
        ))}
      </div>

      {editUser && <UserForm user={editUser} me={user.id} onClose={() => setEditUser(null)} onSaved={load} />}

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="Aggiungere una persona">
        <div className="card" style={{ padding: 16, fontSize: 14, lineHeight: 1.55 }}>
          <p style={{ marginTop: 0 }}>Gli account si creano dal pannello di Supabase (solo tu vi hai accesso):</p>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            <li>Apri il tuo progetto su supabase.com</li>
            <li>Menu <b>Authentication</b> → <b>Users</b> → <b>Add user</b></li>
            <li>Inserisci email e password della persona</li>
            <li>Attiva <b>Auto Confirm User</b></li>
            <li>Torna qui: comparirà nell'elenco. Toccala per impostare nome, ore da contratto e costo.</li>
          </ol>
        </div>
      </Sheet>
    </div>
  );
}
