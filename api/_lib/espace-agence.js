// Accès à l'extranet d'une agence : seulement si son espace est ACTIVÉ.
//   * interrupteur « Espace extranet activé » de la fiche client
//     (contacts.data.espaceActif) : true = autorisé, false = bloqué ;
//   * fiches sans réglage (avant l'interrupteur) : les agences qui
//     utilisaient déjà leur extranet — compte de connexion créé avant
//     DATE_ACTIVATION et déjà utilisé — restent activées ; toute autre agence
//     doit être activée depuis le CRM.
// Aucune donnée n'est réécrite : la règle est calculée à la demande.

import { SUPABASE_URL } from './supabase.js';
import { escapeIlike } from './ilike.js';

export const DATE_ACTIVATION = '2026-10-09';

// Pure : décide à partir des fiches et du compte de connexion.
export function decisionEspace(contacts, compte) {
  const reglages = (contacts || []).map(c => c && c.data && c.data.espaceActif).filter(v => typeof v === 'boolean');
  if (reglages.includes(true)) return { actif: true, raison: 'active' };
  if (reglages.includes(false)) return { actif: false, raison: 'desactive' };
  const historique = !!(compte && compte.last_sign_in_at && String(compte.created_at || '') < DATE_ACTIVATION);
  return historique ? { actif: true, raison: 'historique' } : { actif: false, raison: 'non_active' };
}

// Comptes de connexion (Supabase Auth) — liste admin, petite base.
export async function comptesConnexion(serviceKey, fetchFn = fetch) {
  const comptes = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetchFn(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) break;
    const d = await r.json();
    const lot = (d && d.users) || [];
    comptes.push(...lot);
    if (lot.length < 1000) break;
  }
  return comptes;
}

// Agences « historiques » : emails des comptes déjà utilisés avant la date.
export function emailsHistoriques(comptes) {
  return [...new Set((comptes || [])
    .filter(u => u && u.email && u.last_sign_in_at && String(u.created_at || '') < DATE_ACTIVATION)
    .map(u => String(u.email).toLowerCase()))];
}

export async function statutEspace(email, compte, serviceKey, fetchFn = fetch) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { actif: false, raison: 'non_active' };
  const r = await fetchFn(`${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(escapeIlike(e))}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  // Fail-closed côté contenu : sans lecture possible, on ne donne pas accès.
  if (!r.ok) return { actif: false, raison: 'erreur' };
  return decisionEspace(await r.json(), compte);
}

export const MESSAGE_ESPACE_INACTIF = 'Votre espace extranet n’est pas activé. Contactez votre expert pour l’activer.';
