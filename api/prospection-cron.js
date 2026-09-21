export const config = { runtime: 'edge' };

// Séquence de prospection EDL IDF (3 emails : J0, J+4, J+6), plafonnée à 250
// envois/jour. Remplace le scénario Make "Séquence prospection — Envoi
// quotidien", devenu indisponible dès qu'il a dépassé le quota d'opérations
// du plan gratuit (~3000 opérations pour un seul jour de 250 envois, avec
// toute la logique anti-doublon) — un compte Make entier ("organization")
// se met en pause dès qu'un plan est dépassé, bloquant TOUS les scénarios,
// pas seulement celui qui a consommé le quota.
//
// État persisté dans la table Supabase "prospection" (id = email, ou
// "quota:YYYY-MM-DD" pour le compteur du jour) — même schéma clé/valeur que
// l'ancien data store Make, pour rendre la migration triviale.
//
// Contrairement au scénario Make (5 opérations Make par contact : recherche,
// lecture quota, envoi, 2 mises à jour), tout l'état est lu UNE fois en
// début de run ; en revanche chaque envoi réussi est aussitôt persisté (voir
// `persister` plus bas), au lieu d'accumuler les écritures pour un unique
// upsert final. Un run du 14/09 avait migré 250 contacts avec le même
// horodatage `sentAt1` à la minute près : arrivés tous en même temps au
// seuil J+4, ils ont fait dépasser le temps d'exécution de la fonction les
// 19 et 20/09 (~200 envois séquentiels d'un coup) et le run a été interrompu
// avant d'avoir rien écrit — silence total, aucune erreur, et un risque de
// double envoi si les mêmes contacts étaient retentés au run suivant sans
// que leur envoi précédent soit su. Écrire immédiatement après chaque envoi,
// plus un plafond `MAX_ENVOIS_PAR_RUN` bornant la durée du run (cf.
// `MAX_PAR_RUN` dans edouard-cron.js), rend chaque envoi définitif dès qu'il
// a lieu et étale un gros arriéré sur plusieurs jours plutôt que de risquer
// de tout reperdre d'un coup.

const SUPABASE_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co';
const TABLE = 'prospection';
const QUOTA_JOUR = 250;
const MAX_ENVOIS_PAR_RUN = 60;

// Templates Brevo (créés le 12/09, mêmes IDs que dans le scénario Make) :
// stage 1 = premier email (nouveaux prospects), stage 2 = relance J+4,
// stage 3 = relance J+6.
const TEMPLATES = { 1: 53, 2: 54, 3: 55 };
const REPLY_TO = 'contact@edl-idf.com';

// Listes Brevo sources des nouveaux prospects (mêmes IDs que le scénario Make).
const LISTES_PROSPECTS = [45, 43, 44, 51, 50, 52, 48];

function fmtJour(d) { return d.toISOString().split('T')[0]; }
function ilYA(jours) { const d = new Date(); d.setDate(d.getDate() - jours); return d; }

async function envoyerTemplate(BREVO_KEY, email, templateId) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
    body: JSON.stringify({
      to: [{ email }],
      replyTo: { email: REPLY_TO },
      templateId
    })
  });
  return resp.ok;
}

