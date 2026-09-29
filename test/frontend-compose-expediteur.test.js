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

// ─── genererSignatureEmail ──────────────────────────────────
// Même bug que le champ "De" : EMAIL_SIGNATURE était un bloc HTML figé
// avec les coordonnées personnelles de Thomas (EDL IDF), ajouté à
// l'identique en bas de TOUS les emails envoyés via le Composer, par
// TOUS les comptes (remonté en testant avec le compte ImmoCheck, qui
// voyait pourtant la signature "Thomas LANGLADE — EDL IDF").
function setupSignature(codeSetup) {
  // AGENCY_LOGOS_BUCKET_URL est normalement défini par app-settings.js (non
  // chargé ici, trop lourd pour ce test isolé) : on le simule.
  const base = `window.AGENCY_LOGOS_BUCKET_URL = 'https://cdn.test/agency-logos/';`;
  return chargerScripts(['app-config.js', 'app-emails.js'], '', base + (codeSetup || '')).window;
}

test('genererSignatureEmail : construit la signature à partir de l\'identité propre au compte (nom, tél, email, logo, couleur)', () => {
  const w = setupSignature(`
    CFG.expediteurSignature = 'Julie DURAND — Gérante';
    CFG.expediteurNom = 'ImmoCheck EDL';
    CFG.expediteurTel = '0612345678';
    CFG.expediteurEmail = 'contact@immocheck-edl.com';
    CFG.logoPath = 'abc123.png';
    CFG.couleurPrimaire = '#2a9d8f';
  `);
  const html = w.genererSignatureEmail();
  assert.match(html, /Julie DURAND — Gérante/);
  assert.match(html, /ImmoCheck EDL/);
  assert.match(html, /0612345678/);
  assert.match(html, /contact@immocheck-edl\.com/);
  assert.match(html, /abc123\.png/);
  assert.match(html, /#2a9d8f/);
  // Ne doit plus jamais contenir les coordonnées personnelles de Thomas.
  assert.doesNotMatch(html, /LANGLADE/);
  assert.doesNotMatch(html, /edl-idf\.com/);
  assert.doesNotMatch(html, /LARDY/);
});

test('genererSignatureEmail : sans logo/tél/email configurés, n\'affiche que le nom (pas de lignes vides)', () => {
  const w = setupSignature(`CFG.expediteurSignature = 'Julie DURAND';`);
  const html = w.genererSignatureEmail();
  assert.match(html, /Julie DURAND/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /📞/);
  assert.doesNotMatch(html, /✉️/);
});

test('genererSignatureEmail : échappe les valeurs saisies par l\'abonné (anti-injection HTML)', () => {
  const w = setupSignature(`CFG.expediteurSignature = '"><script>alert(1)</script>';`);
  const html = w.genererSignatureEmail();
  assert.doesNotMatch(html, /<script>/);
});

test('genererSignatureEmail : renvoie une chaîne vide si rien n\'est configuré du tout (pas de signature générique inventée)', () => {
  // CFG.companyName retombe normalement sur "EDL IDF" par défaut (comportement
  // préexistant, hors périmètre ici) : on simule le cas où rien n'est
  // configuré, y compris cette valeur de repli, pour vérifier ce garde-fou.
  const w = setupSignature(`Object.defineProperty(CFG, 'companyName', { get: function(){ return ''; } });`);
  assert.equal(w.genererSignatureEmail(), '');
});
