export const config = { runtime: 'edge' };

// Endpoint public (visiteurs anonymes du site vitrine) — pas d'authentification
// requise, contrairement à send-email.js qui est réservé aux abonnés connectés.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { nom, email, sujet, message } = await req.json();

    if (!nom || !email || !message) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400, headers });
    }

    const BREVO_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_KEY) {
      return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500, headers });
    }

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: 'Lokentia — Site web', email: 'contact@lokentia.fr' },
        to: [{ email: 'contact@lokentia.fr', name: 'ImmoCheck EDL' }],
        replyTo: { email, name: nom },
        subject: `[Lokentia] Contact : ${sujet || 'Sans sujet'} — ${nom}`,
        htmlContent: `<p><strong>Nom :</strong> ${nom}</p><p><strong>Email :</strong> ${email}</p><p><strong>Sujet :</strong> ${sujet || '—'}</p><hr><p>${String(message).replace(/\n/g, '<br>')}</p>`,
        textContent: `Nom : ${nom}\nEmail : ${email}\nSujet : ${sujet || '—'}\n\nMessage :\n${message}`
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: 'Échec envoi', details: err.slice(0, 200) }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
