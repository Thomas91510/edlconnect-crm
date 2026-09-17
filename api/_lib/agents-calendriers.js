// Lit la liste des agendas collaborateurs à interroger (libre/occupé) depuis
// la table Supabase "settings" — les champs email/secteurs de chaque "Agent
// EDL", déjà gérés depuis le CRM (Paramètres → Agents EDL) — plutôt qu'une
// liste figée en variable d'environnement. Ajouter ou retirer un
// collaborateur de la fusion d'agendas devient alors une simple action dans
// le CRM (ajouter/retirer un agent avec un email), sans toucher à la
// configuration Vercel.
import { SUPABASE_URL } from './supabase.js';

// Un agent sans secteur configuré est considéré disponible partout (choix
// délibéré : un agent qu'on oublie de sectoriser reste proposé, plutôt que
// silencieusement exclu). Un agent avec des secteurs n'est retenu que si le
// code postal du bien commence par l'un des préfixes indiqués. Sans code
// postal exploitable (adresse non reconnue côté formulaire), aucun filtrage
// n'est appliqué : tous les agents avec un email sont retenus, comme avant
// l'introduction des secteurs — dégradation silencieuse, pas de blocage.
export function agentCouvreSecteur(agent, codePostal) {
  if (!codePostal) return true;
  const secteurs = String((agent && agent.secteurs) || '').split(',').map(s => s.trim()).filter(Boolean);
  if (secteurs.length === 0) return true;
  return secteurs.some(prefixe => codePostal.startsWith(prefixe));
}

export async function recupererCalendriersAgents(ownerId, serviceKey, codePostal) {
  if (!ownerId || !serviceKey) return [];
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!resp.ok) return [];
  const rows = await resp.json();
  const agents = (rows[0] && rows[0].data && rows[0].data.agents) || [];
  return agents
    .filter(a => agentCouvreSecteur(a, codePostal))
    .map(a => ((a && a.email) || '').trim())
    .filter(Boolean);
}
