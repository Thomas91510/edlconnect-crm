export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
      return new Response(JSON.stringify({ error: 'Clé API Brevo non configurée' }), { status: 500, headers });
    }

    // Récupérer tous les contacts Brevo (pagination)
    let allContacts = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const response = await fetch(
        `https://api.brevo.com/v3/contacts?limit=${limit}&offset=${offset}&sort=desc`,
        { headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        const err = await response.json();
        return new Response(JSON.stringify({ error: err.message || 'Erreur Brevo' }), { status: response.status, headers });
      }

      const data = await response.json();
      const contacts = data.contacts || [];
      allContacts = allContacts.concat(contacts);

      if (contacts.length < limit) break;
      offset += limit;
    }

    // Formater les contacts
    const formatted = allContacts.map(c => ({
      id: 'brevo_' + c.id,
      entreprise: c.attributes?.COMPANY || c.attributes?.NOM || '',
      contact: [c.attributes?.PRENOM, c.attributes?.NOM].filter(Boolean).join(' ') || '',
      email: c.email || '',
      tel: c.attributes?.SMS || c.attributes?.TEL || '',
      ville: c.attributes?.VILLE || '',
      cp: c.attributes?.CP || '',
      emailStatus: c.emailBlacklisted ? 'unsubscribed' : c.smsBlacklisted ? 'blocked' : 'subscribed',
      opens: c.statistics?.messagesSent?.filter(m => m.statistic === 'opened')?.length || 0,
      clicks: c.statistics?.messagesSent?.filter(m => m.statistic === 'clicked')?.length || 0,
      presence: 'brevo',
      source: 'Brevo',
      statut: 'Cible potentielle',
      history: []
    }));

    return new Response(JSON.stringify(formatted), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
