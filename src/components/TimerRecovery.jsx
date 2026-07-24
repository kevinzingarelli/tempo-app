import { useState, useEffect, useRef } from "react";
import { useData } from "../state/DataContext.jsx";
import Sheet from "./Sheet.jsx";
import { entrySeconds, fmtDuration } from "../lib/format.js";

// ============================================================
// Recupero del timer dimenticato (v36)
//
// Se chiudi l'app col timer acceso — la sera, a pranzo, per sbaglio —
// quel timer continua a correre e il giorno dopo ti ritrovi una voce da
// 14 ore. Qui l'app se ne accorge da sola: tiene il conto dell'ultima
// volta che è stata aperta e, se al ritorno trova un timer ancora in
// corso dopo una lunga assenza, chiede cosa fare.
//
// La proposta più utile è "chiudilo a quando ho smesso": mette lo stop
// all'ora in cui hai lasciato l'app, che quasi sempre è l'ora giusta.
// Niente viene deciso in automatico: la parola resta a te.
// ============================================================

const SEEN_KEY = "boschetto_last_seen";
const GAP_MS = 30 * 60 * 1000; // sotto la mezz'ora non disturbiamo

function readSeen() {
  const v = Number(localStorage.getItem(SEEN_KEY) || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* storage pieno */ }
}

// "alle 18:04" · "ieri alle 18:04" · "il 12 luglio alle 18:04"
function whenLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `alle ${hhmm}`;
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return `ieri alle ${hhmm}`;
  return `il ${d.toLocaleDateString("it-IT", { day: "numeric", month: "long" })} alle ${hhmm}`;
}

