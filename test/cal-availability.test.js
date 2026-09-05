// Vérifie que /api/cal-availability construit un appel Cal.com correct pour
// les 14 combinaisons typologie × meublé/nu — sans réseau (fetch mocké), donc
// exécutable en CI. Sert de garde-fou contre la régression qui a touché la
// prod en septembre 2026 : le paramètre timeZone manquant faisait renvoyer
// des créneaux calés sur le fuseau par défaut de Cal.com au lieu de
// Europe/Paris (cf. bd6bf71, PR #29).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/cal-availability.js';
import { CAL_EVENT_MAP, CAL_USERNAME } from '../api/_lib/cal-mapping.js';

const TOUTES_COMBOS = Object.entries(CAL_EVENT_MAP).flatMap(([typo, { meuble, nu }]) => [
  { bienTypo: typo, meuble: 'Meublé', attendu: meuble },
  { bienTypo: typo, meuble: 'Nu', attendu: nu },
]);

const fetchOriginal = global.fetch;
const envOriginal = process.env.CAL_API_KEY;

function reponseCalMock() {
  return {
    ok: true,
    json: async () => ({ status: 'success', data: {} }),
  };
}

function requete(params) {
  const qs = new URLSearchParams({ debug: '1', ...params }).toString();
  return { url: `https://x.test/api/cal-availability?${qs}`, method: 'GET', headers: new Headers() };
}

test.beforeEach(() => {
  process.env.CAL_API_KEY = 'test-key';
});

test.after(() => {
  global.fetch = fetchOriginal;
  if (envOriginal === undefined) delete process.env.CAL_API_KEY;
  else process.env.CAL_API_KEY = envOriginal;
});

test('les 14 combinaisons typologie × meublé/nu sont couvertes', () => {
  assert.equal(TOUTES_COMBOS.length, 14);
});

for (const { bienTypo, meuble, attendu } of TOUTES_COMBOS) {
  test(`${bienTypo} ${meuble} : appel Cal.com correctement formé`, async () => {
    let urlAppelee = null;
    global.fetch = async (u) => { urlAppelee = u; return reponseCalMock(); };

    const resp = await handler(requete({ bienTypo, meuble }));
    const body = await resp.json();

    assert.equal(resp.status, 200);
    assert.equal(body.configured, true, `type de bien non reconnu pour ${bienTypo}/${meuble}`);
    assert.equal(body.dureeMinutes, attendu.duree);

    assert.ok(urlAppelee, 'fetch aurait dû être appelé');
    const params = new URL(urlAppelee).searchParams;
    // Régression cible : sans ce paramètre, Cal.com renvoie des créneaux dans
    // son fuseau par défaut au lieu de l'heure de Paris.
    assert.equal(params.get('timeZone'), 'Europe/Paris');
    assert.equal(params.get('eventTypeSlug'), attendu.slug);
    assert.equal(params.get('username'), CAL_USERNAME);
  });
}

test('mois explicite : renvoie exactement les bornes de ce mois calendaire (Paris)', async () => {
  let urlAppelee = null;
  global.fetch = async (u) => { urlAppelee = u; return reponseCalMock(); };

  // Octobre 2026 : la France passe en heure d'hiver le 25/10, donc le 1er
  // octobre est encore en CEST (UTC+2) et le 1er novembre déjà en CET (UTC+1)
  // — un bon test que les deux bornes sont calculées indépendamment.
  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2026-10' }));
  const body = await resp.json();

  assert.equal(body.mois, '2026-10');
  assert.equal(body.fenetreDebut, '2026-09-30T22:00:00.000Z');
  assert.equal(body.fenetreFin, '2026-10-31T23:00:00.000Z');
  assert.equal(new URL(urlAppelee).searchParams.get('start'), '2026-09-30T22:00:00.000Z');
  assert.equal(new URL(urlAppelee).searchParams.get('end'), '2026-10-31T23:00:00.000Z');
  assert.equal(new URL(urlAppelee).searchParams.get('timeZone'), 'Europe/Paris');
});

test('un mois déjà révolu est ramené au mois courant', async () => {
  global.fetch = async () => reponseCalMock();

  const respCourant = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const bodyCourant = await respCourant.json();

  const respPasse = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2020-01' }));
  const bodyPasse = await respPasse.json();

  assert.equal(bodyPasse.mois, bodyCourant.mois);
});

test('décembre → janvier : le changement d\'année est géré', async () => {
  global.fetch = async () => reponseCalMock();

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', mois: '2026-12' }));
  const body = await resp.json();

  assert.equal(body.mois, '2026-12');
  assert.equal(body.fenetreFin, '2026-12-31T23:00:00.000Z'); // 1er janvier 2027 à Paris (CET, UTC+1)
});

test('type de bien non reconnu : repli sans appeler Cal.com', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return reponseCalMock(); };

  const resp = await handler(requete({ bienTypo: 'Garage', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.configured, false);
  assert.equal(appele, false);
});

test('CAL_API_KEY absente : repli sans appeler Cal.com', async () => {
  delete process.env.CAL_API_KEY;
  let appele = false;
  global.fetch = async () => { appele = true; return reponseCalMock(); };

  const resp = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const body = await resp.json();

  assert.equal(body.configured, false);
  assert.equal(appele, false);
});
