// ============================================================
// Coach AI di Boschetto (v31) — Supabase Edge Function
//
// Riceve dal client (solo admin) un riassunto di task e ore e chiede a
// Claude un consiglio in italiano. Tre modalità:
//   · advice  → consiglio del giorno (schermata Timer)
//   · steps   → genera i passi di un task da titolo e note
//   · weekly  → riepilogo motivante della settimana
//
// Richiede il secret ANTHROPIC_API_KEY (Edge Functions → Secrets).
// Nessun dato economico viene mai inviato: solo titoli, scadenze e ore.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const PERSONA =
  "Sei il coach di Boschetto, l'app con cui un piccolo studio registra il tempo di lavoro. " +
  "Parli SEMPRE in italiano, dai del tu, tono amichevole e concreto, mai aziendalese. " +
  "Ti rivolgi a un amministratore dello studio. Non inventare dati: usa solo quelli forniti.";

function buildPrompt(mode: string, payload: Record<string, unknown>) {
  const dati = JSON.stringify(payload ?? {}, null, 1);
  if (mode === "steps") {
    return {
      system:
        PERSONA +
        " Dato il titolo (ed eventuali note) di un task, proponi da 3 a 6 passi operativi, " +
        "concreti e in ordine logico, massimo 8 parole ciascuno. " +
        'Rispondi ESCLUSIVAMENTE con un array JSON di stringhe, es. ["Primo passo","Secondo passo"]. Nessun altro testo.',
      user: `Task:\n${dati}`,
      maxTokens: 400,
    };
  }
  if (mode === "weekly") {
    return {
      system:
        PERSONA +
        " Scrivi un riepilogo della settimana in massimo 120 parole: celebra ciò che è stato completato, " +
        "segnala con franchezza ciò che incombe o è in ritardo, e chiudi con UN solo suggerimento pratico per la prossima settimana. " +
        "Testo scorrevole, niente elenchi puntati, al massimo due emoji.",
      user: `Dati della settimana:\n${dati}`,
      maxTokens: 500,
    };
  }
  // advice (default): consiglio del giorno
  return {
    system:
      PERSONA +
      " Dai UN consiglio per la giornata di oggi: su cosa conviene concentrarsi, considerando scadenze vicine, " +
      "priorità, passi rimasti, task fermi e ore già investite. Se un task ha un passo piccolo che sbloccherebbe molto, dillo. " +
      "Massimo 3 frasi, niente elenchi, al massimo una emoji. Se è tutto tranquillo, dillo con leggerezza.",
    user: `Situazione di oggi:\n${dati}`,
    maxTokens: 300,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) chi chiama? (usa il token dell'utente loggato nell'app)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Non autenticato." }, 401);

    // 2) solo gli amministratori possono usare il coach
    const { data: prof } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "admin") return json({ error: "Il coach è riservato agli amministratori." }, 403);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Chiave API mancante: aggiungi il secret ANTHROPIC_API_KEY su Supabase." }, 500);

    const { mode = "advice", payload = {} } = await req.json().catch(() => ({}));
    const { system, user: userMsg, maxTokens } = buildPrompt(mode, payload);

    // 3) chiedi a Claude (Haiku: veloce ed economico, perfetto per un coach)
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return json({ error: data?.error?.message || "Il servizio AI non ha risposto." }, 502);
    }

    const text: string = data.content?.[0]?.text?.trim() || "";

    if (mode === "steps") {
      // il modello risponde con un array JSON: estraiamolo con prudenza
      try {
        const m = text.match(/\[[\s\S]*\]/);
        const steps = JSON.parse(m ? m[0] : text);
        if (!Array.isArray(steps)) throw new Error("not array");
        return json({ steps: steps.map((s) => String(s)).slice(0, 8) });
      } catch {
        return json({ error: "Il coach non è riuscito a proporre i passi: riprova." }, 502);
      }
    }

    return json({ text });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
