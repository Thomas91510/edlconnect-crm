// admin-set-plan.js : seul point d'écriture légitime sur user_plans — attribue
// un plan payant à un abonné. Zone à haut risque (facturation, contrôle
// d'accès) identifiée comme non testée dans l'audit du 12/09.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/admin-set-plan.js';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body, headers) {
  return {
    method: 'POST',
    headers: new Headers(headers || { authorization: 'Bearer valide' }),
    json: async () => body
  };
}

function mockAuth(email) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'caller', email }) };
    return { ok: true, json: async () => [] };
  };
}

test('admin-set-plan : refuse une requête sans jeton', async () => {
  const res = await handler(requete({}, {}));
  assert.equal(res.status, 401);
});

test('admin-set-plan : refuse un appelant non-admin (même authentifié)', async () => {
  global.fetch = mockAuth('client-lambda@exemple.fr');
  const res = await handler(requete({ email: 'x@x.fr', plan: 'pro' }));
  assert.equal(res.status, 403);
});

test('admin-set-plan : refuse un plan invalide', async () => {
  global.fetch = mockAuth('contact@edl-idf.com');
  const res = await handler(requete({ email: 'x@x.fr', plan: 'ultra-mega-plan' }));
  assert.equal(res.status, 400);
});

test('admin-set-plan : refuse un statut invalide', async () => {
  global.fetch = mockAuth('contact@edl-idf.com');
  const res = await handler(requete({ email: 'x@x.fr', plan: 'pro', status: 'inconnu' }));
  assert.equal(res.status, 400);
});

test('admin-set-plan : refuse un rôle invalide', async () => {
  global.fetch = mockAuth('contact@edl-idf.com');
  const res = await handler(requete({ email: 'x@x.fr', role: 'super-admin' }));
  assert.equal(res.status, 400);
});

test('admin-set-plan : refuse une requête sans email', async () => {
  global.fetch = mockAuth('contact@edl-idf.com');
  const res = await handler(requete({ plan: 'pro' }));
  assert.equal(res.status, 400);
});

test('admin-set-plan : 404 si l\'utilisateur ne s\'est jamais connecté (aucune ligne à mettre à jour)', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'caller', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [] }; // jamais connecté
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ email: 'jamais-connecte@x.fr', plan: 'pro' }));
  assert.equal(res.status, 404);
});

test('admin-set-plan : met bien à jour le plan d\'un abonné existant', async () => {
  let upsertBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'caller', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/user_plans') && u.includes('select=')) return { ok: true, json: async () => [{ user_id: 'u42', role: 'agence' }] };
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') { upsertBody = JSON.parse(opts.body); return { ok: true }; }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ email: 'Client@Exemple.fr', plan: 'pro', status: 'active' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.userId, 'u42');
  assert.equal(upsertBody.plan, 'pro');
  assert.equal(upsertBody.email, 'client@exemple.fr', 'email normalisé en minuscules');
  assert.equal(upsertBody.role, 'agence', 'rôle existant conservé quand non fourni');
});

test('admin-set-plan : ne perd pas le rôle existant si non précisé, mais l\'écrase si fourni', async () => {
  let upsertBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'caller', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/user_plans') && u.includes('select=')) return { ok: true, json: async () => [{ user_id: 'u42', role: 'agence' }] };
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') { upsertBody = JSON.parse(opts.body); return { ok: true }; }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ email: 'x@x.fr', plan: 'starter', role: 'expert' }));
  assert.equal(res.status, 200);
  assert.equal(upsertBody.role, 'expert');
});

test('admin-set-plan : renvoie 502 si l\'upsert échoue côté Supabase', async () => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'caller', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/user_plans') && u.includes('select=')) return { ok: true, json: async () => [{ user_id: 'u42' }] };
    if (u.includes('/rest/v1/user_plans') && opts && opts.method === 'POST') return { ok: false, text: async () => 'erreur' };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ email: 'x@x.fr', plan: 'pro' }));
  assert.equal(res.status, 502);
});
