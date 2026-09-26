// api/_lib/prospects-sync.js : relie la séquence de prospection email
// (table "prospection") au pipeline commercial (table "prospects", voir
// js/app-config.js / PROSP_STAGES). Zone à risque : une régression ici
// pourrait faire reculer une carte déjà avancée (ex. un "RDV planifié"
// repoussé à "Email ouvert" par un clic tardif), ou écrire dans le pipeline
// d'un autre abonné si la résolution du user_id est mal câblée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resoudreAdminUserId, avancerEtapeProspect, ETAPE_ORDER } from '../api/_lib/prospects-sync.js';

const SUPABASE_URL = 'https://x.test';
const KEY = 'service-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('resoudreAdminUserId : renvoie le user_id trouvé dans settings', async () => {
  global.fetch = async (url) => {
    assert.ok(String(url).includes('/rest/v1/settings'));
    assert.ok(String(url).includes('contact@edl-idf.com'));
    return { ok: true, json: async () => [{ user_id: 'u1' }] };
  };
  assert.equal(await resoudreAdminUserId(SUPABASE_URL, KEY), 'u1');
});

test('resoudreAdminUserId : renvoie une chaîne vide si la requête échoue (best-effort)', async () => {
  global.fetch = async () => { throw new Error('réseau HS'); };
  assert.equal(await resoudreAdminUserId(SUPABASE_URL, KEY), '');
});

test('avancerEtapeProspect : ne fait rien sans email ni userId', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };
  await avancerEtapeProspect(SUPABASE_URL, KEY, '', 'x@agence.fr', 'email_envoye');
  await avancerEtapeProspect(SUPABASE_URL, KEY, 'u1', '', 'email_envoye');
  assert.equal(appele, false);
});

test('avancerEtapeProspect : crée une carte quand le prospect est inconnu', async () => {
  let ecriture = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospects') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'POST') {
      ecriture = JSON.parse(opts.body)[0];
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };
  await avancerEtapeProspect(SUPABASE_URL, KEY, 'u1', 'nouveau@agence.fr', 'email_envoye');
  assert.equal(ecriture.data.email, 'nouveau@agence.fr');
  assert.equal(ecriture.data.etape, 'email_envoye');
  assert.equal(ecriture.user_id, 'u1', 'doit appartenir au bon abonné (RLS)');
});

test('avancerEtapeProspect : fait avancer une carte existante vers une étape plus engagée', async () => {
  let patch = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospects') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => [{ id: 'p1', data: { agence: 'Agence X', email: 'x@agence.fr', etape: 'a_contacter' } }] };
    }
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'PATCH') {
      patch = JSON.parse(opts.body);
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };
  await avancerEtapeProspect(SUPABASE_URL, KEY, 'u1', 'x@agence.fr', 'email_ouvert');
  assert.equal(patch.data.etape, 'email_ouvert');
  assert.equal(patch.data.agence, 'Agence X', 'ne doit pas perdre les champs existants');
});

test('avancerEtapeProspect : ne fait jamais reculer une carte déjà plus avancée', async () => {
  let patchAppele = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospects') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => [{ id: 'p1', data: { agence: 'Agence X', etape: 'rdv_planifie' } }] };
    }
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'PATCH') {
      patchAppele = true;
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };
  await avancerEtapeProspect(SUPABASE_URL, KEY, 'u1', 'x@agence.fr', 'email_ouvert');
  assert.equal(patchAppele, false, 'un clic tardif ne doit pas repousser un RDV déjà planifié à "Email ouvert"');
});

test('ETAPE_ORDER : "negociation" est bien entre "devis_envoye" et "gagne"', () => {
  const i = (k) => ETAPE_ORDER.indexOf(k);
  assert.ok(i('devis_envoye') < i('negociation'));
  assert.ok(i('negociation') < i('gagne'));
});
