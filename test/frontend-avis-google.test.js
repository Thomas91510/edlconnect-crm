// Carte « Avis Google » : liste des demandes d'avis jamais parties, envoi
// manuel ou « Ignorer » (les retire sans rien envoyer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const JOUR = 86400000;
const iso = (jours) => new Date(Date.now() - jours * JOUR).toISOString();

function preparer() {
  const { window } = chargerScripts(['app-core.js', 'app-missions.js']);
  window.eval('saveToStorage = () => {}; pushToSupabase = () => {}');
  window.eval('DB').missions = [
    { id: 'a', date: iso(5), locataireEmail: 'l1@x.fr', statut: 'terminée' },
    { id: 'b', date: iso(60), locataireEmail: 'l2@x.fr', statut: 'terminée' },
    { id: 'c', date: iso(5), locataireEmail: 'l3@x.fr', avisEnvoye: iso(4) },
    { id: 'd', date: iso(5), locataireEmail: 'l4@x.fr', statut: 'annulée' },
    { id: 'e', date: iso(5), statut: 'terminée' },
    { id: 'f', date: new Date(Date.now() + JOUR).toISOString(), locataireEmail: 'l5@x.fr' },
  ];
  return window;
}

test('en attente : passées, avec email locataire, jamais envoyées, non annulées', () => {
  const w = preparer();
  assert.deepEqual(w.missionsAvisEnAttente().map(m => m.id), ['a', 'b']);
});

test('ignorer : retire de la liste sans envoi ni relance automatique', () => {
  const w = preparer();
  w.ignorerDemandeAvis('b');
  const m = w.eval('DB').missions.find(x => x.id === 'b');
  assert.equal(m.avisIgnore, true);
  assert.equal(m.avis2Envoye, true);
  assert.deepEqual(w.missionsAvisEnAttente().map(x => x.id), ['a']);
});
