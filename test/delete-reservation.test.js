// delete-reservation.js : supprime une réservation booking (table Supabase
// "bookings"). Utilise la clé service (contourne les policies RLS) donc doit
// revérifier lui-même que l'appelant est bien propriétaire de la ligne visée
// avant de supprimer — sans ça n'importe quel abonné authentifié pourrait
// supprimer la réservation d'un autre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/delete-reservation.js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body, headers) {
  return {
    method: 'POST',
    headers: new Headers(headers || { authorization: 'Bearer valide' }),
    json: async () => body
  };
}

function mockAuth(userId) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: userId }) };
    return { ok: true, json: async () => [] };
  };
}

test('delete-reservation : refuse une requête sans jeton', async () => {
  const res = await handler(requete({ id: 'b1' }, {}));
  assert.equal(res.status, 401);
});

test('delete-reservation : refuse une requête sans id', async () => {
  global.fetch = mockAuth('owner1');
  const res = await handler(requete({}));
  assert.equal(res.status, 400);
});

test('delete-reservation : 404 si la réservation n\'existe pas', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner1' }) };
    if (u.includes('/rest/v1/bookings')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ id: 'introuvable' }));
  assert.equal(res.status, 404);
});

test('delete-reservation : refuse de supprimer la réservation d\'un autre abonné', async () => {
  let deleteAppele = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner1' }) };
    if (u.includes('/rest/v1/bookings') && (!opts || opts.method !== 'DELETE')) {
      return { ok: true, json: async () => [{ id: 'b1', data: { ownerId: 'owner2' } }] };
    }
    if (u.includes('/rest/v1/bookings') && opts && opts.method === 'DELETE') { deleteAppele = true; return { ok: true }; }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ id: 'b1' }));
  assert.equal(res.status, 403);
  assert.equal(deleteAppele, false, 'ne doit jamais appeler DELETE si le propriétaire ne correspond pas');
});

test('delete-reservation : supprime bien la réservation de son propriétaire légitime', async () => {
  let deleteUrl = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner1' }) };
    if (u.includes('/rest/v1/bookings') && (!opts || opts.method !== 'DELETE')) {
      return { ok: true, json: async () => [{ id: 'b1', data: { ownerId: 'owner1' } }] };
    }
    if (u.includes('/rest/v1/bookings') && opts && opts.method === 'DELETE') { deleteUrl = u; return { ok: true }; }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ id: 'b1' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(deleteUrl.includes('id=eq.b1'));
});

test('delete-reservation : renvoie 500 si la suppression échoue côté Supabase', async () => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner1' }) };
    if (u.includes('/rest/v1/bookings') && (!opts || opts.method !== 'DELETE')) {
      return { ok: true, json: async () => [{ id: 'b1', data: { ownerId: 'owner1' } }] };
    }
    if (u.includes('/rest/v1/bookings') && opts && opts.method === 'DELETE') return { ok: false, text: async () => 'erreur' };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ id: 'b1' }));
  assert.equal(res.status, 500);
});
