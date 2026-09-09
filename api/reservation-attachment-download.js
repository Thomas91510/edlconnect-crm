export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'reservations';

// Les pièces jointes de réservation n'appartiennent à aucun client précis
// (contrairement aux factures) — seul un administrateur du CRM peut en
// demander le téléchargement. Le bucket est privé : mint une URL signée de
// très courte durée (60s), jamais stockée.
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
    const callerEmail = (user?.email || '').toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(callerEmail)) {
      return new Response(JSON.stringify({ error: 'Réservé aux administrateurs' }), { status: 403, headers: cors });
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const chemin = String(body?.path || '').trim();
    if (!chemin) {
      return new Response(JSON.stringify({ error: 'Chemin manquant' }), { status: 400, headers: cors });
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };
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
