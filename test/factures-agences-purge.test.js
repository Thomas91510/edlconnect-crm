// /api/factures-agences-purge : supprime les anciennes factures déposées
// pour les agences (entrées "facture" des fiches + PDF du bucket). Sans réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: purge } = await import('../api/factures-agences-purge.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(corps = {}, token = 'jeton') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api', method: 'POST', headers, json: async () => corps };
}

function mock(email = 'abonne@x.fr') {
  const appels = { lecture: null, patch: [], suppression: null };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner-1', email }) };
    if (u.includes('/rest/v1/contacts') && opts.method === 'PATCH') { appels.patch.push({ u, data: JSON.parse(opts.body).data }); return { ok: true }; }
    if (u.includes('/rest/v1/contacts')) {
      appels.lecture = decodeURIComponent(u);
      return { ok: true, json: async () => [{ id: 'c1', data: { email: 'agence@x.fr', documents: [
        { nom: 'Facture juin', url: 'agence%40x.fr/facture-1.pdf', type: 'facture' },
        { nom: 'Tarifs', url: 'https://drive/t', type: 'document' },
      ] } }] };
    }
    if (u.includes('/storage/v1/object/factures')) { appels.suppression = JSON.parse(opts.body); return { ok: true }; }
    throw new Error('URL inattendue ' + u);
  };
  return appels;
}

test('simulation : compte sans rien supprimer', async () => {
  const appels = mock();
  const r = await purge(requete({ simulation: true }));
  assert.deepEqual(await r.json(), { simulation: true, fiches: 1, factures: 1 });
  assert.equal(appels.patch.length, 0);
  assert.equal(appels.suppression, null);
  assert.match(appels.lecture, /data->>ownerId=eq\.owner-1/, 'un abonné ne voit que ses contacts');
});

test('suppression : fiche nettoyée (documents gardés), PDF supprimé du bucket', async () => {
  const appels = mock();
  const r = await purge(requete());
  const corps = await r.json();
  assert.equal(corps.factures, 1);
  assert.equal(corps.fichiersSupprimes, 1);
  assert.deepEqual(appels.patch[0].data.documents.map(d => d.nom), ['Tarifs']);
  assert.deepEqual(appels.suppression.prefixes, ['agence%40x.fr/facture-1.pdf']);
});

test('administrateur : toutes les fiches ; sans jeton : 401', async () => {
  const appels = mock('contact@edl-idf.com');
  await purge(requete({ simulation: true }));
  assert.doesNotMatch(appels.lecture, /ownerId/);
  assert.equal((await purge(requete({}, null))).status, 401);
});
