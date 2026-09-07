import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parisEnUTC, minuitParisEnUTC, moisActuelParis } from '../api/_lib/fuseau-paris.js';

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

// Verrouille le correctif du décalage horaire sur les événements Google
// Calendar créés depuis le CRM (api/calendar-create.js) : une date CRM
// "AAAA-MM-JJTHH:mm:ss" sans fuseau est une heure de Paris, jamais un
// instant UTC — new Date(...) sur une telle chaîne se serait trompée de 1h
// (CET) ou 2h (CEST) sur le runtime Vercel (UTC), décalant le rendez-vous
// une fois affiché avec timeZone:'Europe/Paris' dans Google Calendar.
function heureParisDe(dateUTC) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(dateUTC);
}

test('parisEnUTC : 9h30 heure de Paris en septembre (CEST, UTC+2) redonne bien 9h30 vu de Paris', () => {
  const instant = parisEnUTC(2026, 9, 8, 9, 30, 0);
  assert.equal(instant.toISOString(), '2026-09-08T07:30:00.000Z', 'CEST = UTC+2, donc 9h30 Paris = 7h30 UTC');
  assert.equal(heureParisDe(instant), '09:30');
});

test('parisEnUTC : 9h30 heure de Paris en janvier (CET, UTC+1) redonne bien 9h30 vu de Paris', () => {
  const instant = parisEnUTC(2026, 1, 8, 9, 30, 0);
  assert.equal(instant.toISOString(), '2026-01-08T08:30:00.000Z', 'CET = UTC+1, donc 9h30 Paris = 8h30 UTC');
  assert.equal(heureParisDe(instant), '09:30');
});

test('minuitParisEnUTC reste équivalent à parisEnUTC(...,0,0,0)', () => {
  assert.equal(minuitParisEnUTC(2026, 9, 8).getTime(), parisEnUTC(2026, 9, 8, 0, 0, 0).getTime());
});
