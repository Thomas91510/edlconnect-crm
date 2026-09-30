// Vérifie /api/mistral : authentifié + plan Starter/Pro (déjà en place),
// et surtout la validation stricte du corps avant de le transmettre à
// Mistral (jamais le corps client tel quel — coûte sur la clé API de
// Thomas). Régression cible : l'endpoint proxyait auparavant n'importe quel
// modèle/max_tokens/messages fournis par le client, sans aucune limite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/mistral.js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'test-mistral-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch({ plan = 'pro', status = 'active', appelsMistral } = {}) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'agence@exemple.fr' }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [{ plan, status }] };
    if (u.includes('api.mistral.ai')) {
      if (appelsMistral) appelsMistral.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

const MESSAGES_VALIDES = [
  { role: 'system', content: 'Tu es un assistant.' },
  { role: 'user', content: 'Rédige un email.' },
];

test('mistral : refuse un modèle non autorisé', async () => {
  global.fetch = mockFetch();
  const resp = await handler(requete({ model: 'mistral-large-latest', messages: MESSAGES_VALIDES }));
  assert.equal(resp.status, 400);
});

test('mistral : refuse sans messages', async () => {
  global.fetch = mockFetch();
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: [] }));
  assert.equal(resp.status, 400);
});

test('mistral : refuse trop de messages (protection contre un usage détourné)', async () => {
  global.fetch = mockFetch();
  const trop = Array.from({ length: 10 }, () => ({ role: 'user', content: 'x' }));
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: trop }));
  assert.equal(resp.status, 400);
});

test('mistral : refuse un message avec un rôle invalide', async () => {
  global.fetch = mockFetch();
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: [{ role: 'tool', content: 'x' }] }));
  assert.equal(resp.status, 400);
});

test('mistral : refuse un message trop long', async () => {
  global.fetch = mockFetch();
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: [{ role: 'user', content: 'x'.repeat(10000) }] }));
  assert.equal(resp.status, 400);
});

test('mistral : plafonne max_tokens même si le client en demande davantage', async () => {
  const appelsMistral = [];
  global.fetch = mockFetch({ appelsMistral });
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: MESSAGES_VALIDES, max_tokens: 999999 }));
  assert.equal(resp.status, 200);
  assert.equal(appelsMistral[0].max_tokens, 1500);
});

test('mistral : ne transmet jamais de champ arbitraire fourni par le client (proxy fermé)', async () => {
  const appelsMistral = [];
  global.fetch = mockFetch({ appelsMistral });
  await handler(requete({ model: 'mistral-small-latest', messages: MESSAGES_VALIDES, n: 50, stream: true, tools: ['x'] }));
  assert.deepEqual(Object.keys(appelsMistral[0]).sort(), ['max_tokens', 'messages', 'model', 'temperature']);
});

test('mistral : requête valide transmise avec succès à Mistral', async () => {
  const appelsMistral = [];
  global.fetch = mockFetch({ appelsMistral });
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: MESSAGES_VALIDES, max_tokens: 1000, temperature: 0.7 }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.choices[0].message.content, 'ok');
  assert.equal(appelsMistral.length, 1);
});

test('mistral : toujours refusé pour un plan gratuit, même avant validation du corps', async () => {
  global.fetch = mockFetch({ plan: 'free', status: 'active' });
  const resp = await handler(requete({ model: 'mistral-small-latest', messages: MESSAGES_VALIDES }));
  assert.equal(resp.status, 403);
});
