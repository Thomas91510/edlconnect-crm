// Vérifie /api/brevo-contacts : réservé aux administrateurs. Le compte
// Brevo est unique et partagé par toute la plateforme, et contrairement aux
// emails transactionnels (tag "sub_<user_id>", voir brevo-tracking.js), les
// contacts Brevo ne portent aucun tag par abonné — impossible de filtrer
// cette liste par abonné. Régression cible : cet endpoint renvoyait
// auparavant TOUS les contacts Brevo (vrais clients) à n'importe quel
// abonné Starter/Pro authentifié.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/brevo-contacts.js';

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(headers) {
  return { method: 'GET', headers: new Headers(headers || {}) };
}

test('brevo-contacts : refuse sans jeton', async () => {
  const resp = await handler(requete({}));
  assert.equal(resp.status, 401);
});

test('brevo-contacts : refuse un abonné non-admin (même sur un plan payant)', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: AUTRE_EMAIL }) };
    return { ok: true, json: async () => ({}) };
  };
  const resp = await handler(requete({ authorization: 'Bearer test-token' }));
  assert.equal(resp.status, 403);
});

test('brevo-contacts : un admin reçoit bien la liste des contacts (paginée)', async () => {
  process.env.BREVO_API_KEY = 'test-brevo-key';
  let appelsBrevo = 0;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin1', email: ADMIN_EMAIL }) };
    if (u.includes('api.brevo.com/v3/contacts')) {
      appelsBrevo++;
      if (appelsBrevo === 1) {
        return { ok: true, json: async () => ({ contacts: [{ email: 'a@exemple.fr' }], count: 1 }) };
      }
      return { ok: true, json: async () => ({ contacts: [], count: 1 }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const resp = await handler(requete({ authorization: 'Bearer test-token' }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].email, 'a@exemple.fr');
});

test('brevo-contacts : refuse une session invalide', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: false };
    return { ok: true, json: async () => ({}) };
  };
  const resp = await handler(requete({ authorization: 'Bearer jeton-invalide' }));
  assert.equal(resp.status, 401);
});
