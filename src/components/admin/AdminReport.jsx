import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import {
  entrySeconds,
  fmtDuration,
  fmtHours,
  fmtTime,
  dayKey,
  dayLabel,
  startOfWeek,
  startOfMonth,
} from "../../lib/format.js";
import { IconDownload } from "../../lib/icons.jsx";

function csvCell(v) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export default function AdminReport() {
  const { projectById, projectRate, toast } = useData();
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [peopleList, setPeopleList] = useState([]);
  const [userFilter, setUserFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const from =
    period === "week"
      ? startOfWeek()
      : period === "month"
      ? startOfMonth()
      : new Date(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: ent }] = await Promise.all([
      supabase.from("profiles").select("id, name"),
      supabase
        .from("time_entries")
        .select("*")
        .not("stopped_at", "is", null)
        .gte("started_at", from.toISOString())
        .order("started_at", { ascending: false }),
    ]);
    const map = {};
    (profs || []).forEach((p) => (map[p.id] = p.name || "Senza nome"));
    setPeople(map);
    setPeopleList(profs || []);
    setRows(ent || []);
    setLoading(false);
  }, [from]);

  useEffect(() => {
    load();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered =
    userFilter === "all" ? rows : rows.filter((e) => e.user_id === userFilter);

  const totalSecs = filtered.reduce((s, e) => s + entrySeconds(e), 0);

  // riepilogo per persona
  const byUser = {};
  for (const e of filtered) {
    byUser[e.user_id] = (byUser[e.user_id] || 0) + entrySeconds(e);
  }
  const userRows = Object.entries(byUser)
    .map(([id, secs]) => ({ id, name: people[id] || "—", secs }))
    .sort((a, b) => b.secs - a.secs);

  // riepilogo per progetto
  const byProj = {};
  for (const e of filtered) {
    const k = e.project_id || "none";
    byProj[k] = (byProj[k] || 0) + entrySeconds(e);
  }
  const projRows = Object.entries(byProj)
    .map(([id, secs]) => {
      const p = id === "none" ? null : projectById(id);
      return { id, name: p?.name || "Senza progetto", color: p?.color || "#cfcfca", secs };
    })
    .sort((a, b) => b.secs - a.secs);
  const maxProj = Math.max(1, ...projRows.map((r) => r.secs));

  function exportCSV() {
    const header = [
      "Persona", "Data", "Inizio", "Fine", "Ore",
      "Progetto", "Descrizione", "Fatturabile", "Importo", "Tag",
    ];
    const lines = [header.join(";")];
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.started_at) - new Date(b.started_at)
    );
    for (const e of sorted) {
      const p = projectById(e.project_id);
      const rate = projectRate(e.project_id);
      const amount = e.billable && rate != null ? (entrySeconds(e) / 3600) * Number(rate) : null;
      lines.push(
        [
          csvCell(people[e.user_id] || ""),
          dayKey(e.started_at),
          fmtTime(e.started_at),
          e.stopped_at ? fmtTime(e.stopped_at) : "",
          fmtHours(entrySeconds(e)),
          csvCell(p?.name || ""),
          csvCell(e.description || ""),
          e.billable ? "Sì" : "No",
          amount != null ? amount.toFixed(2).replace(".", ",") : "",
          csvCell((e.tags || []).join(", ")),
        ].join(";")
      );
    }
    const csv = "\uFEFF" + lines.join("\n"); // BOM per Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const label = userFilter === "all" ? "tutti" : (people[userFilter] || "utente");
    a.href = url;
    a.download = `ore-${label}-${period}-${dayKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("CSV esportato", "ok");
  }

  // dettaglio voci quando è selezionata una persona (vista "come utente")
  const detail = userFilter !== "all";
  const groups = [];
  if (detail) {
    const byDay = {};
    for (const e of filtered) {
      const k = dayKey(e.started_at);
      if (!byDay[k]) {
        byDay[k] = { key: k, label: dayLabel(e.started_at), items: [], total: 0 };
        groups.push(byDay[k]);
      }
      byDay[k].items.push(e);
      byDay[k].total += entrySeconds(e);
    }
  }

  return (
    <div>
      <div className="segment" style={{ marginBottom: 12 }}>
        <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
          Settimana
        </button>
        <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
          Mese
        </button>
        <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>
          Tutto
        </button>
      </div>

      {/* filtro persona */}
      <select
        className="field"
        value={userFilter}
        onChange={(e) => setUserFilter(e.target.value)}
        style={{ marginBottom: 14 }}
      >
        <option value="all">Tutte le persone</option>
        {peopleList.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || "Senza nome"}
          </option>
        ))}
      </select>

      {loading ? (
        <div className="center" style={{ marginTop: 30 }}>
          <span className="spinner" />
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{fmtDuration(totalSecs)}</div>
              <div className="stat-label">Ore totali</div>
            </div>
            <div className="stat">
              <div className="stat-value">{filtered.length}</div>
              <div className="stat-label">Voci</div>
            </div>
          </div>

          <button
            className="btn btn-soft btn-block"
            style={{ marginTop: 4, marginBottom: 6 }}
            onClick={exportCSV}
            disabled={filtered.length === 0}
          >
            <IconDownload style={{ width: 17, height: 17 }} /> Esporta CSV
          </button>

          {/* riepilogo per persona (solo in vista "tutte") */}
          {!detail && (
            <>
              <div className="section-label">Per persona</div>
              {userRows.length === 0 ? (
                <div className="empty">Nessuna ora nel periodo.</div>
              ) : (
                <div className="card">
                  {userRows.map((r) => (
                    <button
                      key={r.id}
                      className="list-action"
                      style={{ width: "100%", textAlign: "left" }}
                      onClick={() => setUserFilter(r.id)}
                    >
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span className="entry-dur">{fmtDuration(r.secs)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* per progetto */}
          <div className="section-label">Per progetto</div>
          {projRows.length === 0 ? (
            <div className="empty">Nessuna ora nel periodo.</div>
          ) : (
            <div className="card" style={{ padding: "10px 14px" }}>
              {projRows.map((r) => (
                <div key={r.id} className="bar-row">
                  <span className="bar-name">{r.name}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${(r.secs / maxProj) * 100}%`, background: r.color }}
                    />
                  </span>
                  <span className="bar-val">{fmtDuration(r.secs)}</span>
                </div>
              ))}
            </div>
          )}

          {/* dettaglio voci della persona selezionata */}
          {detail && (
            <>
              <div className="section-label">Voci di {people[userFilter] || ""}</div>
              {groups.length === 0 ? (
                <div className="empty">Nessuna voce nel periodo.</div>
              ) : (
                groups.map((g) => (
                  <div key={g.key}>
                    <div className="day-total" style={{ marginTop: 8 }}>
                      <span className="t-label">{g.label}</span>
                      <span className="t-value">{fmtDuration(g.total)}</span>
                    </div>
                    <div className="card">
                      {g.items.map((e) => {
                        const p = projectById(e.project_id);
                        return (
                          <div key={e.id} className="entry">
                            <span
                              className="entry-dot"
                              style={{ background: p?.color || "#cfcfca" }}
                            />
                            <div className="entry-main">
                              <div className="entry-desc">
                                {e.description || (
                                  <span className="muted">Senza descrizione</span>
                                )}
                              </div>
                              <div className="entry-sub">
                                {[p?.name, `${fmtTime(e.started_at)}–${fmtTime(e.stopped_at)}`]
                                  .filter(Boolean)
                                  .join("  ·  ")}
                              </div>
                            </div>
                            <span className="entry-dur">{fmtDuration(entrySeconds(e))}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
