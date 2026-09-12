// register-plan.js : enregistre la ligne "free" d'un nouvel abonné dans
// user_plans. Zone identifiée comme non testée dans l'audit du 12/09
// (facturation/plan) malgré son impact direct sur l'accès aux fonctionnalités
// payantes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/register-plan.js';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(headers) {
  return { method: 'POST', headers: new Headers(headers || {}) };
}

test('register-plan : refuse une requête sans jeton', async () => {
  const res = await handler(requete());
  assert.equal(res.status, 401);
});

test('register-plan : refuse une session invalide', async () => {
  global.fetch = async () => ({ ok: false });
  const res = await handler(requete({ authorization: 'Bearer bidon' }));
  assert.equal(res.status, 401);
});

test('register-plan : crée la ligne "free" pour un nouvel utilisateur', async () => {
  let insertBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'nouvel-abonne@x.fr' }) };
    if (u.includes('/rest/v1/user_plans') && (!opts || opts.method !== 'POST')) return { ok: true, json: async () => [] }; // pas de ligne existante
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') {
      insertBody = JSON.parse(opts.body);
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ authorization: 'Bearer valide' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.created, true);
  assert.equal(insertBody.plan, 'free');
  assert.equal(insertBody.status, 'active');
  assert.equal(insertBody.user_id, 'u1');
});

test('register-plan : idempotent — ne recrée pas la ligne si elle existe déjà', async () => {
  let insertAppele = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'deja-inscrit@x.fr' }) };
    if (u.includes('/rest/v1/user_plans') && (!opts || opts.method !== 'POST')) return { ok: true, json: async () => [{ user_id: 'u1' }] };
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') { insertAppele = true; return { ok: true }; }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ authorization: 'Bearer valide' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.created, false);
  assert.equal(insertAppele, false, 'ne doit pas insérer une 2e fois');
});

test('register-plan : refuse un utilisateur sans email (donnée corrompue côté Supabase)', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1' }) }; // pas d'email
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ authorization: 'Bearer valide' }));
  assert.equal(res.status, 400);
});

test('register-plan : renvoie 502 si l\'insertion échoue côté Supabase', async () => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'x@x.fr' }) };
    if (u.includes('/rest/v1/user_plans') && (!opts || opts.method !== 'POST')) return { ok: true, json: async () => [] };
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') return { ok: false, text: async () => 'erreur RLS' };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ authorization: 'Bearer valide' }));
  assert.equal(res.status, 502);
});

test('register-plan : refuse une méthode autre que POST/OPTIONS', async () => {
  const res = await handler({ method: 'GET', headers: new Headers() });
  assert.equal(res.status, 405);
});
