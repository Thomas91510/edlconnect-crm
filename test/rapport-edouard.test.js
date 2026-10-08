// /api/rapport-edouard : lien signé vers un rapport Edouard non stocké
// (trop lourd) — redirige vers une URL Edouard fraîche, refuse un lien forgé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
process.env.EDOUARD_API_KEY = process.env.EDOUARD_API_KEY || 'cle-edouard';
const { default: handler } = await import('../api/rapport-edouard.js');
const { lienRapportEdouard } = await import('../api/_lib/lien-rapport.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('lien signé : redirection vers le PDF Edouard du moment', async () => {
  const appels = [];
  global.fetch = async (url) => { appels.push(String(url)); return { ok: true, json: async () => ({ data: { url: 'https://storage.edouard/rapport-frais.pdf' } }) }; };
  const lien = await lienRapportEdouard('sit-1', process.env.SUPABASE_SERVICE_KEY);
  const r = await handler({ url: lien });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://storage.edouard/rapport-frais.pdf');
  assert.match(appels[0], /\/v1\/situations\/sit-1\/report$/);
});

test('lien forgé ou modifié : refusé sans appeler Edouard', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => ({}) }; };
  const lien = await lienRapportEdouard('sit-1', process.env.SUPABASE_SERVICE_KEY);
  assert.equal((await handler({ url: lien.replace('s=sit-1', 's=sit-2') })).status, 403);
  assert.equal((await handler({ url: 'https://app.lokentia.fr/api/rapport-edouard?s=sit-1&t=' + 'a'.repeat(40) })).status, 403);
  assert.equal(appele, false);
});
