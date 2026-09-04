export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';

export default async function handler(req) {
  if(req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origineAutorisee(req),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if(req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if(!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if(!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  if(!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  const _user = await userResp.json();
  const _userId = _user && _user.id;

  if(!_userId) {
    return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  try {
    // Cloisonnement applique directement dans la requete : chaque abonne ne
    // recoit que ses propres reservations. Filtrer cote base plutot qu'en
    // JavaScript garantit que la limite de 100 porte bien sur SES lignes,
    // et non sur les 100 dernieres tous abonnes confondus.
    const filtre = `data->>ownerId=eq.${encodeURIComponent(_userId)}`;
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&${filtre}&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if(!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: 'Supabase: ' + err }), { status: 500 });
    }

    const rows = await resp.json();

    // Filet de securite : on revalide cote serveur que chaque ligne renvoyee
    // appartient bien a l'appelant, meme si la requete a deja filtre.
    const reservations = (rows || [])
      .filter(r => r && r.data && r.data.ownerId === _userId)
      .map(r => ({ ...r.data, _supaId: r.id }));

    return new Response(JSON.stringify(reservations), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
