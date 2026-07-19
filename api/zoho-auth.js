// Serverless (Vercel): avvia il flusso OAuth di Zoho CRM.
// Il collegamento è UNICO per l'azienda (non per singolo utente).
export default function handler(req, res) {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI; // es. https://tuo-sito.vercel.app/api/zoho-callback
  // Dominio dati Zoho: EU per l'org "Kesia" (accounts.zoho.eu). Modificabile
  // via variabile d'ambiente se in futuro cambiasse.
  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.eu";

  if (!clientId || !redirectUri) {
    return res.status(500).send("Zoho non configurato: mancano le variabili d'ambiente.");
  }
  const state = encodeURIComponent(req.query.uid || "");
  const scope = encodeURIComponent(
    "ZohoCRM.modules.deals.READ,ZohoCRM.modules.accounts.READ,ZohoCRM.modules.contacts.READ,ZohoCRM.settings.READ"
  );
  const url =
    `${accountsDomain}/oauth/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${scope}` +
    "&access_type=offline" +
    "&prompt=consent" +
    `&state=${state}`;
  res.redirect(url);
}
