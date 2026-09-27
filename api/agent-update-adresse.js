export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';

const MAX_LONGUEUR_ADRESSE = 200;

// Un agent (agent-app.html, "Mon compte") renseigne lui-même son adresse —
// elle pré-remplit ensuite sa recherche de communes pour les zones
// d'intervention. Ce n'est jamais l'agence qui la fixe (voir js/app-settings.js
// : le formulaire "Agents EDL" ne comporte pas ce champ). Authentification
// identique à agent-zones-submit.js — un agent ne peut modifier que SA
// propre fiche.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Configuration serveur manquante' }), { status: 500, headers });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }
  const user = await userResp.json();

  const resolu = await resolverAgentParEmail(user.email, serviceKey);
  if (!resolu) {
    return new Response(JSON.stringify({ error: 'Aucun profil agent trouvé pour cet email' }), { status: 403, headers });
  }
  const { ownerId, agent } = resolu;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers });
  }

  const adresse = String(body.adresse || '').trim().slice(0, MAX_LONGUEUR_ADRESSE);

  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const settingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: supaHeaders }
  );
  if (!settingsResp.ok) {
    return new Response(JSON.stringify({ error: 'Erreur lecture de la fiche agent' }), { status: 500, headers });
  }
  const settingsRows = await settingsResp.json();
  const data = (settingsRows[0] && settingsRows[0].data) || {};
  const agents = Array.isArray(data.agents) ? data.agents.slice() : [];
  const idx = agents.findIndex(a => a && a.id === agent.id);
  if (idx === -1) {
    return new Response(JSON.stringify({ error: 'Agent introuvable' }), { status: 404, headers });
  }
  agents[idx] = { ...agents[idx], adresse };

  const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(ownerId)}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() })
  });
  if (!patchResp.ok) {
    return new Response(JSON.stringify({ error: 'Échec de l\'enregistrement' }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ success: true, adresse }), { status: 200, headers });
}
