// Vérifie la logique de fusion "libre/occupé" (api/_lib/creneaux-libres.js)
// qui remplace, pour la bêta agenda multi-collaborateurs, le calcul de
// disponibilités auparavant délégué à Cal.com — sans réseau, donc exécutable
// en CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creneauxLibres } from '../api/_lib/creneaux-libres.js';
import { parisEnUTC, minuitParisEnUTC } from '../api/_lib/fuseau-paris.js';

// Lundi 7 septembre 2026 (CEST, UTC+2) — jour ouvré simple pour la plupart
// des cas. Dimanche 6 septembre 2026 sert au cas "jour non ouvré".
const FENETRE_DIMANCHE_LUNDI = { fenetreDebut: minuitParisEnUTC(2026, 9, 6), fenetreFin: minuitParisEnUTC(2026, 9, 8) };
const FENETRE_LUNDI_SEUL = { fenetreDebut: minuitParisEnUTC(2026, 9, 7), fenetreFin: minuitParisEnUTC(2026, 9, 8) };

function creneau(heure, minute = 0) {
  return parisEnUTC(2026, 9, 7, heure, minute).toISOString();
}

test('un collaborateur occupé toute la journée, un autre libre : les créneaux restent disponibles (union)', () => {
  const occupePar = {
    'a@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 9), end: parisEnUTC(2026, 9, 7, 19) }],
    'b@exemple.fr': [],
  };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60 });
  assert.ok(slots.includes(creneau(9, 0)));
  assert.ok(slots.includes(creneau(12, 30)));
  assert.ok(slots.includes(creneau(18, 0))); // dernier départ possible : 18h + 1h = 19h (fermeture)
});

test('tous les collaborateurs occupés sur le créneau : aucune disponibilité', () => {
  const occupePar = {
    'a@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 9), end: parisEnUTC(2026, 9, 7, 19) }],
    'b@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 9), end: parisEnUTC(2026, 9, 7, 19) }],
  };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60 });
  assert.deepEqual(slots, []);
});

test('un collaborateur occupé seulement 10h-11h : ce créneau précis disparaît, les autres restent', () => {
  const occupePar = {
    'a@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 10), end: parisEnUTC(2026, 9, 7, 11) }],
  };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60 });
  assert.ok(!slots.includes(creneau(10, 0)));
  assert.ok(!slots.includes(creneau(10, 30))); // chevauche 10h-11h
  assert.ok(slots.includes(creneau(9, 0)));
  assert.ok(slots.includes(creneau(11, 0)));
});

test('heures d\'ouverture respectées : aucun créneau ne dépasse la fermeture (19h)', () => {
  const occupePar = { 'a@exemple.fr': [] };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 180 });
  assert.ok(slots.includes(creneau(16, 0))); // 16h + 3h = 19h pile
  assert.ok(!slots.includes(creneau(16, 30))); // 16h30 + 3h = 19h30, dépasse
  assert.ok(!slots.includes(creneau(8, 30))); // avant l'ouverture (9h)
});

test('pas de 30 minutes : aucun créneau proposé hors grille', () => {
  const occupePar = { 'a@exemple.fr': [] };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60 });
  assert.ok(!slots.includes(creneau(9, 15)));
  assert.ok(!slots.includes(creneau(9, 45)));
});

test('dimanche exclu des jours ouvrés (lun-sam)', () => {
  const occupePar = { 'a@exemple.fr': [] };
  const slots = creneauxLibres({ ...FENETRE_DIMANCHE_LUNDI, occupePar, dureeMinutes: 60 });
  assert.ok(slots.every(iso => !iso.startsWith('2026-09-06') && !new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }).includes('06/09')));
  assert.ok(slots.some(iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) === '07/09/2026'));
});

test('délai minimum (seuilMs) : aucun créneau avant le seuil, même en pleine disponibilité', () => {
  const occupePar = { 'a@exemple.fr': [] };
  const seuilMs = parisEnUTC(2026, 9, 7, 12, 0).getTime();
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60, seuilMs });
  assert.ok(!slots.includes(creneau(9, 0)));
  assert.ok(!slots.includes(creneau(11, 30)));
  assert.ok(slots.includes(creneau(12, 0)));
});

test('tampon de 30 min : un créneau trop proche d\'un rendez-vous existant (même sans chevauchement) est exclu', () => {
  const occupePar = {
    'a@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 12), end: parisEnUTC(2026, 9, 7, 13) }],
  };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60, tamponMinutes: 30 });
  // 11h-12h ne chevauche pas 12h-13h, mais finit pile au début : exclu par le tampon (marge 11h30-13h30).
  assert.ok(!slots.includes(creneau(11, 0)));
  // 13h-14h ne chevauche pas non plus, mais commence pile à la fin de la marge : exclu.
  assert.ok(!slots.includes(creneau(13, 0)));
  // 10h30-11h30 laisse pile 30 min avant 12h : accepté (limite exacte du tampon).
  assert.ok(slots.includes(creneau(10, 30)));
  // 13h30-14h30 laisse pile 30 min après 13h : accepté (limite exacte du tampon).
  assert.ok(slots.includes(creneau(13, 30)));
});

test('tampon à 0 (défaut) : comportement inchangé, seul le chevauchement strict exclut', () => {
  const occupePar = {
    'a@exemple.fr': [{ start: parisEnUTC(2026, 9, 7, 10), end: parisEnUTC(2026, 9, 7, 11) }],
  };
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar, dureeMinutes: 60 });
  assert.ok(slots.includes(creneau(9, 0)));
  assert.ok(slots.includes(creneau(11, 0)));
});

test('aucun collaborateur fourni : aucune disponibilité (pas de division par zéro / boucle infinie)', () => {
  const slots = creneauxLibres({ ...FENETRE_LUNDI_SEUL, occupePar: {}, dureeMinutes: 60 });
  assert.deepEqual(slots, []);
});

test('résultat trié chronologiquement', () => {
  const occupePar = { 'a@exemple.fr': [] };
  const slots = creneauxLibres({ ...FENETRE_DIMANCHE_LUNDI, occupePar, dureeMinutes: 60 });
  const tries = [...slots].sort();
  assert.deepEqual(slots, tries);
});
