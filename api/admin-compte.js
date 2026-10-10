export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { effacerCompte } from './_lib/suppression-compte.js';

// Gestion d'un compte abonné par l'administrateur de la plateforme
// (onglet Plateforme) :
//   - desactiver : le compte ne peut plus se connecter (bannissement Supabase
//     Auth, vérifié par le serveur d'authentification, pas seulement par
//     l'interface) ; ses données sont conservées. Statut « disabled ».
//   - activer    : lève le bannissement, statut « active ».
//   - supprimer  : effacement définitif, comme la suppression par l'abonné
//     lui-même (_lib/suppression-compte.js). Confirmation SUPPRIMER exigée.
// Les comptes admin ne peuvent être ni désactivés ni supprimés ici.
export const CONFIRMATION = 'SUPPRIMER';
export const ACTIONS = ['desactiver', 'activer', 'supprimer'];
// Durée de bannissement « illimitée » au sens de Supabase Auth (~100 ans).
const BAN_ILLIMITE = '876000h';

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

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const caller = await userResp.json();
  const callerEmail = String((caller && caller.email) || '').toLowerCase().trim();
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    return reponse({ error: 'Accès réservé aux administrateurs' }, 403);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  let body = {};
  try { body = await req.json(); } catch (_) {}
  const { action, userId, confirmation } = body || {};
  if (!ACTIONS.includes(action)) return reponse({ error: 'Action invalide' }, 400);
  if (!userId || typeof userId !== 'string') return reponse({ error: 'Compte requis' }, 400);

  // Compte visé, lu dans Supabase Auth : l'email qui compte pour la
  // protection des admins est celui vérifié par l'authentification.
  const uid = encodeURIComponent(userId);
  const cibleResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, { headers: h }).catch(() => null);
  if (!cibleResp || !cibleResp.ok) return reponse({ error: 'Compte introuvable' }, 404);
  const cible = await cibleResp.json();
  const cibleEmail = String((cible && cible.email) || '').toLowerCase().trim();
  if (userId === caller.id || ADMIN_EMAILS.includes(cibleEmail)) {
    return reponse({ error: 'Un compte administrateur ne peut pas être modifié ici' }, 403);
  }

  if (action === 'supprimer') {
    if (confirmation !== CONFIRMATION) return reponse({ error: `Tapez ${CONFIRMATION} pour confirmer` }, 400);
    const resultat = await effacerCompte(userId, serviceKey);
    if (!resultat.ok && resultat.etape === 'donnees') {
      return reponse({ error: 'Suppression incomplète, réessayez dans un instant', tables: resultat.tables }, 500);
    }
    if (!resultat.ok) return reponse({ error: 'Données supprimées, mais le compte de connexion n’a pas pu l’être : réessayez' }, 500);
    return reponse({ success: true }, 200);
  }

  const desactiver = action === 'desactiver';
  const banResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT', headers: h,
    body: JSON.stringify({ ban_duration: desactiver ? BAN_ILLIMITE : 'none' }),
  }).catch(() => null);
  if (!banResp || !banResp.ok) {
    return reponse({ error: desactiver ? 'Le compte n’a pas pu être désactivé' : 'Le compte n’a pas pu être réactivé' }, 502);
  }

  const planResp = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?user_id=eq.${uid}`, {
    method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: desactiver ? 'disabled' : 'active' }),
  }).catch(() => null);
  if (!planResp || !planResp.ok) {
    // Le bannissement est déjà appliqué (ou levé) : seul l'affichage du statut est en retard.
    return reponse({ success: true, avertissement: 'Accès modifié, mais le statut affiché n’a pas pu être mis à jour' }, 200);
  }
  return reponse({ success: true }, 200);
}
