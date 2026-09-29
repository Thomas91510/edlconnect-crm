// Composer un email : le mode de secours "Rédiger avec IA" (sans clé API,
// generateLocalEmail) et les "Modèles rapides" (TEMPLATES/applyTpl)
// signaient tous les deux systématiquement "Thomas Langlade — EDL IDF",
// quel que soit le compte connecté — remonté en auditant le code après le
// bug de la signature email figée sur EDL IDF (même famille de bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <input id="subj-f">
  <textarea id="body-f"></textarea>
`;

function setup(codeSetup) {
  const base = `
    window._EXTRANET_MODE = true;
  `;
  return chargerScripts(['app-cloud.js', 'app-config.js', 'app-emails.js', 'app-settings.js'], HTML, base + (codeSetup || '')).window;
}

// ─── generateLocalEmail (mode de secours "Rédiger avec IA") ─────────────
test('generateLocalEmail : signe avec l\'identité du compte connecté, jamais Thomas Langlade / EDL IDF', () => {
  const w = setup(`
    CFG.companyName = 'ImmoCheck EDL';
    CFG.expediteurSignature = 'Julie Durand';
    CFG.expediteurTel = '0612345678';
    CFG.expediteurEmail = 'contact@immocheck-edl.com';
  `);
  const subjEl = w.document.getElementById('subj-f');
  const bodyEl = w.document.getElementById('body-f');
  w.generateLocalEmail('relance client qui n\'a pas répondu', 'Agence Test', subjEl, bodyEl);

  assert.match(subjEl.value, /ImmoCheck EDL/);
  assert.match(bodyEl.value, /Julie Durand/);
  assert.match(bodyEl.value, /0612345678/);
  assert.match(bodyEl.value, /contact@immocheck-edl\.com/);
  assert.doesNotMatch(subjEl.value, /EDL IDF/);
  assert.doesNotMatch(bodyEl.value, /Thomas Langlade/);
  assert.doesNotMatch(bodyEl.value, /01 89 29 14 29/);
  assert.doesNotMatch(bodyEl.value, /edl-idf\.com/);
});

test('generateLocalEmail : sans aucune identité configurée, se rabat sur Lokentia (jamais EDL IDF)', () => {
  // CFG.companyName retombe normalement sur "EDL IDF" par défaut
  // (comportement préexistant, hors périmètre ici) : on simule le cas où
  // rien n'est configuré, y compris cette valeur de repli, pour vérifier
  // le repli final de generateLocalEmail lui-même.
  const w = setup(`Object.defineProperty(CFG, 'companyName', { get: function(){ return ''; } });`);
  const subjEl = w.document.getElementById('subj-f');
  const bodyEl = w.document.getElementById('body-f');
  w.generateLocalEmail('devis tarif', '', subjEl, bodyEl);
  assert.match(bodyEl.value, /Lokentia/);
  assert.doesNotMatch(bodyEl.value, /EDL IDF/);
  assert.doesNotMatch(bodyEl.value, /Thomas Langlade/);
});

// ─── applyTpl / TEMPLATES (Modèles rapides) ─────────────────────────────
test('applyTpl : remplace {{SOCIETE}} par le nom de l\'agence connectée, jamais EDL IDF', () => {
  const w = setup(`
    CFG.companyName = 'ImmoCheck EDL';
  `);
  w.applyTpl('cold');
  const subj = w.document.getElementById('subj-f').value;
  const body = w.document.getElementById('body-f').value;
  assert.match(subj, /ImmoCheck EDL/);
  assert.match(body, /ImmoCheck EDL réalise vos EDL/);
  assert.doesNotMatch(subj, /EDL IDF/);
  assert.doesNotMatch(body, /EDL IDF/);
});

test('applyTpl : remplace {{AVIS_GOOGLE_LIEN}} par le lien configuré par l\'abonné', () => {
  const w = setup(`
    CFG.companyName = 'ImmoCheck EDL';
    CFG.avisGoogleLien = 'https://g.page/r/immocheck/review';
  `);
  w.applyTpl('avis_google');
  const body = w.document.getElementById('body-f').value;
  assert.match(body, /https:\/\/g\.page\/r\/immocheck\/review/);
  // Jamais le lien Google de Thomas (EDL IDF).
  assert.doesNotMatch(body, /CQOIf5lzL3xwEBM/);
});

test('applyTpl : sans lien Google configuré, affiche un texte de repli explicite plutôt qu\'un lien vide ou celui d\'un autre abonné', () => {
  const w = setup(`
    CFG.companyName = 'ImmoCheck EDL';
  `);
  w.applyTpl('avis_google');
  const body = w.document.getElementById('body-f').value;
  assert.match(body, /à renseigner dans Paramètres/);
  assert.doesNotMatch(body, /CQOIf5lzL3xwEBM/);
});
