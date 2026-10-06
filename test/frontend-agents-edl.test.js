// Vérifie la gestion des "Agents EDL" côté Paramètres (js/app-settings.js) :
// ajout, édition (nouveau — auparavant seule la suppression existait, sans
// façon de corriger un nom ou d'ajouter/retirer un secteur sans tout
// resaisir), et suppression.
//
// app-cloud.js est chargé en plus (pas seulement app-core.js) pour que
// subscribeRealtime() — appelée au chargement du script — soit une vraie
// fonction qui s'arrête tôt (_supaReady vaut false par défaut, pas de vrai
// client Supabase ici) plutôt qu'un ReferenceError non rattrapé. _EXTRANET_MODE
// neutralise aussi les timers de sync automatique programmés au chargement
// de app-settings.js (startAutoSync/silentSyncBrevo, définis dans
// app-emails.js, non chargé ici).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="notif"></div>
  <div id="agents-list"></div>
  <input id="new-agent-nom">
  <input id="new-agent-tel">
  <input id="new-agent-email">
  <input id="new-agent-secteurs">
  <button id="agent-submit-btn"></button>
  <button id="agent-cancel-btn" style="display:none"></button>
  <div id="bareme-rows"></div>
`;

function chargerAgentsEDL() {
  const codeSetup = `
    window._EXTRANET_MODE = true;
    window.__getDB = function(){ return DB; };
    // _authHeaders (app-cloud.js) appelle le vrai supabaseClient (null ici,
    // pas de SDK Supabase chargé) : on le remplace par un stub pour tester
    // envoyerBienvenueAgent() sans dépendre de toute la chaîne d'auth.
    window._authHeaders = async function(){ return { 'Content-Type': 'application/json', 'Authorization': 'Bearer tok-test' }; };
    // jsdom n'implémente pas scrollIntoView (pas de mise en page réelle) —
    // sans stub, editerAgent() (qui l'appelle pour amener le formulaire à
    // l'écran) lèverait une TypeError ici, alors qu'un vrai navigateur
    // l'implémente toujours.
    window.HTMLElement.prototype.scrollIntoView = function(){};
  `;
  const { window } = chargerScripts(['app-cloud.js', 'app-settings.js'], HTML, codeSetup);
  return window;
}

function remplirFormulaire(window, { nom = '', tel = '', email = '', secteurs = '' }) {
  window.document.getElementById('new-agent-nom').value = nom;
  window.document.getElementById('new-agent-tel').value = tel;
  window.document.getElementById('new-agent-email').value = email;
  window.document.getElementById('new-agent-secteurs').value = secteurs;
}

test('addAgent : crée un nouvel agent avec tous les champs', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', tel: '0612345678', email: 'jean@exemple.fr', secteurs: '75018,75019' });

  window.addAgent();

  const agents = window.__getDB().agents;
  assert.equal(agents.length, 1);
  assert.deepEqual(
    { nom: agents[0].nom, tel: agents[0].tel, email: agents[0].email, secteurs: agents[0].secteurs },
    { nom: 'Jean Dupont', tel: '0612345678', email: 'jean@exemple.fr', secteurs: '75018,75019' }
  );
});

test('addAgent : ne touche jamais au champ adresse (renseigné par l\'agent lui-même, pas par l\'agence)', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;
  window.__getDB().agents[0].adresse = '12 rue de la Paix, 91000 Évry-Courcouronnes';

  window.editerAgent(id);
  remplirFormulaire(window, { nom: 'Jean Dupont modifié', secteurs: '75018' });
  window.addAgent();

  assert.equal(window.__getDB().agents[0].adresse, '12 rue de la Paix, 91000 Évry-Courcouronnes', 'une modification admin ne doit jamais effacer l\'adresse saisie par l\'agent');
});

test('addAgent : le nom est requis, aucun agent créé sans lui', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: '', tel: '0612345678' });

  window.addAgent();

  assert.equal((window.__getDB().agents || []).length, 0);
});

test('addAgent : vide le formulaire après création (pas de champs restants pour le prochain agent)', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018' });
  window.addAgent();

  assert.equal(window.document.getElementById('new-agent-nom').value, '');
  assert.equal(window.document.getElementById('new-agent-secteurs').value, '');
});

test('editerAgent : pré-remplit le formulaire avec les valeurs existantes de l\'agent', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', tel: '0612345678', email: 'jean@exemple.fr', secteurs: '75018' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.editerAgent(id);

  assert.equal(window.document.getElementById('new-agent-nom').value, 'Jean Dupont');
  assert.equal(window.document.getElementById('new-agent-secteurs').value, '75018');
  assert.notEqual(window.document.getElementById('agent-cancel-btn').style.display, 'none');
});

test('addAgent en mode édition : met à jour l\'agent existant au lieu d\'en créer un nouveau', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.editerAgent(id);
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018,75019,92' }); // ajoute des secteurs
  window.addAgent();

  const agents = window.__getDB().agents;
  assert.equal(agents.length, 1, 'aucun doublon créé');
  assert.equal(agents[0].id, id, 'même agent, pas un nouvel id');
  assert.equal(agents[0].secteurs, '75018,75019,92');
});

test('addAgent en mode édition : retirer tous les secteurs (repasse "partout") fonctionne', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018,75019' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.editerAgent(id);
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '' });
  window.addAgent();

  assert.equal(window.__getDB().agents[0].secteurs, '');
});

test('annulerEditionAgent : quitte le mode édition sans modifier l\'agent', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont', secteurs: '75018' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.editerAgent(id);
  remplirFormulaire(window, { nom: 'Nom modifié par erreur', secteurs: 'autre' });
  window.annulerEditionAgent();

  assert.equal(window.__getDB().agents[0].nom, 'Jean Dupont', 'l\'agent original ne doit pas être modifié');
  assert.equal(window.document.getElementById('new-agent-nom').value, '', 'le formulaire doit être vidé');

  // Un addAgent() après annulation doit créer un NOUVEL agent, pas modifier
  // le premier (l'id en édition a bien été oublié).
  remplirFormulaire(window, { nom: 'Marie Martin' });
  window.addAgent();
  const agents = window.__getDB().agents;
  assert.equal(agents.length, 2);
  assert.equal(agents[0].id, id);
});

test('removeAgent : supprime l\'agent et annule le mode édition si c\'est celui en cours d\'édition', () => {
  const window = chargerAgentsEDL();
  window.confirm = () => true; // évite la boîte de dialogue native dans le test
  remplirFormulaire(window, { nom: 'Jean Dupont' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.editerAgent(id);
  window.removeAgent(id);

  assert.equal(window.__getDB().agents.length, 0);
  assert.equal(window.document.getElementById('agent-cancel-btn').style.display, 'none');
});

test('renderAgentsSettings : échappe les champs affichés (protection XSS)', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: '<script>alert(1)</script>', secteurs: '<b>75018</b>' });
  window.addAgent();

  const html = window.document.getElementById('agents-list').innerHTML;
  assert.ok(!html.includes('<script>alert(1)</script>'), 'le nom ne doit jamais apparaître en clair');
  assert.ok(html.includes('&lt;script&gt;'), 'doit apparaître échappé');
  assert.ok(!html.includes('<b>75018</b>'), 'le secteur ne doit jamais apparaître en clair');
});

// ─── Envoi automatique du lien "espace agent" à la création ───────────
test('addAgent : un nouvel agent avec email déclenche l\'envoi automatique du lien espace agent', async () => {
  const window = chargerAgentsEDL();
  let appelFetch = null;
  window.fetch = async (url, opts) => { appelFetch = { url, opts }; return { ok: true, json: async () => ({ success: true }) }; };

  remplirFormulaire(window, { nom: 'Jean Dupont', email: 'jean@exemple.fr' });
  window.addAgent();
  await new Promise(r => setTimeout(r, 0)); // envoyerBienvenueAgent() est asynchrone, non attendu par addAgent()

  assert.ok(appelFetch, 'fetch aurait dû être appelé');
  assert.equal(appelFetch.url, '/api/send-welcome-agent');
  assert.deepEqual(JSON.parse(appelFetch.opts.body), { email: 'jean@exemple.fr', nom: 'Jean Dupont' });
  assert.equal(appelFetch.opts.headers.Authorization, 'Bearer tok-test');
});

test('addAgent : un nouvel agent SANS email ne déclenche aucun envoi', async () => {
  const window = chargerAgentsEDL();
  let appele = false;
  window.fetch = async () => { appele = true; return { ok: true, json: async () => ({}) }; };

  remplirFormulaire(window, { nom: 'Jean Dupont' }); // pas d'email
  window.addAgent();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(appele, false);
});

test('addAgent en mode édition : aucun renvoi de l\'email de bienvenue (déjà envoyé à la création)', async () => {
  const window = chargerAgentsEDL();
  let nbAppels = 0;
  window.fetch = async () => { nbAppels++; return { ok: true, json: async () => ({}) }; };

  remplirFormulaire(window, { nom: 'Jean Dupont', email: 'jean@exemple.fr' });
  window.addAgent();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(nbAppels, 1, 'un seul envoi, à la création');

  const id = window.__getDB().agents[0].id;
  window.editerAgent(id);
  remplirFormulaire(window, { nom: 'Jean Dupont', email: 'jean@exemple.fr', secteurs: '75018' });
  window.addAgent();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(nbAppels, 1, 'la modification ne doit pas redéclencher un envoi');
});

// ─── Dépôt du contrat / avenant (upload-agent-document) ────────────
test('televerserDocumentAgent : envoie le PDF en multipart et marque l\'agent comme déposé', async () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  let appelFetch = null;
  window.fetch = async (url, opts) => {
    appelFetch = { url, opts };
    return { ok: true, json: async () => ({ success: true, path: id + '/contrat-123.pdf' }) };
  };

  const fichier = new window.File(['%PDF-1.4'], 'contrat.pdf', { type: 'application/pdf' });
  const inputEl = window.document.createElement('input');
  inputEl.type = 'file';
  Object.defineProperty(inputEl, 'files', { value: [fichier] });

  await window.televerserDocumentAgent(id, 'contrat', inputEl);

  assert.equal(appelFetch.url, '/api/upload-agent-document');
  assert.equal(appelFetch.opts.headers.Authorization, 'Bearer tok-test');
  assert.ok(!('Content-Type' in appelFetch.opts.headers), 'le Content-Type multipart doit être laissé au navigateur');
  assert.equal(appelFetch.opts.body.get('agentId'), id);
  assert.equal(appelFetch.opts.body.get('type'), 'contrat');

  assert.equal(window.__getDB().agents[0].contratPath, id + '/contrat-123.pdf');
  assert.ok(window.document.getElementById('agents-list').innerHTML.includes('ti-file-check'), 'l\'icône doit refléter le dépôt sans recharger la page');
});

test('televerserDocumentAgent : fichier non-PDF refusé côté client, aucun appel réseau', async () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  let appele = false;
  window.fetch = async () => { appele = true; };

  const fichier = new window.File(['texte'], 'contrat.txt', { type: 'text/plain' });
  const inputEl = window.document.createElement('input');
  Object.defineProperty(inputEl, 'files', { value: [fichier] });

  await window.televerserDocumentAgent(id, 'contrat', inputEl);

  assert.equal(appele, false);
  assert.equal(window.__getDB().agents[0].contratPath, undefined);
});

test('televerserDocumentAgent : échec serveur affiche une erreur sans modifier l\'agent', async () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Jean Dupont' });
  window.addAgent();
  const id = window.__getDB().agents[0].id;

  window.fetch = async () => ({ ok: false, json: async () => ({ error: 'Échec du téléversement' }) });

  const fichier = new window.File(['%PDF-1.4'], 'contrat.pdf', { type: 'application/pdf' });
  const inputEl = window.document.createElement('input');
  Object.defineProperty(inputEl, 'files', { value: [fichier] });

  await window.televerserDocumentAgent(id, 'contrat', inputEl);

  assert.equal(window.__getDB().agents[0].contratPath, undefined);
});

// ─── Photo de profil (affichage côté agence) ──────────────────────────
test('renderAgentsSettings : sans photo, affiche les initiales de l\'agent', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Julie Berthier' });
  window.addAgent();

  const html = window.document.getElementById('agents-list').innerHTML;
  assert.ok(html.includes('JB'));
  assert.ok(!html.includes('<img'));
});

test('renderAgentsSettings : avec photoPath, affiche la photo au lieu des initiales', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Julie Berthier' });
  window.addAgent();
  window.__getDB().agents[0].photoPath = 'owner-1/agent-1.jpg';
  window.renderAgentsSettings();

  const html = window.document.getElementById('agents-list').innerHTML;
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('owner-1/agent-1.jpg'));
});

// ─── Zones d'intervention (validation par l'agence) ───────────────────
function agentAvecZonesEnAttente(window){
  remplirFormulaire(window, { nom: 'Julie Berthier' });
  window.addAgent();
  const agent = window.__getDB().agents[0];
  Object.assign(agent, { secteurPrimaire: ['75018', '75019'], secteurSecondaire: ['92100'], zoneStatut: 'attente' });
  window.renderAgentsSettings();
  return agent.id;
}

test('renderAgentsSettings : demande de zones en attente affiche les compteurs et les actions', () => {
  const window = chargerAgentsEDL();
  agentAvecZonesEnAttente(window);

  const html = window.document.getElementById('agents-list').innerHTML;
  assert.ok(html.includes('2 codes primaire, 1 secondaire'));
  assert.ok(html.includes('approuverZonesAgent'));
  assert.ok(html.includes('refuserZonesAgent'));
});

test('approuverZonesAgent : passe le statut à "valide" et synchronise', () => {
  const window = chargerAgentsEDL();
  const id = agentAvecZonesEnAttente(window);

  window.approuverZonesAgent(id);

  assert.equal(window.__getDB().agents[0].zoneStatut, 'valide');
});

test('refuserZonesAgent : passe le statut à "refuse" avec le motif saisi', () => {
  const window = chargerAgentsEDL();
  const id = agentAvecZonesEnAttente(window);
  window.prompt = () => 'Zone déjà couverte par un autre agent';

  window.refuserZonesAgent(id);

  const agent = window.__getDB().agents[0];
  assert.equal(agent.zoneStatut, 'refuse');
  assert.equal(agent.zoneRefusMotif, 'Zone déjà couverte par un autre agent');
});

test('renderAgentsSettings : zones validées ou refusées affichées sans action (rien à approuver)', () => {
  const window = chargerAgentsEDL();
  remplirFormulaire(window, { nom: 'Julie Berthier' });
  window.addAgent();
  Object.assign(window.__getDB().agents[0], { secteurPrimaire: ['75018'], secteurSecondaire: [], zoneStatut: 'valide' });
  window.renderAgentsSettings();

  const html = window.document.getElementById('agents-list').innerHTML;
  assert.ok(html.includes('validées'));
  assert.ok(!html.includes('approuverZonesAgent'));
});

// ─── Barème frais de déplacement ───────────────────────────────────────
test('renderBaremeSettings : affiche le barème par défaut quand rien n\'est configuré', () => {
  const window = chargerAgentsEDL();
  window.renderBaremeSettings();

  const rows = window.document.querySelectorAll('#bareme-rows [data-bareme-row]');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].querySelector('.bareme-label-input').value, 'Secteur primaire');
});

test('ajouterLigneBareme : ajoute une case vide, focus dessus', () => {
  const window = chargerAgentsEDL();
  window.renderBaremeSettings();
  window.ajouterLigneBareme();

  const rows = window.document.querySelectorAll('#bareme-rows [data-bareme-row]');
  assert.equal(rows.length, 4);
  assert.equal(rows[3].querySelector('.bareme-label-input').value, '');
});

test('sauvegarderBareme : enregistre les lignes renommées, ignore celles sans intitulé', () => {
  const window = chargerAgentsEDL();
  window.renderBaremeSettings();
  const rows = window.document.querySelectorAll('#bareme-rows [data-bareme-row]');
  rows[0].querySelector('.bareme-label-input').value = 'Zone proche';
  rows[0].querySelector('.bareme-montant-input').value = '5';
  rows[1].querySelector('.bareme-label-input').value = ''; // sans intitulé → ignorée

  window.sauvegarderBareme();

  const bareme = window.__getDB().baremeDeplacement;
  assert.ok(bareme.find(l => l.label === 'Zone proche' && l.montant === '5'));
  assert.equal(bareme.length, 2, 'la ligne sans intitulé ne doit pas être enregistrée');
});

test('sauvegarderBareme : aucune ligne valide → n\'écrase pas le barème existant', () => {
  const window = chargerAgentsEDL();
  window.__getDB().baremeDeplacement = [{ label: 'Existant', montant: '9' }];
  window.document.getElementById('bareme-rows').innerHTML = `
    <div data-bareme-row><input class="bareme-label-input" value=""><input class="bareme-montant-input" value=""></div>`;

  window.sauvegarderBareme();

  assert.deepEqual(window.__getDB().baremeDeplacement, [{ label: 'Existant', montant: '9' }]);
});

// ─── Grille de rémunération : plusieurs typologies cochées par ligne ──
test('grille de rémunération : les typologies cochées sont relues, l’ancien champ unique est converti', () => {
  const w = chargerAgentsEDL();
  const d = w.document;
  const conteneur = d.createElement('div');
  conteneur.id = 'rem-typo-lignes';
  d.body.appendChild(conteneur);
  w.renderLignesRemuneration([
    { label: 'T4 et T5', typos: ['T4', 'T5'], simple: '55', double: '95' },
    { label: 'Ancien', typo: 'T2', simple: '40' },
  ]);
  const lignes = d.querySelectorAll('#rem-typo-lignes [data-rem-ligne]');
  assert.equal(lignes.length, 2);
  // Coche T6 en plus sur la première ligne
  lignes[0].querySelector('input[value="T6"]').checked = true;
  const lues = w.lireLignesRemuneration();
  assert.deepEqual(Array.from(lues[0].typos), ['T4', 'T5', 'T6']);
  assert.deepEqual(Array.from(lues[1].typos), ['T2'], 'l’ancien champ « typo » est coché à l’ouverture');
  assert.equal(lues[0].simple, '55');
});

// ─── Suivi des paiements des rémunérations ────────────────────────────
test('suivi des paiements : reste à payer, cocher « payée » enregistre la mission', () => {
  const html = `<div id="notif"></div><select id="remu-agent-select"></select><select id="remu-filtre"><option value="apayer" selected>À payer</option><option value="payees">Payées</option><option value="toutes">Toutes</option></select><div id="remu-agents-contenu"></div>`;
  const setup = `
    window._EXTRANET_MODE = true;
    window.__getDB = function(){ return DB; };
    window.__pousses = [];
    pushToSupabase = async function(cle, item){ window.__pousses.push([cle, item.id]); return true; };
    confirm = () => true;
    DB.agents = [{ id: 'ag1', nom: 'Julien', remuneration: { mode: 'forfait', parType: { entrant: '45', sortant: '50' } } }];
    DB.missions = [
      { id: 'm1', expertId: 'ag1', type: 'EDL entrant', statut: 'terminée', date: '2026-09-02T09:00:00' },
      { id: 'm2', expertId: 'ag1', type: 'EDL sortant', statut: 'terminée', date: '2026-09-05T09:00:00' },
      { id: 'm3', expertId: 'ag2', type: 'EDL sortant', statut: 'terminée', date: '2026-09-05T09:00:00' },
      { id: 'm4', expertId: 'ag1', type: 'EDL sortant', statut: 'planifiée', date: '2026-12-05T09:00:00' },
    ];
  `;
  const { window: w, document: d } = chargerScripts(['app-cloud.js', 'app-settings.js', 'app-remuneration.js'], html, setup);
  w.renderRemunerationsAgents();
  const contenu = d.getElementById('remu-agents-contenu');
  assert.ok(contenu.textContent.includes('95 € HT'), 'reste à payer = 45 + 50 (missions terminées de cet agent uniquement)');
  assert.equal(contenu.querySelectorAll('tbody input[type=checkbox]').length, 2);

  w.marquerRemuPayee('m1', true);
  const m1 = w.__getDB().missions.find(m => m.id === 'm1');
  assert.equal(m1.remuPayee, true);
  assert.ok(m1.remuPayeeLe, 'date de paiement enregistrée');
  assert.deepEqual(Array.from(w.__pousses[0]), ['missions', 'm1'], 'mission synchronisée');
  assert.ok(contenu.textContent.includes('50 € HT'), 'reste à payer mis à jour');

  w.marquerMoisRemuPaye('ag1', '2026-09');
  assert.equal(w.__getDB().missions.find(m => m.id === 'm2').remuPayee, true);
  assert.equal(w.__getDB().missions.find(m => m.id === 'm4').remuPayee, undefined, 'une mission planifiée n’est jamais marquée payée');
  assert.ok(contenu.textContent.includes('Rien à payer'));
});
