// Accès à l'extranet d'une agence : seulement si son espace est ACTIVÉ.
//   * interrupteur « Espace extranet activé » de la fiche client
//     (contacts.data.espaceActif) : true = autorisé, false = bloqué ;
//   * fiches sans réglage (avant l'interrupteur) : seules les agences qui
//     utilisaient déjà leur extranet avant la mise en place de la règle
//     (EMAILS_HISTORIQUES, relevé figé le 8 oct. 2026 : compte de connexion
//     déjà utilisé) restent activées ; toute autre agence doit être activée
//     depuis le CRM. Liste figée : la date de dernière connexion change à
//     chaque connexion et ne peut pas servir de critère durable.
//   * plusieurs fiches pour le même email : un « désactivé » l'emporte
//     (le CRM bascule toutes les fiches de l'email ensemble).
// Aucune donnée n'est réécrite : la règle est calculée à la demande.

import { SUPABASE_URL } from './supabase.js';
import { escapeIlike } from './ilike.js';

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

// Pure : décide à partir des fiches de l'agence et de son email.
export function decisionEspace(contacts, email) {
  const reglages = (contacts || []).map(c => c && c.data && c.data.espaceActif).filter(v => typeof v === 'boolean');
  if (reglages.includes(false)) return { actif: false, raison: 'desactive' };
  if (reglages.includes(true)) return { actif: true, raison: 'active' };
  return estHistorique(email) ? { actif: true, raison: 'historique' } : { actif: false, raison: 'non_active' };
}

export async function statutEspace(email, serviceKey, fetchFn = fetch) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { actif: false, raison: 'non_active' };
  const r = await fetchFn(`${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(escapeIlike(e))}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  // Fail-closed côté contenu : sans lecture possible, on ne donne pas accès.
  if (!r.ok) return { actif: false, raison: 'erreur' };
  return decisionEspace(await r.json(), e);
}

export const MESSAGE_ESPACE_INACTIF = 'Votre espace extranet n’est pas activé. Contactez votre expert pour l’activer.';
