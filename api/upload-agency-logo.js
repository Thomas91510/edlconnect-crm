export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'agency-logos';
const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo — un logo, pas une photo
// Pas de SVG : servi depuis un bucket public, il peut contenir du script.
const TYPES_AUTORISES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Dépôt du logo de l'agence (Paramètres → Identité visuelle), affiché dans
// le CRM à la place du logo Lokentia par défaut — réservé aux agences avec
// un abonnement payant (comme la couleur de marque), vérifié ici
// côté serveur (contrairement à la couleur, un fichier stocké a un coût
// réel et ne doit pas dépendre du seul contrôle client). Bucket PUBLIC
// (comme "agent-photos") : un logo d'agence n'est pas une donnée sensible.
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
  if (req.method !== 'POST' && req.method !== 'DELETE') {
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

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    // Suppression : ne retire que la référence dans settings (le fichier
    // orphelin dans le bucket n'est pas nettoyé — même simplification que
    // pour les autres documents de ce CRM, sans conséquence pour un bucket
    // public de logos).
    if (req.method === 'DELETE') {
      const settingsResp = await fetch(
        `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(user.id)}`,
        { headers: supaHeaders }
      );
      const settingsRows = settingsResp.ok ? await settingsResp.json() : [];
      const data = (settingsRows[0] && settingsRows[0].data) || {};
      await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { ...data, logoPath: '' }, updated_at: new Date().toISOString() })
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    if (!ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      const planResp = await fetch(
        `${SUPABASE_URL}/rest/v1/user_plans?select=plan,status&user_id=eq.${encodeURIComponent(user.id)}`,
        { headers: supaHeaders }
      );
      const planRows = planResp.ok ? await planResp.json() : [];
      const plan = (planRows[0] && planRows[0].plan) || 'free';
      if (plan === 'free') {
        return new Response(JSON.stringify({ error: 'Le logo personnalisé est réservé aux abonnements payants (Starter ou Pro).' }), { status: 403, headers: cors });
      }
    }

    let form;
    try {
      form = await req.formData();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }
    const extension = TYPES_AUTORISES[file.type];
    if (!extension) {
      return new Response(JSON.stringify({ error: 'Format invalide (JPG, PNG, WebP ou SVG attendu)' }), { status: 400, headers: cors });
    }
    if (typeof file.size === 'number' && file.size > TAILLE_MAX) {
      return new Response(JSON.stringify({ error: 'Fichier trop volumineux (2 Mo maximum)' }), { status: 400, headers: cors });
    }

    // Chemin fixe (pas d'horodatage) : un nouvel envoi remplace le logo
    // précédent au lieu d'en accumuler un par envoi.
    const chemin = `${encodeURIComponent(user.id)}.${extension}`;
    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`,
      { method: 'POST', headers: { ...supaHeaders, 'Content-Type': file.type, 'x-upsert': 'true' }, body: buf }
    );
    if (!uploadResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec du téléversement' }), { status: 500, headers: cors });
    }

    const settingsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: supaHeaders }
    );
    const settingsRows = settingsResp.ok ? await settingsResp.json() : [];
    const data = (settingsRows[0] && settingsRows[0].data) || {};

    await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...data, logoPath: chemin }, updated_at: new Date().toISOString() })
    });

    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${chemin}`;
    return new Response(JSON.stringify({ success: true, path: chemin, url }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
