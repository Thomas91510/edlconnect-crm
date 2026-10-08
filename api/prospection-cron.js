export const config = { runtime: 'edge' };

import { resoudreAdminUserId, avancerEtapeProspect } from './_lib/prospects-sync.js';
import { contactExclu, domaineExclu, estCandidatStock, nomAgencePourEmail } from './_lib/prospection-regles.js';

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

// Templates Brevo de la séquence v2 (08/10, courts, signés Thomas, nom de
// l'agence en paramètre AGENCE) : stage 1 = premier email, stage 2 = relance
// J+4, stage 3 = dernier message J+10. Remplacent les 53/54/55 (mise en page
// newsletter, 0 réponse sur 256 envois). Ils doivent être actifs dans Brevo.
const TEMPLATES = { 1: 59, 2: 57, 3: 58 };
const REPLY_TO = 'contact@edl-idf.com';

// Listes Brevo sources des nouveaux prospects : une liste "Agence <département>"
// par département d'Île-de-France (75, 91, 92, 93, 94, 95, 78, 77). La 49
// (Seine-et-Marne) manquait depuis la reprise du scénario Make ; Eure (47) et
// Oise (46) sont hors zone et vidées le 08/10.
const LISTES_PROSPECTS = [45, 43, 44, 51, 50, 52, 48, 49];

// Premiers emails à de nouveaux prospects (listes Brevo comme pipeline CRM) :
// coupés tant que la variable Vercel PROSPECTION_PIPELINE_ACTIF ne vaut pas
// "true". Thomas veut relire le modèle Brevo n°53 et assainir les bases avant
// tout envoi ; les relances J+4/J+6 des prospects déjà contactés, elles,
// continuent.
function nouveauxProspectsActifs() { return process.env.PROSPECTION_PIPELINE_ACTIF === 'true'; }

// Un prospect qui a répondu (intéressé ou non) ou demandé sa désinscription
// ne doit plus recevoir les relances automatiques J+4/J+6. Posé par l'agent
// IA de prospection (agents/prospection/INSTRUCTIONS.md) dans la ligne
// "prospection" du contact : { stoppedAt, stopReason }.
function sequenceStoppee(d) { return !!(d && d.stoppedAt); }

// PostgREST plafonne chaque réponse (1000 lignes par défaut chez Supabase) :
// on pagine pour lire les ~2 600 contacts et ~2 200 fiches "À contacter".
// Renvoie null en cas d'erreur, pour que l'appelant échoue fermé (aucun
// nouvel envoi) plutôt que de prospecter sans la liste d'exclusion.
async function lireTout(url, SUPABASE_SERVICE_KEY) {
  const PAGE = 1000;
  const lignes = [];
  for (let offset = 0; offset < 20000; offset += PAGE) {
    const resp = await fetch(`${url}&limit=${PAGE}&offset=${offset}`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    if (!resp.ok) return null;
    const page = await resp.json();
    lignes.push(...page);
    if (page.length < PAGE) break;
  }
  return lignes;
}

// Emails à ne jamais prospecter : clients, partenaires, inactifs et
// adresses blacklistées de la table "contacts" (voir prospection-regles.js).
async function emailsExclus(SUPABASE_SERVICE_KEY) {
  const contacts = await lireTout(
    `${SUPABASE_URL}/rest/v1/contacts?select=email:data->>email,bl:data->>emailBlacklisted,statut:data->>statut`,
    SUPABASE_SERVICE_KEY
  );
  if (!contacts) return null;
  return new Set(contacts.filter(contactExclu).map(c => String(c.email || '').trim().toLowerCase()).filter(Boolean));
}

// Fiches du pipeline "À contacter" envoyables (vraies agences, voir
// estCandidatStock), cabinets de gestion / syndics et petite couronne en
// premier : ce sont les cibles qui commandent le plus d'états des lieux.
async function candidatsStock(SUPABASE_SERVICE_KEY, adminUserId) {
  const rows = await lireTout(
    `${SUPABASE_URL}/rest/v1/prospects?select=data&user_id=eq.${encodeURIComponent(adminUserId)}&data->>etape=eq.a_contacter&order=id`,
    SUPABASE_SERVICE_KEY
  );
  if (!rows) return [];
  const score = p => (/gestion|syndic|administrat|patrimoine/i.test(p.agence || '') ? 2 : 0)
    + (['75', '92', '93', '94'].includes(String(p.dept || '').trim()) ? 1 : 0);
  return rows.map(r => r.data || {}).filter(estCandidatStock).sort((a, b) => score(b) - score(a));
}

function fmtJour(d) { return d.toISOString().split('T')[0]; }
function ilYA(jours) { const d = new Date(); d.setDate(d.getDate() - jours); return d; }

async function envoyerTemplate(BREVO_KEY, email, templateId, agence) {
  const corps = { to: [{ email }], replyTo: { email: REPLY_TO }, templateId };
  if (agence) corps.params = { AGENCE: agence };
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
    body: JSON.stringify(corps)
  });
  return resp.ok;
}

