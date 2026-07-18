import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";
import { useData } from "../state/DataContext.jsx";
import { IconPlus, IconCalendar } from "../lib/icons.jsx";

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtRange(a, b) {
  const opt = { day: "numeric", month: "short" };
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  if (a === b) return da.toLocaleDateString("it-IT", { ...opt, year: "numeric" });
  return `${da.toLocaleDateString("it-IT", opt)} – ${db.toLocaleDateString("it-IT", { ...opt, year: "numeric" })}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}
const STATUS = {
  pending: { label: "In attesa", color: "var(--warn)", bg: "rgba(192,127,17,0.14)" },
  approved: { label: "Approvata", color: "var(--ok)", bg: "rgba(18,153,107,0.14)" },
  rejected: { label: "Rifiutata", color: "var(--stop)", bg: "rgba(224,66,75,0.14)" },
};

export default function TimeOff() {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useData();
  const [mine, setMine] = useState([]);
  const [allReq, setAllReq] = useState([]);
  const [people, setPeople] = useState({});
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);

  // form richiesta
  const [start, setStart] = useState(isoToday());
  const [end, setEnd] = useState(isoToday());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  // form giorno rosso (admin)
  const [cDay, setCDay] = useState(isoToday());
  const [cLabel, setCLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [mineRes, closRes] = await Promise.all([
      supabase.from("time_off").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
      supabase.from("closures").select("*").order("day", { ascending: true }),
    ]);
    setMine(mineRes.data || []);
    setClosures(closRes.data || []);
    if (isAdmin) {
      const [allRes, profRes] = await Promise.all([
        supabase.from("time_off").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, name"),
      ]);
      setAllReq(allRes.data || []);
      const m = {};
      (profRes.data || []).forEach((p) => (m[p.id] = p.name || "Senza nome"));
      setPeople(m);
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function sendRequest() {
    if (end < start) { toast("La data di fine è prima dell'inizio.", "error"); return; }
    setSending(true);
    const { error } = await supabase.from("time_off").insert({
      user_id: user.id, start_date: start, end_date: end, note: note.trim() || null,
    });
    setSending(false);
    if (error) { toast("Invio non riuscito: " + error.message, "error"); return; }
    toast("Richiesta inviata. Ora attende l'approvazione.", "ok");
    setNote("");
    load();
  }

  async function cancelMine(id) {
    const { error } = await supabase.from("time_off").delete().eq("id", id);
    if (error) { toast("Non è stato possibile annullare.", "error"); return; }
    toast("Richiesta annullata.", "ok");
    load();
  }

  async function decide(req, status) {
    const { error } = await supabase
      .from("time_off")
      .update({ status, decided_by: user.id, decided_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) { toast("Operazione non riuscita: " + error.message, "error"); return; }
    toast(status === "approved" ? "Ferie approvate." : "Richiesta rifiutata.", "ok");
    load();
  }

  async function addClosure() {
    if (!cLabel.trim()) { toast("Dai un nome al giorno rosso (es. Natale).", "error"); return; }
    const { error } = await supabase.from("closures").upsert({ day: cDay, label: cLabel.trim() }, { onConflict: "day" });
    if (error) { toast("Non è stato possibile aggiungere: " + error.message, "error"); return; }
    toast("Giorno rosso aggiunto.", "ok");
    setCLabel("");
    load();
  }

  async function removeClosure(id) {
    const { error } = await supabase.from("closures").delete().eq("id", id);
    if (error) { toast("Non è stato possibile rimuovere.", "error"); return; }
    load();
  }

  const pending = allReq.filter((r) => r.status === "pending");
  const decided = allReq.filter((r) => r.status !== "pending");

  if (loading)
    return (
      <div className="screen">
        <div className="center" style={{ marginTop: 60 }}><span className="spinner" /></div>
      </div>
    );

  return (
    <div className="screen">
      <div className="screen-head">
        <div className="screen-title">Ferie</div>
        <div className="screen-sub">Richiedi i giorni liberi e vedi le chiusure</div>
      </div>

      {/* Admin: richieste da approvare */}
      {isAdmin && (
        <>
          <div className="section-label">Da approvare {pending.length > 0 && `(${pending.length})`}</div>
          {pending.length === 0 ? (
            <div className="empty" style={{ padding: 22 }}>Nessuna richiesta in attesa.</div>
          ) : (
            <div className="card">
              {pending.map((r) => (
                <div key={r.id} className="list-action" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{people[r.user_id] || "—"}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {fmtRange(r.start_date, r.end_date)} · {daysBetween(r.start_date, r.end_date)}g
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => decide(r, "approved")}>Approva</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--stop)" }} onClick={() => decide(r, "rejected")}>Rifiuta</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* La mia richiesta */}
      <div className="section-label">Nuova richiesta</div>
      <div className="card" style={{ padding: 16 }}>
        <div className="grid-2">
          <div>
            <label className="field-label">Dal</label>
            <input type="date" className="field" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
          </div>
          <div>
            <label className="field-label">Al</label>
            <input type="date" className="field" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="field-label">Nota (facoltativa)</label>
          <input className="field" placeholder="Es. Vacanza, visita medica…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="muted" style={{ fontSize: 12.5, margin: "8px 0 12px" }}>
          {daysBetween(start, end)} {daysBetween(start, end) === 1 ? "giorno" : "giorni"} richiesti.
        </div>
        <button className="btn btn-primary btn-block btn-lg" onClick={sendRequest} disabled={sending}>
          {sending ? <span className="spinner spinner-white" /> : <><IconPlus style={{ width: 17, height: 17 }} /> Invia richiesta</>}
        </button>
      </div>

      {/* Le mie richieste */}
      {mine.length > 0 && (
        <>
          <div className="section-label">Le mie richieste</div>
          <div className="card">
            {mine.map((r) => {
              const st = STATUS[r.status] || STATUS.pending;
              return (
                <div key={r.id} className="list-action">
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{fmtRange(r.start_date, r.end_date)}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {daysBetween(r.start_date, r.end_date)}g{r.note ? ` · ${r.note}` : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 9px", borderRadius: "var(--r-pill)" }}>
                      {st.label}
                    </span>
                    {r.status === "pending" && (
                      <button className="btn btn-ghost btn-sm" onClick={() => cancelMine(r.id)}>Annulla</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Giorni rossi comuni */}
      <div className="section-label">Giorni di chiusura</div>
      <div className="card" style={{ padding: "6px 14px" }}>
        <div className="row-between" style={{ padding: "9px 0", borderBottom: closures.length ? "1px solid var(--line)" : "none" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="dot-red" /> <span style={{ fontWeight: 600 }}>Sabato e domenica</span>
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>sempre chiusi</span>
        </div>
        {closures.map((c) => (
          <div key={c.id} className="row-between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="dot-red" />
              <span>
                <span style={{ fontWeight: 600, display: "block" }}>{c.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {new Date(c.day + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </span>
            </span>
            {isAdmin && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--stop)" }} onClick={() => removeClosure(c.id)}>
                Rimuovi
              </button>
            )}
          </div>
        ))}
        {closures.length === 0 && (
          <div className="muted" style={{ fontSize: 13, padding: "10px 0" }}>
            Nessuna festività aggiunta.
          </div>
        )}
      </div>

      {/* Admin: aggiungi giorno rosso */}
      {isAdmin && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <label className="field-label">Aggiungi un giorno rosso</label>
          <div className="grid-2" style={{ marginTop: 2 }}>
            <input type="date" className="field" value={cDay} onChange={(e) => setCDay(e.target.value)} />
            <input className="field" placeholder="Es. Natale" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
          </div>
          <button className="btn btn-soft btn-block" style={{ marginTop: 10 }} onClick={addClosure}>
            <IconCalendar style={{ width: 16, height: 16 }} /> Segna come chiusura
          </button>
        </div>
      )}

      {/* Admin: storico decisioni */}
      {isAdmin && decided.length > 0 && (
        <>
          <div className="section-label">Richieste gestite</div>
          <div className="card">
            {decided.slice(0, 20).map((r) => {
              const st = STATUS[r.status];
              return (
                <div key={r.id} className="list-action">
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{people[r.user_id] || "—"}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{fmtRange(r.start_date, r.end_date)}</span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 9px", borderRadius: "var(--r-pill)", flexShrink: 0 }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
