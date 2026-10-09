import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheminSur, cheminPieceJointeValide } from '../api/_lib/chemin-stockage.js';

test('cheminSur : accepte un chemin dans le dossier attendu', () => {
  assert.equal(cheminSur('ag_1/factures/1700000000000-F-2026-001.pdf', 'ag_1'), true);
  assert.equal(cheminSur('ag_1/contrat-1700000000000.pdf', 'ag_1'), true);
});

test('cheminSur : refuse la sortie du bucket, même encodée', () => {
  for (const c of [
    '../sauvegardes/lokentia-2026-10-09.json',
    'ag_1/../../sauvegardes/x.json',
    'ag_1/%2e%2e/%2E%2E/sauvegardes/x.json',
    'ag_1/..%2f..%2fsauvegardes/x.json',
    'ag_1//x.pdf',
    'ag_1/./x.pdf',
    'ag_1/x.pdf?download',
    'ag_1\\..\\x',
  ]) assert.equal(cheminSur(c, 'ag_1'), false, c);
});

test('cheminSur : refuse le dossier d\'un autre agent', () => {
  assert.equal(cheminSur('ag_2/factures/x.pdf', 'ag_1'), false);
  assert.equal(cheminSur('ag_10/factures/x.pdf', 'ag_1'), false);
  assert.equal(cheminSur('', 'ag_1'), false);
});

test('cheminPieceJointeValide : seul le format du dépôt passe', () => {
  assert.equal(cheminPieceJointeValide('sub_1760000000000_a9bjar/1760000000000-v9l9qm.pdf'), true);
  assert.equal(cheminPieceJointeValide('sub_1/1700000000000-abc123'), true);
  assert.equal(cheminPieceJointeValide('../sauvegardes/x.json'), false);
  assert.equal(cheminPieceJointeValide('sub_1/../../sauvegardes/1700000000000-a.json'), false);
  assert.equal(cheminPieceJointeValide('sub_1/%2e%2e/1700000000000-a.pdf'), false);
});
