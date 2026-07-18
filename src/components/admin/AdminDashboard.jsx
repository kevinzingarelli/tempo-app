import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import { ProgressRing, Donut, MiniBars, HBar, LineChart } from "../Charts.jsx";
import {
  entrySeconds, fmtDuration, startOfWeek, startOfMonth, dayKey,
} from "../../lib/format.js";
import { buildTaskStats, findAnomaliesMAD, fmtPct } from "../../lib/stats.js";

const PALETTE = ["#27264d", "#3b6ef5", "#1f9d6b", "#e5a300", "#ff8a3d", "#e5484d", "#b14bd8", "#0ca6a6"];

function eur(n) {
  return "€ " + Math.round(n).toLocaleString("it-IT");
}
function hoursOf(secs) {
  return secs / 3600;
}
function fmtH(secs) {
  return (secs / 3600).toFixed(1).replace(".", ",") + " h";
}
function periodLabel(period, from) {
  const today = new Date();
  if (period === "week") return "Settimana corrente";
  if (period === "month") return today.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return "Da sempre — al " + today.toLocaleDateString("it-IT");
}

function openInvoicePDF(companyName, client, period, from) {
  const rows = Object.entries(client.byProj || {})
    .sort((a, b) => b[1].rev - a[1].rev)
    .map(
      ([name, v]) =>
        `<tr><td>${name}</td><td class="r">${fmtH(v.secs)}</td><td class="r">${eur(v.rev)}</td></tr>`
    )
    .join("");
  const html = `
<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Fatturazione — ${client.name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a22; padding: 48px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #77777f; font-size: 13px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { text-align: left; padding: 9px 6px; border-bottom: 1px solid #e6e6ea; font-size: 13.5px; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #9a9aa3; }
  td.r, th.r { text-align: right; }
  tfoot td { font-weight: 700; font-size: 15px; border-bottom: none; border-top: 2px solid #1a1a22; padding-top: 12px; }
  .foot { margin-top: 40px; font-size: 11.5px; color: #9a9aa3; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>${companyName}</h1>
  <div class="sub">Fatturazione — ${client.name} · ${periodLabel(period, from)}</div>
  <table>
    <thead><tr><th>Progetto</th><th class="r">Ore fatturabili</th><th class="r">Importo</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Totale</td><td class="r">${fmtH(client.billSecs)}</td><td class="r">${eur(client.rev)}</td></tr></tfoot>
  </table>
  <div class="foot">Generato da Boschetto il ${new Date().toLocaleDateString("it-IT")}. Documento riepilogativo, non fiscale.</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export default function AdminDashboard() {
  const { projectById, projectRate, clientById, projects } = useData();
  const [period, setPeriod] = useState("week");
  const [entries, setEntries] = useState([]);
  const [weekEntries, setWeekEntries] = useState([]);
  const [people, setPeople] = useState({});
  const [budgetUsed, setBudgetUsed] = useState({}); // project_id -> secs totali
  const [loading, setLoading] = useState(true);

  const from = period === "week" ? startOfWeek() : period === "month" ? startOfMonth() : new Date(0);

  const load = useCallback(async () => {
    setLoading(true);
    const eightWeeks = new Date();
    eightWeeks.setDate(eightWeeks.getDate() - 56);

    const [{ data: profs }, { data: ent }, { data: wk }] = await Promise.all([
      supabase.from("profiles").select("id, name, cost_rate, contracted_hours_weekly, active"),
      supabase.from("time_entries").select("*").not("stopped_at", "is", null).gte("started_at", from.toISOString()),
      supabase.from("time_entries").select("*").not("stopped_at", "is", null).gte("started_at", eightWeeks.toISOString()),
    ]);
    const map = {};
    (profs || []).forEach((p) => (map[p.id] = p));
    setPeople(map);
    setEntries(ent || []);
    setWeekEntries(wk || []);

    // ore totali (da sempre) per i progetti con budget
    const budgetIds = projects.filter((p) => p.budget_seconds).map((p) => p.id);
    if (budgetIds.length) {
      const { data: bent } = await supabase
        .from("time_entries")
        .select("project_id, duration_seconds, started_at, stopped_at")
        .in("project_id", budgetIds)
        .not("stopped_at", "is", null);
      const bu = {};
      (bent || []).forEach((e) => {
        bu[e.project_id] = (bu[e.project_id] || 0) + entrySeconds(e);
      });
      setBudgetUsed(bu);
    }
    setLoading(false);
  }, [from, projects]);

  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="center" style={{ marginTop: 40 }}><span className="spinner" /></div>;

  // ---- calcoli economici ----
  let revenue = 0, cost = 0, totalSecs = 0, billableSecs = 0;
  const byProject = {}, byClient = {}, byPerson = {};

  for (const e of entries) {
    const secs = entrySeconds(e);
    totalSecs += secs;
    const h = hoursOf(secs);
    const person = people[e.user_id];
    const cr = person?.cost_rate ? Number(person.cost_rate) : 0;
    const entryCost = h * cr;
    cost += entryCost;

    const rate = projectRate(e.project_id);
    let entryRev = 0;
    if (e.billable && rate != null) { entryRev = h * Number(rate); revenue += entryRev; }
    if (e.billable) billableSecs += secs;

    // per progetto
    const pk = e.project_id || "none";
    if (!byProject[pk]) byProject[pk] = { secs: 0, rev: 0, cost: 0 };
    byProject[pk].secs += secs; byProject[pk].rev += entryRev; byProject[pk].cost += entryCost;

    // per cliente
    const proj = projectById(e.project_id);
    const ck = proj?.client_id || "none";
    if (!byClient[ck]) byClient[ck] = { secs: 0, rev: 0, cost: 0, billSecs: 0, byProj: {} };
    byClient[ck].secs += secs; byClient[ck].rev += entryRev; byClient[ck].cost += entryCost;
    if (e.billable) byClient[ck].billSecs += secs;
    if (e.billable) {
      const pn = proj?.name || "Senza progetto";
      if (!byClient[ck].byProj[pn]) byClient[ck].byProj[pn] = { secs: 0, rev: 0 };
      byClient[ck].byProj[pn].secs += secs;
      byClient[ck].byProj[pn].rev += entryRev;
    }

    // per persona
    if (!byPerson[e.user_id]) byPerson[e.user_id] = 0;
    byPerson[e.user_id] += secs;
  }

  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  const billablePct = totalSecs > 0 ? (billableSecs / totalSecs) * 100 : 0;

  // ore vs contratto (per il periodo)
  const activePeople = Object.values(people).filter((p) => p.active !== false);
  const weeksInPeriod = period === "week" ? 1 : period === "month" ? 4.33 : null;
  let contractedSecs = null;
  if (weeksInPeriod != null) {
    contractedSecs = activePeople.reduce(
      (s, p) => s + (p.contracted_hours_weekly ? Number(p.contracted_hours_weekly) * 3600 * weeksInPeriod : 0), 0
    );
  }
  const contractPct = contractedSecs ? (totalSecs / contractedSecs) * 100 : null;

  // anomalie (sull'insieme del periodo)
  const taskStats = buildTaskStats(entries, projectById);
  const anomalies = findAnomaliesMAD(taskStats);

  // produttività: ore per persona
  const personRows = Object.entries(byPerson)
    .map(([id, secs]) => ({ id, name: people[id]?.name || "—", secs }))
    .sort((a, b) => b.secs - a.secs);
  const maxPerson = Math.max(1, ...personRows.map((r) => r.secs));
  const avgSecs = personRows.length ? totalSecs / personRows.length : 0;

  // tendenza ultime 8 settimane (team)
  const weekBuckets = [];
  for (let i = 7; i >= 0; i--) {
    const start = startOfWeek(new Date(Date.now() - i * 7 * 86400000));
    const end = new Date(start.getTime() + 7 * 86400000);
    let s = 0;
    for (const e of weekEntries) {
      const d = new Date(e.started_at);
      if (d >= start && d < end) s += entrySeconds(e);
    }
    weekBuckets.push({
      label: start.toLocaleDateString("it-IT", { day: "numeric", month: "numeric" }),
      value: +hoursOf(s).toFixed(1),
      highlight: i === 0,
    });
  }

  // redditività per cliente
  const clientRows = Object.entries(byClient)
    .map(([id, v]) => {
      const c = id === "none" ? null : clientById(id);
      const pr = v.rev - v.cost;
      return { id, name: c?.name || "Senza cliente", ...v, profit: pr, margin: v.rev > 0 ? (pr / v.rev) * 100 : null };
    })
    .sort((a, b) => b.rev - a.rev);

  // fatturazione per cliente (solo fatturabile)
  const billRows = clientRows.filter((r) => r.billSecs > 0);
  const totalToInvoice = billRows.reduce((s, r) => s + r.rev, 0);

  // Torta ore per progetto (top 6 + "Altri")
  const PIE_COLORS = ["#2f7d4f", "#3b6ef5", "#e5a300", "#ff8a3d", "#e5484d", "#b14bd8", "#6b7280"];
  const projRowsSorted = Object.entries(byProject)
    .map(([id, v]) => ({ id, name: id === "none" ? "Senza progetto" : (projectById(id)?.name || "—"), secs: v.secs, color: id !== "none" ? projectById(id)?.color : "#9aa0a6" }))
    .sort((a, b) => b.secs - a.secs);
  const pieTop = projRowsSorted.slice(0, 6);
  const pieOthers = projRowsSorted.slice(6).reduce((s, r) => s + r.secs, 0);
  const pieSegments = [
    ...pieTop.map((r, i) => ({ value: r.secs, color: r.color || PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    ...(pieOthers > 0 ? [{ value: pieOthers, color: "#c4c8cc", name: "Altri" }] : []),
  ];

  // Fatturabile vs non
  const nonBillableSecs = totalSecs - billableSecs;

  const marginColor = margin == null ? "var(--ink)" : margin >= 30 ? "var(--ok)" : margin >= 15 ? "var(--warn)" : "var(--stop)";

  return (
    <div>
      <div className="segment" style={{ marginBottom: 16 }}>
        <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>Settimana</button>
        <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mese</button>
        <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>Tutto</button>
      </div>

      {/* KPI principali */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{fmtDuration(totalSecs)}</div>
          <div className="stat-label">Ore team</div>
        </div>
        <div className="stat">
          <div className="stat-value">{eur(totalToInvoice)}</div>
          <div className="stat-label">Da fatturare</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: marginColor }}>{margin == null ? "—" : fmtPct(margin)}</div>
          <div className="stat-label">Margine · {eur(profit)}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{Math.round(billablePct)}%</div>
          <div className="stat-label">Fatturabile</div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="banner banner-warn" style={{ marginTop: 4 }}>
          ⚠️ {anomalies.length} {anomalies.length === 1 ? "voce anomala" : "voci anomale"} nel periodo — controlla la scheda “Attività”.
        </div>
      )}

      {/* Ore vs contratto */}
      {contractPct != null && (
        <>
          <div className="section-label">Ore fatte vs contratto</div>
          <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18 }}>
            <ProgressRing
              value={totalSecs}
              max={contractedSecs}
              size={104}
              color="var(--brand)"
              centerTop={contractPct != null ? Math.round(contractPct) + "%" : "—"}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{fmtDuration(totalSecs)}</div>
              <div className="muted" style={{ fontSize: 13 }}>su {fmtDuration(contractedSecs)} previste</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{activePeople.length} persone attive · {period === "week" ? "questa settimana" : "questo mese"}</div>
            </div>
          </div>
        </>
      )}

      {/* Produttività */}
      <div className="section-label">Produttività — ore per persona</div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-value">{fmtDuration(avgSecs)}</div><div className="stat-label">Media a persona</div></div>
        <div className="stat"><div className="stat-value">{personRows.length}</div><div className="stat-label">Persone attive</div></div>
      </div>
      {personRows.length === 0 ? (
        <div className="empty">Nessuna ora nel periodo.</div>
      ) : (
        <div className="card" style={{ padding: "10px 14px" }}>
          {personRows.map((r, i) => (
            <HBar key={r.id} label={r.name} value={r.secs} max={maxPerson} color={PALETTE[i % PALETTE.length]} valueLabel={fmtDuration(r.secs)} />
          ))}
        </div>
      )}

      {/* Tendenza a linea */}
      <div className="section-label">Andamento — ultime 8 settimane</div>
      <div className="card" style={{ padding: "16px 14px 10px" }}>
        <LineChart
          points={weekBuckets.map((b) => b.value)}
          labels={weekBuckets.map((b) => b.label)}
          color="var(--brand)"
          height={150}
        />
      </div>

      {/* Torta ore per progetto */}
      {pieSegments.length > 0 && totalSecs > 0 && (
        <>
          <div className="section-label">Ripartizione ore per progetto</div>
          <div className="card admin-wide" style={{ padding: 18, alignItems: "center", gap: 20 }}>
            <div style={{ display: "grid", placeItems: "center" }}>
              <Donut segments={pieSegments} size={150} stroke={22} centerTop={fmtDuration(totalSecs)} centerBottom="totali" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pieSegments.map((s, i) => (
                <div key={i} className="row-between" style={{ fontSize: 13.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span className="entry-dot" style={{ background: s.color }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  </span>
                  <span className="muted" style={{ flexShrink: 0 }}>
                    {fmtDuration(s.value)} · {Math.round((s.value / totalSecs) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Fatturabile vs non fatturabile */}
      {totalSecs > 0 && (
        <>
          <div className="section-label">Ore fatturabili vs non fatturabili</div>
          <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 20 }}>
            <Donut
              segments={[
                { value: billableSecs, color: "var(--ok)" },
                { value: nonBillableSecs, color: "#c4c8cc" },
              ]}
              size={130}
              stroke={20}
              centerTop={`${Math.round(billablePct)}%`}
              centerBottom="fatturabile"
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row-between" style={{ fontSize: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className="entry-dot" style={{ background: "var(--ok)" }} /> Fatturabili
                </span>
                <span className="entry-dur">{fmtDuration(billableSecs)}</span>
              </div>
              <div className="row-between" style={{ fontSize: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className="entry-dot" style={{ background: "#c4c8cc" }} /> Non fatturabili
                </span>
                <span className="entry-dur">{fmtDuration(nonBillableSecs)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Redditività per cliente */}
      <div className="section-label">Redditività per cliente</div>
      {clientRows.length === 0 || clientRows.every((r) => r.rev === 0 && r.cost === 0) ? (
        <div className="card" style={{ padding: 16 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Per vedere ricavi e margini, imposta la <b>tariffa cliente</b> nei progetti e il <b>costo orario</b> delle persone.
          </p>
        </div>
      ) : (
        <div className="card">
          {clientRows.map((r) => (
            <div key={r.id} className="list-action" style={{ display: "block" }}>
              <div className="row-between">
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span className="entry-dur" style={{ color: r.margin == null ? "var(--ink)" : r.margin >= 30 ? "var(--ok)" : r.margin >= 15 ? "var(--warn)" : "var(--stop)" }}>
                  {r.margin == null ? "—" : fmtPct(r.margin)}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                Ricavo {eur(r.rev)} · Costo {eur(r.cost)} · Utile {eur(r.profit)} · {fmtDuration(r.secs)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fatturazione */}
      <div className="section-label">Da fatturare per cliente</div>
      {billRows.length === 0 ? (
        <div className="empty">Nessuna ora fatturabile nel periodo.</div>
      ) : (
        <div className="card">
          {billRows.map((r) => (
            <div key={r.id} className="list-action">
              <span>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span className="muted" style={{ fontSize: 12.5, display: "block" }}>{fmtDuration(r.billSecs)} fatturabili</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span className="entry-dur">{eur(r.rev)}</span>
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => openInvoicePDF("Kesia", r, period, from)}
                >
                  PDF
                </button>
              </span>
            </div>
          ))}
          <div className="list-action" style={{ background: "rgba(39,38,77,0.04)" }}>
            <span style={{ fontWeight: 700 }}>Totale</span>
            <span className="entry-dur" style={{ fontWeight: 700 }}>{eur(totalToInvoice)}</span>
          </div>
        </div>
      )}

      {/* Copertura settimanale */}
      {(() => {
        const wkStart = startOfWeek();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = yesterday.toDateString();
        const perPerson = {};
        const yesterdaySet = new Set();
        for (const e of weekEntries) {
          const d = new Date(e.started_at);
          if (d >= wkStart) {
            perPerson[e.user_id] = (perPerson[e.user_id] || 0) + entrySeconds(e);
          }
          if (d.toDateString() === yKey) yesterdaySet.add(e.user_id);
        }
        const rows2 = activePeople
          .map((p) => {
            const secs = perPerson[p.id] || 0;
            const target = p.contracted_hours_weekly
              ? Number(p.contracted_hours_weekly) * 3600
              : null;
            return {
              id: p.id,
              name: p.name || "—",
              secs,
              target,
              pct: target ? (secs / target) * 100 : null,
              missedYesterday: !yesterdaySet.has(p.id) && yesterday.getDay() !== 0 && yesterday.getDay() !== 6,
            };
          })
          .sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999));
        if (rows2.length === 0) return null;
        return (
          <>
            <div className="section-label">Copertura — questa settimana</div>
            <div className="card">
              {rows2.map((r) => (
                <div key={r.id} className="cover-row">
                  <span className="cover-name">{r.name}</span>
                  {r.missedYesterday && <span className="cover-badge">0 ieri</span>}
                  <span style={{ width: 130, flexShrink: 0 }}>
                    <span className="budget-bar" style={{ marginTop: 0 }}>
                      <span
                        className={"budget-fill" + (r.pct != null && r.pct < 50 ? " over" : "")}
                        style={{ width: `${Math.min(100, r.pct ?? 0)}%`, background: r.pct == null ? "var(--line-strong)" : undefined }}
                      />
                    </span>
                  </span>
                  <span className="entry-dur" style={{ fontSize: 13, width: 84, textAlign: "right" }}>
                    {fmtDuration(r.secs)}{r.target ? ` / ${Math.round(r.target / 3600)}h` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* Budget progetti */}
      {(() => {
        const withBudget = projects.filter((p) => p.budget_seconds && !p.archived);
        if (withBudget.length === 0) return null;
        return (
          <>
            <div className="section-label">Budget ore per progetto</div>
            <div className="card">
              {withBudget.map((p) => {
                const used = budgetUsed[p.id] || 0;
                const pct = (used / p.budget_seconds) * 100;
                return (
                  <div key={p.id} className="list-action" style={{ display: "block" }}>
                    <div className="row-between">
                      <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600 }}>
                        <span className="entry-dot" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="entry-dur" style={{ color: pct > 100 ? "var(--stop)" : pct > 85 ? "var(--warn)" : "var(--ink)" }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <div className="budget-bar">
                      <div className={"budget-fill" + (pct > 100 ? " over" : "")} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                      {fmtDuration(used)} su {fmtDuration(p.budget_seconds)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <p className="muted center" style={{ fontSize: 11.5, marginTop: 18 }}>
        Il dettaglio voce per voce e l'export CSV sono nella scheda “Report”.
      </p>
    </div>
  );
}
