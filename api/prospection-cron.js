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
// début de run et écrit UNE fois en fin de run (upsert group), ce qui évite
// à la fois l'explosion de coût et la course "clé en double" déjà rencontrée
// avec Make sur un envoi concurrent.

const SUPABASE_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co';
const TABLE = 'prospection';
const QUOTA_JOUR = 250;

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

    const ecritures = []; // upserts à appliquer en fin de run
    let envoyes1 = 0, envoyes2 = 0, envoyes3 = 0;
    const erreurs = [];

    // ── Route 1 : relance J+4 (stage 1 → 2) ──
    for (const [id, d] of etat) {
      if (quotaCount >= QUOTA_JOUR) break;
      if (!d || d.stage !== 1 || d.clickedAt) continue;
      if (!d.sentAt1 || new Date(d.sentAt1) > seuilStage1) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[2]);
        if (ok) {
          quotaCount++;
          envoyes2++;
          ecritures.push({ id, data: { ...d, stage: 2, sentAt2: new Date().toISOString() } });
        } else {
          erreurs.push({ email: d.email || id, etape: 'relance-j4' });
        }
      } catch (e) { erreurs.push({ email: d.email || id, etape: 'relance-j4', message: e.message }); }
    }

    // ── Route 2 : relance J+6 (stage 2 → 3) ──
    for (const [id, d] of etat) {
      if (quotaCount >= QUOTA_JOUR) break;
      if (!d || d.stage !== 2 || d.clickedAt) continue;
      if (!d.sentAt2 || new Date(d.sentAt2) > seuilStage2) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[3]);
        if (ok) {
          quotaCount++;
          envoyes3++;
          ecritures.push({ id, data: { ...d, stage: 3 } });
        } else {
          erreurs.push({ email: d.email || id, etape: 'relance-j6' });
        }
      } catch (e) { erreurs.push({ email: d.email || id, etape: 'relance-j6', message: e.message }); }
    }

    // ── Route 3 : nouveaux prospects (listes Brevo) ──
    for (const listId of LISTES_PROSPECTS) {
      if (quotaCount >= QUOTA_JOUR) break;
      const emails = await listerContactsBrevo(BREVO_KEY, listId);
      for (const email of emails) {
        if (quotaCount >= QUOTA_JOUR) break;
        if (etat.has(email)) continue; // déjà contacté (ou en cours dans ce run)
        try {
          const ok = await envoyerTemplate(BREVO_KEY, email, TEMPLATES[1]);
          if (ok) {
            quotaCount++;
            envoyes1++;
            const donnees = { email, stage: 1, sentAt1: new Date().toISOString() };
            etat.set(email, donnees); // marque comme traité pour les listes suivantes
            ecritures.push({ id: email, data: donnees });
          } else {
            erreurs.push({ email, etape: 'nouveau-prospect' });
          }
        } catch (e) { erreurs.push({ email, etape: 'nouveau-prospect', message: e.message }); }
      }
    }

    // Compteur du jour, écrit une seule fois à la fin.
    ecritures.push({ id: `quota:${aujourdHui}`, data: { quotaDate: aujourdHui, quotaCount } });

    if (ecritures.length) {
      const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(ecritures.map(e => ({ id: e.id, data: e.data, updated_at: new Date().toISOString() })))
      });
      if (!upsertResp.ok) {
        const err = await upsertResp.text();
        erreurs.push({ etape: 'ecriture-etat', message: err });
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
