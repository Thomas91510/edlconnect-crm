export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { cheminPieceJointeValide, cheminSur } from './_lib/chemin-stockage.js';

// Suppression définitive du compte d'un abonné (droit à l'effacement,
// RGPD) : toutes ses lignes (tables à user_id, réservations dont il est
// propriétaire, plan), ses fichiers (logo, photos et documents de ses
// agents, pièces jointes de ses réservations), puis son compte de
// connexion. Seule la preuve de signature du contrat RGPD est conservée
// (obligation de preuve, prévue à l'article 10 du contrat). Les copies de
// sauvegarde s'effacent au fil de leur rotation (30 jours).
//
// Le compte admin (éditeur de la plateforme) ne peut pas se supprimer ici.
export const TABLES_ABONNE = ['contacts', 'missions', 'prospects', 'deals', 'rdvs', 'campagnes', 'trackings', 'invoices', 'settings', 'user_plans'];
export const CONFIRMATION = 'SUPPRIMER';

async function supprimerFichiers(bucket, chemins, h) {
  const liste = [...new Set((chemins || []).filter(Boolean))];
  for (let i = 0; i < liste.length; i += 100) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: liste.slice(i, i + 100) }),
    }).catch(() => {});
  }
}

async function listerDossier(bucket, prefixe, h) {
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefixe, limit: 1000 }),
    });
    const l = r.ok ? await r.json() : [];
    return (l || []).map(f => f && f.name).filter(Boolean).map(n => prefixe + n);
  } catch (_) { return []; }
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
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();
  if (!user || !user.id) return reponse({ error: 'Session invalide ou expirée' }, 401);
  if (ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim())) {
    return reponse({ error: 'Le compte éditeur de la plateforme ne peut pas être supprimé ici' }, 403);
  }

  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (!body || body.confirmation !== CONFIRMATION) {
    return reponse({ error: `Tapez ${CONFIRMATION} pour confirmer` }, 400);
  }

  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const uid = encodeURIComponent(user.id);

  // 1. Inventaire des fichiers à partir de SES données (avant de les effacer)
  let reglages = {};
  try {
    const s = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${uid}`, { headers: h });
    const rows = s.ok ? await s.json() : [];
    reglages = (rows[0] && rows[0].data) || {};
  } catch (_) {}
  let reservations = [];
  try {
    const b = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,data&data->>ownerId=eq.${uid}`, { headers: h });
    reservations = b.ok ? await b.json() : [];
  } catch (_) {}

  const agents = Array.isArray(reglages.agents) ? reglages.agents : [];
  // Documents d'agents : seulement les fichiers référencés sur SES fiches
  // (contrat, avenant, factures), jamais un dossier entier — l'identifiant
  // d'agent est choisi par l'abonné et pourrait viser le dossier d'un autre.
  const docsAgents = agents.flatMap(a => {
    if (!a || !a.id) return [];
    const prefixe = encodeURIComponent(a.id);
    const chemins = [a.contratPath, a.avenantPath, ...((Array.isArray(a.factures) ? a.factures : []).map(f => f && f.chemin))];
    return chemins.filter(c => cheminSur(c, prefixe));
  });
  const photos = await listerDossier('agent-photos', uid + '/', h);
  const piecesJointes = reservations.flatMap(r => ((r.data && r.data.piecesJointes) || []).map(p => p && p.path)).filter(cheminPieceJointeValide);

  // 2. Fichiers
  await supprimerFichiers('agent-documents', docsAgents, h);
  await supprimerFichiers('agent-photos', photos, h);
  await supprimerFichiers('reservations', piecesJointes, h);
  if (reglages.logoPath && !String(reglages.logoPath).includes('..')) await supprimerFichiers('agency-logos', [String(reglages.logoPath)], h);

  // 3. Lignes en base
  const echecs = [];
  for (const table of TABLES_ABONNE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${uid}`, { method: 'DELETE', headers: h }).catch(() => null);
    if (!r || !r.ok) echecs.push(table);
  }
  const rb = await fetch(`${SUPABASE_URL}/rest/v1/bookings?data->>ownerId=eq.${uid}`, { method: 'DELETE', headers: h }).catch(() => null);
  if (!rb || !rb.ok) echecs.push('bookings');
  if (echecs.length) {
    // Compte de connexion conservé : l'abonné peut réessayer, rien n'est orphelin.
    return reponse({ error: 'Suppression incomplète, réessayez dans un instant', tables: echecs }, 500);
  }

  // 4. Compte de connexion
  const ru = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: h }).catch(() => null);
  if (!ru || !ru.ok) return reponse({ error: 'Données supprimées, mais le compte de connexion n’a pas pu l’être : contactez contact@lokentia.fr' }, 500);

  // 5. Confirmation par email (best-effort)
  const brevo = process.env.BREVO_API_KEY;
  if (brevo && user.email) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevo },
      body: JSON.stringify({
        sender: { name: 'Lokentia', email: 'contact@lokentia.fr' },
        to: [{ email: user.email }],
        bcc: [{ email: ADMIN_EMAILS[0] }],
        subject: 'Votre compte Lokentia a été supprimé',
        htmlContent: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6"><p>Bonjour,</p><p>Votre compte Lokentia et l’ensemble de ses données (clients, missions, réservations, agents, fichiers) ont été supprimés à votre demande. Les copies de sauvegarde seront effacées automatiquement sous 30 jours.</p><p>Merci d’avoir utilisé Lokentia.</p><p>L’équipe Lokentia</p></div>',
      }),
    }).catch(() => {});
  }
  return reponse({ success: true }, 200);
}
