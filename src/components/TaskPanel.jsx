import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useData } from "../state/DataContext.jsx";
import { entrySeconds, fmtDuration, startOfWeek, dayKey } from "../lib/format.js";
import { IconPlay, IconPlus } from "../lib/icons.jsx";
import Sheet from "./Sheet.jsx";
import Skeleton from "./Skeleton.jsx";
import TaskForm, { PRIORITIES } from "./admin/TaskForm.jsx";
import { askCoach, coachErrorMessage, COACH_NOT_CONFIGURED } from "../lib/coach.js";

// ============================================================
// Task nella Home (v34 — "Task 2.0") — solo admin.
// · Card SEMPRE esplose: passi con checkbox vere, diario con date,
//   cliente/progetto come nell'app del tempo. Freccina per ripiegare
//   il singolo task (scelta ricordata sul dispositivo).
// · Checkbox del task = completa tutto (con "Annulla" di sicurezza):
//   il task va nell'archivio e sboccia un fiore nel boschetto.
// · Archivio consultabile con ricerca, per riguardare o riaprire.
// ============================================================

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sortByUrgency(list) {
  return [...list].sort((a, b) => {
    if ((a.due_date || "9999") !== (b.due_date || "9999"))
      return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
    return (PRIORITIES[a.priority]?.order ?? 1) - (PRIORITIES[b.priority]?.order ?? 1);
  });
}

