// /api/espaces-agences-statuts : agences « historiques » (espace activé
// d'office) présentes parmi les fiches de l'appelant. Ne lit que leurs
// fiches : une lecture de toutes les fiches était tronquée à 1 000 lignes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/espaces-agences-statuts.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function mock(email) {
  const appels = [];
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email }) };
    appels.push(u);
    return { ok: true, json: async () => [{ email: 'ImmoGestionLocative@gmail.com ' }, { email: 'lgc13asnieres@arthurimmo.com' }] };
  };
  return appels;
}
const req = () => ({ method: 'GET', url: 'https://x/api/espaces-agences-statuts', headers: new Headers({ authorization: 'Bearer t' }) });

test('administrateur : Immo Gestion et Arthurimmo reconnues, requête ciblée (pas de troncature à 1 000)', async () => {
  const appels = mock('contact@edl-idf.com');
  const d = await (await handler(req())).json();
  assert.deepEqual(d.historiques.sort(), ['immogestionlocative@gmail.com', 'lgc13asnieres@arthurimmo.com']);
  assert.match(appels[0], /or=\(data->>email\.ilike\."[^"]+@[^"]+"/);
  assert.doesNotMatch(appels[0], /user_id=/);
});

test('abonné : limité à ses propres fiches', async () => {
  const appels = mock('abonne@x.fr');
  await handler(req());
  assert.match(appels[0], /user_id=eq\.u1/);
});
