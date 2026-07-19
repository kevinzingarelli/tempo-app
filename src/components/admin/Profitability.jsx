import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import { fmtDuration, entrySeconds } from "../../lib/format.js";
import { personHourlyCost } from "../../lib/cost.js";

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth() { return new Date(new Date().getFullYear(), new Date().getMonth(), 1); }
function startOfYear() { return new Date(new Date().getFullYear(), 0, 1); }

function eur(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function Profitability() {
  const { projectById, clientById, projectRate } = useData();

  const [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState(() => toISODate(startOfMonth()));
  const [toDate, setToDate] = useState(() => toISODate(new Date()));
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [costByUser, setCostByUser] = useState({});   // user_id -> €/h
  const [marginTargets, setMarginTargets] = useState({}); // client_id -> % obiettivo
  const [expanded, setExpanded] = useState(null);

  function setQuickPeriod(p) {
    setPeriod(p);
    const today = new Date();
    if (p === "month") setFromDate(toISODate(startOfMonth()));
    else if (p === "year") setFromDate(toISODate(startOfYear()));
    else if (p === "all") setFromDate("2020-01-01");
    if (p !== "custom") setToDate(toISODate(today));
  }

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(fromDate + "T00:00:00");
    const to = new Date(toDate + "T23:59:59");

    const [{ data: ent }, { data: profs }, { data: costs }, { data: opps }] = await Promise.all([
      supabase.from("time_entries").select("*")
        .not("stopped_at", "is", null)
        .gte("started_at", from.toISOString())
        .lte("started_at", to.toISOString()),
      supabase.from("profiles").select("id, name, cost_rate"),
      supabase.from("staff_cost").select("*"),
      supabase.from("opportunities").select("client_id, margin_target_pct").not("margin_target_pct", "is", null),
    ]);

    // costo orario per persona (staff_cost con fallback su cost_rate)
    const costsByUser = {};
    (costs || []).forEach((c) => {
      (costsByUser[c.user_id] = costsByUser[c.user_id] || []).push(c);
    });
    const rateMap = {};
    (profs || []).forEach((p) => {
      rateMap[p.id] = personHourlyCost(costsByUser[p.id] || [], p);
    });

    setEntries(ent || []);
    setCostByUser(rateMap);
    const targetMap = {};
    (opps || []).forEach((o) => {
      if (o.client_id && o.margin_target_pct != null) {
        // se più opportunità, prendo la soglia più bassa (più prudente)
        targetMap[o.client_id] = targetMap[o.client_id] != null
          ? Math.min(targetMap[o.client_id], o.margin_target_pct)
          : o.margin_target_pct;
      }
    });
    setMarginTargets(targetMap);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="center" style={{ marginTop: 40 }}><span className="spinner" /></div>;
  }

  // ---- Calcolo redditività ----
  // 1) separo ore dirette (cliente) da ore overhead (progetti interni/studio)
  let overheadCost = 0;      // costo totale delle ore interne/studio
  let overheadSecs = 0;
  const byClient = {};       // client_id -> { secs, directCost, revenue, name }
  let totalDirectSecs = 0;

  for (const e of entries) {
    const secs = entrySeconds(e);
    if (secs <= 0) continue;
    const proj = e.project_id ? projectById(e.project_id) : null;
    const rate = costByUser[e.user_id];
    const cost = rate != null ? (secs / 3600) * rate : 0;

    if (proj?.is_overhead) {
      overheadCost += cost;
      overheadSecs += secs;
      continue;
    }

    // ore dirette: raggruppo per cliente
    const cid = proj?.client_id || "none";
    const cname = proj?.client_id ? (clientById(proj.client_id)?.name || "Cliente") : "Senza cliente";
    if (!byClient[cid]) byClient[cid] = { secs: 0, directCost: 0, revenue: 0, name: cname, hasCost: true };
    byClient[cid].secs += secs;
    byClient[cid].directCost += cost;
    if (rate == null) byClient[cid].hasCost = false;

    // ricavo: ore * tariffa oraria del progetto (billable_rate), se billable
    if (e.billable && proj) {
      const pr = projectRate(proj.id);
      if (pr != null) byClient[cid].revenue += (secs / 3600) * pr;
    }
    totalDirectSecs += secs;
  }

  // 2) ribalto l'overhead sui clienti in proporzione alle ORE DIRETTE
  const clientRows = Object.entries(byClient).map(([cid, d]) => {
    const share = totalDirectSecs > 0 ? d.secs / totalDirectSecs : 0;
    const allocatedOverhead = overheadCost * share;
    const totalCost = d.directCost + allocatedOverhead;
    const margin = d.revenue - totalCost;
    const marginPct = d.revenue > 0 ? (margin / d.revenue) * 100 : null;
    return {
      cid, ...d,
      allocatedOverhead,
      totalCost,
      margin,
      marginPct,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const tot = clientRows.reduce((acc, r) => ({
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.totalCost,
    margin: acc.margin + r.margin,
  }), { revenue: 0, cost: 0, margin: 0 });

  const anyMissingCost = clientRows.some((r) => !r.hasCost);

  return (
    <div>
      {/* Periodo */}
      <div className="segment" style={{ marginBottom: 14 }}>
        {[["month", "Mese"], ["year", "Anno"], ["all", "Tutto"]].map(([k, l]) => (
          <button key={k} className={period === k ? "active" : ""} onClick={() => setQuickPeriod(k)}>{l}</button>
        ))}
      </div>

      {/* Riepilogo */}
      <div className="kpi-row" style={{ marginBottom: 14 }}>
        <div className="kpi-card">
          <div className="kpi-label">Ricavi</div>
          <div className="kpi-value">{eur(tot.revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Costi personale</div>
          <div className="kpi-value">{eur(tot.cost)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Margine di commessa</div>
          <div className="kpi-value" style={{ color: tot.margin >= 0 ? "var(--ok)" : "var(--stop)" }}>{eur(tot.margin)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: "11px 13px", marginBottom: 14, background: "var(--surface-2)" }}>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          <b>Margine di commessa</b> = ricavi − costo del personale (diretto + quota di overhead).
          Non è il profitto netto dell'azienda: non include affitto, software, tasse e altri costi generali non allocati.
        </p>
      </div>

      {overheadSecs > 0 && (
        <div className="card" style={{ padding: "11px 13px", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Costo interno / Studio ribaltato</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            {fmtDuration(overheadSecs)} di ore interne ({eur(overheadCost)}) distribuite sui clienti in base alle ore dirette.
          </div>
        </div>
      )}

      {/* Tabella clienti */}
      {clientRows.length === 0 ? (
        <div className="empty" style={{ padding: 30 }}>
          <div className="empty-emoji">📊</div>
          Nessuna ora registrata in questo periodo.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientRows.map((r) => (
            <div key={r.cid} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <button
                className="list-action"
                style={{ width: "100%", textAlign: "left", padding: "13px 14px" }}
                onClick={() => setExpanded(expanded === r.cid ? null : r.cid)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {fmtDuration(r.secs)} · ricavi {eur(r.revenue)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: r.margin >= 0 ? "var(--ok)" : "var(--stop)" }}>{eur(r.margin)}</div>
                  {r.marginPct != null && (
                    <div className="muted" style={{ fontSize: 12 }}>{r.marginPct.toFixed(0)}% margine</div>
                  )}
                  {marginTargets[r.cid] != null && r.marginPct != null && r.marginPct < marginTargets[r.cid] && (
                    <div style={{ fontSize: 11, color: "var(--warn)", fontWeight: 600 }}>⚠️ sotto obiettivo ({marginTargets[r.cid]}%)</div>
                  )}
                </div>
              </button>

              {expanded === r.cid && (
                <div style={{ padding: "0 14px 13px", borderTop: "1px solid var(--line)" }}>
                  <Line label="Ricavi (ore fatturabili × tariffa)" value={eur(r.revenue)} />
                  <Line label="Costo diretto personale" value={"− " + eur(r.directCost)} />
                  <Line label="Quota costi interni/Studio" value={"− " + eur(r.allocatedOverhead)} />
                  <div style={{ borderTop: "1px solid var(--line)", margin: "8px 0" }} />
                  <Line label="Margine di commessa" value={eur(r.margin)} strong colorPos={r.margin >= 0} />
                  {!r.hasCost && (
                    <p className="muted" style={{ fontSize: 11.5, marginTop: 8, color: "var(--warn)" }}>
                      ⚠️ Manca il costo orario di alcune persone: il costo è sottostimato.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {anyMissingCost && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Per calcoli completi, imposta il costo di ogni persona in <b>Persone</b>.
        </p>
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14, textAlign: "center" }}>
        ⚠️ Stima gestionale interna. I dati ufficiali di costo sono quelli del consulente del lavoro.
      </p>
    </div>
  );
}

function Line({ label, value, strong, colorPos }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
      <span className="muted" style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 700 : 400, color: strong ? "var(--ink)" : undefined }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13.5, color: strong ? (colorPos ? "var(--ok)" : "var(--stop)") : undefined }}>{value}</span>
    </div>
  );
}
