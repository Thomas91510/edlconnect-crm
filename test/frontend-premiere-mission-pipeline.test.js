// Brique 3 de la refonte du pipeline commercial : la toute première mission
// d'une agence jamais vue la fait apparaître automatiquement en "Gagné" dans
// le pipeline (js/app-config.js, notifierPremiereMissionAgence), appelée
// juste après DB.missions.push(mission) aux 3 endroits qui créent une
// mission (app-agenda.js, app-reservations.js x2). Zone à risque : ne doit
// jamais dupliquer une carte existante, jamais faire reculer une carte déjà
// "Gagné"/"Perdu", et ne jamais confondre le tarif ponctuel d'un EDL avec le
// CA mensuel estimé du prospect (deux grandeurs différentes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `<div id="notif"></div>`;

function setup({ missions = [], prospects = [] } = {}) {
  const codeSetup = `
    _supaReady = false;
    DB.missions = ${JSON.stringify(missions)};
    DB.prospects = ${JSON.stringify(prospects)};
    window.__getDB = function(){ return DB; };
  `;
  const { window } = chargerScripts(['app-config.js'], HTML, codeSetup);
  window.renderProspection = () => {};
  window.pushToSupabase = () => {};
  return window;
}

test('notifierPremiereMissionAgence : crée une carte "Gagné" pour une agence jamais vue, sans prospect existant', () => {
  const mission = { agence: 'Nouvelle Agence', emailClient: 'contact@nouvelle-agence.fr', montant: 90 };
  const w = setup({ missions: [mission] }); // la mission elle-même est déjà dans DB.missions au moment de l'appel
  w.notifierPremiereMissionAgence(mission);

  const prospects = w.__getDB().prospects;
  assert.equal(prospects.length, 1);
  assert.equal(prospects[0].agence, 'Nouvelle Agence');
  assert.equal(prospects[0].etape, 'gagne');
  assert.equal(prospects[0].ca, null, 'le tarif ponctuel de l\'EDL ne doit jamais être reporté sur le CA mensuel estimé');
});

test('notifierPremiereMissionAgence : fait avancer une carte prospect existante (par email) au lieu d\'en créer une seconde', () => {
  const mission = { agence: 'Century 21 Évry', emailClient: 'M.DUPONT@century21.fr', montant: 120 };
  const w = setup({
    missions: [mission],
    prospects: [{ id: 'p1', agence: 'Century 21 Évry', email: 'm.dupont@century21.fr', etape: 'devis_envoye' }]
  });
  w.notifierPremiereMissionAgence(mission);

  const prospects = w.__getDB().prospects;
  assert.equal(prospects.length, 1, 'ne doit pas créer de doublon');
  assert.equal(prospects[0].etape, 'gagne');
});

test('notifierPremiereMissionAgence : ne fait rien si l\'agence a déjà une autre mission (pas la première)', () => {
  const missionExistante = { agence: 'Immo Gestion Era', emailClient: 'x@era.fr' };
  const nouvelleMission = { agence: 'Immo Gestion Era', emailClient: 'x@era.fr' };
  const w = setup({ missions: [missionExistante, nouvelleMission] });
  w.notifierPremiereMissionAgence(nouvelleMission);
  assert.equal(w.__getDB().prospects.length, 0);
});

test('notifierPremiereMissionAgence : ne fait jamais reculer une carte déjà "Perdu"', () => {
  const mission = { agence: 'Agence X', emailClient: 'x@agencex.fr' };
  const w = setup({
    missions: [mission],
    prospects: [{ id: 'p1', agence: 'Agence X', email: 'x@agencex.fr', etape: 'perdu', motifPerte: 'Trop cher' }]
  });
  w.notifierPremiereMissionAgence(mission);
  assert.equal(w.__getDB().prospects[0].etape, 'perdu', 'une décision explicite ne doit pas être écrasée automatiquement');
});

test('notifierPremiereMissionAgence : ignore une mission sans agence renseignée', () => {
  const mission = { agence: '', emailClient: 'x@y.fr' };
  const w = setup({ missions: [mission] });
  w.notifierPremiereMissionAgence(mission);
  assert.equal(w.__getDB().prospects.length, 0);
});
