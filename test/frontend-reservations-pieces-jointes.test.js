// Vérifie que la colonne "Pièces jointes" de la table Réservations
// (js/app-reservations.js) affiche un lien par fichier, échappe le nom
// (anti-XSS), et retombe sur "—" quand il n'y en a pas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="resa-loading"></div>
  <div id="resa-table-wrap"></div>
  <div id="resa-count"></div>
  <table><tbody id="resa-tbody"></tbody></table>
`;

function setup(){
  const codeSetup = `_supaReady = false;`;
  const { window } = chargerScripts(['app-reservations.js'], HTML, codeSetup);
  return window;
}

test('renderReservations : affiche un lien par pièce jointe', () => {
  const w = setup();
  w.renderReservations([{
    id: 'r1', agence: 'Century 21', typeEdl: 'EDL entrant', adresse: '12 rue de la Paix',
    piecesJointes: [{ nom: 'diagnostic.pdf', path: 'sub_1/a.pdf' }, { nom: 'photo.jpg', path: 'sub_1/b.jpg' }]
  }]);
  const html = w.document.getElementById('resa-tbody').innerHTML;
  assert.ok(html.includes('diagnostic.pdf'));
  assert.ok(html.includes('photo.jpg'));
  assert.ok(html.includes("telechargerPieceJointeReservation('sub_1/a.pdf'"));
});

test('renderReservations : "—" quand aucune pièce jointe', () => {
  const w = setup();
  w.renderReservations([{ id: 'r1', agence: 'Century 21', typeEdl: 'EDL entrant', adresse: '12 rue de la Paix' }]);
  const html = w.document.getElementById('resa-tbody').innerHTML;
  assert.ok(html.includes('—'));
});

test('renderReservations : échappe le nom de fichier (anti-XSS)', () => {
  const w = setup();
  w.renderReservations([{
    id: 'r1', agence: 'Century 21', typeEdl: 'EDL entrant', adresse: '12 rue de la Paix',
    piecesJointes: [{ nom: '<img src=x onerror=alert(1)>', path: 'sub_1/a.pdf' }]
  }]);
  const tbody = w.document.getElementById('resa-tbody');
  // Le check qui compte réellement : aucun élément <img> ne doit avoir été
  // créé dans le DOM. Chercher la sous-chaîne "<img" dans le HTML sérialisé
  // donne un faux positif ici : elle apparaît, inerte, à l'intérieur de
  // l'attribut title="..." (un "<" dans une valeur d'attribut ne rouvre pas
  // de balise — seuls "&" et le guillemet délimiteur comptent, tous deux
  // déjà échappés par esc()).
  assert.equal(tbody.querySelectorAll('img').length, 0, 'aucune balise <img> ne doit être créée dans le DOM');
  assert.ok(tbody.innerHTML.includes('&lt;img'), 'le texte visible doit être échappé');
});
