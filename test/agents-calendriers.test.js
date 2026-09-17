// Vérifie la lecture des emails d'agents depuis Supabase (settings.data.agents)
// utilisée par agenda-disponibilites.js pour construire la liste des agendas
// à fusionner — sans réseau réel (fetch mocké).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recupererCalendriersAgents, agentCouvreSecteur } from '../api/_lib/agents-calendriers.js';

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

// ─── agentCouvreSecteur ─────────────────────────────────────────────
test('agent sans secteur configuré : couvre partout, quel que soit le code postal', () => {
  assert.equal(agentCouvreSecteur({ secteurs: '' }, '75018'), true);
  assert.equal(agentCouvreSecteur({}, '92100'), true);
});

test('aucun code postal exploitable : aucun filtrage, même avec des secteurs configurés', () => {
  assert.equal(agentCouvreSecteur({ secteurs: '75018,75019' }, ''), true);
});

test('agent avec secteurs : ne couvre que les préfixes indiqués', () => {
  const agent = { secteurs: '75018,75019,92' };
  assert.equal(agentCouvreSecteur(agent, '75018'), true);
  assert.equal(agentCouvreSecteur(agent, '75019'), true);
  assert.equal(agentCouvreSecteur(agent, '92100'), true); // préfixe court "92" matche tout le département
  assert.equal(agentCouvreSecteur(agent, '75017'), false);
  assert.equal(agentCouvreSecteur(agent, '91000'), false);
});

test('secteurs avec espaces autour des virgules : nettoyés (trim)', () => {
  assert.equal(agentCouvreSecteur({ secteurs: ' 75018 , 75019 ' }, '75019'), true);
});

// ─── recupererCalendriersAgents + filtrage par secteur ─────────────
test('recupererCalendriersAgents filtre par secteur quand un code postal est fourni', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ data: { agents: [
    { nom: 'Nord', email: 'nord@exemple.fr', secteurs: '75018,75019' },
    { nom: 'Partout', email: 'partout@exemple.fr', secteurs: '' },
    { nom: 'Sud', email: 'sud@exemple.fr', secteurs: '75013,75014' },
  ] } }] });

  const emails = await recupererCalendriersAgents('owner-1', 'cle-test', '75018');
  assert.deepEqual(emails, ['nord@exemple.fr', 'partout@exemple.fr']);
});

test('recupererCalendriersAgents sans code postal : aucun filtrage par secteur', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ data: { agents: [
    { nom: 'Nord', email: 'nord@exemple.fr', secteurs: '75018' },
    { nom: 'Sud', email: 'sud@exemple.fr', secteurs: '75013' },
  ] } }] });

  const emails = await recupererCalendriersAgents('owner-1', 'cle-test', '');
  assert.deepEqual(emails, ['nord@exemple.fr', 'sud@exemple.fr']);
});
