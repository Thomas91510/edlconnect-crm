// Vérifie que modifier la date/heure d'une mission déjà confirmée (modale
// "Modifier la mission", js/app-missions.js) prévient l'agence et le(s)
// locataire(s) par email — sans ça, un changement d'horaire passe inaperçu
// tant que le rappel J-1 n'a pas été relu (cas réel du 19/09, 12h -> 11h).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div id="modal-mission"></div>
  <div id="modal-mission-title"></div>
  <button id="mission-save-btn"></button>
  <input id="m-agence"><input id="m-email"><input id="m-adresse">
  <input id="m-montant"><textarea id="m-notes"></textarea>
  <select id="m-type"><option value="EDL entrant" selected>EDL entrant</option></select>
  <select id="m-statut">
    <option value="planifiée" selected>planifiée</option>
    <option value="annulée">annulée</option>
  </select>
  <input type="text" id="m-date">
  <!-- type="text" ici (au lieu de datetime-local comme en prod) : jsdom
       sanitise/rejette silencieusement certaines valeurs sur les inputs
       datetime-local, sans rapport avec la logique testée (saveEditMission
       lit .value en texte brut quel que soit le type de l'input). -->
`;

function setup(mission) {
  const codeSetup = `
    _supaReady = false;
    _editMissionIdx = 0;
    DB.missions = [${JSON.stringify(mission)}];
    window.__getMission = function(){ return DB.missions[0]; };
    // saveMission (app-agenda.js, non chargé ici) et supabaseClient (déclaré
    // "let" dans app-cloud.js — une affectation window.supabaseClient = ...
    // depuis l'extérieur n'atteindrait pas ce binding lexical, cf.
    // test/_lib/frontend-env.js) : neutralisés/stubbés dans ce même contexte.
    saveMission = function(){};
    supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  `;
  const { window } = chargerScripts(['app-cloud.js', 'app-core.js', 'app-contacts.js', 'app-missions.js'], HTML, codeSetup);
  // Rendus pleine page hors périmètre de ce test (dépendent de bien plus
  // d'état/DOM que ce qu'on reproduit ici) : neutralisés, comme pushToSupabase.
  window.pushToSupabase = () => {};
  window.renderMissions = () => {};
  window.renderDashboard = () => {};
  return window;
}

function remplirFormulaire(w, { agence = 'Agence Test', email = '', adresse = '12 rue Test', montant = '100', statut = 'planifiée', date }) {
  w.document.getElementById('m-agence').value = agence;
  w.document.getElementById('m-email').value = email;
  w.document.getElementById('m-adresse').value = adresse;
  w.document.getElementById('m-montant').value = montant;
  w.document.getElementById('m-statut').value = statut;
  w.document.getElementById('m-date').value = date;
}

test('saveEditMission : un changement d\'heure sur un RDV déjà confirmé déclenche notifierChangementHoraireMission', () => {
  const w = setup({ id: 'm1', statut: 'planifiée', date: '2026-09-19T12:00:00', rdvConfirme: true, locataireEmail: 'loc@test.fr' });
  let appele = null;
  w.notifierChangementHoraireMission = (m, ancienneDate) => { appele = { m, ancienneDate }; };
  remplirFormulaire(w, { date: '2026-09-19T11:00:00' });
  w.saveEditMission();
  assert.ok(appele, 'notifierChangementHoraireMission doit être appelée');
  assert.equal(appele.ancienneDate, '2026-09-19T12:00:00');
  assert.equal(appele.m.date, '2026-09-19T11:00:00');
});

test('saveEditMission : aucune notification si la date n\'a pas changé', () => {
  const w = setup({ id: 'm1', statut: 'planifiée', date: '2026-09-19T12:00:00', rdvConfirme: true, locataireEmail: 'loc@test.fr' });
  let appele = false;
  w.notifierChangementHoraireMission = () => { appele = true; };
  remplirFormulaire(w, { date: '2026-09-19T12:00:00' });
  w.saveEditMission();
  assert.equal(appele, false);
});

test('saveEditMission : aucune notification de changement d\'horaire si le RDV n\'était pas encore confirmé', () => {
  const w = setup({ id: 'm1', statut: 'planifiée', date: '2026-09-19T12:00:00', rdvConfirme: false, locataireEmail: 'loc@test.fr' });
  let appele = false;
  w.notifierChangementHoraireMission = () => { appele = true; };
  remplirFormulaire(w, { date: '2026-09-19T11:00:00' });
  w.saveEditMission();
  assert.equal(appele, false);
});

test('saveEditMission : passer en "annulée" en même temps qu\'un changement de date ne notifie que l\'annulation', () => {
  const w = setup({ id: 'm1', statut: 'planifiée', date: '2026-09-19T12:00:00', rdvConfirme: true, locataireEmail: 'loc@test.fr' });
  let annulationAppelee = false, horaireAppele = false;
  w.notifierAnnulationMission = () => { annulationAppelee = true; };
  w.notifierChangementHoraireMission = () => { horaireAppele = true; };
  remplirFormulaire(w, { date: '2026-09-19T11:00:00', statut: 'annulée' });
  w.saveEditMission();
  assert.equal(annulationAppelee, true);
  assert.equal(horaireAppele, false, 'ne doit pas envoyer les deux notifications à la fois');
});

test('notifierChangementHoraireMission : envoie un email à chaque destinataire avec l\'ancien et le nouvel horaire', async () => {
  const w = setup({ id: 'm1', adresse: '12 rue Test', locataireEmail: 'loc@test.fr', emailClient: 'agence@test.fr' });
  const appels = [];
  w.fetch = async (url, opts) => { appels.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({}) }; };

  const m = w.__getMission();
  m.date = '2026-09-19T11:00:00';
  await w.notifierChangementHoraireMission(m, '2026-09-19T12:00:00');

  assert.equal(appels.length, 2, 'un email par destinataire (agence + locataire)');
  const destinataires = appels.map(a => a.body.to[0].email).sort();
  assert.deepEqual(destinataires, ['agence@test.fr', 'loc@test.fr']);
  assert.ok(appels[0].body.subject.includes('déplacé'));
  assert.ok(appels[0].body.textContent.includes('12:00'), 'ancien horaire mentionné');
  assert.ok(appels[0].body.textContent.includes('11:00'), 'nouvel horaire mentionné');
});

test('notifierChangementHoraireMission : ne fait rien si aucun destinataire connu', async () => {
  const w = setup({ id: 'm1', adresse: '12 rue Test' });
  let appele = false;
  w.fetch = async () => { appele = true; return { ok: true, json: async () => ({}) }; };
  const m = w.__getMission();
  await w.notifierChangementHoraireMission(m, '2026-09-19T12:00:00');
  assert.equal(appele, false);
});
