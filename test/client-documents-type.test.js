// Vérifie que /api/client-documents renvoie le champ "type" de chaque
// document, ne renvoie jamais de facture (aucune facture pour les agences), et retombe sur "document" pour les
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
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ created_at: '2025-01-01T00:00:00Z', last_sign_in_at: '2026-01-01T00:00:00Z', email: CLIENT_EMAIL }) };
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

test('client-documents : jamais de facture pour les agences (anciennes entrées masquées)', async () => {
  mockFetch([{ nom: 'Facture juin', url: 'https://x/f.pdf', type: 'facture' }, { nom: 'Tarifs', url: 'https://x/t.pdf', type: 'document' }]);
  const resp = await handlerDocs(requete());
  const docs = await resp.json();
  assert.deepEqual(docs.map(d => d.nom), ['Tarifs']);
});

test('client-documents : un document sans type retombe sur "document" (compatibilité)', async () => {
  mockFetch([{ nom: 'Contrat', url: 'https://x/c.pdf' }]);
  const resp = await handlerDocs(requete());
  const docs = await resp.json();
  assert.equal(docs[0].type, 'document');
});
