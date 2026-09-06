// Vérifie que /api/client-orders et /api/client-documents n'acceptent le
// paramètre "clientEmail" (aperçu admin d'un autre compte extranet) que pour
// l'email admin — jamais pour un appelant quelconque, qui ne doit voir que
// ses propres données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handlerOrders from '../api/client-orders.js';
// client-documents.js lit SUPABASE_SERVICE_KEY comme constante de module (au
// chargement, pas dans le handler) : il faut donc que la variable d'env soit
// déjà positionnée avant son premier import, d'où l'import dynamique ici
// plutôt qu'un import statique (hissé avant toute affectation à process.env).
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handlerDocs } = await import('../api/client-documents.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function mockFetchOrders(callerEmail) {
  const urlsAppelees = [];
  global.fetch = async (url) => {
    urlsAppelees.push(String(url));
    if (String(url).includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ email: callerEmail }) };
    }
    if (String(url).includes('/rest/v1/bookings')) {
      return { ok: true, json: async () => [] };
    }
    // missions, contacts (documents) : listes vides suffisent pour ce test
    return { ok: true, json: async () => [] };
  };
  return urlsAppelees;
}

function requete(clientEmail) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => (clientEmail !== undefined ? { clientEmail } : {}),
  };
}

test('client-orders : un admin peut consulter un autre email via clientEmail', async () => {
  const urls = mockFetchOrders(ADMIN_EMAIL);
  await handlerOrders(requete(AUTRE_EMAIL));
  const urlBookings = urls.find(u => u.includes('/rest/v1/bookings'));
  assert.ok(urlBookings.includes(encodeURIComponent('"' + AUTRE_EMAIL + '"')), urlBookings);
});

test('client-orders : un non-admin ne peut PAS consulter un autre email via clientEmail', async () => {
  const urls = mockFetchOrders(AUTRE_EMAIL);
  await handlerOrders(requete('victime@exemple.fr'));
  const urlBookings = urls.find(u => u.includes('/rest/v1/bookings'));
  // Doit rester filtré sur l'email de l'appelant, jamais sur "victime@exemple.fr"
  assert.ok(urlBookings.includes(encodeURIComponent('"' + AUTRE_EMAIL + '"')), urlBookings);
  assert.ok(!urlBookings.includes('victime'), urlBookings);
});

test('client-orders : un admin sans clientEmail voit ses propres commandes (comportement inchangé)', async () => {
  const urls = mockFetchOrders(ADMIN_EMAIL);
  await handlerOrders(requete(undefined));
  const urlBookings = urls.find(u => u.includes('/rest/v1/bookings'));
  assert.ok(urlBookings.includes(encodeURIComponent('"' + ADMIN_EMAIL + '"')), urlBookings);
});

function mockFetchDocs(callerEmail) {
  const urlsAppelees = [];
  global.fetch = async (url) => {
    urlsAppelees.push(String(url));
    if (String(url).includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ email: callerEmail }) };
    }
    return { ok: true, json: async () => [] };
  };
  return urlsAppelees;
}

test('client-documents : un admin peut consulter un autre email via clientEmail', async () => {
  const urls = mockFetchDocs(ADMIN_EMAIL);
  await handlerDocs(requete(AUTRE_EMAIL));
  const urlContacts = urls.find(u => u.includes('/rest/v1/contacts'));
  assert.ok(urlContacts.includes(encodeURIComponent(AUTRE_EMAIL)), urlContacts);
});

test('client-documents : un non-admin ne peut PAS consulter un autre email via clientEmail', async () => {
  const urls = mockFetchDocs(AUTRE_EMAIL);
  await handlerDocs(requete('victime@exemple.fr'));
  const urlContacts = urls.find(u => u.includes('/rest/v1/contacts'));
  assert.ok(urlContacts.includes(encodeURIComponent(AUTRE_EMAIL)), urlContacts);
  assert.ok(!urlContacts.includes('victime'), urlContacts);
});
