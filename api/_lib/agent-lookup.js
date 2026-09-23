// Résout un email authentifié (agent EDL) vers l'agence propriétaire et sa
// fiche agent — utilisé par api/agent-missions.js pour ne renvoyer QUE les
// missions de cet agent précis, jamais celles d'un autre agent ni d'une
// autre agence.
//
// Les "Agents EDL" ne sont qu'une liste JSON dans settings.data.agents (pas
// de table Supabase dédiée, pas d'identité Auth propre à l'agent) : on
// scanne donc les lignes "settings" de toutes les agences pour trouver
// celle qui référence cet email. Avec le service key (jamais exposé au
// client), ça reste sûr — c'est la vérification d'autorisation elle-même
// qui a lieu ici, côté serveur.
import { SUPABASE_URL } from './supabase.js';

export async function resolverAgentParEmail(email, serviceKey) {
  const emailNormalise = String(email || '').trim().toLowerCase();
  if (!emailNormalise || !serviceKey) return null;

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=user_id,data&limit=1000`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!resp.ok) return null;
  const rows = await resp.json();

  for (const row of rows) {
    const agents = (row.data && row.data.agents) || [];
    const agent = agents.find(a => String((a && a.email) || '').trim().toLowerCase() === emailNormalise);
    if (agent) return { ownerId: row.user_id, agent };
  }
  return null;
}
