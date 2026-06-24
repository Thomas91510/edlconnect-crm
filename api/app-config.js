// api/brevo-contacts.js — Sync contacts Brevo
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) return res.status(500).json({ error: 'Clé API Brevo non configurée' });

  try {
    let allContacts = [], offset = 0;
    while (true) {
      const resp = await fetch(`https://api.brevo.com/v3/contacts?limit=500&offset=${offset}`, {
        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY }
      });
      if (!resp.ok) break;
      const data = await resp.json();
      const contacts = data.contacts || [];
      if (!contacts.length) break;
      allContacts = allContacts.concat(contacts);
      offset += 500;
      if (allContacts.length >= (data.count || 0)) break;
    }
    return res.status(200).json(allContacts);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
