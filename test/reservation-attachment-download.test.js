// Vérifie /api/reservation-attachment-download : réservé aux administrateurs
// (aucun client ne "possède" une pièce jointe de réservation), mint une URL
// signée de courte durée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/reservation-attachment-download.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';
const CHEMIN = 'sub_abc/1699999999-xyz.pdf';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(callerEmail, body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch(callerEmail) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: callerEmail }) };
    if (u.includes('/storage/v1/object/sign/reservations/')) {
      return { ok: true, json: async () => ({ signedURL: '/object/sign/reservations/' + CHEMIN + '?token=abc' }) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

test('reservation-attachment-download : refuse un non-administrateur', async () => {
  mockFetch(AUTRE_EMAIL);
  const resp = await handler(requete(AUTRE_EMAIL, { path: CHEMIN }));
  assert.equal(resp.status, 403);
});

test('reservation-attachment-download : refuse sans chemin', async () => {
  mockFetch(ADMIN_EMAIL);
  const resp = await handler(requete(ADMIN_EMAIL, {}));
  assert.equal(resp.status, 400);
});

test('reservation-attachment-download : mint une URL signée pour un administrateur', async () => {
  mockFetch(ADMIN_EMAIL);
  const resp = await handler(requete(ADMIN_EMAIL, { path: CHEMIN }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('token=abc'));
});
