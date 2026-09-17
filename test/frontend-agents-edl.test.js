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
`;

function chargerAgentsEDL() {
  const codeSetup = `
    window._EXTRANET_MODE = true;
    window.__getDB = function(){ return DB; };
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
