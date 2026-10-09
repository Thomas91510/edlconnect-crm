export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { cheminPieceJointeValide } from './_lib/chemin-stockage.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'reservations';

// Les pièces jointes de réservation appartiennent à l'agence propriétaire de
// la réservation (comme pour delete-reservation.js) : chaque abonné peut
// télécharger les pièces jointes de SES PROPRES réservations, un admin peut
// télécharger celles de n'importe quelle agence. Le bucket est privé : mint
// une URL signée de très courte durée (60s), jamais stockée.
//
// Défense en profondeur : le chemin ne doit jamais être signé tel quel sans
// vérifier qu'il correspond à une pièce jointe RÉELLEMENT rattachée à une
// réservation existante ET appartenant à l'appelant (piecesJointes[].path +
// data.ownerId) — lien signé de courte durée, pour ne jamais
// transformer cet endpoint en "signeur" de n'importe quel chemin du bucket.
export default async function handler(req) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) };
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500, headers: cors });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: cors });
    }
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: cors });
    }
    const user = await userResp.json();
    const _userId = user?.id;
    const callerEmail = (user?.email || '').toLowerCase().trim();
    if (!_userId) {
      return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 401, headers: cors });
    }
    const estAdmin = ADMIN_EMAILS.includes(callerEmail);

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const chemin = String(body?.path || '').trim();
    if (!chemin) {
      return new Response(JSON.stringify({ error: 'Chemin manquant' }), { status: 400, headers: cors });
    }
    // Le chemin est enregistré sur la réservation, modifiable par son
    // propriétaire : on n'accepte que le format produit par le dépôt.
    if (!cheminPieceJointeValide(chemin)) {
      return new Response(JSON.stringify({ error: 'Pièce jointe introuvable' }), { status: 404, headers: cors });
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    // Le chemin doit correspondre à une pièce jointe réellement enregistrée
    // sur une réservation — sinon on pourrait signer n'importe quel objet
    // du bucket sur simple appel, sans lien avec une vraie réservation. Un
    // non-admin est en plus restreint à SES propres réservations (même
    // cloisonnement que get-reservations.js/delete-reservation.js).
    const filtreContient = 'cs.' + encodeURIComponent(JSON.stringify([{ path: chemin }]));
    let urlVerif = `${SUPABASE_URL}/rest/v1/bookings?select=id&data->piecesJointes=${filtreContient}&limit=1`;
    if (!estAdmin) {
      urlVerif += `&data->>ownerId=eq.${encodeURIComponent(_userId)}`;
    }
    const checkResp = await fetch(urlVerif, { headers: supaHeaders });
    if (!checkResp.ok) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: cors });
    }
    const trouve = await checkResp.json();
    if (!Array.isArray(trouve) || trouve.length === 0) {
      return new Response(JSON.stringify({ error: 'Pièce jointe introuvable' }), { status: 404, headers: cors });
    }

    const signResp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${chemin}`, {
      method: 'POST',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 })
    });
    if (!signResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec de la génération du lien' }), { status: 500, headers: cors });
    }
    const signData = await signResp.json();
    const url = `${SUPABASE_URL}/storage/v1${signData.signedURL}`;

    return new Response(JSON.stringify({ url }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
