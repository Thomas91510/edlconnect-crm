// Vérifie /api/facture-download : mint une URL signée de courte durée
// uniquement pour un chemin qui appartient réellement à un document
// "facture" du client authentifié — jamais pour un chemin arbitraire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/facture-download.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const CLIENT_EMAIL = 'client@exemple.fr';
const CHEMIN = encodeURIComponent(CLIENT_EMAIL) + '/facture-123.pdf';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(callerEmail, body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch({ callerEmail, docs }) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: callerEmail }) };
    if (u.includes('/rest/v1/contacts')) {
      return { ok: true, json: async () => [{ data: { email: CLIENT_EMAIL, documents: docs || [] } }] };
    }
    if (u.includes('/storage/v1/object/sign/factures/')) {
      return { ok: true, json: async () => ({ signedURL: '/object/sign/factures/' + CHEMIN + '?token=abc' }) };
    }
    return { ok: true, json: async () => [] };
  };
}

test('facture-download : refuse un chemin qui n\'appartient pas au client', async () => {
  mockFetch({ callerEmail: CLIENT_EMAIL, docs: [] });
  const resp = await handler(requete(CLIENT_EMAIL, { path: CHEMIN }));
  assert.equal(resp.status, 403);
});

test('facture-download : mint une URL signée pour un document possédé', async () => {
  mockFetch({ callerEmail: CLIENT_EMAIL, docs: [{ nom: 'Facture', url: CHEMIN, type: 'facture' }] });
  const resp = await handler(requete(CLIENT_EMAIL, { path: CHEMIN }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('token=abc'));
});

test('facture-download : refuse un document de type "document" (pas une facture)', async () => {
  mockFetch({ callerEmail: CLIENT_EMAIL, docs: [{ nom: 'Contrat', url: CHEMIN, type: 'document' }] });
  const resp = await handler(requete(CLIENT_EMAIL, { path: CHEMIN }));
  assert.equal(resp.status, 403);
});

test('facture-download : un admin peut consulter la facture d\'un autre client via clientEmail', async () => {
  mockFetch({ callerEmail: ADMIN_EMAIL, docs: [{ nom: 'Facture', url: CHEMIN, type: 'facture' }] });
  const resp = await handler(requete(ADMIN_EMAIL, { path: CHEMIN, clientEmail: CLIENT_EMAIL }));
  assert.equal(resp.status, 200);
});
