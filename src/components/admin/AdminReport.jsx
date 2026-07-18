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
import AdminEntryEditor from "./AdminEntryEditor.jsx";
import ProjectPicker from "../ProjectPicker.jsx";

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
  const [editEntry, setEditEntry] = useState(null);
  const [lockUntil, setLockUntil] = useState(null);
  const [lockDraft, setLockDraft] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkPicker, setBulkPicker] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSel(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function bulkAssign(projectId) {
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await supabase
      .from("time_entries")
      .update({ project_id: projectId })
      .in("id", ids);
    setBulkBusy(false);
    setBulkPicker(false);
    if (error) {
      toast("Assegnazione non riuscita: " + error.message, "error");
      return;
    }
    toast(`${ids.length} ${ids.length === 1 ? "voce assegnata" : "voci assegnate"}.`, "ok");
    setSelected(new Set());
    load();
  }

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
    // periodo precedente comparabile (stessa durata, subito prima)
    const periodMs = to.getTime() - from.getTime();
    const prevStart = new Date(from.getTime() - periodMs - 86400000);
    // per la griglia serve anche la settimana selezionata
    const gridEnd = new Date(gridWeek);
    gridEnd.setDate(gridEnd.getDate() + 7);
    const minFrom = new Date(Math.min(from.getTime(), gridWeek.getTime(), prevStart.getTime()));
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

  // Blocco periodo (voci fino a una data non più modificabili dai dipendenti)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("time_lock").select("locked_until").maybeSingle();
      setLockUntil(data?.locked_until || null);
      setLockDraft(data?.locked_until || "");
    })();
  }, []);

  async function saveLock(value) {
    const { error } = await supabase.from("time_lock").upsert({ id: true, locked_until: value || null });
    if (error) { toast("Non è stato possibile aggiornare il blocco.", "error"); return; }
    setLockUntil(value || null);
    toast(value ? "Periodo bloccato." : "Blocco rimosso.", "ok");
  }

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

  // ---- Confronto per persona vs periodo precedente (a pari giorni trascorsi) ----
  const DAY = 86400000;
  const periodDays = Math.max(1, Math.round((to - from) / DAY) + 1);
  const today = new Date();
  const elapsedDays = Math.min(
    periodDays,
    Math.max(1, Math.round((Math.min(to.getTime(), today.getTime()) - from.getTime()) / DAY) + 1)
  );
  // finestra "corrente" limitata ai giorni trascorsi
  const curWinEnd = new Date(from.getTime() + elapsedDays * DAY);
  // finestra "precedente": stessa durata, subito prima del periodo
  const prevStart = new Date(from.getTime() - periodDays * DAY);
  const prevWinEnd = new Date(prevStart.getTime() + elapsedDays * DAY);

  function inWin(e, a, b) {
    const d = new Date(e.started_at);
    if (d < a || d >= b) return false;
    if (userFilter !== "all" && e.user_id !== userFilter) return false;
    if (projFilter !== "all" && e.project_id !== projFilter) return false;
    if (clientFilter !== "all") {
      const p = projectById(e.project_id);
      if ((p?.client_id || "none") !== clientFilter) return false;
    }
    return true;
  }
  const curByUser = {}, prevByUser = {};
  for (const e of rows) {
    if (inWin(e, from, curWinEnd)) curByUser[e.user_id] = (curByUser[e.user_id] || 0) + entrySeconds(e);
    if (inWin(e, prevStart, prevWinEnd)) prevByUser[e.user_id] = (prevByUser[e.user_id] || 0) + entrySeconds(e);
  }
  const compareRows = peopleList
    .filter((p) => p.active !== false || curByUser[p.id] || prevByUser[p.id])
    .map((p) => {
      const cur = curByUser[p.id] || 0;
      const prev = prevByUser[p.id] || 0;
      const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
      return { id: p.id, name: p.name || "Senza nome", cur, prev, pct };
    })
    .filter((r) => r.cur > 0 || r.prev > 0)
    .sort((a, b) => b.cur - a.cur);

  function exportCompareCSV() {
    const head = ["Persona", "Ore periodo", "Ore periodo prec.", "Variazione %"];
    const lines = compareRows.map((r) =>
      [
        r.name,
        (r.cur / 3600).toFixed(2).replace(".", ","),
        (r.prev / 3600).toFixed(2).replace(".", ","),
        r.pct == null ? "—" : (r.pct >= 0 ? "+" : "") + r.pct.toFixed(0) + "%",
      ].join(";")
    );
    const csv = [head.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `confronto-persone-${dayKey(new Date())}.csv`;
    a.click();
  }

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
  const detail = userFilter !== "all" || projFilter !== "all" || clientFilter !== "all";
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
  const gridProj = {}; // user_id -> [ {proj_id: secs} per giorno ]
  for (const e of rows) {
    const d = new Date(e.started_at);
    if (d < gridWeek || d >= gridEndX) continue;
    if (projFilter !== "all" && e.project_id !== projFilter) continue;
    if (clientFilter !== "all") {
      const p = projectById(e.project_id);
      if ((p?.client_id || "none") !== clientFilter) continue;
    }
    const dayIdx = Math.floor((d - gridWeek) / 86400000);
    if (!gridData[e.user_id]) {
      gridData[e.user_id] = Array(7).fill(0);
      gridProj[e.user_id] = Array.from({ length: 7 }, () => ({}));
    }
    const secs = entrySeconds(e);
    gridData[e.user_id][dayIdx] += secs;
    const pk = e.project_id || "none";
    gridProj[e.user_id][dayIdx][pk] = (gridProj[e.user_id][dayIdx][pk] || 0) + secs;
  }
  // progetto dominante (più secondi) per colorare la cella
  function dominantColor(userId, dayIdx) {
    const m = gridProj[userId]?.[dayIdx];
    if (!m) return null;
    let best = null, bestN = 0;
    for (const [pk, n] of Object.entries(m)) {
      if (n > bestN) { bestN = n; best = pk; }
    }
    if (!best || best === "none") return null;
    return projectById(best)?.color || null;
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
                      {r.days.map((s2, i) => {
                        const col = s2 > 0 ? dominantColor(r.id, i) : null;
                        return (
                          <td key={i} className={s2 === 0 ? "zero" : ""}>
                            {col ? (
                              <span className="cell-wrap" style={{ background: col }}>
                                {fmtCell(s2)}
                              </span>
                            ) : (
                              fmtCell(s2)
                            )}
                          </td>
                        );
                      })}
                      <td className="tot">{fmtDuration(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && gridRows.length > 0 && (() => {
            const present = new Set();
            Object.values(gridProj).forEach((days) =>
              days.forEach((m) => Object.keys(m).forEach((pk) => pk !== "none" && present.add(pk)))
            );
            const list = [...present].map((pk) => projectById(pk)).filter(Boolean);
            if (list.length === 0) return null;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                {list.map((p) => (
                  <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" }}>
                    <span className="entry-dot" style={{ background: p.color }} />
                    {p.name}
                  </span>
                ))}
                <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                  (il colore mostra il lavoro prevalente della giornata)
                </span>
              </div>
            );
          })()}
        </>
      )}

      {view === "list" && (
      <>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="row-between" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Blocco voci approvate</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {lockUntil
                ? `Le voci fino al ${new Date(lockUntil + "T00:00:00").toLocaleDateString("it-IT")} non sono più modificabili dai dipendenti.`
                : "Nessun blocco attivo. Puoi chiudere i periodi già verificati."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input type="date" className="field" style={{ flex: "1 1 160px" }} value={lockDraft} onChange={(e) => setLockDraft(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => saveLock(lockDraft)} disabled={!lockDraft}>
            Blocca fino a questa data
          </button>
          {lockUntil && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setLockDraft(""); saveLock(null); }}>
              Rimuovi blocco
            </button>
          )}
        </div>
      </div>

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

          {/* Confronto per persona vs periodo precedente */}
          {compareRows.length > 0 && (
            <>
              <div className="row-between" style={{ alignItems: "center" }}>
                <div className="section-label" style={{ margin: 0 }}>Confronto per persona</div>
                <button className="btn btn-ghost btn-sm" onClick={exportCompareCSV}>
                  <IconDownload style={{ width: 15, height: 15 }} /> CSV
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                Confronto sui primi {elapsedDays} {elapsedDays === 1 ? "giorno" : "giorni"} del periodo, a parità di giorni trascorsi rispetto al periodo precedente.
              </p>
              <div className="card grid-wrap">
                <table className="wgrid">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th className="tot">Periodo</th>
                      <th className="tot">Precedente</th>
                      <th className="tot">Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="tot">{fmtDuration(r.cur)}</td>
                        <td>{fmtDuration(r.prev)}</td>
                        <td className="tot">
                          {r.pct == null ? (
                            <span className="muted">nuovo</span>
                          ) : (
                            <span style={{ color: r.pct >= 0 ? "var(--ok)" : "var(--stop)", fontWeight: 700 }}>
                              {r.pct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(r.pct))}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

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

          {/* dettaglio voci */}
          {detail && (
            <>
              <div className="row-between" style={{ alignItems: "center", marginTop: 4 }}>
                <div className="section-label" style={{ margin: 0 }}>
                  {userFilter !== "all"
                    ? `Voci di ${people[userFilter] || ""}`
                    : clientFilter === "none"
                    ? "Voci senza cliente"
                    : "Voci nel filtro"}
                </div>
                {filtered.length > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (selected.size) setSelected(new Set());
                      else setSelected(new Set(filtered.map((e) => e.id)));
                    }}
                  >
                    {selected.size ? "Deseleziona" : "Seleziona tutto"}
                  </button>
                )}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                Tocca una voce per correggerla, o selezionane più d'una per assegnarle a un progetto in blocco.
              </p>
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
                        const cl = p?.client_id ? clientById(p.client_id) : null;
                        const sel = selected.has(e.id);
                        return (
                          <div key={e.id} className="entry" style={sel ? { background: "rgba(107,105,234,0.08)" } : undefined}>
                            <button
                              onClick={() => toggleSel(e.id)}
                              aria-label="Seleziona"
                              style={{
                                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                border: sel ? "none" : "2px solid var(--line-strong)",
                                background: sel ? "var(--brand)" : "transparent",
                                color: "#fff", display: "grid", placeItems: "center", fontSize: 13,
                              }}
                            >
                              {sel ? "✓" : ""}
                            </button>
                            <div
                              className="entry-main"
                              style={{ cursor: "pointer" }}
                              onClick={() => setEditEntry(e)}
                            >
                              <div className="entry-desc">
                                {e.description || <span className="muted">Senza descrizione</span>}
                              </div>
                              <div className="entry-sub">
                                {[
                                  p ? (cl ? `${p.name} (${cl.name})` : `${p.name} · senza cliente`) : "Senza progetto",
                                  `${fmtTime(e.started_at)}–${fmtTime(e.stopped_at)}`,
                                ].filter(Boolean).join("  ·  ")}
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

      {/* Barra azioni selezione multipla */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontWeight: 600 }}>{selected.size} selezionate</span>
          <button className="btn btn-primary btn-sm" onClick={() => setBulkPicker(true)} disabled={bulkBusy}>
            {bulkBusy ? <span className="spinner spinner-white" /> : "Assegna a progetto"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Annulla
          </button>
        </div>
      )}

      {editEntry && (
        <AdminEntryEditor
          entry={editEntry}
          personName={people[editEntry.user_id] || ""}
          onClose={() => setEditEntry(null)}
          onSaved={load}
        />
      )}

      {bulkPicker && (
        <ProjectPicker
          open={bulkPicker}
          onClose={() => setBulkPicker(false)}
          value={null}
          onChange={(pid) => bulkAssign(pid)}
        />
      )}
    </div>
  );
}
