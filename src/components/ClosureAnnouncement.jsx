import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";

// Pop-up bloccante: se c'è un avviso attivo che l'utente non ha ancora
// confermato, occupa tutto lo schermo e non lascia passare finché non si
// preme "Ho capito". Nessuna chiusura accidentale (niente tasto indietro
// del backdrop, niente X).
export default function ClosureAnnouncement() {
  const { user } = useAuth();
  const [pending, setPending] = useState(null); // { id, title, message } | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: anns, error: e1 } = await supabase
          .from("announcements")
          .select("id, title, message, created_at")
          .eq("active", true)
          .order("created_at", { ascending: false });
        if (e1 || !anns || anns.length === 0) return;

        const { data: acks, error: e2 } = await supabase
          .from("announcement_acks")
          .select("announcement_id")
          .eq("user_id", user.id);
        if (e2) return;

        const ackedIds = new Set((acks || []).map((a) => a.announcement_id));
        const unacked = anns.find((a) => !ackedIds.has(a.id));
        if (unacked && !cancelled) setPending(unacked);
      } catch {
        // silenzioso: un avviso non mostrato non deve mai bloccare l'app
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("announcement_acks")
        .insert({ announcement_id: pending.id, user_id: user.id });
      if (error) throw error;
      setPending(null);
    } catch {
      setBusy(false);
    }
  }

  if (!pending) return null;

  return (
    <div className="announce-overlay">
      <div className="announce-card">
        <div className="announce-icon">📢</div>
        <h2 className="announce-title">{pending.title}</h2>
        <p className="announce-msg">{pending.message}</p>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={confirm}>
          {busy ? "..." : "Ho capito"}
        </button>
      </div>
    </div>
  );
}
