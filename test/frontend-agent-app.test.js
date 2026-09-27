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
  <div id="page-compte" class="page"></div>
  <button class="nav-btn active" data-page="missions"></button>
  <button class="nav-btn" data-page="documents"></button>
  <button class="nav-btn" data-page="historique"></button>
  <button class="nav-btn" data-page="aide"></button>
  <button class="nav-btn" data-page="compte"></button>
  <input type="email" id="login-email">
  <button id="login-btn"></button>
  <div id="login-msg"></div>

  <h2 id="welcome-titre"></h2>
  <span id="sidenav-avatar"></span>
  <span id="sidenav-nom"></span>
  <span id="sidenav-email"></span>
  <div id="compte-avatar"></div>
  <div id="compte-nom"></div>
  <input id="compte-champ-nom">
  <input id="compte-champ-email">
  <input id="compte-champ-tel">
  <div class="adresse-wrap">
    <input id="compte-champ-adresse" oninput="onSaisieAdresseAgent()">
    <div id="compte-adresse-suggestions" class="adresse-suggestions"></div>
  </div>
  <button id="btn-save-adresse">Enregistrer</button>
  <table><tbody id="bareme-affiche"></tbody></table>

  <span id="zone-status-badge" class="zone-status-badge neutral"><span class="dot"></span></span>
  <span id="count-primaire">0</span>
  <span id="count-secondaire">0</span>
  <div id="map-lock-note"></div>
  <button id="btn-submit-zones"></button>
  <button id="btn-edit-zones" style="display:none"></button>
  <div class="card-body">
    <div class="zones-interactive">
      <select id="select-departement"><option value="">— Choisir —</option></select>
      <div id="cp-grid" class="cp-grid"></div>
      <div id="cp-loading" class="cp-loading"></div>
    </div>
  </div>

  <div class="modal-overlay" id="photo-modal-overlay"></div>
  <input type="file" id="photo-input">
  <div id="drop-zone-content"></div>
  <button id="btn-enregistrer-photo" disabled></button>
  <div id="toast"></div>

  <button id="btn-tuto-edouard"></button>
  <iframe id="frame-tuto-edouard" hidden></iframe>
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
    // Filet de sécurité : tout appel réseau non explicitement stubbé par un
    // test (ex. le fetch réel de geo.api.gouv.fr déclenché par une recherche
    // de commune) doit échouer immédiatement plutôt que de taper le vrai
    // réseau depuis les tests — les appels réels se vérifient sur la preview
    // Vercel, pas ici.
    window.fetch = async () => { throw new Error('fetch non stubbé dans ce test'); };
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

// ─── Mon compte : identité, barème, zones, photo ──────────────────────
test('remplirCompte : affiche le nom, le téléphone, l\'adresse et personnalise la bannière (prénom)', () => {
  const w = chargerAgentApp();
  w.remplirCompte({ nom: 'Julie Berthier', tel: '0612345678', adresse: '3 rue de Rivoli, 75001 Paris', photoUrl: null, bareme: [], secteurPrimaire: [], secteurSecondaire: [] });

  assert.equal(w.document.getElementById('welcome-titre').textContent, 'Bonjour, Julie 👋');
  assert.equal(w.document.getElementById('sidenav-nom').textContent, 'Julie Berthier');
  assert.equal(w.document.getElementById('compte-nom').textContent, 'Julie Berthier');
  assert.equal(w.document.getElementById('compte-champ-nom').value, 'Julie Berthier');
  assert.equal(w.document.getElementById('compte-champ-tel').value, '0612345678');
  assert.equal(w.document.getElementById('compte-champ-adresse').value, '3 rue de Rivoli, 75001 Paris');
});

test('remplirCompte : extrait le bon prénom même au format "NOM Prénom" (ex. LANGLADE Thomas)', () => {
  const w = chargerAgentApp();
  w.remplirCompte({ nom: 'LANGLADE Thomas', tel: '', photoUrl: null, bareme: [], secteurPrimaire: [], secteurSecondaire: [] });
  assert.equal(w.document.getElementById('welcome-titre').textContent, 'Bonjour, Thomas 👋');
});

