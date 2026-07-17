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
  IconEdit,
} from "../lib/icons.jsx";
import { supabase } from "../lib/supabase";
import { getThemePref, setThemePref } from "../lib/theme.js";
import { CHANGELOG, hasUnseenNews, markNewsSeen } from "../lib/changelog.js";

export default function Timer() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const {
    runningEntry,
    entries,
    favorites,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    updateRunning,
    startFromFavorite,
    removeFavorite,
    projectById,
    clientById,
    descSuggestions,
    loading,
  } = useData();

  const [now, setNow] = useState(Date.now());
  const [draftDesc, setDraftDesc] = useState("");
  const [draftProject, setDraftProject] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorEntry, setEditorEntry] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [descFocus, setDescFocus] = useState(false);
  const [search, setSearch] = useState("");
  const [themePref, setThemePrefState] = useState(getThemePref());
  const [goalText, setGoalText] = useState("");
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsBadge, setNewsBadge] = useState(hasUnseenNews());
  const lastRunId = useRef(null);

  const { reloadProfile } = useAuth();
  const { toast } = useData();

  function chooseTheme(p) {
    setThemePref(p);
    setThemePrefState(p);
  }

  useEffect(() => {
    if (accountOpen) {
      setGoalText(
        profile?.weekly_goal_hours != null ? String(profile.weekly_goal_hours) : ""
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen]);

  async function saveGoal() {
    const v = goalText.trim() === "" ? null : Number(goalText.replace(",", "."));
    if (v != null && (Number.isNaN(v) || v < 0 || v > 100)) {
      toast("Inserisci un numero di ore valido.", "error");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ weekly_goal_hours: v })
      .eq("id", user.id);
    if (error) toast("Salvataggio non riuscito.", "error");
    else {
      toast("Obiettivo salvato.", "ok");
      reloadProfile();
    }
  }

  function openNews() {
    setNewsOpen(true);
    markNewsSeen();
    setNewsBadge(false);
  }

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
  const paused = running && !!runningEntry.paused_at;
  const elapsed = running ? entrySeconds(runningEntry, now) : 0;
  const activeProject = projectById(draftProject);

  // Avviso timer dimenticato: oltre 4 ore consecutive
  const longRunning = running && !paused && elapsed > 4 * 3600;

  // Suggerimenti descrizione (dal proprio storico)
  const suggestions =
    descFocus && !running
      ? descSuggestions
          .filter((s) =>
            draftDesc.trim()
              ? s.text.toLowerCase().includes(draftDesc.trim().toLowerCase()) &&
                s.text.toLowerCase() !== draftDesc.trim().toLowerCase()
              : true
          )
          .slice(0, 4)
      : [];

  function pickSuggestion(s) {
    setDraftDesc(s.text);
    if (!draftProject && s.project_id) setDraftProject(s.project_id);
    setDescFocus(false);
  }

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
  const q = search.trim().toLowerCase();
  const completed = entries.filter((e) => {
    if (!e.stopped_at) return false;
    if (!q) return true;
    const proj = projectById(e.project_id);
    return (
      (e.description || "").toLowerCase().includes(q) ||
      (proj?.name || "").toLowerCase().includes(q) ||
      (e.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });
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
            {paused ? "Timer in pausa" : running ? "Timer in corso" : "Pronto a registrare"}
          </div>
        </div>
        <button
          onClick={() => setAccountOpen(true)}
          aria-label="Account"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--brand)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            position: "relative",
          }}
        >
          {(profile?.name || "?").trim().charAt(0).toUpperCase()}
          {newsBadge && (
            <span
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: "var(--hot-b)",
                border: "2px solid var(--paper)",
              }}
            />
          )}
        </button>
      </div>

      {/* TIMER HERO */}
      <div
        className={
          "timer-card" +
          (running && !paused ? " running" : "") +
          (paused ? " paused" : "")
        }
      >
        {running && (
          <button
            className="card-edit"
            onClick={() => setEditorEntry(runningEntry)}
            aria-label="Modifica timer in corso"
          >
            <IconEdit style={{ width: 16, height: 16 }} />
          </button>
        )}
        {paused && <div className="paused-badge">In pausa</div>}

        <div className="suggest-wrap">
          <input
            className="inline-desc"
            placeholder={running ? "Aggiungi una descrizione" : "Su cosa lavori?"}
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            onFocus={() => setDescFocus(true)}
            onBlur={() => {
              handleDescBlur();
              setTimeout(() => setDescFocus(false), 150);
            }}
          />
          {suggestions.length > 0 && (
            <div className="suggest-list">
              {suggestions.map((s, i) => {
                const p = projectById(s.project_id);
                return (
                  <button
                    key={i}
                    className="suggest-item"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                  >
                    {p && <span className="entry-dot" style={{ background: p.color }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.text}
                    </span>
                    <span className="s-count">{s.count}×</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="timer-readout">{fmtClock(elapsed)}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              color: running || paused ? "rgba(255,255,255,.92)" : "var(--ink-soft)",
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
                {activeProject.client_id && clientById(activeProject.client_id) && (
                  <span style={{ opacity: 0.75, fontWeight: 500 }}>
                    · {clientById(activeProject.client_id).name}
                  </span>
                )}
              </>
            ) : (
              "Scegli progetto"
            )}
            <IconChevron style={{ width: 15, height: 15, opacity: 0.7 }} />
          </button>

        </div>

        {longRunning && (
          <div
            className="paused-badge"
            style={{ background: "rgba(255,255,255,0.22)", marginTop: 10 }}
          >
            ⏳ In corso da più di 4 ore — tutto ok?
          </div>
        )}

        <div className="timer-controls" style={{ display: "flex", gap: 10 }}>
          {!running && (
            <button className="btn btn-start btn-lg" style={{ flex: 1 }} onClick={onStart}>
              <IconPlay /> Avvia
            </button>
          )}
          {running && !paused && (
            <>
              <button className="btn btn-pause btn-lg" style={{ flex: 1 }} onClick={pauseTimer}>
                ❚❚ Pausa
              </button>
              <button className="btn btn-stop btn-lg" style={{ flex: 1 }} onClick={onStop}>
                <IconStop /> Ferma
              </button>
            </>
          )}
          {paused && (
            <>
              <button className="btn btn-resume btn-lg" style={{ flex: 1 }} onClick={resumeTimer}>
                <IconPlay /> Riprendi
              </button>
              <button className="btn btn-stop btn-lg" style={{ flex: 1 }} onClick={onStop}>
                <IconStop /> Ferma
              </button>
            </>
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

      {/* Ricerca nello storico */}
      {(entries.filter((e) => e.stopped_at).length > 8 || search) && (
        <div style={{ marginTop: 16 }}>
          <input
            className="field"
            placeholder="Cerca nelle tue voci…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Storico */}
      {loading && completed.length === 0 ? (
        <div className="center" style={{ marginTop: 40 }}>
          <span className="spinner" />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">{q ? "🔍" : "⏱️"}</div>
          {q
            ? "Nessuna voce trovata negli ultimi 70 giorni."
            : "Nessuna voce ancora. Avvia il timer o aggiungi le ore manualmente."}
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

        <div className="sheet-row">
          <label className="field-label">Aspetto</label>
          <div className="segment">
            {[["auto", "Auto"], ["light", "Chiaro"], ["dark", "Scuro"]].map(([v, l]) => (
              <button
                key={v}
                className={themePref === v ? "active" : ""}
                onClick={() => chooseTheme(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet-row">
          <label className="field-label">Il mio obiettivo settimanale (ore)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="field"
              style={{ flex: 1 }}
              inputMode="decimal"
              placeholder="Es. 20"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
            />
            <button className="btn btn-primary" onClick={saveGoal}>
              Salva
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            Un traguardo che scegli tu, solo per te. Lo vedi nella sezione "Per te".
            Lascia vuoto per rimuoverlo.
          </p>
        </div>

        <button
          className="btn btn-ghost btn-block"
          style={{ marginBottom: 10 }}
          onClick={openNews}
        >
          ✨ Novità dell'app
        </button>

        <button className="btn btn-danger btn-block btn-lg" onClick={signOut}>
          <IconLogout style={{ width: 17, height: 17 }} /> Esci
        </button>
      </Sheet>

      <Sheet open={newsOpen} onClose={() => setNewsOpen(false)} title="Novità">
        {CHANGELOG.map((v) => (
          <div key={v.version} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>
              {v.title}
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>
              {v.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
