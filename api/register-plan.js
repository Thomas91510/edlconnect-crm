export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';

// ── Enregistre la ligne "free" d'un nouvel utilisateur dans user_plans. ──
// Cet insert doit passer par le serveur (clé service) car la policy RLS
// "Admin only" sur user_plans réserve toute écriture à contact@edl-idf.com :
// un insert direct depuis le navigateur (clé anon) échoue systématiquement.
// Idempotent : ne fait rien si la ligne existe déjà.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
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
  const user = await userResp.json();
  if (!user || !user.id || !user.email) {
    return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 400, headers });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }), { status: 500, headers });
  }
  const svcHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Vérifier si la ligne existe déjà (idempotent — pas d'erreur si déjà présente)
    const checkResp = await fetch(
      `${SUPABASE_URL}/rest/v1/user_plans?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: svcHeaders }
    );
    if (checkResp.ok) {
      const existing = await checkResp.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return new Response(JSON.stringify({ success: true, created: false }), { status: 200, headers });
      }
    }

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/user_plans`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        email: user.email,
        plan: 'free',
        status: 'active',
        created_at: new Date().toISOString()
      })
    });

    if (!insertResp.ok) {
      const detail = await insertResp.text();
      return new Response(JSON.stringify({ error: 'Échec insertion', details: detail.slice(0, 200) }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true, created: true }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
