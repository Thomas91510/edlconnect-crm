import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeEnMinutes } from '../api/_lib/duree.js';

test('formats "Xh" simples', () => {
  assert.equal(dureeEnMinutes('1h'), 60);
  assert.equal(dureeEnMinutes('3h'), 180);
  assert.equal(dureeEnMinutes('8h'), 480);
});

test('formats "Xh30" (demi-heures)', () => {
  assert.equal(dureeEnMinutes('1h30'), 90);
  assert.equal(dureeEnMinutes('2h30'), 150);
  assert.equal(dureeEnMinutes('7h30'), 450);
});

test('format "X min"', () => {
  assert.equal(dureeEnMinutes('30 min'), 30);
  assert.equal(dureeEnMinutes('45min'), 45);
});

test('valeur vide, absente ou non reconnue retombe sur 60 minutes', () => {
  assert.equal(dureeEnMinutes(''), 60);
  assert.equal(dureeEnMinutes(undefined), 60);
  assert.equal(dureeEnMinutes('bogus'), 60);
});

test('insensible à la casse et aux espaces superflus', () => {
  assert.equal(dureeEnMinutes(' 2H30 '), 150);
});
