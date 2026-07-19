// Serverless (Vercel): restituisce i prossimi eventi del calendario Google
// dell'utente. Rinfresca il token se scaduto. Sola lettura.
export default async function handler(req, res) {
  const uid = req.query.uid;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!uid) return res.status(400).json({ error: "uid mancante" });
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Supabase non configurato" });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    // leggo il token dell'utente
    const tRes = await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${uid}&select=*`, { headers });
    const arr = await tRes.json();
    if (!arr || arr.length === 0) return res.status(200).json({ connected: false, events: [] });
    let token = arr[0];

    // rinfresco se scaduto
    if (new Date(token.expiry) <= new Date() && token.refresh_token) {
      const rRes = await fetch("https://oauth2.googleapis.com/token", {
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
        await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${uid}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: nt.access_token, expiry: newExpiry }),
        });
      }
    }

    // leggo gli eventi (da adesso, prossimi 30 giorni)
    // Intervallo: se from/to sono passati (YYYY-MM-DD), uso quelli;
    // altrimenti default = prossimi 30 giorni.
    let timeMin, timeMax;
    if (req.query.from && req.query.to) {
      timeMin = new Date(req.query.from + "T00:00:00").toISOString();
      timeMax = new Date(req.query.to + "T23:59:59").toISOString();
    } else {
      timeMin = new Date().toISOString();
      timeMax = new Date(Date.now() + 30 * 86400000).toISOString();
    }
    const calRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
        `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
        "&singleEvents=true&orderBy=startTime&maxResults=50",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const cal = await calRes.json();
    if (cal.error) return res.status(200).json({ connected: true, error: "Sessione Google scaduta, ricollega.", events: [] });

    const events = (cal.items || []).map((ev) => ({
      id: ev.id,
      title: ev.summary || "(senza titolo)",
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !ev.start?.dateTime,
      location: ev.location || null,
    }));
    res.status(200).json({ connected: true, email: token.email, events });
  } catch (e) {
    res.status(500).json({ error: e.message, events: [] });
  }
}
