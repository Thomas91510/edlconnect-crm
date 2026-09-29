// Champ "De" du Composer un email (index.html, onglet "Email unique") :
// affichait auparavant la valeur "contact@edl-idf.com" figée en dur dans le
// HTML, identique pour TOUS les comptes quel que soit l'abonné connecté
// (remonté par Thomas en testant avec le compte contact@immocheck-edl.com).
// Ce n'était qu'un bug d'affichage — api/send-email.js ignore déjà le
// sender envoyé par le client et impose l'identité réelle de l'abonné côté
// serveur (identiteAbonne()) — mais afficherExpediteurCompose() rejoue ici
// la même règle (domaine vérifié -> propre adresse, sinon expéditeur
// neutre Lokentia) pour que ce champ dise enfin la vérité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `<div id="notif"></div><input id="compose-from" readonly>`;

function setup(expediteurEmail, userEmail) {
  const codeSetup = `
    CFG.expediteurEmail = ${JSON.stringify(expediteurEmail || '')};
    CFG.userEmail = ${JSON.stringify(userEmail || '')};
  `;
  return chargerScripts(['app-config.js', 'app-emails.js'], HTML, codeSetup).window;
}

test('afficherExpediteurCompose : domaine vérifié (edl-idf.com) -> affiche la propre adresse de l\'abonné', () => {
  const w = setup('contact@edl-idf.com');
  w.afficherExpediteurCompose();
  assert.equal(w.document.getElementById('compose-from').value, 'contact@edl-idf.com');
});

test('afficherExpediteurCompose : domaine non vérifié (ex. compte ImmoCheck) -> expéditeur neutre Lokentia, jamais l\'adresse d\'un autre abonné', () => {
  const w = setup('contact@immocheck-edl.com');
  w.afficherExpediteurCompose();
  assert.equal(w.document.getElementById('compose-from').value, 'contact@lokentia.fr');
});

test('afficherExpediteurCompose : sans expediteurEmail configuré, repli sur userEmail', () => {
  const w = setup('', 'contact@lokentia.fr');
  w.afficherExpediteurCompose();
  // userEmail au domaine lokentia.fr est aussi un domaine vérifié.
  assert.equal(w.document.getElementById('compose-from').value, 'contact@lokentia.fr');
});

test('afficherExpediteurCompose : aucune adresse configurée -> expéditeur neutre par défaut', () => {
  const w = setup('', '');
  w.afficherExpediteurCompose();
  assert.equal(w.document.getElementById('compose-from').value, 'contact@lokentia.fr');
});

test('afficherExpediteurCompose : ne plante pas si le champ #compose-from est absent de la page', () => {
  const w = chargerScripts(['app-config.js', 'app-emails.js'], '<div id="notif"></div>').window;
  assert.doesNotThrow(() => w.afficherExpediteurCompose());
});
