import { useState, useEffect, useRef } from "react";
import { useData } from "../state/DataContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import EntryRow from "../components/EntryRow.jsx";
import DayView from "../components/DayView.jsx";
import DayGoogle from "../components/DayGoogle.jsx";
import GrowthTree from "../components/GrowthTree.jsx";
import TeamNote from "../components/TeamNote.jsx";
import EntryEditor from "../components/EntryEditor.jsx";
import ProjectPicker from "../components/ProjectPicker.jsx";
import Sheet from "../components/Sheet.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { useAdminTasks, TaskQuickList, RunningTaskSteps, CoachCard } from "../components/TaskPanel.jsx";
import {
  fmtClock,
  fmtDuration,
  entrySeconds,
  dayLabel,
  dayKey,
  startOfWeek,
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
import { APP_NAME, visibleChangelog, hasUnseenNews, markNewsSeen } from "../lib/changelog.js";

export default function Timer() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const {
    runningEntry,
    runningEntries,
    entries,
    favorites,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    updateRunning,
    startFromFavorite,
    startFromEntry,
    startFromTask,
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
  const [expandedDays, setExpandedDays] = useState(() => new Set()); // giorni (non oggi) aperti manualmente
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set()); // settimane passate aperte manualmente
  const [themePref, setThemePrefState] = useState(getThemePref());
  const [goalText, setGoalText] = useState("");
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsBadge, setNewsBadge] = useState(() => hasUnseenNews(isAdmin));
  const [showTree, setShowTree] = useState(() => localStorage.getItem("boschetto_show_tree") !== "0");
  const [calDay, setCalDay] = useState(() => new Date());
  const lastKnownToday = useRef(new Date().toDateString());

  // Le PWA su iPhone restano "congelate" quando le riapri: se lasci l'app
  // aperta durante la notte, il calendario resterebbe sul giorno vecchio.
  // Quando l'app torna in primo piano controllo se è scattata la mezzanotte:
  // se sì E stavi guardando "oggi" (non un altro giorno a cui eri andato di
  // proposito), sposto la vista sul nuovo oggi. Se avevi navigato altrove
  // intenzionalmente, non tocco nulla.
  useEffect(() => {
    function checkDayRollover() {
      if (document.visibilityState !== "visible") return;
      const realToday = new Date().toDateString();
      if (realToday === lastKnownToday.current) return; // nessun cambio di giorno
      setCalDay((d) => {
        const wasOnOldToday = d.toDateString() === lastKnownToday.current;
        lastKnownToday.current = realToday;
        return wasOnOldToday ? new Date() : d;
      });
    }
    document.addEventListener("visibilitychange", checkDayRollover);
    window.addEventListener("focus", checkDayRollover);
    return () => {
      document.removeEventListener("visibilitychange", checkDayRollover);
      window.removeEventListener("focus", checkDayRollover);
    };
  }, []);
  const [parallelOpen, setParallelOpen] = useState(false);
  const [favToStart, setFavToStart] = useState(null); // preferito in attesa di scelta (v28)
  const [taskToStart, setTaskToStart] = useState(null); // task in attesa di scelta (v31)
  const [draftTaskId, setDraftTaskId] = useState(null); // task collegato al prossimo avvio (v31)
  const [parallelDesc, setParallelDesc] = useState("");
  const [parallelProject, setParallelProject] = useState(null);
  const [parallelPickerOpen, setParallelPickerOpen] = useState(false);
  const [dayRange, setDayRange] = useState({ min: null, max: null });
  const [calZoom, setCalZoom] = useState(1);
  const [googleRange, setGoogleRange] = useState({ min: null, max: null });
  const lastRunId = useRef(null);

  function toggleTree() {
    setShowTree((v) => {
      const nv = !v;
      localStorage.setItem("boschetto_show_tree", nv ? "1" : "0");
      return nv;
    });
  }

  const { reloadProfile } = useAuth();
  const { toast } = useData();

  // Task admin nella Home (v31/v32): elenco con creazione e modifica,
  // checklist nel timer attivo e ore accumulate per task.
  const { tasks: adminTasks, admins: taskAdmins, toggleStep: toggleTaskStep, updateTask: updateAdminTask, reload: reloadTasks, loaded: tasksLoaded } = useAdminTasks(isAdmin);
  const taskSecs = {};
  if (isAdmin) {
    for (const e of entries) {
      if (e.task_id) taskSecs[e.task_id] = (taskSecs[e.task_id] || 0) + entrySeconds(e);
    }
  }

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

  // sincronizza i campi quando parte/cambia il timer in corso.
  // Quando il timer passa da attivo a fermo (id diventa null), azzero i campi
  // così il prossimo avvio parte pulito e non ripropone l'ultimo progetto.
  useEffect(() => {
    const id = runningEntry?.id || null;
    if (id !== lastRunId.current) {
      const wasRunning = lastRunId.current !== null;
      lastRunId.current = id;
      if (runningEntry) {
        setDraftDesc(runningEntry.description || "");
        setDraftProject(runningEntry.project_id || null);
        setDraftTaskId(runningEntry.task_id || null);
      } else if (wasRunning) {
        // il timer è appena stato fermato: ripulisco i campi
        setDraftDesc("");
        setDraftProject(null);
        setDraftTaskId(null);
      }
    }
  }, [runningEntry]);

  // Scorciatoie da tastiera (utile da computer): Spazio = pausa/riprendi,
  // Invio = ferma. Attive solo quando non si sta scrivendo in un campo e
  // non ci sono pannelli aperti.
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if (typing) return;
      const anySheetOpen = pickerOpen || accountOpen || newsOpen || addOpen || !!editorEntry || parallelOpen;
      if (anySheetOpen) return;
      if (!runningEntry) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (runningEntry.paused_at) resumeTimer(runningEntry.id);
        else pauseTimer(runningEntry.id);
      } else if (e.code === "Enter") {
        e.preventDefault();
        onStop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningEntry, pickerOpen, accountOpen, newsOpen, addOpen, editorEntry, parallelOpen]);

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
      task_id: draftTaskId,
    });
  }
  function onStop() {
    stopTimer(runningEntry?.id);
    setDraftDesc("");
    setDraftProject(null);
    setDraftTaskId(null);
  }

  // Avvio da preferito (v28): se c'è già un timer attivo, chiedo cosa fare
  // invece di sostituirlo in silenzio. Gli admin possono anche avviarlo in
  // parallelo; i dipendenti confermano la sostituzione.
  function handleFavoriteClick(f) {
    if (running) {
      setPickerOpen(false); // evita pannelli sovrapposti
      setFavToStart(f);
    } else {
      startFromFavorite(f);
    }
  }

  // Avvio dal task (v31, admin): come per i preferiti, se c'è già un timer
  // chiedo cosa fare. Se il task non ha un progetto collegato, precompilo
  // descrizione + collegamento e apro la scelta progetto: poi basta "Avvia".
  function handleTaskClick(t) {
    if (running) {
      setTaskToStart(t);
    } else if (t.project_id) {
      startFromTask(t);
    } else {
      setDraftDesc(t.title);
      setDraftTaskId(t.id);
      setPickerOpen(true);
    }
  }

  // Timer in parallelo — riservato agli admin (Kevin, Asia). Avvia un
  // secondo (o terzo…) timer SENZA fermare quelli già in corso.
  function onStartParallel() {
    if (!parallelDesc.trim() && !parallelProject) return;
    startTimer({
      description: parallelDesc,
      project_id: parallelProject,
      tags: [],
      billable: projectById(parallelProject)?.billable_default || false,
      parallel: true,
    });
    setParallelDesc("");
    setParallelProject(null);
    setParallelOpen(false);
  }

  // Gli "altri" timer attivi, esclusi quello mostrato in primo piano.
  const otherRunning = runningEntries.filter((e) => e.id !== runningEntry?.id);

  function handleProjectChange(id) {
    setDraftProject(id);
    if (running) updateRunning({ project_id: id });
  }
  function handleDescBlur() {
    if (running && draftDesc !== runningEntry.description) {
      updateRunning({ description: draftDesc });
    }
  }

  // ---- Riepilogo di fine giornata ----
  const todayKey = dayKey(new Date());
  const todayItems = entries.filter((e) => e.stopped_at && dayKey(e.started_at) === todayKey);
  const todaySecs =
    todayItems.reduce((s, e) => s + entrySeconds(e), 0) +
    (running && dayKey(runningEntry.started_at) === todayKey ? elapsed : 0);
  const todayByProject = {};
  for (const e of todayItems) {
    const pk = e.project_id || "none";
    todayByProject[pk] = (todayByProject[pk] || 0) + entrySeconds(e);
  }
  const todayProjectRows = Object.entries(todayByProject)
    .map(([pk, secs]) => ({ project: pk === "none" ? null : projectById(pk), secs }))
    .sort((a, b) => b.secs - a.secs);
  const dayPhrase = null;

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

  // Organizzo i gruppi-giorno in 3 livelli per la cronologia ad accordion:
  // 1) oggi (sempre estesa)
  // 2) altri giorni della SETTIMANA CORRENTE (lun-dom): ciascuno apribile singolarmente
  // 3) settimane precedenti: raggruppate, un click apre la settimana e mostra tutti i suoi giorni
  const curWeekStart = startOfWeek(new Date());
  const todayGroup = groups.find((g) => g.key === todayKey) || null;
  const thisWeekDayGroups = groups.filter((g) => {
    if (g.key === todayKey) return false;
    const gd = new Date(g.key + "T12:00:00");
    return gd >= curWeekStart;
  });
  const pastGroups = groups.filter((g) => {
    if (g.key === todayKey) return false;
    const gd = new Date(g.key + "T12:00:00");
    return gd < curWeekStart;
  });
  // raggruppo i giorni passati per settimana (lunedì di quella settimana)
  const weekBuckets = [];
  const byWeek = {};
  for (const g of pastGroups) {
    const gd = new Date(g.key + "T12:00:00");
    const wStart = startOfWeek(gd);
    const wKey = dayKey(wStart);
    if (!byWeek[wKey]) {
      const diffWeeks = Math.round((curWeekStart - wStart) / (7 * 86400000));
      const label =
        diffWeeks === 1
          ? "Settimana scorsa"
          : `Settimana del ${wStart.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
      byWeek[wKey] = { key: wKey, label, days: [], total: 0 };
      weekBuckets.push(byWeek[wKey]);
    }
    byWeek[wKey].days.push(g);
    byWeek[wKey].total += g.total;
  }

  function toggleDay(key) {
    setExpandedDays((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  function toggleWeek(key) {
    setExpandedWeeks((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
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

      <div className="timer-grid">
      <div className="timer-col-main">
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

        {/* Checklist del task collegato, dentro il timer attivo (v31) */}
        {running && isAdmin && runningEntry?.task_id && (
          <RunningTaskSteps
            task={adminTasks.find((t) => t.id === runningEntry.task_id)}
            onToggle={toggleTaskStep}
          />
        )}

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
              <button className="btn btn-pause btn-lg" style={{ flex: 1 }} onClick={() => pauseTimer(runningEntry?.id)}>
                ❚❚ Pausa
              </button>
              <button className="btn btn-stop btn-lg" style={{ flex: 1 }} onClick={onStop}>
                <IconStop /> Ferma
              </button>
            </>
          )}
          {paused && (
            <>
              <button className="btn btn-resume btn-lg" style={{ flex: 1 }} onClick={() => resumeTimer(runningEntry?.id)}>
                <IconPlay /> Riprendi
              </button>
              <button className="btn btn-stop btn-lg" style={{ flex: 1 }} onClick={onStop}>
                <IconStop /> Ferma
              </button>
            </>
          )}
        </div>
        {running && (
          <div className="kbd-hint">
            <span><kbd>Spazio</kbd> {paused ? "riprendi" : "pausa"}</span>
            <span><kbd>Invio</kbd> ferma</span>
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 14 }}>
          {otherRunning.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="section-label" style={{ marginTop: 2 }}>Altri timer in corso</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {otherRunning.map((e) => (
                  <ParallelTimerRow
                    key={e.id}
                    entry={e}
                    project={projectById(e.project_id)}
                    onStop={() => stopTimer(e.id)}
                    onPause={() => pauseTimer(e.id)}
                    onResume={() => resumeTimer(e.id)}
                    onEdit={() => setEditorEntry(e)}
                  />
                ))}
              </div>
            </div>
          )}

          {running && (
            <button className="btn btn-ghost btn-sm" onClick={() => setParallelOpen(true)}>
              <IconPlus style={{ width: 15, height: 15 }} /> Avvia un secondo timer in parallelo
            </button>
          )}
        </div>
      )}

      <TeamNote />
      {showTree && (
        <GrowthTree
          userId={user?.id}
          bloomCount={isAdmin ? adminTasks.filter((t) => t.owner_id === user?.id && t.status === "done").length : 0}
        />
      )}

      {(() => {
        const now = new Date();
        const weekday = now.getDay() >= 1 && now.getDay() <= 5;
        if (todaySecs === 0 && !running && weekday && now.getHours() >= 14) {
          return (
            <div className="banner banner-info" style={{ marginTop: 12 }}>
              Non hai ancora registrato ore oggi. Se hai lavorato, puoi aggiungerle col timer o manualmente.
            </div>
          );
        }
        return null;
      })()}

      {/* Azioni rapide */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAddOpen(true)}>
          <IconPlus style={{ width: 17, height: 17 }} /> Aggiungi manualmente
        </button>
      </div>

      {/* Task e coach (v34, solo admin): il piano viene prima delle scorciatoie */}
      {isAdmin && (
        <>
          <TaskQuickList
            tasks={adminTasks}
            admins={taskAdmins}
            userId={user?.id}
            onStart={handleTaskClick}
            runningTaskId={runningEntry?.task_id || null}
            taskSecs={taskSecs}
            reload={reloadTasks}
            updateTask={updateAdminTask}
            toggleStep={toggleTaskStep}
            loaded={tasksLoaded}
          />
          <CoachCard
            tasks={adminTasks}
            entries={entries}
            profile={profile}
            projectById={projectById}
            userId={user?.id}
          />
        </>
      )}

      {/* Riepilogo di fine giornata */}
      {todaySecs > 0 && (
        <>
          <div className="section-label">Oggi</div>
          <div className="card" style={{ padding: 16 }}>
            <div className="row-between" style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                {fmtDuration(todaySecs)}
              </span>
              {dayPhrase && (
                <span className="muted" style={{ fontSize: 13 }}>{dayPhrase}</span>
              )}
            </div>
            {todayProjectRows.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                {todayProjectRows.map((r) => (
                  <div key={r.project?.id || "none"} className="row-between" style={{ fontSize: 13.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span className="entry-dot" style={{ background: r.project?.color || "#b8b8c0" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.project?.name || "Senza progetto"}
                      </span>
                    </span>
                    <span className="muted">{fmtDuration(r.secs)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
                    onClick={() => handleFavoriteClick(f)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="entry-desc">
                      {f.description || <span className="muted">Senza descrizione</span>}
                    </div>
                    {p && <div className="entry-sub">{p.name}</div>}
                  </div>
                  <button
                    className="entry-play"
                    onClick={() => handleFavoriteClick(f)}
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

      </div>{/* /timer-col-main */}

      <div className="timer-col-side">
      {/* Navigazione date condivisa tra i due calendari */}
      <div className="cal-shared-nav">
        <div style={{ display: "flex", gap: 6 }}>
          <button className="cal-arrow cal-arrow-yr" onClick={() => setCalDay((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} aria-label="Settimana precedente">«</button>
          <button className="cal-arrow" onClick={() => setCalDay((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })} aria-label="Giorno precedente">‹</button>
        </div>
        <div className="cal-shared-title">
          <div className="w-label" style={{ textTransform: "capitalize" }}>
            {(() => {
              const isToday = calDay.toDateString() === new Date().toDateString();
              return isToday ? "Oggi" : calDay.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" });
            })()}
          </div>
          <button className="link-btn" style={{ fontSize: 11.5 }} onClick={() => setCalDay(new Date())}>
            {calDay.toDateString() === new Date().toDateString() ? calDay.getFullYear() : "torna a oggi"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="cal-arrow" onClick={() => setCalDay((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })} aria-label="Giorno successivo">›</button>
          <button className="cal-arrow cal-arrow-yr" onClick={() => setCalDay((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} aria-label="Settimana successiva">»</button>
        </div>
      </div>

      {/* Zoom della timeline: utile quando ci sono impegni sovrapposti */}
      <div className="cal-zoom">
        <button className="cal-zoom-btn" onClick={() => setCalZoom((z) => Math.max(0.6, Math.round((z - 0.3) * 10) / 10))} aria-label="Riduci zoom" disabled={calZoom <= 0.6}>−</button>
        <span className="muted" style={{ fontSize: 12 }}>Zoom {Math.round(calZoom * 100)}%</span>
        <button className="cal-zoom-btn" onClick={() => setCalZoom((z) => Math.min(2.5, Math.round((z + 0.3) * 10) / 10))} aria-label="Aumenta zoom" disabled={calZoom >= 2.5}>+</button>
        {calZoom !== 1 && (
          <button className="link-btn" style={{ fontSize: 12, marginLeft: 4 }} onClick={() => setCalZoom(1)}>reimposta</button>
        )}
      </div>

      {/* Due calendari affiancati, sulla stessa scala oraria (unione dei
          range di lavoro e impegni Google, così le righe combaciano) */}
      <div className="cal-duo">
        <div className="cal-duo-col">
          <div className="section-label" style={{ marginTop: 2 }}>La tua giornata</div>
          <DayView
            day={calDay}
            onShiftDay={(delta) => setCalDay((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; })}
            hideNav
            extMinH={googleRange.min}
            extMaxH={googleRange.max}
            hourPx={56 * calZoom}
            onRange={(min, max) => setDayRange((r) => (r.min === min && r.max === max ? r : { min, max }))}
          />
        </div>
        <div className="cal-duo-col">
          <DayGoogle
            day={calDay}
            extMinH={dayRange.min ?? 8}
            extMaxH={dayRange.max ?? 19}
            hourPx={56 * calZoom}
            onRange={(min, max) => setGoogleRange((r) => (r.min === min && r.max === max ? r : { min, max }))}
          />
        </div>
      </div>

      {/* Ricerca nello storico */}
      {(entries.filter((e) => e.stopped_at).length > 8 || search) && (
        <div style={{ marginTop: 18 }}>
          <input
            className="field"
            placeholder="Cerca nelle tue voci…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Ultimi lavori */}
      {loading && completed.length === 0 ? (
        <Skeleton rows={4} height={54} />
      ) : groups.length === 0 ? (
        search && (
          <div className="empty">
            <div className="empty-emoji">🔍</div>
            Nessuna voce trovata negli ultimi 70 giorni.
          </div>
        )
      ) : search ? (
        // Durante una ricerca mostro tutto disteso, senza accordion:
        // stai cercando qualcosa di specifico, non vuoi altri click.
        <>
          <div className="section-label">Risultati</div>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="day-total">
                <span className="t-label">{g.label}</span>
                <span className="t-value">{fmtDuration(g.total)}</span>
              </div>
              <div className="card">
                {g.items.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="section-label">Ultimi lavori</div>

          {/* Voci non categorizzate (v32): tutte dovrebbero avere progetto
              (e il progetto un cliente). Le righe interessate hanno il ⚠️. */}
          {(() => {
            const bad = completed.filter((e) => {
              const p = projectById(e.project_id);
              return !e.project_id || (isAdmin && p && !p.client_id);
            });
            if (bad.length === 0) return null;
            return (
              <div className="banner banner-warn" style={{ fontSize: 12.5, marginBottom: 10 }}>
                ⚠️ {bad.length === 1 ? "1 voce non è categorizzata" : `${bad.length} voci non sono categorizzate`} bene
                ({isAdmin ? "manca il progetto o il cliente" : "manca il progetto"}):
                cercale qui sotto dal simbolo ⚠️ e toccale per sistemarle.
              </div>
            );
          })()}

          {/* Oggi: sempre estesa */}
          {todayGroup && (
            <div>
              <div className="day-total">
                <span className="t-label">{todayGroup.label}</span>
                <span className="t-value">{fmtDuration(todayGroup.total)}</span>
              </div>
              <div className="card">
                {todayGroup.items.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
                ))}
              </div>
            </div>
          )}

          {/* Altri giorni della settimana corrente: apribili uno a uno */}
          {thisWeekDayGroups.map((g) => {
            const open = expandedDays.has(g.key);
            return (
              <div key={g.key} className="accordion-group">
                <button className="accordion-head" onClick={() => toggleDay(g.key)}>
                  <span className="accordion-chevron">{open ? "▾" : "▸"}</span>
                  <span className="t-label" style={{ flex: 1, textAlign: "left" }}>{g.label}</span>
                  <span className="t-value">{fmtDuration(g.total)}</span>
                </button>
                {open && (
                  <div className="card">
                    {g.items.map((e) => (
                      <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Settimane precedenti: un click apre la settimana e mostra tutti i suoi giorni */}
          {weekBuckets.map((w) => {
            const open = expandedWeeks.has(w.key);
            return (
              <div key={w.key} className="accordion-group">
                <button className="accordion-head" onClick={() => toggleWeek(w.key)}>
                  <span className="accordion-chevron">{open ? "▾" : "▸"}</span>
                  <span className="t-label" style={{ flex: 1, textAlign: "left" }}>{w.label}</span>
                  <span className="t-value">{fmtDuration(w.total)}</span>
                </button>
                {open &&
                  w.days.map((g) => (
                    <div key={g.key} style={{ marginTop: 8 }}>
                      <div className="day-total day-total-sub">
                        <span className="t-label">{g.label}</span>
                        <span className="t-value">{fmtDuration(g.total)}</span>
                      </div>
                      <div className="card">
                        {g.items.map((e) => (
                          <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </>
      )}
      </div>{/* /timer-col-side */}
      </div>{/* /timer-grid */}

      {/* Sheet */}
      <ProjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={draftProject}
        onChange={handleProjectChange}
        favorites={favorites}
        onPickFavorite={(f) => handleFavoriteClick(f)}
      />
      {addOpen && <EntryEditor open={addOpen} onClose={() => setAddOpen(false)} />}
      {editorEntry && (
        <EntryEditor
          open={!!editorEntry}
          onClose={() => setEditorEntry(null)}
          entry={editorEntry}
        />
      )}

      {/* Scelta all'avvio di un preferito (v28) o di un task (v31) con
          timer già attivo: sostituire o — per gli admin — andare in parallelo. */}
      <Sheet
        open={!!favToStart || !!taskToStart}
        onClose={() => { setFavToStart(null); setTaskToStart(null); }}
        title="C'è già un timer attivo"
      >
        {(favToStart || taskToStart) && (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              Stai lavorando su:{" "}
              <b>{runningEntry?.description || projectById(runningEntry?.project_id)?.name || "senza descrizione"}</b>
            </p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Vuoi avviare{" "}
              <b>
                {taskToStart
                  ? taskToStart.title
                  : favToStart.description || projectById(favToStart.project_id)?.name || "il preferito"}
              </b>?
            </p>
            {isAdmin && (
              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={async () => {
                  const f = favToStart, t = taskToStart;
                  setFavToStart(null); setTaskToStart(null);
                  if (t) await startFromTask(t, { parallel: true });
                  else await startFromFavorite(f, { parallel: true });
                }}
              >
                <IconPlay /> Avvia in parallelo (il primo continua)
              </button>
            )}
            <button
              className={"btn btn-block " + (isAdmin ? "btn-soft" : "btn-primary btn-lg")}
              style={{ marginTop: 10 }}
              onClick={async () => {
                const f = favToStart, t = taskToStart;
                setFavToStart(null); setTaskToStart(null);
                if (t) await startFromTask(t);
                else await startFromFavorite(f);
              }}
            >
              <IconStop /> Ferma il timer attivo e sostituiscilo
            </button>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => { setFavToStart(null); setTaskToStart(null); }}
            >
              Annulla
            </button>
          </>
        )}
      </Sheet>

      {isAdmin && (
        <Sheet open={parallelOpen} onClose={() => setParallelOpen(false)} title="Secondo timer in parallelo">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Il timer già in corso non si ferma: ne parte un altro accanto. Funzione riservata agli amministratori.
          </p>

          {/* Preferiti: avvio rapido in parallelo con un tocco (v28) */}
          {favorites.length > 0 && (
            <>
              <label className="field-label">Avvio rapido dai Preferiti</label>
              <div className="card" style={{ marginBottom: 12 }}>
                {favorites.map((f) => {
                  const p = projectById(f.project_id);
                  return (
                    <div key={f.id} className="entry" style={{ cursor: "pointer" }}
                      onClick={async () => { setParallelOpen(false); await startFromFavorite(f, { parallel: true }); }}>
                      <span className="entry-dot" style={{ background: p?.color || "#cfcfca" }} />
                      <div className="entry-main">
                        <div className="entry-desc">{f.description || <span className="muted">Senza descrizione</span>}</div>
                        {p && <div className="entry-sub">{p.name}</div>}
                      </div>
                      <span className="entry-play" aria-hidden><IconPlay /></span>
                    </div>
                  );
                })}
              </div>
              <label className="field-label">…oppure compila a mano</label>
            </>
          )}
          <label className="field-label">Cosa stai facendo</label>
          <input
            className="field"
            placeholder="Descrizione (facoltativa)"
            value={parallelDesc}
            onChange={(e) => setParallelDesc(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <label className="field-label">Progetto</label>
          <button
            className="field"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", width: "100%" }}
            onClick={() => setParallelPickerOpen(true)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {parallelProject ? (
                <>
                  <span className="entry-dot" style={{ background: projectById(parallelProject)?.color || "#999" }} />
                  <span style={{ fontWeight: 600 }}>{projectById(parallelProject)?.name}</span>
                </>
              ) : (
                <span className="muted">Nessun progetto</span>
              )}
            </span>
            <IconChevron style={{ width: 15, height: 15, opacity: 0.7 }} />
          </button>
          <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} onClick={onStartParallel}>
            <IconPlay /> Avvia in parallelo
          </button>
          <ProjectPicker
            open={parallelPickerOpen}
            onClose={() => setParallelPickerOpen(false)}
            value={parallelProject}
            onChange={(id) => setParallelProject(id)}
          />
        </Sheet>
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
          <button className="list-action card" style={{ width: "100%" }} onClick={toggleTree}>
            <span>
              <span style={{ fontWeight: 600, display: "block" }}>Mostra l'albero dei progressi</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Solo per te, sulla schermata principale</span>
            </span>
            <span style={{ width: 46, height: 28, borderRadius: 999, background: showTree ? "var(--ok)" : "var(--line-strong)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: showTree ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </span>
          </button>
        </div>

        <div className="sheet-row">
          <button className="list-action card" style={{ width: "100%" }} onClick={async () => {
            try { await fetch(`/api/google-disconnect?uid=${user.id}`); toast("Google Calendar scollegato.", "ok"); }
            catch { toast("Operazione non riuscita.", "error"); }
          }}>
            <span>
              <span style={{ fontWeight: 600, display: "block" }}>Scollega Google Calendar</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Rimuove l'accesso ai tuoi eventi</span>
            </span>
          </button>
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
        {visibleChangelog(isAdmin).map((v) => (
          <div key={v.version} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="row-between" style={{ alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>
                {v.title}
              </div>
              <span
                style={{
                  fontSize: 11.5, fontWeight: 700, color: "var(--brand)",
                  background: "var(--brand-soft)", padding: "3px 8px", borderRadius: "var(--r-pill)",
                  whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8,
                }}
              >
                {APP_NAME} v{v.version}
              </span>
            </div>
            {v.date && (
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                Rilascio {new Date(v.date + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                {v.time ? ` alle ${v.time}` : ""}
              </div>
            )}
            {v.items?.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>
                {v.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
            {isAdmin && v.adminItems?.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10 }}>Solo admin</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>
                  {v.adminItems.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </Sheet>
    </div>
  );
}

// Riga compatta per un timer secondario (parallelo). Ha il proprio
// intervallo per aggiornare il tempo trascorso senza toccare il resto
// della schermata.
function ParallelTimerRow({ entry, project, onStop, onPause, onResume, onEdit }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (entry.paused_at) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [entry.paused_at]);

  const paused = !!entry.paused_at;
  const secs = entrySeconds(entry);

  return (
    <div className={"mini-timer" + (paused ? " paused" : "")}>
      <button className="mini-timer-main" onClick={onEdit}>
        <div className="mini-timer-title">
          {project && <span className="entry-dot" style={{ background: project.color || "#999" }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.description || project?.name || "Senza descrizione"}
          </span>
        </div>
        <div className="mini-timer-clock">{fmtClock(secs)}</div>
        {paused && <div className="mini-timer-paused">in pausa</div>}
      </button>
      <div className="mini-timer-controls">
        {paused ? (
          <button className="mini-timer-btn" onClick={onResume} aria-label="Riprendi"><IconPlay style={{ width: 15, height: 15 }} /></button>
        ) : (
          <button className="mini-timer-btn" onClick={onPause} aria-label="Pausa">❚❚</button>
        )}
        <button className="mini-timer-btn stop" onClick={onStop} aria-label="Ferma"><IconStop style={{ width: 15, height: 15 }} /></button>
      </div>
    </div>
  );
}
