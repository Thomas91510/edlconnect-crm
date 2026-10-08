export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { comptesConnexion, emailsHistoriques, DATE_ACTIVATION } from './_lib/espace-agence.js';

// Pour le CRM (page « Espaces agences », fiche client) : emails des agences
// de l'appelant qui utilisaient déjà leur extranet avant l'interrupteur —
// elles restent activées tant qu'on ne les désactive pas. Limité aux
// emails des contacts de l'appelant (tous pour l'administrateur).
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();
  const estAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim());

  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  let url = `${SUPABASE_URL}/rest/v1/contacts?select=data->>email&limit=5000`;
  if (!estAdmin) url += `&user_id=eq.${encodeURIComponent(user.id)}`;
  const r = await fetch(url, { headers: supaHeaders });
  const lignes = r.ok ? await r.json() : [];
  const emailsContacts = new Set((lignes || []).map(l => String(l && (l.email || l['data->>email']) || '').toLowerCase()).filter(Boolean));

  const historiques = emailsHistoriques(await comptesConnexion(serviceKey)).filter(e => emailsContacts.has(e));
  return reponse({ historiques, dateActivation: DATE_ACTIVATION }, 200);
}
