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

test('la pagination (decalage) avance la fenêtre sans repasser par timeZone', async () => {
  let urlAppelee = null;
  global.fetch = async (u) => { urlAppelee = u; return reponseCalMock(); };

  const respBase = await handler(requete({ bienTypo: 'T1', meuble: 'Nu' }));
  const bodyBase = await respBase.json();

  const respDecalee = await handler(requete({ bienTypo: 'T1', meuble: 'Nu', decalage: '14' }));
  const bodyDecalee = await respDecalee.json();

  assert.ok(new Date(bodyDecalee.fenetreDebut) > new Date(bodyBase.fenetreDebut));
  assert.equal(new URL(urlAppelee).searchParams.get('timeZone'), 'Europe/Paris');
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
