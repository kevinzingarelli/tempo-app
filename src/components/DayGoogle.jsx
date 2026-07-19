import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";
import { useData } from "../state/DataContext.jsx";
import { IconCalendar, IconCheck, IconPlus } from "../lib/icons.jsx";
import Sheet from "./Sheet.jsx";
import ProjectPicker from "./ProjectPicker.jsx";

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function evTimeLabel(ev) {
  if (ev.allDay) return "Tutto il giorno";
  const s = new Date(ev.start);
  const e = ev.end ? new Date(ev.end) : null;
  const f = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return e ? `${f(s)}–${f(e)}` : f(s);
}

export default function DayGoogle({ day }) {
  const { user } = useAuth();
  const { addEntry, projectById, clientById, toast, entries } = useData();
  const [state, setState] = useState({ loading: true, connected: false, events: [], error: null });
  const [links, setLinks] = useState({});
  const [confirmEv, setConfirmEv] = useState(null);
  const [pickProject, setPickProject] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const iso = toISODate(day);

  const loadEvents = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/google-events?uid=${user.id}&from=${iso}&to=${iso}`);
      const data = await res.json();
      setState({ loading: false, connected: !!data.connected, events: data.events || [], error: data.error || null });
    } catch (e) {
      setState({ loading: false, connected: false, events: [], error: null });
    }
  }, [user, iso]);

  const loadLinks = useCallback(async () => {
    const { data } = await supabase
      .from("calendar_links")
      .select("google_event_id, project_id")
      .eq("user_id", user.id);
    const m = {};
    (data || []).forEach((l) => (m[l.google_event_id] = l));
    setLinks(m);
  }, [user]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { loadLinks(); }, [loadLinks]);

  function connect() {
    window.location.href = `/api/google-auth?uid=${user.id}`;
  }

  function suggestProject(ev) {
    const title = (ev.title || "").toLowerCase().trim();
    if (!title) return null;
    const words = title.split(/\s+/).filter((w) => w.length > 3);
    let best = null;
    for (const e of entries) {
      if (!e.project_id) continue;
      const desc = (e.description || "").toLowerCase();
      if (!desc) continue;
      if (desc === title) return e.project_id;
      const hit = words.some((w) => desc.includes(w));
      if (hit && !best) best = e.project_id;
    }
    return best;
  }

  function openConfirm(ev) {
    const suggested = suggestProject(ev);
    setConfirmEv(ev);
    setPickProject(suggested || null);
  }

  async function registerEvent() {
    if (!confirmEv) return;
    setBusy(true);
    const ev = confirmEv;
    let started_at, stopped_at;
    if (ev.allDay) {
      const base = new Date(iso + "T09:00:00");
      started_at = base.toISOString();
      stopped_at = new Date(base.getTime() + 3600000).toISOString();
    } else {
      started_at = new Date(ev.start).toISOString();
      stopped_at = ev.end ? new Date(ev.end).toISOString() : new Date(new Date(ev.start).getTime() + 3600000).toISOString();
    }
    const proj = pickProject ? projectById(pickProject) : null;
    await addEntry({
      description: ev.title,
      project_id: pickProject || null,
      tags: [],
      billable: proj?.billable_default || false,
      note: ev.location ? `Da Google Calendar · ${ev.location}` : "Da Google Calendar",
      started_at,
      stopped_at,
    });
    await supabase.from("calendar_links").upsert(
      {
        user_id: user.id,
        google_event_id: ev.id,
        project_id: pickProject || null,
        event_title: ev.title,
      },
      { onConflict: "user_id,google_event_id" }
    );
    setBusy(false);
    setConfirmEv(null);
    toast("Evento registrato come voce.", "ok");
    loadLinks();
  }

  if (state.loading) {
    return (
      <div className="gcal-col">
        <div className="section-label" style={{ marginTop: 2 }}>Google Calendar</div>
        <div className="center" style={{ marginTop: 30 }}><span className="spinner" /></div>
      </div>
    );
  }

  if (!state.connected) {
    return (
      <div className="gcal-col">
        <div className="section-label" style={{ marginTop: 2 }}>Google Calendar</div>
        <div className="card gcal-connect">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="gcal-ico"><IconCalendar style={{ width: 18, height: 18 }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Collega Google</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Vedi gli impegni accanto al lavoro</div>
            </div>
            <button className="btn btn-soft btn-sm" onClick={connect}>Collega</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gcal-col">
      <div className="section-label" style={{ marginTop: 2 }}>Google Calendar</div>

      {state.error ? (
        <div className="card" style={{ padding: 14 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {state.error} <button className="link-btn" onClick={connect}>Ricollega</button>
          </div>
        </div>
      ) : state.events.length === 0 ? (
        <div className="empty" style={{ padding: 24 }}>
          <div className="empty-emoji">📅</div>
          Nessun impegno in questo giorno.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.events.map((ev) => {
            const link = links[ev.id];
            const done = !!link;
            return (
              <div key={ev.id} className={"gcal-card" + (done ? " done" : "")}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gcal-title">
                    {ev.title}
                    {done && <span className="gcal-done-badge"><IconCheck style={{ width: 12, height: 12 }} /> già registrato</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {evTimeLabel(ev)}{ev.location ? ` · ${ev.location}` : ""}
                  </div>
                </div>
                {!done && (
                  <button className="btn btn-soft btn-sm gcal-add" onClick={() => openConfirm(ev)}>
                    <IconPlus style={{ width: 15, height: 15 }} /> Registra
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!confirmEv} onClose={() => setConfirmEv(null)} title="Registra come voce">
        {confirmEv && (
          <>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>{confirmEv.title}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{evTimeLabel(confirmEv)}</div>
            </div>

            <label className="field-label">Progetto e cliente — conferma o cambia</label>
            <button className="field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", width: "100%" }} onClick={() => setPickerOpen(true)}>
              {pickProject ? (
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className="entry-dot" style={{ background: projectById(pickProject)?.color || "#9aa0a6" }} />
                  <span>
                    {projectById(pickProject)?.name || "Progetto"}
                    {(() => {
                      const p = projectById(pickProject);
                      const c = p?.client_id ? clientById(p.client_id) : null;
                      return c ? ` · ${c.name}` : "";
                    })()}
                  </span>
                </span>
              ) : (
                <span className="muted">Nessun progetto — tocca per sceglierne uno</span>
              )}
            </button>
            {pickProject && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Proposta automatica: controlla che sia corretta prima di salvare.
              </p>
            )}

            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} onClick={registerEvent} disabled={busy}>
              {busy ? <span className="spinner spinner-white" /> : "Salva voce"}
            </button>
          </>
        )}
      </Sheet>

      <ProjectPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={pickProject}
        onChange={(id) => setPickProject(id)}
      />
    </div>
  );
}
