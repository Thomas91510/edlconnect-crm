export const config = { runtime: 'edge' };

import { origineAutorisee } from './_lib/cors.js';

// Identifie la version réellement déployée, sans aucune maintenance manuelle :
// Vercel renseigne automatiquement VERCEL_GIT_COMMIT_SHA/VERCEL_ENV pour
// chaque déploiement (production comme preview), donc cette réponse reflète
// toujours le commit en ligne. Endpoint public en lecture seule — un SHA de
// commit n'a rien de sensible.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  const env = process.env.VERCEL_ENV || 'development';

  return new Response(JSON.stringify({ sha, env }), { status: 200, headers });
}
