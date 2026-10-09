// Liste des comptes admin, partagée par toutes les fonctions api/*.js qui en
// ont besoin (aperçu client, envoi d'emails réservé, gestion des plans...).
// Auparavant recopiée à l'identique dans 11 fichiers : une correction ou un
// ajout d'admin ne demandait qu'un seul oubli pour désynchroniser les
// contrôles d'accès entre endpoints.
export const ADMIN_EMAILS = ['contact@edl-idf.com'];

// Identifiant du compte admin, lu dans les comptes d'authentification
// (email vérifié par Supabase Auth), jamais dans settings.data.userEmail :
// ce champ est librement modifiable par chaque abonné, qui pourrait sinon
// s'y déclarer « contact@edl-idf.com » et recevoir les traitements réservés
// à l'admin (Edouard, prospection). Renvoie '' si introuvable.
export async function resoudreAdminId(supaUrl, serviceKey) {
  if (!supaUrl || !serviceKey) return '';
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  try {
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${supaUrl}/auth/v1/admin/users?page=${page}&per_page=500`, { headers });
      if (!r.ok) return '';
      const corps = await r.json();
      const users = Array.isArray(corps) ? corps : ((corps && corps.users) || []);
      const admin = users.find(u => u && ADMIN_EMAILS.includes(String(u.email || '').toLowerCase().trim()));
      if (admin && admin.id) return admin.id;
      if (users.length < 500) return '';
    }
  } catch (_) { /* best-effort */ }
  return '';
}
