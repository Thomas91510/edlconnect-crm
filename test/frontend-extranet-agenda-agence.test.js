// Vérifie que l'espace client (extranet-app.html) transmet bien l'email du
// client authentifié à /api/agenda-disponibilites — sinon l'endpoint
// retombe sur DEFAULT_OWNER_ID et propose les agendas d'une autre agence
// (voir test/resoudre-owner.test.js pour la résolution côté serveur).
// Test de code source : chargerCreneauxSiPossible() est une fonction
// autonome au milieu d'un très gros fichier, une lecture directe de la
// ligne de fetch est plus robuste qu'un chargement jsdom complet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'extranet-app.html'), 'utf8');

test('extranet-app.html : le fetch des créneaux transmet l\'email du client authentifié', () => {
  const ligne = html.split('\n').find(l => l.includes("fetch('/api/agenda-disponibilites"));
  assert.ok(ligne, 'la ligne de fetch des créneaux doit exister');
  assert.match(ligne, /email=.*_userEmail/);
});
