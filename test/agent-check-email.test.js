// Vérifie /api/agent-check-email : renvoie uniquement un booléen (jamais le
// nom de l'agent ni son agence), pour bloquer côté client l'envoi d'un lien
// magique à un email non enregistré comme Agent EDL — sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agent-check-email.js';

const fetchOriginal = global.fetch;
const envOriginal = process.env.SUPABASE_SERVICE_KEY;
test.after(() => { global.fetch = fetchOriginal; process.env.SUPABASE_SERVICE_KEY = envOriginal; });
test.beforeEach(() => { process.env.SUPABASE_SERVICE_KEY = 'cle-test'; });

function requete(body) {
  return { url: 'https://x.test/api/agent-check-email', method: 'POST', headers: new Headers(), json: async () => body };
}

test('email correspondant à un Agent EDL : registered=true', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ user_id: 'owner-1', data: { agents: [{ id: 'a1', email: 'jean@exemple.fr' }] } }] });

  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.deepEqual(body, { registered: true });
});

test('email inconnu : registered=false', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ user_id: 'owner-1', data: { agents: [{ id: 'a1', email: 'jean@exemple.fr' }] } }] });

  const resp = await handler(requete({ email: 'inconnu@exemple.fr' }));
  const body = await resp.json();

  assert.deepEqual(body, { registered: false });
});

test('ne renvoie jamais le nom de l\'agent ni l\'agence — juste le booléen', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ user_id: 'owner-1', data: { agents: [{ id: 'a1', nom: 'Jean Secret Dupont', email: 'jean@exemple.fr' }] } }] });

  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  const body = await resp.json();

  assert.deepEqual(Object.keys(body), ['registered']);
  assert.ok(!JSON.stringify(body).includes('Jean Secret Dupont'));
});

test('clé de service absente : dégrade vers registered=true (échoue ouvert, ne bloque jamais un agent légitime)', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  let appele = false;
  global.fetch = async () => { appele = true; };

  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  const body = await resp.json();

  assert.equal(body.registered, true);
  assert.equal(appele, false);
});

test('panne réseau vers Supabase : dégrade vers registered=true, jamais d\'exception', async () => {
  global.fetch = async () => { throw new Error('panne réseau'); };

  const resp = await handler(requete({ email: 'jean@exemple.fr' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.registered, true);
});

test('refuse les méthodes autres que POST/OPTIONS', async () => {
  const resp = await handler({ url: 'https://x.test/api/agent-check-email', method: 'GET', headers: new Headers() });
  assert.equal(resp.status, 405);
});