export default function TimerRecovery() {
  const { runningEntries, stopTimer, updateEntry, deleteEntry, projectById, toast } = useData();
  const [ask, setAsk] = useState(null); // { entries, seen }
  const [busy, setBusy] = useState(false);
  const gapRef = useRef(0);
  const seenRef = useRef(0);
  const dismissedRef = useRef(new Set());
  const entriesRef = useRef(runningEntries);
  entriesRef.current = runningEntries;

  // Mostra la domanda solo se: assenza lunga + timer davvero in corso
  // (non in pausa) + non già liquidato in questa sessione.
  function evaluate() {
    if (gapRef.current < GAP_MS) return;
    const list = (entriesRef.current || []).filter(
      (e) => !e.paused_at && !dismissedRef.current.has(e.id)
    );
    if (list.length === 0) return;
    setAsk({ entries: list, seen: seenRef.current });
    gapRef.current = 0; // domanda posta: non riproporla
  }

  useEffect(() => {
    // all'apertura: quanto è stata via l'app?
    seenRef.current = readSeen();
    gapRef.current = seenRef.current ? Date.now() - seenRef.current : 0;
    markSeen();

    // battito mentre l'app è in primo piano: così "ultima volta vista"
    // resta aggiornato anche se non tocchi nulla
    const beat = setInterval(() => {
      if (document.visibilityState === "visible") markSeen();
    }, 60000);

    function onBack() {
      if (document.visibilityState === "hidden") { markSeen(); return; }
      const seen = readSeen();
      seenRef.current = seen;
      gapRef.current = seen ? Date.now() - seen : 0;
      markSeen();
      evaluate();
    }
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    window.addEventListener("pagehide", markSeen);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      window.removeEventListener("pagehide", markSeen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // i timer arrivano dopo il primo render (cache/rete): rivaluto quando ci sono
  useEffect(() => { evaluate(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningEntries]);

  if (!ask) return null;

  const { entries, seen } = ask;

  function close(keep) {
    if (keep) entries.forEach((e) => dismissedRef.current.add(e.id));
    setAsk(null);
  }

  async function stopAtSeen() {
    setBusy(true);
    const iso = new Date(seen).toISOString();
    for (const e of entries) {
      if (new Date(e.started_at).getTime() < seen) {
        await updateEntry(e.id, { stopped_at: iso, paused_at: null });
      } else {
        await stopTimer(e.id); // partito dopo: lo chiudo adesso
      }
    }
    setBusy(false);
    close(false);
    toast("Timer chiuso all'ora in cui avevi lasciato l'app.", "ok");
  }

  async function stopNow() {
    setBusy(true);
    for (const e of entries) await stopTimer(e.id);
    setBusy(false);
    close(false);
    toast("Timer fermato.", "ok");
  }

  async function removeAll() {
    if (!confirm(entries.length === 1
      ? "Eliminare questa voce? Il tempo registrato andrà perso."
      : `Eliminare queste ${entries.length} voci? Il tempo registrato andrà perso.`)) return;
    setBusy(true);
    for (const e of entries) await deleteEntry(e.id);
    setBusy(false);
    close(false);
    toast("Voce eliminata.", "ok");
  }

  return (
    <RecoverySheet
      entries={entries}
      seen={seen}
      busy={busy}
      projectById={projectById}
      onKeep={() => close(true)}
      onStopAtSeen={stopAtSeen}
      onStopNow={stopNow}
      onRemove={removeAll}
    />
  );
}

// Solo la parte visibile: separata così si può guardare e rifinire nella
// pagina di anteprima locale dev-recovery.html, senza aspettare che
// capiti davvero di lasciare un timer acceso tutta la notte.
export function RecoverySheet({ entries, seen, busy, projectById, onKeep, onStopAtSeen, onStopNow, onRemove }) {
  const one = entries.length === 1;
  const totalSecs = entries.reduce((s, e) => s + entrySeconds(e), 0);
  // Ha senso proporre "quando ho smesso" solo per i timer partiti PRIMA
  // che l'app sparisse (un timer avviato altrove dopo non c'entra).
  const anyBeforeSeen = entries.some((e) => new Date(e.started_at).getTime() < seen);
  const descOf = (e) => e.description || projectById(e.project_id)?.name || "senza descrizione";

  return (
    <Sheet open={true} onClose={onKeep} title="⏳ Timer rimasto acceso">
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 12px", color: "var(--ink-soft)" }}>
        {anyBeforeSeen ? (
          <>
            Hai lasciato l'app <b>{whenLabel(seen)}</b> e da allora {one ? "il timer è rimasto" : "i timer sono rimasti"} in corso.
            {one ? " Adesso segna " : " Adesso segnano in tutto "}
            <b>{fmtDuration(totalSecs)}</b>.
          </>
        ) : (
          <>
            {one ? "C'è un timer ancora in corso" : "Ci sono timer ancora in corso"} da <b>{fmtDuration(totalSecs)}</b>,
            {one ? " avviato" : " avviati"} dopo che avevi lasciato l'app — forse da un altro dispositivo.
          </>
        )}
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        {entries.map((e) => {
          const p = projectById(e.project_id);
          return (
            <div key={e.id} className="entry">
              <span className="entry-dot" style={{ background: p?.color || "#cfcfca" }} />
              <div className="entry-main">
                <div className="entry-desc">{descOf(e)}</div>
                {p && <div className="entry-sub">{p.name}</div>}
              </div>
              <span className="entry-dur">{fmtDuration(entrySeconds(e))}</span>
            </div>
          );
        })}
      </div>

      {anyBeforeSeen && (
        <button className="btn btn-primary btn-block btn-lg" onClick={onStopAtSeen} disabled={busy}>
          {busy ? <span className="spinner spinner-white" /> : `Chiudi a quando ho smesso (${whenLabel(seen)})`}
        </button>
      )}
      <button
        className={"btn btn-block " + (anyBeforeSeen ? "btn-soft" : "btn-primary btn-lg")}
        style={{ marginTop: 10 }}
        onClick={onKeep}
        disabled={busy}
      >
        Stavo lavorando davvero, continua
      </button>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onStopNow} disabled={busy}>
        Ferma adesso ({fmtDuration(totalSecs)})
      </button>
      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 10, color: "var(--stop)" }}
        onClick={onRemove}
        disabled={busy}
      >
        Elimina {one ? "questa voce" : "queste voci"}
      </button>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
        Te lo chiedo solo dopo mezz'ora o più di assenza, e mai due volte per lo stesso timer.
      </p>
    </Sheet>
  );
}
