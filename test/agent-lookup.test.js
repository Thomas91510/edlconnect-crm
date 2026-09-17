// Vérifie resolverAgentParEmail (api/_lib/agent-lookup.js) : la
// correspondance email authentifié → agence + fiche agent, qui fait office
// de contrôle d'accès pour /api/agent-missions — sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverAgentParEmail } from '../api/_lib/agent-lookup.js';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('trouve l\'agent et son agence, email insensible à la casse/espaces', async () => {
  global.fetch = async (url) => {
    assert.ok(String(url).includes('/rest/v1/settings'));
    return { ok: true, json: async () => [
      { user_id: 'owner-1', data: { agents: [{ id: 'a1', nom: 'Jean', email: 'Jean@Exemple.fr' }] } },
      { user_id: 'owner-2', data: { agents: [{ id: 'a2', nom: 'Marie', email: 'marie@exemple.fr' }] } },
    ] };
  };

  const resultat = await resolverAgentParEmail('  jean@exemple.fr  ', 'cle-test');
  assert.deepEqual(resultat, { ownerId: 'owner-1', agent: { id: 'a1', nom: 'Jean', email: 'Jean@Exemple.fr' } });
});

test('aucun agent ne correspond : null', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [
    { user_id: 'owner-1', data: { agents: [{ id: 'a1', email: 'jean@exemple.fr' }] } },
  ] });

  assert.equal(await resolverAgentParEmail('inconnu@exemple.fr', 'cle-test'), null);
});

test('agence sans agents ou sans champ data : ignorée sans exception', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [
    { user_id: 'owner-1', data: {} },
    { user_id: 'owner-2', data: null },
    { user_id: 'owner-3' },
  ] });

  assert.equal(await resolverAgentParEmail('jean@exemple.fr', 'cle-test'), null);
});

test('réponse Supabase non OK : null plutôt qu\'une exception', async () => {
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.equal(await resolverAgentParEmail('jean@exemple.fr', 'cle-test'), null);
});

test('email ou clé de service absents : null sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };

  assert.equal(await resolverAgentParEmail('', 'cle-test'), null);
  assert.equal(await resolverAgentParEmail('jean@exemple.fr', ''), null);
  assert.equal(appele, false);
});
