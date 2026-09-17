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
