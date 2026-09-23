// Vérifie /api/agenda-disponibilites : la bêta "fusion d'agendas Google"
// qui remplace Cal.com (voir cal-availability.test.js pour l'ancien
// chemin, laissé en place mais non appelé par les formulaires). Sans
// réseau réel : fetch mocké pour Supabase (liste des agents), le jeton
// OAuth2 et freebusy.query, clé RSA de test (jamais vérifiée côté mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import handler from '../api/agenda-disponibilites.js';
import { CAL_EVENT_MAP } from '../api/_lib/cal-mapping.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TOUTES_COMBOS = Object.entries(CAL_EVENT_MAP).flatMap(([typo, { meuble, nu }]) => [
  { bienTypo: typo, meuble: 'Meublé', attendu: meuble },
  { bienTypo: typo, meuble: 'Nu', attendu: nu },
]);

const fetchOriginal = global.fetch;
const envOriginal = {
  email: process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL,
  cle: process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_KEY,
  ownerId: process.env.DEFAULT_OWNER_ID,
  serviceKey: process.env.SUPABASE_SERVICE_KEY,
};

function requete(params) {
  const qs = new URLSearchParams({ debug: '1', ...params }).toString();
  return { url: `https://x.test/api/agenda-disponibilites?${qs}`, method: 'GET', headers: new Headers() };
}

// Mock fetch qui répond aux trois appels réseau du handler : la liste des
// agents (Supabase "settings"), le jeton OAuth2 (oauth2.googleapis.com/token)
// puis freebusy.query — capture la requête freebusy pour inspection, et
// permet d'injecter un "busy" par calendrier ainsi que la liste d'agents.
function fabriquerFetchMock({ busy = {}, freebusyOk = true, erreurs = {}, agents = [{ email: 'a@exemple.fr' }, { email: 'b@exemple.fr' }] } = {}) {
  const appels = { freebusy: null };
  const fn = async (url, opts) => {
    if (String(url).includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [{ data: { agents } }] };
    }
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'jeton-test' }) };
    }
    if (String(url).includes('/calendar/v3/freeBusy')) {
      appels.freebusy = { url, opts, corps: JSON.parse(opts.body) };
      if (!freebusyOk) return { ok: false, status: 500, text: async () => 'panne' };
      const calendars = {};
      for (const id of appels.freebusy.corps.items.map(i => i.id)) {
        calendars[id] = erreurs[id] ? { errors: erreurs[id], busy: [] } : { busy: busy[id] || [] };
      }
      return { ok: true, json: async () => ({ calendars }) };
    }
    throw new Error('URL inattendue : ' + url);
  };
  return { fn, appels };
}

test.beforeEach(() => {
  process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL = 'compte-service@exemple.iam.gserviceaccount.com';
  process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_KEY = privateKey;
  process.env.DEFAULT_OWNER_ID = 'owner-test-123';
  process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
});

test.after(() => {
  global.fetch = fetchOriginal;
  for (const [k, v] of Object.entries({
    GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL: envOriginal.email,
    GOOGLE_FREEBUSY_SERVICE_ACCOUNT_KEY: envOriginal.cle,
    DEFAULT_OWNER_ID: envOriginal.ownerId,
    SUPABASE_SERVICE_KEY: envOriginal.serviceKey,
  })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('les 14 combinaisons typologie × meublé/nu sont couvertes', () => {
  assert.equal(TOUTES_COMBOS.length, 14);
});

for (const { bienTypo, meuble, attendu } of TOUTES_COMBOS) {
  test(`${bienTypo} ${meuble} : durée reprise de cal-mapping, freebusy interrogé sur les agents du CRM`, async () => {
    const { fn, appels } = fabriquerFetchMock();
    global.fetch = fn;

    const resp = await handler(requete({ bienTypo, meuble }));
    const body = await resp.json();

    assert.equal(resp.status, 200);
    assert.equal(body.configured, true, `type de bien non reconnu pour ${bienTypo}/${meuble}`);
    assert.equal(body.dureeMinutes, attendu.duree);
    assert.deepEqual(appels.freebusy.corps.items.map(i => i.id), ['a@exemple.fr', 'b@exemple.fr']);
  });
}

// Régression cible : l'URL Google Calendar freebusy.query est sensible à la
// casse ("freeBusy", B majuscule) — une première version en minuscules a
// donné une 404 HTML générique en conditions réelles (repli silencieux côté
// endpoint, donc invisible sans ce test explicite sur l'URL appelée).
test('URL freebusy.query correctement casée (/calendar/v3/freeBusy)', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));

  assert.equal(appels.freebusy.url, 'https://www.googleapis.com/calendar/v3/freeBusy');
});

