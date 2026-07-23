import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../state/AuthContext.jsx";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import { IconPlus, IconCheck } from "../../lib/icons.jsx";
import { askCoach, coachErrorMessage } from "../../lib/coach.js";

// Form di creazione/modifica di un task (v30, estratto in v32 per usarlo
// dalla Home). Titolo, assegnatario, priorità, scadenza, progetto
// collegato, note e checklist di passi — con l'aiuto del coach AI.

export const PRIORITIES = {
  alta: { label: "Alta", color: "var(--stop)", bg: "rgba(224,66,75,0.13)", order: 0 },
  media: { label: "Media", color: "var(--warn)", bg: "rgba(192,127,17,0.13)", order: 1 },
  bassa: { label: "Bassa", color: "var(--ok)", bg: "rgba(47,125,79,0.13)", order: 2 },
};

export default function TaskForm({ task, admins, onClose, onSaved }) {
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
          Con un progetto collegato, dalla Home il task parte con un tocco e le ore finiscono nel posto giusto.
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