test('remplirCompte : nom sur un seul mot → utilisé tel quel', () => {
  const w = chargerAgentApp();
  w.remplirCompte({ nom: 'Paul', tel: '', photoUrl: null, bareme: [], secteurPrimaire: [], secteurSecondaire: [] });
  assert.equal(w.document.getElementById('welcome-titre').textContent, 'Bonjour, Paul 👋');
});

test('enregistrerAdresse : envoie l\'adresse saisie et met à jour le champ', async () => {
  const w = chargerAgentApp();
  w.document.getElementById('compte-champ-adresse').value = '12 rue de la Paix, 91000 Évry-Courcouronnes';
  let appel = null;
  w.fetch = async (url, opts) => {
    appel = { url, corps: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ success: true, adresse: '12 rue de la Paix, 91000 Évry-Courcouronnes' }) };
  };

  await w.enregistrerAdresse();

  assert.equal(appel.url, '/api/agent-update-adresse');
  assert.deepEqual(appel.corps, { adresse: '12 rue de la Paix, 91000 Évry-Courcouronnes' });
  assert.equal(w.document.getElementById('compte-champ-adresse').value, '12 rue de la Paix, 91000 Évry-Courcouronnes');
  assert.equal(w.document.getElementById('btn-save-adresse').disabled, false, 'le bouton doit être réactivé après l\'enregistrement');
});

test('enregistrerAdresse : erreur serveur → le bouton reste réactivé pour réessayer', async () => {
  const w = chargerAgentApp();
  w.document.getElementById('compte-champ-adresse').value = 'Adresse test';
  w.fetch = async () => ({ ok: false, json: async () => ({ error: 'Erreur test' }) });

  await w.enregistrerAdresse();

  assert.equal(w.document.getElementById('btn-save-adresse').disabled, false);
});

test('onSaisieAdresseAgent / choisirSuggestionAdresseAgent : recherche puis sélection d\'une suggestion', async () => {
  const w = chargerAgentApp();
  const champ = w.document.getElementById('compte-champ-adresse');
  champ.value = '12 rue de la Paix';
  let urlAppelee = null;
  w.fetch = async (url) => {
    urlAppelee = url;
    return { ok: true, json: async () => ({ features: [{ properties: { label: '12 Rue de la Paix 91000 Évry-Courcouronnes', postcode: '91000' } }] }) };
  };

  w.onSaisieAdresseAgent();
  await new Promise(r => setTimeout(r, 320)); // laisse passer le debounce (300ms)

  assert.ok(urlAppelee.includes('api-adresse.data.gouv.fr'));
  const suggestions = w.document.getElementById('compte-adresse-suggestions');
  assert.ok(suggestions.classList.contains('show'));
  assert.ok(suggestions.innerHTML.includes('Évry-Courcouronnes'));

  w.document.querySelector('.adresse-suggestion').click();
  assert.equal(champ.value, '12 Rue de la Paix 91000 Évry-Courcouronnes');
  assert.ok(!suggestions.classList.contains('show'), 'les suggestions se referment après sélection');
});

test('onSaisieAdresseAgent : moins de 3 caractères → aucune recherche', () => {
  const w = chargerAgentApp();
  w.document.getElementById('compte-champ-adresse').value = 'ab';
  let appele = false;
  w.fetch = async () => { appele = true; };
  w.onSaisieAdresseAgent();
  assert.equal(appele, false);
});

test('appliquerAvatar : sans photo → initiales ; avec photo → image de fond', () => {
  const w = chargerAgentApp();
  w.appliquerAvatar(null, 'Julie Berthier');
  assert.equal(w.document.getElementById('compte-avatar').textContent, 'JB');
  assert.equal(w.document.getElementById('sidenav-avatar').textContent, 'JB');

  w.appliquerAvatar('https://exemple.fr/photo.jpg', 'Julie Berthier');
  assert.equal(w.document.getElementById('compte-avatar').textContent, '');
  assert.ok(w.document.getElementById('compte-avatar').style.backgroundImage.includes('photo.jpg'));
});

