import { useState } from "react";
import { useData } from "../state/DataContext.jsx";
import WeekView from "../components/WeekView.jsx";
import DayView from "../components/DayView.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { ProgressRing } from "../components/Charts.jsx";
import {
  entrySeconds, fmtDuration, fmtHours, startOfWeek, startOfMonth,
} from "../lib/format.js";

export default function Reports() {
  const { entries, projectById } = useData();
  const { profile } = useAuth();
  const [period, setPeriod] = useState("week");
  const [view, setView] = useState("summary");
  const [groupBy, setGroupBy] = useState("project"); // "project" | "activity"

  const from = period === "week" ? startOfWeek() : period === "month" ? startOfMonth() : new Date(0);
  const inRange = entries.filter((e) => e.stopped_at && new Date(e.started_at) >= from);

  const totalSecs = inRange.reduce((s, e) => s + entrySeconds(e), 0);
  const billableSecs = inRange.filter((e) => e.billable).reduce((s, e) => s + entrySeconds(e), 0);
  const billablePct = totalSecs > 0 ? (billableSecs / totalSecs) * 100 : 0;

  // ore da contratto per il periodo
  const weekly = profile?.contracted_hours_weekly ? Number(profile.contracted_hours_weekly) : null;
  const factor = period === "week" ? 1 : period === "month" ? 4.33 : null;
  const contractedSecs = weekly && factor ? weekly * 3600 * factor : null;
  const contractPct = contractedSecs ? (totalSecs / contractedSecs) * 100 : null;

  // per progetto
  const PALETTE = ["#2f7d4f", "#3b6ef5", "#e5a300", "#ff8a3d", "#e5484d", "#b14bd8", "#0ca6a6", "#d8567a", "#7a7a85"];
  const byProject = {};
  for (const e of inRange) {
    const k = e.project_id || "none";
    byProject[k] = (byProject[k] || 0) + entrySeconds(e);
  }
  // #27264d è il colore di DEFAULT dei progetti nel database: non è mai
  // null, quindi il fallback alla palette non scattava mai e su sfondo
  // scuro le barre sembravano tutte grigie. Lo tratto come "nessun colore
  // personalizzato" così questi progetti prendono i colori della palette.
  const DEFAULT_PROJECT_COLOR = "#27264d";
  const rows = Object.entries(byProject)
    .map(([id, secs]) => {
      const p = id === "none" ? null : projectById(id);
      const custom = p?.color && p.color.toLowerCase() !== DEFAULT_PROJECT_COLOR ? p.color : null;
      return { id, name: p?.name || "Senza progetto", color: custom, secs };
    })
    .sort((a, b) => b.secs - a.secs)
    .map((r, i) => ({ ...r, color: r.color || PALETTE[i % PALETTE.length] }));
  const sumSecs = rows.reduce((a, r) => a + r.secs, 0) || 1;

  // Raggruppamento "per attività": utile per task ripetitivi (es. "Check")
  // fatti su progetti/giorni diversi. Normalizzo la descrizione (minuscolo,
  // senza accenti/spazi doppi) così "Check", "check ", "Check!" finiscono
  // nello stesso gruppo.
  function normDesc(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const byActivity = {};
  for (const e of inRange) {
    const norm = normDesc(e.description) || "(senza descrizione)";
    if (!byActivity[norm]) {
      byActivity[norm] = { key: norm, name: (e.description || "Senza descrizione").trim() || "Senza descrizione", secs: 0, count: 0 };
    }
    byActivity[norm].secs += entrySeconds(e);
    byActivity[norm].count += 1;
  }
  const activityRows = Object.values(byActivity)
    .sort((a, b) => b.secs - a.secs)
    .map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));

  const displayRows = groupBy === "project" ? rows : activityRows;

  return (
    <div className="screen">
      <div className="screen-title">Report</div>
      <div className="screen-sub">Le tue ore registrate</div>

      <div className="segment" style={{ marginBottom: 14 }}>
        <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>Giornata</button>
        <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Settimana</button>
        <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Riepilogo</button>
      </div>

      {view === "day" && <DayView />}
      {view === "week" && <WeekView />}

      {view === "summary" && (
      <>
      <div className="segment" style={{ marginBottom: 18 }}>
        <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>Settimana</button>
        <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mese</button>
        <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>Tutto</button>
      </div>

      {/* Anello ore vs contratto */}
      {contractedSecs != null && (
        <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
          <ProgressRing value={totalSecs} max={contractedSecs} size={104} color="var(--brand)" centerTop={Math.round(contractPct) + "%"} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{fmtDuration(totalSecs)}</div>
            <div className="muted" style={{ fontSize: 13 }}>su {fmtDuration(contractedSecs)} da contratto</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {contractPct >= 100 ? "Ore contrattuali completate" : `Mancano ${fmtDuration(Math.max(0, contractedSecs - totalSecs))}`}
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat"><div className="stat-value">{fmtDuration(totalSecs)}</div><div className="stat-label">Ore totali</div></div>
        <div className="stat"><div className="stat-value">{inRange.length}</div><div className="stat-label">Voci</div></div>
        <div className="stat"><div className="stat-value">{fmtDuration(billableSecs)}</div><div className="stat-label">Fatturabili</div></div>
        <div className="stat"><div className="stat-value">{Math.round(billablePct)}%</div><div className="stat-label">% fatturabile</div></div>
      </div>

      <div className="row-between" style={{ marginBottom: 8, alignItems: "baseline" }}>
        <div className="section-label" style={{ marginBottom: 0 }}>
          {groupBy === "project" ? "Per progetto" : "Per attività"}
        </div>
        <div className="segment" style={{ width: "auto" }}>
          <button className={groupBy === "project" ? "active" : ""} onClick={() => setGroupBy("project")}>Progetto</button>
          <button className={groupBy === "activity" ? "active" : ""} onClick={() => setGroupBy("activity")}>Attività</button>
        </div>
      </div>
      {displayRows.length === 0 ? (
        <div className="empty"><div className="empty-emoji">📊</div>Nessuna ora nel periodo scelto.</div>
      ) : (
        <div className="card" style={{ padding: "10px 14px" }}>
          {displayRows.map((r) => {
            // La barra si riempie in proporzione al PESO sul totale del
            // periodo (v32): 33% del lavoro = barra piena al 33%, col
            // colore del progetto. Colpo d'occhio immediato.
            const pctReal = (r.secs / sumSecs) * 100;
            const pct = Math.round(pctReal);
            return (
              <div key={r.id || r.key} className="bar-row">
                <span className="bar-name">
                  {r.name}
                  {groupBy === "activity" && r.count > 1 && (
                    <span className="muted" style={{ fontWeight: 500 }}> ×{r.count}</span>
                  )}
                </span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${Math.max(1.5, pctReal)}%`, background: r.color }} />
                </span>
                <span className="bar-val">{fmtDuration(r.secs)} · {pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="muted center" style={{ fontSize: 12, marginTop: 18 }}>{fmtHours(totalSecs)} ore in formato decimale</p>
      </>
      )}
    </div>
  );
}
