export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
const ADMIN_EMAILS = ['contact@edl-idf.com'];
const PLANS_VALIDES = ['free', 'starter', 'pro'];
const STATUTS_VALIDES = ['active', 'suspended', 'expired', 'signed'];
const ROLES_VALIDES = ['expert', 'agence'];

// Colonnes reellement presentes dans user_plans :
//   user_id, email, plan, status, expires_at, created_at, notes,
//   stripe_customer_id, role
// Il n'y a PAS de colonne updated_at : l'inclure dans l'upsert fait
// echouer toute la requete cote PostgREST (erreur 400 renvoyee en 502).

// ── Seul point d'écriture légitime sur user_plans côté serveur. ──
// Remplace l'ancien upsert direct depuis le navigateur : même si le RLS
// "Admin only" protège déjà la table, on évite de dépendre uniquement du
// RLS pour une action aussi sensible — la vérification admin est ici
// refaite côté serveur, et c'est la clé service qui écrit, jamais le client.
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
  const caller = await userResp.json();
  // Comparaison normalisee : ne pas dependre de la casse renvoyee par Supabase
  const callerEmail = (caller && caller.email || '').toLowerCase().trim();
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs' }), { status: 403, headers });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }), { status: 500, headers });
  }
  const svcHeaders = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const { userId, email, plan, status, expiresAt, notes, role } = await req.json();

    // Emails toujours normalises en minuscules : les recherches se font avec
    // eq., qui est sensible a la casse. Une saisie "Contact@Agence.fr" ne
    // retrouverait sinon jamais la ligne "contact@agence.fr" existante.
    const emailPropre = (email || '').toLowerCase().trim();
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
    // Le role est facultatif : s'il est fourni il doit etre valide, sinon on
    // conserve celui deja en base plutot que de l'ecraser avec une valeur vide.
    if (role && !ROLES_VALIDES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Rôle invalide' }), { status: 400, headers });
    }

    // Retrouver la ligne existante : par user_id si fourni, sinon par email.
    // On recupere aussi le role actuel pour ne pas le perdre lors de l'upsert.
    let targetUserId = userId || null;
    let roleExistant = null;

    const filtre = targetUserId
      ? 'user_id=eq.' + encodeURIComponent(targetUserId)
      : 'email=eq.' + encodeURIComponent(emailPropre);

    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/user_plans?select=user_id,role&${filtre}`,
      { headers: svcHeaders }
    );
    const rows = lookupResp.ok ? await lookupResp.json() : [];
    if (rows && rows[0]) {
      targetUserId = targetUserId || rows[0].user_id;
      roleExistant = rows[0].role || null;
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Utilisateur non trouvé — il doit se connecter au moins une fois' }), { status: 404, headers });
    }

    const row = {
      user_id: targetUserId,
      email: emailPropre,
      plan: planFinal,
      status: statutFinal,
      notes: notes || null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      role: role || roleExistant || 'expert'
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