// Carica task (tutti, anche completati) e lista admin; updateTask fa
// aggiornamenti ottimistici (la UI risponde subito, il DB segue).
export function useAdminTasks(enabled) {
  const [tasks, setTasks] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const [tRes, aRes] = await Promise.all([
      supabase.from("admin_tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, role, active").eq("role", "admin"),
    ]);
    if (!tRes.error && tRes.data) setTasks(tRes.data);
    if (!aRes.error && aRes.data) setAdmins(aRes.data.filter((a) => a.active !== false));
    setLoaded(true);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  const updateTask = useCallback(async (id, fields) => {
    setTasks((a) => a.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    const { error } = await supabase.from("admin_tasks").update(fields).eq("id", id);
    if (error) reload();
    return !error;
  }, [reload]);

  const toggleStep = useCallback(async (task, stepId) => {
    const steps = (task.steps || []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    await updateTask(task.id, { steps });
  }, [updateTask]);

  return { tasks, admins, toggleStep, updateTask, reload, loaded };
}

// ---------- diario del task ----------
function fmtDiaryDate(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function DiaryBlock({ task, updateTask }) {
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const diary = [...(task.diary || [])].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const shown = showAll ? diary : diary.slice(0, 2);

  function add() {
    const v = text.trim();
    if (!v) return;
    setText("");
    const entry = { id: crypto.randomUUID(), text: v.slice(0, 300), at: new Date().toISOString() };
    updateTask(task.id, { diary: [...(task.diary || []), entry] });
  }

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      {task.notes && (
        <p className="muted" style={{ fontSize: 12, margin: "0 0 6px", fontStyle: "italic" }}>📌 {task.notes}</p>
      )}
      {shown.map((d) => (
        <p key={d.id} style={{ fontSize: 12.5, margin: "0 0 4px", color: "var(--ink-soft)" }}>
          <span className="muted">{fmtDiaryDate(d.at)}</span> — {d.text}
        </p>
      ))}
      {diary.length > 2 && (
        <button className="link-btn" style={{ fontSize: 11.5, marginBottom: 4 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "meno note" : `tutte le note (${diary.length})`}
        </button>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input
          className="field"
          style={{ flex: 1, padding: "7px 10px", fontSize: 13 }}
          placeholder="Aggiungi una nota al diario…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        {text.trim() && (
          <button className="btn btn-soft btn-sm" onClick={add} aria-label="Salva nota">
            <IconPlus style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- il pannello task della Home ----------
const COLLAPSE_KEY = "boschetto_task_collapsed";

export function TaskQuickList({ tasks, admins, userId, onStart, runningTaskId, taskSecs = {}, reload, updateTask, toggleStep, loaded }) {
  const { projectById, clientById, toast } = useData();
  const [filter, setFilter] = useState("mine"); // "mine" | "all"
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); } catch { return new Set(); }
  });
  const [justDone, setJustDone] = useState({}); // id -> snapshot (finestra "Annulla")
  const timersRef = useRef({});

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout); }, []);

  function toggleCollapsed(id) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...n])); } catch { /* pieno */ }
      return n;
    });
  }

  // Spuntare il task lo completa TUTTO (passi inclusi). Resta visibile
  // qualche secondo con "Annulla", poi vola nell'archivio.
  async function completeTask(t) {
    const snapshot = { steps: t.steps || [] };
    setJustDone((m) => ({ ...m, [t.id]: snapshot }));
    await updateTask(t.id, {
      status: "done",
      completed_at: new Date().toISOString(),
      steps: (t.steps || []).map((s) => ({ ...s, done: true })),
    });
    toast("🌸 Task completato: è sbocciato un fiore nel boschetto", "ok");
    timersRef.current[t.id] = setTimeout(() => {
      setJustDone((m) => { const n = { ...m }; delete n[t.id]; return n; });
    }, 6000);
  }
  async function undoComplete(t) {
    clearTimeout(timersRef.current[t.id]);
    const snap = justDone[t.id];
    setJustDone((m) => { const n = { ...m }; delete n[t.id]; return n; });
    await updateTask(t.id, { status: "open", completed_at: null, steps: snap?.steps || t.steps });
  }

  const visible = tasks.filter((t) => filter === "all" || t.owner_id === userId);
  const open = sortByUrgency(visible.filter((t) => t.status !== "done" || justDone[t.id]));
  const archiveCount = visible.filter((t) => t.status === "done").length;
  const nameOf = (id) => (admins.find((a) => a.id === id)?.name || "—").split(" ")[0];
  const today = isoToday();

  return (
    <>
      <div className="row-between" style={{ marginTop: 20, marginBottom: 8 }}>
        <div className="section-label" style={{ margin: 0 }}>I tuoi task 🎯</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {admins.length > 1 && (
            <div className="segment" style={{ width: "auto", padding: 3 }}>
              <button className={filter === "mine" ? "active" : ""} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setFilter("mine")}>Miei</button>
              <button className={filter === "all" ? "active" : ""} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setFilter("all")}>Tutti</button>
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <IconPlus style={{ width: 14, height: 14 }} /> Nuovo
          </button>
        </div>
      </div>

      {!loaded ? (
        <Skeleton rows={2} height={70} style={{ marginTop: 0 }} />
      ) : open.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Nessun task in corso. Tocca "Nuovo" per crearne uno: cliente, scadenza, passi spuntabili e via.
          </span>
        </div>
      ) : (
        open.map((t) => {
          const isDone = !!justDone[t.id] && t.status === "done";
          const isCollapsed = collapsed.has(t.id) && !isDone;
          const steps = t.steps || [];
          const doneN = steps.filter((s) => s.done).length;
          const pct = t.status === "done" ? 100 : steps.length ? Math.round((doneN / steps.length) * 100) : 0;
          const late = t.due_date && t.due_date < today && t.status !== "done";
          const secs = taskSecs[t.id] || 0;
          const isRunning = runningTaskId === t.id;
          const pr = PRIORITIES[t.priority] || PRIORITIES.media;
          const proj = projectById(t.project_id);
          const client = t.client_id ? clientById(t.client_id) : proj?.client_id ? clientById(proj.client_id) : null;
          return (
            <div key={t.id} className="card" style={{ padding: "12px 14px", marginBottom: 10, opacity: isDone ? 0.75 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => (isDone ? undoComplete(t) : completeTask(t))}
                  aria-label={isDone ? "Annulla completamento" : "Completa il task"}
                  style={{ width: 22, height: 22, accentColor: "var(--brand)", flexShrink: 0, cursor: "pointer" }}
                />
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => setEditing(t)}
                >
                  <div style={{ fontWeight: 700, fontSize: 14.5, textDecoration: isDone ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </div>
                </div>
                {isRunning ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ok)", flexShrink: 0 }}>in corso</span>
                ) : (
                  !isDone && (
                    <button className="entry-play" onClick={() => onStart(t)} aria-label="Avvia timer sul task">
                      <IconPlay />
                    </button>
                  )
                )}
                <button
                  onClick={() => toggleCollapsed(t.id)}
                  aria-label={isCollapsed ? "Espandi task" : "Ripiega task"}
                  style={{ color: "var(--ink-faint)", padding: 4, fontSize: 12, flexShrink: 0 }}
                >
                  {isCollapsed ? "▾" : "▴"}
                </button>
              </div>

              {isDone && (
                <div style={{ marginLeft: 33, marginTop: 6, fontSize: 12.5 }}>
                  🌸 Completato ·{" "}
                  <button className="link-btn" style={{ fontSize: 12.5 }} onClick={() => undoComplete(t)}>Annulla</button>
                </div>
              )}

              {!isDone && (
                <>
                  <div className="muted" style={{ fontSize: 12, marginTop: 5, marginLeft: 33, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: pr.color, background: pr.bg, fontWeight: 700, padding: "1px 8px", borderRadius: 999, fontSize: 11 }}>{pr.label}</span>
                    {filter === "all" && <span>👤 {nameOf(t.owner_id)}</span>}
                    {t.due_date && (
                      <span style={late ? { color: "var(--stop)", fontWeight: 700 } : undefined}>
                        {late ? "⚠️ scaduto" : "📅"} {new Date(t.due_date + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {(proj || client) && (
                      <span>{proj ? proj.name : ""}{client ? (proj ? ` (${client.name})` : client.name) : ""}</span>
                    )}
                    {secs > 0 && <span>⏱ {fmtDuration(secs)}</span>}
                  </div>

                  {steps.length > 0 && (
                    <div className="growth-bar" style={{ marginTop: 8, marginLeft: 33, height: 5 }}>
                      <div className="growth-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}

                  {!isCollapsed && (
                    <div style={{ marginLeft: 33 }}>
                      {steps.length > 0 && (
                        <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
                          {steps.map((s) => (
                            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={!!s.done}
                                onChange={() => toggleStep(t, s.id)}
                                style={{ width: 17, height: 17, accentColor: "var(--brand)", flexShrink: 0, cursor: "pointer" }}
                              />
                              <span style={{ textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.55 : 1 }}>
                                {s.text}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <DiaryBlock task={t} updateTask={updateTask} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}

      {loaded && archiveCount > 0 && (
        <button className="link-btn" style={{ fontSize: 12.5 }} onClick={() => setArchiveOpen(true)}>
          🌸 Archivio dei completati ({archiveCount}) →
        </button>
      )}

      {creating && <TaskForm admins={admins} onClose={() => setCreating(false)} onSaved={reload} />}
      {editing && <TaskForm task={editing} admins={admins} onClose={() => setEditing(null)} onSaved={reload} />}
      <ArchiveSheet
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        tasks={tasks}
        admins={admins}
        userId={userId}
        onOpenTask={(t) => { setArchiveOpen(false); setEditing(t); }}
      />
    </>
  );
}

// ---------- archivio dei completati ----------
function ArchiveSheet({ open, onClose, tasks, admins, userId, onOpenTask }) {
  const { projectById, clientById } = useData();
  const [q, setQ] = useState("");
  const [who, setWho] = useState("mine");
  if (!open) return null;

  const norm = (s) => (s || "").toLowerCase();
  const nameOf = (id) => (admins.find((a) => a.id === id)?.name || "—").split(" ")[0];
  const done = tasks
    .filter((t) => t.status === "done" && (who === "all" || t.owner_id === userId))
    .filter((t) => {
      if (!q.trim()) return true;
      const proj = projectById(t.project_id);
      const client = t.client_id ? clientById(t.client_id) : proj?.client_id ? clientById(proj.client_id) : null;
      return norm(t.title + " " + (proj?.name || "") + " " + (client?.name || "")).includes(norm(q.trim()));
    })
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

  // raggruppo per mese di completamento
  const groups = [];
  const byMonth = {};
  for (const t of done) {
    const k = (t.completed_at || "").slice(0, 7);
    if (!byMonth[k]) {
      const label = t.completed_at
        ? new Date(t.completed_at).toLocaleDateString("it-IT", { month: "long", year: "numeric" })
        : "—";
      byMonth[k] = { k, label, items: [] };
      groups.push(byMonth[k]);
    }
    byMonth[k].items.push(t);
  }

  return (
    <Sheet open={open} onClose={onClose} title="🌸 Archivio dei completati">
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Ogni task qui dentro è un fiore nel prato del boschetto. Tocca un task per rivederlo o riaprirlo.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="Cerca per titolo, cliente o progetto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {admins.length > 1 && (
          <div className="segment" style={{ width: "auto", padding: 3 }}>
            <button className={who === "mine" ? "active" : ""} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setWho("mine")}>Miei</button>
            <button className={who === "all" ? "active" : ""} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setWho("all")}>Tutti</button>
          </div>
        )}
      </div>

      {done.length === 0 && (
        <div className="empty"><div className="empty-emoji">🔍</div>{q ? "Nessun task trovato." : "Ancora nessun task completato."}</div>
      )}

      {groups.map((g) => (
        <div key={g.k}>
          <div className="section-label" style={{ textTransform: "capitalize" }}>{g.label}</div>
          <div className="card" style={{ marginBottom: 12 }}>
            {g.items.map((t) => {
              const proj = projectById(t.project_id);
              const client = t.client_id ? clientById(t.client_id) : proj?.client_id ? clientById(proj.client_id) : null;
              return (
                <div key={t.id} className="list-action" style={{ cursor: "pointer" }} onClick={() => onOpenTask(t)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{t.title}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      🌸 {t.completed_at ? new Date(t.completed_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : ""}
                      {proj || client ? ` · ${proj ? proj.name : ""}${client ? (proj ? ` (${client.name})` : client.name) : ""}` : ""}
                      {who === "all" ? ` · ${nameOf(t.owner_id)}` : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// La checklist del task dentro la card del timer attivo: spunti i passi
// mentre lavori, senza cambiare schermata.
export function RunningTaskSteps({ task, onToggle }) {
  if (!task) return null;
  const steps = task.steps || [];
  if (steps.length === 0) return null;
  return (
    <div className="run-steps">
      {steps.map((s) => (
        <button key={s.id} className={"run-step" + (s.done ? " done" : "")} onClick={() => onToggle(task, s.id)}>
          <span className="run-step-check">{s.done ? "✓" : ""}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Coach ----------

// Prepara il riassunto (niente dati economici!) da mandare al coach.
export function buildCoachPayload({ tasks, entries, profile, projectById, userId }) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const todayK = dayKey(now);
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const taskSecs = {};
  let oreOggi = 0, oreSettimana = 0;
  const perProgetto = {};
  for (const e of entries) {
    const secs = entrySeconds(e);
    if (e.task_id) taskSecs[e.task_id] = (taskSecs[e.task_id] || 0) + secs;
    const d = new Date(e.started_at);
    if (dayKey(e.started_at) === todayK) oreOggi += secs;
    if (d >= weekStart) {
      oreSettimana += secs;
      const nome = projectById(e.project_id)?.name || "Senza progetto";
      perProgetto[nome] = (perProgetto[nome] || 0) + secs;
    }
  }

  const h = (s) => Math.round((s / 3600) * 10) / 10;
  const openMine = sortByUrgency(
    tasks.filter((t) => t.owner_id === userId && t.status !== "done")
  );
  const doneWeek = tasks
    .filter((t) => t.status === "done" && (t.completed_at || "") >= weekAgoIso)
    .map((t) => t.title)
    .slice(0, 12);

  return {
    nome: (profile?.name || "").split(" ")[0] || undefined,
    oggi: now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }),
    ore_oggi: h(oreOggi),
    ore_settimana: h(oreSettimana),
    progetti_settimana: Object.entries(perProgetto)
      .sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([nome, s]) => ({ nome, ore: h(s) })),
    completati_settimana: doneWeek,
    task_aperti: openMine.slice(0, 8).map((t) => {
      const steps = t.steps || [];
      return {
        titolo: t.title,
        priorita: t.priority,
        scadenza: t.due_date || null,
        passi_fatti: steps.filter((s) => s.done).length,
        passi_totali: steps.length,
        prossimo_passo: steps.find((s) => !s.done)?.text || null,
        ore_lavorate: h(taskSecs[t.id] || 0),
      };
    }),
  };
}

const adviceKey = (uid) => `boschetto_coach_advice_${uid}`;

export function CoachCard({ tasks, entries, profile, projectById, userId }) {
  const [state, setState] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem(adviceKey(userId)) || "null");
      if (c && c.date === isoToday() && c.text) return { status: "done", text: c.text };
    } catch { /* cache assente o corrotta */ }
    return { status: "idle" };
  });
  const [weekly, setWeekly] = useState(null); // riepilogo settimanale on-demand

  const fetchAdvice = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const payload = buildCoachPayload({ tasks, entries, profile, projectById, userId });
      const { text } = await askCoach("advice", payload);
      try { localStorage.setItem(adviceKey(userId), JSON.stringify({ date: isoToday(), text })); } catch { /* storage pieno */ }
      setState({ status: "done", text });
    } catch (e) {
      if (e?.message === COACH_NOT_CONFIGURED) {
        // non riprovare a ogni apertura in questa sessione
        try { sessionStorage.setItem("boschetto_coach_off", "1"); } catch { /* ignora */ }
        setState({ status: "setup" });
      } else {
        setState({ status: "error", msg: coachErrorMessage(e) });
      }
    }
  }, [tasks, entries, profile, projectById, userId]);

  async function fetchWeekly() {
    setWeekly({ status: "loading" });
    try {
      const payload = buildCoachPayload({ tasks, entries, profile, projectById, userId });
      const { text } = await askCoach("weekly", payload);
      setWeekly({ status: "done", text });
    } catch (e) {
      setWeekly({ status: "error", msg: coachErrorMessage(e) });
    }
  }

  // Un consiglio al giorno, in automatico (poi resta in cache locale).
  useEffect(() => {
    if (state.status !== "idle") return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (sessionStorage.getItem("boschetto_coach_off")) { setState({ status: "setup" }); return; }
    fetchAdvice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "setup") return null; // coach non configurato: nessun rumore

  return (
    <div className="card coach-card">
      <div className="row-between">
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>🧠 Il coach</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="link-btn" style={{ fontSize: 11.5 }} onClick={fetchWeekly}>riepilogo settimana</button>
          {state.status === "done" && (
            <button className="link-btn" style={{ fontSize: 11.5 }} onClick={fetchAdvice}>nuovo consiglio</button>
          )}
        </div>
      </div>
      {state.status === "loading" && <div className="skel" style={{ height: 40, marginTop: 8 }} />}
      {state.status === "done" && (
        <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "7px 0 0", color: "var(--ink-soft)" }}>{state.text}</p>
      )}
      {state.status === "error" && (
        <p className="muted" style={{ fontSize: 12.5, margin: "7px 0 0" }}>
          {state.msg}{" "}
          <button className="link-btn" style={{ fontSize: 12.5 }} onClick={fetchAdvice}>riprova</button>
        </p>
      )}

      <Sheet open={!!weekly} onClose={() => setWeekly(null)} title="🧠 La tua settimana">
        {weekly?.status === "loading" && <Skeleton rows={3} height={20} />}
        {weekly?.status === "done" && (
          <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{weekly.text}</p>
        )}
        {weekly?.status === "error" && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{weekly.msg}</p>
        )}
      </Sheet>
    </div>
  );
}
