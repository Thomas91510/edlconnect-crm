// Les campagnes d'emails doivent suivre la synchronisation cloud comme les
// autres données. Régression : SUPA_TABLES utilisait la clé "campagnes"
// alors que l'interface lit DB.campaigns — chargement, envoi et temps réel
// passaient par un tableau que personne n'affichait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

test('SUPA_TABLES : chaque clé correspond à un tableau de DB', () => {
  const { window: w } = chargerScripts(['app-cloud.js', 'app-core.js'], '',
    'window.__r = { cles: Object.keys(SUPA_TABLES), db: Object.keys(DB), table: SUPA_TABLES.campaigns };');
  for (const cle of w.__r.cles) assert.ok(w.__r.db.includes(cle), 'DB.' + cle + ' manquant');
  assert.equal(w.__r.table, 'campagnes');
});

test('migrerIdsCampagnes : remplace les identifiants numériques, une seule fois', () => {
  const { window: w } = chargerScripts(['app-core.js']);
  const liste = [{ id: 1, nom: 'A' }, { id: '2', nom: 'B' }, { id: 'camp_123', nom: 'C' }];
  assert.equal(w.migrerIdsCampagnes(liste), true);
  assert.match(String(liste[0].id), /^camp_/);
  assert.match(String(liste[1].id), /^camp_/);
  assert.notEqual(liste[0].id, liste[1].id);
  assert.equal(liste[2].id, 'camp_123');
  const avant = liste.map(c => c.id);
  assert.equal(w.migrerIdsCampagnes(liste), false);
  assert.deepEqual(liste.map(c => c.id), avant);
});
