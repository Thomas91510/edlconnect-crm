export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500 });
    }

    // ── Authentification obligatoire : l'email vient du jeton, jamais du corps ──
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
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

    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const user = await userResp.json();
    const email = user?.email || '';

    if (!email) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Chercher tous les contacts dont l'email correspond (dans toutes les agences)
    // Les documents sont stockés dans la colonne JSONB data des contacts
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(email)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    if (!resp.ok) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const rows = await resp.json();

    // Collecter tous les documents trouvés (un client peut être dans plusieurs agences)
    let documents = [];
    (rows || []).forEach(row => {
      const docs = row.data?.documents || [];
      docs.forEach(d => {
        if (d.url && d.nom && !documents.find(x => x.url === d.url)) {
          documents.push({ nom: d.nom, url: d.url });
        }
      });
    });

    return new Response(JSON.stringify(documents), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
