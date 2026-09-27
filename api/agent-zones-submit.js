export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';

const MAX_COMMUNES = 300; // garde-fou, largement au-dessus du nombre réel de communes qu'un agent couvrirait

// Soumission par un agent (agent-app.html) de ses secteurs d'intervention
// (primaire/secondaire, par commune — code INSEE + nom, choisis via la
// recherche/carte geo.api.gouv.fr) pour les frais de déplacement. Passe la
// fiche agent en statut "attente" : c'est l'agence qui valide ou refuse
// ensuite depuis le CRM (Paramètres → Agents EDL), jamais appliqué
// automatiquement. Authentification identique à agent-missions.js — un
// agent ne peut modifier que SA propre fiche.
function nettoyerCommunes(valeur) {
  if (!Array.isArray(valeur)) return [];
  const vus = new Set();
  const resultat = [];
  for (const v of valeur) {
    const code = String((v && v.code) || '').trim();
    const nom = String((v && v.nom) || '').trim();
    if (!code || !nom || vus.has(code)) continue;
    vus.add(code);
    resultat.push({ code, nom });
    if (resultat.length >= MAX_COMMUNES) break;
  }
  return resultat;
}

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

  const secteurPrimaire = nettoyerCommunes(body.secteurPrimaire);
  const codesPrimaire = new Set(secteurPrimaire.map(c => c.code));
  const secteurSecondaire = nettoyerCommunes(body.secteurSecondaire).filter(c => !codesPrimaire.has(c.code));
  if (secteurPrimaire.length + secteurSecondaire.length === 0) {
    return new Response(JSON.stringify({ error: 'Sélectionnez au moins une commune' }), { status: 400, headers });
  }

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
  agents[idx] = {
    ...agents[idx],
    secteurPrimaire,
    secteurSecondaire,
    zoneStatut: 'attente',
    zoneRefusMotif: '',
  };

  const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(ownerId)}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() })
  });
  if (!patchResp.ok) {
    return new Response(JSON.stringify({ error: 'Échec de l\'enregistrement' }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ success: true, zoneStatut: 'attente' }), { status: 200, headers });
}
