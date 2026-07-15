import { useState, useEffect, useRef } from "react";
import { useData } from "../state/DataContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import EntryRow from "../components/EntryRow.jsx";
import EntryEditor from "../components/EntryEditor.jsx";
import ProjectPicker from "../components/ProjectPicker.jsx";
import Sheet from "../components/Sheet.jsx";
import {
  fmtClock,
  fmtDuration,
  entrySeconds,
  dayLabel,
  dayKey,
} from "../lib/format.js";
import {
  IconPlay,
  IconStop,
  IconPlus,
  IconChevron,
  IconStar,
  IconLogout,
} from "../lib/icons.jsx";

export default function Timer() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const {
    runningEntry,
    entries,
    favorites,
    startTimer,
    stopTimer,
    updateRunning,
    startFromFavorite,
    removeFavorite,
    projectById,
    loading,
  } = useData();

  const [now, setNow] = useState(Date.now());
  const [draftDesc, setDraftDesc] = useState("");
  const [draftProject, setDraftProject] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorEntry, setEditorEntry] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const lastRunId = useRef(null);

  // tick ogni secondo quando il timer corre
  useEffect(() => {
    if (!runningEntry) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningEntry]);

  // sincronizza i campi quando parte/cambia il timer in corso
  useEffect(() => {
    const id = runningEntry?.id || null;
    if (id !== lastRunId.current) {
      lastRunId.current = id;
      if (runningEntry) {
        setDraftDesc(runningEntry.description || "");
        setDraftProject(runningEntry.project_id || null);
      }
    }
  }, [runningEntry]);

  const running = !!runningEntry;
  const elapsed = running ? entrySeconds(runningEntry, now) : 0;
  const activeProject = projectById(draftProject);

  function onStart() {
    startTimer({
      description: draftDesc,
      project_id: draftProject,
      tags: [],
      billable: projectById(draftProject)?.billable_default || false,
    });
  }
  function onStop() {
    stopTimer();
    setDraftDesc("");
    setDraftProject(null);
  }

  function handleProjectChange(id) {
    setDraftProject(id);
    if (running) updateRunning({ project_id: id });
  }
  function handleDescBlur() {
    if (running && draftDesc !== runningEntry.description) {
      updateRunning({ description: draftDesc });
    }
  }

  // raggruppa per giorno (escludendo il timer in corso, mostrato nel card)
  const completed = entries.filter((e) => e.stopped_at);
  const groups = [];
  const byDay = {};
  for (const e of completed) {
    const k = dayKey(e.started_at);
    if (!byDay[k]) {
      byDay[k] = { key: k, label: dayLabel(e.started_at), items: [], total: 0 };
      groups.push(byDay[k]);
    }
    byDay[k].items.push(e);
    byDay[k].total += entrySeconds(e);
  }

  return (
    <div className="screen">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="screen-title">Ciao{profile?.name ? ", " + profile.name.split(" ")[0] : ""}</div>
          <div className="screen-sub" style={{ marginBottom: 0 }}>
            {running ? "Timer in corso" : "Pronto a registrare"}
          </div>
        </div>
        <button
          onClick={() => setAccountOpen(true)}
          aria-label="Account"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#27264d",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {(profile?.name || "?").trim().charAt(0).toUpperCase()}
        </button>
      </div>

      {/* TIMER HERO */}
      <div className={"timer-card" + (running ? " running" : "")}>
        <input
          className="inline-desc"
          placeholder={running ? "Aggiungi una descrizione" : "Su cosa lavori?"}
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          onBlur={handleDescBlur}
        />

        <div className="timer-readout">{fmtClock(elapsed)}</div>

        <button
          onClick={() => setPickerOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            marginTop: 4,
            color: running ? "rgba(255,255,255,.92)" : "var(--ink-soft)",
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {activeProject ? (
            <>
              <span
                className="entry-dot"
                style={{ background: activeProject.color || "#fff" }}
              />
              {activeProject.name}
            </>
          ) : (
            "Scegli progetto"
          )}
          <IconChevron style={{ width: 15, height: 15, opacity: 0.7 }} />
        </button>

        <div className="timer-controls">
          {running ? (
            <button className="btn btn-stop btn-lg" onClick={onStop}>
              <IconStop /> Ferma
            </button>
          ) : (
            <button className="btn btn-start btn-lg" onClick={onStart}>
              <IconPlay /> Avvia
            </button>
          )}
        </div>
      </div>

      {/* Azioni rapide */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAddOpen(true)}>
          <IconPlus style={{ width: 17, height: 17 }} /> Aggiungi manualmente
        </button>
      </div>

      {/* Preferiti */}
      {favorites.length > 0 && (
        <>
          <div className="section-label">Preferiti</div>
          <div className="card">
            {favorites.map((f) => {
              const p = projectById(f.project_id);
              return (
                <div key={f.id} className="entry">
                  <span
                    className="entry-dot"
                    style={{ background: p?.color || "#cfcfca" }}
                  />
                  <div
                    className="entry-main"
                    onClick={() => startFromFavorite(f)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="entry-desc">
                      {f.description || <span className="muted">Senza descrizione</span>}
                    </div>
                    {p && <div className="entry-sub">{p.name}</div>}
                  </div>
                  <button
                    className="entry-play"
                    onClick={() => startFromFavorite(f)}
                    aria-label="Avvia preferito"
                  >
                    <IconPlay />
                  </button>
                  <button
                    onClick={() => removeFavorite(f.id)}
                    style={{ color: "#c0c0c0", padding: 4 }}
                    aria-label="Rimuovi preferito"
                  >
                    <IconStar style={{ width: 18, height: 18, color: "#ffb400" }} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Storico */}
      {loading && completed.length === 0 ? (
        <div className="center" style={{ marginTop: 40 }}>
          <span className="spinner" />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">⏱️</div>
          Nessuna voce ancora. Avvia il timer o aggiungi le ore manualmente.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <div className="section-label">{g.label}</div>
            <div className="day-total">
              <span className="t-label">Totale</span>
              <span className="t-value">{fmtDuration(g.total)}</span>
            </div>
            <div className="card">
              {g.items.map((e) => (
                <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Sheet */}
      <ProjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={draftProject}
        onChange={handleProjectChange}
      />
      {addOpen && <EntryEditor open={addOpen} onClose={() => setAddOpen(false)} />}
      {editorEntry && (
        <EntryEditor
          open={!!editorEntry}
          onClose={() => setEditorEntry(null)}
          entry={editorEntry}
        />
      )}

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title="Account">
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>{profile?.name || "—"}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {user?.email}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {isAdmin ? "Amministratore" : "Utente"}
          </div>
        </div>
        <button className="btn btn-danger btn-block btn-lg" onClick={signOut}>
          <IconLogout style={{ width: 17, height: 17 }} /> Esci
        </button>
      </Sheet>
    </div>
  );
}
