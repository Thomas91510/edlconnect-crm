// Vérifie /api/version : reflète VERCEL_GIT_COMMIT_SHA/VERCEL_ENV sans
// exposer autre chose (endpoint public, en lecture seule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/version.js';

const shaOriginal = process.env.VERCEL_GIT_COMMIT_SHA;
const envOriginal = process.env.VERCEL_ENV;
test.after(() => {
  process.env.VERCEL_GIT_COMMIT_SHA = shaOriginal;
  process.env.VERCEL_ENV = envOriginal;
});

test('version : renvoie les 7 premiers caractères du SHA et l\'environnement', async () => {
  process.env.VERCEL_GIT_COMMIT_SHA = 'a3f9c21b8e7d6c5b4a3f9c21b8e7d6c5b4a3f9c2';
  process.env.VERCEL_ENV = 'production';
  const resp = await handler({ method: 'GET' });
  const data = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(data.sha, 'a3f9c21');
  assert.equal(data.env, 'production');
});

test('version : ne casse pas si les variables Vercel sont absentes (dev local)', async () => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_ENV;
  const resp = await handler({ method: 'GET' });
  const data = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(data.sha, '');
  assert.equal(data.env, 'development');
});

test('version : refuse les méthodes autres que GET/OPTIONS', async () => {
  const resp = await handler({ method: 'POST' });
  assert.equal(resp.status, 405);
});
