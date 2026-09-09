export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { escapeIlike } from './_lib/ilike.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'factures';

// Le bucket "factures" est privé : le chemin de stockage seul (stocké dans
// documents[].url pour les documents de type "facture") ne suffit pas à
// télécharger le fichier. Ce point d'accès vérifie que le chemin demandé
// appartient bien à un document "facture" du client authentifié, puis
// génère une URL signée de très courte durée (60s) — jamais stockée,
// jamais réutilisable au-delà.
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origineAutorisee(req),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) };

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
    if (!callerEmail) {
      return new Response(JSON.stringify({ error: 'Email introuvable' }), { status: 400, headers: cors });
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const chemin = String(body?.path || '').trim();
    if (!chemin) {
      return new Response(JSON.stringify({ error: 'Chemin manquant' }), { status: 400, headers: cors });
    }

    // Aperçu admin : mêmes règles que client-orders.js/client-documents.js —
    // seul un administrateur peut consulter la facture d'un autre email.
    let email = callerEmail;
    if (ADMIN_EMAILS.includes(callerEmail)) {
      const clientEmail = (body && body.clientEmail || '').toLowerCase().trim();
      if (clientEmail) email = clientEmail;
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    const contactsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(escapeIlike(email))}`,
      { headers: supaHeaders }
    );
    if (!contactsResp.ok) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: cors });
    }
    const rows = await contactsResp.json();
    const possede = (rows || []).some(c =>
      (c.data?.documents || []).some(d => d && d.type === 'facture' && d.url === chemin)
    );
    if (!possede) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: cors });
    }

    const signResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${chemin}`,
      {
        method: 'POST',
        headers: { ...supaHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 })
      }
    );
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
