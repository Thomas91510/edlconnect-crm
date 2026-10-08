// Suivi des emails (Brevo) : un email déjà connu doit être MIS À JOUR
// (ouvert / cliqué ensuite), et la liste triée du plus récent au plus ancien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

test('fusionnerSuiviEmails : met à jour statut, ouvertures et clics des emails connus', () => {
  const { window: w } = chargerScripts(['app-config.js', 'app-emails.js'], '<div id="tracking-list"></div>',
    "DB.trackings = [{ id: 'a', email: 'x@y.fr', statut: 'Envoyé', opens: 0, clicks: 0, date: '2026-10-01T09:00:00Z' }];" +
    "DB.contacts = [{ id: 'c1', email: 'X@y.fr', history: [{ id: 'a', statut: 'Envoyé' }] }];");
  const res = w.fusionnerSuiviEmails([
    { id: 'a', email: 'x@y.fr', statut: 'Cliqué', opens: 2, clicks: 1, date: '2026-10-03T09:00:00Z' },
    { id: 'b', email: 'z@y.fr', statut: 'Envoyé', date: '2026-10-05T09:00:00Z' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(res)), { nouveaux: 1, majs: 1 });
  const DB = w.eval('DB');
  assert.equal(DB.trackings[0].id, 'b', 'plus récent en premier');
  const a = DB.trackings.find(t => t.id === 'a');
  assert.equal(a.statut, 'Cliqué');
  assert.equal(a.opens, 2);
  assert.equal(DB.contacts[0].history[0].statut, 'Cliqué', 'historique de la fiche mis à jour');
  // Un statut moins avancé ne fait jamais reculer
  w.fusionnerSuiviEmails([{ id: 'a', email: 'x@y.fr', statut: 'Envoyé', date: '2026-10-03T09:00:00Z' }]);
  assert.equal(DB.trackings.find(t => t.id === 'a').statut, 'Cliqué');
});

test('rdvSeptJours (extranet) : seulement les rendez-vous des 7 prochains jours, triés', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../extranet-app.html', import.meta.url), 'utf8');
  const src = html.slice(html.indexOf('function rdvSeptJours'), html.indexOf('function renderAccueil'));
  const rdvSeptJours = new Function(src + '; return rdvSeptJours;')();
  const now = new Date('2026-10-08T10:00:00').getTime();
  const o = (id, j, statut = 'confirmee') => ({ id, statut, dateSouhaitee: new Date(now + j * 86400000).toISOString() });
  const res = rdvSeptJours([o('loin', 9), o('demain', 1), o('annule', 2, 'annulee'), o('passe', -2), o('j6', 6), o('fait', 3, 'rapport_dispo')], now);
  assert.deepEqual(res.map(x => x.id), ['demain', 'j6']);
});
