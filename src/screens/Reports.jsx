import { useState } from "react";
import { useData } from "../state/DataContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { ProgressRing } from "../components/Charts.jsx";
import {
  entrySeconds, fmtDuration, fmtHours, startOfWeek, startOfMonth,
} from "../lib/format.js";

export default function Reports() {
  const { entries, projectById } = useData();
  const { profile } = useAuth();
  const [period, setPeriod] = useState("week");

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
  const byProject = {};
  for (const e of inRange) {
    const k = e.project_id || "none";
    byProject[k] = (byProject[k] || 0) + entrySeconds(e);
  }
  const rows = Object.entries(byProject)
    .map(([id, secs]) => {
      const p = id === "none" ? null : projectById(id);
      return { id, name: p?.name || "Senza progetto", color: p?.color || "#cfcfca", secs };
    })
    .sort((a, b) => b.secs - a.secs);
  const max = Math.max(1, ...rows.map((r) => r.secs));

  return (
    <div className="screen">
      <div className="screen-title">Report</div>
      <div className="screen-sub">Le tue ore registrate</div>

      <div className="segment" style={{ marginBottom: 18 }}>
        <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>Settimana</button>
        <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mese</button>
        <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>Tutto</button>
      </div>

      {/* Anello ore vs contratto */}
      {contractedSecs != null && (
        <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
          <ProgressRing value={totalSecs} max={contractedSecs} size={104} color="#27264d" centerTop={Math.round(contractPct) + "%"} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{fmtDuration(totalSecs)}</div>
            <div className="muted" style={{ fontSize: 13 }}>su {fmtDuration(contractedSecs)} da contratto</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {contractPct >= 100 ? "Obiettivo raggiunto 🎯" : `Mancano ${fmtDuration(Math.max(0, contractedSecs - totalSecs))}`}
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

      <div className="section-label">Per progetto</div>
      {rows.length === 0 ? (
        <div className="empty"><div className="empty-emoji">📊</div>Nessuna ora nel periodo scelto.</div>
      ) : (
        <div className="card" style={{ padding: "10px 14px" }}>
          {rows.map((r) => (
            <div key={r.id} className="bar-row">
              <span className="bar-name">{r.name}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.secs / max) * 100}%`, background: r.color }} /></span>
              <span className="bar-val">{fmtDuration(r.secs)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="muted center" style={{ fontSize: 12, marginTop: 18 }}>{fmtHours(totalSecs)} ore in formato decimale</p>
    </div>
  );
}