test('renderBareme : affiche les lignes (intitulé + montant), message si vide', () => {
  const w = chargerAgentApp();
  w.renderBareme([{ label: 'Secteur primaire', montant: '0' }, { label: 'Secteur secondaire', montant: '18' }]);
  const html = w.document.getElementById('bareme-affiche').innerHTML;
  assert.ok(html.includes('Secteur primaire'));
  assert.ok(html.includes('18'));

  w.renderBareme([]);
  assert.ok(w.document.getElementById('bareme-affiche').textContent.includes('non renseigné'));
});

test('cycleAssignment : cycle primaire → secondaire → retrait, met à jour les compteurs', () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  w.cycleAssignment('75018'); // 1er clic → primaire
  assert.equal(w.document.getElementById('count-primaire').textContent, '1');
  w.cycleAssignment('75018'); // 2e clic → secondaire
  assert.equal(w.document.getElementById('count-primaire').textContent, '0');
  assert.equal(w.document.getElementById('count-secondaire').textContent, '1');
  w.cycleAssignment('75018'); // 3e clic → retiré
  assert.equal(w.document.getElementById('count-secondaire').textContent, '0');
});

test('chargerCodesPostauxDept : construit une grille de codes postaux cliquables à partir de geo.api.gouv.fr', async () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  w.fetch = async (url) => {
    assert.ok(url.includes('geo.api.gouv.fr/departements/91/communes'));
    return { json: async () => ([
      { nom: 'Évry-Courcouronnes', codesPostaux: ['91000'] },
      { nom: 'Palaiseau', codesPostaux: ['91120'] },
    ]) };
  };

  await w.chargerCodesPostauxDept('91');

  const chips = [...w.document.querySelectorAll('.cp-chip[data-code]')].map(c => c.dataset.code);
  assert.deepEqual(chips, ['91000', '91120']);
  assert.equal(w.document.getElementById('select-departement').value, '91');
});

test('chargerCodesPostauxDept : met les codes postaux en cache (un seul appel réseau par département)', async () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  let appels = 0;
  w.fetch = async () => { appels++; return { json: async () => ([{ nom: 'Paris', codesPostaux: ['75001'] }]) }; };

  await w.chargerCodesPostauxDept('75');
  await w.chargerCodesPostauxDept('75');

  assert.equal(appels, 1);
});

test('initZones : pré-remplit depuis les secteurs existants et verrouille si statut "valide"', () => {
  const w = chargerAgentApp();
  w.initZones(['75018'], ['92100'], 'valide', '');
  assert.equal(w.document.getElementById('count-primaire').textContent, '1');
  assert.equal(w.document.getElementById('count-secondaire').textContent, '1');
  assert.ok(w.document.querySelector('.zones-interactive').parentElement.classList.contains('zones-locked'));
  assert.equal(w.document.getElementById('btn-submit-zones').style.display, 'none');
});

test('initZones : statut "refuse" affiche le motif de refus', () => {
  const w = chargerAgentApp();
  w.initZones(['75018'], [], 'refuse', 'Zone déjà couverte par un autre agent');
  const note = w.document.getElementById('map-lock-note');
  assert.ok(note.classList.contains('show'));
  assert.ok(note.textContent.includes('Zone déjà couverte par un autre agent'));
});

