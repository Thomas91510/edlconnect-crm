export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const BUCKET = 'factures';

// Plus de factures pour les agences : supprime les anciennes factures
// déposées sur les fiches clients (entrées documents de type "facture") et
// leurs PDF du bucket privé "factures". Un abonné ne touche qu'à SES
// contacts (colonne user_id) ; l'administrateur à tous. { simulation: true }
// compte sans rien supprimer (affiché dans la confirmation du CRM).

// L'ancien dépôt enregistrait le chemin avec l'email encodé
// (« a%40b.fr/facture-1.pdf ») alors que Storage range l'objet sous le nom
// décodé (« a@b.fr/... ») : on décode avant de demander la suppression.
export function cheminStockage(url) {
  const brut = String(url || '').replace(/^\/+/, '');
  try { return decodeURIComponent(brut); } catch (_) { return brut; }
}

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
  if (!user || !user.id) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const estAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim());

  let body = {};
  try { body = await req.json(); } catch (_) {}
  const simulation = !!(body && body.simulation);

  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  let url = `${SUPABASE_URL}/rest/v1/contacts?select=id,data&data->documents=cs.${encodeURIComponent('[{"type":"facture"}]')}`;
  if (!estAdmin) url += `&user_id=eq.${encodeURIComponent(user.id)}`;
  const r = await fetch(url, { headers: supaHeaders });
  if (!r.ok) return reponse({ error: 'Lecture des fiches clients impossible' }, 500);
  const rows = await r.json();

  const chemins = [];
  let factures = 0;
  const modifs = (rows || []).map(row => {
    const data = row.data || {};
    const docs = Array.isArray(data.documents) ? data.documents : [];
    const anciennes = docs.filter(d => d && d.type === 'facture');
    factures += anciennes.length;
    anciennes.forEach(d => { if (d.url && !/^https?:/i.test(d.url)) chemins.push(cheminStockage(d.url)); });
    return { id: row.id, data: { ...data, documents: docs.filter(d => !(d && d.type === 'facture')) } };
  }).filter(m => m);

  if (simulation) return reponse({ simulation: true, fiches: modifs.length, factures }, 200);

  let fichesModifiees = 0;
  for (const m of modifs) {
    const p = await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(m.id)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: m.data, updated_at: new Date().toISOString() }),
    });
    if (p.ok) fichesModifiees++;
  }

  let fichiersSupprimes = 0;
  const uniques = [...new Set(chemins)];
  for (let i = 0; i < uniques.length; i += 100) {
    const lot = uniques.slice(i, i + 100);
    const d = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: lot }),
    });
    if (d.ok) {
      const supprimes = await d.json().catch(() => null);
      fichiersSupprimes += Array.isArray(supprimes) ? supprimes.length : 0;
    }
  }

  return reponse({ success: true, fiches: fichesModifiees, factures, fichiersSupprimes }, 200);
}
