// Vérifie le calcul des KPI du portail agent (api/_lib/agent-kpi.js) —
// mêmes règles de catégorisation que extranet-app.html (categorieEdl/
// statTypologie), portées ici pour rester testables sans jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorieEdl, statTypologie, calculerKpiAgent } from '../api/_lib/agent-kpi.js';

test('categorieEdl : classe les 4 catégories réelles du CRM', () => {
  assert.equal(categorieEdl('EDL entrant'), 'entrant');
  assert.equal(categorieEdl('EDL sortant'), 'sortant');
  assert.equal(categorieEdl('EDL Sortant / Entrant'), 'simultane');
  assert.equal(categorieEdl('Pré-état des lieux'), 'autre');
  assert.equal(categorieEdl(''), 'autre');
});

test('statTypologie : T1..T7+, studio → T1, F3 → T3', () => {
  assert.equal(statTypologie('Studio'), 'T1');
  assert.equal(statTypologie('T3'), 'T3');
  assert.equal(statTypologie('F3'), 'T3');
  assert.equal(statTypologie('T9'), 'T7+');
  assert.equal(statTypologie(''), 'Non renseignée');
  assert.equal(statTypologie('Garage'), 'Non renseignée');
});

test('calculerKpiAgent : liste vide → tout à zéro', () => {
  const kpi = calculerKpiAgent([]);
  assert.equal(kpi.total, 0);
  assert.deepEqual(kpi.parCategorie, { entrant: 0, sortant: 0, simultane: 0, autre: 0 });
  assert.equal(kpi.meuble, 0);
  assert.equal(kpi.nu, 0);
  assert.deepEqual(kpi.parTypologie, {});
});

test('calculerKpiAgent : agrège type EDL, meublé/nu et typologie sur plusieurs missions', () => {
  const missions = [
    { type: 'EDL entrant', bienMeuble: 'Meublé', bienTypo: 'T2' },
    { type: 'EDL sortant', bienMeuble: 'Nu', bienTypo: 'T2' },
    { type: 'EDL Sortant / Entrant', bienMeuble: 'Meublé', bienTypo: 'Studio' },
    { type: 'Pré-état des lieux', bienMeuble: '', bienTypo: '' },
  ];
  const kpi = calculerKpiAgent(missions);

  assert.equal(kpi.total, 4);
  assert.deepEqual(kpi.parCategorie, { entrant: 1, sortant: 1, simultane: 1, autre: 1 });
  assert.equal(kpi.meuble, 2);
  assert.equal(kpi.nu, 1);
  assert.deepEqual(kpi.parTypologie, { T2: 2, T1: 1, 'Non renseignée': 1 });
});

test('calculerKpiAgent : ne plante pas sur des missions avec des champs manquants', () => {
  assert.doesNotThrow(() => calculerKpiAgent([{}, { type: null, bienMeuble: null, bienTypo: null }]));
});
