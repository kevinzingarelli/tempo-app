// Serverless (Vercel): riceve il codice da Google, lo scambia per i token
// e li salva su Supabase (tabella google_tokens) per l'utente indicato in 'state'.
export default async function handler(req, res) {
  const { code, state } = req.query;
  const uid = decodeURIComponent(state || "");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!code || !uid) return res.status(400).send("Richiesta non valida.");
  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceKey) {
    return res.status(500).send("Google/Supabase non configurati correttamente.");
  }

  try {
    // 1) scambio codice -> token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
      return res.status(500).send("Google non ha restituito un token. Riprova.");
    }

    // 2) recupero l'email dell'account Google collegato
    let email = null;
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const info = await infoRes.json();
      email = info.email || null;
    } catch (_) {}

    // 3) salvo su Supabase con la service role key (bypassa RLS lato server)
    const expiry = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString();
    const payload = {
      user_id: uid,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expiry,
      email,
      connected_at: new Date().toISOString(),
    };
    await fetch(`${supabaseUrl}/rest/v1/google_tokens?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    // 4) torno all'app
    res.redirect("/?google=connected");
  } catch (e) {
    res.status(500).send("Errore nel collegamento a Google: " + e.message);
  }
}
