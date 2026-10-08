// js/app-remuneration.js (CRM, navigateur) est généré depuis le module du
// serveur : il doit être à jour et calculer exactement la même chose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { genererSource } from '../scripts/generer-remuneration-navigateur.mjs';
import { calculerRemuneration } from '../api/_lib/agent-remuneration.js';
import { chargerScripts } from './_lib/frontend-env.js';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('js/app-remuneration.js est à jour (sinon : node scripts/generer-remuneration-navigateur.mjs)', () => {
  assert.equal(fs.readFileSync(path.join(racine, 'js/app-remuneration.js'), 'utf8'), genererSource());
});

test('le calcul du navigateur donne le même résultat que celui du serveur', () => {
  const { window: w } = chargerScripts(['app-remuneration.js']);
  const maintenant = new Date('2026-10-15T12:00:00Z');
  const missions = [
    { id: 'a', type: 'EDL entrant', bienTypo: 'T2', bienType: 'Appartement', statut: 'terminée', date: '2026-10-02T09:00:00', remuPayee: true, remuPayeeLe: '2026-10-10' },
    { id: 'b', type: 'EDL Sortant / Entrant', bienType: 'Maison', bienTypo: 'T5', statut: 'terminée', date: '2026-09-02T09:00:00' },
    { id: 'c', type: 'Pré-état des lieux', statut: 'planifiée', date: '2026-10-22T09:00:00' },
  ];
  const ref = { mode: 'typologie', lignes: [{ label: 'Maison', bien: 'Maison', simple: 90, double: 160 }, { label: 'T2', typos: ['T2'], simple: 40 }], typoAutre: 30 };
  const navigateur = w.Remuneration.calculerRemuneration(missions, ref, maintenant);
  assert.equal(JSON.stringify(navigateur), JSON.stringify(calculerRemuneration(missions, ref, maintenant)));
});
