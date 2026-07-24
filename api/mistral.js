const SUPABASE_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co';
const ADMIN_EMAILS = ['contact@edl-idf.com'];

// ── Vérifie que l'utilisateur est admin ou sur un plan payant actif. ──
// En cas d'erreur d'infrastructure (clé service manquante, Supabase injoignable),
// on laisse passer plutôt que de bloquer un abonné payant par accident.
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
    if (!p) return false; // pas encore de ligne = plan gratuit par défaut
    return (p.plan === 'starter' || p.plan === 'pro') && p.status === 'active';
  } catch (e) { return true; }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const _authHeader = req.headers.get('authorization') || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if(!_token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const _userResp = await fetch(`${'https://pvuctwflxvvxdawsxceu.supabase.co'}/auth/v1/user`, {
    headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic', 'Authorization': `Bearer ${_token}` }
  });
  if(!_userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // ── Fonctionnalité réservée aux plans Starter/Pro (coût API à chaque appel) ──
  const _user = await _userResp.json();
  const _autorise = await planAutorise(_user && _user.id, _user && _user.email);
  if (!_autorise) {
    return new Response(JSON.stringify({ error: 'La rédaction assistée par IA est réservée aux plans Starter et Pro.', planRequis: true }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const body = await req.json();

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = { runtime: 'edge' };
