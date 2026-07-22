import { useRegisterSW } from "virtual:pwa-register/react";

// Banner "nuova versione disponibile" (v27). Con registerType "prompt" il
// service worker NON si aggiorna da solo: quando c'è una nuova versione
// compare questo invito gentile (non bloccante) con "Aggiorna ora".
// "Più tardi" lo chiude: ricomparirà al prossimo avvio se non si aggiorna.
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 86,
        zIndex: 60,
        width: "min(420px, calc(100vw - 24px))",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        boxShadow: "0 8px 28px rgba(0,0,0,.25)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>🌱</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, display: "block" }}>
          Nuova versione disponibile
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          Aggiorna per avere le ultime novità.
        </span>
      </span>
      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button className="btn btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
          Aggiorna ora
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setNeedRefresh(false)}>
          Più tardi
        </button>
      </span>
    </div>
  );
}
