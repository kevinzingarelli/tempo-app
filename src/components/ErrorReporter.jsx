import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext.jsx";

// Raccoglitore errori (v30): registra in Supabase gli errori JavaScript
// che capitano agli utenti (es. schermo bianco), così gli admin li vedono
// in Dashboard invece di scoprirli per sentito dire. Silenzioso e
// prudente: massimo 5 per sessione, mai due volte lo stesso messaggio,
// e se l'invio fallisce non disturba l'utente.
const sent = new Set();
let count = 0;
const MAX_PER_SESSION = 5;

export default function ErrorReporter() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    async function report(message, stack) {
      const key = (message || "").slice(0, 120);
      if (!key || sent.has(key) || count >= MAX_PER_SESSION) return;
      sent.add(key);
      count += 1;
      try {
        await supabase.from("client_errors").insert({
          user_id: user.id,
          message: key,
          stack: (stack || "").slice(0, 2000) || null,
          url: location.pathname + location.search,
          user_agent: navigator.userAgent.slice(0, 200),
        });
      } catch {
        /* mai disturbare l'utente per un errore del raccoglitore */
      }
    }

    const onError = (e) => report(e.message, e.error?.stack);
    const onRejection = (e) => {
      const r = e.reason;
      report(typeof r === "string" ? r : r?.message || "Promise rejection", r?.stack);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [user]);

  return null;
}