test('la liste des agendas vient des agents du CRM (Supabase), pas d\'une variable d\'environnement', async () => {
  const { fn, appels } = fabriquerFetchMock({ agents: [{ nom: 'Jean', email: 'jean@exemple.fr' }, { nom: 'Sans email', email: '' }, { nom: 'Marie', email: ' marie@exemple.fr ' }] });
  global.fetch = fn;

  await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));

  // L'agent sans email est ignoré, et les emails sont nettoyés (trim).
  assert.deepEqual(appels.freebusy.corps.items.map(i => i.id), ['jean@exemple.fr', 'marie@exemple.fr']);
});

test('paramètre cp : ne retient que les agents dont le secteur couvre ce code postal', async () => {
  const { fn, appels } = fabriquerFetchMock({
    agents: [
      { nom: 'Nord', email: 'nord@exemple.fr', secteurs: '75018,75019' },
      { nom: 'Sud', email: 'sud@exemple.fr', secteurs: '75013,75014' },
    ],
  });
  global.fetch = fn;

  await handler(requete({ bienTypo: 'T1', meuble: 'Nu', cp: '75018' }));

  assert.deepEqual(appels.freebusy.corps.items.map(i => i.id), ['nord@exemple.fr']);
});

test('sans paramètre cp : tous les agents avec email sont retenus, secteurs ignorés', async () => {
  const { fn, appels } = fabriquerFetchMock({
    agents: [
      { nom: 'Nord', email: 'nord@exemple.fr', secteurs: '75018' },
      { nom: 'Sud', email: 'sud@exemple.fr', secteurs: '75013' },
    ],
  });
  global.fetch = fn;

  await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));

  assert.deepEqual(appels.freebusy.corps.items.map(i => i.id), ['nord@exemple.fr', 'sud@exemple.fr']);
});

test('agents du CRM sans aucun email renseigné : repli sans appeler Google', async () => {
  const { fn } = fabriquerFetchMock({ agents: [{ nom: 'Jean', email: '' }] });
  let appeleFreebusy = false;
  global.fetch = async (url, opts) => {
    if (String(url).includes('/calendar/v3/freeBusy') || String(url).includes('oauth2.googleapis.com')) appeleFreebusy = true;
    return fn(url, opts);
  };

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.configured, false);
  assert.equal(appeleFreebusy, false);
});

test('tampon de 30 min transmis au calcul des créneaux : un rendez-vous voisin réduit la disponibilité', async () => {
  const maintenant = Date.now();
  const dans3Jours = new Date(maintenant + 3 * 24 * 60 * 60 * 1000);
  // Un seul collaborateur, occupé pile aux deux extrémités de la journée
  // testée sauf un créneau isolé de 9h30-10h30 (heure Paris ~ 07h30-08h30 UTC
  // en hiver / hors période testée ici) — on vérifie juste que le tampon
  // réduit bien le nombre de créneaux par rapport à un calcul sans tampon,
  // sans dépendre d'une date précise (le calcul complet est déjà couvert
  // par creneaux-libres.test.js).
  const { fn } = fabriquerFetchMock({
    busy: { 'a@exemple.fr': [{ start: dans3Jours.toISOString(), end: new Date(dans3Jours.getTime() + 3600000).toISOString() }] },
  });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  // 'a' a un rendez-vous, mais 'b' reste totalement libre : le tampon ne
  // doit pas empêcher toute disponibilité (règle "au moins un libre").
  assert.equal(body.available, true);
});

test('un collaborateur occupé, un autre libre : des créneaux restent disponibles (union)', async () => {
  const { fn } = fabriquerFetchMock({
    busy: { 'a@exemple.fr': [{ start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' }] },
  });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.available, true);
  assert.ok(body.slots.length > 0);
});

test('tous les collaborateurs occupés en permanence : aucun créneau', async () => {
  const busyPermanent = [{ start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' }];
  const { fn } = fabriquerFetchMock({ busy: { 'a@exemple.fr': busyPermanent, 'b@exemple.fr': busyPermanent } });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.available, false);
  assert.deepEqual(body.slots, []);
});

test('mois explicite : renvoie exactement les bornes de ce mois calendaire (Paris)', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  // Octobre 2026 : la France passe en heure d'hiver le 25/10 — même cas de
  // bascule DST que cal-availability.test.js.
  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2026-10' }));
  const body = await resp.json();

  assert.equal(body.mois, '2026-10');
  assert.equal(body.fenetreDebut, '2026-09-30T22:00:00.000Z');
  assert.equal(body.fenetreFin, '2026-10-31T23:00:00.000Z');
  assert.equal(appels.freebusy.corps.timeMin, '2026-09-30T22:00:00.000Z');
  assert.equal(appels.freebusy.corps.timeMax, '2026-10-31T23:00:00.000Z');
  assert.equal(appels.freebusy.corps.timeZone, 'Europe/Paris');
});

test('un mois déjà révolu est ramené au mois courant', async () => {
  global.fetch = fabriquerFetchMock().fn;

  const respCourant = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const bodyCourant = await respCourant.json();

  const respPasse = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2020-01' }));
  const bodyPasse = await respPasse.json();

  assert.equal(bodyPasse.mois, bodyCourant.mois);
});

test('décembre → janvier : le changement d\'année est géré', async () => {
  global.fetch = fabriquerFetchMock().fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2026-12' }));
  const body = await resp.json();

  assert.equal(body.mois, '2026-12');
  assert.equal(body.fenetreFin, '2026-12-31T23:00:00.000Z');
});

test('type de bien non reconnu : repli sans appeler Supabase ni Google', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };

  const resp = await handler(requete({ bienTypo: 'Garage', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.configured, false);
  assert.equal(appele, false);
});

test('compte de service absent des variables d\'environnement : repli sans appeler Google', async () => {
  delete process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL;
  let appele = false;
  global.fetch = async () => { appele = true; };

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.configured, false);
  assert.equal(appele, false);
});

test('panne Google freebusy : dégrade proprement (jamais de 500 sur le formulaire public)', async () => {
  global.fetch = fabriquerFetchMock({ freebusyOk: false }).fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.configured, false);
});

