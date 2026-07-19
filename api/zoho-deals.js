// Serverless (Vercel): restituisce le opportunità (Deals) da Zoho CRM.
// Il token è unico per l'azienda (zoho_tokens, riga 'company').
// Sola lettura: non modifica nulla su Zoho.
export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.eu";
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Supabase non configurato" });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    const tRes = await fetch(`${supabaseUrl}/rest/v1/zoho_tokens?id=eq.company&select=*`, { headers });
    const arr = await tRes.json();
    if (!arr || arr.length === 0) return res.status(200).json({ connected: false, deals: [] });
    let token = arr[0];

    // rinfresco se scaduto
    if (new Date(token.expiry) <= new Date() && token.refresh_token) {
      const rRes = await fetch(`${accountsDomain}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const nt = await rRes.json();
      if (nt.access_token) {
        token.access_token = nt.access_token;
        const newExpiry = new Date(Date.now() + (nt.expires_in || 3600) * 1000).toISOString();
        await fetch(`${supabaseUrl}/rest/v1/zoho_tokens?id=eq.company`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: nt.access_token, expiry: newExpiry }),
        });
      } else {
        return res.status(200).json({ connected: true, error: "Sessione Zoho scaduta, ricollega.", deals: [] });
      }
    }

    // api_domain per CRM è di solito www.zohoapis.eu per la EU
    const apiDomain = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.eu";
    const fields = "Deal_Name,Account_Name,Amount,Stage,Closing_Date,Currency";
    const dealsRes = await fetch(
      `${apiDomain}/crm/v8/Deals?fields=${fields}&sort_by=Modified_Time&sort_order=desc&per_page=50`,
      { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } }
    );
    const data = await dealsRes.json();
    if (data.status === "error" || !data.data) {
      return res.status(200).json({ connected: true, error: "Zoho non ha restituito opportunità. Riprova o ricollega.", deals: [] });
    }

    const deals = (data.data || []).map((d) => ({
      id: d.id,
      title: d.Deal_Name || "(senza nome)",
      accountName: d.Account_Name?.name || null,
      amount: d.Amount != null ? Number(d.Amount) : null,
      currency: d.Currency || "EUR",
      stage: d.Stage || null,
      closingDate: d.Closing_Date || null,
    }));
    res.status(200).json({ connected: true, deals });
  } catch (e) {
    res.status(500).json({ error: e.message, deals: [] });
  }
}
