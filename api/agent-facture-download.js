export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';
import { cheminSur } from './_lib/chemin-stockage.js';

const BUCKET = 'agent-documents';

// Lien de téléchargement de 60 s pour une facture envoyée par un agent.
// Deux appelants possibles : l'agence (titulaire du compte, CRM) pour
// n'importe lequel de SES agents, ou l'agent lui-même pour ses propres
// factures. Le chemin de stockage est toujours lu sur la fiche, jamais
// fourni par le navigateur.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reponse({ error: 'Method not allowed' }, 405);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();

  let body;
  try { body = await req.json(); } catch (_) { return reponse({ error: 'Corps de requête invalide' }, 400); }
  const numero = String((body && body.numero) || '');
  const agentId = String((body && body.agentId) || '');
  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  let agent = null;
  if (agentId) {
    // Agence : l'agent doit figurer dans SES réglages
    const r = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(user.id)}`, { headers: supaHeaders });
    const rows = r.ok ? await r.json() : [];
    const agents = (rows[0] && rows[0].data && rows[0].data.agents) || [];
    agent = agents.find(a => a && a.id === agentId) || null;
  } else {
    const resolu = await resolverAgentParEmail(user.email, serviceKey);
    agent = resolu ? resolu.agent : null;
  }
  if (!agent) return reponse({ error: 'Accès refusé' }, 403);
  const facture = (Array.isArray(agent.factures) ? agent.factures : []).find(f => f && f.numero === numero);
  if (!facture || !facture.chemin) return reponse({ error: 'Facture introuvable' }, 404);
  // Le chemin vient des réglages de l'abonné : il doit rester dans le dossier de CET agent.
  if (!cheminSur(facture.chemin, encodeURIComponent(agent.id))) return reponse({ error: 'Accès refusé' }, 403);

  const signResp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${facture.chemin}`, {
    method: 'POST',
    headers: { ...supaHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!signResp.ok) return reponse({ error: 'Échec de la génération du lien' }, 500);
  const signData = await signResp.json();
  return reponse({ url: `${SUPABASE_URL}/storage/v1${signData.signedURL}` }, 200);
}
