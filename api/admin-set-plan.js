export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';
const ADMIN_EMAILS = ['contact@edl-idf.com'];
const PLANS_VALIDES = ['free', 'starter', 'pro'];
const STATUTS_VALIDES = ['active', 'suspended', 'expired', 'signed'];

// ── Seul point d'écriture légitime sur user_plans côté serveur. ──
// Remplace l'ancien upsert direct depuis le navigateur : même si le RLS
// "Admin only" protège déjà la table, on évite de dépendre uniquement du
// RLS pour une action aussi sensible — la vérification admin est ici
// refaite côté serveur, et c'est la clé service qui écrit, jamais le client.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }
  const caller = await userResp.json();
  if (!caller || !ADMIN_EMAILS.includes(caller.email)) {
    return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs' }), { status: 403, headers });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }), { status: 500, headers });
  }
  const svcHeaders = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const { userId, email, plan, status, expiresAt, notes } = await req.json();

    const emailPropre = (email || '').trim();
    if (!emailPropre) {
      return new Response(JSON.stringify({ error: 'Email requis' }), { status: 400, headers });
    }
    const planFinal = plan || 'free';
    const statutFinal = status || 'active';
    if (!PLANS_VALIDES.includes(planFinal)) {
      return new Response(JSON.stringify({ error: 'Plan invalide' }), { status: 400, headers });
    }
    if (!STATUTS_VALIDES.includes(statutFinal)) {
      return new Response(JSON.stringify({ error: 'Statut invalide' }), { status: 400, headers });
    }

    // Retrouver le user_id si non fourni (nouvel abonné géré depuis son email)
    let targetUserId = userId || null;
    if (!targetUserId) {
      const lookupResp = await fetch(
        `${SUPABASE_URL}/rest/v1/user_plans?select=user_id&email=eq.${encodeURIComponent(emailPropre)}`,
        { headers: svcHeaders }
      );
      const rows = lookupResp.ok ? await lookupResp.json() : [];
      targetUserId = (rows && rows[0] && rows[0].user_id) || null;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Utilisateur non trouvé — il doit se connecter au moins une fois' }), { status: 404, headers });
      }
    }

    const row = {
      user_id: targetUserId,
      email: emailPropre,
      plan: planFinal,
      status: statutFinal,
      notes: notes || null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString()
    };

    const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    });

    if (!upsertResp.ok) {
      const detail = await upsertResp.text();
      return new Response(JSON.stringify({ error: 'Échec mise à jour', details: detail.slice(0, 200) }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true, userId: targetUserId }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
