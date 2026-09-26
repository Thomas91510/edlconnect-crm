// Refonte ergonomique de la fiche contact : l'onglet "Modifier" (doublon
// avec "Informations" — il rééditait Statut/Type/Source/Dernier contact/
// Moyen de contact déjà modifiables en direct) a été retiré. Entreprise,
// Contact et Notes, jusque-là seulement éditables via le bouton
// "Enregistrer" du batch saveContactEdit() (supprimé), sont désormais
// éditables en direct comme le reste. La gestion des documents (extranet +
// facture) devient l'onglet "Documents" et se sauvegarde immédiatement,
// sans bouton "Enregistrer" dédié — zone à risque : un document ajouté ou
// modifié ne doit plus jamais pouvoir être perdu faute d'avoir cliqué sur
// un bouton qui n'existe plus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div id="view-contacts"></div>
  <div id="fiche-avatar"></div>
  <div id="fiche-name"></div>
  <div id="fiche-sub"></div>
`;

function setup(contact) {
  const codeSetup = `
    _supaReady = false;
    currentFicheId = '${contact.id}';
    DB.contacts = ${JSON.stringify([contact])};
    window.__getDB = function(){ return DB; };
  `;
  const { window } = chargerScripts(['app-contacts.js'], HTML, codeSetup);
  window.renderDashboard = () => {};
  window.renderContacts = () => {};
  window.detectDuplicates = () => {};
  return window;
}

test('quickUpdateContact : modifier Entreprise met à jour l\'en-tête de la fiche en direct', () => {
  const w = setup({ id: 'c1', entreprise: 'Ancien Nom', contact: 'Jean Dupont' });
  w.quickUpdateContact('c1', 'entreprise', 'Nouveau Nom');
  assert.equal(w.document.getElementById('fiche-name').textContent, 'Nouveau Nom');
});

test('quickUpdateContact : modifier Contact (sans entreprise) met aussi à jour l\'en-tête', () => {
  const w = setup({ id: 'c1', entreprise: '', contact: 'Jean Dupont' });
  w.quickUpdateContact('c1', 'contact', 'Marie Martin');
  assert.equal(w.document.getElementById('fiche-name').textContent, 'Marie Martin');
});

test('quickUpdateContact : déclenche detectDuplicates quand Entreprise change', () => {
  const w = setup({ id: 'c1', entreprise: 'X' });
  let appele = 0;
  w.detectDuplicates = () => { appele++; };
  w.quickUpdateContact('c1', 'entreprise', 'Y');
  assert.equal(appele, 1);
});

test('quickUpdateContact : déclenche detectDuplicates quand Email change', () => {
  const w = setup({ id: 'c1', email: 'a@a.fr' });
  let appele = 0;
  w.detectDuplicates = () => { appele++; };
  w.quickUpdateContact('c1', 'email', 'b@b.fr');
  assert.equal(appele, 1);
});

test('quickUpdateContact : ne déclenche pas detectDuplicates pour un champ sans lien avec les doublons', () => {
  const w = setup({ id: 'c1', statut: 'Cible potentielle' });
  let appele = 0;
  w.detectDuplicates = () => { appele++; };
  w.quickUpdateContact('c1', 'statut', 'Client actif');
  assert.equal(appele, 0);
});

test('quickUpdateContact : persiste les notes éditées en direct (plus besoin de l\'onglet Modifier)', () => {
  const w = setup({ id: 'c1', notes: '' });
  w.quickUpdateContact('c1', 'notes', 'Rappeler la semaine prochaine');
  assert.equal(w.__getDB().contacts[0].notes, 'Rappeler la semaine prochaine');
});

// ─── Onglet "Documents" (anciennement "Modifier") ──────────────────────
const HTML_TABS = `
  <button class="tab active" id="ftab-infos"></button>
  <button class="tab" id="ftab-docs"></button>
  <div id="fiche-infos"></div>
  <div id="fiche-commandes" style="display:none"></div>
  <div id="fiche-taches" style="display:none"></div>
  <div id="fiche-emails" style="display:none"></div>
  <div id="fiche-messages" style="display:none"></div>
  <div id="fiche-docs" style="display:none"></div>
