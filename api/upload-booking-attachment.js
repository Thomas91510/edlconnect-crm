export const config = { runtime: 'edge' };

import { SUPABASE_URL } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'reservations';
const TAILLE_MAX = 25 * 1024 * 1024; // 25 Mo par fichier
const MAX_FICHIERS_PAR_DEMANDE = 10;

// Dépôt de pièce jointe pour une demande de réservation publique
// (api/booking-page.js) : endpoint PUBLIC, non authentifié — comme
// booking-request.js. Aucune restriction de format (demande explicite),
// mais taille et nombre de fichiers plafonnés, et un jeton côté client
// regroupe les fichiers d'une même soumission avant que la réservation
// n'existe encore (elle n'est créée qu'à l'étape suivante).
export default async function handler(req) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500, headers: cors });
  }

  try {
    let form;
    try {
      form = await req.formData();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }

    const file = form.get('file');
    // Jeton généré côté navigateur (une valeur aléatoire par soumission) —
    // regroupe les fichiers avant la création de la réservation elle-même.
    const token = String(form.get('token') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }
    if (!token) {
      return new Response(JSON.stringify({ error: 'Jeton de soumission manquant' }), { status: 400, headers: cors });
    }
    if (typeof file.size === 'number' && file.size > TAILLE_MAX) {
      return new Response(JSON.stringify({ error: 'Fichier trop volumineux (25 Mo maximum)' }), { status: 400, headers: cors });
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    // Garde-fou nombre de fichiers : compte ce qui existe déjà sous ce jeton
    // avant d'accepter un fichier de plus (endpoint public, sans compte).
    const listeResp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: token + '/', limit: MAX_FICHIERS_PAR_DEMANDE + 1 })
    });
    if (listeResp.ok) {
      const existants = await listeResp.json().catch(() => []);
      if (Array.isArray(existants) && existants.length >= MAX_FICHIERS_PAR_DEMANDE) {
        return new Response(JSON.stringify({ error: `Maximum ${MAX_FICHIERS_PAR_DEMANDE} fichiers par demande` }), { status: 400, headers: cors });
      }
    }

    const nomOriginal = String(file.name || 'fichier').slice(0, 200);
    const extension = (nomOriginal.match(/\.[a-zA-Z0-9]{1,10}$/) || [''])[0];
    const chemin = `${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;

    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`, {
      method: 'POST',
      headers: { ...supaHeaders, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: buf
    });
    if (!uploadResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec du téléversement — le bucket "reservations" existe-t-il dans Supabase Storage ?' }), { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ success: true, path: chemin, nom: nomOriginal }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
