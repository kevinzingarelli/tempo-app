// Serverless (Vercel): scollega Google per l'utente (elimina il token salvato).
export default async function handler(req, res) {
  const uid = req.query.uid || (req.body && req.body.uid);
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!uid) return res.status(400).json({ error: "uid mancante" });
  try {
    await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${uid}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
