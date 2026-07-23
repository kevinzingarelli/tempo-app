import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { entrySeconds, fmtDuration, startOfWeek, dayKey } from "../lib/format.js";
import { IconPlay, IconPlus } from "../lib/icons.jsx";
import Sheet from "./Sheet.jsx";
import Skeleton from "./Skeleton.jsx";
import TaskForm, { PRIORITIES } from "./admin/TaskForm.jsx";
import { askCoach, coachErrorMessage, COACH_NOT_CONFIGURED } from "../lib/coach.js";

// ============================================================
// Task nella Home (v31, ampliato in v32) — solo admin.
// La Home è ora IL posto dei task: si creano, si modificano e si
// avviano da qui (la scheda in Admin non esiste più).
// · TaskQuickList: elenco task con + Nuovo, filtro Miei/Tutti,
//   completati di recente; tocco sul task = modifica, ▶ = timer
// · RunningTaskSteps: la checklist del task DENTRO il timer attivo
// · CoachCard: consiglio del giorno + riepilogo settimanale AI
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

// Carica task (tutti, anche completati) e lista admin. Se la tabella
// non esiste ancora resta silenziosamente vuoto.
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

  const toggleStep = useCallback(async (task, stepId) => {
    const steps = (task.steps || []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    setTasks((a) => a.map((t) => (t.id === task.id ? { ...t, steps } : t)));
    await supabase.from("admin_tasks").update({ steps }).eq("id", task.id);
  }, []);

  return { tasks, admins, toggleStep, reload, loaded };
}

// Il pannello task della Home: elenco, creazione, modifica, avvio timer.
export function TaskQuickList({ tasks, admins, userId, onStart, runningTaskId, taskSecs = {}, reload, projectById, loaded }) {
  const [filter, setFilter] = useState("mine"); // "mine" | "all"
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const today = isoToday();

  const visible = tasks.filter((t) => filter === "all" || t.owner_id === userId);
  const open = sortByUrgency(visible.filter((t) => t.status !== "done"));
  const done = visible
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))
    .slice(0, 5);
  const shown = showAll ? open : open.slice(0, 4);
  const hidden = open.length - shown.length;
  const nameOf = (id) => (admins.find((a) => a.id === id)?.name || "—").split(" ")[0];

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
        <Skeleton rows={2} height={58} style={{ marginTop: 0 }} />
      ) : open.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Nessun task in corso. Tocca "Nuovo" per crearne uno: scadenza, passi spuntabili e via.
          </span>
        </div>
      ) : (
        <div className="card">
          {shown.map((t) => {
            const steps = t.steps || [];
            const doneN = steps.filter((s) => s.done).length;
            const pct = steps.length ? Math.round((doneN / steps.length) * 100) : 0;
            const late = t.due_date && t.due_date < today;
            const secs = taskSecs[t.id] || 0;
            const isRunning = runningTaskId === t.id;
            const pr = PRIORITIES[t.priority] || PRIORITIES.media;
            const proj = projectById ? projectById(t.project_id) : null;
            return (
              <div key={t.id} className="entry">
                <span className="entry-dot" style={{ background: pr.color }} />
                <div className="entry-main" onClick={() => setEditing(t)} style={{ cursor: "pointer" }}>
                  <div className="entry-desc">{t.title}</div>
                  <div className="entry-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {filter === "all" && <span>👤 {nameOf(t.owner_id)}</span>}
                    {steps.length > 0 && <span>{doneN}/{steps.length} passi</span>}
                    {t.due_date && (
                      <span style={late ? { color: "var(--stop)", fontWeight: 700 } : undefined}>
                        {late ? "⚠️ scaduto" : "📅"} {new Date(t.due_date + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {proj && <span>{proj.name}</span>}
                    {secs > 0 && <span>⏱ {fmtDuration(secs)}</span>}
                  </div>
                  {steps.length > 0 && (
                    <div className="growth-bar" style={{ marginTop: 6, height: 5 }}>
                      <div className="growth-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                {isRunning ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ok)", flexShrink: 0 }}>in corso</span>
                ) : (
                  <button
                    className="entry-play"
                    onClick={(e) => { e.stopPropagation(); onStart(t); }}
                    aria-label="Avvia timer sul task"
                  >
                    <IconPlay />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        {hidden > 0 && (
          <button className="link-btn" style={{ fontSize: 12 }} onClick={() => setShowAll(true)}>
            mostra altri {hidden}
          </button>
        )}
        {showAll && open.length > 4 && (
          <button className="link-btn" style={{ fontSize: 12 }} onClick={() => setShowAll(false)}>
            mostra meno
          </button>
        )}
        {done.length > 0 && (
          <button className="link-btn" style={{ fontSize: 12 }} onClick={() => setShowDone((v) => !v)}>
            🌳 completati di recente {showDone ? "▴" : "▾"}
          </button>
        )}
      </div>

      {showDone && done.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          {done.map((t) => (
            <div key={t.id} className="list-action" style={{ opacity: 0.7, cursor: "pointer" }} onClick={() => setEditing(t)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, display: "block", textDecoration: "line-through" }}>{t.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  🌳 {t.completed_at ? new Date(t.completed_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : ""}
                  {filter === "all" ? ` · ${nameOf(t.owner_id)}` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {creating && <TaskForm admins={admins} onClose={() => setCreating(false)} onSaved={reload} />}
      {editing && <TaskForm task={editing} admins={admins} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
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
