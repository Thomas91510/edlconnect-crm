// Verrouille la fusion de l'ancien "Pipeline commercial" (DB.deals, retiré)
// dans le pipeline de prospection (DB.prospects, js/app-config.js) : l'étape
// "Négociation" ajoutée, le motif conservé en passant une carte en "Perdu"
// (au lieu de la suppression pure d'avant), et le lien vers la fiche contact
// quand une carte prospect correspond à un contact existant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div class="modal-bg" id="modal-prosp"><div class="modal">
    <div id="pp-lien-contact" style="display:none"></div>
    <input id="pp-agence"><input id="pp-contact"><input id="pp-email">
    <input id="pp-tel"><input id="pp-dept"><textarea id="pp-notes"></textarea>
    <select id="pp-etape">
      <option>À contacter</option><option>Email envoyé</option><option>Email ouvert</option>
      <option>Réponse reçue</option><option>RDV planifié</option><option>Devis envoyé</option>
      <option>Négociation</option><option>Gagné</option><option>Perdu</option>
    </select>
    <input id="pp-ca"><input id="pp-notes-short">
    <button class="btn btn-primary">Enregistrer</button>
  </div></div>
  <div class="modal-bg" id="modal-fiche"></div>
`;

function setup({ prospects = [], contacts = [] } = {}) {
  // DB/PROSP_STAGES sont des bindings `let`/`const` du contexte vm (pas des
  // propriétés de window) : exposés via des accesseurs, comme documenté dans
  // test/_lib/frontend-env.js.
  const codeSetup = `
    _supaReady = false;
    DB.prospects = ${JSON.stringify(prospects)};
    DB.contacts = ${JSON.stringify(contacts)};
    window.__getDB = function(){ return DB; };
    window.__getProspStages = function(){ return PROSP_STAGES; };
  `;
  const { window } = chargerScripts(['app-contacts.js', 'app-config.js'], HTML, codeSetup);
  // Rendus pleine page hors périmètre de ce test (dépendent de bien plus
  // d'état/DOM que ce qu'on reproduit ici).
  window.renderProspection = () => {};
  window.renderDashboard = () => {};
  return window;
}

test('PROSP_STAGES : "Négociation" est bien intercalée entre "Devis envoyé" et "Gagné"', () => {
  const w = setup();
  // .join() plutôt que deepEqual sur le tableau : les valeurs viennent du
  // contexte vm (autre realm que ce fichier de test), assert.deepEqual les
  // compare alors comme non "reference-equal" bien que le contenu soit
  // identique — comparer des chaînes primitives évite le problème.
  const cles = w.__getProspStages().map(s => s.key).join(',');
  assert.ok(cles.endsWith('devis_envoye,negociation,gagne,perdu'));
});

test('etapeToKey / keyToEtape : aller-retour correct pour "Négociation"', () => {
  const w = setup();
  assert.equal(w.etapeToKey('Négociation'), 'negociation');
  assert.equal(w.keyToEtape('negociation'), 'Négociation');
});

test('openProspCard : affiche un lien vers la fiche contact quand l\'email correspond à un contact existant', () => {
  const w = setup({
    prospects: [{ id: 'p1', agence: 'Century 21 Évry', email: 'contact@century21.fr', etape: 'a_contacter' }],
    contacts: [{ id: 'c1', entreprise: 'Century 21 Évry', email: 'CONTACT@century21.fr' }]
  });
  w.openProspCard('p1');
  const lien = w.document.getElementById('pp-lien-contact');
  assert.equal(lien.style.display, 'block');
  assert.ok(lien.innerHTML.includes('Century 21'));
  assert.ok(lien.innerHTML.includes("openFiche('c1')"), "doit ouvrir la fiche du contact correspondant (comparaison email insensible à la casse)");
});

test('openProspCard : masque le lien quand aucun contact ne correspond', () => {
  const w = setup({
    prospects: [{ id: 'p1', agence: 'Agence inconnue', email: 'x@inconnue.fr', etape: 'a_contacter' }],
    contacts: [{ id: 'c1', entreprise: 'Autre agence', email: 'autre@agence.fr' }]
  });
  w.openProspCard('p1');
  assert.equal(w.document.getElementById('pp-lien-contact').style.display, 'none');
});

test('moveProspect vers "perdu" : conserve le motif au lieu de supprimer la carte (contrairement à l\'ancien pipeline)', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'devis_envoye' }] });
  w.prompt = () => 'Budget insuffisant';
  w.moveProspect('p1', 'perdu');
  const p = w.__getDB().prospects.find(x => x.id === 'p1');
  assert.equal(p.etape, 'perdu');
  assert.equal(p.motifPerte, 'Budget insuffisant');
});

test('moveProspect vers "perdu" : motif laissé vide n\'écrase rien', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'devis_envoye' }] });
  w.prompt = () => '';
  w.moveProspect('p1', 'perdu');
  const p = w.__getDB().prospects.find(x => x.id === 'p1');
  assert.equal(p.etape, 'perdu');
  assert.equal(p.motifPerte, undefined);
});

test('moveProspect vers "gagne" : demande le CA et le mémorise sur le prospect (plus de doublon dans un pipeline séparé)', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'devis_envoye' }] });
  w.prompt = () => '350';
  w.moveProspect('p1', 'gagne');
  const p = w.__getDB().prospects.find(x => x.id === 'p1');
  assert.equal(p.etape, 'gagne');
  assert.equal(p.ca, 350);
  assert.equal(w.__getDB().deals, undefined, 'DB.deals ne doit plus exister : un seul pipeline désormais');
});
