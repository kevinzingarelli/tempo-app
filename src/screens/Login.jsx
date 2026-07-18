import { useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password) {
      setErr("Inserisci email e password.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await signIn(email, password);
    } catch (e) {
      const m = (e?.message || "").toLowerCase();
      if (m.includes("invalid")) setErr("Email o password non corretti.");
      else if (m.includes("network") || m.includes("fetch"))
        setErr("Nessuna connessione. Riprova.");
      else setErr(e?.message || "Accesso non riuscito.");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div
        className="login-logo"
        style={{ display: "grid", placeItems: "center", overflow: "hidden" }}
      >
        <img src="/icon-192.png" alt="Boschetto" style={{ width: "100%", height: "100%" }} />
      </div>
      <h1 className="login-h">Boschetto</h1>
      <p className="login-p">Il tuo tempo che cresce, un albero alla volta.</p>

      <div className="sheet-row">
        <label className="field-label">Email</label>
        <input
          className="field"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="nome@email.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="sheet-row">
        <label className="field-label">Password</label>
        <input
          className="field"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      {err && (
        <div className="banner banner-warn" style={{ marginTop: 4 }}>
          {err}
        </div>
      )}

      <button
        className="btn btn-primary btn-block btn-lg"
        style={{ marginTop: 10 }}
        onClick={submit}
        disabled={busy}
      >
        {busy ? <span className="spinner spinner-white" /> : "Accedi"}
      </button>

      <p className="muted center" style={{ fontSize: 12.5, marginTop: 22 }}>
        Gli account sono creati dall'amministratore.
      </p>
    </div>
  );
}
