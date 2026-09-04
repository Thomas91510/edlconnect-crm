// Garde-fou minimal : chaque fichier api/*.js doit au moins être syntaxiquement
// valide. N'exécute rien, ne vérifie pas la logique — juste qu'un edit n'a pas
// laissé un fichier cassé qui ferait planter une fonction Vercel en prod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racineApi = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'api');

function listerFichiersJs(dir) {
  let fichiers = [];
  for (const entree of readdirSync(dir)) {
    const p = path.join(dir, entree);
    if (statSync(p).isDirectory()) {
      fichiers = fichiers.concat(listerFichiersJs(p));
    } else if (entree.endsWith('.js')) {
      fichiers.push(p);
    }
  }
  return fichiers;
}

for (const fichier of listerFichiersJs(racineApi)) {
  test(`syntaxe valide : ${path.relative(racineApi, fichier)}`, () => {
    assert.doesNotThrow(() => execFileSync('node', ['--check', fichier], { stdio: 'pipe' }));
  });
}
