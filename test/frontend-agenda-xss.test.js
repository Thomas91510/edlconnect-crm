// Verrouille le correctif XSS de l'Agenda (voir js/app-agenda.js) : les
// valeurs titre/agence/contact d'un événement peuvent venir d'un formulaire
// de réservation public non authentifié et doivent toujours ressortir
// échappées dans le HTML généré par renderEvtListItem, jamais exécutables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const PAYLOAD = '<img src=x onerror="window.__xss=true">';

test('renderEvtListItem échappe titre/agence/contact', () => {
  const { window } = chargerScripts(['app-core.js', 'app-agenda.js']);
  const html = window.renderEvtListItem({
    evtType: 'mission',
    titre: 'EDL — ' + PAYLOAD,
    agence: PAYLOAD,
    contact: PAYLOAD,
    date: '2026-09-06T10:00:00',
    duree: '2h',
    id: 'x1'
  });

  assert.ok(!html.includes('<img src=x'), 'le payload ne doit jamais apparaître en HTML brut');
  assert.ok(html.includes('&lt;img'), 'le payload doit apparaître échappé');
  // Trois emplacements distincts affichent une valeur potentiellement
  // attaquable dans cette fonction (titre, lien Google Agenda, contact) —
  // vérifie qu'aucun des trois n'a été oublié.
  const occurrences = (html.match(/&lt;img/g) || []).length;
  assert.equal(occurrences, 2, 'titre et contact doivent tous deux être échappés (le lien Google Agenda encode différemment, via URLSearchParams)');
});

test('renderEvtListItem : le lien Google Agenda encode le payload en URL, jamais en HTML', () => {
  const { window } = chargerScripts(['app-core.js', 'app-agenda.js']);
  const html = window.renderEvtListItem({
    evtType: 'rdv',
    titre: PAYLOAD,
    date: '2026-09-06T10:00:00',
    duree: '1h',
    id: 'x2'
  });
  assert.ok(!html.includes('<img'), 'aucune balise brute, y compris dans le lien Google Agenda');
  assert.ok(html.includes('%3Cimg'), 'le payload doit être encodé en composant URL dans le lien Google Agenda');
});

test('renderEvtListItem : un événement normal reste lisible (pas de sur-échappement)', () => {
  const { window } = chargerScripts(['app-core.js', 'app-agenda.js']);
  const html = window.renderEvtListItem({
    evtType: 'mission',
    titre: "EDL — L'Immobilière & Fils",
    date: '2026-09-06T10:00:00',
    duree: '2h',
    id: 'x3'
  });
  assert.ok(html.includes("L&#39;Immobilière &amp; Fils"), html);
});
