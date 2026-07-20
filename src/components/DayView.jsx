import { useState, useEffect } from "react";
import { useData } from "../state/DataContext.jsx";
import EntryEditor from "./EntryEditor.jsx";
import { entrySeconds, fmtDuration, fmtTime, sameDay } from "../lib/format.js";

export const HOUR_PX = 56;

export default function DayView({ day: dayProp, onShiftDay, hideNav, extMinH, extMaxH, onRange, hourPx }) {
  const { entries, runningEntry, projectById, clientById } = useData();
  const HPX = hourPx || HOUR_PX;
  const [dayInternal, setDayInternal] = useState(() => new Date());
  const day = dayProp || dayInternal;
  const [editorEntry, setEditorEntry] = useState(null);
  const [, setTick] = useState(0);

  // aggiorna il blocco "in corso" e la linea "adesso" ogni 30s
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const isToday = sameDay(day, new Date());
  const dayStartBound = new Date(day); dayStartBound.setHours(0, 0, 0, 0);
  const dayEndBound = new Date(dayStartBound.getTime() + 24 * 3600 * 1000);
  const now = new Date();

  // voci che TOCCANO questo giorno: iniziate oggi, oppure iniziate prima ma
  // finite oggi/dopo (lavori a cavallo della mezzanotte).
  const items = entries.filter((e) => {
    const s = new Date(e.started_at);
    const end = e.stopped_at ? new Date(e.stopped_at) : now;
    if (!e.stopped_at && !sameDay(s, new Date())) return false;
    // si sovrappone all'intervallo del giorno?
    return s < dayEndBound && end > dayStartBound;
  });

  // intervallo ore mostrato: si adatta alle voci (clampate al giorno)
  let minH = 8, maxH = 19;
  for (const e of items) {
    const s0 = new Date(e.started_at);
    const end0 = e.stopped_at ? new Date(e.stopped_at) : now;
    // ritaglio ai confini del giorno visualizzato
    const s = s0 < dayStartBound ? dayStartBound : s0;
    const end = end0 > dayEndBound ? dayEndBound : end0;
    minH = Math.min(minH, s.getHours());
    const endHour = end.getTime() >= dayEndBound.getTime() ? 24 : end.getHours() + 1;
    maxH = Math.max(maxH, endHour);
  }
  if (isToday) maxH = Math.max(maxH, now.getHours() + 1);
  minH = Math.max(0, minH);
  maxH = Math.min(24, maxH + 1);
  const rawMinH = minH, rawMaxH = maxH;

  // Se ricevo un range esterno (per allineare la timeline a quella di Google),
  // lo uso per far combaciare esattamente le due colonne.
  if (typeof extMinH === "number") minH = Math.min(minH, extMinH);
  if (typeof extMaxH === "number") maxH = Math.max(maxH, extMaxH);

  const totalPx = (maxH - minH) * HPX;

  useEffect(() => {
    if (onRange) onRange(rawMinH, rawMaxH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMinH, rawMaxH]);
  const dayStart = new Date(day);
  dayStart.setHours(minH, 0, 0, 0);

  function yOf(date) {
    return ((date - dayStart) / 3600000) * HPX;
  }

  function shiftDay(delta) {
    if (onShiftDay) { onShiftDay(delta); return; }
    const d = new Date(day);
    d.setDate(d.getDate() + delta);
    setDayInternal(d);
  }

  const totalSecs = items.reduce((sum, e) => {
    const s0 = new Date(e.started_at);
    const end0 = e.stopped_at ? new Date(e.stopped_at) : now;
    const s = s0 < dayStartBound ? dayStartBound : s0;
    const end = end0 > dayEndBound ? dayEndBound : end0;
    return sum + Math.max(0, Math.floor((end - s) / 1000));
  }, 0);
  const hours = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);

  return (
    <div>
      {!hideNav && (
      <div className="week-nav">
        <button className="week-arrow" onClick={() => shiftDay(-1)} aria-label="Giorno precedente">‹</button>
        <div style={{ textAlign: "center" }}>
          <div className="w-label">
            {isToday
              ? "Oggi"
              : day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" })}
          </div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            {fmtDuration(totalSecs)} registrate
          </div>
        </div>
        <button className="week-arrow" onClick={() => shiftDay(1)} disabled={isToday} aria-label="Giorno successivo">›</button>
      </div>
      )}

      {items.length === 0 && !isToday ? (
        <div className="empty">
          <div className="empty-emoji">🌤️</div>
          Nessuna voce in questo giorno.
        </div>
      ) : (
        <div className="dayview" style={{ height: totalPx + 20, marginBottom: 8 }}>
          {hours.map((h) => (
            <div key={h} className="dv-hour" style={{ top: (h - minH) * HPX + 10 }}>
              <span>{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}

          {(() => {
            // Layout a colonne: raggruppo i blocchi che si sovrappongono nel
            // tempo e li affianco, così non si coprono a vicenda.
            const blocks = items.map((e) => {
              const s0 = new Date(e.started_at);
              const end0 = e.stopped_at ? new Date(e.stopped_at) : now;
              const s = s0 < dayStartBound ? dayStartBound : s0;
              const end = end0 > dayEndBound ? dayEndBound : end0;
              return { e, s0, end0, sMs: s.getTime(), eMs: Math.max(end.getTime(), s.getTime() + 1) };
            }).sort((a, b) => a.sMs - b.sMs);

            // assegno colonne
            let clusterEnd = -Infinity;
            let cluster = [];
            const layout = new Map(); // e.id -> { col, cols }
            const flush = () => {
              const cols = [];
              for (const b of cluster) {
                let placed = false;
                for (let c = 0; c < cols.length; c++) {
                  if (cols[c] <= b.sMs) { cols[c] = b.eMs; layout.set(b.e.id, { col: c }); placed = true; break; }
                }
                if (!placed) { cols.push(b.eMs); layout.set(b.e.id, { col: cols.length - 1 }); }
              }
              for (const b of cluster) layout.get(b.e.id).cols = cols.length;
              cluster = [];
            };
            for (const b of blocks) {
              if (b.sMs >= clusterEnd && cluster.length) flush();
              cluster.push(b);
              clusterEnd = Math.max(clusterEnd, b.eMs);
            }
            if (cluster.length) flush();

            return items.map((e) => {
            const s0 = new Date(e.started_at);
            const end0 = e.stopped_at ? new Date(e.stopped_at) : now;
            // ritaglio visivo ai confini del giorno mostrato
            const startsBefore = s0 < dayStartBound;
            const endsAfter = end0 > dayEndBound;
            const s = startsBefore ? dayStartBound : s0;
            const end = endsAfter ? dayEndBound : end0;
            const p = projectById(e.project_id);
            const client = p?.client_id ? clientById(p.client_id) : null;
            const top = Math.max(0, yOf(s)) + 10;
            const height = Math.max(26, yOf(end) - yOf(s));
            const live = !e.stopped_at;
            const secs = entrySeconds(e);
            const lay = layout.get(e.id) || { col: 0, cols: 1 };
            const single = lay.cols <= 1;
            return (
              <button
                key={e.id}
                className={"dv-block" + (live ? " live" : "") + (single ? " dv-full" : "")}
                style={{
                  top,
                  height,
                  background: p?.color || "#7a7a85",
                  ...(single ? {} : {
                    left: `calc(52px + (100% - 60px) * ${lay.col} / ${lay.cols})`,
                    width: `calc((100% - 60px) / ${lay.cols} - 4px)`,
                  }),
                }}
                onClick={() => setEditorEntry(e)}
              >
                <div className="b-title">
                  {startsBefore ? "↑ " : ""}
                  {e.description || p?.name || "Senza descrizione"}
                  {live ? " · in corso" : ""}
                </div>
                {height >= 40 && (
                  <div className="b-sub">
                    {startsBefore ? "da ieri " : fmtTime(e.started_at)}
                    {!startsBefore && "–"}
                    {endsAfter ? "prosegue domani" : (e.stopped_at ? (startsBefore ? "fino " + fmtTime(e.stopped_at) : fmtTime(e.stopped_at)) : "…")}
                    {" · "}{fmtDuration(secs)}
                    {p && e.description ? ` · ${p.name}` : ""}
                    {client ? ` (${client.name})` : ""}
                  </div>
                )}
              </button>
            );
            });
          })()}

          {isToday && now >= dayStart && (
            <div className="dv-now" style={{ top: yOf(now) + 10 }} />
          )}
        </div>
      )}

      <p className="muted center" style={{ fontSize: 11.5 }}>
        Tocca un blocco per modificarlo — anche il timer in corso.
      </p>

      {editorEntry && (
        <EntryEditor open={!!editorEntry} onClose={() => setEditorEntry(null)} entry={editorEntry} />
      )}
    </div>
  );
}
