export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';
import { nettoyerInfosLegales } from './_lib/agent-facture.js';

// Un agent (agent-app.html, « Mon compte ») renseigne lui-même ses
// informations juridiques — raison sociale, statut, SIRET, RCS, TVA, IBAN —
// reprises sur les factures qu'il génère. Même authentification que
// agent-update-adresse.js : un agent ne modifie que SA propre fiche.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reponse({ error: 'Method not allowed' }, 405);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();

  const resolu = await resolverAgentParEmail(user.email, serviceKey);
  if (!resolu) return reponse({ error: 'Aucun profil agent trouvé pour cet email' }, 403);
  const { ownerId, agent } = resolu;

  let body;
  try { body = await req.json(); } catch (_) { return reponse({ error: 'Corps de requête invalide' }, 400); }
  const infosLegales = nettoyerInfosLegales(body && body.infosLegales);

  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const settingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: supaHeaders }
  );
  if (!settingsResp.ok) return reponse({ error: 'Erreur lecture de la fiche agent' }, 500);
  const rows = await settingsResp.json();
  const data = (rows[0] && rows[0].data) || {};
  const agents = Array.isArray(data.agents) ? data.agents.slice() : [];
  const idx = agents.findIndex(a => a && a.id === agent.id);
  if (idx === -1) return reponse({ error: 'Agent introuvable' }, 404);
  agents[idx] = { ...agents[idx], infosLegales };

  const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(ownerId)}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() }),
  });
  if (!patchResp.ok) return reponse({ error: 'Échec de l\'enregistrement' }, 500);
  return reponse({ success: true, infosLegales }, 200);
}
