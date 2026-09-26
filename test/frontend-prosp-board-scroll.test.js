// Le kanban de prospection compte 9 étapes : plus large que la plupart des
// écrans (Thomas devait dézoomer la page entière pour tout voir). Fix :
// #prosp-board défile dans son propre scroll interne (min-width:0, boutons
// flèches, glisser à la souris via initProspBoardDragScroll — app-config.js).
// Zone à risque : le glissé ne doit jamais avaler le clic normal sur une
// carte ou sur un bouton de carte (déplacer/supprimer/email), et les
// écouteurs ne doivent être posés qu'une fois même si renderProspection()
// est appelé à chaque rendu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div id="prosp-stats"></div>
  <div id="prosp-board"></div>
  <div id="prosp-badge"></div>
`;

function setup({ prospects = [] } = {}) {
  const codeSetup = `
    _supaReady = false;
    DB.prospects = ${JSON.stringify(prospects)};
  `;
  const { window } = chargerScripts(['app-config.js'], HTML, codeSetup);
  return window;
}

function glisser(w, board, { de, a }) {
  board.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: de }));
  w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: a }));
  w.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

test('initProspBoardDragScroll : ne lie les écouteurs qu\'une seule fois même si renderProspection est rappelé', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'a_contacter' }] });
  const board = w.document.getElementById('prosp-board');
  let liaisonsMousedown = 0;
  const original = board.addEventListener.bind(board);
  board.addEventListener = (type, ...reste) => {
    if (type === 'mousedown') liaisonsMousedown++;
    return original(type, ...reste);
  };
  w.renderProspection();
  w.renderProspection();
  w.renderProspection();
  assert.equal(liaisonsMousedown, 1, 'un seul appel initial doit poser les écouteurs, les suivants doivent no-op');
});

// Le harnais (runScripts:'outside-only') n'exécute pas les attributs
// onclick="..." du HTML généré : on ne peut donc pas observer si
// openProspCard() a été appelé. On vérifie plutôt directement ce qui est
// mécaniquement testable — le clic atteint (ou non) la carte cible — via
// un vrai addEventListener posé sur la carte, ce qui reflète fidèlement le
// sort de l'attribut onclick réel (si l'événement n'atteint jamais la
// carte, son onclick ne se déclencherait pas non plus en production).
test('glisser le kanban sur plus de 5px empêche le clic (au relâchement) d\'atteindre la carte survolée', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'a_contacter' }] });
  w.renderProspection();
  const board = w.document.getElementById('prosp-board');
  const card = board.querySelector('.prosp-card');
  let atteinte = false;
  card.addEventListener('click', () => { atteinte = true; });

  glisser(w, board, { de: 100, a: 140 });
  card.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(atteinte, false, 'le clic issu d\'un glissé ne doit jamais atteindre la carte (donc jamais l\'ouvrir)');
});

test('un simple clic sans glisser atteint bien la carte (pas de régression)', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'a_contacter' }] });
  w.renderProspection();
  const board = w.document.getElementById('prosp-board');
  const card = board.querySelector('.prosp-card');
  let atteinte = false;
  card.addEventListener('click', () => { atteinte = true; });

  card.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(atteinte, true);
});

test('un mousedown sur un bouton de la carte (ex. supprimer) ne déclenche pas le mode glissé', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'a_contacter' }] });
  w.renderProspection();
  const board = w.document.getElementById('prosp-board');
  const btnSupprimer = board.querySelector('.prosp-card button');

  btnSupprimer.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 50 }));

  assert.equal(board.classList.contains('dragging'), false, 'un clic sur un bouton de carte ne doit jamais lancer un glissé du kanban');
});

test('un déplacement de moins de 5px reste un simple clic (tolérance anti-tremblement)', () => {
  const w = setup({ prospects: [{ id: 'p1', agence: 'Agence X', etape: 'a_contacter' }] });
  w.renderProspection();
  const board = w.document.getElementById('prosp-board');
  const card = board.querySelector('.prosp-card');
  let atteinte = false;
  card.addEventListener('click', () => { atteinte = true; });

  glisser(w, board, { de: 100, a: 102 });
  card.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(atteinte, true, 'un micro-mouvement de souris ne doit pas être confondu avec un glissé volontaire');
});
