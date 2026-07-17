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

function toISODate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export default function AdminReport() {
  const { projectById, projectRate, clients, clientById, activeProjects, projects, toast } = useData();
  const [period, setPeriod] = useState("week");
  const [fromDate, setFromDate] = useState(() => toISODate(startOfWeek()));
  const [toDate, setToDate] = useState(() => toISODate(new Date()));
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [peopleList, setPeopleList] = useState([]);
  const [userFilter, setUserFilter] = useState("all");
  const [projFilter, setProjFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [view, setView] = useState("list"); // list | grid
  const [gridWeek, setGridWeek] = useState(() => startOfWeek());
  const [loading, setLoading] = useState(true);

  // scorciatoie periodo -> impostano le date
  function setQuickPeriod(p) {
    setPeriod(p);
    const today = new Date();
    if (p === "week") setFromDate(toISODate(startOfWeek()));
    else if (p === "month") setFromDate(toISODate(startOfMonth()));
    else setFromDate("2024-01-01");
    setToDate(toISODate(today));
  }

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(fromDate + "T00:00:00");
    const to = new Date(toDate + "T23:59:59");
    // per la griglia serve anche la settimana selezionata
    const gridEnd = new Date(gridWeek);
    gridEnd.setDate(gridEnd.getDate() + 7);
    const minFrom = new Date(Math.min(from.getTime(), gridWeek.getTime()));
    const maxTo = new Date(Math.max(to.getTime(), gridEnd.getTime()));

    const [{ data: profs }, { data: ent }] = await Promise.all([
      supabase.from("profiles").select("id, name, active"),
      supabase
        .from("time_entries")
        .select("*")
        .not("stopped_at", "is", null)
        .gte("started_at", minFrom.toISOString())
        .lte("started_at", maxTo.toISOString())
        .order("started_at", { ascending: false }),
    ]);
    const map = {};
    (profs || []).forEach((p) => (map[p.id] = p.name || "Senza nome"));
    setPeople(map);
    setPeopleList(profs || []);
    setRows(ent || []);
    setLoading(false);
  }, [fromDate, toDate, gridWeek]);

  useEffect(() => {
    load();
  }, [load]);

  const from = new Date(fromDate + "T00:00:00");
  const to = new Date(toDate + "T23:59:59");
  const filtered = rows.filter((e) => {
    const d = new Date(e.started_at);
    if (d < from || d > to) return false;
    if (userFilter !== "all" && e.user_id !== userFilter) return false;
    if (projFilter !== "all" && e.project_id !== projFilter) return false;
    if (clientFilter !== "all") {
      const p = projectById(e.project_id);
      if ((p?.client_id || "none") !== clientFilter) return false;
    }
    return true;
  });

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

  // ---- Griglia settimanale ore × giorno ----
  const gridDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(gridWeek);
    d.setDate(gridWeek.getDate() + i);
    gridDays.push(d);
  }
  const gridEndX = new Date(gridWeek);
  gridEndX.setDate(gridWeek.getDate() + 7);
  const gridData = {};
  for (const e of rows) {
    const d = new Date(e.started_at);
    if (d < gridWeek || d >= gridEndX) continue;
    if (projFilter !== "all" && e.project_id !== projFilter) continue;
    if (clientFilter !== "all") {
      const p = projectById(e.project_id);
      if ((p?.client_id || "none") !== clientFilter) continue;
    }
    const dayIdx = Math.floor((d - gridWeek) / 86400000);
    if (!gridData[e.user_id]) gridData[e.user_id] = Array(7).fill(0);
    gridData[e.user_id][dayIdx] += entrySeconds(e);
  }
  const gridRows = peopleList
    .filter((p) => p.active !== false || gridData[p.id])
    .map((p) => {
      const days = gridData[p.id] || Array(7).fill(0);
      return { id: p.id, name: p.name || "Senza nome", days, total: days.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total);
  const gridLabel =
    gridDays[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" }) +
    " – " +
    gridDays[6].toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const isCurGridWeek = startOfWeek().getTime() === gridWeek.getTime();
  function shiftGrid(delta) {
    const d = new Date(gridWeek);
    d.setDate(d.getDate() + delta * 7);
    setGridWeek(startOfWeek(d));
  }
  function fmtCell(secs) {
    if (secs === 0) return "–";
    const h = secs / 3600;
    return h >= 10 ? Math.round(h) + "h" : h.toFixed(1).replace(".", ",") + "h";
  }

  return (
    <div>
      <div className="segment" style={{ marginBottom: 12 }}>
        <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Elenco</button>
        <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>Griglia settimana</button>
      </div>

      {view === "grid" && (
        <>
          <div className="week-nav">
            <button className="week-arrow" onClick={() => shiftGrid(-1)}>‹</button>
            <div className="w-label">{isCurGridWeek ? "Questa settimana" : gridLabel}</div>
            <button className="week-arrow" onClick={() => shiftGrid(1)} disabled={isCurGridWeek}>›</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <select className="field" style={{ flex: 1 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="all">Tutti i clienti</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="none">Senza cliente</option>
            </select>
            <select className="field" style={{ flex: 1 }} value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
              <option value="all">Tutti i progetti</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="center" style={{ marginTop: 30 }}><span className="spinner" /></div>
          ) : (
            <div className="card grid-wrap">
              <table className="wgrid">
                <thead>
                  <tr>
                    <th>Persona</th>
                    {gridDays.map((d, i) => (
                      <th key={i}>{["Lun","Mar","Mer","Gio","Ven","Sab","Dom"][i]}<br/>{d.getDate()}</th>
                    ))}
                    <th className="tot">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      {r.days.map((s2, i) => (
                        <td key={i} className={s2 === 0 ? "zero" : ""}>{fmtCell(s2)}</td>
                      ))}
                      <td className="tot">{fmtDuration(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === "list" && (
      <>
      <div className="segment" style={{ marginBottom: 10 }}>
        <button className={period === "week" ? "active" : ""} onClick={() => setQuickPeriod("week")}>
          Settimana
        </button>
        <button className={period === "month" ? "active" : ""} onClick={() => setQuickPeriod("month")}>
          Mese
        </button>
        <button className={period === "all" ? "active" : ""} onClick={() => setQuickPeriod("all")}>
          Tutto
        </button>
      </div>

      {/* intervallo libero */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label">Dal</label>
          <input type="date" className="field" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPeriod("custom"); }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Al</label>
          <input type="date" className="field" value={toDate} onChange={(e) => { setToDate(e.target.value); setPeriod("custom"); }} />
        </div>
      </div>

      {/* filtri */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select
          className="field"
          style={{ flex: "1 1 45%" }}
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        >
          <option value="all">Tutte le persone</option>
          {peopleList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Senza nome"}
            </option>
          ))}
        </select>
        <select className="field" style={{ flex: "1 1 45%" }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="all">Tutti i clienti</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">Senza cliente</option>
        </select>
        <select className="field" style={{ flex: "1 1 100%" }} value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
          <option value="all">Tutti i progetti</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

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
      </>
      )}
    </div>
  );
}
