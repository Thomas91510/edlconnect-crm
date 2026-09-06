// Couverture de base pour les fonctions pures les plus critiques de js/*.js
// (aucun test automatisé n'existait sur ces ~6300 lignes avant ce fichier).
// On cible en priorité esc() : c'est la seule barrière contre l'injection
// HTML partout où une donnée d'origine publique (réservation, extranet)
// finit dans du innerHTML — une régression ici serait silencieuse sans test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

test('esc() échappe les 5 caractères HTML dangereux', () => {
  const { window } = chargerScripts(['app-core.js']);
  assert.equal(window.esc(`<script>&"'`), '&lt;script&gt;&amp;&quot;&#39;');
});

test('esc() gère null/undefined/nombre sans lever d\'exception', () => {
  const { window } = chargerScripts(['app-core.js']);
  assert.equal(window.esc(null), '');
  assert.equal(window.esc(undefined), '');
  assert.equal(window.esc(42), '42');
});

test('esc() laisse intact un texte sans caractère spécial', () => {
  const { window } = chargerScripts(['app-core.js']);
  assert.equal(window.esc('Orpi Évry'), 'Orpi Évry');
});

test('fmtDate() formate en JJ/MM/AA et tolère une date absente', () => {
  const { window } = chargerScripts(['app-core.js']);
  assert.equal(window.fmtDate('2026-09-06'), '06/09/26');
  assert.equal(window.fmtDate(null), '—');
});

test('fmtDT() inclut date et heure, tolère une date absente', () => {
  const { window } = chargerScripts(['app-core.js']);
  const out = window.fmtDT('2026-09-06T14:30:00');
  assert.match(out, /^06\/09 \d{2}:\d{2}$/);
  assert.equal(window.fmtDT(null), '—');
});

test('fmtEntrants() échappe chaque locataire et tolère une liste vide', () => {
  const { window } = chargerScripts(['app-core.js', 'app-extranet.js']);
  assert.equal(window.fmtEntrants([]), '—');
  assert.equal(window.fmtEntrants(null), '—');
  const html = window.fmtEntrants([{ prenom: '<b>Jean</b>', nom: 'Dupont', tel: '0600000000' }]);
  assert.ok(!html.includes('<b>Jean</b>'), 'le prénom doit être échappé');
  assert.ok(html.includes('&lt;b&gt;Jean&lt;/b&gt;'));
});

test('_urlSureApercuExtranet() : bloque les schémas dangereux et les entrées vides', () => {
  const { window } = chargerScripts(['app-core.js', 'app-contacts.js']);
  assert.equal(window._urlSureApercuExtranet(''), '', 'une entrée vide ne doit jamais retomber sur la racine du site');
  assert.equal(window._urlSureApercuExtranet(null), '');
  assert.equal(window._urlSureApercuExtranet('javascript:alert(1)'), '');
  assert.equal(window._urlSureApercuExtranet('data:text/html,<script>alert(1)</script>'), '');
});

test('_urlSureApercuExtranet() : laisse passer un vrai lien http(s)', () => {
  const { window } = chargerScripts(['app-core.js', 'app-contacts.js']);
  assert.equal(window._urlSureApercuExtranet('https://drive.google.com/file/d/abc'), 'https://drive.google.com/file/d/abc');
});
