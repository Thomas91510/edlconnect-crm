// Vérifie /api/send-welcome-agent : authentification obligatoire, email
// requis, et contenu de l'appel Brevo — sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-welcome-agent.js';

const fetchOriginal = global.fetch;
const envOriginal = { brevo: process.env.BREVO_API_KEY, service: process.env.SUPABASE_SERVICE_KEY };
test.after(() => {
  global.fetch = fetchOriginal;
  process.env.BREVO_API_KEY = envOriginal.brevo;
  process.env.SUPABASE_SERVICE_KEY = envOriginal.service;
});
test.beforeEach(() => {
  process.env.BREVO_API_KEY = 'cle-brevo-test';
  process.env.SUPABASE_SERVICE_KEY = 'cle-service-test';
});

function requete(body, token = 'jeton-valide') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return {
    url: 'https://x.test/api/send-welcome-agent',
    method: 'POST',
    headers,
    json: async () => body,
  };
}

function fabriquerFetchMock({ userOk = true, brevoOk = true } = {}) {
  const appels = { brevo: null };
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ id: 'owner-1', email: 'agence@exemple.fr' }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [{ data: {} }] };
    }
    if (String(url).includes('api.brevo.com')) {
      appels.brevo = { url, corps: JSON.parse(opts.body) };
      return brevoOk ? { ok: true, json: async () => ({}) } : { ok: false, json: async () => ({ message: 'panne Brevo' }) };
    }
    throw new Error('URL inattendue : ' + url);
  };
  return { fn, appels };
}

test('sans jeton : 401 sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };
  const resp = await handler(requete({ email: 'jean@exemple.fr' }, null));
  assert.equal(resp.status, 401);
  assert.equal(appele, false);
});

test('session invalide : 401', async () => {
  global.fetch = fabriquerFetchMock({ userOk: false }).fn;
  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  assert.equal(resp.status, 401);
});

test('email requis : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({}));
  assert.equal(resp.status, 400);
});

test('envoie bien un email Brevo au destinataire indiqué', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete({ email: 'jean@exemple.fr', nom: 'Jean Dupont' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(appels.brevo, 'Brevo aurait dû être appelé');
  assert.deepEqual(appels.brevo.corps.to, [{ email: 'jean@exemple.fr', name: 'Jean Dupont' }]);
  assert.ok(appels.brevo.corps.htmlContent.includes('Jean Dupont'));
  assert.ok(appels.brevo.corps.htmlContent.includes('app.lokentia.fr/agent'));
});

test('échec Brevo : 500 avec le message d\'erreur', async () => {
  global.fetch = fabriquerFetchMock({ brevoOk: false }).fn;
  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  assert.equal(resp.status, 500);
});

test('clé Brevo absente : 500 sans jamais appeler Brevo', async () => {
  delete process.env.BREVO_API_KEY;
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete({ email: 'jean@exemple.fr' }));

  assert.equal(resp.status, 500);
  assert.equal(appels.brevo, null);
});

test('refuse les méthodes autres que POST/OPTIONS', async () => {
  const resp = await handler({ url: 'https://x.test/api/send-welcome-agent', method: 'GET', headers: new Headers() });
  assert.equal(resp.status, 405);
});