// Brevo plafonne cette route à 500 contacts par page. L'ancien appel en
// limit=1000 était rejeté par Brevo et lu comme une liste vide : du 14/09 au
// 08/10, aucun des ~980 contacts des listes n'a reçu de premier email, seules
// les relances partaient. On pagine désormais par tranches de 500.
async function listerContactsBrevo(BREVO_KEY, listId) {
  const PAGE = 500;
  const contacts = [];
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const resp = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=${PAGE}&offset=${offset}`, {
      headers: { 'api-key': BREVO_KEY }
    });
    if (!resp.ok) break;
    const body = await resp.json();
    const page = body.contacts || [];
    contacts.push(...page.filter(c => c.email).map(c => ({ email: c.email, societe: (c.attributes || {}).COMPANY_NAME || '' })));
    if (page.length < PAGE) break;
  }
  return contacts;
}

// Nom d'agence de chaque email connu du pipeline CRM, pour personnaliser
// les emails (relances comprises). Best-effort : sans lui, les modèles
// affichent "chez vous" / "votre agence".
async function nomsAgences(SUPABASE_SERVICE_KEY, adminUserId) {
  if (!adminUserId) return new Map();
  const rows = await lireTout(
    `${SUPABASE_URL}/rest/v1/prospects?select=email:data->>email,agence:data->>agence&user_id=eq.${encodeURIComponent(adminUserId)}&order=id`,
    SUPABASE_SERVICE_KEY
  );
  const noms = new Map();
  for (const r of rows || []) {
    const email = String(r.email || '').trim().toLowerCase();
    const nom = nomAgencePourEmail(r.agence, email);
    if (email && nom) noms.set(email, nom);
  }
  return noms;
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

    // Résolu une fois pour tout le run : premier envoi à un nouveau prospect
    // (route 3 plus bas) fait aussi avancer sa carte dans le pipeline
    // commercial (table "prospects") — jusqu'ici les deux tables ne se
    // parlaient pas du tout.
    const adminUserId = await resoudreAdminUserId(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const agences = await nomsAgences(SUPABASE_SERVICE_KEY, adminUserId);
    const agenceDe = email => agences.get(String(email || '').trim().toLowerCase()) || '';

    let envoyes1 = 0, envoyes2 = 0, envoyes3 = 0;
    let envoyesCeRun = 0;
    const erreurs = [];
    const ligneQuota = () => ({ id: `quota:${aujourdHui}`, data: { quotaDate: aujourdHui, quotaCount } });

    // ── Route 1 : relance J+4 (stage 1 → 2) ──
    for (const [id, d] of etat) {
      if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
      if (!d || d.stage !== 1 || d.clickedAt || sequenceStoppee(d)) continue;
      if (!d.sentAt1 || new Date(d.sentAt1) > seuilStage1) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[2], agenceDe(d.email || id));
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
      if (!d || d.stage !== 2 || d.clickedAt || sequenceStoppee(d)) continue;
      if (!d.sentAt2 || new Date(d.sentAt2) > seuilStage2) continue;
      try {
        const ok = await envoyerTemplate(BREVO_KEY, d.email || id, TEMPLATES[3], agenceDe(d.email || id));
        if (ok) {
          quotaCount++;
          envoyes3++;
          envoyesCeRun++;
          const nouvelleDonnee = { ...d, stage: 3, sentAt3: new Date().toISOString() };
          etat.set(id, nouvelleDonnee);
          const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id, data: nouvelleDonnee }, ligneQuota()]);
          if (!ecrit) erreurs.push({ email: d.email || id, etape: 'ecriture-etat-relance-j6' });
        } else {
          erreurs.push({ email: d.email || id, etape: 'relance-j6' });
        }
      } catch (e) { erreurs.push({ email: d.email || id, etape: 'relance-j6', message: e.message }); }
    }

    // Liste d'exclusion lue une fois ; si elle est illisible, aucun nouveau
    // prospect n'est contacté ce jour-là (les relances, elles, continuent).
    const exclus = await emailsExclus(SUPABASE_SERVICE_KEY);
    const envoyable = email => exclus && !domaineExclu(email) && !exclus.has(String(email).trim().toLowerCase());
    if (!exclus) erreurs.push({ etape: 'lecture-liste-exclusion' });

    // ── Route 3 : nouveaux prospects (listes Brevo) ──
    for (const listId of LISTES_PROSPECTS) {
      if (!exclus || !nouveauxProspectsActifs()) break;
      if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
      const contacts = await listerContactsBrevo(BREVO_KEY, listId);
      for (const { email, societe } of contacts) {
        if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
        if (etat.has(email)) continue; // déjà contacté (ou en cours dans ce run)
        if (!envoyable(email)) continue;
        try {
          const ok = await envoyerTemplate(BREVO_KEY, email, TEMPLATES[1], agenceDe(email) || nomAgencePourEmail(societe, email));
          if (ok) {
            quotaCount++;
            envoyes1++;
            envoyesCeRun++;
            const donnees = { email, stage: 1, sentAt1: new Date().toISOString() };
            etat.set(email, donnees); // marque comme traité pour les listes suivantes
            const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id: email, data: donnees }, ligneQuota()]);
            if (!ecrit) erreurs.push({ email, etape: 'ecriture-etat-nouveau-prospect' });
            await avancerEtapeProspect(SUPABASE_URL, SUPABASE_SERVICE_KEY, adminUserId, email, 'email_envoye');
          } else {
            erreurs.push({ email, etape: 'nouveau-prospect' });
          }
        } catch (e) { erreurs.push({ email, etape: 'nouveau-prospect', message: e.message }); }
      }
    }

    // ── Route 4 : fiches "À contacter" du pipeline CRM ──
    // ~750 agences d'Île-de-France assainies et enrichies le 08/10 attendent
    // en "À contacter" dans le CRM, souvent absentes des listes Brevo.
    let envoyesStock = 0;
    if (nouveauxProspectsActifs() && exclus && adminUserId && quotaCount < QUOTA_JOUR && envoyesCeRun < MAX_ENVOIS_PAR_RUN) {
      for (const p of await candidatsStock(SUPABASE_SERVICE_KEY, adminUserId)) {
        if (quotaCount >= QUOTA_JOUR || envoyesCeRun >= MAX_ENVOIS_PAR_RUN) break;
        const email = String(p.email).trim().toLowerCase();
        if (etat.has(email) || !envoyable(email)) continue;
        try {
          const ok = await envoyerTemplate(BREVO_KEY, email, TEMPLATES[1], nomAgencePourEmail(p.agence, email));
          if (ok) {
            quotaCount++;
            envoyes1++;
            envoyesStock++;
            envoyesCeRun++;
            const donnees = { email, stage: 1, sentAt1: new Date().toISOString(), source: 'pipeline' };
            etat.set(email, donnees);
            const ecrit = await persister(SUPABASE_URL, SUPABASE_SERVICE_KEY, [{ id: email, data: donnees }, ligneQuota()]);
            if (!ecrit) erreurs.push({ email, etape: 'ecriture-etat-stock' });
            await avancerEtapeProspect(SUPABASE_URL, SUPABASE_SERVICE_KEY, adminUserId, email, 'email_envoye');
          } else {
            erreurs.push({ email, etape: 'stock' });
          }
        } catch (e) { erreurs.push({ email, etape: 'stock', message: e.message }); }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      quotaUtilise: quotaCount,
      envoyes: { nouveauxProspects: envoyes1, dontPipeline: envoyesStock, relanceJ4: envoyes2, relanceJ6: envoyes3 },
      erreurs
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
