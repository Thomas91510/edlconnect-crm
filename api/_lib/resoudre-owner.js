import { escapeIlike } from './ilike.js';

// Retrouve l'abonné (agence) propriétaire d'un lien public, à partir des
// mêmes identifiants que porte ce lien — même ordre de fiabilité que
// booking-request.js (dont c'est la copie de la logique, pour que tout
// endpoint public alimenté par un lien d'agence résolve la même agence,
// jamais un compte par défaut fixe dès qu'un vrai lien est disponible) :
//   1) agencyId  : identifiant porté par le lien de réservation
//   2) contactId : identifiant du contact (liens récents)
//   3) email     : correspondance exacte sur l'email de l'agence
//   4) agence    : correspondance sur le nom — PEU FIABLE en multi-abonnés
//                  (deux abonnés peuvent avoir un contact du même nom)
//   5) repli     : compte par défaut (ownerParDefaut), pour ne jamais
//                  laisser une page sans propriétaire.
export async function resoudreOwnerId({ supabaseUrl, serviceKey, agencyId, contactId, email, agence, ownerParDefaut }) {
  if (supabaseUrl && serviceKey) {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const chercher = async (filtre) => {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/contacts?select=user_id&${filtre}&limit=1`, { headers });
        if (!r.ok) return '';
        const rows = await r.json();
        return (rows && rows[0] && rows[0].user_id) || '';
      } catch (e) { return ''; }
    };
    if (agencyId) {
      const id = await chercher('id=eq.' + encodeURIComponent(agencyId));
      if (id) return id;
    }
    if (contactId) {
      const id = await chercher('id=eq.' + encodeURIComponent(contactId));
      if (id) return id;
    }
    if (email) {
      const id = await chercher('data-%3E%3Eemail=ilike.' + encodeURIComponent(escapeIlike(email)));
      if (id) return id;
    }
    if (agence) {
      const id = await chercher('data-%3E%3Eentreprise=ilike.' + encodeURIComponent(escapeIlike(agence)));
      if (id) return id;
    }
  }
  return ownerParDefaut || '';
}
