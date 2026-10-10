import { SUPABASE_URL } from './supabase.js';
import { cheminPieceJointeValide, cheminSur } from './chemin-stockage.js';

// Effacement complet d'un compte abonné, partagé par la suppression faite
// par l'abonné lui-même (api/supprimer-compte.js) et par l'administrateur
// de la plateforme (api/admin-compte.js) : toutes ses lignes (tables à
// user_id, réservations dont il est propriétaire, plan), ses fichiers
// (logo, photos et documents de ses agents, pièces jointes de ses
// réservations), puis son compte de connexion. Seule la preuve de signature
// du contrat RGPD est conservée (obligation de preuve, article 10 du
// contrat). Les copies de sauvegarde s'effacent au fil de leur rotation.
export const TABLES_ABONNE = ['contacts', 'missions', 'prospects', 'deals', 'rdvs', 'campagnes', 'trackings', 'invoices', 'settings', 'user_plans'];

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

// Renvoie { ok:true } ou { ok:false, etape:'donnees'|'connexion', tables? }.
export async function effacerCompte(userId, serviceKey) {
  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const uid = encodeURIComponent(userId);

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
    // Compte de connexion conservé : on peut réessayer, rien n'est orphelin.
    return { ok: false, etape: 'donnees', tables: echecs };
  }

  // 4. Compte de connexion
  const ru = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: h }).catch(() => null);
  if (!ru || !ru.ok) return { ok: false, etape: 'connexion' };
  return { ok: true };
}
