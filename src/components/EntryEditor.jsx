import { useState } from "react";
import { useData } from "../state/DataContext.jsx";
import Sheet from "./Sheet.jsx";
import ProjectPicker from "./ProjectPicker.jsx";
import TagInput from "./TagInput.jsx";
import {
  parseDurationInput,
  combineDateTime,
  toDateInput,
  toTimeInput,
  fmtDuration,
} from "../lib/format.js";
import { IconChevron, IconTrash, IconStar } from "../lib/icons.jsx";

export default function EntryEditor({ open, onClose, entry }) {
  const { addEntry, updateEntry, deleteEntry, addFavorite, projectById } = useData();
  const editing = !!entry;
  const isRunning = editing && !entry.stopped_at;

  const [mode, setMode] = useState(editing ? "time" : "duration");
  const [description, setDescription] = useState(entry?.description || "");
  const [projectId, setProjectId] = useState(entry?.project_id || null);
  const [tags, setTags] = useState(entry?.tags || []);
  const [billable, setBillable] = useState(entry?.billable || false);
  const [note, setNote] = useState(entry?.note || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [err, setErr] = useState(null);

  const initDate = entry ? toDateInput(entry.started_at) : toDateInput(new Date());
  const [date, setDate] = useState(initDate);
  const [durText, setDurText] = useState(
    entry ? fmtDuration(entry.duration_seconds || 0).replace(" ", "") : ""
  );
  const [startT, setStartT] = useState(
    entry ? toTimeInput(entry.started_at) : "09:00"
  );
  const [endT, setEndT] = useState(
    entry?.stopped_at ? toTimeInput(entry.stopped_at) : "10:00"
  );

  const project = projectById(projectId);

  function reset() {
    setErr(null);
  }

  async function save() {
    setErr(null);
    let started_at, stopped_at;

    // timer in corso: si cambia solo l'inizio, la fine resta aperta
    if (isRunning) {
      const s2 = combineDateTime(date, startT);
      const limit = entry.paused_at ? new Date(entry.paused_at) : new Date();
      if (s2 >= limit) {
        setErr("L'inizio deve essere prima di adesso.");
        return;
      }
      await updateEntry(entry.id, {
        description,
        project_id: projectId,
        tags,
        billable,
        note: note.trim() || null,
        started_at: s2.toISOString(),
      });
      onClose();
      return;
    }

    if (mode === "duration") {
      const secs = parseDurationInput(durText);
      if (!secs || secs <= 0) {
        setErr('Durata non valida. Esempi: "2h", "1:30", "1,5".');
        return;
      }
      const base = combineDateTime(date, "12:00");
      started_at = base.toISOString();
      stopped_at = new Date(base.getTime() + secs * 1000).toISOString();
    } else {
      const s = combineDateTime(date, startT);
      const e = combineDateTime(date, endT);
      if (e <= s) {
        setErr("L'orario di fine deve essere dopo l'inizio.");
        return;
      }
      started_at = s.toISOString();
      stopped_at = e.toISOString();
    }

    const payload = {
      description,
      project_id: projectId,
      tags,
      billable,
      note: note.trim() || null,
      started_at,
      stopped_at,
      paused_at: null,
      paused_seconds: 0,
    };

    if (editing) {
      await updateEntry(entry.id, payload);
    } else {
      await addEntry(payload);
    }
    onClose();
  }

  async function onDelete() {
    await deleteEntry(entry.id);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isRunning ? "Modifica timer in corso" : editing ? "Modifica voce" : "Aggiungi ore"}
    >
      {/* Descrizione */}
      <div className="sheet-row">
        <label className="field-label">Descrizione</label>
        <input
          className="field"
          placeholder="Cosa hai fatto?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Nota interna */}
      <div className="sheet-row">
        <label className="field-label">Nota interna (facoltativa)</label>
        <textarea
          className="field"
          style={{ minHeight: 60, resize: "vertical" }}
          placeholder="Dettagli utili per il cliente o per te…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Progetto */}
      <div className="sheet-row">
        <label className="field-label">Progetto</label>
        <button
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            textAlign: "left",
          }}
          onClick={() => setPickerOpen(true)}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {project ? (
              <>
                <span
                  className="entry-dot"
                  style={{ background: project.color || "#999" }}
                />
                <span style={{ fontWeight: 600 }}>{project.name}</span>
              </>
            ) : (
              <span className="muted">Nessun progetto</span>
            )}
          </span>
          <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
        </button>
      </div>

      {/* Modalità durata / orario */}
      <div className="sheet-row">
        {!isRunning && (
        <div className="segment" style={{ marginBottom: 12 }}>
          <button
            className={mode === "duration" ? "active" : ""}
            onClick={() => {
              setMode("duration");
              reset();
            }}
          >
            Durata
          </button>
          <button
            className={mode === "time" ? "active" : ""}
            onClick={() => {
              setMode("time");
              reset();
            }}
          >
            Orario
          </button>
        </div>
        )}

        <label className="field-label">Data</label>
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {isRunning ? (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Inizio</label>
              <input
                className="field"
                type="time"
                value={startT}
                onChange={(e) => setStartT(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
              <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
                Il timer continua a correre: sposti solo l'inizio.
              </p>
            </div>
          </div>
        ) : mode === "duration" ? (
          <>
            <label className="field-label">Durata</label>
            <input
              className="field"
              placeholder='Es. 2h, 1:30, 1,5'
              value={durText}
              autoCapitalize="none"
              onChange={(e) => setDurText(e.target.value)}
            />
            <div className="chips" style={{ marginTop: 8 }}>
              {[["−15m", -900], ["+15m", 900], ["+1h", 3600]].map(([lbl, delta]) => (
                <button
                  key={lbl}
                  className="chip"
                  onClick={() => {
                    const cur = parseDurationInput(durText) || 0;
                    const next = Math.max(0, cur + delta);
                    setDurText(fmtDuration(next).replace(" ", ""));
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Inizio</label>
              <input
                className="field"
                type="time"
                value={startT}
                onChange={(e) => setStartT(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Fine</label>
              <input
                className="field"
                type="time"
                value={endT}
                onChange={(e) => setEndT(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tag */}
      <div className="sheet-row">
        <label className="field-label">Tag</label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      {/* Fatturabile */}
      <div className="sheet-row">
        <button
          className="list-action card"
          style={{ width: "100%" }}
          onClick={() => setBillable((b) => !b)}
        >
          <span style={{ fontWeight: 600 }}>Fatturabile</span>
          <Toggle on={billable} />
        </button>
      </div>

      {err && <div className="banner banner-warn">{err}</div>}

      <button className="btn btn-primary btn-block btn-lg" onClick={save}>
        {editing ? "Salva modifiche" : "Aggiungi"}
      </button>

      {editing && (
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            className="btn btn-soft"
            style={{ flex: 1 }}
            onClick={() =>
              addFavorite({ description, project_id: projectId, tags })
            }
          >
            <IconStar style={{ width: 16, height: 16 }} /> Preferito
          </button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={onDelete}>
            <IconTrash style={{ width: 16, height: 16 }} /> Elimina
          </button>
        </div>
      )}

      <ProjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={projectId}
        onChange={setProjectId}
      />
    </Sheet>
  );
}

function Toggle({ on }) {
  return (
    <span
      style={{
        width: 46,
        height: 28,
        borderRadius: 999,
        background: on ? "#1f9d6b" : "#d9d9d2",
        position: "relative",
        transition: "background .2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .2s",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }}
      />
    </span>
  );
}
