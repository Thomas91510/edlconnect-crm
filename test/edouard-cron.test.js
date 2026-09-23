// edouard-cron.js : rapatrie les rapports Edouard vers les missions du CRM.
// Un meme logement Edouard accumule les EDL de tous les locataires successifs
// (entree, sortie, entree du suivant, ...) : sans filtre par type et par date,
// la premiere synchro d'une mission neuve sur un bien deja connu d'Edouard
// peut rapatrier le rapport d'un tout autre locataire, des mois plus tot, et
// marquer a tort la mission comme terminee (cas reel du 18/09 : mission "EDL
// sortant" prevue le 02/10, rapport d'entree du 08/12/2025 rapatrie et email
// "rapport disponible" envoye a l'agence avant meme la visite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/edouard-cron.js';

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
process.env.EDOUARD_API_KEY = process.env.EDOUARD_API_KEY || 'test-edouard-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete() {
  return { headers: new Headers({ authorization: `Bearer ${process.env.CRON_SECRET}` }) };
}

// mission : ligne Supabase `missions` ; situations : EDL renvoyes par Edouard
// pour l'accommodation `accId`.
function mockComplet({ mission, situations = [], accId = 'acc-1' }) {
  const patchs = [];
  const emails = [];
  const fetchMock = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/missions') && (!opts || !opts.method || opts.method === 'GET')) {
      return { ok: true, json: async () => [{ id: mission.id, data: mission, user_id: 'u1' }] };
    }
    if (u.includes('/rest/v1/missions') && opts && opts.method === 'PATCH') {
      patchs.push(JSON.parse(opts.body));
      return { ok: true };
    }
    if (u.includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [{ user_id: 'u1' }] };
    }
    if (u.includes('/v1/situations/') && u.includes('/report')) {
      return { ok: true, json: async () => ({ url: 'https://edouard.example/rapport.pdf' }) };
    }
    if (u.includes('/v1/situations')) {
      return { ok: true, json: async () => situations.map(s => Object.assign({ accommodationID: accId }, s)) };
    }
    if (u.includes('/v1/accommodations')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('rapport.pdf')) {
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    }
    if (u.includes('/storage/v1/object/sign/')) {
      return { ok: true, json: async () => ({ signedURL: '/signed/rapport.pdf' }) };
    }
    if (u.includes('/storage/v1/object/rapports/')) {
      return { ok: true };
    }
    if (u.includes('/v3/smtp/email')) {
      emails.push(JSON.parse(opts.body));
      return { ok: true };
    }
    if (u.includes('/rest/v1/contacts')) {
      return { ok: true, json: async () => [] };
    }
    return { ok: true, json: async () => [] };
  };
  return { fetchMock, patchs, emails };
}

test('edouard-cron : ignore un EDL d\'entree pour une mission "EDL sortant" (autre locataire, meme logement)', async () => {
  const mock = mockComplet({
    mission: {
      type: 'EDL sortant',
      date: '2026-10-02T15:00:00',
      adresse: '25 Bis Rue Blaise Pascal 91120 Palaiseau',
      edouardAccommodationId: 'acc-1',
      emailClient: 'agence@test.fr'
    },
    situations: [{ id: 'sit-ancien-entree', type: 1, date: '2025-12-08T16:30:00.000Z' }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.journal.rapportsRecuperes, 0, 'le rapport d\'entree ne doit pas etre rapatrie pour une mission de sortie');
  assert.equal(mock.patchs.length, 0);
  assert.equal(mock.emails.length, 0);
});

test('edouard-cron : ignore un EDL du bon type mais trop ancien (autre tenance)', async () => {
  const mock = mockComplet({
    mission: {
      type: 'EDL sortant',
      date: '2026-10-02T15:00:00',
      adresse: '10 rue de la Paix 75002 Paris',
      edouardAccommodationId: 'acc-1',
      emailClient: 'agence@test.fr'
    },
    situations: [{ id: 'sit-vieille-sortie', type: 2, date: '2024-01-15T10:00:00.000Z' }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete());
  const body = await res.json();

  assert.equal(body.journal.rapportsRecuperes, 0);
  assert.equal(mock.patchs.length, 0);
});

test('edouard-cron : rapatrie bien l\'EDL du bon type, proche de la date planifiee', async () => {
  const mock = mockComplet({
    mission: {
      type: 'EDL sortant',
      date: '2026-10-02T15:00:00',
      adresse: '10 rue de la Paix 75002 Paris',
      edouardAccommodationId: 'acc-1',
      emailClient: 'agence@test.fr'
    },
    situations: [{ id: 'sit-bonne-sortie', type: 2, date: '2026-10-03T09:00:00.000Z' }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete());
  const body = await res.json();

  assert.equal(body.journal.rapportsRecuperes, 1);
  assert.equal(mock.patchs.length, 1);
  assert.equal(mock.patchs[0].data.statut, 'terminée');
  assert.equal(mock.emails.length, 1);
});

test('edouard-cron : type de mission non reconnu (ex. pre-etat des lieux) garde le filtre de date seul', async () => {
  const mock = mockComplet({
    mission: {
      type: 'Pré-état des lieux',
      date: '2026-10-02T15:00:00',
      adresse: '10 rue de la Paix 75002 Paris',
      edouardAccommodationId: 'acc-1',
      emailClient: 'agence@test.fr'
    },
    situations: [
      { id: 'sit-trop-vieux', type: 1, date: '2024-01-15T10:00:00.000Z' },
      { id: 'sit-proche', type: 2, date: '2026-10-01T09:00:00.000Z' }
    ]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete());
  const body = await res.json();

  assert.equal(body.journal.rapportsRecuperes, 1, 'seul celui proche de la date doit etre rapatrie');
});
