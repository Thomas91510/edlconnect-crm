// Vérifie /api/calendar-create : GOOGLE_REFRESH_TOKEN pointe vers UN SEUL
// agenda Google partagé par toute la plateforme (pas encore un agenda par
// abonné) — réservé à l'admin pour ne jamais faire atterrir le RDV d'un
// autre abonné (adresse, coordonnées du locataire) dans l'agenda personnel
// de l'administrateur. Même principe que edouard-push.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || 'test-refresh-token';
const { default: handler } = await import('../api/calendar-create.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return { method: 'POST', headers: { authorization: 'Bearer test-token' }, body };
}

function mockRes() {
  const res = {
    _status: null, _json: null,
    setHeader() {},
    status(code) { this._status = code; return this; },
    json(body) { this._json = body; return this; },
    end() { return this; },
  };
  return res;
}

function mockAuth(email) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email }) };
    return { ok: true, json: async () => ({}) };
  };
}

test('calendar-create : refuse sans jeton', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res._status, 401);
});

test('calendar-create : un abonné non-admin est écarté silencieusement (skipped), jamais d\'erreur bloquante', async () => {
  global.fetch = mockAuth(AUTRE_EMAIL);
  const res = mockRes();
  await handler(requete({ titre: 'RDV', date: '2026-10-01T10:00:00' }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.skipped, true);
  assert.equal(res._json.success, false);
});

test('calendar-create : refuse une session invalide', async () => {
  global.fetch = async () => ({ ok: false });
  const res = mockRes();
  await handler(requete({ titre: 'RDV', date: '2026-10-01T10:00:00' }), res);
  assert.equal(res._status, 401);
});

test('calendar-create : un admin sans GOOGLE_REFRESH_TOKEN reçoit une erreur explicite (pas silencieuse)', async () => {
  const original = process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  global.fetch = mockAuth(ADMIN_EMAIL);
  const res = mockRes();
  await handler(requete({ titre: 'RDV', date: '2026-10-01T10:00:00' }), res);
  assert.equal(res._status, 503);
  process.env.GOOGLE_REFRESH_TOKEN = original;
});