async function listerContactsBrevo(BREVO_KEY, listId) {
  const resp = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=1000`, {
    headers: { 'api-key': BREVO_KEY }
  });
  if (!resp.ok) return [];
  const body = await resp.json();
  return (body.contacts || []).map(c => c.email).filter(Boolean);
}

// Upsert immédiat (contact + compteur du jour) après CHAQUE envoi réussi,
// plutôt qu'un batch accumulé écrit une seule fois en fin de run : voir la
// note en tête de fichier sur l'incident du 19-20/09.
async function persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, lignes) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(lignes.map(l => ({ id: l.id, data: l.data, updated_at: new Date().toISOString() })))
  });
  return resp.ok;
}

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET non configuré' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!SUPABASE_SERVICE_KEY || !BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  try {
    const aujourdHui = fmtJour(new Date());
    const seuilStage1 = ilYA(4); // relance J+4
    const seuilStage2 = ilYA(6); // relance J+6

    // Un seul aller-retour pour tout l'état existant (dédoublonnage inclus),
    // au lieu d'une requête par contact comme le faisait Make.
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=id,data&limit=10000`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    if (!resp.ok) throw new Error('Erreur Supabase prospection');
    const rows = await resp.json();

    const etat = new Map(rows.map(r => [r.id, r.data || {}]));
    let quotaCount = (etat.get(`quota:${aujourdHui}`) || {}).quotaCount || 0;

    let envoyes1 = 0, envoyes2 = 0, envoyes3 = 0;
    let envoyesCeRun = 0;
    const erreurs = [];
    const ligneQuota = () => ({ id: `quota:${aujourdHui}`, data: { quotaDate: aujourdHui, quotaCount } });

    // ── Route 1 : relance J+4 (stage 1 → 2) ──
    for (const [id, d] of etat) {
      if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
      if (!d || d.stage !== 1 || d.clickedAt) continue;
      if (!d.sentAt1 || new Date(d.sentAt1) > seuilStage1) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[2]);
        if (ok) {
          quotaCount++;
          envoyes2++;
          envoyesCeRun++;
          const nouvelleDonnee = { ...d, stage: 2, sentAt2: new Date().toISOString() };
          etat.set(id, nouvelleDonnee);
          const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id, data: nouvelleDonnee }, ligneQuota()]);
          if (!ecrit) erreurs.push({ email: d.email || id, etape: 'ecriture-etat-relance-j4' });
        } else {
          erreurs.push({ email: d.email || id, etape: 'relance-j4' });
        }
      } catch (e) { erreurs.push({ email: d.email || id, etape: 'relance-j4', message: e.message }); }
    }

    // ── Route 2 : relance J+6 (stage 2 → 3) ──
    for (const [id, d] of etat) {
      if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
      if (!d || d.stage !== 2 || d.clickedAt) continue;
      if (!d.sentAt2 || new Date(d.sentAt2) > seuilStage2) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[3]);
        if (ok) {
          quotaCount++;
          envoyes3++;
          envoyesCeRun++;
          const nouvelleDonnee = { ...d, stage: 3 };
          etat.set(id, nouvelleDonnee);
          const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id, data: nouvelleDonnee }, ligneQuota()]);
          if (!ecrit) erreurs.push({ email: d.email || id, etape: 'ecriture-etat-relance-j6' });
        } else {
          erreurs.push({ email: d.email || id, etape: 'relance-j6' });
        }
      } catch (e) { erreurs.push({ email: d.email || id, etape: 'relance-j6', message: e.message }); }
    }

    // ── Route 3 : nouveaux prospects (listes Brevo) ──
    for (const listId of LISTES_PROSPECTS) {
      if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
      const emails = await listerContactsBrevo(BREVO_KEY, listId);
      for (const email of emails) {
        if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
        if (etat.has(email)) continue; // déjà contacté (ou en cours dans ce run)
        try {
          const ok = await envoyerTemplate(BREVO_KEY, email, TEMPLATES[1]);
          if (ok) {
            quotaCount++;
            envoyes1++;
            envoyesCeRun++;
            const donnees = { email, stage: 1, sentAt1: new Date().toISOString() };
            etat.set(email, donnees); // marque comme traité pour les listes suivantes
            const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id: email, data: donnees }, ligneQuota()]);
            if (!ecrit) erreurs.push({ email, etape: 'ecriture-etat-nouveau-prospect' });
          } else {
            erreurs.push({ email, etape: 'nouveau-prospect' });
          }
        } catch (e) { erreurs.push({ email, etape: 'nouveau-prospect', message: e.message }); }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      quotaUtilise: quotaCount,
      envoyes: { nouveauxProspects: envoyes1, relanceJ4: envoyes2, relanceJ6: envoyes3 },
      erreurs
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
