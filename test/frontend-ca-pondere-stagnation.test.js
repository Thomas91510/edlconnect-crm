// Brique 4 de la refonte du pipeline commercial : CA pondéré (renderCAPanel,
// js/app-config.js) et alerte de stagnation (dashboard + badge kanban).
// Zone à risque : le CA pondéré ne doit compter QUE les prospects actifs
// (pas Gagné/Perdu, sinon double-compte avec le CA déjà signé), et la
// stagnation ne doit jamais s'appliquer à une carte Gagnée/Perdue (une
// décision déjà prise n'est pas "en retard").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div id="prosp-stats"></div>
  <div id="prosp-board"></div>
  <div id="prosp-badge"></div>
  <div id="ca-mensuel"></div><div id="ca-trim"></div><div id="ca-annuel"></div>
  <div id="ca-nb-clients"></div>
  <div id="ca-total-mensuel"></div><div id="ca-total-annuel"></div>
  <table><tbody id="ca-tbody"></tbody></table>
  <div id="ca-pondere-mensuel"></div><div id="ca-pondere-trim"></div><div id="ca-pondere-annuel"></div>
  <div id="ca-pondere-note"></div>
`;

function setup({ prospects = [] } = {}) {
  const codeSetup = `
    _supaReady = false;
    DB.prospects = ${JSON.stringify(prospects)};
    window.__getDB = function(){ return DB; };
  `;
  const { window } = chargerScripts(['app-config.js'], HTML, codeSetup);
  return window;
}

function ilYA(jours) {
  return new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
}

test('renderCAPanel : le CA pondéré ne compte que les prospects actifs, selon la probabilité de leur étape', () => {
  const w = setup({
    prospects: [
      { id: 'p1', agence: 'Devis en cours', etape: 'devis_envoye', ca: 100 }, // 65% -> 65
      { id: 'p2', agence: 'Déjà signé', etape: 'gagne', ca: 500 }, // exclu (déjà dans le CA "gagné", pas une prévision)
      { id: 'p3', agence: 'Perdu', etape: 'perdu', ca: 200 } // exclu
    ]
  });
  w.renderCAPanel();
  assert.equal(w.document.getElementById('ca-pondere-mensuel').innerHTML.includes('65'), true);
  assert.equal(w.document.getElementById('ca-pondere-trim').innerHTML.includes('195'), true);
  assert.equal(w.document.getElementById('ca-pondere-annuel').innerHTML.includes('780'), true);
});

test('renderCAPanel : signale les prospects actifs sans CA renseigné (l\'estimation est alors partielle)', () => {
  const w = setup({
    prospects: [
      { id: 'p1', agence: 'Avec CA', etape: 'devis_envoye', ca: 100 },
      { id: 'p2', agence: 'Sans CA', etape: 'rdv_planifie', ca: null }
    ]
  });
  w.renderCAPanel();
  const note = w.document.getElementById('ca-pondere-note').textContent;
  assert.ok(note.includes('1 autre'), 'doit mentionner le prospect sans CA non comptabilisé');
});

test('prospectsStagnants : ignore les cartes récentes', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'X', etape: 'email_envoye', lastAction: ilYA(2) }] });
  assert.equal(w.prospectsStagnants().length, 0);
});

test('prospectsStagnants : détecte une carte active sans action depuis 14 jours ou plus', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'X', etape: 'email_envoye', lastAction: ilYA(20) }] });
  const s = w.prospectsStagnants();
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'p1');
});

test('prospectsStagnants : ne signale jamais une carte "Gagné" ou "Perdu", même ancienne', () => {
  const w = setup({
    prospects: [
      { id: 'p1', agence: 'Gagné ancien', etape: 'gagne', lastAction: ilYA(90) },
      { id: 'p2', agence: 'Perdu ancien', etape: 'perdu', lastAction: ilYA(90) }
    ]
  });
  assert.equal(w.prospectsStagnants().length, 0, 'une décision déjà prise n\'est pas "en retard"');
});

test('prospectsStagnants : se base sur createdAt quand lastAction est absent', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'X', etape: 'a_contacter', createdAt: ilYA(15) }] });
  assert.equal(w.prospectsStagnants().length, 1);
});

test('renderProspection : affiche un badge de stagnation sur la carte concernée', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Stagnante', etape: 'email_envoye', lastAction: ilYA(30) }] });
  w.renderProspection();
  assert.ok(w.document.getElementById('prosp-board').innerHTML.includes('sans action'));
});

test('renderProspection : aucun badge pour une carte active récente', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Récente', etape: 'email_envoye', lastAction: ilYA(1) }] });
  w.renderProspection();
  assert.equal(w.document.getElementById('prosp-board').innerHTML.includes('sans action'), false);
});