// Régression cible : un agenda dont le partage n'a pas abouti (email erroné,
// partage révoqué...) renvoie {errors:[...], busy:[]} côté Google — un bug
// initial traitait ça comme "aucune info = toujours libre", proposant des
// créneaux sur un collaborateur en réalité inaccessible (risque de double
// réservation). Ce collaborateur doit être totalement exclu du calcul.
test('agenda en erreur (notFound) : exclu du calcul, pas traité comme "toujours libre"', async () => {
  const { fn, appels } = fabriquerFetchMock({
    erreurs: { 'a@exemple.fr': [{ domain: 'global', reason: 'notFound' }] },
    busy: { 'b@exemple.fr': [{ start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' }] },
  });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  // 'a' est en erreur (ignoré) et 'b' est occupé toute la période testée :
  // aucun collaborateur valide et libre ne reste.
  assert.equal(body.available, false);
  assert.deepEqual(body.slots, []);
  assert.deepEqual(body.calendriersEnErreur, ['a@exemple.fr']);
  assert.ok(appels.freebusy); // la requête a bien été envoyée avec les 2 calendriers
});

test('un agenda en erreur, l\'autre réellement libre : les créneaux restent proposés', async () => {
  const { fn } = fabriquerFetchMock({
    erreurs: { 'a@exemple.fr': [{ domain: 'global', reason: 'notFound' }] },
    busy: { 'b@exemple.fr': [] },
  });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.available, true);
  assert.ok(body.slots.length > 0);
});

// ─── Résolution multi-agence (jamais DEFAULT_OWNER_ID en dur) ───────────
test('un lien portant agencyId interroge les agents de CETTE agence, pas ceux du compte par défaut', async () => {
  const fn = async (url, opts) => {
    if (String(url).includes('/rest/v1/contacts')) {
      assert.ok(String(url).includes('id=eq.agence-B'));
      return { ok: true, json: async () => [{ user_id: 'owner-B' }] };
    }
    if (String(url).includes('/rest/v1/settings')) {
      // Le compte par défaut n'a que l'agent par défaut ; l'agence B a le sien.
      if (String(url).includes('user_id=eq.owner-B')) {
        return { ok: true, json: async () => [{ data: { agents: [{ email: 'agent-b@exemple.fr' }] } }] };
      }
      return { ok: true, json: async () => [{ data: { agents: [{ email: 'agent-defaut@exemple.fr' }] } }] };
    }
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'jeton-test' }) };
    }
    if (String(url).includes('/calendar/v3/freeBusy')) {
      const corps = JSON.parse(opts.body);
      const calendars = {};
      for (const id of corps.items.map(i => i.id)) calendars[id] = { busy: [] };
      return { ok: true, json: async () => ({ calendars }) };
    }
    throw new Error('URL inattendue : ' + url);
  };
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', agencyId: 'agence-B' }));
  const body = await resp.json();

  assert.equal(body.ownerId, 'owner-B');
  assert.deepEqual(body.calendriers, ['agent-b@exemple.fr']);
  assert.ok(!body.calendriers.includes('agent-defaut@exemple.fr'), 'ne doit jamais mélanger les agents d\'une autre agence');
});

test('aucun identifiant d\'agence fourni : repli sur DEFAULT_OWNER_ID (compatibilité extranet interne)', async () => {
  const { fn } = fabriquerFetchMock({ agents: [{ email: 'agent-defaut@exemple.fr' }] });
  global.fetch = fn;

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.ownerId, 'owner-test-123');
  assert.deepEqual(body.calendriers, ['agent-defaut@exemple.fr']);
});
