// Accès à l'extranet d'une agence : seulement si son espace est ACTIVÉ.
//   * interrupteur « Espace extranet activé » de la fiche client
//     (contacts.data.espaceActif) : true = autorisé, false = bloqué ;
//   * fiches sans réglage (avant l'interrupteur) : seules les agences qui
//     utilisaient déjà leur extranet avant la mise en place de la règle
//     (EMAILS_HISTORIQUES, relevé figé le 8 oct. 2026 : compte de connexion
//     déjà utilisé) restent activées ; toute autre agence doit être activée
//     depuis le CRM. Liste figée : la date de dernière connexion change à
//     chaque connexion et ne peut pas servir de critère durable.
//   * plusieurs fiches pour le même email chez un même prestataire : un
//     « désactivé » l'emporte (le CRM bascule toutes ses fiches de l'email
//     ensemble) ; chez des prestataires différents, chacun décide pour lui.
// Aucune donnée n'est réécrite : la règle est calculée à la demande.

import { SUPABASE_URL } from './supabase.js';
import { escapeIlike } from './ilike.js';
import { resoudreAdminId } from './admin.js';

export const DATE_ACTIVATION = '2026-10-08';
export const EMAILS_HISTORIQUES = Object.freeze([
  'thomas.sistersandtom@gmail.com',
  'e2t.immo@gmail.com',
  'lgc13asnieres@arthurimmo.com',
  'immogestionlocative@gmail.com',
  'direction@agenceterminus.com',
  'christophe.levere@iadfrance.fr',
]);

export const estHistorique = (email) => EMAILS_HISTORIQUES.includes(String(email || '').trim().toLowerCase());

// Pure : décide à partir des fiches de l'agence CHEZ UN MÊME PRESTATAIRE et
// de son email. La liste historique ne vaut que pour le compte admin (ce
// sont ses agences) : un autre abonné qui crée une fiche avec l'un de ces
// emails ne leur ouvre pas d'espace chez lui sans l'activer.
export function decisionEspace(contacts, email, historiqueAutorise = true) {
  const reglages = (contacts || []).map(c => c && c.data && c.data.espaceActif).filter(v => typeof v === 'boolean');
  if (reglages.includes(false)) return { actif: false, raison: 'desactive' };
  if (reglages.includes(true)) return { actif: true, raison: 'active' };
  return historiqueAutorise && estHistorique(email) ? { actif: true, raison: 'historique' } : { actif: false, raison: 'non_active' };
}

// Pure : l'extranet d'une agence est cloisonné par prestataire (abonné,
// contacts.user_id). Plusieurs abonnés peuvent avoir une fiche avec le même
// email : chacun décide seul de l'espace chez lui, et l'agence ne voit que
// les messages, documents et commandes du prestataire retenu — jamais un
// mélange. Prestataire retenu : celui demandé s'il a activé l'espace, sinon
// le compte admin, sinon le premier (ordre stable des identifiants).
export function choisirExpert(contacts, email, { adminId = '', expertDemande = '' } = {}) {
  const parExpert = new Map();
  (contacts || []).forEach(c => {
    if (!c || !c.user_id) return;
    if (!parExpert.has(c.user_id)) parExpert.set(c.user_id, []);
    parExpert.get(c.user_id).push(c);
  });
  const decisions = [...parExpert.entries()].map(([id, fiches]) => ({ id, fiches, ...decisionEspace(fiches, email, !!adminId && id === adminId) }));
  const actifs = decisions.filter(d => d.actif).sort((a, b) => (a.id === adminId ? -1 : b.id === adminId ? 1 : a.id.localeCompare(b.id)));
  const retenu = actifs.find(d => d.id === expertDemande) || actifs[0];
  if (!retenu) {
    const raison = decisions.some(d => d.raison === 'desactive') ? 'desactive' : 'non_active';
    return { actif: false, raison, expertId: '', contacts: [], experts: [] };
  }
  return { actif: true, raison: retenu.raison, expertId: retenu.id, contacts: retenu.fiches, experts: actifs.map(d => d.id) };
}

let _adminIdCache = '';
async function adminIdEnCache(serviceKey) {
  if (!_adminIdCache) _adminIdCache = await resoudreAdminId(SUPABASE_URL, serviceKey);
  return _adminIdCache;
}

// Contexte extranet de l'appelant : prestataire retenu + SES fiches pour cet
// email. L'aperçu admin (clientEmail) est limité aux fiches de l'admin.
export async function contexteAgence(email, serviceKey, { estAdmin = false, expertDemande = '' } = {}, fetchFn = fetch) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { actif: false, raison: 'non_active', expertId: '', contacts: [], experts: [] };
  const r = await fetchFn(`${SUPABASE_URL}/rest/v1/contacts?select=id,data,user_id&data->>email=ilike.${encodeURIComponent(escapeIlike(e))}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  // Fail-closed côté contenu : sans lecture possible, on ne donne pas accès.
  if (!r.ok) return { actif: false, raison: 'erreur', expertId: '', contacts: [], experts: [] };
  const lignes = await r.json();
  const adminId = await adminIdEnCache(serviceKey);
  if (estAdmin) {
    const fiches = (lignes || []).filter(c => c && adminId && c.user_id === adminId);
    return { actif: true, raison: 'admin', expertId: adminId, contacts: fiches, experts: adminId ? [adminId] : [], expertEstAdmin: !!adminId };
  }
  const ctx = choisirExpert(lignes, e, { adminId, expertDemande });
  return { ...ctx, expertEstAdmin: !!adminId && ctx.expertId === adminId };
}

// Compatibilité : statut seul (actif / raison) pour l'email.
export async function statutEspace(email, serviceKey, fetchFn = fetch) {
  const ctx = await contexteAgence(email, serviceKey, {}, fetchFn);
  return { actif: ctx.actif, raison: ctx.raison };
}

export const MESSAGE_ESPACE_INACTIF = 'Votre espace extranet n’est pas activé. Contactez votre expert pour l’activer.';
