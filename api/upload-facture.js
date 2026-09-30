export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { escapeIlike } from './_lib/ilike.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'factures';
const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo

// Dépôt d'une facture PDF pour un contact, depuis sa fiche dans le CRM : tout
// abonné authentifié peut déposer une facture pour SES PROPRES contacts (le
// bouton "🧾 Déposer une facture" de la fiche contact est visible pour tous
// les abonnés — rien ne le réservait auparavant à l'admin côté interface,
// alors que le serveur, lui, rejetait tout appel non-admin). Le fichier est
// envoyé au bucket Storage "factures" (privé — doit être créé une fois
// manuellement dans le tableau de bord Supabase). Un admin conserve en plus
// le comportement historique : le document est alors ajouté à TOUS les
// contacts correspondant à l'email du client, même dans une autre agence
// (comme pour les rapports Edouard, un client peut apparaître dans
// plusieurs agences) — un abonné normal, lui, ne peut écrire que sur SES
// PROPRES contacts (data.ownerId), jamais sur la fiche d'une autre agence.
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
    const _userId = user?.id;
    const callerEmail = (user?.email || '').toLowerCase().trim();
    if (!_userId) {
      return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 401, headers: cors });
    }
    const estAdmin = ADMIN_EMAILS.includes(callerEmail);

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

    // Rattacher le document aux contacts correspondant à cet email — un
    // admin voit tous les contacts (toutes agences), un abonné normal est
    // restreint à SES PROPRES contacts (jamais la fiche d'une autre agence).
    let urlContacts = `${SUPABASE_URL}/rest/v1/contacts?select=id,data&data->>email=ilike.${encodeURIComponent(escapeIlike(clientEmail))}`;
    if (!estAdmin) {
      urlContacts += `&data->>ownerId=eq.${encodeURIComponent(_userId)}`;
    }
    const contactsResp = await fetch(urlContacts, { headers: supaHeaders });
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
