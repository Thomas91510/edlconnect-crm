// Vérifie /api/agent-zones-submit : un agent soumet ses secteurs primaire /
// secondaire (par commune — code INSEE + nom, choisis via la recherche/carte
// geo.api.gouv.fr) pour ses frais de déplacement — passe sa fiche en statut
// "attente", jamais appliqué directement (c'est l'agence qui valide ensuite
// depuis le CRM). Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/agent-zones-submit.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const EVRY = { code: '91228', nom: 'Évry-Courcouronnes' };
const BOULOGNE = { code: '92012', nom: 'Boulogne-Billancourt' };

function requete({ token = 'jeton-valide', corps = { secteurPrimaire: [EVRY], secteurSecondaire: [BOULOGNE] } } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/agent-zones-submit', method: 'POST', headers, json: async () => corps };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', settingsRows } = {}) {
  const appels = { patch: null };
  const rows = settingsRows || [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', zoneStatut: 'refuse', zoneRefusMotif: 'ancien motif' }] } }];
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

test('aucune commune soumise : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ corps: { secteurPrimaire: [], secteurSecondaire: [] } }));
  assert.equal(resp.status, 400);
});

test('commune sans code ou sans nom : ignorée plutôt que de faire échouer toute la soumission', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;
  await handler(requete({ corps: { secteurPrimaire: [EVRY, { code: '', nom: 'Sans code' }, { code: '91999' }], secteurSecondaire: [] } }));
  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.deepEqual(agentMaj.secteurPrimaire, [EVRY]);
});

test('soumission réussie : statut "attente", motif de refus précédent effacé', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete());
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.zoneStatut, 'attente');
  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.deepEqual(agentMaj.secteurPrimaire, [EVRY]);
  assert.deepEqual(agentMaj.secteurSecondaire, [BOULOGNE]);
  assert.equal(agentMaj.zoneStatut, 'attente');
  assert.equal(agentMaj.zoneRefusMotif, '', 'un refus précédent ne doit pas rester affiché après une nouvelle soumission');
});

test('dédoublonne les communes (par code) et retire du secondaire celles déjà en primaire', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;
  const melun = { code: '77288', nom: 'Melun' };

  await handler(requete({ corps: { secteurPrimaire: [EVRY, EVRY, BOULOGNE], secteurSecondaire: [BOULOGNE, melun] } }));

  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.deepEqual(agentMaj.secteurPrimaire, [EVRY, BOULOGNE]);
  assert.deepEqual(agentMaj.secteurSecondaire, [melun], 'Boulogne-Billancourt est déjà en primaire, elle ne doit pas aussi apparaître en secondaire');
});

test('un agent ne peut modifier que SA PROPRE fiche', async () => {
  const rows = [{ user_id: 'owner-1', data: { agents: [
    { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr' },
    { id: 'agent-2', nom: 'Marie', email: 'marie@exemple.fr' },
  ] } }];
  const { fn, appels } = fabriquerFetchMock({ settingsRows: rows });
  global.fetch = fn;

  await handler(requete());

  const agent2 = appels.patch.corps.data.agents.find(a => a.id === 'agent-2');
  assert.equal(agent2.zoneStatut, undefined, 'un autre agent de la même agence ne doit jamais être modifié');
});

test('agent supprimé entre la résolution et l\'écriture (relecture fraîche) : 404', async () => {
  // resolverAgentParEmail trouve l'agent via la recherche en vrac (bulk,
  // limit=1000) ; l'endpoint relit ensuite les settings de CETTE agence
  // précisément (user_id=eq....) avant d'écrire, par sécurité — on simule
  // ici sa disparition entre les deux lectures.
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
  const resp = await handler({ url: 'https://x.test/api/agent-zones-submit', method: 'GET', headers: new Headers() });
  assert.equal(resp.status, 405);
});
