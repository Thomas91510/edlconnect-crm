export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';
const ADMIN_EMAILS = ['contact@edl-idf.com'];

// ── Vérifie que l'utilisateur est admin ou sur un plan payant actif. ──
async function planAutorise(userId, email) {
  if (email && ADMIN_EMAILS.includes(email)) return true;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key || !userId) return true;
    const r = await fetch(SUPABASE_URL + '/rest/v1/user_plans?select=plan,status&user_id=eq.' + encodeURIComponent(userId), {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return true;
    const rows = await r.json();
    const p = rows && rows[0];
    if (!p) return false;
    return (p.plan === 'starter' || p.plan === 'pro') && p.status === 'active';
  } catch (e) { return true; }
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
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

  // ── Fonctionnalité réservée aux plans Starter/Pro ──
  const _user = await userResp.json();
  const _autorise = await planAutorise(_user && _user.id, _user && _user.email);
  if (!_autorise) {
    return new Response(JSON.stringify({ error: 'La synchronisation Brevo est réservée aux plans Starter et Pro.', planRequis: true }), { status: 403, headers });
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
