export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';

const BUCKET = 'agent-photos';
const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const TYPES_AUTORISES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Dépôt de SA PROPRE photo de profil par un Agent EDL, depuis son espace
// (agent-app.html) — jamais l'agence, à l'inverse de upload-agent-document.js
// où c'est l'agence qui dépose le contrat/avenant de l'agent. Authentifié
// par jeton Supabase (lien magique), résolu vers l'agence propriétaire et
// la fiche agent via resolverAgentParEmail (même mécanisme que
// agent-missions.js) — un agent ne peut donc modifier que SA propre fiche.
//
// Contrairement au bucket "agent-documents" (privé), "agent-photos" est
// PUBLIC : une photo de profil n'est pas une donnée sensible — les clients
// la voient sur leur confirmation de RDV pour reconnaître l'agent qui se
// déplace chez eux — donc pas besoin d'URL signée pour l'afficher.
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

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500, headers: cors });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: cors });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: cors });
    }
    const user = await userResp.json();

    const resolu = await resolverAgentParEmail(user.email, serviceKey);
    if (!resolu) {
      return new Response(JSON.stringify({ error: 'Aucun profil agent trouvé pour cet email' }), { status: 403, headers: cors });
    }
    const { ownerId, agent } = resolu;

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
      return new Response(JSON.stringify({ error: 'Format invalide (JPG, PNG ou WebP attendu)' }), { status: 400, headers: cors });
    }
    if (typeof file.size === 'number' && file.size > TAILLE_MAX) {
      return new Response(JSON.stringify({ error: 'Fichier trop volumineux (5 Mo maximum)' }), { status: 400, headers: cors });
    }

    const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    // Chemin fixe (pas d'horodatage) : un nouvel envoi remplace la photo
    // précédente au lieu d'en accumuler une par envoi.
    const chemin = `${encodeURIComponent(ownerId)}/${encodeURIComponent(agent.id)}.${extension}`;
    const buf = await file.arrayBuffer();
    const uploadResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`,
      { method: 'POST', headers: { ...supaHeaders, 'Content-Type': file.type, 'x-upsert': 'true' }, body: buf }
    );
    if (!uploadResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec du téléversement — le bucket "agent-photos" existe-t-il dans Supabase Storage ?' }), { status: 500, headers: cors });
    }

    // Rattache la photo à la fiche agent, dans les settings DE L'AGENCE
    // propriétaire (ownerId, jamais un compte tiers) — lecture puis écriture
    // pour fusionner sans écraser le reste de settings.data.
    const settingsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
      { headers: supaHeaders }
    );
    if (!settingsResp.ok) {
      return new Response(JSON.stringify({ error: 'Photo déposée, mais impossible de mettre à jour la fiche agent' }), { status: 500, headers: cors });
    }
    const settingsRows = await settingsResp.json();
    const data = (settingsRows[0] && settingsRows[0].data) || {};
    const agents = Array.isArray(data.agents) ? data.agents.slice() : [];
    const idx = agents.findIndex(a => a && a.id === agent.id);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'Photo déposée, mais agent introuvable' }), { status: 404, headers: cors });
    }
    agents[idx] = { ...agents[idx], photoPath: chemin };

    await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(ownerId)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() })
    });

    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${chemin}`;
    return new Response(JSON.stringify({ success: true, path: chemin, url }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
