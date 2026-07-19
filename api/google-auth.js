// Serverless (Vercel): avvia il flusso OAuth di Google.
// Reindirizza l'utente alla schermata di consenso Google.
export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI; // es. https://tuo-sito.vercel.app/api/google-callback
  if (!clientId || !redirectUri) {
    return res.status(500).send("Google non configurato: mancano le variabili d'ambiente.");
  }
  // 'state' porta con sé l'utente Supabase per ricollegare il token dopo
  const state = encodeURIComponent(req.query.uid || "");
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.readonly");
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${scope}` +
    "&access_type=offline" +
    "&prompt=consent" +
    `&state=${state}`;
  res.redirect(url);
}
