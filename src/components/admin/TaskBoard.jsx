import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../state/AuthContext.jsx";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import Skeleton from "../Skeleton.jsx";
import { IconPlus, IconCheck } from "../../lib/icons.jsx";
import { entrySeconds, fmtDuration } from "../../lib/format.js";
import { askCoach, coachErrorMessage } from "../../lib/coach.js";
import { buildCoachPayload } from "../TaskPanel.jsx";

// Task gamificati per gli admin (v30) — Kevin e Asia. Ogni task ha
// scadenza, priorità e una checklist di passi: la barra di avanzamento
// cresce a ogni passo completato, così anche i lavori lunghi (es.
// commerciale) mostrano progresso invece di restare "aperti" per settimane.

const PRIORITIES = {
  alta: { label: "Alta", color: "var(--stop)", bg: "rgba(224,66,75,0.13)", order: 0 },
  media: { label: "Media", color: "var(--warn)", bg: "rgba(192,127,17,0.13)", order: 1 },
  bassa: { label: "Bassa", color: "var(--ok)", bg: "rgba(47,125,79,0.13)", order: 2 },
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDue(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
function progressOf(task) {
  const steps = task.steps || [];
  if (task.status === "done") return 100;
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

function TaskForm({ task, admins, onClose, onSaved }) {
  const { user } = useAuth();
  const { toast, activeProjects } = useData();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [ownerId, setOwnerId] = useState(task?.owner_id || user.id);
  const [priority, setPriority] = useState(task?.priority || "media");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [projectId, setProjectId] = useState(task?.project_id || "");
  const [steps, setSteps] = useState(task?.steps || []);
  const [newStep, setNewStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  // Il coach propone i passi partendo da titolo e note (v31).
  async function genSteps() {
    if (!title.trim() || genBusy) return;
    setGenBusy(true);
    try {
      const { steps: gen } = await askCoach("steps", { titolo: title.trim(), note: notes.trim() || undefined });
      if (Array.isArray(gen) && gen.length) {
        setSteps((s) => [
          ...s,
          ...gen.map((text) => ({ id: crypto.randomUUID(), text: String(text).slice(0, 120), done: false })),
        ]);
        toast("Passi proposti dal coach: sistemali come preferisci.", "ok");
      }
    } catch (e) {
      toast(coachErrorMessage(e), "error");
    } finally {
      setGenBusy(false);
    }
  }

  function addStep() {
    const t = newStep.trim();
    if (!t) return;
    setSteps((s) => [...s, { id: crypto.randomUUID(), text: t, done: false }]);
    setNewStep("");
  }
  function toggleStep(id) {
    setSteps((s) => s.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }
  function removeStep(id) {
    setSteps((s) => s.filter((x) => x.id !== id));
  }

  async function save() {
    if (!title.trim()) { toast("Dai un titolo al task.", "error"); return; }
    setBusy(true);
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      owner_id: ownerId,
      priority,
      due_date: dueDate || null,
      project_id: projectId || null,
      steps,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("admin_tasks").update(payload).eq("id", task.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("admin_tasks")
          .insert({ ...payload, created_by: user.id });
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("does not exist") || e?.code === "42P01") {
        toast("Il database non è aggiornato: esegui lo script SQL su Supabase (tabella task).", "error");
      } else {
        toast("Salvataggio non riuscito: " + (e?.message || "riprova"), "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function markDone() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("admin_tasks")
        .update({ status: "done", completed_at: new Date().toISOString(), steps: steps.map((s) => ({ ...s, done: true })) })
        .eq("id", task.id);
      if (error) throw error;
      toast("🌳 Task completato!", "ok");
      onSaved();
      onClose();
    } catch (e) {
      toast("Operazione non riuscita: " + (e?.message || "riprova"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Eliminare il task "${task.title}"? Operazione non annullabile.`)) return;
    const { error } = await supabase.from("admin_tasks").delete().eq("id", task.id);
    if (!error) { onSaved(); onClose(); }
  }

  const doneSteps = steps.filter((s) => s.done).length;

  return (
    <Sheet open={true} onClose={onClose} title={editing ? "Modifica task" : "Nuovo task"}>
      <div className="sheet-row">
        <label className="field-label">Titolo</label>
        <input className="field" placeholder="Es. Preparare offerta cliente X" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Assegnato a</label>
        <select className="field" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name || "Senza nome"}</option>
          ))}
        </select>
      </div>

      <div className="sheet-row">
        <label className="field-label">Priorità</label>
        <div className="segment">
          {Object.entries(PRIORITIES).map(([k, p]) => (
            <button key={k} className={priority === k ? "active" : ""} onClick={() => setPriority(k)}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="sheet-row">
        <label className="field-label">Scadenza (facoltativa)</label>
        <input type="date" className="field" value={dueDate || ""} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Progetto collegato (facoltativo)</label>
        <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Nessun progetto</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
          Con un progetto collegato, dal Timer il task parte con un tocco e le ore finiscono nel posto giusto.
        </p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Note (facoltative)</label>
        <textarea className="field" style={{ minHeight: 56 }} placeholder="Contesto, link, dettagli…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">
          Passi del task {steps.length > 0 && `(${doneSteps}/${steps.length})`}
        </label>
        <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
          Spezza il lavoro in passi: ogni spunta fa avanzare la barra. Perfetto per i task lunghi.
        </p>
        {steps.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
            <button
              onClick={() => toggleStep(s.id)}
              aria-label={s.done ? "Segna da fare" : "Segna fatto"}
              style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                border: s.done ? "none" : "2px solid var(--line-strong)",
                background: s.done ? "var(--ok)" : "transparent",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {s.done && <IconCheck style={{ width: 13, height: 13 }} />}
            </button>
            <span style={{ flex: 1, fontSize: 14, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.6 : 1 }}>
              {s.text}
            </span>
            <button onClick={() => removeStep(s.id)} aria-label="Rimuovi passo" style={{ color: "var(--ink-soft)", padding: 4, fontSize: 15 }}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            className="field"
            style={{ flex: 1 }}
            placeholder="Aggiungi un passo…"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addStep(); }}
          />
          <button className="btn btn-soft" onClick={addStep} disabled={!newStep.trim()}>
            <IconPlus style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={genSteps}
          disabled={!title.trim() || genBusy}
        >
          {genBusy ? <span className="spinner" /> : <>✨ Fatti proporre i passi dal coach</>}
        </button>
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : editing ? "Salva" : "Crea task"}
      </button>

      {editing && task.status !== "done" && (
        <button className="btn btn-soft btn-block" style={{ marginTop: 10 }} onClick={markDone} disabled={busy}>
          <IconCheck style={{ width: 16, height: 16 }} /> Segna come completato
        </button>
      )}
      {editing && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 10, color: "var(--stop)" }} onClick={remove}>
          Elimina task
        </button>
      )}
    </Sheet>
  );
}

export default function TaskBoard() {
  const { user, profile } = useAuth();
  const { toast, entries, projectById } = useData();
  const [tasks, setTasks] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [taskSecs, setTaskSecs] = useState({}); // task_id -> secondi lavorati (tutte le persone)
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("mine"); // "mine" | "all"
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [missingTable, setMissingTable] = useState(false);
  const [weekly, setWeekly] = useState(null); // riepilogo del coach

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, aRes, eRes] = await Promise.all([
        supabase.from("admin_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, name, role, active").eq("role", "admin"),
        // ore realmente lavorate su ciascun task (voci di chiunque)
        supabase
          .from("time_entries")
          .select("task_id, started_at, stopped_at, paused_at, paused_seconds, duration_seconds")
          .not("task_id", "is", null),
      ]);
      if (tRes.error) throw tRes.error;
      setTasks(tRes.data || []);
      setAdmins((aRes.data || []).filter((a) => a.active !== false));
      if (eRes.data) {
        const m = {};
        for (const e of eRes.data) m[e.task_id] = (m[e.task_id] || 0) + entrySeconds(e);
        setTaskSecs(m);
      }
      setMissingTable(false);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("does not exist") || e?.code === "42P01") {
        setMissingTable(true);
      } else {
        toast("Caricamento task non riuscito: " + (e?.message || ""), "error");
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // rapido toggle di un passo direttamente dalla lista (senza aprire il form)
  async function quickToggleStep(task, stepId) {
    const steps = (task.steps || []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    setTasks((a) => a.map((t) => (t.id === task.id ? { ...t, steps } : t)));
    const { error } = await supabase.from("admin_tasks").update({ steps }).eq("id", task.id);
    if (error) { toast("Aggiornamento non riuscito", "error"); load(); }
  }

  const nameOf = (id) => admins.find((a) => a.id === id)?.name || "—";
  const today = isoToday();

  const visible = tasks.filter((t) => filter === "all" || t.owner_id === user.id);
  const open = visible
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const pa = PRIORITIES[a.priority]?.order ?? 1;
      const pb = PRIORITIES[b.priority]?.order ?? 1;
      if ((a.due_date || "9999") !== (b.due_date || "9999")) return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
      return pa - pb;
    });
  const done = visible.filter((t) => t.status === "done").slice(0, 10);

  // Statistiche gamificate
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const doneThisWeek = visible.filter((t) => t.status === "done" && t.completed_at >= weekAgo).length;
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;

  // Riepilogo settimanale scritto dal coach (v31)
  async function askWeekly() {
    setWeekly({ status: "loading" });
    try {
      const base = buildCoachPayload({
        tasks: tasks.filter((t) => t.status !== "done"),
        entries,
        profile,
        projectById,
        userId: user.id,
      });
      const payload = {
        ...base,
        completati_settimana: tasks
          .filter((t) => t.status === "done" && t.completed_at >= weekAgo)
          .map((t) => t.title)
          .slice(0, 12),
      };
      const { text } = await askCoach("weekly", payload);
      setWeekly({ status: "done", text });
    } catch (e) {
      setWeekly(null);
      toast(coachErrorMessage(e), "error");
    }
  }

  if (loading) return <Skeleton rows={4} height={72} />;

  if (missingTable)
    return (
      <div className="banner banner-warn">
        Il database non è ancora pronto per i task: chiedi di eseguire lo script SQL su Supabase.
      </div>
    );

  return (
    <div>
      {/* Riepilogo gamificato */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-value">{open.length}</div><div className="stat-label">In corso</div></div>
        <div className="stat"><div className="stat-value">🏆 {doneThisWeek}</div><div className="stat-label">Completati (7gg)</div></div>
        <div className="stat"><div className="stat-value" style={overdue > 0 ? { color: "var(--stop)" } : undefined}>{overdue}</div><div className="stat-label">In ritardo</div></div>
      </div>

      <button className="link-btn" style={{ fontSize: 12.5, marginBottom: 12 }} onClick={askWeekly}>
        🧠 Chiedi al coach il riepilogo della settimana
      </button>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="segment" style={{ width: "auto" }}>
          <button className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")}>I miei</button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tutti</button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <IconPlus style={{ width: 15, height: 15 }} /> Nuovo task
        </button>
      </div>

      {open.length === 0 && (
        <div className="empty"><div className="empty-emoji">🎯</div>Nessun task in corso. Creane uno per iniziare.</div>
      )}

      {open.map((t) => {
        const pr = PRIORITIES[t.priority] || PRIORITIES.media;
        const pct = progressOf(t);
        const late = t.due_date && t.due_date < today;
        const steps = t.steps || [];
        const nextStep = steps.find((s) => !s.done);
        const proj = projectById(t.project_id);
        const secs = taskSecs[t.id] || 0;
        return (
          <div key={t.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div className="row-between" style={{ alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setEditing(t)}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t.title}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: pr.color, background: pr.bg, fontWeight: 700, padding: "1px 8px", borderRadius: 999, fontSize: 11 }}>{pr.label}</span>
                  {filter === "all" && <span>👤 {nameOf(t.owner_id)}</span>}
                  {t.due_date && (
                    <span style={late ? { color: "var(--stop)", fontWeight: 700 } : undefined}>
                      {late ? "⚠️ scaduto " : "📅 "}{fmtDue(t.due_date)}
                    </span>
                  )}
                  {proj && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span className="entry-dot" style={{ background: proj.color || "#999", width: 8, height: 8 }} />
                      {proj.name}
                    </span>
                  )}
                  {secs > 0 && <span>⏱ {fmtDuration(secs)}</span>}
                </div>
              </div>
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{pct}%</span>
            </div>

            <div className="growth-bar" style={{ marginTop: 10, height: 7 }}>
              <div className="growth-fill" style={{ width: `${pct}%` }} />
            </div>

            {nextStep && (
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, cursor: "pointer" }}
                onClick={() => quickToggleStep(t, nextStep.id)}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--line-strong)", flexShrink: 0 }} />
                <span className="muted" style={{ fontSize: 13 }}>
                  Prossimo passo: <b style={{ color: "var(--ink)" }}>{nextStep.text}</b>
                </span>
              </div>
            )}
          </div>
        );
      })}

      {done.length > 0 && (
        <>
          <div className="section-label">Completati di recente</div>
          <div className="card">
            {done.map((t) => (
              <div key={t.id} className="list-action" style={{ opacity: 0.7 }} onClick={() => setEditing(t)}>
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
        </>
      )}

      {creating && <TaskForm admins={admins} onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <TaskForm task={editing} admins={admins} onClose={() => setEditing(null)} onSaved={load} />}

      {/* Riepilogo settimanale del coach (v31) */}
      <Sheet open={!!weekly} onClose={() => setWeekly(null)} title="🧠 La tua settimana">
        {weekly?.status === "loading" && <Skeleton rows={3} height={20} />}
        {weekly?.status === "done" && (
          <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{weekly.text}</p>
        )}
      </Sheet>
    </div>
  );
}
