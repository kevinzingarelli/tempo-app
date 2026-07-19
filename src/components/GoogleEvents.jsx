import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { IconCalendar } from "../lib/icons.jsx";

function fmtEventTime(ev) {
  if (ev.allDay) {
    return new Date(ev.start + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  }
  const d = new Date(ev.start);
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function GoogleEvents() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, connected: false, events: [], email: null, error: null });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/google-events?uid=${user.id}`);
      const data = await res.json();
      setState({ loading: false, connected: !!data.connected, events: data.events || [], email: data.email || null, error: data.error || null });
    } catch (e) {
      setState({ loading: false, connected: false, events: [], email: null, error: null });
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function connect() {
    window.location.href = `/api/google-auth?uid=${user.id}`;
  }

  if (state.loading) return null;

  if (!state.connected) {
    return (
      <div className="card gcal-connect">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="gcal-ico"><IconCalendar style={{ width: 18, height: 18 }} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Google Calendar</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Vedi i tuoi impegni accanto al lavoro</div>
          </div>
          <button className="btn btn-soft btn-sm" onClick={connect}>Collega</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="team-note-label" style={{ color: "var(--ink-soft)" }}>I tuoi impegni</span>
        <span className="muted" style={{ fontSize: 11.5 }}>{state.email}</span>
      </div>
      {state.error ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {state.error} <button className="link-btn" onClick={connect}>Ricollega</button>
        </div>
      ) : state.events.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>Nessun evento nei prossimi 30 giorni.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {state.events.slice(0, 6).map((ev) => (
            <div key={ev.id} className="gcal-ev">
              <span className="gcal-dot" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.title}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{fmtEventTime(ev)}{ev.location ? ` · ${ev.location}` : ""}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
