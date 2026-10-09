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
//
// Chaque abonné écrit librement sa liste d'agents : un autre abonné peut y
// ajouter l'email d'un agent qui n'est pas le sien. L'email n'est donc
// jamais attribué « au premier trouvé » : un seul prestataire le déclare →
// c'est lui ; plusieurs → le compte admin s'il en fait partie, sinon
// personne (refus explicite plutôt qu'un choix au hasard qui enverrait les
// missions, l'IBAN ou les factures de l'agent chez un autre abonné).
import { SUPABASE_URL } from './supabase.js';
import { resoudreAdminId } from './admin.js';

const PAGE = 1000;

async function lignesDeclarant(emailNormalise, serviceKey) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const trouvees = [];
  for (let offset = 0; offset < 20 * PAGE; offset += PAGE) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?select=user_id,data&data->agents=not.is.null&order=user_id.asc&limit=${PAGE}&offset=${offset}`,
      { headers }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    for (const row of rows || []) {
      const agents = (row.data && row.data.agents) || [];
      const agent = Array.isArray(agents) && agents.find(a => String((a && a.email) || '').trim().toLowerCase() === emailNormalise);
      if (agent) trouvees.push({ ownerId: row.user_id, agent, data: row.data || {} });
    }
    if (!rows || rows.length < PAGE) break;
  }
  return trouvees;
}

// Pure : choisit le prestataire d'un agent parmi ceux qui le déclarent.
export function choisirDeclarant(trouvees, adminId) {
  const liste = trouvees || [];
  if (liste.length === 1) return liste[0];
  if (liste.length > 1 && adminId) return liste.find(t => t.ownerId === adminId) || null;
  return null;
}

export async function resolverAgentParEmail(email, serviceKey) {
  const emailNormalise = String(email || '').trim().toLowerCase();
  if (!emailNormalise || !serviceKey) return null;
  const trouvees = await lignesDeclarant(emailNormalise, serviceKey);
  if (!trouvees || !trouvees.length) return null;
  const adminId = trouvees.length > 1 ? await resoudreAdminId(SUPABASE_URL, serviceKey) : '';
  return choisirDeclarant(trouvees, adminId);
}

// Pour le filtre avant envoi du lien magique (agent-check-email.js) : l'email
// figure-t-il dans au moins une liste d'agents ? (null = lecture impossible)
export async function emailAgentDeclare(email, serviceKey) {
  const emailNormalise = String(email || '').trim().toLowerCase();
  if (!emailNormalise || !serviceKey) return false;
  const trouvees = await lignesDeclarant(emailNormalise, serviceKey);
  return trouvees === null ? null : trouvees.length > 0;
}
