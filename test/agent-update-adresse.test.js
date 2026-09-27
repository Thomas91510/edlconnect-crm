// Vérifie /api/agent-update-adresse : un agent renseigne lui-même son
// adresse (pré-remplit ensuite sa recherche de communes pour les zones
// d'intervention) — jamais l'agence. Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/agent-update-adresse.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete({ token = 'jeton-valide', corps = { adresse: '12 rue de la Paix, 91000 Évry-Courcouronnes' } } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/agent-update-adresse', method: 'POST', headers, json: async () => corps };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', settingsRows } = {}) {
  const appels = { patch: null };
  const rows = settingsRows || [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr' }] } }];
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ email }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/rest/v1/settings') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => rows };
    }
    if (String(url).includes('/rest/v1/settings') && opts && opts.method === 'PATCH') {
      appels.patch = { url, corps: JSON.parse(opts.body) };
      return { ok: true, json: async () => ({}) };
    }
    throw new Error('URL inattendue : ' + url);
  };
  return { fn, appels };
}

test('sans jeton : 401 sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };
  const resp = await handler(requete({ token: null }));
  assert.equal(resp.status, 401);
  assert.equal(appele, false);
});

test('email sans fiche agent correspondante : 403', async () => {
  global.fetch = fabriquerFetchMock({ email: 'inconnu@exemple.fr' }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 403);
});

test('enregistre l\'adresse (tronquée, espaces retirés) sur la fiche agent', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete({ corps: { adresse: '  12 rue de la Paix, 91000 Évry-Courcouronnes  ' } }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.adresse, '12 rue de la Paix, 91000 Évry-Courcouronnes');
  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.equal(agentMaj.adresse, '12 rue de la Paix, 91000 Évry-Courcouronnes');
});

test('une adresse vide efface le champ (l\'agent peut la retirer)', async () => {
  const rows = [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', adresse: 'Ancienne adresse' }] } }];
  const { fn, appels } = fabriquerFetchMock({ settingsRows: rows });
  global.fetch = fn;

  await handler(requete({ corps: { adresse: '' } }));

  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.equal(agentMaj.adresse, '');
});

test('un agent ne peut modifier que SA PROPRE fiche', async () => {
  const rows = [{ user_id: 'owner-1', data: { agents: [
    { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr' },
    { id: 'agent-2', nom: 'Marie', email: 'marie@exemple.fr', adresse: 'Adresse de Marie' },
  ] } }];
  const { fn, appels } = fabriquerFetchMock({ settingsRows: rows });
  global.fetch = fn;

  await handler(requete());

  const agent2 = appels.patch.corps.data.agents.find(a => a.id === 'agent-2');
  assert.equal(agent2.adresse, 'Adresse de Marie', 'un autre agent de la même agence ne doit jamais être modifié');
});

test('agent supprimé entre la résolution et l\'écriture (relecture fraîche) : 404', async () => {
  global.fetch = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'jean@exemple.fr' }) };
    if (String(url).includes('limit=1000')) {
      return { ok: true, json: async () => [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', email: 'jean@exemple.fr' }] } }] };
    }
    if (String(url).includes('/rest/v1/settings') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => [{ data: { agents: [] } }] }; // agent-1 n'existe plus
    }
    throw new Error('URL inattendue : ' + url);
  };
  const resp = await handler(requete());
  assert.equal(resp.status, 404);
});

test('refuse les méthodes autres que POST/OPTIONS', async () => {
  const resp = await handler({ url: 'https://x.test/api/agent-update-adresse', method: 'GET', headers: new Headers() });
  assert.equal(resp.status, 405);
});
