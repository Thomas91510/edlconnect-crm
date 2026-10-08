// Refonte V2 : rôles administrateur / assistante (js/app-equipe.js) et
// navigation par rubriques (nav(), js/app-contacts.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML_NAV = `
  <div id="sidebar">
    <button class="nav-item" data-section="missions" data-perm="missions" onclick="nav('missions')">Missions</button>
    <button class="nav-item" data-section="prospection" data-perm="prospection" onclick="nav('prospection')">Prospection</button>
    <span id="resa-nav-badge" style="display:none"></span>
    <div style="display:none"><button id="nav-brevo" style="display:none"></button></div>
  </div>
  <span id="sidebar-role"></span>
  <div id="apercu-role-bandeau"></div>
  <div class="main">
    <div class="section-tabs-bar" id="section-tabs-bar"><div id="section-tabs"></div></div>
    <div class="view active" id="view-dashboard"></div>
    <div class="view" id="view-reservations"></div>
    <div class="view" id="view-missions"></div>
    <div class="view" id="view-agenda"></div>
    <div class="view" id="view-prospection"></div>
  </div>
  <div class="kpi" data-perm="ca" id="kpi-ca"></div>
`;

// Les rendus lourds des vues ne sont pas l'objet de ces tests.
const NEUTRALISER = `
  renderDashboard=()=>{}; renderMissions=()=>{}; renderCalendar=()=>{};
  loadReservations=()=>{}; renderProspection=()=>{}; autoFillAllContacts=()=>{};
  updateMobileNav=()=>{}; closeMobileSidebar=()=>{};
  sessionStorage.clear(); localStorage.clear();
`;

function charger(setup = '') {
  return chargerScripts(['app-contacts.js', 'app-reservations.js', 'app-equipe.js'], HTML_NAV, NEUTRALISER + setup);
}

test('administrateur : tous les droits, y compris ceux réservés', () => {
  const { window: w } = charger();
  assert.equal(w.roleCourant(), 'admin');
  assert.equal(w.peut('ca'), true);
  assert.equal(w.peut('utilisateurs'), true);
});

test('assistante : droits par défaut — quotidien oui, CA / prospection / utilisateurs non', () => {
  const { window: w } = charger(`sessionStorage.setItem('lokentia-apercu-role','assistante');`);
  assert.equal(w.roleCourant(), 'assistante');
  assert.equal(w.peut('missions'), true);
  assert.equal(w.peut('reservations'), true);
  assert.equal(w.peut('ca'), false);
  assert.equal(w.peut('prospection'), false);
  assert.equal(w.peut('utilisateurs'), false);
  assert.equal(w.peut('dashboard'), true, "l'accueil reste toujours accessible");
});

test('assistante : un droit réservé à l’administrateur ne peut jamais être accordé', () => {
  const { window: w } = charger(`
    sessionStorage.setItem('lokentia-apercu-role','assistante');
    localStorage.setItem('lokentia-droits-assistante', JSON.stringify({ utilisateurs:true, prospection:true }));
  `);
  assert.equal(w.peut('utilisateurs'), false);
  assert.equal(w.peut('prospection'), true, 'un droit délégable activé est bien pris en compte');
  w.enregistrerDroitAssistante('utilisateurs', true);
  assert.equal(w.peut('utilisateurs'), false);
});

test('appliquerDroits : masque les éléments non autorisés et affiche le bandeau d’aperçu', () => {
  const { window: w, document: d } = charger(`sessionStorage.setItem('lokentia-apercu-role','assistante');`);
  w.appliquerDroits();
  assert.ok(d.getElementById('kpi-ca').hasAttribute('data-perm-masque'));
  assert.ok(d.querySelector('[data-section="prospection"]').hasAttribute('data-perm-masque'));
  assert.ok(!d.querySelector('[data-section="missions"]').hasAttribute('data-perm-masque'));
  assert.ok(d.getElementById('apercu-role-bandeau').classList.contains('show'));
  assert.match(d.getElementById('sidebar-role').textContent, /Assistante/);
});

test('nav : une vue interdite au rôle renvoie vers l’accueil', () => {
  const { window: w, document: d } = charger(`sessionStorage.setItem('lokentia-apercu-role','assistante');`);
  w.nav('prospection');
  assert.ok(d.getElementById('view-dashboard').classList.contains('active'));
  assert.ok(!d.getElementById('view-prospection').classList.contains('active'));
});

test('nav : la rubrique Missions regroupe Réservations, Missions et Agenda en onglets', () => {
  const { window: w, document: d } = charger();
  w.nav('agenda');
  assert.ok(d.getElementById('section-tabs-bar').classList.contains('show'));
  const onglets = Array.from(d.querySelectorAll('#section-tabs .section-tab')).map(b => b.textContent.trim());
  assert.deepEqual(onglets, ['Réservations', 'Missions', 'Agenda']);
  assert.equal(d.querySelector('#section-tabs .section-tab.active').textContent.trim(), 'Agenda');
  // L'entrée de menu "Missions" reste allumée sur l'onglet Agenda.
  assert.ok(d.querySelector('[data-section="missions"]').classList.contains('active'));
});

test('nav : une rubrique à vue unique n’affiche pas d’onglets', () => {
  const { window: w, document: d } = charger();
  w.nav('prospection');
  assert.ok(!d.getElementById('section-tabs-bar').classList.contains('show'));
});
