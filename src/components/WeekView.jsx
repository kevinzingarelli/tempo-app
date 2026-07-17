import { useState } from "react";
import { useData } from "../state/DataContext.jsx";
import EntryRow from "./EntryRow.jsx";
import EntryEditor from "./EntryEditor.jsx";
import { entrySeconds, fmtDuration, startOfWeek, dayKey, sameDay } from "../lib/format.js";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function WeekView() {
  const { entries } = useData();
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [editorEntry, setEditorEntry] = useState(null);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const completed = entries.filter((e) => e.stopped_at);
  const byDay = {};
  for (const d of days) byDay[dayKey(d)] = { secs: 0, items: [] };
  for (const e of completed) {
    const k = dayKey(e.started_at);
    if (byDay[k]) {
      byDay[k].secs += entrySeconds(e);
      byDay[k].items.push(e);
    }
  }
  const weekTotal = Object.values(byDay).reduce((s, d) => s + d.secs, 0);
  const maxDay = Math.max(1, ...Object.values(byDay).map((d) => d.secs));

  function shiftWeek(delta) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
    setSelectedDay(dayKey(d));
  }

  const today = new Date();
  const isCurrentWeek = sameDay(startOfWeek(today), weekStart);
  const label =
    days[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" }) +
    " – " +
    days[6].toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  const sel = byDay[selectedDay] || { secs: 0, items: [] };
  const selDate = days.find((d) => dayKey(d) === selectedDay) || days[0];

  // lo storico caricato copre ~70 giorni
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - 70);
  const beyondHistory = weekStart < oldest;

  return (
    <div>
      <div className="week-nav">
        <button className="week-arrow" onClick={() => shiftWeek(-1)} aria-label="Settimana precedente">‹</button>
        <div style={{ textAlign: "center" }}>
          <div className="w-label">{isCurrentWeek ? "Questa settimana" : label}</div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{fmtDuration(weekTotal)} totali</div>
        </div>
        <button
          className="week-arrow"
          onClick={() => shiftWeek(1)}
          disabled={isCurrentWeek}
          aria-label="Settimana successiva"
        >›</button>
      </div>

      {beyondHistory && (
        <div className="banner banner-info" style={{ marginBottom: 12 }}>
          Qui vedi gli ultimi 70 giorni. Per periodi più vecchi usa il Riepilogo.
        </div>
      )}

      <div className="week-strip">
        {days.map((d, i) => {
          const k = dayKey(d);
          const info = byDay[k];
          const h = info.secs / 3600;
          return (
            <button
              key={k}
              className={
                "wday" +
                (k === selectedDay ? " selected" : "") +
                (sameDay(d, today) ? " today" : "") +
                (info.secs === 0 ? " empty" : "")
              }
              onClick={() => setSelectedDay(k)}
            >
              <span className="wd-name">{DAY_NAMES[i]}</span>
              <span className="wd-bar">
                <span
                  className="wd-fill"
                  style={{ height: `${Math.max(4, (info.secs / maxDay) * 100)}%` }}
                />
              </span>
              <span className="wd-hours">{info.secs > 0 ? h.toFixed(h >= 10 ? 0 : 1) : "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="day-total">
        <span className="t-label">
          {selDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <span className="t-value">{fmtDuration(sel.secs)}</span>
      </div>

      {sel.items.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🌤️</div>
          Nessuna voce in questo giorno.
        </div>
      ) : (
        <div className="card">
          {sel.items
            .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
            .map((e) => (
              <EntryRow key={e.id} entry={e} onEdit={setEditorEntry} />
            ))}
        </div>
      )}

      {editorEntry && (
        <EntryEditor open={!!editorEntry} onClose={() => setEditorEntry(null)} entry={editorEntry} />
      )}
    </div>
  );
}
