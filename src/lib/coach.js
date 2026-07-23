// Ponte verso la Edge Function "coach" su Supabase (v31).
// Il coach è riservato agli admin; se la funzione non è ancora stata
// configurata, i componenti mostrano un avviso discreto invece di rompersi.
import { supabase } from "./supabase";

export const COACH_NOT_CONFIGURED = "COACH_NOT_CONFIGURED";

export async function askCoach(mode, payload) {
  let res;
  try {
    res = await supabase.functions.invoke("coach", { body: { mode, payload } });
  } catch {
    throw new Error(COACH_NOT_CONFIGURED);
  }
  const { data, error } = res;
  if (error) {
    // funzione non deployata o non raggiungibile
    const status = error.context?.status;
    if (status === 404 || error.name === "FunctionsFetchError") {
      throw new Error(COACH_NOT_CONFIGURED);
    }
    // la funzione ha risposto con un errore leggibile (401/403/500/502)
    let msg = "Il coach non risponde, riprova tra poco.";
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch { /* corpo non leggibile: teniamo il messaggio generico */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function coachErrorMessage(e) {
  if (e?.message === COACH_NOT_CONFIGURED) {
    return "Il coach non è ancora attivo: va configurata la funzione su Supabase.";
  }
  return e?.message || "Il coach non risponde, riprova tra poco.";
}
