// Le numéro de version affiché doit être le même sur le CRM, l'extranet
// agence et l'espace agent (chacun le déclare dans son propre fichier,
// faute de script partagé entre les trois pages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerScripts } from './_lib/frontend-env.js';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const versionDe = (source) => (source.match(/APP_VERSION = '([^']+)'/) || [])[1];

test('version : identique sur le CRM, l’extranet agence et l’espace agent', () => {
  const crm = versionDe(lire('js/app-core.js'));
  assert.match(crm, /^\d+\.\d+\.\d+(-[\w.]+)?$/, 'format majeure.mineure.correctif');
  assert.equal(versionDe(lire('extranet-app.html')), crm);
  assert.equal(versionDe(lire('agent-app.html')), crm);
});

test('version : la première entrée des nouveautés correspond à la version en cours', () => {
  const { window: w } = chargerScripts(['app-core.js'], '', 'window.__v = { v: APP_VERSION, n: NOUVEAUTES };');
  assert.equal(w.__v.n[0].v, w.__v.v);
});

test('libelleVersion : environnement affiché seulement hors production', () => {
  const { window: w } = chargerScripts(['app-core.js']);
  const v = 'v' + w.eval('APP_VERSION');
  assert.equal(w.libelleVersion(null), v);
  assert.equal(w.libelleVersion({ env: 'production', sha: 'a3f9c21' }), v + ' · a3f9c21');
  assert.equal(w.libelleVersion({ env: 'preview', sha: 'a3f9c21' }), v + ' · preview · a3f9c21');
});
