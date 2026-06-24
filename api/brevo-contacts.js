// api/brevo-tracking.js — Tracking emails transactionnels Brevo
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) return res.status(200).json([]);

  const email = req.query.email || '';
  const url = email
    ? `https://api.brevo.com/v3/smtp/emails?email=${encodeURIComponent(email)}&limit=50&sort=desc`
    : null;

  if (!url) return res.status(200).json([]);

  try {
    const resp = await fetch(url, {
      headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY }
    });
    if (!resp.ok) return res.status(200).json([]);
    const data = await resp.json();
    return res.status(200).json(data.transactionalEmails || []);
  } catch (e) {
    return res.status(200).json([]);
  }
}
