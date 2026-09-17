// Vérifie la lecture des emails d'agents depuis Supabase (settings.data.agents)
// utilisée par agenda-disponibilites.js pour construire la liste des agendas
// à fusionner — sans réseau réel (fetch mocké).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recupererCalendriersAgents } from '../api/_lib/agents-calendriers.js';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('extrait les emails non vides des agents, nettoyés (trim)', async () => {
  global.fetch = async (url) => {
    assert.ok(String(url).includes('/rest/v1/settings'));
    assert.ok(String(url).includes('user_id=eq.owner-1'));
    return { ok: true, json: async () => [{ data: { agents: [
      { nom: 'Jean', email: ' jean@exemple.fr ' },
      { nom: 'Sans email', email: '' },
      { nom: 'Marie', email: 'marie@exemple.fr' },
    ] } }] };
  };

  const emails = await recupererCalendriersAgents('owner-1', 'cle-test');
  assert.deepEqual(emails, ['jean@exemple.fr', 'marie@exemple.fr']);
});

test('aucun agent : liste vide', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ data: { agents: [] } }] });
  assert.deepEqual(await recupererCalendriersAgents('owner-1', 'cle-test'), []);
});

test('aucune ligne settings pour cet owner : liste vide (pas d\'exception)', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });
  assert.deepEqual(await recupererCalendriersAgents('owner-1', 'cle-test'), []);
});

test('champ agents absent : liste vide', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ data: {} }] });
  assert.deepEqual(await recupererCalendriersAgents('owner-1', 'cle-test'), []);
});

test('réponse Supabase non OK : liste vide plutôt qu\'une exception', async () => {
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.deepEqual(await recupererCalendriersAgents('owner-1', 'cle-test'), []);
});

test('ownerId ou clé de service absents : liste vide sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };

  assert.deepEqual(await recupererCalendriersAgents('', 'cle-test'), []);
  assert.deepEqual(await recupererCalendriersAgents('owner-1', ''), []);
  assert.equal(appele, false);
});
