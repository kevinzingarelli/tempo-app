import { useState } from "react";
import { useAuth } from "./state/AuthContext.jsx";
import { DataProvider, useData } from "./state/DataContext.jsx";
import Login from "./screens/Login.jsx";
import Timer from "./screens/Timer.jsx";
import Reports from "./screens/Reports.jsx";
import PersonalStats from "./screens/PersonalStats.jsx";
import Admin from "./screens/Admin.jsx";
import TimeOff from "./screens/TimeOff.jsx";
import ConfigNeeded from "./screens/ConfigNeeded.jsx";
import BottomNav from "./components/BottomNav.jsx";
import ClosureAnnouncement from "./components/ClosureAnnouncement.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import ErrorReporter from "./components/ErrorReporter.jsx";
import TimerRecovery from "./components/TimerRecovery.jsx";
import TabTimer from "./components/TabTimer.jsx";
import { IconClock } from "./lib/icons.jsx";
import { entrySeconds } from "./lib/format.js";
import { useState as useStateReact, useEffect as useEffectReact } from "react";

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

function LongTimerPill({ tab, setTab }) {
  const { runningEntries } = useData();
  const [, tick] = useStateReact(0);
  useEffectReact(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (tab === "timer") return null;
  const anyLong = runningEntries.some((e) => !e.paused_at && entrySeconds(e) > 4 * 3600);
  if (!anyLong) return null;
  return (
    <button
      className="offline-pill"
      style={{ background: "var(--warn)", cursor: "pointer" }}
      onClick={() => setTab("timer")}
    >
      ⏳ Timer attivo da più di 4 ore — tocca per controllare
    </button>
  );
}

function MainApp() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("timer");

  return (
    <DataProvider>
      <div className="app-shell">
        <ClosureAnnouncement />
        <UpdateBanner />
        <TabTimer />
        <ErrorReporter />
        <TimerRecovery />
        <OfflinePill />
        <LongTimerPill tab={tab} setTab={setTab} />
        {tab === "timer" && <Timer />}
        {tab === "stats" && <PersonalStats />}
        {tab === "reports" && <Reports />}
        {tab === "timeoff" && <TimeOff />}
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
