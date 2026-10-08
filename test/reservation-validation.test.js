// Champs obligatoires d'une réservation (extranet, page publique, CRM et
// serveur) : téléphone + email de chaque locataire, propriétaire,
// superficie, date de l'état des lieux d'entrée pour toute sortie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { erreurReservation } from '../api/_lib/reservation-validation.js';
import { chargerScripts } from './_lib/frontend-env.js';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OK = {
  typeEdl: 'EDL sortant', superficie: '45', proprietaire: 'M. Dupont', dateEntree: '2023-09-01',
  locataire: { nom: 'Jean', tel: '0612345678', email: 'jean@x.fr' },
};

test('réservation complète : aucune erreur', () => {
  assert.equal(erreurReservation(OK), '');
  assert.equal(erreurReservation({ ...OK, typeEdl: 'EDL entrant', dateEntree: '' }), '', 'date d’entrée seulement pour une sortie');
});

test('chaque champ obligatoire manquant est signalé', () => {
  assert.match(erreurReservation({ ...OK, superficie: '' }), /superficie/);
  assert.match(erreurReservation({ ...OK, superficie: '0' }), /superficie/);
  assert.match(erreurReservation({ ...OK, proprietaire: '  ' }), /propriétaire/);
  assert.match(erreurReservation({ ...OK, dateEntree: '' }), /entrée/);
  assert.match(erreurReservation({ ...OK, typeEdl: 'EDL Sortant / Entrant', dateEntree: '' }), /entrée/);
  assert.match(erreurReservation({ ...OK, locataire: { tel: '', email: 'a@b.fr' } }), /téléphone du locataire/);
  assert.match(erreurReservation({ ...OK, locataire: { tel: '06', email: 'pas-un-email' } }), /email du locataire/);
  assert.match(erreurReservation({ ...OK, locataires: [OK.locataire, { nom: 'B', tel: '07' }] }), /email du locataire 2/);
  assert.match(erreurReservation({ ...OK, locatairesEntrants: [{ prenom: 'A', nom: 'B', tel: '06' }] }), /email du locataire entrant/);
  assert.match(erreurReservation({ ...OK, locatairesEntrants: [{ prenom: 'A', nom: 'B', email: 'a@b.fr' }] }), /téléphone du locataire entrant/);
});

test('copie navigateur identique à la règle du serveur', () => {
  const corps = (src) => src.slice(src.indexOf('function erreurReservation')).replace(/\nwindow\.erreurReservation[\s\S]*$/, '').trim();
  assert.equal(
    corps(fs.readFileSync(path.join(racine, 'js/reservation-validation.js'), 'utf8')),
    corps(fs.readFileSync(path.join(racine, 'api/_lib/reservation-validation.js'), 'utf8')),
  );
  const { window: w } = chargerScripts(['reservation-validation.js']);
  assert.equal(w.erreurReservation({ ...OK, proprietaire: '' }), erreurReservation({ ...OK, proprietaire: '' }));
});
