import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origineAutorisee } from '../api/_lib/cors.js';

const PROD = 'https://app.lokentia.fr';

test('reflète l\'origine de prod', () => {
  const req = { headers: new Headers({ origin: PROD }) };
  assert.equal(origineAutorisee(req), PROD);
});

test('reflète une preview Vercel du projet', () => {
  const preview = 'https://edlconnect-crm-v2-git-claude-abc123.vercel.app';
  const req = { headers: new Headers({ origin: preview }) };
  assert.equal(origineAutorisee(req), preview);
});

test('retombe sur la prod pour une origine tierce', () => {
  const req = { headers: new Headers({ origin: 'https://evil.example.com' }) };
  assert.equal(origineAutorisee(req), PROD);
});

test('retombe sur la prod quand il n\'y a pas d\'en-tête Origin', () => {
  const req = { headers: new Headers() };
  assert.equal(origineAutorisee(req), PROD);
});

test('fonctionne aussi avec un req.headers style Node (objet simple)', () => {
  const req = { headers: { origin: PROD } };
  assert.equal(origineAutorisee(req), PROD);

  const reqTiers = { headers: { origin: 'https://evil.example.com' } };
  assert.equal(origineAutorisee(reqTiers), PROD);
});

test('ne plante pas sans req ni headers', () => {
  assert.equal(origineAutorisee({}), PROD);
  assert.equal(origineAutorisee(null), PROD);
});
