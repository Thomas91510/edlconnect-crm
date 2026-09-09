// Vérifie que /api/client-orders renvoie le lien d'avenant d'une mission
// (mission.avenantUrl, saisi côté CRM dans la modale mission) — indépendant
// du mécanisme docsParMission qui ne gère que le rapport EDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handlerOrders from '../api/client-orders.js';

const CLIENT_EMAIL = 'client@exemple.fr';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function mockFetch({ avenantUrl, statut }) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ email: CLIENT_EMAIL }) };
    }
    if (u.includes('/rest/v1/bookings')) {
      return {
        ok: true,
        json: async () => [
          { id: 'b1', created_at: '2026-06-01T00:00:00Z', data: { missionId: 'm1', email: CLIENT_EMAIL, typeEdl: 'EDL entrant' } }
        ]
      };
    }
    if (u.includes('/rest/v1/missions')) {
      return {
        ok: true,
        json: async () => [
          { id: 'm1', data: { id: 'm1', missionId: 'm1', statut: statut || 'terminée', avenantUrl: avenantUrl || '' } }
        ]
      };
    }
    // contacts (documents) : aucun rapport nécessaire pour ce test
    return { ok: true, json: async () => [] };
  };
}

function requete() {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => ({}),
  };
}

test('client-orders : renvoie avenantUrl quand la mission en a un', async () => {
  mockFetch({ avenantUrl: 'https://drive.google.com/avenant-123' });
  const resp = await handlerOrders(requete());
  const orders = await resp.json();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].avenantUrl, 'https://drive.google.com/avenant-123');
});

test('client-orders : avenantUrl vide quand la mission n\'en a pas', async () => {
  mockFetch({ avenantUrl: '' });
  const resp = await handlerOrders(requete());
  const orders = await resp.json();
  assert.equal(orders[0].avenantUrl, '');
});

test('client-orders : avenantUrl vide quand aucune mission n\'est liée', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: CLIENT_EMAIL }) };
    if (u.includes('/rest/v1/bookings')) {
      return { ok: true, json: async () => [{ id: 'b2', created_at: '2026-06-01T00:00:00Z', data: { email: CLIENT_EMAIL, typeEdl: 'EDL sortant' } }] };
    }
    return { ok: true, json: async () => [] };
  };
  const resp = await handlerOrders(requete());
  const orders = await resp.json();
  assert.equal(orders[0].avenantUrl, '');
});
