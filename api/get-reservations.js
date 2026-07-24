export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

export default async function handler(req) {
  if(req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const _user = await userResp.json();
  const _userId = _user && _user.id;
  const _isAdmin = _user && _user.email === 'contact@edl-idf.com';

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&order=created_at.desc&limit=100`,
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
    // Cloisonnement : chaque abonne ne voit que ses reservations.
    // Les reservations historiques (sans proprietaire) restent visibles
    // par le compte administrateur uniquement.
    const reservations = (rows || [])
      .filter(r => {
        const owner = (r.data && r.data.ownerId) || '';
        if (owner) return owner === _userId;
        return _isAdmin;
      })
      .map(r => ({ ...r.data, _supaId: r.id }));

    return new Response(JSON.stringify(reservations), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
