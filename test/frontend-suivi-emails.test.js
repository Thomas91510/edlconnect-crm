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
