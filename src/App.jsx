import { useState } from "react";
import { useAuth } from "./state/AuthContext.jsx";
import { DataProvider, useData } from "./state/DataContext.jsx";
import Login from "./screens/Login.jsx";
import Timer from "./screens/Timer.jsx";
import Reports from "./screens/Reports.jsx";
import Admin from "./screens/Admin.jsx";
import ConfigNeeded from "./screens/ConfigNeeded.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { IconClock } from "./lib/icons.jsx";

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={signOut}>
      Esci
    </button>
  );
}

function Toasts() {
  const { toasts } = useData();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "toast " +
            (t.kind === "error" ? "toast-err" : t.kind === "ok" ? "toast-ok" : "")
          }
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function OfflinePill() {
  const { online, pending } = useData();
  if (online && pending === 0) return null;
  return (
    <div className="offline-pill">
      <span className="dot-pulse" />
      {!online
        ? pending > 0
          ? `Offline · ${pending} da salvare`
          : "Offline"
        : `Sincronizzo · ${pending}`}
    </div>
  );
}

function MainApp() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("timer");

  return (
    <DataProvider>
      <div className="app-shell">
        <OfflinePill />
        {tab === "timer" && <Timer />}
        {tab === "reports" && <Reports />}
        {tab === "admin" && isAdmin && <Admin />}
        <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
        <Toasts />
      </div>
    </DataProvider>
  );
}

export default function App() {
  const { isConfigured, loading, session, profile, profileError } = useAuth();

  if (!isConfigured) return <ConfigNeeded />;

  if (loading) {
    return (
      <div className="full-center">
        <span className="spinner" />
      </div>
    );
  }

  if (!session) return <Login />;

  // account disattivato dall'amministratore
  if (profile && profile.active === false) {
    return (
      <div className="login-wrap">
        <div
          className="login-logo"
          style={{ background: "#16161d", display: "grid", placeItems: "center" }}
        >
          <IconClock style={{ width: 30, height: 30, color: "#ff8a3d" }} />
        </div>
        <h1 className="login-h">Account disattivato</h1>
        <p className="login-p">
          Il tuo account è stato disattivato dall'amministratore. Contattalo per
          riattivarlo.
        </p>
        <LogoutButton />
      </div>
    );
  }

  // sessione attiva ma profilo mancante (trigger non installato o errore)
  if (!profile && profileError) {
    return (
      <div className="login-wrap">
        <div className="login-logo" style={{ background: "#16161d", display: "grid", placeItems: "center" }}>
          <IconClock style={{ width: 30, height: 30, color: "#ff8a3d" }} />
        </div>
        <h1 className="login-h">Quasi pronto</h1>
        <p className="login-p">
          Il tuo accesso funziona, ma manca il profilo nel database. Di solito
          significa che lo script SQL di configurazione non è stato ancora
          eseguito su Supabase. Esegui lo script e riapri l'app.
        </p>
        <div className="banner banner-warn">Dettaglio tecnico: {profileError}</div>
      </div>
    );
  }

  return <MainApp />;
}
