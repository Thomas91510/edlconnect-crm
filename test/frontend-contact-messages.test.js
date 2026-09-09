// Vérifie côté CRM (js/app-contacts.js) le rendu et l'envoi de messages
// dans l'onglet "Messages" de la fiche contact : bulles alignées par
// expéditeur, marquage "lu" des messages client à l'ouverture de l'onglet,
// et ajout d'un message expert à l'envoi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div id="fiche-messages-thread"></div>
  <input id="fiche-message-input">
  <span id="ftab-messages-count"></span>
`;

function setup(messages) {
  // DB/currentFicheId sont des bindings `let` du contexte vm (pas des
  // propriétés de window) : on les initialise via codeSetup, exécuté dans
  // ce même contexte — voir test/_lib/frontend-env.js.
  const codeSetup = `
    // app-cloud.js n'est pas chargé dans ce test (pas de vrai client Supabase
    // en environnement jsdom) : saveToStorage() lit _supaReady, on le
    // neutralise pour rester dans le seul chemin localStorage.
    _supaReady = false;
    currentFicheId = 'c1';
    DB.contacts = [{ id: 'c1', messages: ${JSON.stringify(messages || [])} }];
    window.__getDB = function(){ return DB; };
  `;
  const { window } = chargerScripts(['app-contacts.js'], HTML, codeSetup);
  return window;
}

test('renderContactMessages : affiche les messages et marque les messages client comme lus', () => {
  const w = setup([
    { sender: 'client', body: 'Bonjour, une question', createdAt: '2026-06-01T09:00:00Z', lu: false },
    { sender: 'expert', body: 'Bien sûr, je vous écoute', createdAt: '2026-06-01T09:05:00Z', lu: false },
  ]);
  w.renderContactMessages();
  const thread = w.document.getElementById('fiche-messages-thread');
  assert.ok(thread.innerHTML.includes('Bonjour, une question'));
  assert.ok(thread.innerHTML.includes('Bien sûr, je vous écoute'));

  const c = w.__getDB().contacts[0];
  assert.equal(c.messages.find(m => m.sender === 'client').lu, true, 'le message client doit être marqué lu');
});

test('renderContactMessages : échappe le HTML dans le corps du message (anti-XSS)', () => {
  const w = setup([{ sender: 'client', body: '<img src=x onerror=alert(1)>', createdAt: '2026-06-01T09:00:00Z' }]);
  w.renderContactMessages();
  const thread = w.document.getElementById('fiche-messages-thread');
  assert.ok(!thread.innerHTML.includes('<img'), 'le message doit être échappé, jamais injecté tel quel');
  assert.ok(thread.innerHTML.includes('&lt;img'));
});

test('sendContactMessage : ajoute un message "expert" et vide le champ de saisie', () => {
  const w = setup([]);
  const input = w.document.getElementById('fiche-message-input');
  input.value = 'Votre rendez-vous est confirmé pour 14h.';
  w.sendContactMessage();

  const c = w.__getDB().contacts[0];
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].sender, 'expert');
  assert.equal(c.messages[0].body, 'Votre rendez-vous est confirmé pour 14h.');
  assert.equal(c.messages[0].lu, false);
  assert.equal(input.value, '');
});

test('sendContactMessage : ignore un message vide', () => {
  const w = setup([]);
  const input = w.document.getElementById('fiche-message-input');
  input.value = '   ';
  w.sendContactMessage();
  assert.equal(w.__getDB().contacts[0].messages.length, 0);
});
