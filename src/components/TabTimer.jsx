import { useEffect, useRef } from "react";
import { useData } from "../state/DataContext.jsx";
import { entrySeconds, fmtClock } from "../lib/format.js";
import { APP_NAME } from "../lib/changelog.js";

// Timer nella scheda del browser (v28, come Toggl): quando un timer è
// attivo, il titolo della scheda mostra il tempo che scorre e l'icona
// riceve un pallino verde (giallo se in pausa). Vale solo per l'app aperta
// in una scheda di Chrome/Safari: la PWA installata su iPhone non ha
// schede, lì non cambia nulla.
export default function TabTimer() {
  const { runningEntries, projectById } = useData();
  const baseIconRef = useRef(null); // href originale del favicon

  const active = runningEntries[0] || null;
  const activeId = active?.id || null;
  const isPaused = !!active?.paused_at;

  useEffect(() => {
    const link = document.querySelector('link[rel="icon"]');
    if (link && baseIconRef.current == null) baseIconRef.current = link.href;

    // nessun timer: ripristina titolo e icona originali
    if (!active) {
      document.title = APP_NAME;
      if (link && baseIconRef.current) link.href = baseIconRef.current;
      return;
    }

    // Favicon con pallino: disegno l'icona originale su un canvas e
    // aggiungo un cerchio colorato in basso a destra.
    function drawDot(color) {
      if (!link || !baseIconRef.current) return;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 32, 32);
        ctx.beginPath();
        ctx.arc(24, 24, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        link.href = c.toDataURL("image/png");
      };
      img.src = baseIconRef.current;
    }
    drawDot(isPaused ? "#e5a300" : "#1f9d6b");

    const label =
      active.description?.trim() ||
      projectById(active.project_id)?.name ||
      APP_NAME;

    function tick() {
      const secs = entrySeconds(active, Date.now());
      document.title = `${isPaused ? "⏸" : "▶"} ${fmtClock(secs)} · ${label}`;
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      clearInterval(t);
      document.title = APP_NAME;
      if (link && baseIconRef.current) link.href = baseIconRef.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, isPaused]);

  return null;
}
