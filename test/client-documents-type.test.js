// Vérifie que /api/client-documents renvoie le champ "type" de chaque
// document (document | facture), et retombe sur "document" pour les
// entrées existantes qui n'ont jamais eu ce champ (compatibilité).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handlerDocs } = await import('../api/client-documents.js');

const CLIENT_EMAIL = 'client@exemple.fr';
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function mockFetch(documents) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: CLIENT_EMAIL }) };
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => [{ data: { documents } }] };
    return { ok: true, json: async () => [] };
  };
}

function requete() {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => ({}),
  };
}

test('client-documents : renvoie le type explicite d\'un document', async () => {
  mockFetch([{ nom: 'Facture juin', url: 'https://x/f.pdf', type: 'facture' }]);
  const resp = await handlerDocs(requete());
  const docs = await resp.json();
  assert.equal(docs[0].type, 'facture');
});

test('client-documents : un document sans type retombe sur "document" (compatibilité)', async () => {
  mockFetch([{ nom: 'Contrat', url: 'https://x/c.pdf' }]);
  const resp = await handlerDocs(requete());
  const docs = await resp.json();
  assert.equal(docs[0].type, 'document');
});
