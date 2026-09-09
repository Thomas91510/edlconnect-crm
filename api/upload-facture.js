export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { escapeIlike } from './_lib/ilike.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'factures';
const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo

// Dépôt d'une facture PDF pour un client : réservé aux administrateurs
// (aucun client ne dépose lui-même de facture). Le fichier est envoyé au
// bucket Storage "factures" (privé — doit être créé une fois manuellement
// dans le tableau de bord Supabase), et un document {type:'facture'} est
// ajouté à TOUS les contacts correspondant à l'email du client (comme pour
// les rapports Edouard, un client peut apparaître dans plusieurs agences).
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

    if (!ADMIN_EMAILS.includes(callerEmail)) {
      return new Response(JSON.stringify({ error: 'Réservé aux administrateurs' }), { status: 403, headers: cors });
    }

    let form;
    try {
      form = await req.formData();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }

    const file = form.get('file');
    const clientEmail = String(form.get('clientEmail') || '').toLowerCase().trim();
    const nom = String(form.get('nom') || '').trim() || 'Facture';

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: 'Email client manquant' }), { status: 400, headers: cors });
    }
    if (file.type && file.type !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'Le fichier doit être un PDF' }), { status: 400, headers: cors });
    }
    if (typeof file.size === 'number' && file.size > TAILLE_MAX) {
      return new Response(JSON.stringify({ error: 'Fichier trop volumineux (15 Mo maximum)' }), { status: 400, headers: cors });
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    // Chemin de stockage : un dossier par client, un fichier horodaté.
    const dossier = encodeURIComponent(clientEmail);
    const nomFichier = `facture-${Date.now()}.pdf`;
    const chemin = `${dossier}/${nomFichier}`;

    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`,
      {
        method: 'POST',
        headers: { ...supaHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
        body: buf
      }
    );
    if (!uploadResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec du téléversement — le bucket "factures" existe-t-il dans Supabase Storage ?' }), { status: 500, headers: cors });
    }

    // Rattacher le document à tous les contacts correspondant à cet email.
    const contactsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?select=id,data&data->>email=ilike.${encodeURIComponent(escapeIlike(clientEmail))}`,
      { headers: supaHeaders }
    );
    if (!contactsResp.ok) {
      return new Response(JSON.stringify({ error: 'Fichier déposé, mais aucun contact trouvé pour cet email' }), { status: 404, headers: cors });
    }
    const rows = await contactsResp.json();
    if (!rows || !rows.length) {
      return new Response(JSON.stringify({ error: 'Fichier déposé, mais aucun contact trouvé pour cet email' }), { status: 404, headers: cors });
    }

    for (const row of rows) {
      const data = row.data || {};
      const docs = Array.isArray(data.documents) ? data.documents.slice() : [];
      docs.push({ nom, url: chemin, type: 'facture', deposeLe: new Date().toISOString() });
      await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { ...data, documents: docs }, updated_at: new Date().toISOString() })
      });
    }

    return new Response(JSON.stringify({ success: true, path: chemin, nom }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
