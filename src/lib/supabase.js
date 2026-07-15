import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Vero solo se entrambe le variabili sono state configurate su Vercel.
export const isConfigured = Boolean(url && key);

// Se non configurato, creiamo comunque un client "finto" verso un URL
// segnaposto: l'app mostrerà la schermata di configurazione, senza crashare.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
