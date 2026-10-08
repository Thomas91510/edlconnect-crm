// Enregistrer les agents depuis le CRM ne doit jamais effacer ce que l'agent
// a écrit lui-même depuis son espace (factures envoyées, infos légales).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

test('fusionnerAgentsServeur : la version serveur fait foi pour les champs de l’agent', () => {
  const { window } = chargerScripts(['app-core.js', 'app-cloud.js']);
  const locaux = [
    { id: 'a1', nom: 'Paul (renommé)', factures: [], photoPath: '' },
    { id: 'a2', nom: 'Nouvel agent' },
  ];
  const serveur = [
    { id: 'a1', nom: 'Paul', factures: [{ numero: 'F2026-001' }], infosLegales: { siret: '123' }, photoPath: 'a1.jpg' },
    { id: 'a3', nom: 'Retiré du CRM' },
  ];
  const r = window.fusionnerAgentsServeur(locaux, serveur);
  assert.equal(r.length, 2, 'un agent retiré dans le CRM reste retiré');
  assert.equal(r[0].nom, 'Paul (renommé)', 'les modifications du CRM sont gardées');
  assert.deepEqual(r[0].factures.map(f => f.numero), ['F2026-001']);
  assert.equal(r[0].infosLegales.siret, '123');
  assert.equal(r[0].photoPath, 'a1.jpg');
  assert.equal(r[1].nom, 'Nouvel agent');
});
