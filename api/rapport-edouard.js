export const config = { runtime: 'edge' };

import { signatureValide } from './_lib/lien-rapport.js';

const EDOUARD_BASE = 'https://europe-west3-edouard-immo.cloudfunctions.net/api';

// GET /api/rapport-edouard?s=<situation Edouard>&t=<signature>
// Rapport trop lourd pour être stocké (api/_lib/lien-rapport.js) : on
// demande à Edouard une URL de téléchargement fraîche et on y redirige.
export default async function handler(req) {
  const page = (msg, status) => new Response(
    `<!doctype html><meta charset="utf-8"><title>Rapport</title><p style="font-family:sans-serif;padding:24px">${msg}</p>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const url = new URL(req.url);
  const s = url.searchParams.get('s') || '';
  const t = url.searchParams.get('t') || '';
  const secret = process.env.SUPABASE_SERVICE_KEY;
  if (!/^[\w-]{1,80}$/.test(s) || !(await signatureValide(s, t, secret))) return page('Lien de rapport invalide.', 403);
  if (!process.env.EDOUARD_API_KEY) return page('Rapport momentanément indisponible.', 503);
  try {
    const r = await fetch(`${EDOUARD_BASE}/v1/situations/${encodeURIComponent(s)}/report`, {
      headers: { Authorization: 'Bearer ' + process.env.EDOUARD_API_KEY },
    });
    if (!r.ok) return page('Rapport momentanément indisponible, réessayez dans quelques minutes.', 502);
    let d = await r.json();
    if (d && d.data) d = d.data;
    const fichier = d && (d.url || (Array.isArray(d) && d[0] && d[0].url));
    if (!fichier || !/^https:\/\//.test(fichier)) return page('Rapport introuvable.', 404);
    return new Response(null, { status: 302, headers: { Location: fichier, 'Cache-Control': 'no-store' } });
  } catch (_) {
    return page('Rapport momentanément indisponible, réessayez dans quelques minutes.', 502);
  }
}
