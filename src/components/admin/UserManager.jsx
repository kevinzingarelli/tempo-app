import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../state/AuthContext.jsx";
import { useData } from "../../state/DataContext.jsx";
import Sheet from "../Sheet.jsx";
import { IconChevron } from "../../lib/icons.jsx";

function Toggle({ on }) {
  return (
    <span style={{ width: 46, height: 28, borderRadius: 999, background: on ? "#1f9d6b" : "#d9d9d2", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </span>
  );
}

function UserForm({ user, me, onClose, onSaved }) {
  const { toast } = useData();
  const [name, setName] = useState(user.name || "");
  const [role, setRole] = useState(user.role || "member");
  const [active, setActive] = useState(user.active !== false);
  const [cost, setCost] = useState(user.cost_rate != null ? String(user.cost_rate) : "");
  const [contract, setContract] = useState(user.contracted_hours_weekly != null ? String(user.contracted_hours_weekly) : "");
  const [busy, setBusy] = useState(false);
  const isMe = user.id === me;

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      name: name.trim(),
      role,
      active,
      cost_rate: cost ? Number(cost.replace(",", ".")) : null,
      contracted_hours_weekly: contract ? Number(contract.replace(",", ".")) : null,
    }).eq("id", user.id);
    setBusy(false);
    if (error) { toast("Errore: " + error.message, "error"); return; }
    onSaved();
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title="Modifica persona">
      <div className="sheet-row">
        <label className="field-label">Nome</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="sheet-row">
        <label className="field-label">Ruolo</label>
        <div className="segment">
          <button className={role === "member" ? "active" : ""} onClick={() => setRole("member")}>Utente</button>
          <button className={role === "admin" ? "active" : ""} onClick={() => !isMe && setRole("admin")} disabled={isMe}>Admin</button>
        </div>
        {isMe && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Non puoi togliere il ruolo admin a te stesso.</p>}
      </div>

      <div className="sheet-row">
        <label className="field-label">Ore settimanali da contratto</label>
        <input className="field" inputMode="decimal" placeholder="Es. 40" value={contract} onChange={(e) => setContract(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Serve per confrontare le ore fatte con quelle previste.</p>
      </div>

      <div className="sheet-row">
        <label className="field-label">Costo orario azienda (€/ora) — opzionale</label>
        <input className="field" inputMode="decimal" placeholder="Es. 20" value={cost} onChange={(e) => setCost(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Quanto ti costa un'ora di questa persona. Serve per calcolare il margine.</p>
      </div>

      <div className="sheet-row">
        <button className="list-action card" style={{ width: "100%" }} onClick={() => !isMe && setActive((a) => !a)} disabled={isMe}>
          <span style={{ fontWeight: 600 }}>Attivo</span>
          <Toggle on={active} />
        </button>
        {isMe && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Non puoi disattivare te stesso.</p>}
      </div>

      <button className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner spinner-white" /> : "Salva"}
      </button>
    </Sheet>
  );
}

export default function UserManager() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, active, cost_rate, contracted_hours_weekly")
      .order("name");
    if (data) setPeople(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="center" style={{ marginTop: 30 }}><span className="spinner" /></div>;

  return (
    <div>
      <button className="btn btn-primary btn-block btn-lg" style={{ marginBottom: 16 }} onClick={() => setHowOpen(true)}>
        Come aggiungere una persona
      </button>

      <div className="card">
        {people.map((p) => (
          <button key={p.id} className="list-action" style={{ width: "100%", textAlign: "left" }} onClick={() => setEditUser(p)}>
            <span>
              <span style={{ fontWeight: 600 }}>{p.name || "Senza nome"}{p.id === user.id ? " (tu)" : ""}</span>
              <span className="muted" style={{ fontSize: 12.5, display: "block" }}>
                {p.role === "admin" ? "Amministratore" : "Utente"}
                {p.contracted_hours_weekly ? ` · ${p.contracted_hours_weekly}h/sett` : ""}
                {p.active === false ? " · disattivato" : ""}
              </span>
            </span>
            <IconChevron style={{ width: 18, height: 18, color: "#9a9aa3" }} />
          </button>
        ))}
      </div>

      {editUser && <UserForm user={editUser} me={user.id} onClose={() => setEditUser(null)} onSaved={load} />}

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="Aggiungere una persona">
        <div className="card" style={{ padding: 16, fontSize: 14, lineHeight: 1.55 }}>
          <p style={{ marginTop: 0 }}>Gli account si creano dal pannello di Supabase (solo tu vi hai accesso):</p>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            <li>Apri il tuo progetto su supabase.com</li>
            <li>Menu <b>Authentication</b> → <b>Users</b> → <b>Add user</b></li>
            <li>Inserisci email e password della persona</li>
            <li>Attiva <b>Auto Confirm User</b></li>
            <li>Torna qui: comparirà nell'elenco. Toccala per impostare nome, ore da contratto e costo.</li>
          </ol>
        </div>
      </Sheet>
    </div>
  );
}
