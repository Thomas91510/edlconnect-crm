// /api/redaction-ia : « Rédiger avec IA » par Claude (ou Mistral, gratuit, sans clé Anthropic) — authentifié, plan
// payant, prompts construits côté serveur (pas de proxy ouvert).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
const { default: handler, decouperEmail } = await import('../api/redaction-ia.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = (body, token = 't') => ({ method: 'POST', url: 'https://x.test/api/redaction-ia', headers: new Headers(token ? { authorization: 'Bearer ' + token } : {}), json: async () => body });

function mock({ plan = 'pro', appels = [], reponse } = {}) {
  global.fetch = async (url, opts = {}) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1', email: 'agence@x.fr' }), { status: 200 });
    if (u.includes('/rest/v1/user_plans')) return new Response(JSON.stringify([{ plan, status: 'active' }]), { status: 200 });
    if (u.includes('/rest/v1/settings')) return new Response(JSON.stringify([{ data: { companyName: 'EDL IDF', expediteurSignature: 'Thomas' } }]), { status: 200 });
    if (u.includes('api.anthropic.com')) {
      const corps = JSON.parse(opts.body || (url instanceof Request ? await url.text() : '{}'));
      appels.push({ corps, headers: opts.headers });
      return new Response(JSON.stringify(reponse || { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Objet: Votre état des lieux\n\nBonjour,\nCorps.\n\nThomas' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  };
  return appels;
}

test('découpe objet / corps', () => {
  assert.deepEqual(decouperEmail('Objet: Bonjour\n\nLigne 1\nLigne 2'), { objet: 'Bonjour', corps: 'Ligne 1\nLigne 2' });
  assert.deepEqual(decouperEmail('Juste un corps'), { objet: '', corps: 'Juste un corps' });
});

test('rédige avec Claude : modèle, consigne et identité construits côté serveur', async () => {
  const appels = mock();
  const r = await handler(req({ consigne: 'Relance agence', destinataire: 'a@b.fr', model: 'autre-modele' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { objet: 'Votre état des lieux', corps: 'Bonjour,\nCorps.\n\nThomas' });
  const corps = appels[0].corps;
  assert.equal(corps.model, 'claude-opus-5-5', 'le modèle demandé par le navigateur est ignoré');
  assert.match(corps.system, /EDL IDF/);
  assert.match(corps.messages[0].content, /Relance agence/);
  assert.equal(corps.fallbacks, 'default');
});

test('refus : sans jeton, plan gratuit, consigne vide ou refusée par l’IA', async () => {
  mock();
  assert.equal((await handler(req({ consigne: 'x' }, null))).status, 401);
  mock({ plan: 'free' });
  assert.equal((await handler(req({ consigne: 'x' }))).status, 403);
  mock();
  assert.equal((await handler(req({ consigne: '  ' }))).status, 400);
  mock({ reponse: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 0 } } });
  assert.equal((await handler(req({ consigne: 'x' }))).status, 422);
});

test('sans clé Anthropic : rédige avec Mistral (gratuit), même format', async () => {
  const cle = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.MISTRAL_API_KEY = 'test-mistral-key';
  const appels = [];
  mock();
  const fetchClaude = global.fetch;
  global.fetch = async (url, opts = {}) => {
    if (String(url).includes('api.mistral.ai')) {
      appels.push(JSON.parse(opts.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Objet: Relance\n\nBonjour,\nCorps.' } }] }), { status: 200 });
    }
    return fetchClaude(url, opts);
  };
  try {
    const r = await handler(req({ consigne: 'Relance agence' }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { objet: 'Relance', corps: 'Bonjour,\nCorps.' });
    assert.equal(appels[0].model, 'mistral-small-latest');
    assert.match(appels[0].messages[0].content, /EDL IDF/);
    delete process.env.MISTRAL_API_KEY;
    assert.equal((await handler(req({ consigne: 'x' }))).status, 503, 'aucune clé : non configurée');
  } finally {
    process.env.ANTHROPIC_API_KEY = cle;
    delete process.env.MISTRAL_API_KEY;
  }
});

test('Mistral saturé (429) : réessaie puis bascule sur un modèle gratuit de secours', async () => {
  const cle = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.MISTRAL_API_KEY = 'test-mistral-key';
  const { PAUSE_MISTRAL_MS } = await import('../api/redaction-ia.js');
  PAUSE_MISTRAL_MS.valeur = 0;
  const modeles = [];
  mock();
  const base = global.fetch;
  global.fetch = async (url, opts = {}) => {
    if (String(url).includes('api.mistral.ai')) {
      const m = JSON.parse(opts.body).model;
      modeles.push(m);
      if (m === 'mistral-small-latest') return new Response('{"message":"Service tier capacity exceeded for this model."}', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Objet: Relance\n\nCorps.' } }] }), { status: 200 });
    }
    return base(url, opts);
  };
  try {
    const r = await handler(req({ consigne: 'Relance' }));
    assert.equal(r.status, 200);
    assert.deepEqual(modeles, ['mistral-small-latest', 'mistral-small-latest', 'open-mistral-nemo']);
  } finally {
    process.env.ANTHROPIC_API_KEY = cle;
    delete process.env.MISTRAL_API_KEY;
  }
});