`;

test('ficheTab("docs") affiche le panneau Documents (l\'ancien "edit"/"Modifier" a été renommé)', () => {
  const { window: w } = chargerScripts(['app-contacts.js'], HTML_TABS);
  w.ficheTab('docs', w.document.getElementById('ftab-docs'));
  assert.equal(w.document.getElementById('fiche-docs').style.display, 'block');
  assert.equal(w.document.getElementById('fiche-infos').style.display, 'none');
});

// ─── Documents extranet : sauvegarde immédiate, plus de bouton "Enregistrer" ───
const HTML_DOCS = `<div id="notif"></div><div id="view-contacts"></div><div id="fe-docs-list"></div>`;

function setupDocs(contact) {
  const codeSetup = `
    _supaReady = false;
    currentFicheId = '${contact.id}';
    DB.contacts = ${JSON.stringify([contact])};
    window.__getDB = function(){ return DB; };
  `;
  return chargerScripts(['app-extranet.js', 'app-contacts.js'], HTML_DOCS, codeSetup).window;
}

test('feUpdateDoc : persiste immédiatement dans c.documents (plus de bouton Enregistrer)', () => {
  const w = setupDocs({ id: 'c1', documents: [] });
  w.feRenderDocs([{ nom: '', url: '', type: 'document' }]);
  w.feUpdateDoc(0, 'url', 'https://drive.google.com/file/d/abc');
  w.feUpdateDoc(0, 'nom', 'Contrat signé');
  const c = w.__getDB().contacts[0];
  assert.equal(c.documents.length, 1, 'le document doit être sauvegardé sans action supplémentaire');
  assert.equal(c.documents[0].url, 'https://drive.google.com/file/d/abc');
  assert.equal(c.documents[0].nom, 'Contrat signé');
});

test('feRemoveDoc : retire immédiatement le document de c.documents', () => {
  const w = setupDocs({ id: 'c1', documents: [{ nom: 'A', url: 'https://drive.google.com/a', type: 'document' }] });
  w.feRenderDocs(w.__getDB().contacts[0].documents);
  w.feRemoveDoc(0);
  assert.equal(w.__getDB().contacts[0].documents.length, 0);
});

test('feAddDoc : une ligne vide fraîchement ajoutée n\'est pas encore persistée (pas d\'URL)', () => {
  const w = setupDocs({ id: 'c1', documents: [] });
  w.feAddDoc();
  assert.equal(w.feGetDocs().length, 0);
});

// ─── openFiche : rendu complet de l'onglet Informations ────────────────
const HTML_FULL = `
  <div id="notif"></div>
  <div id="view-contacts"></div>
  <div class="modal-bg" id="modal-fiche"></div>
  <div id="fiche-avatar"></div>
  <div id="fiche-name"></div>
  <div id="fiche-sub"></div>
  <div id="fiche-fields"></div>
  <button id="fiche-email-btn"></button>
  <div id="fiche-emails-list"></div>
  <div id="fe-docs-list"></div>
  <span id="ftab-messages-count"></span>
  <span id="ftab-commandes-count"></span>
  <div id="fiche-commandes-list"></div>
  <button class="tab active" id="ftab-infos"></button>
  <button class="tab" id="ftab-commandes"></button>
  <button class="tab" id="ftab-taches"></button>
  <button class="tab" id="ftab-emails"></button>
  <button class="tab" id="ftab-messages"></button>
  <button class="tab" id="ftab-docs"></button>
  <div id="fiche-infos"></div>
  <div id="fiche-commandes" style="display:none"></div>
  <div id="fiche-taches" style="display:none"></div>
  <div id="fiche-emails" style="display:none"></div>
  <div id="fiche-messages" style="display:none"></div>
  <div id="fiche-docs" style="display:none"></div>
`;

function setupFull(contact) {
  const codeSetup = `
    _supaReady = false;
    DB.contacts = ${JSON.stringify([contact])};
    DB.missions = [];
    DB.trackings = [];
    window.__getDB = function(){ return DB; };
  `;
  return chargerScripts(['app-extranet.js', 'app-contacts.js'], HTML_FULL, codeSetup).window;
}

test('openFiche : Entreprise, Contact et Notes sont éditables en direct dans "Informations" (plus d\'onglet "Modifier" séparé)', () => {
  const w = setupFull({
    id: 'c1', entreprise: 'ERA Charonne', contact: 'Georges Nguyen',
    email: 'g@era.fr', tel: '0102030405', statut: 'Client actif',
    notes: 'RCPRO envoyé'
  });
  w.openFiche('c1');
  const html = w.document.getElementById('fiche-fields').innerHTML;
  assert.ok(html.includes('value="ERA Charonne"'), 'Entreprise doit apparaître pré-remplie et éditable');
  assert.ok(html.includes('value="Georges Nguyen"'), 'Contact doit apparaître pré-rempli et éditable');
  assert.ok(html.includes('RCPRO envoyé'), 'Notes doivent être dans le textarea de "Informations", plus dans un onglet séparé');
  assert.equal(w.document.getElementById('fiche-docs').style.display, 'none', 'onglet Documents fermé par défaut');
});

test('openFiche : le statut "Client signé ✅" est sélectionnable dans "Informations" (avant, seul l\'onglet Modifier l\'avait)', () => {
  const w = setupFull({ id: 'c1', entreprise: 'X', statut: 'Client signé ✅' });
  w.openFiche('c1');
  const html = w.document.getElementById('fiche-fields').innerHTML;
  assert.ok(html.includes('>Client signé ✅</option>'));
});
