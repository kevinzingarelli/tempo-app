import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";
import { useData } from "../state/DataContext.jsx";
import { MiniBars, ProgressRing } from "../components/Charts.jsx";
import { fmtDuration, startOfWeek, entrySeconds } from "../lib/format.js";
import {
  monthComparison, personalRecords, speedTrends, byMonth,
  monthLabel, fmtPct,
} from "../lib/stats.js";

function DeltaPill({ pct, invert = false }) {
  if (pct == null) return null;
  const good = invert ? pct < 0 : pct > 0;
  const flat = Math.abs(pct) < 1;
  const cls = flat ? "delta-flat" : good ? "delta-up" : "delta-down";
  const arrow = flat ? "→" : pct > 0 ? "↑" : "↓";
  return (
    <span className={"delta-pill " + cls}>
      {arrow} {fmtPct(Math.abs(pct) < 1 ? 0 : pct)}
    </span>
  );
}

export default function PersonalStats() {
  const { user, profile } = useAuth();
  const { projectById } = useData();
  const [entries, setEntries] = useState(null);

  const load = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", user.id)
      .not("stopped_at", "is", null)
      .gte("started_at", since.toISOString());
    setEntries(data || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (entries === null) {
    return (
      <div className="screen">
        <div className="center" style={{ marginTop: 60 }}><span className="spinner" /></div>
      </div>
    );
  }

  const firstName = (profile?.name || "").split(" ")[0];

  if (entries.length === 0) {
    return (
      <div className="screen">
        <div className="screen-title">Per te{firstName ? ", " + firstName : ""}</div>
        <div className="screen-sub">I tuoi progressi, solo per i tuoi occhi</div>
        <div className="empty">
          <div className="empty-emoji">🌱</div>
          Qui vedrai i tuoi progressi personali: quanto lavori, quanto sei costante,
          i tuoi record. Inizia a registrare qualche ora e torna a trovarci.
        </div>
      </div>
    );
  }

  const cmp = monthComparison(entries);
  const rec = personalRecords(entries);
  const speed = speedTrends(entries, projectById);
  const months = byMonth(entries).slice(-6);
  const nowMonthKey = months.length ? months[months.length - 1].key : null;

  const bars = months.map((m) => ({
    label: monthLabel(m.key).slice(0, 3),
    value: +(m.secs / 3600).toFixed(1),
    highlight: m.key === nowMonthKey,
  }));

  // obiettivo settimanale personale
  const goalH = profile?.weekly_goal_hours ? Number(profile.weekly_goal_hours) : null;
  const wkStart = startOfWeek();
  const weekSecs = entries
    .filter((e) => new Date(e.started_at) >= wkStart)
    .reduce((s, e) => s + entrySeconds(e), 0);
  const goalPct = goalH ? (weekSecs / (goalH * 3600)) * 100 : null;

  const improving = speed.filter((s) => s.pct <= -5).slice(0, 3);
  const slower = speed.filter((s) => s.pct >= 15).slice(0, 2);

  const monthName = new Date().toLocaleDateString("it-IT", { month: "long" });

  return (
    <div className="screen">
      <div className="screen-title">Per te{firstName ? ", " + firstName : ""}</div>
      <div className="screen-sub">I tuoi progressi, solo per i tuoi occhi</div>

      {/* HERO: questo mese */}
      <div className="hero-stat">
        <div className="h-label">Ore a {monthName}</div>
        <div className="h-value" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {fmtDuration(cmp.current.secs)}
          <DeltaPill pct={cmp.deltaSecsPct} />
        </div>
        <div className="h-sub">
          {cmp.prevPartial.secs > 0
            ? `Allo stesso punto del mese scorso eri a ${fmtDuration(cmp.prevPartial.secs)}`
            : "Primo mese con dati: la tua base di partenza"}
        </div>
      </div>

      {goalH && (
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <ProgressRing
            value={weekSecs}
            max={goalH * 3600}
            size={92}
            centerTop={Math.round(goalPct) + "%"}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Il tuo obiettivo settimanale</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {fmtDuration(weekSecs)} su {goalH}h questa settimana
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>
              {goalPct >= 100
                ? "Obiettivo settimanale completato"
                : `Te ne mancano ${fmtDuration(Math.max(0, goalH * 3600 - weekSecs))}`}
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {cmp.current.count}
            <DeltaPill pct={cmp.deltaCountPct} />
          </div>
          <div className="stat-label">Lavori registrati questo mese</div>
        </div>
        <div className="stat">
          <div className="stat-value">{cmp.current.activeDays}</div>
          <div className="stat-label">Giorni attivi questo mese</div>
        </div>
      </div>

      {/* Tendenza 6 mesi */}
      {months.length >= 2 && (
        <>
          <div className="section-label">Le tue ore, mese per mese</div>
          <div className="card" style={{ padding: "16px 12px 10px" }}>
            <MiniBars data={bars} height={110} color="var(--brand)" formatValue={(v) => v + "h"} />
          </div>
        </>
      )}

      {/* Stai migliorando */}
      {improving.length > 0 && (
        <>
          <div className="section-label">Stai diventando più veloce 🚀</div>
          <div className="card">
            {improving.map((s, i) => (
              <div key={i} className="record-row">
                <span className="record-emoji">⚡</span>
                <span className="record-main">
                  <span className="record-title">{s.description}</span>
                  <span className="record-sub" style={{ display: "block" }}>
                    Ora {fmtDuration(s.recentMedian)} · prima {fmtDuration(s.overallMedian)}
                  </span>
                </span>
                <span className="record-val" style={{ color: "var(--ok)" }}>{fmtPct(s.pct)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dove serve più tempo, framing neutro */}
      {slower.length > 0 && (
        <>
          <div className="section-label">Dove stai dedicando più tempo</div>
          <div className="card">
            {slower.map((s, i) => (
              <div key={i} className="record-row">
                <span className="record-emoji">🧭</span>
                <span className="record-main">
                  <span className="record-title">{s.description}</span>
                  <span className="record-sub" style={{ display: "block" }}>
                    Ora {fmtDuration(s.recentMedian)} · di solito {fmtDuration(s.overallMedian)}
                  </span>
                </span>
                <span className="record-val" style={{ color: "var(--ink-soft)" }}>{fmtPct(s.pct)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Record personali */}
      {rec && (
        <>
          <div className="section-label">I tuoi record</div>
          <div className="card">
            <div className="record-row">
              <span className="record-emoji">🏆</span>
              <span className="record-main">
                <span className="record-title">Mese con più ore</span>
                <span className="record-sub" style={{ display: "block" }}>
                  {monthLabel(rec.bestHours.key)}
                </span>
              </span>
              <span className="record-val">{fmtDuration(rec.bestHours.secs)}</span>
            </div>
            <div className="record-row">
              <span className="record-emoji">📦</span>
              <span className="record-main">
                <span className="record-title">Mese con più lavori</span>
                <span className="record-sub" style={{ display: "block" }}>
                  {monthLabel(rec.bestOutput.key)}
                </span>
              </span>
              <span className="record-val">{rec.bestOutput.count}</span>
            </div>
            <div className="record-row">
              <span className="record-emoji">🔥</span>
              <span className="record-main">
                <span className="record-title">Mese più costante</span>
                <span className="record-sub" style={{ display: "block" }}>
                  {monthLabel(rec.bestDays.key)}
                </span>
              </span>
              <span className="record-val">{rec.bestDays.activeDays} giorni</span>
            </div>
            {rec.bestDay && (
              <div className="record-row">
                <span className="record-emoji">⛰️</span>
                <span className="record-main">
                  <span className="record-title">La tua giornata più piena</span>
                  <span className="record-sub" style={{ display: "block" }}>
                    {new Date(rec.bestDay.key).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
                  </span>
                </span>
                <span className="record-val">{fmtDuration(rec.bestDay.secs)}</span>
              </div>
            )}
          </div>
        </>
      )}

      <p className="muted center" style={{ fontSize: 11.5, marginTop: 18 }}>
        Questi numeri confrontano te solo con te. Nessun altro li vede.
      </p>
    </div>
  );
}
