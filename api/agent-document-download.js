export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';

const BUCKET = 'agent-documents';
const TYPES_AUTORISES = ['contrat', 'avenant'];

// Génère un lien de téléchargement de très courte durée (60s, jamais
// stocké) pour le contrat signé ou l'avenant d'un Agent EDL authentifié —
// même principe que facture-download.js côté extranet client. L'agent ne
// peut jamais accéder au document d'un autre agent : le chemin de stockage
// n'est lu que sur SA PROPRE fiche (résolue depuis son email authentifié
// via resolverAgentParEmail), jamais fourni par le client.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }
  const user = await userResp.json();

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Configuration serveur manquante' }), { status: 500, headers });
  }

  try {
    const { type } = await req.json();
    if (!TYPES_AUTORISES.includes(type)) {
      return new Response(JSON.stringify({ error: 'Type de document invalide (contrat ou avenant attendu)' }), { status: 400, headers });
    }

    const resolu = await resolverAgentParEmail(user.email, serviceKey);
    if (!resolu) {
      return new Response(JSON.stringify({ error: 'Aucun profil agent trouvé pour cet email' }), { status: 403, headers });
    }

    const chemin = resolu.agent[type + 'Path'];
    if (!chemin) {
      return new Response(JSON.stringify({ error: 'Document non disponible pour l\'instant' }), { status: 404, headers });
    }

    const signResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${chemin}`,
      {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }),
      }
    );
    if (!signResp.ok) {
      return new Response(JSON.stringify({ error: 'Échec de la génération du lien' }), { status: 500, headers });
    }
    const signData = await signResp.json();
    const url = `${SUPABASE_URL}/storage/v1${signData.signedURL}`;

    return new Response(JSON.stringify({ url }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
