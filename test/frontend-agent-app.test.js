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
  <input type="email" id="login-email">
  <button id="login-btn"></button>
  <div id="login-msg"></div>
`;

function chargerAgentApp({ signInWithOtp } = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function renderMissions'));
  if (!inline) throw new Error('Script inline introuvable dans agent-app.html');

  const dom = new JSDOM(`<!DOCTYPE html><html><body>${DOM_MINIMAL}</body></html>`, { runScripts: 'outside-only', url: 'https://app.lokentia.fr/' });
  const ctx = dom.getInternalVMContext();
  dom.window.__signInWithOtp = signInWithOtp || (async () => ({ error: null }));
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {}),
      signInWithOtp: (...args) => window.__signInWithOtp(...args),
      signOut: async () => {},
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

// ─── Mes documents (contrat / avenant déposés par l'agence) ──────────
test('renderDocuments : liste vide si ni contrat ni avenant', () => {
  const w = chargerAgentApp();
  w.renderDocuments({ contrat: false, avenant: false });
  assert.ok(w.document.getElementById('documents-list').textContent.includes('Aucun document'));
});

test('renderDocuments : n\'affiche que les documents réellement déposés', () => {
  const w = chargerAgentApp();
  w.renderDocuments({ contrat: true, avenant: false });
  const html = w.document.getElementById('documents-list').innerHTML;
  assert.ok(html.includes('Contrat signé'));
  assert.ok(!html.includes('Avenant'));
});

test('renderDocuments : ne fait jamais référence aux états des lieux (rapports EDL)', () => {
  const w = chargerAgentApp();
  w.renderDocuments({ contrat: true, avenant: true });
  const html = w.document.getElementById('documents-list').innerHTML.toLowerCase();
  assert.ok(!html.includes('état des lieux'));
  assert.ok(!html.includes('rapport'));
});

test('renderDocuments : tolère documents absent/undefined sans erreur', () => {
  const w = chargerAgentApp();
  assert.doesNotThrow(() => w.renderDocuments(undefined));
  assert.ok(w.document.getElementById('documents-list').textContent.includes('Aucun document'));
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

// ─── Téléchargement à la demande (jamais de lien permanent stocké) ────
test('telechargerDocument : appelle agent-document-download avec le type, ouvre l\'URL signée reçue', async () => {
  const w = chargerAgentApp();
  let appelFetch = null;
  let appelOpen = null;
  w.fetch = async (url, opts) => { appelFetch = { url, corps: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ url: 'https://exemple.fr/signe?token=abc' }) }; };
  w.open = (u) => { appelOpen = u; };

  const btn = w.document.createElement('button');
  btn.innerHTML = '<i class="ti ti-download"></i> Télécharger';
  await w.telechargerDocument('contrat', btn);

  assert.equal(appelFetch.url, '/api/agent-document-download');
  assert.deepEqual(appelFetch.corps, { type: 'contrat' });
  assert.equal(appelOpen, 'https://exemple.fr/signe?token=abc');
  assert.equal(btn.disabled, false, 'le bouton doit être réactivé après le téléchargement');
});

test('telechargerDocument : document indisponible → alerte, pas d\'ouverture d\'URL', async () => {
  const w = chargerAgentApp();
  let appelOpen = null;
  w.fetch = async () => ({ ok: false, json: async () => ({ error: 'Document non disponible pour l\'instant' }) });
  w.open = (u) => { appelOpen = u; };
  w.alert = () => {};

  const btn = w.document.createElement('button');
  await w.telechargerDocument('avenant', btn);

  assert.equal(appelOpen, null);
});

// ─── Connexion : blocage du lien magique pour un email non enregistré ────
test('sendMagicLink : email non enregistré → message de refus, aucun lien envoyé', async () => {
  let otpAppele = false;
  const w = chargerAgentApp({ signInWithOtp: async () => { otpAppele = true; return { error: null }; } });
  w.document.getElementById('login-email').value = 'inconnu@exemple.fr';
  w.fetch = async (url) => {
    assert.equal(url, '/api/agent-check-email');
    return { json: async () => ({ registered: false }) };
  };

  await w.sendMagicLink();

  assert.equal(otpAppele, false, 'signInWithOtp ne doit jamais être appelé pour un email non enregistré');
  const msg = w.document.getElementById('login-msg');
  assert.ok(msg.textContent.includes('enregistré'));
  assert.equal(w.document.getElementById('login-btn').disabled, false, 'le bouton doit être réactivé pour permettre un nouvel essai');
});

test('sendMagicLink : email enregistré → vérifie puis envoie le lien magique', async () => {
  let otpAppele = null;
  const w = chargerAgentApp({ signInWithOtp: async (args) => { otpAppele = args; return { error: null }; } });
  w.document.getElementById('login-email').value = 'jean@exemple.fr';
  let appelCheck = null;
  w.fetch = async (url, opts) => {
    appelCheck = { url, corps: JSON.parse(opts.body) };
    return { json: async () => ({ registered: true }) };
  };

  await w.sendMagicLink();

  assert.equal(appelCheck.url, '/api/agent-check-email');
  assert.deepEqual(appelCheck.corps, { email: 'jean@exemple.fr' });
  assert.ok(otpAppele, 'signInWithOtp doit être appelé pour un email enregistré');
  assert.equal(otpAppele.email, 'jean@exemple.fr');
  assert.ok(w.document.getElementById('login-msg').textContent.includes('envoyé'));
});

test('sendMagicLink : email invalide → refusé avant tout appel réseau', async () => {
  let fetchAppele = false;
  const w = chargerAgentApp();
  w.document.getElementById('login-email').value = 'pas-un-email';
  w.fetch = async () => { fetchAppele = true; return { json: async () => ({ registered: true }) }; };

  await w.sendMagicLink();

  assert.equal(fetchAppele, false);
  assert.ok(w.document.getElementById('login-msg').textContent.includes('invalide'));
});
