import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minuitParisEnUTC, moisActuelParis } from '../api/_lib/fuseau-paris.js';

test('minuit Paris en heure d\'été (CEST, UTC+2) : 1er octobre 2026', () => {
  // Bascule hiver 2026 le 25/10 : le 1er octobre est encore en CEST.
  assert.equal(minuitParisEnUTC(2026, 10, 1).toISOString(), '2026-09-30T22:00:00.000Z');
});

test('minuit Paris en heure d\'hiver (CET, UTC+1) : 1er novembre 2026', () => {
  // Après la bascule du 25/10/2026, Paris repasse en CET.
  assert.equal(minuitParisEnUTC(2026, 11, 1).toISOString(), '2026-10-31T23:00:00.000Z');
});

test('minuit Paris en plein hiver : 1er janvier 2027', () => {
  assert.equal(minuitParisEnUTC(2027, 1, 1).toISOString(), '2026-12-31T23:00:00.000Z');
});

test('minuit Paris en plein été : 1er juillet 2026', () => {
  assert.equal(minuitParisEnUTC(2026, 7, 1).toISOString(), '2026-06-30T22:00:00.000Z');
});

test('moisActuelParis correspond à ce que renvoie Intl pour Europe/Paris', () => {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
  const parts = fmt.formatToParts(new Date()).reduce((o, p) => { if (p.type !== 'literal') o[p.type] = p.value; return o; }, {});
  const attendu = { annee: Number(parts.year), mois: Number(parts.month) };
  assert.deepEqual(moisActuelParis(), attendu);
});
