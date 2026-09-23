// Vérifie /api/agent-document-download : authentification obligatoire,
// résolution de l'agent, et surtout qu'un agent ne peut jamais obtenir le
// document d'un autre agent (le chemin est toujours lu sur SA PROPRE
// fiche, jamais fourni par le client) — sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agent-document-download.js';

const fetchOriginal = global.fetch;
const envOriginal = process.env.SUPABASE_SERVICE_KEY;
test.after(() => { global.fetch = fetchOriginal; process.env.SUPABASE_SERVICE_KEY = envOriginal; });
test.beforeEach(() => { process.env.SUPABASE_SERVICE_KEY = 'cle-test'; });

function requete(body, token = 'jeton-valide') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/agent-document-download', method: 'POST', headers, json: async () => body };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', settingsRows, signOk = true } = {}) {
  const appels = { sign: null };
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ email }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/rest/v1/settings')) {
      return { ok: true, json: async () => settingsRows };
    }
    if (String(url).includes('/storage/v1/object/sign/agent-documents/')) {
      appels.sign = { url, corps: JSON.parse(opts.body) };
      return signOk ? { ok: true, json: async () => ({ signedURL: '/sign/agent-documents/agent-1/contrat-1.pdf?token=abc' }) } : { ok: false };
    }
    throw new Error('URL inattendue : ' + url);
  };
  return { fn, appels };
}

const AGENT_AVEC_DOCS = [{ user_id: 'owner-1', data: { agents: [
  { id: 'agent-1', email: 'jean@exemple.fr', contratPath: 'agent-1/contrat-1.pdf' },
] } }];

test('sans jeton : 401 sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };
  const resp = await handler(requete({ type: 'contrat' }, null));
  assert.equal(resp.status, 401);
  assert.equal(appele, false);
});

test('type invalide : 400', async () => {
  global.fetch = fabriquerFetchMock({ settingsRows: AGENT_AVEC_DOCS }).fn;
  const resp = await handler(requete({ type: 'facture' }));
  assert.equal(resp.status, 400);
});

test('email sans fiche agent correspondante : 403', async () => {
  global.fetch = fabriquerFetchMock({ email: 'inconnu@exemple.fr', settingsRows: AGENT_AVEC_DOCS }).fn;
  const resp = await handler(requete({ type: 'contrat' }));
  assert.equal(resp.status, 403);
});

test('document non déposé pour ce type : 404', async () => {
  global.fetch = fabriquerFetchMock({ settingsRows: AGENT_AVEC_DOCS }).fn;
  const resp = await handler(requete({ type: 'avenant' })); // avenantPath absent
  assert.equal(resp.status, 404);
});

test('document disponible : génère un lien signé de 60s pour LE CHEMIN DE CET AGENT', async () => {
  const { fn, appels } = fabriquerFetchMock({ settingsRows: AGENT_AVEC_DOCS });
  global.fetch = fn;

  const resp = await handler(requete({ type: 'contrat' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('agent-1/contrat-1.pdf'));
  assert.equal(appels.sign.corps.expiresIn, 60);
  assert.ok(String(appels.sign.url).includes('agent-1%2Fcontrat-1.pdf') || String(appels.sign.url).includes('agent-1/contrat-1.pdf'));
});

test('un agent ne peut pas obtenir le document d\'un autre agent même en le demandant explicitement', async () => {
  // Le chemin n'est JAMAIS lu depuis le corps de la requête — seulement
  // depuis la fiche résolue à partir de l'email authentifié.
  const { fn, appels } = fabriquerFetchMock({ settingsRows: AGENT_AVEC_DOCS });
  global.fetch = fn;

  const resp = await handler(requete({ type: 'contrat', path: 'agent-2/contrat-secret.pdf' }));
  await resp.json();

  assert.ok(!String(appels.sign.url).includes('agent-2'));
  assert.ok(String(appels.sign.url).includes('agent-1'));
});

test('échec de signature : 500 propre', async () => {
  global.fetch = fabriquerFetchMock({ settingsRows: AGENT_AVEC_DOCS, signOk: false }).fn;
  const resp = await handler(requete({ type: 'contrat' }));
  assert.equal(resp.status, 500);
});
