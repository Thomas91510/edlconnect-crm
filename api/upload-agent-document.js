export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'agent-documents';
const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo
const TYPES_AUTORISES = ['contrat', 'avenant'];

// Dépôt du contrat signé ou d'un avenant pour un Agent EDL — réservé à
// l'agence (jamais l'agent lui-même) : c'est elle qui dépose ces documents,
// l'agent ne fait que les consulter (voir agent-document-download.js). Le
// fichier va dans le bucket Storage privé "agent-documents" (à créer une
// fois manuellement dans le tableau de bord Supabase, même principe que le
// bucket "factures") ; seul le CHEMIN de stockage est conservé sur la fiche
// agent (contratPath/avenantPath), jamais une URL directement exploitable.
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
    const agentId = String(form.get('agentId') || '').trim();
    const type = String(form.get('type') || '').trim();

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'Fichier manquant' }), { status: 400, headers: cors });
    }
    if (!agentId) {
      return new Response(JSON.stringify({ error: 'Agent manquant' }), { status: 400, headers: cors });
    }
    if (!TYPES_AUTORISES.includes(type)) {
      return new Response(JSON.stringify({ error: 'Type de document invalide (contrat ou avenant attendu)' }), { status: 400, headers: cors });
    }
    if (file.type && file.type !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'Le fichier doit être un PDF' }), { status: 400, headers: cors });
    }
    if (typeof file.size === 'number' && file.size > TAILLE_MAX) {
      return new Response(JSON.stringify({ error: 'Fichier trop volumineux (15 Mo maximum)' }), { status: 400, headers: cors });
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

    const chemin = `${encodeURIComponent(agentId)}/${type}-${Date.now()}.pdf`;
    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`,
      { method: 'POST', headers: { ...supaHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: buf }
    );
    if (!uploadResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec du téléversement — le bucket "agent-documents" existe-t-il dans Supabase Storage ?' }), { status: 500, headers: cors });
    }

    // Rattache le document à la fiche agent, dans les settings DU COMPTE
    // APPELANT (jamais une autre agence) — lecture puis écriture pour
    // fusionner sans écraser le reste de settings.data.
    const settingsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: supaHeaders }
    );
    if (!settingsResp.ok) {
      return new Response(JSON.stringify({ error: 'Document déposé, mais impossible de mettre à jour la fiche agent' }), { status: 500, headers: cors });
    }
    const settingsRows = await settingsResp.json();
    const data = (settingsRows[0] && settingsRows[0].data) || {};
    const agents = Array.isArray(data.agents) ? data.agents.slice() : [];
    const idx = agents.findIndex(a => a && a.id === agentId);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'Document déposé, mais agent introuvable' }), { status: 404, headers: cors });
    }
    agents[idx] = { ...agents[idx], [type + 'Path']: chemin };

    await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() })
    });

    return new Response(JSON.stringify({ success: true, path: chemin }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