test('soumettreZones : envoie les codes sélectionnés au bon endpoint, passe en attente si succès', async () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  w.cycleAssignment('75018'); // primaire
  w.cycleAssignment('92100'); w.cycleAssignment('92100'); // secondaire

  let appel = null;
  w.fetch = async (url, opts) => { appel = { url, corps: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ success: true }) }; };

  await w.soumettreZones();

  assert.equal(appel.url, '/api/agent-zones-submit');
  assert.deepEqual(appel.corps.secteurPrimaire, ['75018']);
  assert.deepEqual(appel.corps.secteurSecondaire, ['92100']);
  assert.ok(w.document.getElementById('zone-status-badge').textContent.includes('attente'));
});

test('soumettreZones : rien de sélectionné → n\'appelle pas le réseau', async () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  let appele = false;
  w.fetch = async () => { appele = true; };
  await w.soumettreZones();
  assert.equal(appele, false);
});

test('soumettreZones : erreur serveur → le bouton reste réactivé pour réessayer', async () => {
  const w = chargerAgentApp();
  w.initZones([], [], null, '');
  w.cycleAssignment('75018');
  w.fetch = async () => ({ ok: false, json: async () => ({ error: 'Erreur test' }) });
  await w.soumettreZones();
  assert.equal(w.document.getElementById('btn-submit-zones').disabled, false);
});

test('modifierZones : déverrouille pour resoumettre', () => {
  const w = chargerAgentApp();
  w.initZones(['75018'], [], 'refuse', 'Motif');
  w.modifierZones();
  assert.ok(!w.document.querySelector('.zones-interactive').parentElement.classList.contains('zones-locked'));
  assert.equal(w.document.getElementById('btn-submit-zones').style.display, 'inline-flex');
});

test('ouvrirModalPhoto / fermerModalPhoto : bascule la classe "show"', () => {
  const w = chargerAgentApp();
  w.ouvrirModalPhoto();
  assert.ok(w.document.getElementById('photo-modal-overlay').classList.contains('show'));
  w.fermerModalPhoto();
  assert.ok(!w.document.getElementById('photo-modal-overlay').classList.contains('show'));
});

test('previewPhoto : fichier trop volumineux → refusé avant lecture, bouton Enregistrer reste désactivé', () => {
  const w = chargerAgentApp();
  const gros = new w.File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(gros, 'size', { value: 6 * 1024 * 1024 });
  w.previewPhoto({ target: { files: [gros], value: '' } });
  assert.equal(w.document.getElementById('btn-enregistrer-photo').disabled, true);
});

test('reinitialiserPhoto : vide la zone de dépôt et désactive Enregistrer', () => {
  const w = chargerAgentApp();
  w.document.getElementById('btn-enregistrer-photo').disabled = false;
  w.document.getElementById('drop-zone-content').innerHTML = '<img src="x">';
  w.reinitialiserPhoto();
  assert.equal(w.document.getElementById('btn-enregistrer-photo').disabled, true);
  assert.ok(!w.document.getElementById('drop-zone-content').innerHTML.includes('<img'));
});

test('enregistrerPhoto : sans fichier sélectionné, n\'appelle pas le réseau', async () => {
  const w = chargerAgentApp();
  let appele = false;
  w.fetch = async () => { appele = true; };
  await w.enregistrerPhoto();
  assert.equal(appele, false);
});

// ─── Guide terrain Edouard (Aide & Tutos) ─────────────────────────────
test('toggleTutoEdouard : charge le guide au premier clic, bascule ensuite sans recharger', () => {
  const w = chargerAgentApp();
  const frame = w.document.getElementById('frame-tuto-edouard');

  w.toggleTutoEdouard();
  assert.equal(frame.src, 'https://app.lokentia.fr/aide/tuto-edouard.html');
  assert.equal(frame.hidden, false);
  assert.ok(w.document.getElementById('btn-tuto-edouard').innerHTML.includes('Fermer'));

  frame.src = 'https://exemple.fr/deja-charge.html'; // simule un chargement déjà en place
  w.toggleTutoEdouard();
  assert.equal(frame.hidden, true, 'un second clic referme sans toucher au src déjà chargé');
  assert.equal(frame.src, 'https://exemple.fr/deja-charge.html');
});
