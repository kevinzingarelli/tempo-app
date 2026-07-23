import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { entrySeconds, fmtDuration, startOfWeek, dayKey } from "../lib/format.js";
import { IconPlay } from "../lib/icons.jsx";
import { askCoach, coachErrorMessage, COACH_NOT_CONFIGURED } from "../lib/coach.js";

// ============================================================
// Task nella schermata Timer (v31) — solo admin.
// · TaskQuickList: i task più urgenti, un tocco e parte il timer
// · RunningTaskSteps: la checklist del task DENTRO il timer attivo
// · CoachCard: il consiglio del giorno del coach AI
// ============================================================

const PRIO = {
  alta: { label: "Alta", color: "var(--stop)", order: 0 },
  media: { label: "Media", color: "var(--warn)", order: 1 },
  bassa: { label: "Bassa", color: "var(--ok)", order: 2 },
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sortByUrgency(list) {
  return [...list].sort((a, b) => {
    if ((a.due_date || "9999") !== (b.due_date || "9999"))
      return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
    return (PRIO[a.priority]?.order ?? 1) - (PRIO[b.priority]?.order ?? 1);
  });
}

// Carica i task aperti (per la QuickList e per la checklist nel timer).
// Se la tabella non esiste ancora resta silenziosamente vuoto.
export function useAdminTasks(enabled) {
  const [tasks, setTasks] = useState([]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const { data, error } = await supabase
      .from("admin_tasks")
      .select("*")
      .neq("status", "done")
      .order("created_at", { ascending: false });
    if (!error && data) setTasks(data);
  }, [enabled]);

  useEffect(() => { reload(); }, [reload]);

  const toggleStep = useCallback(async (task, stepId) => {
    const steps = (task.steps || []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    setTasks((a) => a.map((t) => (t.id === task.id ? { ...t, steps } : t)));
    await supabase.from("admin_tasks").update({ steps }).eq("id", task.id);
  }, []);

  return { tasks, toggleStep, reload };
}

// I 3 task più urgenti dell'utente: tocca il ▶ e il timer parte col
// nome del task. taskSecs = secondi già registrati per ciascun task.
export function TaskQuickList({ tasks, userId, onStart, runningTaskId, taskSecs = {} }) {
  const today = isoToday();
  const mine = sortByUrgency(tasks.filter((t) => t.owner_id === userId)).slice(0, 3);
  if (mine.length === 0) return null;

  return (
    <>
      <div className="section-label">I tuoi task 🎯</div>
      <div className="card">
        {mine.map((t) => {
          const steps = t.steps || [];
          const doneN = steps.filter((s) => s.done).length;
          const pct = steps.length ? Math.round((doneN / steps.length) * 100) : 0;
          const late = t.due_date && t.due_date < today;
          const secs = taskSecs[t.id] || 0;
          const isRunning = runningTaskId === t.id;
          const pr = PRIO[t.priority] || PRIO.media;
          return (
            <div key={t.id} className="entry">
              <span className="entry-dot" style={{ background: pr.color }} />
              <div className="entry-main" onClick={() => !isRunning && onStart(t)} style={{ cursor: isRunning ? "default" : "pointer" }}>
                <div className="entry-desc">{t.title}</div>
                <div className="entry-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {steps.length > 0 && <span>{doneN}/{steps.length} passi · {pct}%</span>}
                  {t.due_date && (
                    <span style={late ? { color: "var(--stop)", fontWeight: 700 } : undefined}>
                      {late ? "⚠️ scaduto" : "📅"} {new Date(t.due_date + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {secs > 0 && <span>⏱ {fmtDuration(secs)}</span>}
                </div>
                {steps.length > 0 && (
                  <div className="growth-bar" style={{ marginTop: 6, height: 5 }}>
                    <div className="growth-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              {isRunning ? (
                <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ok)", flexShrink: 0 }}>in corso</span>
              ) : (
                <button className="entry-play" onClick={() => onStart(t)} aria-label="Avvia timer sul task">
                  <IconPlay />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Li gestisci (crei, assegni, completi) in Admin → Task 🎯.
      </p>
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

// ---------- Coach del giorno ----------

// Prepara il riassunto (niente dati economici!) da mandare al coach.
export function buildCoachPayload({ tasks, entries, profile, projectById, userId }) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const todayK = dayKey(now);

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
  const mine = sortByUrgency(tasks.filter((t) => t.owner_id === userId));

  return {
    nome: (profile?.name || "").split(" ")[0] || undefined,
    oggi: now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }),
    ore_oggi: h(oreOggi),
    ore_settimana: h(oreSettimana),
    progetti_settimana: Object.entries(perProgetto)
      .sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([nome, s]) => ({ nome, ore: h(s) })),
    task_aperti: mine.slice(0, 8).map((t) => {
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
        {state.status === "done" && (
          <button className="link-btn" style={{ fontSize: 11.5 }} onClick={fetchAdvice}>nuovo consiglio</button>
        )}
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
    </div>
  );
}
