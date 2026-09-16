export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';

export default async function handler(req) {
  if(req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origineAutorisee(req),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if(req.method !== 'POST') {
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

  let body;
  try { body = await req.json(); } catch(e) { body = {}; }
  const id = body && body.id;

  if(!id) {
    return new Response(JSON.stringify({ error: 'id manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  try {
    // On revérifie côté serveur que la réservation appartient bien à
    // l'appelant avant de supprimer — même logique de cloisonnement que
    // get-reservations.js, indispensable puisqu'on utilise ici la clé
    // service (qui contourne les policies RLS).
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=id,data&id=eq.${encodeURIComponent(id)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if(!lookupResp.ok) {
      const err = await lookupResp.text();
      return new Response(JSON.stringify({ error: 'Supabase: ' + err }), { status: 500 });
    }

    const rows = await lookupResp.json();
    const row = rows && rows[0];

    if(!row) {
      return new Response(JSON.stringify({ error: 'Réservation introuvable' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }

    if(!row.data || row.data.ownerId !== _userId) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }

    const delResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if(!delResp.ok) {
      const err = await delResp.text();
      return new Response(JSON.stringify({ error: 'Supabase: ' + err }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
