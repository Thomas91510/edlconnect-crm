export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

// Le compte Brevo est UNIQUE et partagé par toute la plateforme (une seule
// BREVO_API_KEY). Les contacts Brevo (/v3/contacts), à la différence des
// emails transactionnels, ne portent aucun tag "sub_<user_id>" permettant
// de les rattacher à un abonné (voir brevo-tracking.js et send-email.js) —
// il n'existe donc AUCUN moyen de filtrer cette liste par abonné. Réservé
// à l'admin (faille corrigée ici : renvoyait auparavant TOUS les contacts
// Brevo, réels clients de l'agence, à n'importe quel abonné Starter/Pro
// authentifié).
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }

  // ── Réservé à l'admin (voir commentaire en tête de fichier) ──
  const _user = await userResp.json();
  const _callerEmail = (_user && _user.email || '').toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(_callerEmail)) {
    return new Response(JSON.stringify({ error: 'Réservé aux administrateurs' }), { status: 403, headers });
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
      const resp = await fetch(`https://api.brevo.com/v3/contacts?limit=${limit}&offset=${offset}`, {
        headers: { 'accept': 'application/json', 'api-key': brevoKey }
      });
      if (!resp.ok) break;
      const data = await resp.json();
      const contacts = data.contacts || [];
      if (!contacts.length) break;
      allContacts = allContacts.concat(contacts);
      offset += limit;
      if (allContacts.length >= (data.count || 0)) break;
    }

    return new Response(JSON.stringify(allContacts), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
