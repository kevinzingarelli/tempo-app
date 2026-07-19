import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import { Donut } from "../Charts.jsx";
import { fmtDuration, entrySeconds, startOfWeek, startOfMonth, dayKey } from "../../lib/format.js";
import { IconChevron, IconDownload } from "../../lib/icons.jsx";

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1);
}
const PALETTE = ["#2f7d4f", "#3b6ef5", "#e5a300", "#ff8a3d", "#e5484d", "#b14bd8", "#0ca6a6", "#d8567a", "#6b7280", "#8a5a2b"];

function fmtDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export default function ReportExplorer() {
  const { projectById, clientById, clients, projectRate } = useData();

  const [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState(() => toISODate(startOfMonth()));
  const [toDate, setToDate] = useState(() => toISODate(new Date()));
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [loading, setLoading] = useState(true);

  // navigazione: mode = 'overview' | 'client' | 'person'
  const [mode, setMode] = useState("overview");
  const [focusClient, setFocusClient] = useState(null); // client_id | 'none'
  const [focusPerson, setFocusPerson] = useState(null); // user_id

  function setQuickPeriod(p) {
    setPeriod(p);
    const today = new Date();
    if (p === "week") setFromDate(toISODate(startOfWeek()));
    else if (p === "month") setFromDate(toISODate(startOfMonth()));
    else if (p === "year") setFromDate(toISODate(startOfYear()));
    else if (p === "all") setFromDate("2020-01-01");
    if (p !== "custom") setToDate(toISODate(today));
  }

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(fromDate + "T00:00:00");
    const to = new Date(toDate + "T23:59:59");
    const [{ data: profs }, { data: ent }] = await Promise.all([
      supabase.from("profiles").select("id, name, active"),
      supabase
        .from("time_entries")
        .select("*")
        .not("stopped_at", "is", null)
        .gte("started_at", from.toISOString())
        .lte("started_at", to.toISOString())
        .order("started_at", { ascending: false }),
    ]);
    const pmap = {};
    (profs || []).forEach((p) => (pmap[p.id] = p.name || "Senza nome"));
    setPeople(pmap);
    setRows(ent || []);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Helper: cliente di una voce
  const clientOf = useCallback((e) => {
    const p = projectById(e.project_id);
    return p?.client_id || "none";
  }, [projectById]);

  const totalSecs = useMemo(() => rows.reduce((s, e) => s + entrySeconds(e), 0), [rows]);

  // ---- OVERVIEW: ore per cliente ----
  const clientAgg = useMemo(() => {
    const m = {};
    for (const e of rows) {
      const c = clientOf(e);
      if (!m[c]) m[c] = { secs: 0, bill: 0, count: 0, projects: new Set(), people: new Set() };
      const s = entrySeconds(e);
      m[c].secs += s;
      if (e.billable) m[c].bill += s;
      m[c].count++;
      if (e.project_id) m[c].projects.add(e.project_id);
      m[c].people.add(e.user_id);
    }
    return Object.entries(m)
      .map(([cid, v]) => ({
        cid,
        name: cid === "none" ? "Senza cliente" : (clientById(cid)?.name || "—"),
        ...v,
      }))
      .sort((a, b) => b.secs - a.secs);
  }, [rows, clientOf, clientById]);

  const clientPie = clientAgg.slice(0, 9).map((r, i) => ({ value: r.secs, color: PALETTE[i % PALETTE.length], name: r.name }));
  const clientOthers = clientAgg.slice(9).reduce((s, r) => s + r.secs, 0);
  if (clientOthers > 0) clientPie.push({ value: clientOthers, color: "#c4c8cc", name: "Altri" });

  // ---- lista persone (per entrare da persona) ----
  const personAgg = useMemo(() => {
    const m = {};
    for (const e of rows) {
      if (!m[e.user_id]) m[e.user_id] = { secs: 0, count: 0 };
      m[e.user_id].secs += entrySeconds(e);
      m[e.user_id].count++;
    }
    return Object.entries(m)
      .map(([uid, v]) => ({ uid, name: people[uid] || "—", ...v }))
      .sort((a, b) => b.secs - a.secs);
  }, [rows, people]);

  // ---- CLIENT DETAIL ----
  const clientDetail = useMemo(() => {
    if (mode !== "client" || focusClient == null) return null;
    const inClient = rows.filter((e) => clientOf(e) === focusClient);
    const byPerson = {};
    const byProject = {};
    let bill = 0;
    for (const e of inClient) {
      const s = entrySeconds(e);
      byPerson[e.user_id] = (byPerson[e.user_id] || 0) + s;
      const pk = e.project_id || "none";
      byProject[pk] = (byProject[pk] || 0) + s;
      if (e.billable) bill += s;
    }
    const total = inClient.reduce((s, e) => s + entrySeconds(e), 0);
    const persons = Object.entries(byPerson).map(([uid, secs]) => ({ uid, name: people[uid] || "—", secs })).sort((a, b) => b.secs - a.secs);
    const projects = Object.entries(byProject).map(([pk, secs]) => ({ pk, name: pk === "none" ? "Senza progetto" : (projectById(pk)?.name || "—"), color: pk !== "none" ? projectById(pk)?.color : "#9aa0a6", secs })).sort((a, b) => b.secs - a.secs);
    return { inClient, persons, projects, total, bill, nonBill: total - bill };
  }, [mode, focusClient, rows, clientOf, people, projectById]);

  // ---- PERSON DETAIL ----
  const personDetail = useMemo(() => {
    if (mode !== "person" || focusPerson == null) return null;
    const mineRows = rows.filter((e) => e.user_id === focusPerson);
    const byClient = {};
    const byDay = {};
    let bill = 0;
    for (const e of mineRows) {
      const s = entrySeconds(e);
      const c = clientOf(e);
      byClient[c] = (byClient[c] || 0) + s;
      const dk = dayKey(e.started_at);
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push(e);
      if (e.billable) bill += s;
    }
    const total = mineRows.reduce((s, e) => s + entrySeconds(e), 0);
    const clientsArr = Object.entries(byClient)
      .map(([cid, secs]) => ({ cid, name: cid === "none" ? "Senza cliente" : (clientById(cid)?.name || "—"), secs }))
      .sort((a, b) => b.secs - a.secs);
    const days = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return { mineRows, clientsArr, days, total, bill, nonBill: total - bill };
  }, [mode, focusPerson, rows, clientOf, clientById]);

  function exportPersonCSV() {
    if (!personDetail) return;
    const head = ["Data", "Cliente", "Progetto", "Descrizione", "Ore", "Fatturabile"];
    const lines = personDetail.mineRows.map((e) => {
      const p = projectById(e.project_id);
      const c = p?.client_id ? clientById(p.client_id)?.name : "";
      return [
        dayKey(e.started_at),
        c || "",
        p?.name || "",
        (e.description || "").replace(/;/g, ","),
        (entrySeconds(e) / 3600).toFixed(2).replace(".", ","),
        e.billable ? "sì" : "no",
      ].join(";");
    });
    const csv = [head.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(people[focusPerson] || "persona").replace(/\s+/g, "-")}-${dayKey(new Date())}.csv`;
    a.click();
  }

  const periodBar = (
    <div className="seg-scroll">
      <div className="segment segment-sm">
        {[["week", "Settimana"], ["month", "Mese"], ["year", "Anno"], ["all", "Dall'inizio"], ["custom", "Personalizzato"]].map(([k, l]) => (
          <button key={k} className={period === k ? "active" : ""} onClick={() => setQuickPeriod(k)}>{l}</button>
        ))}
      </div>
    </div>
  );

  if (loading)
    return (
      <div>
        {periodBar}
        <div className="center" style={{ marginTop: 40 }}><span className="spinner" /></div>
      </div>
    );

  return (
    <div>
      {periodBar}

      {period === "custom" && (
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="field-label">Dal</label>
            <input type="date" className="field" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Al</label>
            <input type="date" className="field" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      {mode !== "overview" && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => { setMode("overview"); setFocusClient(null); setFocusPerson(null); }}>
          ‹ Torna alla panoramica
        </button>
      )}

      {/* ===================== OVERVIEW ===================== */}
      {mode === "overview" && (
        <>
          {totalSecs === 0 ? (
            <div className="empty" style={{ padding: 30 }}>Nessun dato nel periodo scelto.</div>
          ) : (
            <>
              <div className="kpi-row" style={{ marginBottom: 12 }}>
                <div className="kpi-card"><div className="kpi-val">{fmtDuration(totalSecs)}</div><div className="kpi-lbl">Totale</div></div>
                <div className="kpi-card"><div className="kpi-val">{clientAgg.length}</div><div className="kpi-lbl">Clienti</div></div>
                <div className="kpi-card"><div className="kpi-val">{personAgg.length}</div><div className="kpi-lbl">Persone</div></div>
              </div>

              {/* Torta clienti */}
              <div className="section-label">Ore per cliente</div>
              <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <Donut segments={clientPie} size={140} stroke={22} centerTop={fmtDuration(totalSecs)} centerBottom="totali" />
                <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 7 }}>
                  {clientPie.map((s, i) => (
                    <div key={i} className="row-between" style={{ fontSize: 13.5 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <span className="entry-dot" style={{ background: s.color }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      </span>
                      <span className="muted" style={{ flexShrink: 0 }}>{fmtDuration(s.value)} · {Math.round((s.value / totalSecs) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Elenco clienti (entra) */}
              <div className="section-label">Entra in un cliente</div>
              <div className="card">
                {clientAgg.map((c) => (
                  <button key={c.cid} className="list-action" style={{ width: "100%", textAlign: "left" }} onClick={() => { setFocusClient(c.cid); setMode("client"); }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: "block" }}>{c.name}</span>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {c.projects.size} {c.projects.size === 1 ? "progetto" : "progetti"} · {c.people.size} {c.people.size === 1 ? "persona" : "persone"} · {c.count} voci
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className="entry-dur">{fmtDuration(c.secs)}</span>
                      <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
                    </span>
                  </button>
                ))}
              </div>

              {/* Elenco persone (entra) */}
              <div className="section-label">Entra in una persona</div>
              <div className="card">
                {personAgg.map((p) => (
                  <button key={p.uid} className="list-action" style={{ width: "100%", textAlign: "left" }} onClick={() => { setFocusPerson(p.uid); setMode("person"); }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: "block" }}>{p.name}</span>
                      <span className="muted" style={{ fontSize: 12.5 }}>{p.count} voci</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className="entry-dur">{fmtDuration(p.secs)}</span>
                      <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ===================== CLIENT DETAIL ===================== */}
      {mode === "client" && clientDetail && (
        <>
          <div className="screen-title" style={{ fontSize: 22, marginBottom: 4 }}>
            {focusClient === "none" ? "Senza cliente" : (clientById(focusClient)?.name || "—")}
          </div>
          <div className="kpi-row" style={{ marginBottom: 12 }}>
            <div className="kpi-card"><div className="kpi-val">{fmtDuration(clientDetail.total)}</div><div className="kpi-lbl">Totale</div></div>
            <div className="kpi-card"><div className="kpi-val">{clientDetail.projects.length}</div><div className="kpi-lbl">Progetti</div></div>
            <div className="kpi-card"><div className="kpi-val">{clientDetail.persons.length}</div><div className="kpi-lbl">Persone</div></div>
          </div>

          {/* Chi ci ha lavorato */}
          <div className="section-label">Chi ci ha lavorato</div>
          <div className="card">
            {clientDetail.persons.map((p) => (
              <div key={p.uid} className="hbar-row">
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{fmtDuration(p.secs)} · {Math.round((p.secs / clientDetail.total) * 100)}%</span>
                </div>
                <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(p.secs / clientDetail.total) * 100}%` }} /></div>
              </div>
            ))}
          </div>

          {/* Progetti del cliente */}
          <div className="section-label">Progetti su questo cliente</div>
          <div className="card">
            {clientDetail.projects.map((pr) => (
              <div key={pr.pk} className="row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span className="entry-dot" style={{ background: pr.color }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.name}</span>
                </span>
                <span className="entry-dur" style={{ flexShrink: 0 }}>{fmtDuration(pr.secs)}</span>
              </div>
            ))}
          </div>

          {/* Fatturabile vs no */}
          <div className="section-label">Fatturabile vs non</div>
          <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 18 }}>
            <Donut
              segments={[{ value: clientDetail.bill, color: "var(--ok)" }, { value: clientDetail.nonBill, color: "#c4c8cc" }]}
              size={110} stroke={18}
              centerTop={`${clientDetail.total ? Math.round((clientDetail.bill / clientDetail.total) * 100) : 0}%`}
              centerBottom="fatt."
            />
            <div style={{ flex: 1 }}>
              <div className="row-between" style={{ fontSize: 13.5, marginBottom: 6 }}>
                <span><span className="entry-dot" style={{ background: "var(--ok)" }} /> Fatturabili</span>
                <span className="entry-dur">{fmtDuration(clientDetail.bill)}</span>
              </div>
              <div className="row-between" style={{ fontSize: 13.5 }}>
                <span><span className="entry-dot" style={{ background: "#c4c8cc" }} /> Non fatturabili</span>
                <span className="entry-dur">{fmtDuration(clientDetail.nonBill)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== PERSON DETAIL ===================== */}
      {mode === "person" && personDetail && (
        <>
          <div className="row-between" style={{ alignItems: "center", marginBottom: 4 }}>
            <div className="screen-title" style={{ fontSize: 22 }}>{people[focusPerson] || "—"}</div>
            <button className="btn btn-ghost btn-sm" onClick={exportPersonCSV}><IconDownload style={{ width: 15, height: 15 }} /> CSV</button>
          </div>
          <div className="kpi-row" style={{ marginBottom: 12 }}>
            <div className="kpi-card"><div className="kpi-val">{fmtDuration(personDetail.total)}</div><div className="kpi-lbl">Totale</div></div>
            <div className="kpi-card"><div className="kpi-val">{fmtDuration(personDetail.bill)}</div><div className="kpi-lbl">Fatturabili</div></div>
            <div className="kpi-card"><div className="kpi-val">{personDetail.mineRows.length}</div><div className="kpi-lbl">Voci</div></div>
          </div>

          {/* Torta clienti della persona */}
          <div className="section-label">Ripartizione per cliente</div>
          <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Donut
              segments={personDetail.clientsArr.slice(0, 9).map((c, i) => ({ value: c.secs, color: PALETTE[i % PALETTE.length], name: c.name }))}
              size={140} stroke={22} centerTop={fmtDuration(personDetail.total)} centerBottom="totali"
            />
            <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 7 }}>
              {personDetail.clientsArr.map((c, i) => (
                <div key={c.cid} className="row-between" style={{ fontSize: 13.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span className="entry-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  </span>
                  <span className="muted" style={{ flexShrink: 0 }}>{fmtDuration(c.secs)} · {Math.round((c.secs / personDetail.total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Giorno per giorno */}
          <div className="section-label">Giorno per giorno</div>
          {personDetail.days.map(([dk, items]) => {
            const dayTotal = items.reduce((s, e) => s + entrySeconds(e), 0);
            return (
              <div key={dk} style={{ marginBottom: 10 }}>
                <div className="day-total">
                  <span className="t-label">{fmtDay(dk)}</span>
                  <span className="t-value">{fmtDuration(dayTotal)}</span>
                </div>
                <div className="card">
                  {items.map((e) => {
                    const p = projectById(e.project_id);
                    const c = p?.client_id ? clientById(p.client_id) : null;
                    return (
                      <div key={e.id} className="row-between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.description || p?.name || "Senza descrizione"}
                          </span>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {c ? c.name + " · " : ""}{p?.name || "Senza progetto"}{e.billable ? " · fatturabile" : ""}
                          </span>
                        </span>
                        <span className="entry-dur" style={{ flexShrink: 0 }}>{fmtDuration(entrySeconds(e))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
