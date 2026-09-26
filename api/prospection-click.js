export const config = { runtime: 'edge' };

import { resoudreAdminUserId, avancerEtapeProspect } from './_lib/prospects-sync.js';

// Webhook Brevo (événement "click") pour la séquence de prospection EDL IDF.
// Remplace le scénario Make "Séquence prospection — Capture clics" — même
// logique minimale (marquer clickedAt sur le contact), mais persistée dans
// la table Supabase "prospection" plutôt que le data store Make, pour rester
// cohérent avec prospection-cron.js qui lit cet état.
//
// Un clic fait aussi avancer la carte du prospect dans le pipeline commercial
// (table "prospects") jusqu'à l'étape "Email ouvert" — voir
// api/_lib/prospects-sync.js pour le détail (jamais en arrière, best-effort).
//
// Protégé par un secret partagé dans l'URL du webhook (?secret=...) : sans
// ça, n'importe qui pourrait POSTer un email arbitraire et polluer la table
// de prospection (fausses dates de clic, désynchronisation de la séquence
// d'emails). Quand tu repointes le webhook côté Brevo, configure l'URL avec
// ?secret=<PROSPECTION_WEBHOOK_SECRET> (même valeur que la variable Vercel).
const SUPABASE_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co';
const TABLE = 'prospection';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  const secretAttendu = process.env.PROSPECTION_WEBHOOK_SECRET;
  const secretFourni = new URL(req.url).searchParams.get('secret') || '';
  if (!secretAttendu || secretFourni !== secretAttendu) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  let body;
  try { body = await req.json(); } catch (e) { body = {}; }
  const email = body && body.email;

  if (!email) {
    // Pas d'email exploitable dans l'événement : on répond 200 quand même
    // (Brevo retente sinon), simplement rien à enregistrer.
    return new Response(JSON.stringify({ ok: true, ignore: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Lit l'enregistrement existant pour fusionner (un PATCH/upsert brut
    // remplacerait tout le contenu de "data", effaçant stage/sentAt1...).
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,data&id=eq.${encodeURIComponent(email)}`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!getResp.ok) throw new Error('Erreur lecture Supabase');
    const existant = await getResp.json();
    const donneesExistantes = (existant && existant[0] && existant[0].data) || { email };

    const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([{
        id: email,
        data: { ...donneesExistantes, clickedAt: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }])
    });
    if (!upsertResp.ok) {
      const err = await upsertResp.text();
      return new Response(JSON.stringify({ error: 'Supabase: ' + err }), { status: 500 });
    }

    const adminUserId = await resoudreAdminUserId(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await avancerEtapeProspect(SUPABASE_URL, SUPABASE_SERVICE_KEY, adminUserId, email, 'email_ouvert');

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
