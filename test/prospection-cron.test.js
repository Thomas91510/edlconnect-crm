// prospection-cron.js : remplace le scénario Make "Séquence prospection —
// Envoi quotidien", tombé en panne le 14/09 quand le compte Make entier a
// dépassé son quota d'opérations (voir prospection-cron.js pour le contexte
// complet). Zone à haut risque : envoie de vrais emails à de vrais prospects
// avec un plafond quotidien et une logique anti-doublon — une régression ici
// peut spammer des prospects déjà contactés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/prospection-cron.js';

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(secret) {
  return { headers: new Headers(secret !== undefined ? { authorization: `Bearer ${secret}` } : {}) };
}

function ilYA(jours) { const d = new Date(); d.setDate(d.getDate() - jours); return d.toISOString(); }

// Construit un mock fetch complet : état "prospection" existant, listes
// Brevo, capture des envois et de l'écriture finale de l'état.
function mockComplet({ prospectionRows = [], listes = {}, brevoOk = true } = {}) {
  const envois = [];
  let ecriture = null;
  const fetchMock = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => prospectionRows };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      ecriture = JSON.parse(opts.body);
      return { ok: true };
    }
    if (u.includes('/v3/contacts/lists/')) {
      const m = u.match(/\/lists\/(\d+)\/contacts/);
      const listId = m[1];
      return { ok: true, json: async () => ({ contacts: (listes[listId] || []).map(email => ({ email })) }) };
    }
    if (u.includes('/v3/smtp/email')) {
      envois.push(JSON.parse(opts.body));
      return { ok: brevoOk };
    }
    return { ok: true, json: async () => [] };
  };
  return { fetchMock, envois, get ecriture() { return ecriture; } };
}

test('prospection-cron : refuse sans le bon secret', async () => {
  const res = await handler(requete('mauvais-secret'));
  assert.equal(res.status, 401);
});

test('prospection-cron : refuse sans jeton du tout', async () => {
  const res = await handler(requete(undefined));
  assert.equal(res.status, 401);
});

test('prospection-cron : envoie le premier email aux nouveaux prospects des listes Brevo', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['nouveau@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.envoyes.nouveauxProspects, 1);
  assert.equal(mock.envois.length, 1);
  assert.equal(mock.envois[0].templateId, 53);
  assert.equal(mock.envois[0].to[0].email, 'nouveau@agence.fr');

  const ligneProspect = mock.ecriture.find(l => l.id === 'nouveau@agence.fr');
  assert.equal(ligneProspect.data.stage, 1);
  assert.ok(ligneProspect.data.sentAt1);
});

test('prospection-cron : ne recontacte jamais un prospect déjà connu, même présent dans plusieurs listes', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'connu@agence.fr', data: { email: 'connu@agence.fr', stage: 1, sentAt1: new Date().toISOString() } }],
    listes: { '45': ['connu@agence.fr'], '43': ['connu@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.envoyes.nouveauxProspects, 0);
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : relance en J+4 un prospect stage 1 non cliqué, envoyé il y a plus de 4 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'ancien@agence.fr', data: { email: 'ancien@agence.fr', stage: 1, sentAt1: ilYA(5) } }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.relanceJ4, 1);
  assert.equal(mock.envois[0].templateId, 54);
  const ligne = mock.ecriture.find(l => l.id === 'ancien@agence.fr');
  assert.equal(ligne.data.stage, 2);
  assert.ok(ligne.data.sentAt2);
});

test('prospection-cron : ne relance pas un prospect stage 1 envoyé il y a moins de 4 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'recent@agence.fr', data: { email: 'recent@agence.fr', stage: 1, sentAt1: ilYA(1) } }]
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : ne relance jamais un prospect ayant déjà cliqué', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'a-clique@agence.fr', data: { email: 'a-clique@agence.fr', stage: 1, sentAt1: ilYA(10), clickedAt: ilYA(2) } }],
    listes: { '45': ['a-clique@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : relance en J+6 un prospect stage 2 non cliqué, envoyé il y a plus de 6 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'stage2@agence.fr', data: { email: 'stage2@agence.fr', stage: 2, sentAt1: ilYA(10), sentAt2: ilYA(7) } }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.relanceJ6, 1);
  assert.equal(mock.envois[0].templateId, 55);
  const ligne = mock.ecriture.find(l => l.id === 'stage2@agence.fr');
  assert.equal(ligne.data.stage, 3);
});

test('prospection-cron : ne dépasse jamais le plafond de 250 envois/jour', async () => {
  const emails = Array.from({ length: 10 }, (_, i) => `prospect${i}@agence.fr`);
  const mock = mockComplet({
    prospectionRows: [{ id: `quota:${new Date().toISOString().split('T')[0]}`, data: { quotaCount: 248 } }],
    listes: { '45': emails }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(mock.envois.length, 2, 'seulement 2 envois pour atteindre le plafond de 250');
  assert.equal(body.quotaUtilise, 250);
  const ligneQuota = mock.ecriture.find(l => l.id.startsWith('quota:'));
  assert.equal(ligneQuota.data.quotaCount, 250);
});

test('prospection-cron : un échec Brevo sur un envoi est rapporté sans bloquer les suivants', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['echoue@agence.fr', 'reussi@agence.fr'] },
    brevoOk: false
  });
  let premierAppel = true;
  const fetchOriginal2 = mock.fetchMock;
  global.fetch = async (url, opts) => {
    if (String(url).includes('/v3/smtp/email')) {
      const ok = premierAppel ? false : true;
      premierAppel = false;
      return fetchOriginal2(url, opts).then(() => ({ ok }));
    }
    return fetchOriginal2(url, opts);
  };

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.nouveauxProspects, 1, 'le 2e envoi réussi doit être compté');
  assert.equal(body.erreurs.length, 1);
  assert.equal(body.erreurs[0].email, 'echoue@agence.fr');
});
