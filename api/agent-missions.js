export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';
import { calculerKpiAgent } from './_lib/agent-kpi.js';

// Endpoint du portail agent (agent-app.html) : authentifié par jeton de
// session Supabase (lien magique, même mécanisme que l'extranet client) —
// ne renvoie QUE les missions de l'agent authentifié, jamais celles d'un
// autre agent ni d'une autre agence. Les "Agents EDL" n'ont pas de compte
// Supabase dédié (pas de table, juste settings.data.agents) : c'est la
// correspondance email authentifié → fiche agent (resolverAgentParEmail)
// qui fait ici office de contrôle d'accès, côté serveur.
//
// Champs volontairement exclus de la réponse : tout ce qui relève de
// l'agence cliente ou du tarif (CA, email/adresse de l'agence, etc.) —
// l'agent ne voit que ce qui lui est nécessaire pour intervenir.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') {
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

  const resolu = await resolverAgentParEmail(user.email, serviceKey);
  if (!resolu) {
    return new Response(JSON.stringify({ error: 'Aucun profil agent trouvé pour cet email' }), { status: 403, headers });
  }
  const { ownerId, agent } = resolu;

  const missionsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/missions?select=id,data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!missionsResp.ok) {
    return new Response(JSON.stringify({ error: 'Erreur lecture des missions' }), { status: 500, headers });
  }
  const rows = await missionsResp.json();
  const missions = rows
    .map(r => ({ ...r.data, id: r.id }))
    .filter(m => m.expertId === agent.id);

  const missionsPubliques = missions.map(m => ({
    id: m.id,
    type: m.type || '',
    adresse: m.adresse || '',
    bienType: m.bienType || '',
    bienTypo: m.bienTypo || '',
    bienMeuble: m.bienMeuble || '',
    superficie: m.superficie || '',
    date: m.date || '',
    dureeEstimee: m.dureeEstimee || '',
    statut: m.statut || '',
    acces: m.acces || '',
    locataireNom: m.locataireNom || '',
    locataireTel: m.locataireTel || '',
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const body = {
    agent: { nom: agent.nom || '' },
    missions: missionsPubliques,
    kpi: calculerKpiAgent(missions),
  };
  return new Response(JSON.stringify(body), { status: 200, headers });
}
