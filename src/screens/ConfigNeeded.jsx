import { IconClock } from "../lib/icons.jsx";

export default function ConfigNeeded() {
  return (
    <div className="login-wrap">
      <div
        className="login-logo"
        style={{ background: "#16161d", display: "grid", placeItems: "center" }}
      >
        <IconClock style={{ width: 30, height: 30, color: "#ff8a3d" }} />
      </div>
      <h1 className="login-h">Configurazione mancante</h1>
      <p className="login-p">
        L'app non trova le chiavi di Supabase. Vanno inserite su Vercel come
        variabili d'ambiente, poi serve un nuovo deploy.
      </p>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14 }}>
          Variabili richieste:
        </p>
        <p style={{ margin: 0, fontSize: 13.5 }} className="muted">
          VITE_SUPABASE_URL
          <br />
          VITE_SUPABASE_ANON_KEY
        </p>
      </div>
      <p className="login-p" style={{ marginTop: 20, fontSize: 13.5 }}>
        Su Vercel: Settings → Environment Variables → aggiungi le due voci →
        Deployments → Redeploy.
      </p>
    </div>
  );
}
