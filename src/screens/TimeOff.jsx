import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";
import { useData } from "../state/DataContext.jsx";
import { IconPlus, IconCalendar, IconCheck } from "../lib/icons.jsx";
import { leaveBalance, fmtDaysHours } from "../lib/leave.js";

function LeaveStat({ label, bal, hpd }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: bal.remainingHours >= 0 ? "var(--ok)" : "var(--stop)" }}>
        {fmtDaysHours(bal.remainingHours, hpd)} residui
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        maturati {fmtDaysHours(bal.accruedHours, hpd)} · usati {fmtDaysHours(bal.usedHours, hpd)}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
        totale anno {fmtDaysHours(bal.yearHours, hpd)}
      </div>
    </div>
  );
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toISO(d) {
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
function friendlyError(e) {
  const msg = (e?.message || "").toLowerCase();
  const code = e?.code || "";
  if (msg.includes("does not exist") || code === "42p01") {
    return "Il database non è ancora aggiornato per le ferie: manca lo script SQL. Chiedi a chi gestisce l'app di eseguirlo su Supabase.";
  }
  if (code === "42501" || msg.includes("row-level security") || msg.includes("not authorized")) {
    return "Operazione non consentita per il tuo ruolo.";
  }
  if (msg.includes("duplicate")) return "Esiste già una voce per questa data.";
  return "Operazione non riuscita: " + (e?.message || "riprova");
}

function nationalHolidays(year) {
  return [
    { day: `${year}-01-01`, label: "Capodanno" },
    { day: `${year}-01-06`, label: "Epifania" },
    { day: `${year}-04-25`, label: "Festa della Liberazione" },
    { day: `${year}-05-01`, label: "Festa dei Lavoratori" },
    { day: `${year}-06-02`, label: "Festa della Repubblica" },
    { day: `${year}-08-15`, label: "Ferragosto" },
    { day: `${year}-09-29`, label: "San Michele Arcangelo (patrono di Vasto)" },
    { day: `${year}-11-01`, label: "Ognissanti" },
    { day: `${year}-12-08`, label: "Immacolata Concezione" },
    { day: `${year}-12-25`, label: "Natale" },
    { day: `${year}-12-26`, label: "Santo Stefano" },
  ];
}

// Icona stagionale per un giorno di ferie approvate, in base al periodo.
function seasonalIcon(dateObj) {
  const m = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  if ((m === 12 && day >= 8) || (m === 1 && day <= 6)) return "🎄"; // Natale
  if (m >= 6 && m <= 9) return "🏖️"; // estate
  if (m >= 3 && m <= 5) return "🌸"; // primavera
  if (m === 10 || m === 11) return "🍂"; // autunno
  return "⛄"; // inverno
}

const STATUS = {
  pending: { label: "In attesa", color: "var(--warn)", bg: "rgba(192,127,17,0.14)" },
  approved: { label: "Approvata", color: "var(--ok)", bg: "rgba(47,125,79,0.14)" },
  rejected: { label: "Rifiutata", color: "var(--stop)", bg: "rgba(224,66,75,0.14)" },
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function TimeOff() {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useData();
  const [mine, setMine] = useState([]);
  const [allReq, setAllReq] = useState([]);
  const [people, setPeople] = useState({});
  const [peopleLeave, setPeopleLeave] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [filterPerson, setFilterPerson] = useState("all");
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const [start, setStart] = useState(isoToday());
  const [end, setEnd] = useState(isoToday());
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("ferie");
  const [sending, setSending] = useState(false);

  const [cDay, setCDay] = useState(isoToday());
  const [cLabel, setCLabel] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mineRes, closRes] = await Promise.all([
        supabase.from("time_off").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
        supabase.from("closures").select("*").order("day", { ascending: true }),
      ]);
      if (mineRes.error) throw mineRes.error;
      if (closRes.error) throw closRes.error;
      setMine(mineRes.data || []);
      setClosures(closRes.data || []);
      if (isAdmin) {
        const [allRes, profRes] = await Promise.all([
          supabase.from("time_off").select("*").order("created_at", { ascending: false }),
          supabase.from("profiles").select("id, name, active, annual_leave_days, annual_leave_hours, annual_permit_hours, work_hours_per_day"),
        ]);
        setAllReq(allRes.data || []);
        const m = {};
        const leaveMap = {};
        const profList = [];
        (profRes.data || []).forEach((p) => {
          m[p.id] = p.name || "Senza nome";
          leaveMap[p.id] = p.annual_leave_days ?? null;
          if (p.active !== false) profList.push(p);
        });
        setPeople(m);
        setPeopleLeave(leaveMap);
        setProfiles(profList);
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, toast]);

  useEffect(() => { load(); }, [load]);

  async function sendRequest() {
    if (end < start) { toast("La data di fine è prima dell'inizio.", "error"); return; }
    setSending(true);
    try {
      const { error } = await supabase.from("time_off").insert({
        user_id: user.id, start_date: start, end_date: end, kind, note: note.trim() || null,
      });
      if (error) throw error;
      toast("Richiesta inviata. Ora attende l'approvazione.", "ok");
      setNote("");
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function cancelMine(id) {
    try {
      const { error } = await supabase.from("time_off").delete().eq("id", id);
      if (error) throw error;
      toast("Richiesta annullata.", "ok");
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function decide(req, status) {
    try {
      const { error } = await supabase
        .from("time_off")
        .update({ status, decided_by: user.id, decided_at: new Date().toISOString() })
        .eq("id", req.id);
      if (error) throw error;
      toast(status === "approved" ? "Ferie approvate." : "Richiesta rifiutata.", "ok");
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function deleteRequest(req) {
    if (!confirm(`Eliminare la richiesta di ${people[req.user_id] || "questa persona"} (${fmtRange(req.start_date, req.end_date)})?\n\nL'assenza sparirà dal calendario. Operazione non annullabile.`)) return;
    try {
      const { error } = await supabase.from("time_off").delete().eq("id", req.id);
      if (error) throw error;
      toast("Richiesta eliminata.", "ok");
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function addClosure(day, label) {
    if (!label?.trim()) { toast("Dai un nome al giorno rosso (es. Natale).", "error"); return; }
    try {
      const { error } = await supabase.from("closures").upsert({ day, label: label.trim() }, { onConflict: "day" });
      if (error) throw error;
      toast("Giorno rosso aggiunto.", "ok");
      setCLabel("");
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function removeClosure(id) {
    try {
      const { error } = await supabase.from("closures").delete().eq("id", id);
      if (error) throw error;
      load();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  const pending = allReq.filter((r) => r.status === "pending");

  // Ferie residue personali (anno corrente, esclusi sab/dom)
  const myLeaveUsed = (() => {
    const y = new Date().getFullYear();
    let used = 0;
    for (const r of mine) {
      if (r.status !== "approved") continue;
      let d = new Date(r.start_date + "T00:00:00");
      const end = new Date(r.end_date + "T00:00:00");
      while (d <= end) {
        if (d.getFullYear() === y) {
          const wd = d.getDay();
          if (wd !== 0 && wd !== 6) used++;
        }
        d = new Date(d.getTime() + 86400000);
      }
    }
    return used;
  })();
  const myLeaveTotal = profile?.annual_leave_days ?? null;
  const myLeaveLeft = myLeaveTotal != null ? Math.max(0, myLeaveTotal - myLeaveUsed) : null;
  const decided = allReq.filter((r) => r.status !== "pending");

  // Alert ferie non godute (solo admin): stima gestionale.
  // Conto i giorni di ferie APPROVATE per persona nell'anno corrente e li
  // confronto col monte annuo. Se una persona ha usato molto poco delle sue
  // ferie e siamo nella seconda metà dell'anno, la segnalo come promemoria:
  // le ferie non godute vanno usate entro 18 mesi (rischio di perderle/contenzioso).
  const leaveAlerts = (() => {
    if (!isAdmin) return [];
    const y = new Date().getFullYear();
    const month = new Date().getMonth(); // 0-11
    const alerts = [];
    // giorni ferie approvati per persona quest'anno (kind ferie)
    const usedByPerson = {};
    for (const r of allReq) {
      if (r.status !== "approved") continue;
      if (r.kind && r.kind !== "ferie") continue;
      let d = new Date(r.start_date + "T00:00:00");
      const end = new Date(r.end_date + "T00:00:00");
      while (d <= end) {
        if (d.getFullYear() === y) {
          const wd = d.getDay();
          if (wd !== 0 && wd !== 6) usedByPerson[r.user_id] = (usedByPerson[r.user_id] || 0) + 1;
        }
        d = new Date(d.getTime() + 86400000);
      }
    }
    for (const [uid, total] of Object.entries(peopleLeave)) {
      if (total == null || total <= 0) continue;
      const used = usedByPerson[uid] || 0;
      const left = total - used;
      // maturato teorico a oggi (proporzionale ai mesi trascorsi)
      const accruedSoFar = total * ((month + 1) / 12);
      // segnalo se: siamo dopo giugno E la persona ha ancora molte ferie non godute
      // (residuo > metà del monte annuo dopo metà anno = sta accumulando)
      if (month >= 6 && left > total * 0.5) {
        alerts.push({ uid, name: people[uid] || "Senza nome", left, total, used });
      }
    }
    return alerts.sort((a, b) => b.left - a.left);
  })();

  // Riepilogo saldi ferie/permessi per persona (admin).
  const leaveSummary = (() => {
    if (!isAdmin) return [];
    return profiles
      .map((p) => {
        const reqs = allReq.filter((r) => r.user_id === p.id);
        const bal = leaveBalance(p, reqs);
        return bal ? { id: p.id, name: p.name || "Senza nome", bal } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const closureDays = new Set(closures.map((c) => c.day));
  const proposedHolidays = [...nationalHolidays(month.getFullYear()), ...nationalHolidays(month.getFullYear() + 1)]
    .filter((h) => !closureDays.has(h.day) && h.day >= isoToday())
    .slice(0, 6);

  const year = month.getFullYear();
  const mIdx = month.getMonth();
  const firstOfMonth = new Date(year, mIdx, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mIdx, d));

  function closureFor(dateObj) {
    if (!dateObj) return null;
    const iso = toISO(dateObj);
    const wd = dateObj.getDay();
    if (wd === 0 || wd === 6) return { label: "Weekend" };
    return closures.find((c) => c.day === iso) || null;
  }
  function myStatusFor(dateObj) {
    if (!dateObj) return null;
    const iso = toISO(dateObj);
    return mine.find((r) => iso >= r.start_date && iso <= r.end_date) || null;
  }
  function teamApprovedCount(dateObj) {
    if (!dateObj || !isAdmin) return 0;
    const iso = toISO(dateObj);
    return allReq.filter((r) => r.status === "approved" && iso >= r.start_date && iso <= r.end_date).length;
  }
  // Elenco assenze del team per un giorno (admin): nome, iniziale, stato, tipo.
  function teamAbsencesFor(dateObj) {
    if (!dateObj || !isAdmin) return [];
    const iso = toISO(dateObj);
    return allReq
      .filter((r) => (r.status === "approved" || r.status === "pending") && iso >= r.start_date && iso <= r.end_date)
      .filter((r) => filterPerson === "all" || r.user_id === filterPerson)
      .map((r) => {
        const name = people[r.user_id] || "—";
        return {
          id: r.id,
          name,
          initial: name.charAt(0).toUpperCase(),
          status: r.status,
          kind: r.kind || "ferie",
        };
      });
  }

  function shiftMonth(delta) {
    setMonth(new Date(year, mIdx + delta, 1));
  }
  function shiftYear(delta) {
    setMonth(new Date(year + delta, mIdx, 1));
  }
  const isCurMonth = year === new Date().getFullYear() && mIdx === new Date().getMonth();

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
        <div className="screen-sub">Calendario aziendale, richieste e chiusure</div>
      </div>

      <div className="admin-wide">
      <div>
      <div className="cal-nav">
        <button className="cal-arrow cal-arrow-yr" onClick={() => shiftYear(-1)} aria-label="Anno precedente">«</button>
        <button className="cal-arrow" onClick={() => shiftMonth(-1)} aria-label="Mese precedente">‹</button>
        <div className="cal-title">
          <span className="cal-month">{month.toLocaleDateString("it-IT", { month: "long" })}</span>
          <span className="cal-year">{year}</span>
        </div>
        <button className="cal-arrow" onClick={() => shiftMonth(1)} aria-label="Mese successivo">›</button>
        <button className="cal-arrow cal-arrow-yr" onClick={() => shiftYear(1)} aria-label="Anno successivo">»</button>
      </div>
      {!isCurMonth && (
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => setMonth(() => { const d = new Date(); d.setDate(1); return d; })}>
          Torna a oggi
        </button>
      )}

      {isAdmin && profiles.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <select className="field" value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
            <option value="all">Tutte le persone (calendario generale)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name || "Senza nome"}</option>
            ))}
          </select>
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <div className="cal-grid cal-head">
          {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty" />;
            const clo = closureFor(d);
            const my = myStatusFor(d);
            const teamCount = teamApprovedCount(d);
            const today = toISO(d) === isoToday();
            const isCompanyClosure = clo && clo.label && clo.label !== "Weekend";
            let cls = "cal-cell";
            cls += clo ? " closed" : " open";
            if (today) cls += " today";
            if (isCompanyClosure) cls += " company-closure";
            const titleTxt = clo?.label || (my ? STATUS[my.status]?.label : "Aperto");
            const showSeasonal = my?.status === "approved" && (my.kind === "ferie" || !my.kind);
            const teamAbs = isAdmin ? teamAbsencesFor(d) : [];
            return (
              <div key={i} className={cls} title={titleTxt}>
                <span className="cal-daynum">{d.getDate()}</span>
                <span className="cal-marks">
                  {!isAdmin && my?.status === "pending" && <span className="cal-mark mark-pending" />}
                  {!isAdmin && showSeasonal && <span className="cal-season" aria-hidden>{seasonalIcon(d)}</span>}
                  {!isAdmin && my?.status === "approved" && my.kind === "permesso" && <span className="cal-season" aria-hidden>🕐</span>}
                  {!isAdmin && my?.status === "approved" && my.kind === "malattia" && <span className="cal-season" aria-hidden>🤒</span>}
                </span>
                {isAdmin && teamAbs.length > 0 && (
                  <span className="cal-people">
                    {teamAbs.slice(0, 4).map((a) => (
                      <span
                        key={a.id}
                        className={"cal-person " + (a.status === "pending" ? "is-pending" : "is-approved")}
                        title={`${a.name} · ${a.status === "pending" ? "in attesa" : "approvata"}${a.kind !== "ferie" ? " · " + a.kind : ""}`}
                      >
                        {a.status === "pending" ? "🕐" : (a.kind === "permesso" ? "🕐" : a.kind === "malattia" ? "🤒" : "🏖️")}
                        <span className="cal-person-i">{a.initial}</span>
                      </span>
                    ))}
                    {teamAbs.length > 4 && <span className="cal-person-more">+{teamAbs.length - 4}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-legend">
        <span><span className="lg-dot lg-red" /> Chiuso (weekend / festa)</span>
        <span><span className="lg-dot lg-company" /> Chiusura aziendale</span>
        <span><span className="lg-dot lg-green" /> Aperto</span>
        {!isAdmin && <span><span className="cal-mark mark-pending" /> In attesa</span>}
        {isAdmin ? (
          <>
            <span><span className="cal-person is-approved" style={{ position: "static" }}>🏖️<span className="cal-person-i">D</span></span> Approvata (iniziale)</span>
            <span><span className="cal-person is-pending" style={{ position: "static" }}>🕐<span className="cal-person-i">D</span></span> In attesa</span>
            <span>🏖️ Ferie · 🕐 Permesso · 🤒 Malattia</span>
          </>
        ) : (
          <span>🏖️🌸🍂 Ferie · 🕐 Permesso · 🤒 Malattia</span>
        )}
      </div>

      {!isAdmin && myLeaveTotal != null && (
        <div className="card leave-balance">
          <div>
            <div className="leave-num">{myLeaveLeft}<span className="leave-den">/{myLeaveTotal} gg</span></div>
            <div className="muted" style={{ fontSize: 12.5 }}>Ferie residue quest'anno</div>
          </div>
          <div className="leave-bar-wrap">
            <div className="leave-bar" style={{ width: `${myLeaveTotal ? (myLeaveUsed / myLeaveTotal) * 100 : 0}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{myLeaveUsed} usati</div>
        </div>
      )}
      </div>

      <div>
      {isAdmin && leaveAlerts.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--warn)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🏖️ Ferie da smaltire</div>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
            Queste persone hanno ancora molte ferie non godute. Le ferie vanno usate entro 18 mesi dalla maturazione: pianificarle per tempo evita di perderle.
          </p>
          {leaveAlerts.map((a) => (
            <div key={a.uid} className="row-between" style={{ padding: "5px 0", fontSize: 13.5 }}>
              <span style={{ fontWeight: 600 }}>{a.name}</span>
              <span style={{ color: "var(--warn)", fontWeight: 700 }}>{a.left} gg residui <span className="muted" style={{ fontWeight: 400 }}>/ {a.total}</span></span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            ⚠️ Stima gestionale interna. Il saldo ufficiale è quello del consulente del lavoro.
          </p>
        </div>
      )}

      {isAdmin && leaveSummary.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginTop: 0 }}>Situazione ferie e permessi</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {leaveSummary.map((s, idx) => (
              <div key={s.id} style={{ padding: "12px 14px", borderTop: idx > 0 ? "1px solid var(--line)" : "none" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{s.name}</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {s.bal.ferie && (
                    <LeaveStat label="Ferie" bal={s.bal.ferie} hpd={s.bal.hoursPerDay} />
                  )}
                  {s.bal.permessi && (
                    <LeaveStat label="Permessi" bal={s.bal.permessi} hpd={s.bal.hoursPerDay} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Maturato = quota dell'anno trascorsa finora. Residuo = maturato meno usato. ⚠️ Stima gestionale interna, il dato ufficiale è del consulente del lavoro.
          </p>
        </div>
      )}
      {isAdmin && (
        <>
          <div className="section-label" style={{ marginTop: 0 }}>Da approvare {pending.length > 0 && `(${pending.length})`}</div>
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

          <div className="section-label">Festività da approvare come chiusura</div>
          {proposedHolidays.length === 0 ? (
            <div className="empty" style={{ padding: 22 }}>Nessuna proposta al momento.</div>
          ) : (
            <div className="card">
              {proposedHolidays.map((h) => (
                <div key={h.day} className="list-action">
                  <span>
                    <span style={{ fontWeight: 600, display: "block" }}>{h.label}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {new Date(h.day + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </span>
                  <button
                    className="btn btn-soft btn-sm"
                    disabled={addingHoliday === h.day}
                    onClick={async () => { setAddingHoliday(h.day); await addClosure(h.day, h.label); setAddingHoliday(null); }}
                  >
                    <IconCheck style={{ width: 15, height: 15 }} /> Approva
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!isAdmin && (
      <>
      <div className="section-label" style={{ marginTop: 0 }}>Nuova richiesta</div>
      <div className="card" style={{ padding: 16 }}>
        <label className="field-label">Tipo di assenza</label>
        <div className="segment" style={{ marginBottom: 12 }}>
          {[["ferie", "🏖️ Ferie"], ["permesso", "🕐 Permesso"], ["malattia", "🤒 Malattia"]].map(([k, l]) => (
            <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
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
          <input className="field" placeholder={kind === "malattia" ? "Es. giorni di malattia" : "Es. Vacanza, visita medica…"} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {kind === "malattia" && (
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            Non inserire dettagli sanitari. Serve solo a registrare l'assenza.
          </p>
        )}
        <div className="muted" style={{ fontSize: 12.5, margin: "8px 0 12px" }}>
          {daysBetween(start, end)} {daysBetween(start, end) === 1 ? "giorno" : "giorni"} richiesti.
        </div>
        <button className="btn btn-primary btn-block btn-lg" onClick={sendRequest} disabled={sending}>
          {sending ? <span className="spinner spinner-white" /> : <><IconPlus style={{ width: 17, height: 17 }} /> Invia richiesta</>}
        </button>
      </div>
      </>
      )}

      {!isAdmin && mine.length > 0 && (
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

      <div className="section-label">Giorni di chiusura fissi</div>
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

      {isAdmin && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <label className="field-label">Aggiungi un giorno rosso manuale</label>
          <div className="grid-2" style={{ marginTop: 2 }}>
            <input type="date" className="field" value={cDay} onChange={(e) => setCDay(e.target.value)} />
            <input className="field" placeholder="Es. Chiusura estiva" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
          </div>
          <button className="btn btn-soft btn-block" style={{ marginTop: 10 }} onClick={() => addClosure(cDay, cLabel)}>
            <IconCalendar style={{ width: 16, height: 16 }} /> Segna come chiusura
          </button>
        </div>
      )}

      {isAdmin && decided.length > 0 && (
        <>
          <div className="section-label">Richieste gestite</div>
          <div className="card">
            {decided.slice(0, 20).map((r) => {
              const st = STATUS[r.status];
              return (
                <div key={r.id} className="list-action">
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{people[r.user_id] || "—"}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{fmtRange(r.start_date, r.end_date)}</span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 9px", borderRadius: "var(--r-pill)", flexShrink: 0 }}>
                    {st.label}
                  </span>
                  <button
                    onClick={() => deleteRequest(r)}
                    aria-label="Elimina richiesta"
                    style={{ marginLeft: 8, width: 28, height: 28, borderRadius: "50%", background: "var(--surface-2)", color: "var(--stop)", fontSize: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
