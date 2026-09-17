// Lit la liste des agendas collaborateurs à interroger (libre/occupé) depuis
// la table Supabase "settings" — le champ email de chaque "Agent EDL", déjà
// géré depuis le CRM (Paramètres → Agents EDL) — plutôt qu'une liste figée
// en variable d'environnement. Ajouter ou retirer un collaborateur de la
// fusion d'agendas devient alors une simple action dans le CRM (ajouter/
// retirer un agent avec un email), sans toucher à la configuration Vercel.
import { SUPABASE_URL } from './supabase.js';

export async function recupererCalendriersAgents(ownerId, serviceKey) {
  if (!ownerId || !serviceKey) return [];
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!resp.ok) return [];
  const rows = await resp.json();
  const agents = (rows[0] && rows[0].data && rows[0].data.agents) || [];
  return agents.map(a => ((a && a.email) || '').trim()).filter(Boolean);
}
