// Vérifie le rendu côté agent-app.html : les KPI, la liste des missions, et
// surtout que les champs venant de données saisies par un tiers (adresse,
// nom du locataire — remplis via le formulaire public de réservation) sont
// échappés avant insertion en innerHTML (anti-XSS), comme partout ailleurs
// dans le CRM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '..', 'agent-app.html');

const DOM_MINIMAL = `
  <div id="kpi-grid"></div>
  <div id="kpi-typologies"></div>
  <div id="missions-list"></div>
  <div id="documents-list"></div>
  <div id="historique-list"></div>
  <div id="page-missions" class="page active"></div>
  <div id="page-documents" class="page"></div>
  <div id="page-historique" class="page"></div>
  <div id="page-aide" class="page"></div>
  <button class="nav-btn active" data-page="missions"></button>
  <button class="nav-btn" data-page="documents"></button>
  <button class="nav-btn" data-page="historique"></button>
  <button class="nav-btn" data-page="aide"></button>
`;

function chargerAgentApp() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function renderMissions'));
  if (!inline) throw new Error('Script inline introuvable dans agent-app.html');

  const dom = new JSDOM(`<!DOCTYPE html><html><body>${DOM_MINIMAL}</body></html>`, { runScripts: 'outside-only', url: 'https://app.lokentia.fr/' });
  const ctx = dom.getInternalVMContext();
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {})
    } }) };
  `, { filename: 'stub-supabase.js' }).runInContext(ctx);
  new vm.Script(inline, { filename: 'inline.js' }).runInContext(ctx);
  return dom.window;
}

test('categorieEdl : classe les 4 catégories réelles du CRM (identique au serveur)', () => {
  const w = chargerAgentApp();
  assert.equal(w.categorieEdl('EDL entrant'), 'entrant');
  assert.equal(w.categorieEdl('EDL sortant'), 'sortant');
  assert.equal(w.categorieEdl('EDL Sortant / Entrant'), 'simultane');
  assert.equal(w.categorieEdl('Pré-état des lieux'), 'autre');
});

test('fmtDateHeure : formate une date ISO, tolère une date absente', () => {
  const w = chargerAgentApp();
  assert.equal(w.fmtDateHeure(''), 'Date à confirmer');
  assert.match(w.fmtDateHeure('2026-09-21T14:30:00'), /14:30/);
});

test('renderKpi : affiche les 6 tuiles avec les bons nombres', () => {
  const w = chargerAgentApp();
  w.renderKpi({ total: 5, parCategorie: { entrant: 2, sortant: 1, simultane: 1, autre: 1 }, meuble: 3, nu: 2, parTypologie: { T2: 2, T3: 1 } });

  const grid = w.document.getElementById('kpi-grid');
  const nombres = [...grid.querySelectorAll('.n')].map(el => el.textContent);
  assert.deepEqual(nombres, ['5', '2', '1', '1', '3', '2']);

  const typoWrap = w.document.getElementById('kpi-typologies');
  assert.ok(typoWrap.innerHTML.includes('T2'));
  assert.ok(typoWrap.innerHTML.includes('T3'));
});

test('renderKpi : les typologies à zéro n\'apparaissent pas', () => {
  const w = chargerAgentApp();
  w.renderKpi({ total: 1, parCategorie: { entrant: 1, sortant: 0, simultane: 0, autre: 0 }, meuble: 0, nu: 0, parTypologie: { T1: 1, T2: 0 } });
  const html = w.document.getElementById('kpi-typologies').innerHTML;
  assert.ok(html.includes('T1'));
  assert.ok(!html.includes('T2'));
});

test('renderMissions : liste vide affiche un message, pas d\'erreur', () => {
  const w = chargerAgentApp();
  w.renderMissions([]);
  assert.ok(w.document.getElementById('missions-list').textContent.includes('Aucune mission'));
});

test('renderMissions : échappe l\'adresse et le nom du locataire (anti-XSS)', () => {
  const w = chargerAgentApp();
  w.renderMissions([{
    id: 'm1',
    type: 'EDL entrant',
    adresse: '<img src=x onerror=alert(1)>',
    locataireNom: '<script>alert(2)</script>',
    locataireTel: '0600000000',
    statut: 'planifiée',
  }]);

  const html = w.document.getElementById('missions-list').innerHTML;
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'l\'adresse ne doit jamais être injectée telle quelle');
  assert.ok(!html.includes('<script>alert(2)</script>'), 'le nom du locataire ne doit jamais être injecté tel quel');
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderMissions : affiche les infos utiles (adresse, type, locataire, accès)', () => {
  const w = chargerAgentApp();
  w.renderMissions([{
    id: 'm1', type: 'EDL sortant', adresse: '12 rue de la Paix', bienTypo: 'T2', bienMeuble: 'Meublé',
    locataireNom: 'Jean Dupont', locataireTel: '0612345678', acces: 'Code 1234', statut: 'planifiée',
  }]);
  const html = w.document.getElementById('missions-list').innerHTML;
  assert.ok(html.includes('12 rue de la Paix'));
  assert.ok(html.includes('Jean Dupont'));
  assert.ok(html.includes('0612345678'));
  assert.ok(html.includes('Code 1234'));
});

// ─── Navigation (menu de droite) ───────────────────────────────────
test('allerAgentPage : bascule la page et le bouton actifs', () => {
  const w = chargerAgentApp();
  w.allerAgentPage('documents');

  assert.ok(w.document.getElementById('page-documents').classList.contains('active'));
  assert.ok(!w.document.getElementById('page-missions').classList.contains('active'));
  assert.ok(w.document.querySelector('.nav-btn[data-page="documents"]').classList.contains('active'));
  assert.ok(!w.document.querySelector('.nav-btn[data-page="missions"]').classList.contains('active'));
});

// ─── Mes documents (rapport EDL) ────────────────────────────────────
test('renderDocuments : liste vide si aucune mission n\'a de rapport', () => {
  const w = chargerAgentApp();
  w.renderDocuments([{ id: 'm1', adresse: 'x' }, { id: 'm2', rapportUrl: '' }]);
  assert.ok(w.document.getElementById('documents-list').textContent.includes('Aucun document'));
});

test('renderDocuments : n\'affiche que les missions avec un rapportUrl, avec un lien de téléchargement', () => {
  const w = chargerAgentApp();
  w.renderDocuments([
    { id: 'm1', adresse: '12 rue de la Paix', date: '2026-09-10T10:00:00', rapportUrl: 'https://exemple.fr/rapport.pdf' },
    { id: 'm2', adresse: '5 rue de Rivoli', rapportUrl: '' },
  ]);
  const html = w.document.getElementById('documents-list').innerHTML;
  assert.ok(html.includes('12 rue de la Paix'));
  assert.ok(!html.includes('5 rue de Rivoli'));
  assert.ok(html.includes('href="https://exemple.fr/rapport.pdf"'));
});

test('renderDocuments : échappe une adresse malveillante dans le lien affiché (anti-XSS)', () => {
  const w = chargerAgentApp();
  w.renderDocuments([{ id: 'm1', adresse: '<img src=x onerror=alert(1)>', rapportUrl: 'https://exemple.fr/r.pdf' }]);
  const html = w.document.getElementById('documents-list').innerHTML;
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
});

// ─── Historique par mois ─────────────────────────────────────────
test('renderHistorique : ne retient que les missions "terminée"', () => {
  const w = chargerAgentApp();
  w.renderHistorique([
    { id: 'm1', statut: 'terminée', date: '2026-09-10T10:00:00' },
    { id: 'm2', statut: 'planifiée', date: '2026-09-15T10:00:00' },
  ]);
  const html = w.document.getElementById('historique-list').innerHTML;
  assert.equal((html.match(/class="mission"/g) || []).length, 1);
});

test('renderHistorique : regroupe par mois, le plus récent en premier', () => {
  const w = chargerAgentApp();
  w.renderHistorique([
    { id: 'm-juillet', statut: 'terminée', date: '2026-07-05T10:00:00', adresse: 'Juillet' },
    { id: 'm-sept-1', statut: 'terminée', date: '2026-09-10T10:00:00', adresse: 'Sept 1' },
    { id: 'm-sept-2', statut: 'terminée', date: '2026-09-20T10:00:00', adresse: 'Sept 2' },
  ]);
  const html = w.document.getElementById('historique-list').innerHTML;
  const posSept = html.indexOf('septembre');
  const posJuillet = html.indexOf('juillet');
  assert.ok(posSept >= 0 && posJuillet >= 0);
  assert.ok(posSept < posJuillet, 'septembre (plus récent) doit apparaître avant juillet');
  assert.ok(html.includes('2 missions'));
});

test('renderHistorique : aucune mission terminée → message vide, pas d\'erreur', () => {
  const w = chargerAgentApp();
  w.renderHistorique([{ id: 'm1', statut: 'planifiée' }]);
  assert.ok(w.document.getElementById('historique-list').textContent.includes('Aucune mission terminée'));
});
