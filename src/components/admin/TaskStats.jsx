import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useData } from "../../state/DataContext.jsx";
import { entrySeconds, fmtDuration, fmtTime, dayKey } from "../../lib/format.js";
import { buildTaskStats, findAnomalies, deviationPct, fmtPct, deviationColor } from "../../lib/stats.js";
import { IconChevron } from "../../lib/icons.jsx";

export default function TaskStats() {
  const { projectById } = useData();
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 180);
    const [{ data: profs }, { data: ent }] = await Promise.all([
      supabase.from("profiles").select("id, name"),
      supabase.from("time_entries").select("*").not("stopped_at", "is", null).gte("started_at", since.toISOString()),
    ]);
    const map = {};
    (profs || []).forEach((p) => (map[p.id] = p.name || "—"));
    setPeople(map);
    setRows(ent || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="center" style={{ marginTop: 40 }}><span className="spinner" /></div>;

  const stats = buildTaskStats(rows, projectById);
  const anomalies = findAnomalies(stats);

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Ogni “lavoro” raggruppa le voci con stessa descrizione e stesso progetto. La durata di riferimento è la <b>mediana</b> (quando ci sono almeno 5 registrazioni), altrimenti la durata attesa che hai impostato nel progetto.
      </p>

      {/* Anomalie */}
      {anomalies.length > 0 && (
        <>
          <div className="section-label">⚠️ Voci anomale</div>
          <div className="card">
            {anomalies.slice(0, 12).map((a, i) => (
              <div key={i} className="list-action">
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.task.description}
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {people[a.entry.user_id]} · {fmtDuration(a.seconds)} (di solito {fmtDuration(a.reference)})
                  </span>
                </span>
                <span className="entry-dur" style={{ color: deviationColor(a.pct) }}>{fmtPct(a.pct)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tutti i tipi di lavoro */}
      <div className="section-label">Tutti i lavori</div>
      {stats.length === 0 ? (
        <div className="empty"><div className="empty-emoji">🧩</div>Ancora nessun lavoro registrato.</div>
      ) : (
        <div className="card">
          {stats.map((t) => {
            const isOpen = open[t.key];
            return (
              <div key={t.key} style={{ borderBottom: "1px solid var(--line)" }}>
                <button
                  className="list-action"
                  style={{ width: "100%", textAlign: "left", borderBottom: "none" }}
                  onClick={() => setOpen((o) => ({ ...o, [t.key]: !o[t.key] }))}
                >
                  <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="entry-dot" style={{ background: t.project?.color || "#cfcfca" }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.description}
                      </span>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {t.count}× · mediana {fmtDuration(t.median)}
                        {!t.hasEnoughData && t.estimate ? " (stima)" : ""}
                      </span>
                    </span>
                  </span>
                  <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                </button>

                {isOpen && (
                  <div style={{ padding: "0 14px 12px" }}>
                    <div className="stat-grid" style={{ marginBottom: 8 }}>
                      <div className="stat" style={{ padding: 10 }}><div className="stat-value" style={{ fontSize: 17 }}>{fmtDuration(t.median)}</div><div className="stat-label">Mediana</div></div>
                      <div className="stat" style={{ padding: 10 }}><div className="stat-value" style={{ fontSize: 17 }}>{fmtDuration(t.total)}</div><div className="stat-label">Totale</div></div>
                      <div className="stat" style={{ padding: 10 }}><div className="stat-value" style={{ fontSize: 17 }}>{fmtDuration(t.min)}</div><div className="stat-label">Minimo</div></div>
                      <div className="stat" style={{ padding: 10 }}><div className="stat-value" style={{ fontSize: 17 }}>{fmtDuration(t.max)}</div><div className="stat-label">Massimo</div></div>
                    </div>
                    <div className="card" style={{ boxShadow: "none" }}>
                      {[...t.entries].sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map((e) => {
                        const secs = entrySeconds(e);
                        const p = deviationPct(secs, t.reference);
                        return (
                          <div key={e.id} className="entry" style={{ padding: "10px 12px" }}>
                            <div className="entry-main">
                              <div className="entry-desc" style={{ fontSize: 13.5 }}>
                                {new Date(e.started_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · {people[e.user_id]}
                              </div>
                              <div className="entry-sub">{fmtTime(e.started_at)}</div>
                            </div>
                            <span className="entry-dur" style={{ fontSize: 14 }}>{fmtDuration(secs)}</span>
                            <span style={{ width: 52, textAlign: "right", fontWeight: 700, fontSize: 12.5, color: deviationColor(p) }}>
                              {p == null ? "" : fmtPct(p)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
