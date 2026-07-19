// Serverless (Vercel): riceve il codice da Zoho, lo scambia per i token
// e li salva su Supabase (tabella zoho_tokens, riga unica 'company').
export default async function handler(req, res) {
  const { code, state } = req.query;
  const uid = decodeURIComponent(state || "");
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.eu";
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!code) return res.status(400).send("Richiesta non valida: manca il codice.");
  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceKey) {
    return res.status(500).send("Zoho/Supabase non configurati correttamente.");
  }

  try {
    const tokenRes = await fetch(`${accountsDomain}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) {
      return res.status(500).send("Zoho non ha restituito un token. Riprova a collegare. Dettaglio: " + JSON.stringify(tok));
    }

    const expiry = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString();
    const payload = {
      id: "company",
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expiry,
      connected_by: uid || null,
      connected_at: new Date().toISOString(),
    };
    await fetch(`${supabaseUrl}/rest/v1/zoho_tokens?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    res.redirect("/?zoho=connected");
  } catch (e) {
    res.status(500).send("Errore nel collegamento a Zoho: " + e.message);
  }
}
